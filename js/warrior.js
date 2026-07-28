/* =====================================================================
 * warrior.js — "Way of the Warrior: Rise to Daimyō" (story director).
 *
 * A standalone story mode. Character creation is the one setup screen;
 * after that you live inside a continuous first-person 3D world
 * (WARRIOR3D) — narration in a top bubble, walk to markers, fight in the
 * world, and eat / rest / sleep at camps to survive and grow, all the way
 * to being proclaimed daimyō. This file is the async "director" script.
 * Never touches SR / the strategy game.
 * ===================================================================== */

const WARRIOR = {};

WARRIOR.UNITS = {
  ashigaru: { name: "Ashigaru", jp: "足軽", icon: "⚔️", hp: 34, st: 10, atk: 6, guard: 6, weapon: "yari",   blurb: "A conscript with a YARI (spear) — long reach lets you strike before the enemy closes. Dogged and tough." },
  samurai:  { name: "Samurai", jp: "侍", icon: "🗡️", hp: 38, st: 11, atk: 8, guard: 6, weapon: "katana", blurb: "Bushi with the KATANA — balanced reach and power, the all-rounder's blade." },
  ronin:    { name: "Rōnin", jp: "浪人", icon: "🥷", hp: 30, st: 13, atk: 9, guard: 4, weapon: "fastkatana", blurb: "A fast, aggressive KATANA and no lord to answer to. Hits hard — but you bruise easily." },
  archer:   { name: "Yumi", jp: "弓", icon: "🏹", hp: 30, st: 12, atk: 6, guard: 4, weapon: "bow",    blurb: "The BOW — a deep quiver and deadly aimed shots. Weak up close, so soften them first." },
  teppo:    { name: "Teppō", jp: "鉄砲", icon: "🔫", hp: 28, st: 10, atk: 10, guard: 4, weapon: "gunner", blurb: "The MATCHLOCK — a few devastating shots that stagger anything, then draw your blade." },
  cavalry:  { name: "Rider", jp: "騎馬", icon: "🐎", hp: 40, st: 11, atk: 8, guard: 5, weapon: "naginata", blurb: "The NAGINATA — long, heavy sweeps that hit hardest of all. Slower, but brutal and tough." },
};

/* per-role weapons — each fights differently (reach, power, ranged option) */
WARRIOR.WEAPONS = {
  katana:     { name: "Katana", melee: "katana",   reach: 2.6, atkMult: 1.0,  ranged: "knife", quiver: 3, note: "balanced blade" },
  fastkatana: { name: "Katana (rōnin)", melee: "katana", reach: 2.5, atkMult: 1.08, ranged: "knife", quiver: 3, note: "quick, aggressive" },
  yari:       { name: "Yari", melee: "spear",      reach: 3.4, atkMult: 0.9,  ranged: "knife", quiver: 3, note: "long reach — poke before he closes" },
  naginata:   { name: "Naginata", melee: "naginata", reach: 3.2, atkMult: 1.2, ranged: "knife", quiver: 2, note: "long, heavy sweeps" },
  bow:        { name: "Yumi", melee: "katana",     reach: 2.3, atkMult: 0.86, ranged: "bow", quiver: 5, rangedMult: 0.8, note: "a few arrows to soften them — then draw your blade" },
  gunner:     { name: "Teppō", melee: "katana",    reach: 2.3, atkMult: 0.9, ranged: "gun", gun: 2, gunDmg: 15, quiver: 0, note: "one or two devastating shots" },
};

/* the ladder — a long climb; the top is DAIMYŌ */
WARRIOR.RANKS = [
  { name: "Nameless", jp: "無名" }, { name: "Footman", jp: "足軽" }, { name: "Spear-Corporal", jp: "組頭" },
  { name: "Retainer", jp: "郎党" }, { name: "Samurai", jp: "侍" }, { name: "Squad Leader", jp: "士大将" },
  { name: "Hatamoto", jp: "旗本" }, { name: "Bugyō", jp: "奉行" }, { name: "Taishō", jp: "大将" },
  { name: "Karō", jp: "家老" }, { name: "Daimyō", jp: "大名" },
];

/* foe templates — skill sets the parry window; tuned HARD (Minecraft+10).
 * A veteran foe winds up fast, feints often, and reads a blind swing. */
