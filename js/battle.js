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
/* =====================================================================
 * THE FIELD OF BATTLE — three sectors (Left · Centre · Right) + a Reserve.
 * Deterministic strength (skill) + ONE six-sided die of friction per side
 * (bounded ±5, so a real edge reliably wins). Interactive: deploy your army,
 * pick a formation per sector, and issue one order a round (commit the
 * Reserve, or wheel a broken flank into the centre). Stateful API:
 *   SR.beginBattle(ctx) → B ;  SR.stepBattle(B, order) → round result ;
 *   SR.battleResult(B). SR.simulateBattle(ctx) auto-plays it (AI/siege/sea).
 * ===================================================================== */
SR.SECTORS = ["L", "C", "R"];
SR.sectorName = { L: "Left flank", C: "Centre", R: "Right flank" };

SR.roleVal = (type, role) => { const u = DATA.units[type]; return role === "def" ? u.def : u.atk; };

/* A sensible default deployment: cavalry take a flank, guns + a strong line
 * hold the centre, a reserve is kept back if the army is large enough. */
SR.emptyWorks = () => ({ L: [], C: [], R: [] });
SR.autoDeploy = function (units, role, terrain) {
  const d = { L: [], C: [], R: [], RES: [], pL: "Line", pC: "Line", pR: "Line", front: { L: [], C: [], R: [] }, works: SR.emptyWorks() };
  const cav = units.filter(u => DATA.units[u.type].tags.includes("shock"));
  const foot = units.filter(u => !DATA.units[u.type].tags.includes("shock"));
  cav.forEach(u => d.R.push(u.uid));                       // horse on the right flank
  const keepRes = units.length >= 6 ? 1 : 0;
  const spread = ["C", "L", "C", "R", "C", "L", "R"];
  let i = 0;
  for (const u of foot) {
    if (keepRes && d.RES.length < keepRes && i === 2) d.RES.push(u.uid);
    else d[spread[i % spread.length]].push(u.uid);
    i++;
  }
  if (d.C.length >= 2) d.pC = "Deep";                      // hold the centre deep
  return d;
};

/* Build a deployment from a player's simple battle plan:
 *   { formation:'Line'|'Wide'|'Deep', main:'L'|'C'|'R', reserve:bool }
 * Cavalry and the main effort concentrate on `main`; formation sets postures;
 * a reserve is held back if asked. A few high-impact choices, clearly mapped. */
SR.planDeploy = function (units, role, terrain, plan) {
  plan = plan || {};
  const main = ["L", "C", "R"].includes(plan.main) ? plan.main : "C";
  const form = ["Line", "Wide", "Deep"].includes(plan.formation) ? plan.formation : "Line";
  const d = { L: [], C: [], R: [], RES: [], pL: form, pC: form, pR: form, front: { L: [], C: [], R: [] }, works: SR.emptyWorks() };
  const others = ["L", "C", "R"].filter(s => s !== main);
  const cav = units.filter(u => DATA.units[u.type].tags.includes("shock"));
  const rest = units.filter(u => !DATA.units[u.type].tags.includes("shock"));
  cav.forEach(u => d[main].push(u.uid));                   // horse spearheads the main effort
  const reserveN = plan.reserve ? Math.max(1, Math.round(rest.length / 4)) : 0;
  let a = 0;
  for (const u of rest) {
    if (d.RES.length < reserveN) { d.RES.push(u.uid); continue; }
    d[a % 2 === 0 ? main : others[Math.floor(a / 2) % 2]].push(u.uid); a++;   // ~half to main
  }
  return d;
};

/* Units still alive in a side's sector. */
SR.secUnits = function (B, sk, sec) {
  const ids = B.deploy[sk][sec]; const live = B.side[sk].units;
  return live.filter(u => ids.includes(u.uid));
};

/* Field works a side raised in a sector, summed to their effects. */
SR.sectorWorks = function (B, sk, sec) {
  const list = (B.deploy[sk].works && B.deploy[sk].works[sec]) || [];
  const acc = { def: 0, fire: 0, antiShock: 0, steady: 0, keys: list.slice() };
  for (const wk of list) { const w = DATA.fieldWorks[wk]; if (!w) continue;
    acc.def += w.def || 0; acc.fire += w.fire || 0; acc.antiShock += w.antiShock || 0; acc.steady += w.steady || 0; }
  return acc;
};

