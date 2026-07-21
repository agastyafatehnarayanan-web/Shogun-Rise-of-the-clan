/* =====================================================================
 * SHŌGUN: RISE OF THE CLANS  —  Static game data
 * Provinces, clans, unit types, buildings, events.
 * Numbers follow the rulebook (v1.0) with light tuning for a 16-province
 * "tighter game" as suggested in Appendix B.
 * ===================================================================== */

const DATA = {};

/* ---------------------------------------------------------------------
 * TERRAIN — sets battle frontage (how many units can fight at once) and
 * a small defensive character. Narrow terrain lets a few hold a pass;
 * plains let numbers tell.
 * ------------------------------------------------------------------- */
DATA.terrain = {
  Plains:   { frontage: 99, cavalry: 1.0,  defBonus: 0,  label: "Plains" },
  Hills:    { frontage: 5,  cavalry: 0.7,  defBonus: 2,  label: "Hills" },
  Mountain: { frontage: 3,  cavalry: 0.4,  defBonus: 4,  label: "Mountain" },
  Forest:   { frontage: 4,  cavalry: 0.5,  defBonus: 3,  label: "Forest" },
  Coast:    { frontage: 7,  cavalry: 0.9,  defBonus: 1,  label: "Coast" },
  River:    { frontage: 4,  cavalry: 0.7,  defBonus: 2,  label: "River" },
};

/* ---------------------------------------------------------------------
 * UNIT TYPES — physical characteristics, not counter-tables.
 * cost: koban / rice.  upkeep: rice per season.
 * ------------------------------------------------------------------- */
DATA.units = {
  ashigaru: {
    name: "Ashigaru", short: "足", atk: 2, def: 3, move: 1, upkeep: 1,
    cost: { koban: 1, rice: 1 }, glyph: "足",
    tags: ["cheap", "deep"],
    desc: "Peasant levy. Cheap; can form a Deep line that soaks up a charge — but slow and narrow.",
  },
  samurai: {
    name: "Samurai", short: "侍", atk: 4, def: 4, move: 1, upkeep: 1,
    cost: { koban: 3, rice: 1 }, glyph: "侍",
    tags: ["morale"],
    desc: "Warrior nobility. High value, steadies morale, strong in a long grind.",
  },
  cavalry: {
    name: "Cavalry", short: "騎", atk: 5, def: 3, move: 2, upkeep: 2,
    cost: { koban: 4 }, glyph: "騎", needs: "horse",
    tags: ["shock", "fast"],
    desc: "Mounted shock. Huge on first contact, then spent. Deadly in the open, wasted in a pass.",
  },
  archers: {
    name: "Archers", short: "弓", atk: 3, def: 2, move: 1, upkeep: 1,
    cost: { koban: 2 }, glyph: "弓",
    tags: ["ranged"],
    desc: "Yumi. Ranged pre-fire every round, high rate.",
  },
  teppo: {
    name: "Teppō", short: "鉄", atk: 6, def: 2, move: 1, upkeep: 1,
    cost: { koban: 3 }, glyph: "鉄", needs: "gun",
    tags: ["ranged", "volley"],
    desc: "Matchlock guns. Devastating volley every other round; useless in rain/snow.",
  },
  warship: {
    name: "Warship", short: "船", atk: 4, def: 4, move: 3, upkeep: 1,
    cost: { koban: 4 }, glyph: "船", needs: "sea",
    tags: ["naval"],
    desc: "Controls sea, bombards shore, ferries troops. Sinks in a typhoon.",
  },
  siege: {
    name: "Siege Train", short: "砲", atk: 1, def: 1, move: 1, upkeep: 1,
    cost: { koban: 3 }, glyph: "砲",
    tags: ["siege"],
    desc: "+4 vs castle. Batters castle levels down over a season or two.",
  },
};

/* ---------------------------------------------------------------------
 * BUILDINGS
 * ------------------------------------------------------------------- */
