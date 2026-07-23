/* =====================================================================
 * State: new-game construction + shared helper functions.
 * A single global `SR` namespace holds runtime helpers; `DATA` is static.
 * ===================================================================== */

const SR = {};
SR.state = null;          // the live game state
let _uid = 1;
SR.uid = () => _uid++;

/* ---- tiny utilities ------------------------------------------------ */
SR.rint = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;      // inclusive
SR.chance = (p) => Math.random() < p;
SR.pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
SR.clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
SR.sum = (arr, f) => arr.reduce((a, x) => a + (f ? f(x) : x), 0);
SR.shuffle = (arr) => { for (let i = arr.length - 1; i > 0; i--) { const j = SR.rint(0, i); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; };

/* ---- unit factory -------------------------------------------------- */
SR.mkUnit = (type) => ({ uid: SR.uid(), type });

/* ---------------------------------------------------------------------
 * NEW GAME (Mode A) — the standard rival-warlords game.
 * opts: { clan, lengthYears }
 * ------------------------------------------------------------------- */
SR.newGameA = function (opts) {
  const S = {
    mode: "A",
    year: 1, seasonIdx: 0, lengthYears: opts.lengthYears || 6,
    weather: { winter: false, typhoon: false, rain: false },
    flags: {},
    provinces: {}, clans: {},
    humanClan: opts.clan,
    order: [], shogun: null,
    log: [], eventCard: null,
    selected: null, gameOver: false, winner: null,
    turnClan: null, actionsThisSeason: 0,
    movedUnits: {},          // uid -> true, reset each season
  };

  // Build province states.
  for (const id in DATA.provinces) {
    const p = DATA.provinces[id];
    S.provinces[id] = {
      id, owner: null, castle: p.castle, units: [], buildings: {},
      status: "neutral", unrest: 0, pacifying: false, pacifyCost: 0,
      razed: false, siege: null, hasMine: false, bonusKoku: 0,
    };
  }

  // Build clans.
  for (const cid in DATA.clans) {
    const c = DATA.clans[cid];
    S.clans[cid] = {
      id: cid, name: c.name, color: c.color, color2: c.color2, crest: c.crest,
      daimyo: c.daimyo, command: c.command, trait: c.trait, lean: c.lean, identity: c.identity,
      ms: c.ms, ec: c.ec, nv: c.nv, dp: c.dp, in: c.in,
      isHuman: cid === opts.clan, isNeutral: false, alive: true,
      koban: 9, rice: 12, honour: 10, prestige: 0, courtRank: 0,
      agents: [], spymaster: false,
      daimyoLoc: c.homes[0], daimyoAlive: true,
      relations: {}, marriages: [], vassals: [], overlord: null, treachery: 0,
      standing: 0, ambition: null, isRetainer: false, defected: false,
    };
    // give home provinces
    c.homes.forEach((h, i) => {
      const ps = S.provinces[h];
      ps.owner = cid; ps.status = "pacified"; ps.unrest = 0;
    });
  }
  // relations default
  for (const a in S.clans) for (const b in S.clans) if (a !== b)
    S.clans[a].relations[b] = { pact: "none", years: 0, attitude: 0 };

  // Starting forces per clan.
  for (const cid in DATA.clans) {
    const c = DATA.clans[cid];
    const home = S.provinces[c.homes[0]];
    const force = ["ashigaru", "ashigaru", "ashigaru", "samurai", c.identity];
    force.forEach(t => home.units.push(SR.mkUnit(t)));
    // second home (Takeda Shinano) gets a small garrison
    if (c.homes[1]) S.provinces[c.homes[1]].units.push(SR.mkUnit("ashigaru"));
  }

  // Independent / neutral garrisons (Δ38): (Castle+1) Ashigaru, +2 if Hard
  // to pacify. Kyoto, the great prize, keeps a couple of samurai.
  for (const id in S.provinces) {
    const ps = S.provinces[id]; const pd = DATA.provinces[id];
    if (ps.owner) continue;
    ps.status = "neutral";
    const n = ps.castle + 1 + (pd.hard ? 2 : 0);
    for (let i = 0; i < n; i++) ps.units.push(SR.mkUnit("ashigaru"));
    if (pd.kyoto) { ps.units.push(SR.mkUnit("samurai")); ps.units.push(SR.mkUnit("samurai")); }
    ps.unrest = 0;
  }

  // Initiative: random for year 1.
  S.order = SR.shuffle(Object.keys(S.clans));
  SR.state = S;
  SR.applyMineFlags(S);
  return S;
};

/* ---------------------------------------------------------------------
 * HELPERS shared by engine / battle / ai / ui.
 * ------------------------------------------------------------------- */
SR.stat = (id) => DATA.provinces[id];

SR.clanProvinces = (S, cid) =>
  Object.keys(S.provinces).filter(id => S.provinces[id].owner === cid);

SR.pacifiedProvinces = (S, cid) =>
  SR.clanProvinces(S, cid).filter(id => S.provinces[id].status === "pacified");

SR.honourBand = (h) => DATA.honourBands.find(b => h >= b.min && h <= b.max) || DATA.honourBands[0];

/* Access checks based on controlled provinces + clan identity.
 * Gun access: Owari, Settsu, Kii, Bungo, Satsuma (province.gun) — or
 * Oda / Shimazu anywhere. Horse access: Kai, Shinano, Mutsu
 * (province.horse) — or Takeda anywhere. */
SR.hasGunAccess = function (S, cid) {
  if (cid === "oda" || cid === "shimazu") return true;
  return SR.clanProvinces(S, cid).some(id => SR.stat(id).gun);
};
SR.hasHorseAccess = function (S, cid) {
  if (cid === "takeda") return true;
  return SR.clanProvinces(S, cid).some(id => SR.stat(id).horse);
};
SR.provinceHasSea = (id) => { const p = SR.stat(id); return p.terrain === "Coast" || p.minorCoast; };
SR.provinceIsPort = function (S, id) {
  const f = SR.stat(id).feature;
  return SR.provinceHasSea(id) && (S.provinces[id].buildings.port ||
    f === "naval_base" || f === "free_port" || f === "foreign_trade" || f === "foreign_port");
};
SR.hasSeaAccess = function (S, cid) {
  return SR.clanProvinces(S, cid).some(id => SR.provinceIsPort(S, id));
};

/* Can this clan recruit `type`? returns {ok, reason}. */
SR.canRecruit = function (S, cid, type) {
  const u = DATA.units[type];
  if (u.needs === "gun" && !SR.hasGunAccess(S, cid)) return { ok: false, reason: "No gun access (need Owari / Settsu / Kii / Bungo / Satsuma)." };
  if (u.needs === "horse" && !SR.hasHorseAccess(S, cid)) return { ok: false, reason: "No horse country (need Kai / Shinano / Mutsu)." };
  if (u.needs === "sea" && !SR.hasSeaAccess(S, cid)) return { ok: false, reason: "No Port with sea access to build ships." };
  return { ok: true };
};

/* Adjusted recruit cost (koban/rice), accounting for the province's own
 * feature discounts, the clan's Navy axis, and events. If provId is given
 * the discount is that province's; otherwise the best the clan can reach. */
SR.recruitCost = function (S, cid, type, provId) {
  const base = DATA.units[type].cost;
  const cost = { koban: base.koban || 0, rice: base.rice || 0 };
  const c = S.clans[cid];
  const feats = provId ? [SR.stat(provId).feature]
    : SR.clanProvinces(S, cid).map(id => SR.stat(id).feature);
  const has = (f) => feats.includes(f);

  if (type === "cavalry" && has("horse_land")) cost.koban -= 1;          // Kai
  if (type === "samurai" && has("swordsmiths")) cost.koban -= 1;         // Bizen
  if (type === "samurai" && has("elite_infantry")) cost.koban = Math.min(cost.koban, 2); // Echigo
  if (type === "ashigaru" && has("hardy_levies")) cost.koban = 0;        // Mikawa (1 rice only)
  if (type === "warship") {
    if (has("naval_base") || has("pirate_haven")) cost.koban -= 1;       // Aki / Tosa
    cost.koban -= (c.nv - 3);                                            // Navy axis
  }
  if (type === "teppo" && S.flags.cheapGuns) cost.koban -= 1;
  cost.koban = Math.max(0, cost.koban);
  return cost;
};

/* Total rice upkeep of a clan's armies (per season, doubled in winter). */
SR.upkeep = function (S, cid) {
  let up = 0;
  for (const id of SR.clanProvinces(S, cid))
    for (const u of S.provinces[id].units) up += DATA.units[u.type].upkeep;
  // besieging armies sitting in enemy provinces still cost upkeep
  for (const id in S.provinces) {
    const ps = S.provinces[id];
    if (ps.siege && ps.siege.by === cid)
      for (const u of ps.siege.army || []) up += DATA.units[u.type].upkeep;
  }
  if (S.weather.winter) up *= 2;
  return up;
};

/* Rough army power for AI / display. */
SR.armyPower = function (units, role) {
  return SR.sum(units, u => {
    const d = DATA.units[u.type];
    return role === "def" ? d.def : role === "atk" ? d.atk : (d.atk + d.def) / 2;
  });
};

SR.daimyoCommand = function (S, cid, provId) {
  const c = S.clans[cid];
  if (c && c.daimyoAlive && c.daimyoLoc === provId) return c.command;
  return 1; // a lesser general
};

/* Supply BFS: is `provId` (holding a `cid` army) in supply?
 * Trace ≤4 steps through owned/allied provinces to a supply source
 * (pacified province with market/port/castle≥1). */
SR.inSupply = function (S, provId, cid) {
  const ps = S.provinces[provId];
  const isSource = (id) => {
    const q = S.provinces[id];
    if (!q) return false;
    if (q.owner !== cid && !SR.allied(S, cid, q.owner)) return false;
    if (q.status !== "pacified" && q.status !== "home") return false;
    return q.buildings.market || q.buildings.port || q.castle >= 1;
  };
  const passable = (id) => {
    const q = S.provinces[id];
    return q.owner === cid || SR.allied(S, cid, q.owner);
  };
  if (isSource(provId)) return true;
  const seen = { [provId]: 0 };
  const queue = [provId];
  while (queue.length) {
    const cur = queue.shift();
    const dist = seen[cur];
    if (dist >= 4) continue;
    for (const nb of SR.stat(cur).adj) {
      if (nb in seen) continue;
      if (!passable(nb)) continue;
      seen[nb] = dist + 1;
      if (isSource(nb)) return true;
      queue.push(nb);
    }
  }
  return false;
};

SR.allied = function (S, a, b) {
  if (!a || !b || a === b) return a === b;
  const r = S.clans[a] && S.clans[a].relations[b];
  return r && (r.pact === "alliance" || r.pact === "marriage");
};

/* Fog of war: may clan `cid` see the true garrison of province `id`?
 * Own / allied / neutral (public) / recon-revealed. Shared by the client
 * (display) and the multiplayer server (per-player redaction). */
SR.visibleTo = function (S, cid, id) {
  const ps = S.provinces[id];
  if (!ps.owner) return true;                 // neutral garrisons are public
  if (ps.owner === cid) return true;
  if (SR.allied(S, cid, ps.owner)) return true;
  if (ps._revealed && SR.absSeason && ps._revealed >= SR.absSeason(S)) return true;
  return false;
};
SR.atPeace = function (S, a, b) {
  if (!a || !b) return false;
  const r = S.clans[a] && S.clans[a].relations[b];
  return r && ["nap", "alliance", "marriage", "trade"].includes(r.pact);
};

/* Set hasMine flags where a mine works building sits on a mineral feature. */
SR.applyMineFlags = function (S) {
  for (const id in S.provinces) {
    const f = SR.stat(id).feature;
    S.provinces[id].hasMine = !!(S.provinces[id].buildings.mine &&
      (f === "silver" || f === "gold"));
  }
};

/* Territory / power leader (for anti-runaway + AI targeting). */
SR.livingClans = (S) => Object.keys(S.clans).filter(c => S.clans[c].alive && !S.clans[c].isNeutral);
SR.prestigeLeader = function (S) {
  let best = null, bv = -1e9;
  for (const c of SR.livingClans(S)) {
    const v = SR.scoreTotal(S, c).total;
    if (v > bv) { bv = v; best = c; }
  }
  return best;
};

/* Log helper. */
SR.log = function (S, msg, kind) {
  S.log.unshift({ t: `Y${S.year} ${DATA.seasons[S.seasonIdx]}`, msg, kind: kind || "info" });
  if (S.log.length > 200) S.log.pop();
};

if (typeof module !== "undefined") module.exports = SR;