/* Deterministic Sector Strength for one side in one sector this round. */
SR.sectorSS = function (B, sk, sec) {
  const S = B.side[sk], role = S.role, posture = B.deploy[sk]["p" + sec];
  const units = SR.secUnits(B, sk, sec);
  const works = SR.sectorWorks(B, sk, sec);
  if (!units.length) {
    // an empty flank still holds its works (a manned wall with no troops is just a wall)
    if (works.def || works.fire) { const parts = {}; let ss = 0;
      if (works.def) { ss += works.def; parts.works = works.def; }
      return { ss, front: 0, parts, count: 0, steady: works.steady }; }
    return { ss: 0, front: 0, parts: {}, count: 0, steady: works.steady };
  }
  const T = DATA.terrain[B.terrain];
  let front = T.frontage; if (posture === "Deep") front = Math.max(1, front - 1); if (posture === "Wide") front += 1;
  // Player-chosen front rank comes first; the rest fill by fighting value.
  const chosen = (B.deploy[sk].front && B.deploy[sk].front[sec]) || [];
  let ordered;
  if (chosen.length) {
    const inFront = units.filter(u => chosen.includes(u.uid));
    const rest = units.filter(u => !chosen.includes(u.uid)).sort((a, b) => SR.roleVal(b.type, role) - SR.roleVal(a.type, role));
    ordered = inFront.concat(rest);
  } else {
    ordered = [...units].sort((a, b) => SR.roleVal(b.type, role) - SR.roleVal(a.type, role));
  }
  const eng = ordered.slice(0, front), sup = ordered.slice(front);
  const parts = {};
  let ss = SR.sum(eng, u => SR.roleVal(u.type, role)); parts.line = ss;
  // Attacker's initiative: they chose the ground and the moment to strike.
  if (role === "att") { ss += 1; parts.assault = 1; }
  // terrain
  if (role === "def") { const t = T.defBonus; ss += t; if (t) parts.terrain = t; }
  else if (B.terrain === "Mountain" || B.terrain === "River") { ss -= 2; parts.terrain = -2; }
  // shock: charging cavalry, round 1, max 2, ½ in mtn/forest — but enemy guns,
  // archers, and anti-cavalry stakes in this flank blunt the charge.
  if (B.round <= 1) {
    const cav = Math.min(2, units.filter(u => DATA.units[u.type].tags.includes("shock")).length);
    if (cav) {
      let sh = Math.round(cav * 3 * (["Mountain", "Forest"].includes(B.terrain) ? 0.5 : 1));
      const foeSk = sk === "att" ? "def" : "att";
      const foe = SR.secUnits(B, foeSk, sec);
      const foeWorks = SR.sectorWorks(B, foeSk, sec);
      const antiShock = foe.filter(u => u.type === "teppo").length * 3 + foe.filter(u => u.type === "archers").length + foeWorks.antiShock;
      sh = Math.max(0, sh - antiShock);
      if (sh) { ss += sh; parts.shock = sh; } else if (antiShock) parts.shock = 0;
    }
  }
  // ranged fire (front OR support): archers +2 always; teppō +3 odd rounds, dry
  let fire = 0;
  for (const u of units) { const d = DATA.units[u.type];
    if (d.tags.includes("volley")) { if (!B.wet && B.round % 2 === 1) fire += 3 + (B.deploy[sk === "att" ? "def" : "att"]["p" + sec] === "Deep" ? 1 : 0); }
    else if (d.tags.includes("ranged")) fire += 2; }
  fire += works.fire;                                  // gun emplacements add to the volley
  if (fire) { ss += fire; parts.fire = fire; if (S.trait === "Teppō") { ss += 1; parts.fire += 1; } }
  // field works: palisades / redoubts add defence to whoever raised them
  if (works.def) { ss += works.def; parts.works = works.def; }
  // depth (Deep), infantry/defence traits
  if (posture === "Deep" && sup.length) { const dep = Math.min(3, sup.length); ss += dep; parts.depth = dep; }
  if (S.trait === "Infantry") { const inf = Math.round(0.5 * units.filter(u => ["ashigaru", "samurai"].includes(u.type)).length); if (inf) { ss += inf; parts.infantry = inf; } }
  if (S.trait === "Siege & Defence" && role === "def") { ss += 2; parts.defence = 2; }
  if (role === "def" && B.castleBonus && B.assault) { const cb = B.castleBonus * 2; ss += cb; parts.walls = cb; }
  // a Fort in the province strengthens the defender's strongpoint
  if (role === "def" && B.fortDef && sec === S.mainSec) { ss += B.fortDef; parts.fort = B.fortDef; }
  // leadership in the main-effort sector
  if (sec === S.mainSec && S.cmd) { ss += S.cmd; parts.command = S.cmd; }
  // wheel bonus (won a flank last round → roll into the centre)
  if (B.wheel[sk] === sec) { ss += 4; parts.wheel = 4; }
  // one-time Martial Prowess surge (round 1, on the main effort)
  if (S.prowessSec === sec && B.round === 1 && S.ms) { ss += S.ms; parts.prowess = S.ms; }
  // fatigue
  const fat = Math.min(3, B.fatigue[sk][sec] || 0); if (fat) { ss -= fat; parts.fatigue = -fat; }
  return { ss: Math.max(0, ss), front, parts, count: units.length, steady: works.steady };
};

