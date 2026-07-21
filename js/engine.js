/* =====================================================================
 * Engine: the season clock, weather, economy, supply, pacification,
 * court, prestige scoring, and win/lose detection.
 * ===================================================================== */

/* ---- province-level economic helpers ------------------------------ */
SR.provKoban = function (S, id) {
  const ps = S.provinces[id], f = SR.stat(id).feature;
  let k = 1; // base tax
  const b = ps.buildings;
  if (b.market) k += 2;
  if (b.port) k += 2;
  if (ps.hasMine) k += 2;
  if (f === "free_port") k += 4;
  if (f === "crossroads") k += 2;
  if (f === "foreign_trade") k += 2;
  if (f === "naval_base") k += 1;
  return k;
};
SR.provKoku = function (S, id) {
  const ps = S.provinces[id];
  let k = SR.stat(id).koku + (ps.buildings.irrigation ? 1 : 0) + (ps.bonusKoku || 0);
  return k;
};
SR.cultureCount = (S, cid) => SR.sum(SR.clanProvinces(S, cid), id => {
  const b = S.provinces[id].buildings; return (b.temple ? 1 : 0) + (b.shrine ? 1 : 0) + (b.academy ? 1 : 0);
});
SR.portMarketCount = (S, cid) => SR.sum(SR.clanProvinces(S, cid), id => {
  const b = S.provinces[id].buildings; return (b.port ? 1 : 0) + (b.market ? 1 : 0);
});
SR.kokuIncome = (S, cid) => SR.sum(SR.pacifiedProvinces(S, cid), id => SR.provKoku(S, id));

/* ---------------------------------------------------------------------
 * BEGIN SEASON — the whole upkeep pipeline before the human acts.
 * ------------------------------------------------------------------- */
SR.beginSeason = function (S) {
  const season = DATA.seasons[S.seasonIdx];
  // reset transient
  S.movedUnits = {};
  S.weather = { winter: season === "Winter", typhoon: false,
                rain: (season === "Summer" || season === "Winter") && SR.chance(0.25) };
  S.flags.peaceSeason = false; S.flags.cheapGuns = false;
  for (const id in S.provinces) S.provinces[id].bonusKoku = 0;

  SR.log(S, `— ${season}, Year ${S.year} —`, "season");

  // 1. Event
  SR.drawEvent(S);

  // 2. Income & upkeep
  SR.processIncomeUpkeep(S);
  if (SR.diplomacyIncome) SR.diplomacyIncome(S);

  // 3. Supply attrition (field armies out of supply)
  SR.processSupply(S);

  // 4. Sieges tick
  SR.processSieges(S);

  // 5. Revolt & pacification
  SR.processUnrest(S);

  // housekeeping: alive status, court host, shogun validity, daimyo respawn
  SR.refreshPolitics(S);

  S.phase = "action"; S.turnClan = S.humanClan;
};

/* Draw and apply one event card (season-appropriate). */
SR.drawEvent = function (S) {
  const season = DATA.seasons[S.seasonIdx];
  const pool = DATA.events.filter(e => e.season === "any" || e.season === season);
  const ev = SR.pick(pool);
  S.eventCard = ev;
  const api = SR.eventAPI;
  try { ev.effect(S, api); } catch (e) { /* ignore */ }
  SR.log(S, `Event — ${ev.name}: ${ev.text}`, "event");
};

/* Event helper callbacks. */
SR.eventAPI = {
  eachOwned: (S, cid, fn) => SR.clanProvinces(S, cid).forEach(id => fn(S.provinces[id])),
  allClans: (S, fn) => SR.livingClans(S).forEach(c => fn(S.clans[c])),
  plague: (S) => {
    let big = null, bn = -1;
    for (const c of SR.livingClans(S)) {
      const n = SR.sum(SR.clanProvinces(S, c), id => S.provinces[id].units.length);
      if (n > bn) { bn = n; big = c; }
    }
    if (big) {
      const provs = SR.clanProvinces(S, big).filter(id => S.provinces[id].units.length);
      if (provs.length) { const p = S.provinces[SR.pick(provs)]; p.units.pop(); }
    }
  },
  grantUnit: (S, cid, type) => {
    const home = SR.clanProvinces(S, cid)[0];
    if (home) S.provinces[home].units.push(SR.mkUnit(type));
  },
  raiseRandomUnrest: (S) => {
    const occ = [];
    for (const id in S.provinces) if (["occupied", "pacifying"].includes(S.provinces[id].status)) occ.push(id);
    if (occ.length) S.provinces[SR.pick(occ)].unrest += 2;
  },
  tradeWindfall: (S) => SR.livingClans(S).forEach(c =>
    S.clans[c].koban += SR.portMarketCount(S, c)),
  rewardHonour: (S) => {
    let best = null, bh = -1;
    for (const c of SR.livingClans(S)) if (S.clans[c].honour > bh) { bh = S.clans[c].honour; best = c; }
    if (best) S.clans[best].honour = SR.clamp(S.clans[best].honour + 1, 0, 20);
  },
};