WARRIOR.FOES = {
  bandit:   { name: "Bandit", hp: 24, dmg: 9, skill: 0.7, aggr: 0.8, color: 0x6a5a3a },
  looter:   { name: "Looter", hp: 22, dmg: 9, skill: 0.66, aggr: 0.86, color: 0x5a4a34 },
  brigand:  { name: "Brigand", hp: 30, dmg: 11, skill: 0.74, aggr: 0.9, color: 0x574733 },
  ashigaru: { name: "Enemy Ashigaru", hp: 32, dmg: 11, skill: 0.74, aggr: 0.78, color: 0x4a5a3a },
  spearman: { name: "Enemy Spearman", hp: 34, dmg: 12, skill: 0.76, aggr: 0.7, color: 0x445238 },
  ronin:    { name: "Rōnin Blade", hp: 38, dmg: 13, skill: 0.86, aggr: 0.95, color: 0x3a3a3a },
  duelist:  { name: "Wandering Duelist", hp: 42, dmg: 14, skill: 0.9, aggr: 0.9, color: 0x2f3540 },
  guard:    { name: "Gate Guard", hp: 42, dmg: 12, skill: 0.8, aggr: 0.66, color: 0x40506a },
  sohei:    { name: "Warrior Monk", hp: 52, dmg: 14, skill: 0.84, aggr: 0.72, color: 0x6a5030 },
  captain:  { name: "Guard Captain", hp: 60, dmg: 16, skill: 0.9, aggr: 0.86, color: 0x5a2f2a },
  general:  { name: "Rival General", hp: 74, dmg: 18, skill: 0.92, aggr: 0.82, color: 0x503a5a },
  champion: { name: "Enemy Champion", hp: 88, dmg: 19, skill: 0.94, aggr: 0.88, color: 0x3a2a4a },
  oni:      { name: "Oni-Masked Killer", hp: 96, dmg: 21, skill: 0.96, aggr: 0.94, color: 0x5a1f1f },
  kuro:     { name: "Kuroda the Ash-Maker", hp: 118, dmg: 22, skill: 0.98, aggr: 0.96, color: 0x2a2a2a },
};

WARRIOR.rankFor = function (i) { return WARRIOR.RANKS[Math.max(0, Math.min(WARRIOR.RANKS.length - 1, i))]; };

/* ---------- entry / title wiring ---------- */
WARRIOR.open = function () {
  if (typeof document === "undefined") return;
  if (typeof UI !== "undefined" && UI.audio) { try { UI.audio.init(); } catch (e) {} }
  WARRIOR.renderCreate();
  if (typeof UI !== "undefined" && UI.showScreen) UI.showScreen("warrior-screen");
  else { document.querySelectorAll(".screen").forEach(s => s.classList.remove("active")); document.getElementById("warrior-screen").classList.add("active"); }
};
WARRIOR.toTitle = function () {
  if (typeof WARRIOR3D !== "undefined" && WARRIOR3D._e) WARRIOR3D.leave();
  if (typeof UI !== "undefined" && UI.showScreen) UI.showScreen("title-screen");
};

/* ---------- character creation (the one setup screen) ---------- */
WARRIOR.renderCreate = function () {
  const s = document.getElementById("warrior-screen");
  const clans = (typeof DATA !== "undefined") ? Object.keys(DATA.clans) : [];
  WARRIOR._pick = WARRIOR._pick || { clan: clans[0] || "takeda", unit: "samurai", name: "" };
  const p = WARRIOR._pick;
  const clanCards = clans.map(cid => { const c = DATA.clans[cid];
    return `<button class="wr-card wr-clan ${cid === p.clan ? "sel" : ""}" data-clan="${cid}"><span class="wr-crest" style="background:${c.color}">${c.crest}</span><span class="wr-cardname">${c.name}</span></button>`; }).join("");
  const unitCards = Object.keys(WARRIOR.UNITS).map(uk => { const u = WARRIOR.UNITS[uk];
    return `<button class="wr-card wr-unit ${uk === p.unit ? "sel" : ""}" data-unit="${uk}"><span class="wr-uicon">${u.icon}</span><span class="wr-cardname">${u.name} <span class="wr-jp">${u.jp}</span></span></button>`; }).join("");
  const u = WARRIOR.UNITS[p.unit];
  s.innerHTML = `<div class="wr-stage"><div class="wr-titlebar"><button class="wr-ghost" id="wr-exit">‹ Menu</button><div class="wr-kanji">武士道</div><div style="width:64px"></div></div>
    <h1 class="wr-h1">Way of the Warrior</h1>
    <p class="wr-sub">Live one life in the age of war — a continuous first-person world. Serve a clan, survive, and rise to become <b>daimyō</b>. Your strategy campaigns are untouched.</p>
    <div class="wr-panel">
      <label class="wr-label">Your name</label>
      <input id="wr-name" class="wr-input" maxlength="18" placeholder="e.g. Sanada, Kenji, Tomoe…" value="${p.name ? esc(p.name) : ""}" />
      <label class="wr-label">Choose the clan you will serve</label>
      <div class="wr-cardgrid">${clanCards}</div>
      <label class="wr-label">Choose what you are</label>
      <div class="wr-cardgrid">${unitCards}</div>
      <div class="wr-unitblurb"><div class="wr-statline"><span>❤️ ${u.hp} vitality</span><span>⚡ ${u.st} stamina</span><span>🗡️ ${u.atk} attack</span><span>🛡️ ${u.guard} guard</span></div><p>${u.blurb}</p></div>
      <button class="wr-begin" id="wr-begin">Enter the world ⚔</button>
    </div></div>`;
  s.querySelector("#wr-exit").onclick = () => WARRIOR.toTitle();
  s.querySelector("#wr-name").oninput = (e) => { WARRIOR._pick.name = e.target.value; };
  s.querySelectorAll(".wr-clan").forEach(b => b.onclick = () => { WARRIOR._pick.clan = b.dataset.clan; WARRIOR.renderCreate(); });
  s.querySelectorAll(".wr-unit").forEach(b => b.onclick = () => { WARRIOR._pick.unit = b.dataset.unit; WARRIOR.renderCreate(); });
  s.querySelector("#wr-begin").onclick = () => WARRIOR.begin();
};

