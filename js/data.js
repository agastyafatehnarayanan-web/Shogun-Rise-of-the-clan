/* =====================================================================
 * SHŌGUN: RISE OF THE CLANS  —  Static game data
 * Provinces, sea zones, clans, unit types, buildings, events.
 *
 * Faithful to the tabletop rulebook "Shōgun: Rise of the Clans"
 * (Master Edition v3.2): the full 24-province map of Nippon, the eight
 * sea zones, river borders & strait crossings, the seven unit types,
 * eight buildings, and the six Great Houses rated on five axes
 * (Military Strength / Economy / Navy / Diplomacy / Intrigue).
 *
 * The x,y coordinates lay the provinces out like the physical map:
 * Kyūshū in the south-west, up the spine of Honshū, to Mutsu in the
 * far north-east.
 * ===================================================================== */

const DATA = {};

DATA.edition = "v3.2 — Master Edition";

/* ---------------------------------------------------------------------
 * TERRAIN — sets battle frontage (how many units fight per sector each
 * round) and a small defensive character. Narrow terrain lets a few hold
 * a pass; plains let numbers tell. (Frontage values follow Part X.)
 * ------------------------------------------------------------------- */
DATA.terrain = {
  Plains:   { frontage: 4, cavalry: 1.0, defBonus: 0, label: "Plains" },
  Hills:    { frontage: 3, cavalry: 0.7, defBonus: 2, label: "Hills" },
  Mountain: { frontage: 2, cavalry: 0.4, defBonus: 4, label: "Mountain" },
  Forest:   { frontage: 2, cavalry: 0.5, defBonus: 3, label: "Forest" },
  Coast:    { frontage: 3, cavalry: 0.9, defBonus: 1, label: "Coast" },
  River:    { frontage: 2, cavalry: 0.7, defBonus: 2, label: "River-assault" },
};

/* ---------------------------------------------------------------------
 * UNIT TYPES — physical characteristics, not counter-tables (Part VII).
 * atk/def are the combat line; ranged units matter for their fire, not
 * their melee. cost: koban / rice. upkeep: rice weight per season
 * (Cavalry 2, everything else 1).
 * ------------------------------------------------------------------- */
DATA.units = {
  ashigaru: {
    name: "Ashigaru", short: "足", atk: 2, def: 3, move: 1, upkeep: 1,
    cost: { koban: 1, rice: 1 }, glyph: "足",
    tags: ["cheap", "deep"],
    desc: "Peasant levy. Cheap; the classic Deep block that soaks up a charge — but slow and narrow.",
  },
  samurai: {
    name: "Samurai", short: "侍", atk: 4, def: 4, move: 1, upkeep: 1,
    cost: { koban: 3, rice: 1 }, glyph: "侍",
    tags: ["morale"],
    desc: "Warrior nobility. High value, steadies morale (+1 each, max +3), strong in a long grind.",
  },
  cavalry: {
    name: "Cavalry", short: "騎", atk: 5, def: 3, move: 2, upkeep: 2,
    cost: { koban: 4 }, glyph: "騎", needs: "horse",
    tags: ["shock", "fast"],
    desc: "Mobility + Shock: a huge first-contact charge, spent after. Deadly in the open, wasted in a pass.",
  },
  archers: {
    name: "Archers", short: "弓", atk: 1, def: 2, move: 1, upkeep: 1,
    cost: { koban: 2 }, glyph: "弓",
    tags: ["ranged"],
    desc: "Fire +2 each round from front or support rank; each shaft cancels 1 point of enemy Shock.",
  },
  teppo: {
    name: "Teppō", short: "鉄", atk: 1, def: 2, move: 1, upkeep: 1,
    cost: { koban: 3 }, glyph: "鉄", needs: "gun",
    tags: ["ranged", "volley"],
    desc: "Volley +3 (odd rounds, never in rain/snow; +1 vs a Deep block). Each gun cancels 3 Shock — shreds a charge.",
  },
  warship: {
    name: "Warship", short: "船", atk: 4, def: 4, move: 3, upkeep: 1,
    cost: { koban: 4 }, glyph: "船", needs: "sea",
    tags: ["naval"],
    desc: "Fights at sea; shore-supports a coastal sector; carries 2 land units. Typhoons sink the unsheltered.",
  },
  siege: {
    name: "Siege Train", short: "砲", atk: 0, def: 1, move: 1, upkeep: 1,
    cost: { koban: 3 }, glyph: "砲",
    tags: ["siege"],
    desc: "Reduces castles a level each season; +4 in an assault. Slows its army to Move 1.",
  },
};