DATA.buildings = {
  irrigation: { name: "Irrigation", cost: 2, koku: 1, prestige: 0, honour: 0,
    desc: "+1 koku from this province each harvest." },
  market:     { name: "Market", cost: 2, koban: 2, prestige: 1, trade: true,
    desc: "Trade income; lets you sell rice for koban." },
  port:       { name: "Port", cost: 3, koban: 2, prestige: 1, needsCoast: true,
    desc: "Sea trade income; naval supply & transport." },
  mine:       { name: "Mine Works", cost: 3, koban: 2, prestige: 2, needsMineral: true,
    desc: "Required to work a silver/gold feature (+2 koban/yr)." },
  temple:     { name: "Temple", cost: 3, prestige: 2, honour: 1, pacify: 1,
    desc: "+2 Prestige, +1 Honour when built; aids pacification." },
  shrine:     { name: "Grand Shrine", cost: 5, prestige: 3, honour: 2, pacify: 2, unique: true,
    desc: "+3 Prestige, +2 Honour; strong pacification aid." },
  academy:    { name: "Academy", cost: 3, prestige: 2, culture: true,
    desc: "+2 Prestige (the Culture path)." },
};

/* ---------------------------------------------------------------------
 * PROVINCES (16) — a tightened map evoking central Japan, SW → NE.
 * koku: rice/harvest · terrain · castle: base level · feature key.
 * x,y: layout on a 1000x720 board.
 * ------------------------------------------------------------------- */
DATA.provinces = {
  satsuma:  { name: "Satsuma", koku: 2, terrain: "Coast",    castle: 2, feature: "foreign_trade",
              capital: true,  x: 95,  y: 632, adj: ["aki"] },
  aki:      { name: "Aki", koku: 2, terrain: "Coast",        castle: 2, feature: "naval_base",
              capital: true,  x: 205, y: 548, adj: ["satsuma", "iwami", "bizen"] },
  iwami:    { name: "Iwami", koku: 1, terrain: "Mountain",   castle: 1, feature: "silver",
              x: 250, y: 440, adj: ["aki", "izumo"] },
  izumo:    { name: "Izumo", koku: 2, terrain: "Hills",      castle: 1, feature: null,
              x: 350, y: 392, adj: ["iwami", "bizen", "kaga"] },
  bizen:    { name: "Bizen", koku: 3, terrain: "Plains",     castle: 1, feature: null,
              x: 360, y: 520, adj: ["aki", "izumo", "settsu"] },
  settsu:   { name: "Settsu", koku: 3, terrain: "Coast",     castle: 1, feature: "free_port",
              capital: true,  x: 452, y: 500, adj: ["bizen", "yamashiro", "omi"] },
  yamashiro:{ name: "Yamashiro", koku: 2, terrain: "Plains", castle: 2, feature: "capital",
              capital: true, kyoto: true, x: 524, y: 438, adj: ["settsu", "omi", "kaga"] },
  omi:      { name: "Ōmi", koku: 4, terrain: "Plains",       castle: 2, feature: "crossroads",
              capital: true,  x: 566, y: 372, adj: ["settsu", "yamashiro", "kaga", "owari"] },
  kaga:     { name: "Kaga", koku: 3, terrain: "Plains",      castle: 1, feature: "ikko",
              x: 500, y: 296, adj: ["izumo", "yamashiro", "omi", "echigo"] },
  owari:    { name: "Owari", koku: 5, terrain: "Plains",     castle: 2, feature: "teppo_farm",
              capital: true,  x: 636, y: 440, adj: ["omi", "mikawa", "kai", "shinano"] },
  mikawa:   { name: "Mikawa", koku: 3, terrain: "Hills",     castle: 1, feature: null,
              x: 706, y: 476, adj: ["owari", "kai", "sagami"] },
  kai:      { name: "Kai", koku: 1, terrain: "Mountain",     castle: 2, feature: "horse",
              capital: true,  x: 766, y: 402, adj: ["owari", "mikawa", "shinano", "sagami"] },
  shinano:  { name: "Shinano", koku: 2, terrain: "Mountain", castle: 1, feature: null,
              x: 700, y: 330, adj: ["owari", "kai", "echigo"] },
  sagami:   { name: "Sagami", koku: 3, terrain: "Plains",    castle: 3, feature: "great_castle",
              capital: true,  x: 836, y: 448, adj: ["mikawa", "kai", "mutsu"] },
  echigo:   { name: "Echigo", koku: 3, terrain: "Mountain",  castle: 3, feature: "snowbound",
              capital: true,  x: 724, y: 232, adj: ["kaga", "shinano", "mutsu"] },
  mutsu:    { name: "Mutsu", koku: 1, terrain: "Hills",      castle: 1, feature: "gold",
              x: 866, y: 182, adj: ["sagami", "echigo"] },
};