/* Harvest, koban, and pay upkeep; unsupplied armies starve. */
SR.processIncomeUpkeep = function (S) {
  const season = DATA.seasons[S.seasonIdx];
  for (const cid of SR.livingClans(S)) {
    const c = S.clans[cid];
    // Steady seasonal supply: each pacified province forages koku + 1 rice.
    const supply = SR.sum(SR.pacifiedProvinces(S, cid), id => SR.provKoku(S, id) + 1);
    c.rice += supply;
    if (season === "Autumn") {
      // The harvest: a bonus of rice AND the year's koban (taxes, mines, trade).
      const harvest = SR.sum(SR.pacifiedProvinces(S, cid), id => SR.provKoku(S, id));
      const koban = SR.sum(SR.pacifiedProvinces(S, cid), id => SR.provKoban(S, id));
      c.rice += harvest; c.koban += koban;
      if (cid === S.humanClan) SR.log(S, `Autumn harvest: +${harvest} bonus rice, +${koban} koban.`, "econ");
    }
    // pay upkeep in rice
    const up = SR.upkeep(S, cid);
    c.rice -= up;
    if (c.rice < 0) {
      let starve = -c.rice; c.rice = 0;
      // starving armies lose units
      const provs = SR.clanProvinces(S, cid).filter(id => S.provinces[id].units.length);
      while (starve > 0 && provs.length) {
        const id = SR.pick(provs); const p = S.provinces[id];
        if (p.units.length) { p.units.pop(); starve -= 1; }
        if (!p.units.length) provs.splice(provs.indexOf(id), 1);
      }
      if (cid === S.humanClan) SR.log(S, `Your stores ran dry — troops desert from hunger!`, "bad");
    }
  }
};

/* Out-of-supply field armies take attrition. */
SR.processSupply = function (S) {
  for (const id in S.provinces) {
    const ps = S.provinces[id];
    if (!ps.owner || !ps.units.length) continue;
    // armies in your own pacified/home land are always supplied
    if (ps.status === "pacified" || ps.status === "home") continue;
    if (!SR.inSupply(S, id, ps.owner)) {
      const loss = S.weather.winter ? 2 : 1;
      for (let i = 0; i < loss && ps.units.length; i++) ps.units.pop();
      if (ps.owner === S.humanClan) SR.log(S, `${SR.stat(id).name}: army out of supply — attrition losses.`, "bad");
    }
  }
};

/* Revolt & pacification each season. */
SR.processUnrest = function (S) {
  for (const id in S.provinces) {
    const ps = S.provinces[id]; const pd = SR.stat(id);
    if (!ps.owner) continue;
    if (ps.status === "pacified" || ps.status === "home") continue;
    const c = S.clans[ps.owner];
    const garrison = ps.units.length;
    const band = SR.honourBand(c.honour);
    const temple = (ps.buildings.temple ? 1 : 0) + (ps.buildings.shrine ? 2 : 0);
    const ikko = pd.feature === "ikko" || ps.razed;

    if (ps.status === "pacifying") {
      let rate = 1 + Math.floor(garrison / 2) - band.revolt + temple;
      if (ikko) rate = Math.max(1, rate - 1);
      rate = Math.max(1, rate);
      ps.unrest -= rate;
      if (ps.unrest <= 0) {
        ps.unrest = 0; ps.status = "pacified"; ps.pacifying = false;
        if (ps.owner === S.humanClan) SR.log(S, `${pd.name} is pacified — it is now yours.`, "good");
      }
    } else if (ps.status === "occupied") {
      // unpaid occupation: risk of revolt grows
      const risk = 0.10 + ps.unrest * 0.03 + band.revolt * 0.04 - garrison * 0.03 - temple * 0.05;
      if (garrison === 0 || SR.chance(SR.clamp(risk, 0.02, 0.7))) {
        SR.revolt(S, id);
      }
    }
  }
};