WARRIOR.begin = function () {
  const p = WARRIOR._pick, u = WARRIOR.UNITS[p.unit] || WARRIOR.UNITS.samurai;
  const name = (p.name || "").trim() || "Ronin";
  const clanName = (typeof DATA !== "undefined" && DATA.clans[p.clan]) ? DATA.clans[p.clan].name : "Takeda";
  WARRIOR.state = { name, clan: p.clan, clanName, unit: p.unit, unitName: u.name, rank: 0 };
  if (typeof WARRIOR3D === "undefined" || !WARRIOR3D.available()) {
    const s = document.getElementById("warrior-screen");
    s.innerHTML = `<div class="wr-stage"><h1 class="wr-h1">3D not available</h1><p class="wr-sub">This mode needs 3D graphics (WebGL), which this browser/device doesn't support. Try a different browser. Your strategy game still works.</p><div style="text-align:center"><button class="wr-begin" style="max-width:260px" onclick="WARRIOR.toTitle()">‹ Back to menu</button></div></div>`;
    return;
  }
  const weapon = WARRIOR.WEAPONS[u.weapon] || WARRIOR.WEAPONS.katana;
  WARRIOR3D.enter({ theme: "dawn", onExit: () => WARRIOR.toTitle(),
    player: { maxHp: u.hp, hp: u.hp, maxSt: u.st, atk: u.atk, guard: u.guard, unit: p.unit, weapon, food: 80, rest: 80 } });
  WARRIOR.runStory().catch(() => {});
};

/* ---------- helpers ---------- */
WARRIOR.foe = function (key, name) { const f = Object.assign({}, WARRIOR.FOES[key]); if (name) f.name = name; return f; };

WARRIOR.camp = async function (intro) {
  const W = WARRIOR3D;
  if (W.campfire && !(WARRIOR3D._e && WARRIOR3D._e.fire)) W.campfire();   // ensure a fire if the marker didn't place one
  if (intro) await W.say(intro, { who: "" });
  while (WARRIOR3D._e) {
    const s = W.stats(); if (!s) break;
    const pick = await W.say(`🔥 At the fire. <b>Vitality ${Math.round(s.hp)}/${s.maxHp}</b> · Food ${Math.round(s.food)} · Rest ${Math.round(s.rest)} · Skill pts <b>${s.sp}</b>.`,
      { choices: ["🍚 Eat — restore vitality &amp; food", "😌 Rest — stamina, rest &amp; a little healing", "😴 Sleep — full heal, rest till dawn", "🎖️ Train — upgrade your character", "🚶 Break camp — march on"] });
    if (pick === 0) { W.heal(16); W.setSurvival({ food: s.food + 40 }); W.banner("🍚 You eat — strength returns"); }
    else if (pick === 1) { W.heal(8); W.setSurvival({ rest: s.rest + 32, st: 999 }); W.banner("😌 You rest by the fire"); }
    else if (pick === 2) { W.heal(9999); W.setSurvival({ food: 100, rest: 100, st: 999 }); W.banner("😴 You sleep till dawn — fully rested.", 2600); break; }  // sleeping ends the camp (no spamming for stats)
    else if (pick === 3) { await WARRIOR.train(); }
    else break;
  }
};

