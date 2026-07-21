/* =====================================================================
 * Battle & siege: engagement, the field of battle (frontage, shock,
 * ranged, posture, reserves, fatigue, morale, rout), leader fate,
 * sieges and assaults, movement, and pacification.
 * ===================================================================== */

SR.unitBase = (type) => { const u = DATA.units[type]; return (u.atk + u.def) / 2; };

SR.frontage = function (terrainName, posture) {
  const T = DATA.terrain[terrainName];
  let f = T.frontage;
  if (posture === "Deep") f = Math.max(1, f - 1);
  if (posture === "Wide") f = f + 2;
  return f;
};

/* Count of a unit type in a token list. */
SR.countType = (units, type) => units.filter(u => u.type === type).length;

/* ---------------------------------------------------------------------
 * simulateBattle(ctx) — pure round-by-round resolution.
 * ctx: {
 *   attUnits, defUnits,            // token arrays (copied here)
 *   attCmd, defCmd,                // command ratings
 *   attTrait, defTrait,           // clan trait strings
 *   terrain, weather, surprise,
 *   postureA, postureD,
 *   castleBonus,                   // defender castle defensive bonus (assault)
 *   assault,                      // storming walls?
 * }
 * returns { winner:'att'|'def', rounds:[...lines], attLosses, defLosses,
 *           attSurv, defSurv, routed:'att'|'def'|null }
 * ------------------------------------------------------------------- */