SR.revolt = function (S, id) {
  const ps = S.provinces[id]; const pd = SR.stat(id);
  const owner = ps.owner;
  // rebels rise: province becomes neutral, spawns defenders, garrison scattered
  const rebels = 2 + ps.castle;
  ps.units = [];
  for (let i = 0; i < rebels; i++) ps.units.push(SR.mkUnit("ashigaru"));
  ps.owner = null; ps.status = "neutral"; ps.unrest = 0; ps.pacifying = false; ps.siege = null;
  if (owner === S.humanClan) SR.log(S, `REVOLT! ${pd.name} has thrown off your rule.`, "bad");
  else SR.log(S, `${pd.name} revolts against the ${S.clans[owner].name}.`, "info");
};

/* Siege ticks — reduce castle, starve garrison, resolve assaults. */
SR.processSieges = function (S) {
  for (const id in S.provinces) {
    const ps = S.provinces[id];
    if (!ps.siege) continue;
    SR.siegeTick(S, id);
  }
};

/* ---------------------------------------------------------------------
 * Politics housekeeping: eliminate dead clans, set court host, validate
 * the Shōgun, respawn fallen daimyō as heirs each Spring.
 * ------------------------------------------------------------------- */
SR.refreshPolitics = function (S) {
  for (const cid in S.clans) {
    const c = S.clans[cid];
    if (c.isNeutral) continue;
    const provs = SR.clanProvinces(S, cid);
    const anyArmy = provs.some(id => S.provinces[id].units.length) ||
      Object.values(S.provinces).some(p => p.siege && p.siege.by === cid && (p.siege.army || []).length);
    if (c.alive && provs.length === 0 && !anyArmy) {
      c.alive = false;
      SR.log(S, `The ${c.name} clan is extinguished.`, "bad");
    }
    // daimyo respawn as heir each Spring
    if (c.alive && !c.daimyoAlive && DATA.seasons[S.seasonIdx] === "Spring") {
      const loc = provs[0];
      if (loc) { c.daimyoAlive = true; c.daimyoLoc = loc;
        if (cid === S.humanClan) SR.log(S, `A new heir takes up the ${c.name} banner at ${SR.stat(loc).name}.`, "info"); }
    }
  }
  // court host
  const kyoto = S.provinces.yamashiro;
  S.courtHost = (kyoto.owner && kyoto.status === "pacified") ? kyoto.owner : null;
  // shogun validity
  if (S.shogun) {
    const c = S.clans[S.shogun];
    if (!c || !c.alive || S.courtHost !== S.shogun || c.honour < 13) {
      if (c) c.courtRank = Math.min(c.courtRank, 2);
      SR.log(S, `The Shōgun appointment lapses.`, "info");
      S.shogun = null;
    }
  }
};

/* ---------------------------------------------------------------------
 * COURT — climb ranks at Kyoto.
 * ------------------------------------------------------------------- */
SR.courtEligible = function (S, cid) {
  const c = S.clans[cid];
  const next = DATA.courtRanks[c.courtRank];
  if (!next) return { ok: false, reason: "Already at the highest rank." };
  const prov = SR.pacifiedProvinces(S, cid).length;
  if (c.honour < next.honour) return { ok: false, reason: `Need Honour ≥ ${next.honour} (${SR.honourBand(next.honour).name}).` };
  if (prov < next.provinces) return { ok: false, reason: `Need ≥ ${next.provinces} provinces (you hold ${prov}).` };
  if (next.kyoto && S.courtHost !== cid) return { ok: false, reason: "Must control Kyoto (Yamashiro)." };
  if (next.rank === 3 && S.shogun && S.shogun !== cid) return { ok: false, reason: "Another clan already holds the Shōgunate." };
  if (c.koban < next.cost) return { ok: false, reason: `Need ${next.cost} koban.` };
  return { ok: true, next };
};
SR.doCourt = function (S, cid) {
  const e = SR.courtEligible(S, cid);
  if (!e.ok) return e;
  const c = S.clans[cid];
  c.koban -= e.next.cost; c.courtRank = e.next.rank;
  c.prestige += e.next.prestige;
  if (e.next.rank === 3) { S.shogun = cid; c.honour = SR.clamp(c.honour + 1, 0, 20); }
  SR.log(S, `${c.name} attains ${e.next.name}! (+${e.next.prestige} Prestige)`, "good");
  return { ok: true };
};