/* ---------------------------------------------------------------------
 * BUILDINGS (Part IV)
 * ------------------------------------------------------------------- */
DATA.buildings = {
  irrigation: { name: "Irrigation", cost: 2, koku: 1, prestige: 0, honour: 0,
    desc: "+1 Koku from this province each harvest (also restores a razed province's printed Koku)." },
  market:     { name: "Market", cost: 2, koban: 1, prestige: 1, trade: true,
    desc: "+1 Koban each Autumn; enables the rice↔koban exchange; a supply source." },
  port:       { name: "Port", cost: 3, koban: 2, prestige: 1, needsCoast: true,
    desc: "+2 Koban each Autumn (0 if blockaded); sea supply & embarkation; may build Warships." },
  mine:       { name: "Mine Works", cost: 3, koban: 2, prestige: 2, needsMineral: true,
    desc: "Activates a silver/gold Feature (its printed +2 Koban/yr)." },
  temple:     { name: "Temple", cost: 3, prestige: 2, honour: 1, pacify: 1,
    desc: "+2 Prestige, +1 Honour; aids pacification." },
  shrine:     { name: "Grand Shrine", cost: 4, prestige: 3, honour: 2, pacify: 2, unique: true,
    desc: "+3 Prestige, +2 Honour; strong pacification aid." },
  academy:    { name: "Tea House / Academy", cost: 3, prestige: 2, culture: true,
    desc: "+2 Prestige (the Culture path)." },
};

/* ---------------------------------------------------------------------
 * PROVINCES (24) — the full map of Nippon.
 *  koku    : rice produced each Autumn (1–5)
 *  terrain : sets battle frontage & mobility
 *  castle  : printed defensive level (0–3)
 *  feature : the province's single special (see DATA.features)
 *  gun/horse: recruit access gates granted by the province
 *  snowbound: sealed in Winter
 *  hard    : Hard to pacify (2 seasons, +1 unrest)
 *  minorCoast: touches a sea zone but is not Coast battle terrain
 *  sea     : the sea zone it touches (for blockade / naval supply)
 *  river   : land neighbours reached across a river border (river-assault)
 *  strait  : land neighbours reached across a strait (blockable by a fleet)
 *  x,y     : label/tint anchor on the 1536×1024 illustrated map
 *  rx,ry   : radius of the province's soft control-tint over the art
 * ------------------------------------------------------------------- */