SR.simulateBattle = function (ctx) {
  const T = DATA.terrain[ctx.terrain];
  const A = ctx.attUnits.map(u => ({ ...u }));
  const D = ctx.defUnits.map(u => ({ ...u }));
  const rounds = [];
  const wet = ctx.weather && (ctx.weather.rain || ctx.weather.winter);

  const traitBonus = (trait, units, role) => {
    let b = 0;
    if (trait === "Morale") b += 2;
    if (trait === "Infantry") b += 0.5 * (SR.countType(units, "ashigaru") + SR.countType(units, "samurai"));
    if (trait === "Siege & Defence" && role === "def") b += 2;
    return b;
  };

  let mA = 10 + Math.min(3, SR.countType(A, "samurai")) + ctx.attCmd + traitBonus(ctx.attTrait, A, "att");
  let mD = 10 + Math.min(3, SR.countType(D, "samurai")) + ctx.defCmd + traitBonus(ctx.defTrait, D, "def")
           + (ctx.castleBonus || 0) * 1.5;
  const mA0 = mA, mD0 = mD;

  const frontA = SR.frontage(ctx.terrain, ctx.postureA);
  const frontD = SR.frontage(ctx.terrain, ctx.postureD);

  const engagedPower = (units, front, role, posture, round, trait, enemyPosture) => {
    // sort by base value desc; the frontage best fight, rest are reserve (10%)
    const sorted = [...units].sort((a, b) => SR.unitBase(b.type) - SR.unitBase(a.type));
    const eng = sorted.slice(0, front), res = sorted.slice(front);
    let p = 0;
    for (const u of eng) {
      const d = DATA.units[u.type];
      let v = SR.unitBase(u.type);
      if (role === "def") v += T.defBonus * 0.5;
      // shock (round 1 only, terrain-damped)
      if (round === 1 && d.tags.includes("shock")) v += 3 * T.cavalry * (trait === "Cavalry" ? 1.3 : 1);
      // ranged pre-fire
      if (d.tags.includes("ranged") && !(d.tags.includes("volley"))) v += 2;                 // archers every round
      if (d.tags.includes("volley") && !wet && round % 2 === 1) {                             // teppo odd rounds, dry
        v += 4 + (enemyPosture === "Deep" ? 1 : 0);
      }
      p += v;
    }
    // reserves add a fraction
    p += SR.sum(res, u => SR.unitBase(u.type)) * 0.15;
    p += traitBonus(trait, units, role);
    // posture
    if (posture === "Wide") p += 2;
    if (posture === "Deep") p -= 1;
    return p;
  };

  const applyCasualties = (units, n, posture) => {
    // Deep posture soaks a hit
    if (posture === "Deep") n = Math.max(0, n - 1);
    const removed = [];
    // lowest-value (ashigaru) die first — the shield of the line
    const order = [...units].sort((a, b) => SR.unitBase(a.type) - SR.unitBase(b.type));
    for (let i = 0; i < n && order.length; i++) {
      const u = order.shift(); const idx = units.indexOf(u);
      if (idx >= 0) { units.splice(idx, 1); removed.push(u); }
    }
    return removed;
  };

  const lossesA = [], lossesD = [];
  let round = 0;

  // Surprise ambush: a free preliminary round against a disordered foe.
  if (ctx.surprise) {
    const dmg = Math.max(1, Math.round(SR.armyPower(A, "atk") / 8));
    const rem = applyCasualties(D, dmg, ctx.postureD);
    rem.forEach(u => lossesD.push(u)); mD -= dmg * 1.5 + 2;
    rounds.push({ n: "Ambush", att: 0, def: 0, text: `Surprise! A dawn ambush cuts down ${dmg} defending unit(s) before they form ranks.` });
  }

  const cap = (units) => Math.max(1, Math.ceil(units.length / 3) + 1);

  while (round < 7 && A.length && D.length && mA > 0 && mD > 0) {
    round++;
    let pA = engagedPower(A, frontA, "att", ctx.postureA, round, ctx.attTrait, ctx.postureD);
    let pD = engagedPower(D, frontD, "def", ctx.postureD, round, ctx.defTrait, ctx.postureA);
    // fatigue
    pA *= (1 - Math.min(0.4, (round - 1) * 0.08));
    pD *= (1 - Math.min(0.4, (round - 1) * 0.08));
    // friction — the chaos of the field. Wide enough that a small edge is an
    // advantage, not a certainty; a large edge still tells.
    pA *= 0.68 + Math.random() * 0.64;
    pD *= 0.68 + Math.random() * 0.64;

    const diff = Math.abs(pA - pD);
    // The round-loser takes casualties scaled to the gap; morale erosion is
    // what actually breaks an army. The winner bleeds after the loop (a grind
    // cost), so a hard-fought victory still thins your ranks.
    let casL = SR.clamp(Math.round(diff / 4), 0, 99);
    const winner = pA >= pD ? "att" : "def";
    let rA = [], rD = [];
    if (winner === "att") {
      casL = Math.min(casL, cap(D));
      rD = applyCasualties(D, casL, ctx.postureD);
      mD -= casL * 1.4 + 1.2 + diff * 0.2; mA -= 0.3;
    } else {
      casL = Math.min(casL, cap(A));
      rA = applyCasualties(A, casL, ctx.postureA);
      mA -= casL * 1.4 + 1.2 + diff * 0.2; mD -= 0.3;
    }
    rA.forEach(u => lossesA.push(u)); rD.forEach(u => lossesD.push(u));

    rounds.push({
      n: String(round),
      att: Math.round(pA), def: Math.round(pD),
      text: `Round ${round}: attacker ${Math.round(pA)} vs defender ${Math.round(pD)} — ` +
            `${winner === "att" ? "defenders" : "attackers"} lose ${winner === "att" ? rD.length : rA.length}` +
            `${(winner === "att" ? rA.length : rD.length) ? `, ${winner === "att" ? "attackers" : "defenders"} ${winner === "att" ? rA.length : rD.length}` : ""}.`,
      mA: Math.round(mA), mD: Math.round(mD),
    });
  }

  // Determine outcome
  let winner, routed = null;
  if (!D.length) { winner = "att"; routed = "def"; }
  else if (!A.length) { winner = "def"; routed = "att"; }
  else if (mD <= 0) { winner = "att"; routed = "def"; }
  else if (mA <= 0) { winner = "def"; routed = "att"; }
  else {
    // no rout after the last round: the fresher, higher-morale army holds the
    // ground; the defender wins a true tie (the attacker failed to break them).
    winner = mA > mD + 0.5 ? "att" : "def";
  }

  // Grind cost: a long, contested fight thins even the victor's ranks.
  const grind = Math.floor(round / 3);
  if (grind > 0) {
    if (winner === "att" && A.length > 1) applyCasualties(A, Math.min(grind, A.length - 1), ctx.postureA).forEach(u => lossesA.push(u));
    if (winner === "def" && D.length > 1) applyCasualties(D, Math.min(grind, D.length - 1), ctx.postureD).forEach(u => lossesD.push(u));
  }
  // Rout & pursuit — a broken army flees, losing some more but leaving a remnant.
  if (routed === "def" && D.length > 1) applyCasualties(D, Math.ceil(D.length * 0.2), ctx.postureD).forEach(u => lossesD.push(u));
  if (routed === "att" && A.length > 1) applyCasualties(A, Math.ceil(A.length * 0.2), ctx.postureA).forEach(u => lossesA.push(u));

  return { winner, routed, rounds, attLosses: lossesA, defLosses: lossesD,
    attSurv: A, defSurv: D, mA: Math.round(mA), mD: Math.round(mD) };
};