/* spend skill points to upgrade your warrior */
WARRIOR.train = async function () {
  const W = WARRIOR3D;
  while (WARRIOR3D._e) {
    const s = W.stats(); if (!s) return;
    if (s.sp <= 0) { await W.say("No skill points to spend yet — win battles and rise in rank to earn them.", { choices: ["‹ Back"] }); return; }
    const pick = await W.say(`🎖️ <b>Train</b> — ${s.sp} skill point${s.sp > 1 ? "s" : ""} to spend.<br>Attack <b>${s.atk}</b> (more damage) · Vitality <b>${s.maxHp}</b> · Stamina <b>${s.maxSt}</b> (more moves) · Guard <b>${s.guard}</b> (less damage taken).`,
      { choices: ["🗡️ +2 Attack — hit harder", "❤️ +7 Vitality — survive more", "⚡ +3 Stamina — act more", "🛡️ +2 Guard — take less", "‹ Back"] });
    if (pick === 0) { W.buff({ atk: 2 }); W.addSp(-1); W.banner("🎖️ Attack +2 — your blows bite deeper"); }
    else if (pick === 1) { W.buff({ maxHp: 7 }); W.addSp(-1); W.banner("🎖️ Vitality +7"); }
    else if (pick === 2) { W.buff({ maxSt: 3 }); W.addSp(-1); W.banner("🎖️ Stamina +3 — more moves before winding"); }
    else if (pick === 3) { W.buff({ guard: 2 }); W.addSp(-1); W.banner("🎖️ Guard +2 — you weather blows better"); }
    else break;
  }
};

WARRIOR.battle = async function (foes, opts) {
  const W = WARRIOR3D;
  while (WARRIOR3D._e) {
    const won = await W.fight(foes, opts || {});
    // spend food/rest on the exertion of battle
    const s = W.stats(); if (s) W.setSurvival({ food: s.food - 16, rest: s.rest - 14 });
    if (won) return true;
    await W.say("Darkness takes you — but comrades drag you clear before the end. You wake, wounded, by a fire.", { who: "" });
    await WARRIOR.camp("Bind your wounds. Then face them again.");
  }
  return false;
};

WARRIOR.rankUp = function (i, note) {
  WARRIOR.state.rank = i; const r = WARRIOR.rankFor(i);
  WARRIOR3D.addMaxHp(4); WARRIOR3D.addSp(1);
  WARRIOR3D.banner(`⬆ You rise to <b>${r.name}</b> ${r.jp}${note ? " — " + note : ""} · +1 skill point`, 3400);
  WARRIOR3D.objective(`Rise to Daimyō · now ${r.name}`);
};

/* ================================================================== *
 *  PROCEDURAL CAMPAIGNS — the length. Between the scripted acts you
 *  conquer province after province in randomised field battles, the
 *  way Black Flag strings dozens of encounters between story beats.
 * ================================================================== */
WARRIOR._rand = function (a) { return a[Math.floor(Math.random() * a.length)]; };
WARRIOR.TIER_POOL = {
  1: ["bandit", "looter", "brigand", "ashigaru"],
  2: ["ashigaru", "spearman", "brigand", "ronin", "guard"],
  3: ["ronin", "duelist", "guard", "sohei", "spearman"],
  4: ["duelist", "sohei", "captain", "general", "ronin"],
  5: ["captain", "general", "champion", "oni", "duelist"],
};
WARRIOR.PLACES = ["the Ōmi border", "the Mino road", "the Kiso valley", "the Owari plain", "the Nagara ford",
  "the Ise coast road", "the Suwa shrine-road", "the Kai foothills", "the Tōtōmi march", "the Echizen pass",
  "the Mikawa woods", "the Hida highlands", "the Sagami shore", "the Shinano ridge", "the Tanba hills",
  "the Wakasa inlet", "the Nōbi plain", "the Kiso rapids", "the Ibuki slopes", "the Yōrō gorge"];
WARRIOR.SCENES = [
  { theme: "day", dest: "line", intro: "A rival column bars the road — break their line." },
  { theme: "dusk", dest: "village", intro: "Raiders are stripping a village bare. End it." },
  { theme: "night", dest: "fort", intro: "A torch-lit outpost blocks the advance. Take the gate." },
  { theme: "day", dest: "bridge", intro: "Hold the crossing — one blade at a time on the planks." },
  { theme: "dawn", dest: "muster", intro: "Their muster forms in the mist. Scatter it before it sets." },
  { theme: "dusk", dest: "shrine", intro: "Sworn men wait on the shrine-road. Cut the path clear." },
];