DATA.provinces = {
  /* --- Kyūshū --- */
  satsuma:  { name: "Satsuma", jp: "薩摩", koku: 2, terrain: "Coast", castle: 2, feature: "foreign_trade",
              gun: true, sea: 4, x: 205, y: 812, rx: 72, ry: 60, adj: ["bungo"] },
  bungo:    { name: "Bungo", jp: "豊後", koku: 3, terrain: "Coast", castle: 1, feature: "foreign_port",
              gun: true, sea: 4, x: 322, y: 690, rx: 52, ry: 60, adj: ["satsuma", "aki"], strait: ["aki"] },
  /* --- Shikoku --- */
  tosa:     { name: "Tosa", jp: "土佐", koku: 2, terrain: "Coast", castle: 1, feature: "pirate_haven",
              sea: 5, x: 478, y: 742, rx: 98, ry: 52, adj: ["aki"], strait: ["aki"] },
  /* --- Chūgoku (western Honshū) --- */
  iwami:    { name: "Iwami", jp: "石見", koku: 1, terrain: "Mountain", castle: 1, feature: "silver",
              sea: 2, x: 255, y: 535, rx: 70, ry: 52, adj: ["izumo", "aki"] },
  izumo:    { name: "Izumo", jp: "出雲", koku: 2, terrain: "Coast", castle: 1, feature: "land_of_gods",
              sea: 2, x: 335, y: 490, rx: 58, ry: 46, adj: ["iwami", "harima"] },
  aki:      { name: "Aki", jp: "安芸", koku: 2, terrain: "Coast", castle: 2, feature: "naval_base",
              sea: 6, x: 300, y: 618, rx: 70, ry: 60, adj: ["iwami", "bizen", "bungo", "tosa"], strait: ["bungo", "tosa"] },
  bizen:    { name: "Bizen", jp: "備前", koku: 3, terrain: "Coast", castle: 1, feature: "swordsmiths",
              sea: 6, x: 400, y: 588, rx: 52, ry: 50, adj: ["aki", "harima"] },
  harima:   { name: "Harima", jp: "播磨", koku: 4, terrain: "Plains", castle: 2, feature: "himeji",
              sea: 6, x: 620, y: 560, rx: 56, ry: 54, adj: ["izumo", "bizen", "settsu"] },
  /* --- Kinki / Kansai --- */
  settsu:   { name: "Settsu", jp: "摂津", koku: 3, terrain: "Coast", castle: 1, feature: "free_port",
              gun: true, sea: 6, x: 700, y: 608, rx: 44, ry: 44, adj: ["harima", "yamashiro", "kii"] },
  kii:      { name: "Kii", jp: "紀伊", koku: 2, terrain: "Forest", castle: 1, feature: "warrior_monks",
              gun: true, hard: true, sea: 7, x: 668, y: 726, rx: 78, ry: 60, adj: ["settsu", "ise"] },
  yamashiro:{ name: "Yamashiro", jp: "山城", koku: 2, terrain: "Plains", castle: 2, feature: "capital",
              kyoto: true, x: 652, y: 548, rx: 40, ry: 40, adj: ["settsu", "omi"], river: ["omi"] },
  omi:      { name: "Ōmi", jp: "近江", koku: 4, terrain: "Plains", castle: 2, feature: "crossroads",
              x: 712, y: 512, rx: 54, ry: 52, adj: ["yamashiro", "kaga", "mino", "ise"], river: ["yamashiro"] },
  ise:      { name: "Ise", jp: "伊勢", koku: 3, terrain: "Coast", castle: 1, feature: "sacred_coast",
              sea: 7, x: 688, y: 668, rx: 54, ry: 54, adj: ["omi", "kii", "owari"] },
  /* --- Hokuriku / Chūbu --- */
  kaga:     { name: "Kaga", jp: "加賀", koku: 3, terrain: "Plains", castle: 1, feature: "ikko",
              hard: true, snowbound: true, sea: 2, x: 758, y: 402, rx: 58, ry: 54, adj: ["omi", "mino", "echigo"] },
  mino:     { name: "Mino", jp: "美濃", koku: 4, terrain: "Plains", castle: 2, feature: "east_road",
              x: 842, y: 542, rx: 64, ry: 54, adj: ["omi", "kaga", "owari", "shinano"], river: ["owari"] },
  owari:    { name: "Owari", jp: "尾張", koku: 5, terrain: "Plains", castle: 2, feature: "farmland",
              gun: true, x: 800, y: 652, rx: 48, ry: 48, adj: ["mino", "ise", "mikawa"], river: ["mino"] },
  mikawa:   { name: "Mikawa", jp: "三河", koku: 3, terrain: "Plains", castle: 1, feature: "hardy_levies",
              minorCoast: true, sea: 8, x: 896, y: 618, rx: 54, ry: 44, adj: ["owari", "suruga"] },
  /* --- Kōshin / Tōkai --- */
  shinano:  { name: "Shinano", jp: "信濃", koku: 2, terrain: "Mountain", castle: 1, feature: "mountain_forts",
              horse: true, snowbound: true, x: 888, y: 460, rx: 72, ry: 66, adj: ["kai", "mino", "echigo", "musashi"] },
  kai:      { name: "Kai", jp: "甲斐", koku: 1, terrain: "Mountain", castle: 2, feature: "horse_land",
              horse: true, x: 1035, y: 572, rx: 56, ry: 50, adj: ["suruga", "shinano", "musashi"] },
  suruga:   { name: "Suruga", jp: "駿河", koku: 3, terrain: "Coast", castle: 1, feature: "tokaido",
              sea: 8, x: 1032, y: 668, rx: 54, ry: 44, adj: ["mikawa", "kai", "sagami"] },
  /* --- Kantō --- */
  sagami:   { name: "Sagami", jp: "相模", koku: 3, terrain: "Plains", castle: 3, feature: "great_castle",
              minorCoast: true, sea: 8, x: 1122, y: 622, rx: 48, ry: 44, adj: ["suruga", "musashi"], river: ["musashi"] },
  musashi:  { name: "Musashi", jp: "武蔵", koku: 5, terrain: "Plains", castle: 1, feature: "great_plain",
              minorCoast: true, sea: 8, x: 1148, y: 525, rx: 58, ry: 54, adj: ["kai", "shinano", "sagami", "mutsu"], river: ["sagami"] },
  /* --- Tōhoku / North --- */
  echigo:   { name: "Echigo", jp: "越後", koku: 3, terrain: "Mountain", castle: 3, feature: "elite_infantry",
              snowbound: true, sea: 1, x: 1045, y: 360, rx: 78, ry: 60, adj: ["kaga", "shinano", "mutsu"] },
  mutsu:    { name: "Mutsu", jp: "陸奥", koku: 2, terrain: "Mountain", castle: 1, feature: "gold",
              horse: true, snowbound: true, sea: 1, x: 1248, y: 302, rx: 82, ry: 92, adj: ["echigo", "musashi"] },
};