/* ---------------------------------------------------------------------
 * MOVEMENT & ATTACK VALIDATION
 * ------------------------------------------------------------------- */
SR.movableUnits = (S, id) => S.provinces[id].units.filter(u => !S.movedUnits[u.uid]);

SR.canReach = function (S, fromId, toId, cid) {
  if (!SR.stat(fromId).adj.includes(toId)) return { ok: false, reason: "Not adjacent." };
  const ps = S.provinces[fromId];
  if (ps.owner !== cid) return { ok: false, reason: "You don't hold that province." };
  if (SR.movableUnits(S, fromId).length === 0) return { ok: false, reason: "No units left to move here this season." };
  // snowbound provinces sealed in winter
  if (S.weather.winter && (SR.stat(fromId).feature === "snowbound" || SR.stat(toId).feature === "snowbound"))
    return { ok: false, reason: "Snowbound passes are sealed in Winter." };
  return { ok: true };
};

SR.isHostile = function (S, toId, cid) {
  const ps = S.provinces[toId];
  if (!ps.owner) return ps.units.length > 0 || true;      // neutral provinces are taken by force
  if (ps.owner === cid) return false;
  if (SR.allied(S, cid, ps.owner)) return false;
  return true;
};

/* Move (no combat) — used when destination is friendly or an empty neutral. */
SR.performMove = function (S, fromId, toId, uids, cid) {
  const from = S.provinces[fromId], to = S.provinces[toId];
  const moving = from.units.filter(u => uids.includes(u.uid));
  from.units = from.units.filter(u => !uids.includes(u.uid));
  moving.forEach(u => { to.units.push(u); S.movedUnits[u.uid] = true; });
  // daimyo follows if he was here and everything moved / opted
  return moving;
};

/* ---------------------------------------------------------------------
 * DEFENDER RESPONSE (AI heuristic)
 * ------------------------------------------------------------------- */
SR.chooseDefenderResponse = function (S, defId, attArmy, attCid) {
  const ps = S.provinces[defId];
  const defArmy = ps.units;
  const defPow = SR.armyPower(defArmy), attPow = SR.armyPower(attArmy);
  if (ps.castle >= 1 && defPow < attPow * 0.9) return "fortify";
  if (defArmy.length === 0 && ps.castle >= 1) return "fortify";
  if (defPow < attPow * 0.5 && defArmy.length) {
    // try to retreat to an adjacent friendly/neutral province
    const escape = SR.stat(defId).adj.find(a => {
      const q = S.provinces[a];
      return (q.owner === ps.owner) || (!q.owner && q.units.length === 0);
    });
    if (escape) return "retreat:" + escape;
  }
  return "stand";
};

/* ---------------------------------------------------------------------
 * EXECUTE ATTACK — the master orchestrator.
 * opts: { surprise, postureA, response, postureD, bringDaimyo }
 * Any missing field is decided by the engine (AI).
 * Returns a report the UI can render; results are already applied.
 * ------------------------------------------------------------------- */