/* ---------------------------------------------------------------------
 * FEATURES — descriptive text + mechanical hooks read by the engine.
 * ------------------------------------------------------------------- */
DATA.features = {
  capital:       { name: "The Capital", desc: "Hosts the Imperial Court; +5 Prestige to its holder." },
  teppo_farm:    { name: "Rich Farmland & Sakai", desc: "Bountiful rice; grants gun access (may raise Teppō)." },
  horse:         { name: "Horse Country", desc: "May raise Cavalry; Cavalry cost −1." },
  snowbound:     { name: "Snowbound", desc: "Sealed off every Winter; breeds elite infantry." },
  great_castle:  { name: "The Great Castle", desc: "Defends at level 3; +1 to your sieges elsewhere." },
  naval_base:    { name: "Naval Base", desc: "Warship cost −1; controls Inland Sea supply." },
  free_port:     { name: "Free Merchant Port", desc: "Large Koban income; grants gun access." },
  crossroads:    { name: "Crossroads", desc: "Trade income + fast-movement hub near Kyoto." },
  silver:        { name: "Silver Mine", desc: "+2 Koban/year once Mine Works are built." },
  gold:          { name: "Gold Mine", desc: "+2 Koban/year with Mine Works; also breeds horses." },
  foreign_trade: { name: "Foreign Trade", desc: "Early Teppō + Koban; grants gun & horse-free gun access." },
  ikko:          { name: "Ikkō-ikki Country", desc: "Fiercely independent — very hard to pacify." },
};

/* ---------------------------------------------------------------------
 * CLANS — homes, daimyō, identity units, colours.
 * ------------------------------------------------------------------- */
DATA.clans = {
  takeda:  { name: "Takeda", homes: ["kai", "shinano"], daimyo: "Takeda Shingen",
    command: 3, trait: "Cavalry", identity: "cavalry", lean: "Conquest",
    strength: "Elite cavalry, mountain forts", weakness: "Food-poor, landlocked",
    color: "#c0392b", color2: "#7b1e17", crest: "菱" },
  uesugi:  { name: "Uesugi", homes: ["echigo"], daimyo: "Uesugi Kenshin",
    command: 3, trait: "Morale", identity: "samurai", lean: "Conquest / Honour",
    strength: "Superb warriors, winter fortress", weakness: "Snow-locked half the year",
    color: "#2980b9", color2: "#1b5680", crest: "毘" },
  oda:     { name: "Oda", homes: ["owari"], daimyo: "Oda Nobunaga",
    command: 2, trait: "Economy", identity: "teppo", lean: "Any",
    strength: "Rich, flexible, early guns", weakness: "Everyone's target",
    color: "#8e44ad", color2: "#5b2c6f", crest: "木" },
  hojo:    { name: "Hōjō", homes: ["sagami"], daimyo: "Hōjō Ujiyasu",
    command: 2, trait: "Siege & Defence", identity: "siege", lean: "Wealth / Culture",
    strength: "Odawara super-castle, solid economy", weakness: "Slow, defensive",
    color: "#16a085", color2: "#0e6a58", crest: "鱗" },
  mori:    { name: "Mōri", homes: ["aki"], daimyo: "Mōri Motonari",
    command: 3, trait: "Naval & Diplomacy", identity: "warship", lean: "Wealth / Diplomacy",
    strength: "Dominant navy, Inland Sea trade", weakness: "Weak on open land",
    color: "#27ae60", color2: "#1a7a42", crest: "一" },
  shimazu: { name: "Shimazu", homes: ["satsuma"], daimyo: "Shimazu Yoshihisa",
    command: 2, trait: "Infantry", identity: "ashigaru", lean: "Conquest / Trade",
    strength: "Fierce infantry, foreign guns", weakness: "Remote from Kyoto",
    color: "#d35400", color2: "#8a3600", crest: "丸" },
};