/* ---------------------------------------------------------------------
 * SEA ZONES (8) — fleets move zone-to-zone; each coastal province
 * touches its listed zone. Zone 3 (Genkai) is a transit zone with no
 * starter province.
 * ------------------------------------------------------------------- */
DATA.seaZones = {
  1: { name: "Echigo Coast",     jp: "越後海",   adj: [2],       x: 800, y: 150 },
  2: { name: "San'in Coast",     jp: "山陰海",   adj: [1, 3],    x: 330, y: 300 },
  3: { name: "Genkai Sea",       jp: "玄界灘",   adj: [2, 4, 6], x: 130, y: 430, transit: true },
  4: { name: "Satsuma Sea",      jp: "薩摩海",   adj: [3, 5],    x: 150, y: 660 },
  5: { name: "Tosa Sea",         jp: "土佐海",   adj: [4, 6],    x: 380, y: 690 },
  6: { name: "Inland Sea",       jp: "瀬戸内海", adj: [3, 5, 7], x: 400, y: 585 },
  7: { name: "Ise & Kumano Sea", jp: "熊野灘",   adj: [6, 8],    x: 620, y: 660 },
  8: { name: "Sagami Sea",       jp: "相模灘",   adj: [7],       x: 960, y: 610 },
};

/* ---------------------------------------------------------------------
 * FEATURES — descriptive text + the mechanical hooks the engine reads.
 * koban : printed +Koban/year (mines add +2 only once Mine Works exist).
 * ------------------------------------------------------------------- */