SR.executeAttack = function (S, fromId, toId, uids, attCid, opts) {
  opts = opts || {};
  const from = S.provinces[fromId], to = S.provinces[toId];
  const attArmy = from.units.filter(u => uids.includes(u.uid));
  const defCid = to.owner;                       // may be null (neutral)
  const bringDaimyo = !!opts.bringDaimyo && S.clans[attCid].daimyoLoc === fromId && S.clans[attCid].daimyoAlive;
  const attCmd = bringDaimyo ? S.clans[attCid].command : 1;
  const attTrait = S.clans[attCid].trait;

  // honour cost for aggression against a pact partner / surprise
  const report = { fromId, toId, attCid, defCid, lines: [], surprise: !!opts.surprise };
  SR.applyAggressionHonour(S, attCid, defCid, !!opts.surprise, report);

  // defender response
  let response = opts.response || SR.chooseDefenderResponse(S, toId, attArmy, attCid);
  // surprise blocks fortify (unless a readiness check passes)
  if (opts.surprise && response === "fortify" && !SR.chance(0.3)) response = "stand";

  report.response = response.split(":")[0];

  if (response.startsWith("retreat")) {
    const dest = response.split(":")[1];
    // move defenders away, attacker occupies (pursuit chance)
    const defArmy = to.units.slice();
    const pursue = attArmy.some(u => DATA.units[u.type].tags.includes("fast")) && SR.chance(0.6);
    if (pursue && defArmy.length) {
      report.pursued = true;
      // disordered field battle, attacker free round
      return SR.resolveField(S, fromId, toId, attArmy, attCid, defCid, {
        surprise: true, postureA: opts.postureA || "Line", postureD: "Line",
        attCmd, attTrait, retreatDest: dest, report, occupyOnWin: true,
      });
    }
    // clean retreat
    S.provinces[dest].units.push(...defArmy);
    to.units = [];
    SR.occupy(S, toId, attArmy, attCid, fromId, bringDaimyo);
    report.outcome = "occupied"; report.text = `The defenders abandon ${SR.stat(toId).name}; your army marches in unopposed.`;
    SR.log(S, `${S.clans[attCid].name} occupies ${SR.stat(toId).name} (defenders withdrew).`, attCid === S.humanClan ? "good" : "info");
    return report;
  }

  if (response === "fortify") {
    // siege begins; attacker army becomes besieger
    from.units = from.units.filter(u => !uids.includes(u.uid));
    to.siege = { by: attCid, army: attArmy, turns: 0, fromId, bringDaimyo };
    if (bringDaimyo) S.clans[attCid].daimyoLoc = toId;
    report.outcome = "siege"; report.text = `${S.clans[defCid ? defCid : "neutral"] ? S.clans[defCid].name + " withdraws" : "The garrison withdraws"} behind the walls of ${SR.stat(toId).name}. Lay siege!`;
    SR.log(S, `${S.clans[attCid].name} lays siege to ${SR.stat(toId).name}.`, attCid === S.humanClan ? "info" : "info");
    return report;
  }

  // stand → field battle
  return SR.resolveField(S, fromId, toId, attArmy, attCid, defCid, {
    surprise: !!opts.surprise, postureA: opts.postureA || "Line", postureD: opts.postureD || "Line",
    attCmd, attTrait, report, occupyOnWin: true, bringDaimyo,
  });
};

