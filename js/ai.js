/* =====================================================================
 * AI: heuristic daimyō. Each AI clan runs economy, pacification, court,
 * espionage, diplomacy, then military moves. Attacks on the human are
 * deferred into S.pendingDefenses so the player can choose a response.
 * ===================================================================== */

SR.aiPhase = function (S) {
  S.pendingDefenses = [];
  // ascending prestige order — trailing clans act first (anti-runaway)
  const order = SR.livingClans(S).filter(c => c !== S.humanClan)
    .sort((a, b) => SR.scoreTotal(S, a).total - SR.scoreTotal(S, b).total);
  for (const cid of order) {
    if (!S.clans[cid].alive) continue;
    try { SR.aiClanTurn(S, cid); } catch (e) { console.warn("AI error", cid, e); }
  }
  return S.pendingDefenses;
};

SR.aiClanTurn = function (S, cid) {
  const c = S.clans[cid];

  // 1. Pacify occupied provinces
  for (const id of SR.clanProvinces(S, cid)) {
    const ps = S.provinces[id];
    if (ps.status === "occupied" && ps.units.length >= 1 && c.koban >= SR.pacifyCost(S, id))
      SR.doPacify(S, id, cid);
  }

  // 2. Court
  if (S.courtHost === cid) { const e = SR.courtEligible(S, cid); if (e.ok) SR.doCourt(S, cid); }

  // 3. Economy — buildings then units, keeping a reserve
  SR.aiBuild(S, cid);
  SR.aiRecruit(S, cid);

  // 4. Espionage (occasional)
  if (SR.chance(0.35)) SR.aiEspionage(S, cid);

  // 5. Diplomacy
  SR.aiDiplomacyTurn(S, cid);

  // 6. Military
  SR.aiMilitary(S, cid);
};

SR.aiBuild = function (S, cid) {
  const c = S.clans[cid];
  let budget = Math.floor(c.koban * 0.5);
  const provs = SR.pacifiedProvinces(S, cid);
  // mine works on mineral features (best ROI)
  for (const id of provs) {
    const f = SR.stat(id).feature;
    if ((f === "silver" || f === "gold") && !S.provinces[id].buildings.mine && budget >= 3) {
      if (SR.doBuild(S, cid, id, "mine").ok) budget -= 3;
    }
  }
  // markets / ports for income
  for (const id of provs) {
    if (budget < 2) break;
    if (!S.provinces[id].buildings.market && SR.chance(0.5)) { if (SR.doBuild(S, cid, id, "market").ok) budget -= 2; continue; }
    if (SR.stat(id).terrain === "Coast" && !S.provinces[id].buildings.port && budget >= 3 && SR.chance(0.5)) { if (SR.doBuild(S, cid, id, "port").ok) budget -= 3; }
  }
  // irrigation on the richest field
  const rich = provs.filter(id => !S.provinces[id].buildings.irrigation).sort((a, b) => SR.stat(b).koku - SR.stat(a).koku)[0];
  if (rich && budget >= 2 && SR.chance(0.5)) { if (SR.doBuild(S, cid, rich, "irrigation").ok) budget -= 2; }
  // temple if honour is slipping or unrest is high
  if (c.honour < 9 && budget >= 3) { const id = provs[0]; if (id && SR.doBuild(S, cid, id, "temple").ok) budget -= 3; }
  // culture/lean
  if (c.lean && c.lean.includes("Culture") && budget >= 3) { const id = provs.find(p => !S.provinces[p].buildings.academy); if (id) SR.doBuild(S, cid, id, "academy"); }
};

SR.aiRecruit = function (S, cid) {
  const c = S.clans[cid];
  let reserve = 3;                                  // keep some koban for pacifying
  const homeList = SR.pacifiedProvinces(S, cid);
  if (!homeList.length) return;
  const identity = S.clans[cid].identity || "ashigaru";
  const wishlist = [identity, "samurai", "ashigaru", "ashigaru"];
  let guard = 0;
  while (c.koban > reserve + 1 && guard++ < 8) {
    // pick an affordable unit, favour identity/elite when rich
    let type = "ashigaru";
    for (const w of wishlist) {
      if (!SR.canRecruit(S, cid, w).ok) continue;
      const cost = SR.recruitCost(S, cid, w);
      if (c.koban - (cost.koban || 0) >= reserve && c.rice >= (cost.rice || 0)) { type = w; break; }
    }
    const target = SR.pick(homeList);
    const r = SR.doRecruit(S, cid, target, type);
    if (!r.ok) break;
  }
};