SR.beginBattle = function (ctx) {
  const mk = (units) => units.map(u => ({ ...u }));
  const A = mk(ctx.attUnits), D = mk(ctx.defUnits);
  const mainOf = (dep) => ["C", "L", "R"].sort((a, b) => dep[b].length - dep[a].length)[0];
  const B = {
    terrain: ctx.terrain, wet: !!(ctx.weather && (ctx.weather.rain || ctx.weather.winter)),
    assault: !!ctx.assault, castleBonus: ctx.castleBonus || 0, surprise: !!ctx.surprise,
    round: 0, done: false, winner: null, routed: null, log: [], humanSide: ctx.humanSide || null,
    side: {
      att: { units: A, role: "att", cmd: ctx.attCmd || 0, ms: ctx.attMS || 0, trait: ctx.attTrait || "", prowessUsed: false },
      def: { units: D, role: "def", cmd: ctx.defCmd || 0, ms: ctx.defMS || 0, trait: ctx.defTrait || "", prowessUsed: false },
    },
    deploy: {
      att: ctx.attDeploy || SR.autoDeploy(A, "att", ctx.terrain),
      def: ctx.defDeploy || SR.autoDeploy(D, "def", ctx.terrain),
    },
    fortDef: ctx.fortDef || 0,
    morale: {
      att: 10 + Math.min(3, SR.countType(A, "samurai")) + (ctx.attCmd || 0) + (ctx.attMS || 0),
      def: 10 + Math.min(3, SR.countType(D, "samurai")) + (ctx.defCmd || 0) + (ctx.defMS || 0) + (ctx.castleBonus || 0),
    },
    fatigue: { att: { L: 0, C: 0, R: 0 }, def: { L: 0, C: 0, R: 0 } },
    wheel: { att: null, def: null }, broke: { att: null, def: null },
    losses: { att: [], def: [] }, morale0: {},
  };
  ["att", "def"].forEach(sk => {
    const dep = B.deploy[sk];                 // normalise deploys from the UI / plan
    if (!dep.front) dep.front = { L: [], C: [], R: [] };
    if (!dep.works) dep.works = SR.emptyWorks();
    B.side[sk].mainSec = mainOf(dep);
    B.side[sk].prowessSec = B.side[sk].mainSec; // spend Prowess on the main effort
  });
  B.morale0 = { att: B.morale.att, def: B.morale.def };
  if (B.surprise) B.morale.def -= 2;           // caught outside the walls
  return B;
};

/* Start a round: advance the counter and apply each side's order (commit the
 * Reserve, or wheel a broken flank). A missing side's order is auto-decided. */
SR.applyOrders = function (B, orders) {
  B.round++;
  orders = orders || {};
  const aiOrder = (sk) => {
    if (B.broke[sk] && B.round > 1) return { type: "wheel", sector: B.broke[sk] };
    if (B.deploy[sk].RES.length) return { type: "reserve", sector: B.side[sk].mainSec };
    return { type: "hold" };
  };
  ["att", "def"].forEach(sk => {
    const o = orders[sk] || aiOrder(sk);
    if (o.type === "reserve" && B.deploy[sk].RES.length) {
      const sec = SR.SECTORS.includes(o.sector) ? o.sector : B.side[sk].mainSec;
      B.deploy[sk][sec] = B.deploy[sk][sec].concat(B.deploy[sk].RES);
      B.deploy[sk].RES = []; B.fatigue[sk][sec] = 0;
      B.log.push(`${sk === "att" ? "Attacker" : "Defender"} commits the Reserve to the ${SR.sectorName[sec]}.`);
    } else if (o.type === "wheel" && B.broke[sk]) {
      B.wheel[sk] = "C"; B.morale[sk === "att" ? "def" : "att"] -= 3;
      B.log.push(`${sk === "att" ? "Attacker" : "Defender"} wheels from the broken ${SR.sectorName[B.broke[sk]]} into the centre!`);
    }
  });
  B.broke = { att: null, def: null };
};

/* Read-only per-sector strengths for display (no dice, no mutation). */
SR.previewSectors = function (B) {
  return SR.SECTORS.map(sec => {
    const a = SR.sectorSS(B, "att", sec), d = SR.sectorSS(B, "def", sec);
    return { sector: sec, name: SR.sectorName[sec], attSS: a.ss, attParts: a.parts, attCount: a.count || 0,
      defSS: d.ss, defParts: d.parts, defCount: d.count || 0 };
  }).filter(x => x.attCount || x.defCount);
};

/* Resolve the round with ONE bounded d6 of friction per side (injected as
 * dice:{att,def}, else rolled). The same die applies across the sectors. */
