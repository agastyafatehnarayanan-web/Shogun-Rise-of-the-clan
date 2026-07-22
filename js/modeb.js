/* =====================================================================
 * Mode B — The House Divided.
 * You and 4-7 AI retainers all serve ONE clan. You hold fiefs, a personal
 * army & treasury, and Standing with the NPC lord. Outside rival clans
 * (the Threat deck) press the borders; meanwhile everyone schemes for the
 * succession, each with a secret Ambition. The lord's death is the climax.
 * Reuses the whole engine (economy, battle, espionage) with retainer
 * "clans" and an `invaders` pseudo-clan for external threats.
 * ===================================================================== */

DATA.retainerNames = ["Yamamoto", "Kōsaka", "Baba", "Naitō", "Anayama", "Oyamada", "Obu", "Akiyama"];
DATA.retainerCrests = ["山", "香", "馬", "内", "穴", "小", "飫", "秋"];
DATA.retainerColors = [
  ["#c0392b", "#7b1e17"], ["#2980b9", "#1b5680"], ["#8e44ad", "#5b2c6f"],
  ["#16a085", "#0e6a58"], ["#d35400", "#8a3600"], ["#7f8c8d", "#4d5657"],
  ["#c39b16", "#8a6d0e"], ["#2c3e50", "#1a252f"],
];
DATA.retainerTraits = ["Morale", "Cavalry", "Infantry", "Economy", "Siege & Defence", "Naval & Diplomacy"];
DATA.retainerIdentities = ["samurai", "cavalry", "ashigaru", "teppo", "siege", "archers"];

DATA.ambitions = [
  { key: "heir",     name: "The Heir-Maker",  hint: "Hold the most Standing at the succession.",
    text: "Whisper in the right ears. When the lord falls, the strongest voice at court decides the heir — and it will be yours." },
  { key: "land",     name: "The Land-Hungry", hint: "Personally hold the most valuable fief.",
    text: "Land is the only truth. Grow your holdings until no retainer's fief rivals yours." },
  { key: "merchant", name: "The Merchant Lord", hint: "Amass the largest personal treasury.",
    text: "Gold outlasts steel. Let others bleed; you will simply buy the peace that follows." },
  { key: "warlord",  name: "The Warlord",     hint: "Command the largest surviving house army.",
    text: "Swords settle everything. Keep the mightiest army in the house and let it be seen." },
  { key: "usurper",  name: "The Usurper (gekokujō)", hint: "Seize the lordship in the succession crisis.",
    text: "The low overthrow the high. Take the seat itself when the old lord dies." },
  { key: "fifth",    name: "The Fifth Column", hint: "Survive/defect intact if outsiders destroy the clan.",
    text: "You serve no house but your own. Should the clan fall, be the one still standing." },
  { key: "loyalist", name: "The Loyalist",    hint: "Keep the clan alive to the end AND keep high Honour.",
    text: "Honour above ambition. Hold the house together and keep your name clean to the last." },
];

DATA.directives = [
  { key: "koban",   text: "The lord demands koban for the war chest.", ask: 3, give: "koban" },
  { key: "rice",    text: "The lord's armies need rice for the campaign season.", ask: 3, give: "rice" },
  { key: "levy",    text: "The lord calls a levy — send a unit to the front.", ask: 1, give: "unit" },
  { key: "tribute", text: "An envoy from the capital expects a generous gift.", ask: 4, give: "koban" },
];

DATA.threats = [
  { name: "Uesugi raiders sweep down from the north", size: 4 },
  { name: "Hōjō probe the eastern marches", size: 5 },
  { name: "Oda vanguard tests the western border", size: 5 },
  { name: "Ikkō-ikki zealots rise in the interior", size: 4 },
  { name: "Tokugawa opportunists strike a border fief", size: 6 },
];

/* ---------------------------------------------------------------------
 * NEW GAME (Mode B)
 * ------------------------------------------------------------------- */