/* ---------------------------------------------------------------------
 * SCORING
 * ------------------------------------------------------------------- */
SR.provincePrestige = function (id) {
  const pd = SR.stat(id);
  if (pd.kyoto) return 5;
  if (pd.capital) return 2;
  return 1;
};
SR.buildingPrestige = function (ps) {
  const b = ps.buildings; let p = 0;
  if (b.temple) p += 2; if (b.shrine) p += 3; if (b.academy) p += 2;
  if (b.market) p += 1; if (b.port) p += 1; if (b.mine) p += 2;
  return p;
};
SR.scoreStanding = function (S, cid) {
  const c = S.clans[cid];
  let terr = 0, castles = 0, builds = 0;
  for (const id of SR.pacifiedProvinces(S, cid)) {
    terr += SR.provincePrestige(id);
    castles += S.provinces[id].castle;
    builds += SR.buildingPrestige(S.provinces[id]);
  }
  const marriages = c.marriages.length * 2;
  const vassals = c.vassals.length * 2;
  const court = c.courtRank ? DATA.courtRanks[c.courtRank - 1].prestige : 0;
  return { terr, castles, builds, marriages, vassals, court,
    total: terr + castles + builds + marriages + vassals + court };
};
SR.majorities = function (S) {
  const clans = SR.livingClans(S);
  const bonus = {}; clans.forEach(c => bonus[c] = 0);
  const award = (metric, pts) => {
    let best = -Infinity, winners = [];
    clans.forEach(c => { const v = metric(c); if (v > best) { best = v; winners = [c]; } else if (v === best) winners.push(c); });
    if (best > 0 && winners.length === 1) bonus[winners[0]] += pts;
  };
  award(c => SR.pacifiedProvinces(S, c).length, 5);          // most territory
  award(c => S.clans[c].koban, 5);                            // richest
  award(c => SR.kokuIncome(S, c), 3);                         // most koku income
  award(c => SR.cultureCount(S, c), 5);                       // most culture
  award(c => S.clans[c].honour, 3);                           // highest honour
  award(c => S.clans[c].agents.length, 5);                    // largest spy network
  return bonus;
};
SR.scoreTotal = function (S, cid) {
  const c = S.clans[cid];
  const st = SR.scoreStanding(S, cid);
  const band = SR.honourBand(c.honour);
  const maj = SR.majorities(S)[cid] || 0;
  const total = c.prestige + st.total + band.endScore + maj;
  return { banked: c.prestige, standing: st.total, honour: band.endScore, majorities: maj,
    total, band: band.name, breakdown: st };
};

/* ---------------------------------------------------------------------
 * YEAR-END + WIN/LOSE
 * ------------------------------------------------------------------- */
SR.checkVictory = function (S) {
  const totalProv = Object.keys(S.provinces).length;
  // sudden conquest
  for (const cid of SR.livingClans(S)) {
    const pac = SR.pacifiedProvinces(S, cid).length;
    const kyoto = S.provinces.yamashiro.owner === cid && S.provinces.yamashiro.status === "pacified";
    if (kyoto && pac / totalProv >= 0.55) {
      return SR.endGame(S, cid, `${S.clans[cid].name} holds Kyoto and ${Math.round(pac / totalProv * 100)}% of Japan — the realm is united by the sword!`);
    }
    // sudden wealth
    if (S.clans[cid].koban >= 60 && SR.portMarketCount(S, cid) >= 3) {
      return SR.endGame(S, cid, `${S.clans[cid].name}'s coffers overflow and its markets dominate the land — a Merchant Prince's triumph!`);
    }
  }
  return false;
};

SR.endGame = function (S, forcedWinner, reason) {
  S.gameOver = true;
  // final scores
  const scores = SR.livingClans(S).map(c => ({ cid: c, ...SR.scoreTotal(S, c) }));
  scores.sort((a, b) => b.total - a.total || S.clans[b.cid].honour - S.clans[a.cid].honour);
  S.finalScores = scores;
  S.winner = forcedWinner || (scores[0] && scores[0].cid);
  S.endReason = reason || `Year ${S.lengthYears} closes. The tallies are made.`;
  SR.log(S, `GAME OVER — ${S.clans[S.winner].name} wins. ${S.endReason}`, "season");
  return true;
};

/* ---------------------------------------------------------------------
 * PLAYER ECONOMIC ACTIONS — recruit, build, sell rice.
 * ------------------------------------------------------------------- */