DATA.features = {
  capital:       { name: "The Capital", glyph: "⛩", desc: "Hosts the Imperial Court; counts 5 Prestige to its holder at game end." },
  farmland:      { name: "Rich Farmland", glyph: "🌾", desc: "Owari's Nobi plain — vast rice; trade routes give gun access." },
  horse_land:    { name: "Horse Country", glyph: "🐎", desc: "Horse access; Cavalry cost −1 raised here." },
  elite_infantry:{ name: "Elite Infantry", glyph: "❄", desc: "Snowbound; hardy Echigo Samurai cost only 2 koban here." },
  great_castle:  { name: "The Great Castle", glyph: "🏯", desc: "Odawara defends at level 3; +1 to this holder's own sieges." },
  naval_base:    { name: "Naval Base", glyph: "⚓", desc: "Warship cost −1 here; controls Inland Sea supply." },
  free_port:     { name: "Free Merchant Port", glyph: "⛵", desc: "Sakai — +2 Koban/yr; gun access." },
  crossroads:    { name: "Crossroads", glyph: "🛤", desc: "+1 Koban/yr; armies moving through gain +1 movement." },
  silver:        { name: "Silver Mine", glyph: "⚒", desc: "+2 Koban/yr once Mine Works are built." },
  gold:          { name: "Gold Mine", glyph: "⚒", desc: "+2 Koban/yr with Mine Works; horse access; Snowbound." },
  foreign_trade: { name: "Foreign Trade", glyph: "🌐", desc: "Gun access; +1 Koban/yr; far from Kyoto." },
  foreign_port:  { name: "Foreign Port", glyph: "🌐", desc: "Gun access; +1 Koban/yr." },
  ikko:          { name: "Ikkō-ikki Country", glyph: "☸", desc: "Hard to pacify; Snowbound — fortified temples reject any lord." },
  mountain_forts:{ name: "Mountain Forts", glyph: "⛰", desc: "Horse access; mountain forts; Snowbound." },
  east_road:     { name: "Crossroads of the East", glyph: "🛤", desc: "The road to Kyoto; +1 Koban/yr." },
  hardy_levies:  { name: "Hardy Levies", glyph: "🪖", desc: "Ashigaru raised here cost only 1 rice (no koban)." },
  tokaido:       { name: "Tōkaidō Road", glyph: "🛤", desc: "+1 Koban/yr along the great eastern highway." },
  great_plain:   { name: "The Great Eastern Plain", glyph: "🌾", desc: "Musashi's vast rice lands." },
  sacred_coast:  { name: "Sacred Coast", glyph: "⛩", desc: "Temples/Shrines here cost −1 and give +1 Prestige." },
  warrior_monks: { name: "Warrior Monks", glyph: "☸", desc: "Negoro gunsmiths — gun access; Hard to pacify." },
  himeji:        { name: "Himeji", glyph: "🏯", desc: "The western gate — strong castle country." },
  swordsmiths:   { name: "Swordsmiths", glyph: "⚔", desc: "Samurai cost −1 raised here." },
  land_of_gods:  { name: "Land of the Gods", glyph: "⛩", desc: "Temples/Shrines here give +1 Honour extra." },
  pirate_haven:  { name: "Pirate Haven", glyph: "⚓", desc: "Warship cost −1 raised here." },
};

/* Per-year Koban a feature adds to its holder (Part III / IV). */
DATA.featureKoban = {
  free_port: 2, crossroads: 1, east_road: 1, tokaido: 1,
  foreign_trade: 1, foreign_port: 1,
};

/* ---------------------------------------------------------------------
 * CLANS — the six Great Houses, rated 1–5 on five axes (Appendix A).
 *  ms : Military Strength — +ms Army Morale every battle; once/battle
 *       +ms to one sector (a Martial Prowess surge).
 *  ec : Economy — annual income modifier of (ec−3) Koban.
 *  nv : Navy — Warship cost −(nv−3); sea-supply range +(nv−3).
 *  dp : Diplomacy & Court — pact/marriage/court costs −(dp−3); wins ties.
 *  in : Intrigue — Espionage & counter-intel +(in−3).
 * command is the Daimyō's rating; the Heir fights at command−1 (min 1).
 * ------------------------------------------------------------------- */