SR.resolveRound = function (B, dice) {
  const dieA = dice && dice.att != null ? dice.att : SR.rint(1, 6);
  const ambush = B.surprise && B.round === 1;
  const dieD = ambush ? 0 : (dice && dice.def != null ? dice.def : SR.rint(1, 6));
  const results = [];
  for (const sec of SR.SECTORS) {
    const a = SR.sectorSS(B, "att", sec), d = SR.sectorSS(B, "def", sec);
    if (!a.count && !d.count) continue;
    const totA = a.ss + dieA, totD = d.ss + dieD;
    const margin = Math.abs(totA - totD);
    const winSide = totA >= totD ? "att" : "def", loseSide = winSide === "att" ? "def" : "att";
    // Did the dice decide it? (winner by pure strength vs winner after the roll)
    const ssWin = a.ss >= d.ss ? "att" : "def";
    const flip = ssWin !== winSide;               // the roll overturned the stronger line
    const decidedByDice = flip || a.ss === d.ss;  // roll broke a tie or flipped the result
    const loserSteady = (loseSide === "att" ? a.steady : d.steady) || 0;   // redoubt
    const loseUnits = SR.secUnits(B, loseSide, sec), winUnits = SR.secUnits(B, winSide, sec);
    let loseCas = Math.min(Math.floor(margin / 4), loseUnits.length);
    if (B.deploy[loseSide]["p" + sec] === "Deep") loseCas = Math.max(0, loseCas - 1);
    const winCas = Math.min(Math.floor(margin / 8), 1, Math.max(0, winUnits.length - 1));
    SR.removeSecCas(B, loseSide, sec, loseCas);
    SR.removeSecCas(B, winSide, sec, winCas);
    let mLoss = Math.min(margin, 6);
    if (B.deploy[loseSide]["p" + sec] === "Deep") mLoss = Math.max(0, mLoss - 2);
    mLoss = Math.max(0, mLoss - loserSteady);     // a redoubt steadies the shaken flank
    if (margin > 0) B.morale[loseSide] -= mLoss;
    B.fatigue.att[sec]++; B.fatigue.def[sec]++;
    const lostFront = SR.secUnits(B, loseSide, sec).length === 0;
    const broke = (margin >= 8 + loserSteady * 2) || lostFront;   // works make a flank harder to break
    if (broke) { if (B.deploy[loseSide]["p" + sec] === "Wide") B.morale[loseSide] -= 2; B.broke[winSide] = sec; }
    results.push({ sector: sec, name: SR.sectorName[sec], attSS: a.ss, defSS: d.ss, attParts: a.parts, defParts: d.parts,
      dieA, dieD, totA, totD, margin, winner: winSide, loseCas, broke, flip, decidedByDice,
      text: `${SR.sectorName[sec]}: ${totA} vs ${totD} — ${winSide === "att" ? "you" : "they"}` +
            `${margin === 0 ? " hold, a bloody stand-off" : " win by " + margin + (loseCas ? `, ${loseSide === "att" ? "you lose" : "they lose"} ${loseCas}` : "")}` +
            `${broke ? " — the line breaks!" : ""}.` });
  }
  B.wheel = { att: null, def: null };
  B.surprise = false;
  const aGone = B.side.att.units.length === 0, dGone = B.side.def.units.length === 0;
  if (B.morale.def <= 0 || dGone) { B.done = true; B.winner = "att"; B.routed = "def"; }
  else if (B.morale.att <= 0 || aGone) { B.done = true; B.winner = "def"; B.routed = "att"; }
  else if (B.round >= 3) { B.done = true; B.winner = B.morale.att > B.morale.def + 0.5 ? "att" : "def"; }
  return { round: B.round, dieA, dieD, ambush, results, morale: { ...B.morale }, done: B.done, winner: B.winner, routed: B.routed, log: B.log.slice() };
};

/* Convenience: advance one full round (orders + roll). Used by the auto
 * resolver; the interactive UI calls applyOrders / previewSectors / resolveRound
 * itself so the player can roll the die. */
SR.stepBattle = function (B, params) {
  if (B.done) return null;
  params = params || {};
  SR.applyOrders(B, params.orders);
  return SR.resolveRound(B, params.dice);
};

SR.removeSecCas = function (B, sk, sec, n) {
  if (n <= 0) return;
  const inSec = SR.secUnits(B, sk, sec).sort((a, b) => SR.unitBase(a.type) - SR.unitBase(b.type));
  for (let i = 0; i < n && i < inSec.length; i++) {
    const u = inSec[i];
    B.side[sk].units = B.side[sk].units.filter(x => x.uid !== u.uid);
    B.deploy[sk][sec] = B.deploy[sk][sec].filter(id => id !== u.uid);
    B.losses[sk].push(u);
  }
};

/* Final result in the legacy shape the rest of the code expects. */
SR.battleResult = function (B) {
  // rout attrition + pursuit
  const rout = (sk) => {
    const arr = B.side[sk].units;
    if (arr.length > 1) { const lose = Math.floor(arr.length / 3); for (let i = 0; i < lose; i++) B.losses[sk].push(arr.pop()); }
  };
  if (B.routed) rout(B.routed);
  return {
    winner: B.winner, routed: B.routed, rounds: B.rounds || [],
    attLosses: B.losses.att, defLosses: B.losses.def,
    attSurv: B.side.att.units, defSurv: B.side.def.units,
    mA: Math.round(B.morale.att), mD: Math.round(B.morale.def),
  };
};