SR.canBuildHere = function (S, cid, id) {
  const ps = S.provinces[id];
  return ps.owner === cid && (ps.status === "pacified" || ps.status === "home");
};
SR.doRecruit = function (S, cid, id, type) {
  const c = S.clans[cid];
  if (!SR.canBuildHere(S, cid, id)) return { ok: false, reason: "Recruit only in a pacified province you hold." };
  const acc = SR.canRecruit(S, cid, type);
  if (!acc.ok) return acc;
  const cost = SR.recruitCost(S, cid, type);
  if (c.koban < (cost.koban || 0)) return { ok: false, reason: `Need ${cost.koban} koban.` };
  if (c.rice < (cost.rice || 0)) return { ok: false, reason: `Need ${cost.rice} rice.` };
  c.koban -= cost.koban || 0; c.rice -= cost.rice || 0;
  const u = SR.mkUnit(type);
  S.provinces[id].units.push(u);
  S.movedUnits[u.uid] = true;               // newly raised, can't march this season
  SR.log(S, `${c.name} raises ${DATA.units[type].name} at ${SR.stat(id).name}.`, "econ");
  return { ok: true };
};
SR.doBuild = function (S, cid, id, key) {
  const c = S.clans[cid]; const ps = S.provinces[id]; const b = DATA.buildings[key];
  if (key === "castle") {
    if (!SR.canBuildHere(S, cid, id)) return { ok: false, reason: "Build only in a pacified province you hold." };
    if (ps.castle >= 4) return { ok: false, reason: "Castle already at maximum." };
    if (c.koban < 4) return { ok: false, reason: "Need 4 koban." };
    c.koban -= 4; ps.castle += 1;
    SR.log(S, `${c.name} upgrades the castle at ${SR.stat(id).name} to level ${ps.castle}.`, "econ");
    return { ok: true };
  }
  if (!b) return { ok: false, reason: "Unknown building." };
  if (!SR.canBuildHere(S, cid, id)) return { ok: false, reason: "Build only in a pacified province you hold." };
  if (ps.buildings[key]) return { ok: false, reason: "Already built here." };
  if (b.needsCoast && SR.stat(id).terrain !== "Coast") return { ok: false, reason: "Ports need a Coast province." };
  if (b.needsMineral && !["silver", "gold"].includes(SR.stat(id).feature)) return { ok: false, reason: "Mine Works need a silver/gold feature." };
  if (b.unique && SR.clanProvinces(S, cid).some(p => S.provinces[p].buildings[key])) return { ok: false, reason: "You may build only one Grand Shrine." };
  if (c.koban < b.cost) return { ok: false, reason: `Need ${b.cost} koban.` };
  c.koban -= b.cost; ps.buildings[key] = true;
  if (b.honour) c.honour = SR.clamp(c.honour + b.honour, 0, 20);
  SR.applyMineFlags(S);
  SR.log(S, `${c.name} builds a ${b.name} at ${SR.stat(id).name}.`, "econ");
  return { ok: true };
};
SR.doSellRice = function (S, cid, amount) {
  const c = S.clans[cid];
  const hasMarket = SR.clanProvinces(S, cid).some(id => S.provinces[id].buildings.market || SR.stat(id).feature === "free_port");
  if (!hasMarket) return { ok: false, reason: "Need a Market or free port to trade rice." };
  amount = Math.min(amount, c.rice);
  if (amount < 2) return { ok: false, reason: "Need at least 2 rice to sell." };
  const koban = Math.floor(amount / 2);
  c.rice -= koban * 2; c.koban += koban;
  SR.log(S, `${c.name} sells ${koban * 2} rice for ${koban} koban at market.`, "econ");
  return { ok: true };
};

/* Advance the clock after the AI phase. Returns true if game ended. */
SR.advanceSeason = function (S) {
  // year-end checks happen at the close of Winter
  if (DATA.seasons[S.seasonIdx] === "Winter") {
    if (SR.checkVictory(S)) return true;
    if (S.year >= S.lengthYears) { SR.endGame(S, null, null); return true; }
    S.year += 1; S.seasonIdx = 0;
  } else {
    S.seasonIdx += 1;
  }
  // lose check: human eliminated
  if (!S.clans[S.humanClan].alive) { SR.endGame(S, SR.prestigeLeader(S), `The ${S.clans[S.humanClan].name} clan has fallen.`); return true; }
  return false;
};

if (typeof module !== "undefined") module.exports = SR;