/* one randomised field battle at a given difficulty tier */
WARRIOR.skirmish = async function (tier, provinceName) {
  const W = WARRIOR3D; const sc = WARRIOR._rand(WARRIOR.SCENES); const pool = WARRIOR.TIER_POOL[tier] || WARRIOR.TIER_POOL[1];
  W.setTheme(sc.theme);
  await W.say(`<b>${provinceName}.</b> ${sc.intro}`, { who: "" });
  const x = Math.round((-5 + Math.random() * 9) * 10) / 10, z = Math.round((-14 + Math.random() * 4) * 10) / 10;
  await W.goto(x, z, provinceName, sc.dest);
  const n = 2 + Math.floor(Math.random() * 2) + (tier >= 4 ? 1 : 0);   // 2–4 foes; +1 in the late war
  const wave = []; for (let i = 0; i < n; i++) wave.push(WARRIOR.foe(WARRIOR._rand(pool)));
  await WARRIOR.battle(wave);
};

/* a run of provinces to conquer, with a war-camp between each */
WARRIOR.campaign = async function (regionName, provinces, tier) {
  const W = WARRIOR3D;
  await W.say(`<b>The ${regionName} campaign.</b> Your lord gives you a free hand: take it field by field, and every banner you plant grows your name.`, { big: true });
  const picks = WARRIOR.PLACES.slice();
  for (let i = 0; i < provinces; i++) {
    const place = picks.length ? picks.splice(Math.floor(Math.random() * picks.length), 1)[0] : `a nameless field`;
    W.objective(`${regionName} — province ${i + 1} of ${provinces}`);
    await WARRIOR.skirmish(tier, place);
    if (i < provinces - 1) { const cx = Math.round((-5 + Math.random() * 9) * 10) / 10;
      await W.goto(cx, -7, "the war camp", "camp");
      await WARRIOR.camp(`Province taken. Eat, rest, and <b>train</b> — the next field won't be softer.`);
    }
  }
  await W.say(`The ${regionName} is yours. Word of it runs ahead of you to the capital.`, { who: "" });
};

/* ================================================================== *
 *  THE STORY — an async director script through the 3D world
 * ================================================================== */