SR.newGameB = function (opts) {
  const houseClan = DATA.clans[opts.clan];
  const nRet = SR.clamp(opts.retainers || 5, 4, 7);

  const S = SR.newGameA({ clan: "takeda", lengthYears: opts.lengthYears || 6 }); // scaffold
  S.mode = "B";
  S.log = []; S.shogun = null;

  // wipe clans; rebuild as retainers of the chosen house
  S.clans = {};
  const provIds = Object.keys(S.provinces);
  SR.shuffle(provIds);

  const traits = SR.shuffle(DATA.retainerTraits.slice());
  const ids = SR.shuffle(DATA.retainerIdentities.slice());
  const ambitions = SR.shuffle(DATA.ambitions.map(a => a.key));

  const retainerIds = [];
  for (let i = 0; i < nRet; i++) {
    const rid = "r" + i;
    retainerIds.push(rid);
    S.clans[rid] = {
      id: rid, name: DATA.retainerNames[i] + " House",
      color: DATA.retainerColors[i][0], color2: DATA.retainerColors[i][1], crest: DATA.retainerCrests[i],
      daimyo: DATA.retainerNames[i] + " " + SR.pick(["Masayuki", "Nobufusa", "Toramasa", "Masatoyo", "Nobukimi"]),
      command: SR.rint(2, 3), trait: traits[i % traits.length], lean: "", identity: ids[i % ids.length],
      ms: (["cavalry", "samurai", "ashigaru"].includes(ids[i % ids.length]) ? 4 : 3),
      ec: 3, nv: 3, dp: 3, in: 3,
      isHuman: i === 0, isNeutral: false, alive: true,
      koban: 6, rice: 14, honour: 10, prestige: 0, courtRank: 0,
      agents: [], spymaster: false, daimyoLoc: null, daimyoAlive: true,
      relations: {}, marriages: [], vassals: [], overlord: null, treachery: 0,
      standing: SR.rint(1, 3), ambition: ambitions[i % ambitions.length], isRetainer: true, defected: false,
    };
  }
  // invaders pseudo-clan (external threats)
  S.clans.invaders = {
    id: "invaders", name: "Rival Clans", color: "#3b3b3b", color2: "#1a1a1a", crest: "敵",
    daimyo: "Warlord", command: 2, trait: "", lean: "", identity: "ashigaru",
    ms: 3, ec: 3, nv: 3, dp: 3, in: 3,
    isHuman: false, isNeutral: true, alive: true,
    koban: 0, rice: 0, honour: 5, prestige: 0, courtRank: 0,
    agents: [], spymaster: false, daimyoLoc: null, daimyoAlive: false,
    relations: {}, marriages: [], vassals: [], overlord: null, treachery: 0,
    standing: 0, ambition: null, isRetainer: false,
  };
  // relations among retainers
  const all = retainerIds.concat(["invaders"]);
  for (const a of all) for (const b of all) if (a !== b) S.clans[a].relations[b] = { pact: "none", years: 0, attitude: 0 };

  S.humanClan = "r0";

  // assign fiefs (divide all provinces among retainers)
  for (const id in S.provinces) {
    const ps = S.provinces[id];
    ps.owner = null; ps.units = []; ps.status = "neutral"; ps.unrest = 0; ps.siege = null; ps.buildings = {};
  }
  provIds.forEach((id, i) => {
    const rid = retainerIds[i % nRet];
    const ps = S.provinces[id];
    ps.owner = rid; ps.status = "pacified"; ps.unrest = 0;
  });
  // starting armies per fief + set daimyo location to the retainer's first fief
  for (const rid of retainerIds) {
    const fiefs = SR.clanProvinces(S, rid);
    S.clans[rid].daimyoLoc = fiefs[0];
    fiefs.forEach((id, i) => {
      const seat = i === 0;
      const base = seat ? ["ashigaru", "ashigaru", "samurai", S.clans[rid].identity] : ["ashigaru", "ashigaru"];
      base.forEach(t => S.provinces[id].units.push(SR.mkUnit(t)));
    });
  }

  // Mode B meta
  S.modeB = {
    house: houseClan.name, houseClan: opts.clan,
    lordName: houseClan.daimyo, lordAlive: true,
    lordClock: (opts.lengthYears || 6),         // natural death at the last year
    retainers: retainerIds,
    directive: null, directiveAsked: false,
    threatsThisGame: 0, collapsed: false,
  };

  S.order = SR.shuffle(retainerIds.slice());
  SR.applyMineFlags(S);
  SR.state = S;
  SR.log(S, `The House of ${houseClan.name} stands divided. ${nRet} retainers hold its fiefs — and each keeps a secret.`, "season");
  return S;
};