/* Resolve a field of battle and apply everything. */
SR.resolveField = function (S, fromId, toId, attArmy, attCid, defCid, o) {
  const to = S.provinces[toId], from = S.provinces[fromId];
  const defArmy = to.units.slice();
  const defDaimyoHere = defCid && S.clans[defCid].daimyoAlive && S.clans[defCid].daimyoLoc === toId;
  const defCmd = defDaimyoHere ? S.clans[defCid].command : 1;
  const defTrait = defCid ? S.clans[defCid].trait : "";
  const report = o.report || { lines: [] };

  const res = SR.simulateBattle({
    attUnits: attArmy, defUnits: defArmy,
    attCmd: o.attCmd, defCmd,
    attTrait: o.attTrait, defTrait,
    terrain: SR.stat(toId).terrain, weather: S.weather,
    surprise: o.surprise, postureA: o.postureA, postureD: o.postureD,
    castleBonus: o.assault ? to.castle : 0, assault: !!o.assault,
  });

  report.sim = res; report.terrain = SR.stat(toId).terrain;
  report.attStart = attArmy.length; report.defStart = defArmy.length;

  // remove attacker's committed units from origin (they marched)
  from.units = from.units.filter(u => !attArmy.some(a => a.uid === u.uid));

  const survA = res.attSurv, survD = res.defSurv;

  if (res.winner === "att") {
    report.outcome = "attWin";
    // prestige
    S.clans[attCid].prestige += res.routed === "def" ? 2 : 1;
    if (attArmy.length < defArmy.length) S.clans[attCid].honour = SR.clamp(S.clans[attCid].honour + 1, 0, 20); // won outnumbered
    // defender leader fate
    if (defDaimyoHere && res.routed === "def") SR.generalFate(S, defCid, attCid, report, false);
    // defenders wiped or routed
    to.units = survD;   // survivors (garrison) remain if any
    if (to.castle >= 1 && (survD.length > 0 || defCid)) {
      // survivors fall back into the castle → siege
      to.units = survD;
      to.siege = { by: attCid, army: survA, turns: 0, fromId, bringDaimyo: o.bringDaimyo };
      if (o.bringDaimyo) S.clans[attCid].daimyoLoc = toId;
      report.postText = `The field is won, but ${SR.stat(toId).name}'s castle (level ${to.castle}) still stands. Your army invests the walls.`;
      SR.log(S, `${S.clans[attCid].name} wins the field at ${SR.stat(toId).name}; siege begins.`, attCid === S.humanClan ? "good" : "info");
    } else {
      // occupy
      to.units = [];
      SR.occupy(S, toId, survA, attCid, fromId, o.bringDaimyo);
      report.postText = `${SR.stat(toId).name} falls! Garrison it and pay to pacify the province.`;
      SR.log(S, `${S.clans[attCid].name} takes ${SR.stat(toId).name} in the field.`, attCid === S.humanClan ? "good" : "info");
    }
  } else {
    report.outcome = "defWin";
    if (defCid) S.clans[defCid].prestige += res.routed === "att" ? 2 : 1;
    if (defCid && defArmy.length < attArmy.length) S.clans[defCid].honour = SR.clamp(S.clans[defCid].honour + 1, 0, 20);
    // attacker leader fate
    if (o.bringDaimyo && res.routed === "att") SR.generalFate(S, attCid, defCid, report, true);
    // survivors retreat home
    to.units = survD;
    survA.forEach(u => { from.units.push(u); });
    report.postText = `Your assault is thrown back. The survivors limp home to ${SR.stat(fromId).name}.`;
    SR.log(S, `${defCid ? S.clans[defCid].name : "The defenders"} hold ${SR.stat(toId).name} against ${S.clans[attCid].name}.`,
      defCid === S.humanClan ? "good" : (attCid === S.humanClan ? "bad" : "info"));
  }
  return report;
};

/* Occupy a captured province. */
SR.occupy = function (S, id, army, cid, fromId, bringDaimyo) {
  const ps = S.provinces[id]; const pd = SR.stat(id);
  ps.owner = cid; ps.units = army; ps.siege = null;
  ps.status = "occupied";
  ps.unrest = SR.stat(id).koku + (pd.feature === "ikko" ? 2 : 0) + (ps.razed ? 2 : 0);
  const band = SR.honourBand(S.clans[cid].honour);
  ps.unrest += Math.max(0, band.revolt);
  ps.pacifying = false;
  if (bringDaimyo) S.clans[cid].daimyoLoc = id;
  army.forEach(u => S.movedUnits[u.uid] = true);
};

/* Leader capture / death / seppuku. For the human, sets a pending choice. */
SR.generalFate = function (S, loserCid, winnerCid, report, wasAttacker) {
  const c = S.clans[loserCid];
  const roll = Math.random();
  if (roll < 0.45) { report.generalFate = "escape";
    SR.log(S, `${c.daimyo} escapes the rout.`, loserCid === S.humanClan ? "info" : "info"); return; }
  // capture or death — human gets a seppuku choice
  if (loserCid === S.humanClan) {
    report.pendingSeppuku = { loserCid, winnerCid };
    return;
  }
  // AI: choose seppuku if honourable
  if (SR.honourBand(c.honour).min >= 13 && SR.chance(0.5)) {
    SR.resolveSeppuku(S, loserCid, winnerCid, true, report);
  } else if (roll < 0.72) {
    c.daimyoAlive = false; report.generalFate = "captured";
    SR.log(S, `${c.daimyo} is captured!`, "info");
  } else {
    c.daimyoAlive = false; report.generalFate = "slain";
    SR.log(S, `${c.daimyo} is slain in the rout.`, "info");
  }
};
SR.resolveSeppuku = function (S, loserCid, winnerCid, doSeppuku, report) {
  const c = S.clans[loserCid];
  if (doSeppuku) {
    c.daimyoAlive = false; c.honour = SR.clamp(c.honour + 1, 0, 20);
    if (report) report.generalFate = "seppuku";
    SR.log(S, `${c.daimyo} commits seppuku, denying the enemy the capture (+1 Honour).`, loserCid === S.humanClan ? "info" : "info");
  } else {
    // taken alive
    c.daimyoAlive = false;
    if (report) report.generalFate = "captured";
    SR.log(S, `${c.daimyo} is taken captive.`, "info");
    // captor may spare (honour) or execute — AI captor decides
    if (winnerCid && winnerCid !== S.humanClan) {
      if (SR.chance(0.5)) S.clans[winnerCid].honour = SR.clamp(S.clans[winnerCid].honour + 2, 0, 20); // spare/ransom
      else S.clans[winnerCid].honour = SR.clamp(S.clans[winnerCid].honour - 2, 0, 20); // execute
    }
  }
};