/* Honour bands (0-20). */
DATA.honourBands = [
  { name: "Infamous",  min: 0,  max: 4,  endScore: -5, revolt: 2,  color: "#7b241c" },
  { name: "Low",       min: 5,  max: 8,  endScore: 0,  revolt: 1,  color: "#a04000" },
  { name: "Respected", min: 9,  max: 12, endScore: 4,  revolt: 0,  color: "#7d6608" },
  { name: "Honoured",  min: 13, max: 16, endScore: 8,  revolt: -1, color: "#1e6b52" },
  { name: "Paragon",   min: 17, max: 20, endScore: 12, revolt: -2, color: "#1a5276" },
];

/* Court ranks. */
DATA.courtRanks = [
  { rank: 1, name: "Provincial Title", cost: 4,  honour: 9,  provinces: 0, kyoto: false, prestige: 2 },
  { rank: 2, name: "High Court Rank",  cost: 8,  honour: 9,  provinces: 5, kyoto: false, prestige: 4 },
  { rank: 3, name: "Sei-i Taishōgun",  cost: 12, honour: 13, provinces: 8, kyoto: true,  prestige: 8 },
];

/* Seasons. */
DATA.seasons = ["Spring", "Summer", "Autumn", "Winter"];

/* Event deck — drawn each season for flavour and swing. */
DATA.events = [
  { id: "good_harvest", name: "Bountiful Harvest", season: "Autumn",
    text: "Warm rains swelled the paddies. Every province yields +1 koku this harvest.",
    effect: (S, api) => api.eachOwned(S, S.humanClan, p => { p._bonusKoku = (p._bonusKoku||0)+1; }) },
  { id: "famine", name: "Famine", season: "any",
    text: "A cold snap ruins stores across the land. All clans lose 2 rice.",
    effect: (S, api) => api.allClans(S, c => { c.rice = Math.max(0, c.rice - 2); }) },
  { id: "plague", name: "Plague", season: "any",
    text: "Disease sweeps the camps. The clan with the largest army loses a unit to sickness.",
    effect: (S, api) => api.plague(S) },
  { id: "ronin", name: "Masterless Ronin", season: "any",
    text: "Wandering warriors offer their swords. You gain 1 free Samurai at your capital.",
    effect: (S, api) => api.grantUnit(S, S.humanClan, "samurai") },
  { id: "typhoon", name: "Great Typhoon", season: "Summer",
    text: "A kamikaze wind lashes the coasts — warships at sea are in peril this season.",
    effect: (S, api) => { S.weather.typhoon = true; } },
  { id: "bandits", name: "Bandit Uprising", season: "any",
    text: "Brigands stir the countryside; a random unrest province grows more restless.",
    effect: (S, api) => api.raiseRandomUnrest(S) },
  { id: "merchants", name: "Merchant Caravans", season: "any",
    text: "The roads are busy. Every Market and Port earns +1 koban this season.",
    effect: (S, api) => api.tradeWindfall(S) },
  { id: "ikko", name: "Ikkō-ikki Fervour", season: "any",
    text: "The warrior-monks preach rebellion. Occupied provinces grow harder to pacify this year.",
    effect: (S, api) => { S.flags.ikkoYear = S.year; } },
  { id: "court_favor", name: "Imperial Favour", season: "any",
    text: "The Court smiles on the honourable. The highest-Honour clan gains +1 Honour.",
    effect: (S, api) => api.rewardHonour(S) },
  { id: "envoys", name: "Peace Envoys", season: "any",
    text: "Emissaries cross the land; diplomacy is cheaper and warmer this season.",
    effect: (S, api) => { S.flags.peaceSeason = true; } },
  { id: "quiet", name: "A Quiet Season", season: "any",
    text: "The land holds its breath. Nothing stirs beyond the ordinary turning of the year.",
    effect: () => {} },
  { id: "gunships", name: "Nanban Traders", season: "any",
    text: "Foreign ships reach the southern ports; clans with gun access recruit Teppō at −1 koban this season.",
    effect: (S, api) => { S.flags.cheapGuns = true; } },
];

if (typeof module !== "undefined") module.exports = DATA;