/* ---------------------------------------------------------------------
 * MODE B SEASON HOOKS — called by main.js around beginSeason.
 * ------------------------------------------------------------------- */
SR.modeBSeasonStart = function (S) {
  const M = S.modeB;
  // Threat each Spring (and sometimes Summer)
  if (DATA.seasons[S.seasonIdx] === "Spring" || (DATA.seasons[S.seasonIdx] === "Summer" && SR.chance(0.4))) {
    SR.modeBThreat(S);
  }
  // Lord natural death at start of the final year → succession
  if (M.lordAlive && S.year >= M.lordClock && DATA.seasons[S.seasonIdx] === "Spring") {
    SR.modeBLordDies(S, `${M.lordName} dies of illness after a long reign.`);
  }
  // Set the lord's directive for the season (if lord alive)
  if (M.lordAlive) {
    M.directive = SR.pick(DATA.directives);
    M.directiveAsked = false;
  } else {
    M.directive = null;
  }
};

/* Spawn an external incursion: flip a border fief to the invaders. */
SR.modeBThreat = function (S) {
  const M = S.modeB;
  const th = SR.pick(DATA.threats);
  // choose a fief held by a retainer, prefer one adjacent to an already-invaded/edge
  const fiefs = Object.keys(S.provinces).filter(id => {
    const o = S.provinces[id].owner; return o && S.clans[o] && S.clans[o].isRetainer;
  });
  if (!fiefs.length) return;
  // prefer border fiefs (adjacent to invader/neutral)
  fiefs.sort((a, b) => SR.borderness(S, b) - SR.borderness(S, a));
  const target = fiefs[SR.rint(0, Math.min(2, fiefs.length - 1))];
  const ps = S.provinces[target];
  const size = th.size + Math.floor(S.year / 2);
  ps.owner = "invaders"; ps.status = "occupied"; ps.units = [];
  for (let i = 0; i < size; i++) ps.units.push(SR.mkUnit(i % 3 === 0 ? "samurai" : "ashigaru"));
  ps.siege = null; ps.unrest = 0;
  M.threatsThisGame += 1;
  SR.log(S, `THREAT — ${th.name}: ${SR.stat(target).name} is overrun! The house must retake it.`, "bad");
};
SR.borderness = function (S, id) {
  return SR.stat(id).adj.filter(a => {
    const o = S.provinces[a].owner; return o === "invaders" || !o;
  }).length;
};

/* Invaders act each season (simple aggression). Deferred vs human. */
SR.modeBInvaderTurn = function (S) {
  S.pendingDefenses = S.pendingDefenses || [];
  for (const fromId of SR.clanProvinces(S, "invaders")) {
    const movable = SR.movableUnits(S, fromId);
    if (!movable.length) continue;
    const myPow = SR.armyPower(movable);
    const targets = SR.stat(fromId).adj.filter(a => {
      const o = S.provinces[a].owner; return o && S.clans[o] && S.clans[o].isRetainer;
    });
    let best = null, bs = -1e9;
    for (const t of targets) {
      const q = S.provinces[t];
      const sc = myPow - (SR.armyPower(q.units) + q.castle * 2) * 1.1 + SR.stat(t).koku;
      if (sc > bs) { bs = sc; best = t; }
    }
    if (best && bs > -2) {
      const uids = movable.map(u => u.uid);
      const opts = { surprise: SR.chance(0.3), postureA: "Line" };
      if (S.provinces[best].owner === S.humanClan) {
        S.pendingDefenses.push({ fromId, toId: best, uids, attCid: "invaders", opts });
        movable.forEach(u => S.movedUnits[u.uid] = true);
      } else {
        SR.executeAttack(S, fromId, best, uids, "invaders", opts);
      }
    }
  }
};