DATA.clans = {
  takeda:  { name: "Takeda", homes: ["kai", "shinano"], daimyo: "Takeda Shingen",
    command: 3, trait: "Cavalry", identity: "cavalry", lean: "Conquest",
    ms: 5, ec: 2, nv: 1, dp: 3, in: 3,
    strength: "The war machine — Military Strength 5; cheap cavalry in Kai; mountain forts.",
    weakness: "Food-poor & landlocked — little rice, no real fleet. Must seize a rice plain or trade for grain.",
    color: "#c0392b", color2: "#7b1e17", crest: "菱" },
  uesugi:  { name: "Uesugi", homes: ["echigo"], daimyo: "Uesugi Kenshin",
    command: 3, trait: "Morale", identity: "samurai", lean: "Conquest / Honour",
    ms: 5, ec: 3, nv: 2, dp: 4, in: 1,
    strength: "The honourable blade — Military Strength 5 and Diplomacy 4; cheap pacts & court.",
    weakness: "Winter-locked & blind — Echigo seals each Winter; Intrigue 1 leaves it open to spies.",
    color: "#2980b9", color2: "#1b5680", crest: "毘" },
  oda:     { name: "Oda", homes: ["owari"], daimyo: "Oda Nobunaga",
    command: 2, trait: "Teppō", identity: "teppo", lean: "Any",
    ms: 4, ec: 5, nv: 2, dp: 3, in: 3,
    strength: "The wealthy generalist — Economy 5 out-builds all; early guns; no weak axis.",
    weakness: "Everyone's target — no valley means it gets ganged up on; the anti-runaway rules bite it.",
    color: "#8e44ad", color2: "#5b2c6f", crest: "木" },
  hojo:    { name: "Hōjō", homes: ["sagami"], daimyo: "Hōjō Ujiyasu",
    command: 2, trait: "Siege & Defence", identity: "siege", lean: "Wealth / Culture",
    ms: 3, ec: 4, nv: 2, dp: 3, in: 2,
    strength: "The fortress — Odawara defends at Castle 3; Economy 4 funds a patient Wealth/Culture win.",
    weakness: "Slow & blunt — Military Strength 3 (no morale bonus); it cannot blitz.",
    color: "#16a085", color2: "#0e6a58", crest: "鱗" },
  mori:    { name: "Mōri", homes: ["aki"], daimyo: "Mōri Motonari",
    command: 3, trait: "Naval & Diplomacy", identity: "warship", lean: "Wealth / Diplomacy",
    ms: 3, ec: 3, nv: 5, dp: 4, in: 2,
    strength: "The sea lord — Navy 5 rules the Inland Sea; Diplomacy 4, the great alliance-broker.",
    weakness: "Soft on land — Military Strength 3 loses open-field slugfests; strip its coasts and it wilts.",
    color: "#27ae60", color2: "#1a7a42", crest: "一" },
  shimazu: { name: "Shimazu", homes: ["satsuma"], daimyo: "Shimazu Yoshihisa",
    command: 2, trait: "Infantry", identity: "ashigaru", lean: "Conquest / Trade",
    ms: 5, ec: 2, nv: 3, dp: 2, in: 3,
    strength: "The southern spear — Military Strength 5 with early foreign guns; a safe far-south base.",
    weakness: "Poor & isolated — Economy 2 and Diplomacy 2 all but shut the political road.",
    color: "#d35400", color2: "#8a3600", crest: "丸" },
  /* --- expansion houses (added content) --- */
  tokugawa:{ name: "Tokugawa", homes: ["mikawa"], daimyo: "Tokugawa Ieyasu",
    command: 3, trait: "Siege & Defence", identity: "samurai", lean: "Any (patient)",
    ms: 3, ec: 4, nv: 2, dp: 4, in: 3,
    strength: "The patient tiger — balanced on every axis, cheap pacts, and steady defence; outlasts rivals.",
    weakness: "No single peak — wins by endurance, not blitz; pinched between Oda, Takeda, and Hōjō.",
    color: "#3d5a80", color2: "#28405c", crest: "葵" },
  date:    { name: "Date", homes: ["mutsu"], daimyo: "Date Masamune",
    command: 3, trait: "Cavalry", identity: "cavalry", lean: "Conquest",
    ms: 4, ec: 3, nv: 2, dp: 2, in: 3,
    strength: "The one-eyed dragon of the north — strong cavalry from Mutsu's horse country, a safe far corner.",
    weakness: "Snowbound & distant — Mutsu seals each Winter and the capital is a world away.",
    color: "#4a3f8f", color2: "#332c66", crest: "竹" },
  chosokabe:{ name: "Chōsokabe", homes: ["tosa"], daimyo: "Chōsokabe Motochika",
    command: 2, trait: "Infantry", identity: "ashigaru", lean: "Conquest / Sea",
    ms: 4, ec: 2, nv: 3, dp: 2, in: 3,
    strength: "Masters of the 'one-whole-country' levy — fierce ashigaru and pirate ships from Shikoku.",
    weakness: "Poor island base — thin economy and diplomacy; must break out before the mainland unites.",
    color: "#9c7a1a", color2: "#6e5612", crest: "柏" },
  otomo:   { name: "Ōtomo", homes: ["bungo"], daimyo: "Ōtomo Sōrin",
    command: 2, trait: "Teppō", identity: "teppo", lean: "Wealth / Trade",
    ms: 3, ec: 4, nv: 3, dp: 3, in: 2,
    strength: "The Christian trade-lord of Kyūshū — foreign guns and Nanban wealth from Bungo's port.",
    weakness: "Soft army & neighbours — Military Strength 3 and Shimazu at the door to the south.",
    color: "#922b21", color2: "#661c16", crest: "大" },
};