/* ---------------------------------------------------------------------
 * HONOUR for aggression.
 * ------------------------------------------------------------------- */
SR.applyAggressionHonour = function (S, attCid, defCid, surprise, report) {
  const c = S.clans[attCid];
  if (surprise) { c.honour = SR.clamp(c.honour - 2, 0, 20); report.honourNote = "Surprise attack: −2 Honour."; }
  if (defCid && SR.atPeace(S, attCid, defCid)) {
    // breaking a pact
    const leader = SR.prestigeLeader(S);
    const cost = (defCid === leader) ? 2 : 4;         // anti-runaway: half cost vs the leader
    c.honour = SR.clamp(c.honour - cost, 0, 20); c.treachery += 1;
    const r = c.relations[defCid]; if (r) { r.pact = "none"; r.attitude -= 40; }
    const r2 = S.clans[defCid].relations[attCid]; if (r2) { r2.pact = "none"; r2.attitude -= 60; }
    report.honourNote = (report.honourNote ? report.honourNote + " " : "") + `Broke a pact: −${cost} Honour (Treachery).`;
    SR.log(S, `${c.name} breaks its pact with ${S.clans[defCid].name}! (−${cost} Honour)`, "bad");
  }
};

/* ---------------------------------------------------------------------
 * SIEGES
 * ------------------------------------------------------------------- */
SR.siegeTick = function (S, id) {
  const ps = S.provinces[id]; const sg = ps.siege;
  if (!sg) return;
  const attCid = sg.by;
  if (!S.clans[attCid] || !S.clans[attCid].alive || !(sg.army && sg.army.length)) {
    SR.log(S, `The siege of ${SR.stat(id).name} is lifted.`, "info"); ps.siege = null; return;
  }
  sg.turns += 1;
  const siegeTrains = SR.countType(sg.army, "siege");
  const greatCastle = SR.stat(id).feature === "great_castle";
  const hojoDef = ps.owner === "hojo";
  const attackerHasGreat = SR.clanProvinces(S, attCid).some(p => SR.stat(p).feature === "great_castle");

  if (siegeTrains > 0) {
    let reduce = 1;
    if ((greatCastle || hojoDef) && sg.turns % 2 === 0) reduce = 1; else if (greatCastle || hojoDef) reduce = 0;
    if (attackerHasGreat) reduce += (sg.turns % 2 === 1 ? 1 : 0);
    if (reduce > 0) { ps.castle = Math.max(0, ps.castle - reduce);
      SR.log(S, `Siege guns batter ${SR.stat(id).name}: castle now level ${ps.castle}.`,
        attCid === S.humanClan ? "info" : "info"); }
  } else {
    // starvation — cut supply garrison wastes away
    if (!SR.inSupply(S, id, ps.owner)) {
      if (ps.units.length) { ps.units.pop(); SR.log(S, `${SR.stat(id).name}'s garrison starves (a unit lost).`, "info"); }
      else ps.castle = Math.max(0, ps.castle - 1);
    }
  }
  // besiegers take mild attrition in winter
  if (S.weather.winter && sg.army.length && SR.chance(0.4)) sg.army.pop();

  if (ps.castle <= 0) SR.siegeAssault(S, id, false);
};