/* Percentage of the map held by invaders (collective danger meter). */
SR.modeBInvaderShare = function (S) {
  const total = Object.keys(S.provinces).length;
  return SR.clanProvinces(S, "invaders").length / total;
};

/* ---------------------------------------------------------------------
 * DIRECTIVES — the lord asks; retainers contribute or refuse.
 * ------------------------------------------------------------------- */
SR.modeBContribute = function (S, rid, contribute) {
  const M = S.modeB; const d = M.directive; if (!d) return { ok: false };
  const c = S.clans[rid];
  if (contribute) {
    let paid = false;
    if (d.give === "koban" && c.koban >= d.ask) { c.koban -= d.ask; paid = true; }
    else if (d.give === "rice" && c.rice >= d.ask) { c.rice -= d.ask; paid = true; }
    else if (d.give === "unit") {
      const fief = SR.clanProvinces(S, rid).find(id => S.provinces[id].units.length > 0);
      if (fief) { S.provinces[fief].units.pop(); paid = true; }
    }
    if (paid) {
      c.standing += 2; c.honour = SR.clamp(c.honour + (SR.chance(0.4) ? 1 : 0), 0, 20);
      if (rid === S.humanClan) SR.log(S, `You answer the lord's call (+2 Standing).`, "good");
      return { ok: true, contributed: true };
    }
    // couldn't pay
    c.standing = Math.max(0, c.standing - 1);
    return { ok: true, contributed: false, reason: "You lacked the means — the lord notes it (−1 Standing)." };
  } else {
    c.standing = Math.max(0, c.standing - 2);
    if (SR.chance(0.3)) c.honour = SR.clamp(c.honour - 1, 0, 20);
    if (rid === S.humanClan) SR.log(S, `You refuse the lord's directive (−2 Standing, risk of disloyalty).`, "info");
    return { ok: true, contributed: false };
  }
};
/* AI retainers auto-answer the directive. */
SR.modeBAIDirectives = function (S) {
  const M = S.modeB; if (!M.directive) return;
  for (const rid of M.retainers) {
    if (rid === S.humanClan) continue;
    const c = S.clans[rid];
    // loyalists/heir-makers usually contribute; usurpers/fifth-column often refuse
    let p = 0.6;
    if (["loyalist", "heir"].includes(c.ambition)) p = 0.9;
    if (["usurper", "fifth", "merchant"].includes(c.ambition)) p = 0.35;
    SR.modeBContribute(S, rid, SR.chance(p));
  }
};

/* ---------------------------------------------------------------------
 * LORD DEATH & SUCCESSION CRISIS (the climax)
 * ------------------------------------------------------------------- */
SR.modeBLordDies = function (S, reason) {
  const M = S.modeB;
  if (!M.lordAlive) return;
  M.lordAlive = false; M.deathReason = reason;
  SR.log(S, `THE LORD IS DEAD — ${reason} The succession crisis begins!`, "season");
};

SR.retainerPower = function (S, rid) {
  const army = SR.sum(SR.clanProvinces(S, rid), id => SR.armyPower(S.provinces[id].units));
  const land = SR.sum(SR.clanProvinces(S, rid), id => SR.stat(id).koku + SR.provincePrestige(id));
  return { army, land, standing: S.clans[rid].standing,
    power: army + land + S.clans[rid].standing * 3 };
};