/* Honour bands (0–20). endScore is direct end-game Prestige (Part XIV). */
DATA.honourBands = [
  { name: "Infamous",  min: 0,  max: 4,  endScore: -5, revolt: 2,  color: "#7b241c" },
  { name: "Low",       min: 5,  max: 8,  endScore: 0,  revolt: 1,  color: "#a04000" },
  { name: "Respected", min: 9,  max: 12, endScore: 4,  revolt: 0,  color: "#7d6608" },
  { name: "Honoured",  min: 13, max: 16, endScore: 8,  revolt: -1, color: "#1e6b52" },
  { name: "Paragon",   min: 17, max: 20, endScore: 12, revolt: -2, color: "#1a5276" },
];

/* Court ranks (Part XVI). */
DATA.courtRanks = [
  { rank: 1, name: "Provincial Title", cost: 4,  honour: 9,  provinces: 0, kyoto: false, prestige: 2 },
  { rank: 2, name: "High Court Rank",  cost: 8,  honour: 9,  provinces: 5, kyoto: false, prestige: 4 },
  { rank: 3, name: "Sei-i Taishōgun",  cost: 12, honour: 13, provinces: 8, kyoto: true,  prestige: 8 },
];

/* Sudden-win thresholds (Part XVII). */
DATA.win = {
  conquestProvinces: 14,   // Kyoto + 14 of 24, all pacified
  wealthKoban: 30,         // ≥30 koban while holding ≥3 Port/Market buildings
  wealthBuildings: 3,
};

/* Seasons. */
DATA.seasons = ["Spring", "Summer", "Autumn", "Winter"];

/* ---------------------------------------------------------------------
 * YEAR EVENTS — one is drawn each Spring and holds for the year
 * (Part V), lightly adapted for the seasonal video-game loop.
 * ------------------------------------------------------------------- */
DATA.events = [
  { id: "poor_rains", name: "Poor Rains", season: "Spring",
    text: "Thin rains over the paddies. Every province yields −1 Koku this Autumn (min 1).",
    effect: (S, api) => { S.flags.poorRains = S.year; } },
  { id: "bumper", name: "Bumper Year", season: "Spring",
    text: "A warm, wet spring swells the crop. Every province yields +1 Koku this Autumn.",
    effect: (S, api) => { S.flags.bumperYear = S.year; } },
  { id: "envoys", name: "Imperial Envoys", season: "Spring",
    text: "The court sends envoys. The first clan to make a Court Gift this year gains extra favour.",
    effect: (S, api) => { S.flags.imperialEnvoys = S.year; } },
  { id: "ronin", name: "Wandering Ronin", season: "Spring",
    text: "Masterless warriors offer their swords — you gain a free Ashigaru at home this year.",
    effect: (S, api) => api.grantUnit(S, S.humanClan, "ashigaru") },
  { id: "foreign_ship", name: "Foreign Ship", season: "Spring",
    text: "Nanban traders reach the ports. Every Port yields +1 Koban this Autumn; gun clans buy Teppō −1 koban.",
    effect: (S, api) => { S.flags.foreignShip = S.year; S.flags.cheapGuns = true; } },
  { id: "unrest", name: "Unrest Stirs", season: "Spring",
    text: "Rumour and discontent spread — +1 unrest in every occupied and Hard-to-pacify province.",
    effect: (S, api) => api.stirUnrest(S) },
  /* A few atmospheric mid-year events keep the seasonal loop lively. */
  { id: "merchants", name: "Merchant Caravans", season: "Summer",
    text: "The roads hum with trade. Every Market and Port earns +1 koban this season.",
    effect: (S, api) => api.tradeWindfall(S) },
  { id: "quiet", name: "A Quiet Season", season: "any",
    text: "The land holds its breath; nothing stirs beyond the ordinary turning of the year.",
    effect: () => {} },
];

if (typeof module !== "undefined") module.exports = DATA;