/* Storm the walls (or automatic when castle hits 0). Returns report. */
SR.siegeAssault = function (S, id, forced) {
  const ps = S.provinces[id]; const sg = ps.siege;
  if (!sg) return null;
  const attCid = sg.by; const defCid = ps.owner;
  const attArmy = sg.army; const defArmy = ps.units.slice();
  const defDaimyoHere = defCid && S.clans[defCid].daimyoAlive && S.clans[defCid].daimyoLoc === id;
  const res = SR.simulateBattle({
    attUnits: attArmy, defUnits: defArmy,
    attCmd: sg.bringDaimyo ? S.clans[attCid].command : 1,
    defCmd: defDaimyoHere ? S.clans[defCid].command : 1,
    attTrait: S.clans[attCid].trait, defTrait: defCid ? S.clans[defCid].trait : "",
    terrain: SR.stat(id).terrain, weather: S.weather,
    surprise: false, postureA: "Line", postureD: "Deep",
    castleBonus: ps.castle, assault: true,
  });
  const report = { outcome: "", sim: res, terrain: SR.stat(id).terrain, toId: id,
    attCid, defCid, attStart: attArmy.length, defStart: defArmy.length, assault: true };
  if (res.winner === "att") {
    S.clans[attCid].prestige += 2;   // major siege
    if (defDaimyoHere) SR.generalFate(S, defCid, attCid, report, false);
    ps.siege = null; ps.units = [];
    SR.occupy(S, id, res.attSurv, attCid, sg.fromId, sg.bringDaimyo);
    report.outcome = "attWin";
    report.postText = `${SR.stat(id).name} is stormed and taken! Pay to pacify it.`;
    SR.log(S, `${S.clans[attCid].name} storms ${SR.stat(id).name}!`, attCid === S.humanClan ? "good" : "info");
  } else {
    ps.units = res.defSurv; sg.army = res.attSurv;
    report.outcome = "defWin";
    report.postText = `The assault on ${SR.stat(id).name} is repulsed — the siege drags on.`;
    if (!sg.army.length) { ps.siege = null; SR.log(S, `The siege of ${SR.stat(id).name} collapses.`, "info"); }
    else SR.log(S, `The garrison of ${SR.stat(id).name} throws back the assault.`, defCid === S.humanClan ? "good" : "info");
  }
  return report;
};

/* Lift your own siege (recall the army to its origin). */
SR.liftSiege = function (S, id) {
  const ps = S.provinces[id]; const sg = ps.siege; if (!sg) return;
  const home = S.provinces[sg.fromId];
  if (home && home.owner === sg.by) home.units.push(...sg.army);
  ps.siege = null;
  SR.log(S, `${S.clans[sg.by].name} lifts the siege of ${SR.stat(id).name}.`, "info");
};

/* ---------------------------------------------------------------------
 * PACIFY / RAZE
 * ------------------------------------------------------------------- */
SR.pacifyCost = function (S, id) {
  const pd = SR.stat(id); const ps = S.provinces[id];
  let cost = SR.stat(id).koku;
  if (pd.feature === "ikko" || ps.razed) cost *= 2;
  return cost;
};
SR.doPacify = function (S, id, cid) {
  const ps = S.provinces[id];
  if (ps.owner !== cid || ps.status !== "occupied") return { ok: false, reason: "Nothing to pacify here." };
  if (ps.units.length === 0) return { ok: false, reason: "Leave a garrison (≥1 unit) first." };
  const cost = SR.pacifyCost(S, id);
  if (S.clans[cid].koban < cost) return { ok: false, reason: `Need ${cost} koban to pacify.` };
  S.clans[cid].koban -= cost;
  ps.status = "pacifying"; ps.pacifying = true;
  if (ps.unrest <= 0) ps.unrest = 1;
  SR.log(S, `${S.clans[cid].name} begins to pacify ${SR.stat(id).name} (${cost} koban).`, cid === S.humanClan ? "info" : "info");
  return { ok: true };
};
SR.doRaze = function (S, id, cid) {
  const ps = S.provinces[id];
  if (ps.owner !== cid) return { ok: false, reason: "Not yours." };
  ps.razed = true; ps.buildings = {}; ps.castle = Math.max(0, ps.castle - 1);
  S.clans[cid].honour = SR.clamp(S.clans[cid].honour - 3, 0, 20);
  SR.applyMineFlags(S);
  SR.log(S, `${S.clans[cid].name} razes ${SR.stat(id).name}! (−3 Honour)`, "bad");
  return { ok: true };
};

if (typeof module !== "undefined") module.exports = SR;