SR.modeBSuccession = function (S) {
  const M = S.modeB;
  const living = M.retainers.filter(r => S.clans[r].alive);
  const ranked = living.map(r => ({ r, ...SR.retainerPower(S, r) }))
    .sort((a, b) => b.power - a.power);
  M.successionRank = ranked;
  let successor, mode;
  if (ranked.length && (ranked.length === 1 || ranked[0].power > ranked[1].power * 1.4)) {
    successor = ranked[0].r; mode = "settlement";
    SR.log(S, `${S.clans[successor].name} dominates the council — a negotiated settlement names them lord.`, "season");
  } else {
    // civil war — weighted random by power
    const totalP = SR.sum(ranked, x => x.power);
    let roll = Math.random() * totalP, pick = ranked[0];
    for (const x of ranked) { roll -= x.power; if (roll <= 0) { pick = x; break; } }
    successor = pick.r; mode = "civil war";
    SR.log(S, `No one dominates — the house tears itself apart. ${S.clans[successor].name} emerges from the civil war as lord.`, "season");
    // civil war casualties: losers lose some army
    for (const x of ranked) if (x.r !== successor) {
      const fiefs = SR.clanProvinces(S, x.r).filter(id => S.provinces[id].units.length);
      if (fiefs.length && SR.chance(0.7)) S.provinces[SR.pick(fiefs)].units.pop();
    }
  }
  M.successor = successor; M.successionMode = mode;
  return { successor, mode, ranked };
};

/* Evaluate ambitions and produce the final ranking / winner. */
SR.modeBResolve = function (S, collapsed) {
  const M = S.modeB;
  const living = M.retainers.filter(r => S.clans[r].alive);
  if (!M.successor && !collapsed) SR.modeBSuccession(S);

  // metric leaders
  const leaderBy = (fn) => {
    let best = -Infinity, w = null;
    for (const r of living) { const v = fn(r); if (v > best) { best = v; w = r; } }
    return w;
  };
  const standingLeader = leaderBy(r => S.clans[r].standing);
  const landLeader = leaderBy(r => SR.sum(SR.clanProvinces(S, r), id => SR.stat(id).koku + SR.provincePrestige(id)));
  const richLeader = leaderBy(r => S.clans[r].koban);
  const warLeader = leaderBy(r => SR.sum(SR.clanProvinces(S, r), id => SR.armyPower(S.provinces[id].units)));

  const achieved = {};
  for (const r of M.retainers) {
    const c = S.clans[r]; if (!c.alive && c.ambition !== "fifth") { achieved[r] = false; continue; }
    switch (c.ambition) {
      case "heir": achieved[r] = (standingLeader === r); break;
      case "land": achieved[r] = (landLeader === r); break;
      case "merchant": achieved[r] = (richLeader === r); break;
      case "warlord": achieved[r] = (warLeader === r); break;
      case "usurper": achieved[r] = (M.successor === r); break;
      case "fifth": achieved[r] = collapsed && (c.alive || c.defected); break;
      case "loyalist": achieved[r] = !collapsed && c.alive && SR.honourBand(c.honour).min >= 13; break;
      default: achieved[r] = false;
    }
  }
  M.achieved = achieved;

  // rank: achieved first, then by (standing + power)
  const scoreOf = (r) => (achieved[r] ? 1000 : 0) + S.clans[r].standing * 5 + SR.retainerPower(S, r).power +
    (M.successor === r ? 50 : 0);
  const ranking = M.retainers.slice().sort((a, b) => scoreOf(b) - scoreOf(a));
  M.finalRanking = ranking.map(r => ({
    r, name: S.clans[r].name, ambition: DATA.ambitions.find(a => a.key === S.clans[r].ambition),
    achieved: achieved[r], standing: S.clans[r].standing, power: Math.round(SR.retainerPower(S, r).power),
    isHuman: r === S.humanClan,
  }));

  S.gameOver = true;
  S.winner = ranking[0];
  S.modeBCollapsed = collapsed;
  const human = S.clans[S.humanClan];
  S.humanAchieved = achieved[S.humanClan];
  S.endReason = collapsed
    ? `The House of ${M.house} was overrun by outsiders.`
    : `${S.clans[M.successor] ? S.clans[M.successor].name : "A new lord"} takes the seat by ${M.successionMode}.`;
  SR.log(S, `GAME OVER — the succession is resolved.`, "season");
  return M.finalRanking;
};

if (typeof module !== "undefined") module.exports = SR;