/* Auto-play the whole battle (AI vs AI, sieges, sea, multiplayer). */
SR.simulateBattle = function (ctx) {
  const B = SR.beginBattle(ctx);
  const rounds = [];
  let guard = 0;
  while (!B.done && guard++ < 4) {
    const r = SR.stepBattle(B);
    rounds.push({ n: String(r.round), att: 0, def: 0, mA: Math.round(r.morale.att), mD: Math.round(r.morale.def),
      text: r.results.map(x => x.text).join(" ") });
  }
  B.rounds = rounds;
  return SR.battleResult(B);
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
  // snowbound provinces sealed in winter (Echigo, Kaga, Mutsu, Shinano)
  if (S.weather.winter && (SR.stat(fromId).snowbound || SR.stat(toId).snowbound))
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
    surprise: !!opts.surprise, attPlan: opts.plan, defPlan: opts.defPlan,
    attDeploy: opts.deploy, defDeploy: opts.defDeploy,   // full hand-made deployments
    attCmd, attTrait, report, occupyOnWin: true, bringDaimyo,
    interactive: !!opts.interactive,
  });
};

/* Build the battle context (deployments, command, traits, terrain, weather)
 * for a field of battle. Shared by the auto resolver and the interactive UI. */
SR.buildFieldCtx = function (S, fromId, toId, attArmy, attCid, defCid, o) {
  const to = S.provinces[toId];
  const defArmy = to.units.slice();
  const defDaimyoHere = defCid && S.clans[defCid].daimyoAlive && S.clans[defCid].daimyoLoc === toId;
  const defCmd = defDaimyoHere ? S.clans[defCid].command : 1;
  const defTrait = defCid ? S.clans[defCid].trait : "";
  const terr = SR.stat(toId).terrain;
  const humanSide = attCid === S.humanClan ? "att" : (defCid === S.humanClan ? "def" : null);
  // a Fort in the defended province strengthens the defender and grants a work
  const hasFort = !!(to.buildings && to.buildings.fort);
  const fortDef = hasFort ? DATA.buildings.fort.fieldDef : 0;
  return {
    attUnits: attArmy, defUnits: defArmy,
    attCmd: o.attCmd, defCmd,
    attTrait: o.attTrait, defTrait,
    attMS: S.clans[attCid].ms, defMS: defCid ? S.clans[defCid].ms : 0,
    terrain: terr, weather: S.weather,
    surprise: o.surprise,
    // a full hand-made deployment wins; else a simple plan; else the AI auto-deploys
    attDeploy: o.attDeploy || (o.attPlan ? SR.planDeploy(attArmy, "att", terr, o.attPlan) : undefined),
    defDeploy: o.defDeploy || (o.defPlan ? SR.planDeploy(defArmy, "def", terr, o.defPlan) : undefined),
    castleBonus: o.assault ? to.castle : 0, assault: !!o.assault,
    fortDef,
    // field-work budget: attacker 1, defender 2 (+1 with a Fort)
    attWorks: 1, defWorks: 2 + (hasFort ? DATA.buildings.fort.extraWorks : 0),
    humanSide, defDaimyoHere,
  };
};

/* Resolve a field of battle and apply everything.
 * If o.interactive (and a human is fighting) is set, the battle is NOT resolved
 * here — instead the report carries the context so the UI can play it out
 * round-by-round with a clickable die, then call SR.applyFieldResult itself. */
SR.resolveField = function (S, fromId, toId, attArmy, attCid, defCid, o) {
  const to = S.provinces[toId];
  const defArmy = to.units.slice();
  const report = o.report || { lines: [] };
  const ctx = SR.buildFieldCtx(S, fromId, toId, attArmy, attCid, defCid, o);

  report.terrain = SR.stat(toId).terrain;
  report.attStart = attArmy.length; report.defStart = defArmy.length;

  const apply = { fromId, toId, attArmy, defArmy, attCid, defCid, o, defDaimyoHere: ctx.defDaimyoHere };

  if (o.interactive && ctx.humanSide) {
    // Hand the battle to the interactive screen: it will beginBattle(ctx),
    // step through it with player-rolled dice, then finish via applyFieldResult.
    report.interactive = true;
    report.ctx = ctx;
    report.apply = apply;
    return report;
  }

  const res = SR.simulateBattle(ctx);
  SR.applyFieldResult(S, report, res, apply);
  return report;
};

/* Apply the outcome of a resolved field of battle (prestige, honour, leader
 * fate, occupy / siege / retreat, logging). res is the legacy battleResult. */