SR.aiEspionage = function (S, cid) {
  const c = S.clans[cid];
  if (c.agents.length === 0) { if (c.koban >= SR.AGENT_COST + 2) SR.recruitAgent(S, cid); return; }
  // deploy idle agents onto a rival capital
  const idle = c.agents.find(a => a.target === null);
  if (idle) {
    const rivals = SR.livingClans(S).filter(x => x !== cid && !SR.allied(S, cid, x));
    if (rivals.length) { const t = SR.pick(rivals); const prov = S.clans[t].daimyoLoc; SR.deployAgent(S, cid, idle.uid, prov); }
    return;
  }
  // run an op with an embedded agent
  const emb = c.agents.find(a => a.embedAbs !== null && a.embedAbs <= SR.absSeason(S));
  if (emb && c.koban >= 4) {
    const opKey = c.honour < 7 ? SR.pick(["sabotage", "incite", "assassinate"]) : SR.pick(["recon", "sabotage", "incite"]);
    SR.runOp(S, cid, opKey, emb.target, SR.rint(0, 2));
  }
};

/* Military: each army may act once. Attack weak neighbours, else hold. */
SR.aiMilitary = function (S, cid) {
  const c = S.clans[cid];
  const leader = SR.prestigeLeader(S);
  // reinforce / attack from each province holding movable units
  for (const fromId of SR.clanProvinces(S, cid)) {
    const from = S.provinces[fromId];
    const movable = SR.movableUnits(S, fromId);
    if (movable.length === 0) continue;
    const myPow = SR.armyPower(movable);

    // candidate targets: adjacent hostile provinces
    const targets = SR.stat(fromId).adj.filter(a => {
      const q = S.provinces[a];
      if (q.siege) return false;
      if (q.owner === cid) return false;
      if (SR.allied(S, cid, q.owner)) return false;
      if (q.owner && SR.atPeace(S, cid, q.owner) && q.owner !== leader) return false; // respect pacts (except vs leader)
      return true;
    });
    // score each target
    let best = null, bestScore = -1e9;
    for (const t of targets) {
      const q = S.provinces[t];
      const defPow = SR.armyPower(q.units) + q.castle * 2;
      let score = myPow - defPow * 1.15;
      if (!q.owner) score += 3;                       // neutrals are ripe
      if (q.owner === leader) score += 4;             // gang up on the leader
      if (SR.stat(t).kyoto) score += 6;               // Kyoto is a prize
      score += SR.stat(t).koku;
      if (score > bestScore) { bestScore = score; best = t; }
    }

    if (best && bestScore > 0) {
      const toId = best; const q = S.provinces[toId];
      const uids = movable.map(u => u.uid);
      const bigAdv = myPow > (SR.armyPower(q.units) + q.castle * 2) * 1.6;
      const opts = {
        surprise: (c.honour <= 8 && q.owner && q.owner !== cid && SR.chance(0.4)) ? true : false,
        postureA: SR.stat(toId).terrain === "Plains" ? "Wide" : "Line",
        bringDaimyo: bigAdv && c.daimyoAlive && c.daimyoLoc === fromId,
      };
      if (q.owner === S.humanClan) {
        // defer to the human to respond
        S.pendingDefenses.push({ fromId, toId, uids, attCid: cid, opts });
        movable.forEach(u => S.movedUnits[u.uid] = true);   // committed
      } else {
        SR.executeAttack(S, fromId, toId, uids, cid, opts);
      }
    } else {
      // hold or shuffle toward a threatened frontier — reinforce weakest owned neighbour
      const friendly = SR.stat(fromId).adj.filter(a => S.provinces[a].owner === cid);
      const threatened = friendly.map(a => ({ a, threat: SR.frontierThreat(S, cid, a) }))
        .filter(x => x.threat > SR.armyPower(S.provinces[x.a].units))
        .sort((x, y) => y.threat - x.threat)[0];
      if (threatened && from.status === "pacified" && movable.length > 1 && SR.chance(0.5)) {
        // send half forward
        const half = movable.slice(0, Math.ceil(movable.length / 2)).map(u => u.uid);
        SR.performMove(S, fromId, threatened.a, half, cid);
      }
    }
  }
};

/* How much hostile power sits next to province `id`? */
SR.frontierThreat = function (S, cid, id) {
  let t = 0;
  for (const a of SR.stat(id).adj) {
    const q = S.provinces[a];
    if (q.owner && q.owner !== cid && !SR.allied(S, cid, q.owner)) t += SR.armyPower(q.units);
  }
  return t;
};

if (typeof module !== "undefined") module.exports = SR;