WARRIOR.runStory = async function () {
  const W = WARRIOR3D, st = WARRIOR.state, clan = st.clanName, you = st.name;
  W.objective("Rise to Daimyō");

  // ---------- PROLOGUE + TUTORIAL ----------
  W.setTheme("dawn");
  await W.say(`Ōmi province, the hour before dawn. You are <b>${esc(you)}</b> — nobody, a levy with a chipped blade. But every daimyō was once someone's footman.`, { big: true });
  await W.say(`<b>Move</b> with WASD or drag the <b>left</b> of the screen. <b>Look</b> by dragging the <b>right</b> (or the mouse). Follow the glowing marker to the muster.`);
  await W.goto(3, -13, "the muster ground", "muster");
  await W.say(`Sergeant Gorō looks you over. "Another stray with a grudge. Let's see if you can hold a blade — come at me."`, { who: "Sergeant Gorō" });
  await W.say(`<b>Weighty blade combat — light, heavy, and the parry.</b><br>• <b>PARRY</b> = <b>HOLD Space</b> (or hold the 🛡️ Guard/Parry button). When he winds up his blade <b>flashes</b> — <b>raise your guard on the flash and hold</b> through the blow. Time it and you <b>PARRY: he's stunned</b>. Turtle it up early and you only block. Holding drains stamina, so don't sit on it. You can't swing while guarding — <b>release, then strike</b>.<br>• <b>LIGHT ATTACK</b> = the <b>directions</b> ↑ ↓ ← → / <b>E</b> (rosette): fast, cheap — but a good foe reads a blind swing and counters.<br>• <b>HEAVY</b> = <b>R</b> (or 💥): slow and brutal — smashes a braced guard, but leaves you wide open, so use it when he's <b>not</b> swinging.<br>• When he's <b>stunned</b>, your blow is a <b>FINISHER</b>. <b>Bait → parry the flash → release → finish.</b>`, { big: true });
  await W.say(`<b>Where you cut matters — even mid-fight.</b> Whenever a blow lands: <b>↓ low</b> can hew a <b>leg</b> out from under him (he fights on from a knee); <b>← / →</b> open his sword-arm and can <b>disarm</b> him; <b>E thrust</b> punches <b>through armour</b>; <b>↑ overhead</b> cuts to the head — and on a <b>stunned</b> foe (or as a killing blow) it <b>takes his head clean off</b>. He'll turn a blind swing, though — so pick your moment.`, { big: true });
  await WARRIOR.battle([WARRIOR.foe("ashigaru", "Sergeant Gorō")], { tutorial: true });
  await W.say(`Gorō spits, and grins. "Huh. You'll do." You are ${clan} now — the lowest rung of it, but yours.`, { who: "Sergeant Gorō" });
  WARRIOR.rankUp(1, "a footman of the " + clan);

  await W.goto(-5, -7, "the campfire", "camp");
  await WARRIOR.camp(`You reach the fire as the host stirs. Your strength won't return on its own — <b>eat, rest, or sleep</b> to recover.`);

  // ---------- CH.1 — first blood at the ford ----------
  W.setTheme("day");
  await W.say(`Dawn breaks grey over the river. A rival column is fording below, and you are shoved into the front rank. "Hold the line!" the drums roar.`, { big: true });
  await W.goto(0, -11, "the shield line", "line");
  await W.say(`Your comrades lock shields to your right. They hit the line — bait each blade, parry the flash, and cut the opening.`, { who: "" });
  await WARRIOR.battle([WARRIOR.foe("looter"), WARRIOR.foe("ashigaru"), WARRIOR.foe("bandit")]);
  await W.say(`The first rank breaks — but the ford is churned red and more are wading across. Set your feet.`, { who: "" });
  await WARRIOR.battle([WARRIOR.foe("bandit"), WARRIOR.foe("ashigaru"), WARRIOR.foe("looter")]);
  await W.say(`The column breaks and runs. You are still standing — bloodied, ears ringing, alive. Men who did not know your face now nod to it.`, { who: "" });
  WARRIOR.rankUp(2, "a spear-corporal — men at your shoulder now");
  await W.goto(-6, -6, "the night camp", "camp");
  await WARRIOR.camp(`Night falls. Rest — and <b>train</b>: the foes ahead hit harder, and raw skill won't be enough. Your stats decide who walks away.`);

  // ===== ACT I — the border war (procedural campaign) =====
  await WARRIOR.campaign("Ōmi border", 4, 1);

  // ---------- CH.2 — raiders in the village ----------
  W.setTheme("day");
  await W.say(`Smoke on the wind. Kuroda's raiders are burning a farming village for grain — the same way yours went. You don't wait for orders.`, { big: true });
  await W.goto(2, -12, "the burning village", "village");
  await W.say(`Brigands are dragging rice from the stores. They turn on you, laughing. Cut them down.`, { who: "" });
  await WARRIOR.battle([WARRIOR.foe("brigand"), WARRIOR.foe("looter"), WARRIOR.foe("brigand")]);
  await W.say(`An old farmer clutches your sleeve. "You wear the ${clan} mon. My grandson — they took the boys toward the bridge. Please." You go.`, { who: "Old Farmer" });
  await W.goto(-4, -8, "the fire", "camp");
  await WARRIOR.camp(`Bind your wounds by the well. The bridge road is next.`);

  // ---------- CH.3 — hold the bridge ----------
  W.setTheme("dusk");
  await W.say(`The old wooden bridge over the gorge — the only way the raiders can drive their loot out. Hold it, and they're trapped. A spear-file forms at the far rail.`, { big: true });
  await W.goto(0, -13, "the bridge", "bridge");
  await W.say(`One at a time on the planks — the reach of a spear rules here. Time the flash; punish the opening.`, { who: "" });
  await WARRIOR.battle([WARRIOR.foe("spearman"), WARRIOR.foe("ashigaru"), WARRIOR.foe("spearman"), WARRIOR.foe("brigand")]);
  await W.say(`The last of them goes over the rail into the white water. The captive boys stumble free. Word runs up the line: the corporal held the bridge alone.`, { who: "" });
  WARRIOR.rankUp(3, "a retainer, trusted with real work");
  await W.goto(-5, -6, "the fire", "camp");
  await WARRIOR.camp(`Rest. Whet your blade — and yourself.`);

  // ===== ACT II — the Mino front (procedural campaign) =====
  await WARRIOR.campaign("Mino front", 4, 2);

  // ---------- CH.4 — the wandering duelist ----------
  W.setTheme("night");
  await W.say(`A lone swordsman waits on the road under a dead pine, blade already bare. "They say a corporal held the bridge. I collect names. Draw." No line, no shields — just the two of you.`, { who: "Wandering Duelist", big: true });
  await W.goto(1, -11, "the duelling ground", "muster");
  await W.say(`He is patient and terribly fast, and he <b>feints</b> — don't parry the first twitch. Read the real cut.`, { who: "" });
  await WARRIOR.battle([WARRIOR.foe("duelist", "Wandering Duelist")]);
  await W.say(`He sinks to one knee, astonished, and bows his head. "…A good name. Keep it." He is gone into the dark before you can answer.`, { who: "Wandering Duelist" });
  WARRIOR.rankUp(4, "a samurai in your own right");
  await W.goto(-4, -7, "the fire", "camp");
  await WARRIOR.camp(`Aya finds you at the fire. "There's darker work, if your nerve holds."`);

  // ---------- CH.5 — night work (the river fort) ----------
  W.setTheme("night");
  await W.say(`Aya deals in the work done after dark. "A rival captain holds the river fort. Tonight he dies, and the fort opens. Over the wall — quiet as you can, but if they wake, cut your way through."`, { who: "Aya" });
  await W.goto(2, -14, "the fort wall", "fort");
  await W.say(`The palisade looms — a torch-lit gate. A guard turns at the last instant. Take him fast, before he shouts.`, { who: "" });
  await WARRIOR.battle([WARRIOR.foe("guard", "Gate Guard"), WARRIOR.foe("guard", "Roused Guard")]);
  await W.say(`A bell begins to toll — they're awake. The captain is already on his feet in the yard, blade drawn, unafraid.`, { who: "" });
  await WARRIOR.battle([WARRIOR.foe("captain", "Guard Captain")]);
  await W.say(`The captain falls and the fort's heart goes out of it. By dawn it flies ${clan} colours. Aya regards you with something close to respect. "Now you're worth a name."`, { who: "Aya" });
  WARRIOR.rankUp(5, "a squad leader — a banner of your own");
  await W.goto(-5, -6, "the fire", "camp");
  await WARRIOR.camp(`Sleep in a taken fort. Train hard — the mountain temple ahead does not forgive.`);

  // ---------- CH.6 — the warrior monks ----------
  W.setTheme("dusk");
  await W.say(`The enemy has bought the sōhei — warrior monks of the mountain temple, and they do not sell cheaply. Naginatas gleam on the temple steps. There is no way around.`, { big: true });
  await W.goto(0, -12, "the temple steps", "shrine");
  await W.say(`They fight with long, heavy sweeps — stay patient, parry the arc, and get inside the reach to answer.`, { who: "" });
  await WARRIOR.battle([WARRIOR.foe("sohei"), WARRIOR.foe("sohei")]);
  await W.say(`The abbot himself blocks the gate, calm as still water. "Prove your cause is worth their bones." He raises the naginata.`, { who: "Abbot" });
  await WARRIOR.battle([WARRIOR.foe("sohei", "The Abbot")]);
  await W.say(`The abbot lowers his blade and steps aside. "Pass. And carry them lightly." The temple bell rings once behind you.`, { who: "Abbot" });
  WARRIOR.rankUp(6, "a hatamoto — a bannerman of the lord");
  await W.goto(-4, -7, "the fire", "camp");
  await WARRIOR.camp(`Rest under the temple eaves. The plain beyond is a patchwork of contested fields — clear them.`);

  // ===== ACT III — the Owari plain (procedural campaign) =====
  await WARRIOR.campaign("Owari plain", 5, 3);

  // ---------- CH.7 — the rival general ----------
  W.setTheme("day");
  await W.say(`A rival general has drawn up his best on the open plain to end your rise before it becomes a threat. His guard forms a wall of blades. You lead the charge.`, { big: true });
  await W.goto(0, -11, "the enemy line", "line");
  await W.say(`Break his household guard first — then the general has nowhere to stand.`, { who: "" });
  await WARRIOR.battle([WARRIOR.foe("ashigaru"), WARRIOR.foe("ronin"), WARRIOR.foe("spearman"), WARRIOR.foe("ronin")]);
  await W.say(`His guard is shattered. The general spurs forward himself, ivory war-fan snapping shut. "Upstart. I've buried better than you."`, { who: "Rival General" });
  await WARRIOR.battle([WARRIOR.foe("general", "Rival General")]);
  await W.say(`The general topples from the saddle and the plain is yours. Your lord sends his own sword-token in thanks — you command wings of the army now.`, { who: "" });
  WARRIOR.rankUp(7, "a bugyō — a commander of men");
  await W.goto(-5, -6, "the fire", "camp");
  await WARRIOR.camp(`Recover. The road north to the Ash-Maker runs through a dozen contested fields — take them, one by one.`);

  // ===== ACT IV — the northern march (procedural campaign) =====
  await WARRIOR.campaign("northern march", 5, 4);

  // ---------- CH.8 — the mountain pass ----------
  W.setTheme("dusk");
  await W.say(`The pass into Kuroda's country is a knife of stone, and he has salted it with rōnin sworn to die on it. Climb, and cut them loose from the road.`, { big: true });
  await W.goto(1, -13, "the high pass", "shrine");
  await W.say(`Loose scree, a long drop, and blades from every rock. Footing and patience — don't overreach.`, { who: "" });
  await WARRIOR.battle([WARRIOR.foe("ronin"), WARRIOR.foe("duelist"), WARRIOR.foe("ronin"), WARRIOR.foe("brigand")]);
  await W.say(`The last body slides off the path into the cloud below. Above you, torchlight — Kuroda's shrine-camp. He knows you're coming.`, { who: "" });
  WARRIOR.rankUp(8, "a taishō — a general in your own right");
  await W.goto(-4, -7, "the fire", "camp");
  await WARRIOR.camp(`The last fire before the summit. Eat well. Spend every skill point you've earned. What waits above will not be easy.`);

  // ---------- CH.9 — the Ash-Maker's vanguard ----------
  W.setTheme("night");
  await W.say(`Kuroda's vanguard holds the burnt shrine-town under a red moon — and at its heart, an oni-masked killer he keeps for men exactly like you.`, { big: true });
  await W.goto(0, -12, "the burnt town", "village");
  await W.say(`Cut through his vanguard to reach the steps.`, { who: "" });
  await WARRIOR.battle([WARRIOR.foe("brigand"), WARRIOR.foe("ronin"), WARRIOR.foe("duelist")]);
  await W.say(`The oni-mask steps over his own men, saying nothing. Whatever face was under it, Kuroda burned away long ago.`, { who: "" });
  await WARRIOR.battle([WARRIOR.foe("oni", "Oni-Masked Killer")]);
  await W.say(`The mask cracks on the stones. Only the steps remain now — and the man at the top of them.`, { who: "" });
  WARRIOR.rankUp(9, "a karō — chief retainer of the clan");
  await W.goto(-4, -7, "the shrine fire", "camp");
  await WARRIOR.camp(`The shrine steps are close. Steady yourself. This is the reckoning you have carried since the smoke came over your ridge.`);

  // ---------- CH.10 — the Champion and the Ash-Maker ----------
  W.setTheme("dusk");
  await W.say(`The enemy Champion bars the steps — a giant in black lacquer. Behind him, a man with a burn scar down one cheek watches, and laughs.`, { who: "" });
  await W.goto(1, -13, "the shrine steps", "shrine");
  await WARRIOR.battle([WARRIOR.foe("champion", "Enemy Champion")]);
  await W.say(`The Champion crashes down. Kuroda stops laughing. "So the little farm-boy grew teeth. I remember your village. They blur together after a while."`, { who: "Kuroda" });
  await W.say(`He is faster than the Champion, and there is no one left between you. Everything — every fire, every rank, every scar — was the road to this breath.`, { who: "" });
  await WARRIOR.battle([WARRIOR.foe("kuro", "Kuroda the Ash-Maker")]);

  // ---------- FINALE — become daimyō ----------
  W.setTheme("day");
  await W.say(`Kuroda folds around your blade and goes still among the ash of a hundred villages. The valley is yours; ${clan} banners climb the shrine as the mist burns off.`, { who: "", big: true });
  await W.say(`Aya finds you on the steps. "It's done. And you — you're no footman now. The lord is dead without heir, and the retainers look to the one who took the valley." She kneels. "They look to you."`, { who: "Aya" });
  WARRIOR.rankUp(10, "proclaimed lord of the clan");
  await W.say(`You sheathe the chipped blade your father gave you. It has carried you from a rice paddy to this — <b>daimyō</b> of the ${clan}. The war is not over. But the ash is answered, and the road runs on.`, { big: true });

  // ---------- POST-GAME — endless border wars (the open world) ----------
  let won = 0;
  while (WARRIOR3D._e) {
    const pick = await W.say(`⚔ <b>Way of the Warrior — complete.</b> The realm always has enemies. Ride out on endless border wars for glory without end${won ? ` — <b>${won}</b> won since` : ""}.`,
      { choices: ["🏇 Ride to the next war", "🌱 Begin a new life", "⛩️ Rest at your castle (menu)"] });
    if (pick === 1) { WARRIOR3D.leave(); WARRIOR.open(); return; }
    if (pick === 2) { WARRIOR.toTitle(); return; }
    await WARRIOR.skirmish(5, WARRIOR._rand(WARRIOR.PLACES));
    if (!WARRIOR3D._e) return;
    won++;
    const cx = Math.round((-5 + Math.random() * 9) * 10) / 10;
    await W.goto(cx, -7, "your war camp", "camp");
    await WARRIOR.camp(`Another field won. Recover — then ride again, or rest.`);
  }
};

/* ---------- title-screen wiring (additive; no ui.js edits) ---------- */
if (typeof document !== "undefined") {
  document.addEventListener("DOMContentLoaded", () => { const b = document.getElementById("warrior-btn"); if (b) b.onclick = () => WARRIOR.open(); });
}

if (typeof module !== "undefined") module.exports = WARRIOR;