SR.applyFieldResult = function (S, report, res, a) {
  const { fromId, toId, attArmy, defArmy, attCid, defCid, o, defDaimyoHere } = a;
  const to = S.provinces[toId], from = S.provinces[fromId];
  report.interactive = false;   // this report is resolved & applied now
  report.sim = res;
  report.attStart = report.attStart != null ? report.attStart : attArmy.length;
  report.defStart = report.defStart != null ? report.defStart : defArmy.length;

  // remove attacker's committed units from origin (they marched)
  from.units = from.units.filter(u => !attArmy.some(x => x.uid === u.uid));

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
  ps.unrest = SR.stat(id).koku + (pd.hard ? 2 : 0) + (ps.razed ? 2 : 0);
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
  SR.siegeInit(sg);
  // a besieged town burns through its stores each season (faster if cut off)
  sg.supply = Math.max(0, sg.supply - (SR.inSupply(S, id, ps.owner) ? 1 : 2));
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
  }
  // starvation once the stores run dry
  if (sg.supply <= 0) {
    if (ps.units.length) { ps.units.pop(); SR.log(S, `${SR.stat(id).name}'s garrison starves (a unit lost).`, ps.owner === S.humanClan ? "bad" : "info"); }
    else ps.castle = Math.max(0, ps.castle - 1);
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
    attMS: S.clans[attCid].ms, defMS: defCid ? S.clans[defCid].ms : 0,
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
 * INTERACTIVE SIEGE — the besieger chooses how to break a castle each
 * season: blockade & starve, bombard the walls, offer terms, or storm.
 * One order per season (storm/lift are always available). Reused by the
 * siege panel; the AI drives its own sieges via siegeTick.
 * ------------------------------------------------------------------- */
SR.siegeSeasonKey = S => S.year * 10 + S.seasonIdx;
/* A besieged garrison tracks Food (supply) and Will (spirit), each 0–6. Drive
 * either to zero and the town falls — starvation, or a loss of nerve. */
SR.siegeInit = function (sg) { if (sg.supply == null) sg.supply = 6; if (sg.spirit == null) sg.spirit = 6; };
SR.siegeStatus = function (S, id) {
  const ps = S.provinces[id], sg = ps.siege; if (!sg) return null;
  SR.siegeInit(sg);
  return {
    castle: ps.castle, garrison: ps.units.length, besiegers: (sg.army || []).length,
    trains: SR.countType(sg.army || [], "siege"), turns: sg.turns || 0,
    supply: sg.supply, spirit: sg.spirit,
    blockaded: !!sg.starve, actedThisSeason: sg.season === SR.siegeSeasonKey(S),
  };
};
/* The town capitulates — the besieger walks in. */
SR.siegeCapitulate = function (S, id, sg, attCid, honour) {
  const ps = S.provinces[id];
  ps.siege = null; ps.units = [];
  SR.occupy(S, id, sg.army, attCid, sg.fromId, sg.bringDaimyo);
  S.clans[attCid].prestige += 1;
  if (honour) S.clans[attCid].honour = SR.clamp(S.clans[attCid].honour + honour, 0, 20);
};
SR.siegeAction = function (S, id, action) {
  const ps = S.provinces[id], sg = ps.siege;
  if (!sg) return { ok: false, reason: "No siege here." };
  SR.siegeInit(sg);
  const attCid = sg.by, defCid = ps.owner, c = S.clans[attCid];
  const intr = (c && c.in) || 1;
  if (action === "lift") { SR.liftSiege(S, id); return { ok: true, lifted: true }; }
  if (action === "storm") { const report = SR.siegeAssault(S, id, true); return { ok: true, report }; }
  const key = SR.siegeSeasonKey(S);
  if (sg.season === key) return { ok: false, reason: "Your siege lines have already given their order this season." };
  // bribery is paid up front — check before committing the season
  if (action === "incite" && c.koban < 3) return { ok: false, reason: "Need 3 koban to buy agents inside the walls." };
  sg.season = key; sg.turns = (sg.turns || 0) + 1;
  const lines = [];
  // a besieged town always eats into its stores
  sg.supply = Math.max(0, sg.supply - 1);

  if (action === "starve") {
    sg.starve = true; sg.supply = Math.max(0, sg.supply - 1);
    lines.push(`You tighten the blockade of ${SR.stat(id).name} — its storehouses run low (Food ${sg.supply}/6).`);
  } else if (action === "bombard") {
    const trains = SR.countType(sg.army, "siege");
    const great = SR.stat(id).feature === "great_castle" || defCid === "hojo";
    let reduce = trains > 0 ? 1 + (trains > 1 ? 1 : 0) : (SR.chance(0.4) ? 1 : 0);
    if (great) reduce = Math.max(0, reduce - 1);
    if (reduce > 0) { ps.castle = Math.max(0, ps.castle - reduce); sg.spirit = Math.max(0, sg.spirit - 1); lines.push(`Your guns pound the walls of ${SR.stat(id).name} — castle now level ${ps.castle}.`); }
    else lines.push(trains > 0 ? `The great walls shrug off today's fire.` : `Without siege trains your bombardment does little — bring siege weapons.`);
  } else if (action === "mine") {
    // sappers tunnel under the walls — no siege train needed, but chancy
    const r = Math.random();
    if (r < 0.15) { ps.castle = Math.max(0, ps.castle - 2); sg.spirit = Math.max(0, sg.spirit - 1); lines.push(`The mine fires — a whole section of wall collapses in smoke and thunder! (castle now ${ps.castle})`); }
    else if (r < 0.55) { ps.castle = Math.max(0, ps.castle - 1); lines.push(`Your sappers bring down a stretch of wall (castle now ${ps.castle}).`); }
    else if (r < 0.68) { if (sg.army.length > 1) sg.army.pop(); lines.push(`The tunnel floods and collapses — you lose a party of sappers.`); }
    else lines.push(`The sappers dig on beneath ${SR.stat(id).name}; the earth is stubborn.`);
  } else if (action === "poison") {
    // foul the wells — brutal and dishonourable
    sg.supply = Math.max(0, sg.supply - 2); sg.spirit = Math.max(0, sg.spirit - 1);
    c.honour = SR.clamp(c.honour - 2, 0, 20); c.treachery = (c.treachery || 0) + 1;
    if (ps.units.length && SR.chance(0.4)) { ps.units.pop(); lines.push(`Poison in the wells of ${SR.stat(id).name} — sickness sweeps the garrison and a unit dies. (−2 Honour)`); }
    else lines.push(`You foul the town's water. Thirst and sickness gnaw at the defenders. (−2 Honour)`);
  } else if (action === "rumours") {
    // agents spread despair — scales with your Intrigue
    const d = 1 + (intr >= 3 ? 1 : 0) + (intr >= 5 ? 1 : 0);
    sg.spirit = Math.max(0, sg.spirit - d);
    lines.push(`Your agents whisper of doom through ${SR.stat(id).name} — the garrison's will falters (Will ${sg.spirit}/6).`);
  } else if (action === "incite") {
    c.koban -= 3;
    const chance = Math.min(0.9, 0.15 + (6 - sg.spirit) / 6 * 0.4 + (6 - sg.supply) / 6 * 0.15 + intr * 0.05);
    if (SR.chance(chance)) {
      if (sg.spirit <= 1 || ps.castle === 0 || SR.chance(0.4)) {
        lines.push(`Bribed officers throw open the gates of ${SR.stat(id).name}! The town is yours.`);
        SR.siegeCapitulate(S, id, sg, attCid, 0);
        SR.log(S, `${c.name} suborns the garrison of ${SR.stat(id).name} — the gates open!`, attCid === S.humanClan ? "good" : "info");
        return { ok: true, surrender: true, lines };
      }
      const loss = Math.min(ps.units.length, 1 + (SR.chance(0.5) ? 1 : 0));
      for (let i = 0; i < loss; i++) ps.units.pop();
      sg.spirit = Math.max(0, sg.spirit - 2);
      lines.push(`Desertion! ${loss} unit${loss > 1 ? "s slip" : " slips"} out of ${SR.stat(id).name} in the night, and the rest lose heart.`);
    } else lines.push(`Your agents are caught and hanged from the walls — the bribe (3 koban) is wasted.`);
  } else if (action === "terms") {
    const chance = Math.min(0.95, 0.1 + (6 - sg.supply) / 6 * 0.4 + (6 - sg.spirit) / 6 * 0.3 + (ps.castle === 0 ? 0.2 : 0) + (SR.honourBand && SR.honourBand(c.honour).min >= 10 ? 0.08 : 0));
    if (SR.chance(chance)) {
      lines.push(`The garrison of ${SR.stat(id).name} accepts honourable terms and opens the gates! (+Prestige, +Honour)`);
      SR.siegeCapitulate(S, id, sg, attCid, 1);
      SR.log(S, `${c.name} negotiates the surrender of ${SR.stat(id).name}.`, attCid === S.humanClan ? "good" : "info");
      return { ok: true, surrender: true, lines };
    }
    lines.push(`The defenders of ${SR.stat(id).name} refuse your terms and hold fast.`);
  }

  // consequences of an empty larder or a broken will
  if (sg.supply <= 0 && ps.units.length) { ps.units.pop(); lines.push(`Starvation grips ${SR.stat(id).name} — a unit of the garrison perishes.`); }
  if (sg.spirit <= 0) {
    lines.push(`Their will broken, the garrison of ${SR.stat(id).name} lays down its arms!`);
    SR.siegeCapitulate(S, id, sg, attCid, 0);
    SR.log(S, `The garrison of ${SR.stat(id).name} surrenders to ${c.name}.`, attCid === S.humanClan ? "good" : "info");
    return { ok: true, surrender: true, lines };
  }
  if (ps.castle <= 0 && ps.units.length) lines.push(`The walls are breached — storm the town to take it.`);
  else if (ps.castle <= 0 && !ps.units.length) { SR.siegeCapitulate(S, id, sg, attCid, 0); lines.push(`${SR.stat(id).name} falls — no walls, no garrison left to hold it.`); return { ok: true, surrender: true, lines }; }
  SR.log(S, lines[0] || "The siege grinds on.", "info");
  return { ok: true, lines };
};

/* A sortie: the besieged garrison sallies out to break the siege. Auto-resolved
 * (a surprise on the besiegers); win → siege broken, lose → thrown back inside. */
SR.siegeSortie = function (S, id) {
  const ps = S.provinces[id], sg = ps.siege; if (!sg) return { ok: false, reason: "No siege here." };
  const defCid = ps.owner, attCid = sg.by;
  const garrison = ps.units.slice(), besiegers = (sg.army || []).slice();
  if (!garrison.length) return { ok: false, reason: "No garrison to sortie with." };
  const daimyoHere = S.clans[defCid].daimyoAlive && S.clans[defCid].daimyoLoc === id;
  const res = SR.simulateBattle({
    attUnits: garrison, defUnits: besiegers,
    attCmd: daimyoHere ? S.clans[defCid].command : 1, defCmd: sg.bringDaimyo ? S.clans[attCid].command : 1,
    attTrait: S.clans[defCid].trait, defTrait: S.clans[attCid] ? S.clans[attCid].trait : "",
    attMS: S.clans[defCid].ms, defMS: S.clans[attCid] ? S.clans[attCid].ms : 0,
    terrain: SR.stat(id).terrain, weather: S.weather, surprise: true,
  });
  const report = { outcome: "", sim: res, terrain: SR.stat(id).terrain, toId: id, attCid: defCid, defCid: attCid,
    attStart: garrison.length, defStart: besiegers.length, sortie: true };
  if (res.winner === "att") {
    ps.units = res.attSurv; S.clans[defCid].prestige += 2;
    const home = S.provinces[sg.fromId]; if (home && home.owner === attCid) home.units.push(...res.defSurv);
    ps.siege = null;
    report.outcome = "attWin"; report.postText = `The sortie shatters the besiegers — the siege of ${SR.stat(id).name} is broken!`;
    SR.log(S, `${S.clans[defCid].name}'s sortie breaks the siege of ${SR.stat(id).name}!`, defCid === S.humanClan ? "good" : "info");
  } else {
    ps.units = res.attSurv; sg.army = res.defSurv;
    report.outcome = "defWin"; report.postText = `The sortie from ${SR.stat(id).name} is thrown back; the siege tightens.`;
    SR.log(S, `${S.clans[defCid].name}'s sortie from ${SR.stat(id).name} is repulsed.`, defCid === S.humanClan ? "bad" : "info");
  }
  return { ok: true, report };
};

/* The defender's siege orders: hold the walls, ration the stores, rally the
 * garrison, sally out, or surrender the town. One order per season (sortie /
 * surrender are always available). */
SR.defenseSiegeAction = function (S, id, action) {
  const ps = S.provinces[id], sg = ps.siege;
  if (!sg) return { ok: false, reason: "Not under siege." };
  SR.siegeInit(sg);
  const defCid = ps.owner, c = S.clans[defCid];
  if (action === "sortie") return SR.siegeSortie(S, id);
  if (action === "surrender") {
    const attCid = sg.by;
    SR.siegeCapitulate(S, id, sg, attCid, 0);
    c.honour = SR.clamp(c.honour - 1, 0, 20);
    SR.log(S, `${c.name} surrenders ${SR.stat(id).name} to ${S.clans[attCid] ? S.clans[attCid].name : "the besiegers"}.`, "bad");
    return { ok: true, surrendered: true, lines: [`You yield ${SR.stat(id).name} to end the siege. (−1 Honour)`] };
  }
  const key = SR.siegeSeasonKey(S);
  if (sg.defSeason === key) return { ok: false, reason: "Your garrison has already acted this season." };
  if (action === "rally" && c.koban < 2) return { ok: false, reason: "Need 2 koban to rally the garrison." };
  sg.defSeason = key;
  const lines = [];
  if (action === "hold") {
    const disc = SR.countType(ps.units, "samurai") > 0 || (c.daimyoAlive && c.daimyoLoc === id) ? 1 : 0;
    sg.spirit = Math.min(6, sg.spirit + disc);
    lines.push(disc ? `Your samurai steady the garrison — spirits hold (Will ${sg.spirit}/6).` : `The garrison holds the walls and waits.`);
  } else if (action === "ration") {
    sg.supply = Math.min(6, sg.supply + 1); sg.spirit = Math.max(0, sg.spirit - 1);
    lines.push(`You put the town on short rations — food lasts longer, but hunger frays nerves (Food ${sg.supply}/6, Will ${sg.spirit}/6).`);
  } else if (action === "rally") {
    c.koban -= 2; sg.spirit = Math.min(6, sg.spirit + 2);
    lines.push(`Coin and fiery words rally the defenders (Will ${sg.spirit}/6).`);
  }
  SR.log(S, lines[0] || "The garrison endures.", "info");
  return { ok: true, lines };
};

/* ---------------------------------------------------------------------
 * PACIFY / RAZE
 * ------------------------------------------------------------------- */
SR.pacifyCost = function (S, id) {
  const pd = SR.stat(id); const ps = S.provinces[id];
  let cost = SR.stat(id).koku;
  if (pd.hard || ps.razed) cost *= 2;
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
