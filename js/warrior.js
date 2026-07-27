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
  ashigaru: { name: "Ashigaru", jp: "足軽", icon: "⚔️", hp: 34, st: 10, atk: 6, guard: 6, blurb: "A conscript spearman — dogged and tough. You start at the very bottom." },
  samurai:  { name: "Samurai", jp: "侍", icon: "🗡️", hp: 38, st: 11, atk: 8, guard: 6, blurb: "Blade-born bushi, raised to the sword and the code. Balanced and deadly." },
  ronin:    { name: "Rōnin", jp: "浪人", icon: "🥷", hp: 30, st: 13, atk: 9, guard: 4, blurb: "Masterless and hungry. Fast and ferocious — but you bruise easily." },
  archer:   { name: "Yumi", jp: "弓", icon: "🏹", hp: 30, st: 12, atk: 6, guard: 4, blurb: "A bowman's eye. You open fights from range — pray it doesn't get close." },
  teppo:    { name: "Teppō", jp: "鉄砲", icon: "🔫", hp: 28, st: 10, atk: 10, guard: 4, blurb: "The new fire from the west. Deadly, but you must live long enough to reload." },
  cavalry:  { name: "Rider", jp: "騎馬", icon: "🐎", hp: 40, st: 11, atk: 8, guard: 5, blurb: "Thunder on hooves — hard to bring down once you're moving." },
};

/* the ladder — the top is DAIMYŌ */
WARRIOR.RANKS = [
  { name: "Nameless", jp: "無名" }, { name: "Footman", jp: "足軽" }, { name: "Retainer", jp: "郎党" },
  { name: "Samurai", jp: "侍" }, { name: "Hatamoto", jp: "旗本" }, { name: "Taishō", jp: "大将" }, { name: "Daimyō", jp: "大名" },
];

/* foe templates — skill sets the parry window; tuned to be demanding */
WARRIOR.FOES = {
  bandit:   { name: "Bandit", hp: 20, dmg: 7, skill: 0.62, aggr: 0.72, color: 0x6a5a3a },
  looter:   { name: "Looter", hp: 18, dmg: 7, skill: 0.58, aggr: 0.78, color: 0x5a4a34 },
  ashigaru: { name: "Enemy Ashigaru", hp: 26, dmg: 8, skill: 0.66, aggr: 0.72, color: 0x4a5a3a },
  ronin:    { name: "Rōnin Blade", hp: 30, dmg: 10, skill: 0.8, aggr: 0.9, color: 0x3a3a3a },
  guard:    { name: "Gate Guard", hp: 34, dmg: 9, skill: 0.74, aggr: 0.64, color: 0x40506a },
  captain:  { name: "Guard Captain", hp: 48, dmg: 12, skill: 0.86, aggr: 0.84, color: 0x5a2f2a },
  champion: { name: "Enemy Champion", hp: 66, dmg: 14, skill: 0.9, aggr: 0.86, color: 0x3a2a4a },
  kuro:     { name: "Kuroda the Ash-Maker", hp: 84, dmg: 16, skill: 0.95, aggr: 0.92, color: 0x2a2a2a },
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
  WARRIOR3D.enter({ theme: "dawn", onExit: () => WARRIOR.toTitle(),
    player: { maxHp: u.hp, hp: u.hp, maxSt: u.st, atk: u.atk, guard: u.guard, unit: p.unit, food: 80, rest: 80 } });
  WARRIOR.runStory().catch(() => {});
};

/* ---------- helpers ---------- */
WARRIOR.foe = function (key, name) { const f = Object.assign({}, WARRIOR.FOES[key]); if (name) f.name = name; return f; };

WARRIOR.camp = async function (intro) {
  const W = WARRIOR3D;
  if (W.campfire) W.campfire(true);
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
  if (W.campfire) W.campfire(false);
};

/* spend skill points to upgrade your warrior */
WARRIOR.train = async function () {
  const W = WARRIOR3D;
  while (WARRIOR3D._e) {
    const s = W.stats(); if (!s) return;
    if (s.sp <= 0) { await W.say("No skill points to spend yet — win battles and rise in rank to earn them.", { choices: ["‹ Back"] }); return; }
    const pick = await W.say(`🎖️ <b>Train</b> — ${s.sp} skill point${s.sp > 1 ? "s" : ""} to spend.<br>Attack ${s.atk} · Vitality ${s.maxHp} · Stamina ${s.maxSt} · Guard ${s.guard}.`,
      { choices: ["🗡️ +1 Attack", "❤️ +4 Vitality", "⚡ +2 Stamina", "🛡️ +1 Guard", "‹ Back"] });
    if (pick === 0) { W.buff({ atk: 1 }); W.addSp(-1); W.banner("🎖️ Attack up"); }
    else if (pick === 1) { W.buff({ maxHp: 4 }); W.addSp(-1); W.banner("🎖️ Vitality up"); }
    else if (pick === 2) { W.buff({ maxSt: 2 }); W.addSp(-1); W.banner("🎖️ Stamina up"); }
    else if (pick === 3) { W.buff({ guard: 1 }); W.addSp(-1); W.banner("🎖️ Guard up"); }
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
 *  THE STORY — an async director script through the 3D world
 * ================================================================== */
WARRIOR.runStory = async function () {
  const W = WARRIOR3D, st = WARRIOR.state, clan = st.clanName, you = st.name;
  W.objective("Rise to Daimyō");

  // ---------- PROLOGUE + TUTORIAL ----------
  W.setTheme("dawn");
  await W.say(`Ōmi province, the hour before dawn. You are <b>${esc(you)}</b> — nobody, a levy with a chipped blade. But every daimyō was once someone's footman.`, { big: true });
  await W.say(`<b>Move</b> with WASD or drag the <b>left</b> of the screen. <b>Look</b> by dragging the <b>right</b> (or the mouse). Follow the glowing marker to the muster.`);
  await W.goto(3, -13, "the muster ground");
  await W.say(`Sergeant Gorō looks you over. "Another stray with a grudge. Let's see if you can hold a blade — come at me."`, { who: "Sergeant Gorō" });
  await W.say(`<b>How to fight — blend attack &amp; defence.</b> When he strikes, a <b>direction</b> flashes: parry that same way (overhead ↑, low ↓, left ←, right →, thrust E). Parrying <b>cracks his guard</b>. In the gaps between his blows, <b>press your own attacks</b> (the same direction keys/buttons) to batter his guard down — he'll turn a blade or two, so vary your line. When his <b>guard breaks</b>, cut the opening for a heavy blow. Every move costs <b>stamina</b>, and the bow holds only a few arrows — you can't spam your way to victory. Read him.`, { big: true });
  await WARRIOR.battle([WARRIOR.foe("ashigaru", "Sergeant Gorō")], { tutorial: true });
  await W.say(`Gorō spits, and grins. "Huh. You'll do." You are ${clan} now — the lowest rung of it, but yours.`, { who: "Sergeant Gorō" });
  WARRIOR.rankUp(1, "a footman of the " + clan);

  await W.goto(-5, -7, "the campfire");
  await WARRIOR.camp(`You reach the fire as the host stirs. Your strength won't return on its own — <b>eat, rest, or sleep</b> to recover.`);

  // ---------- CH.1 — first blood on the field ----------
  W.setTheme("day");
  await W.say(`Dawn breaks grey over the river. A rival column is fording below, and you are shoved into the front rank. "Hold the line!" the drums roar.`, { big: true });
  await W.goto(0, -11, "the shield line");
  W.landmark("shieldwall", 6, -12);
  await W.say(`Your comrades lock shields to your right. They hit the line — parry each blade, break his guard, and strike.`, { who: "" });
  await WARRIOR.battle([WARRIOR.foe("looter"), WARRIOR.foe("ashigaru"), WARRIOR.foe("bandit")]);
  await W.say(`The column breaks and runs. You are still standing — bloodied, ears ringing, alive. Men who did not know your face now nod to it.`, { who: "" });
  WARRIOR.rankUp(2, "a retainer, trusted with real work");
  await W.goto(-6, -6, "the night camp");
  await WARRIOR.camp(`Night falls. Rest — tomorrow's work is quieter, and deadlier.`);

  // ---------- CH.2 — night work (assassination) ----------
  W.setTheme("night");
  await W.say(`A woman in grey finds you — Aya, who deals in the work done after dark. "A rival captain holds the river fort. Tonight he dies, and the fort opens. You have a talent for staying alive; prove you have one for endings."`, { who: "Aya" });
  await W.say(`She nods to the treeline. "Over the wall. Quiet as you can — but if they wake, cut your way through."`, { who: "Aya" });
  await W.goto(2, -14, "the fort wall");
  W.landmark("fort", 2, -18);
  await W.say(`The palisade looms — a torch-lit fort gate. A guard turns at the last instant. Take him — fast.`, { who: "" });
  await WARRIOR.battle([WARRIOR.foe("guard", "Gate Guard")]);
  await W.say(`Inside, the captain is already on his feet, blade drawn. He is fast, and he is not afraid.`, { who: "" });
  await WARRIOR.battle([WARRIOR.foe("captain", "Guard Captain")]);
  await W.say(`The captain falls and the fort's heart goes out of it. By dawn it flies ${clan} colours. Aya regards you with something close to respect. "Now you're worth a name."`, { who: "Aya" });
  WARRIOR.rankUp(3, "a samurai in your own right");
  await W.goto(-5, -6, "the fire");
  await WARRIOR.camp(`Recover. Aya has one more road for you — the one you've carried since your village burned.`);

  // ---------- CH.3 — the Ash-Maker ----------
  W.setTheme("dusk");
  await W.say(`"Kuroda the Ash-Maker rides with the enemy now," Aya says. "A mountain shrine, north. Cut through his raiders — and finish it."`, { who: "Aya", big: true });
  await W.goto(0, -12, "the shrine road");
  await W.say(`His raiders boil out of the treeline. Carve the path yourself.`, { who: "" });
  await WARRIOR.battle([WARRIOR.foe("bandit"), WARRIOR.foe("ronin"), WARRIOR.foe("looter"), WARRIOR.foe("ronin")]);
  WARRIOR.rankUp(4, "a hatamoto — a bannerman");
  await W.goto(-4, -7, "a shrine of stone");
  await WARRIOR.camp(`The shrine steps are close. Steady yourself — what waits above will not be easy.`);
  await W.say(`The enemy Champion bars the steps — a giant in black lacquer. Behind him, a man with a burn scar down one cheek watches, and laughs.`, { who: "" });
  await W.goto(1, -13, "the shrine steps");
  await WARRIOR.battle([WARRIOR.foe("champion", "Enemy Champion")]);
  await W.say(`The Champion crashes down. Kuroda stops laughing. "So the little farm-boy grew teeth. I remember your village. They blur together after a while."`, { who: "Kuroda" });
  await W.say(`He is faster than the Champion, and there is no one left between you. This is the moment you have carried since the smoke came over the ridge.`, { who: "" });
  await WARRIOR.battle([WARRIOR.foe("kuro", "Kuroda the Ash-Maker")]);

  // ---------- FINALE — become daimyō ----------
  W.setTheme("day");
  await W.say(`Kuroda folds around your blade and goes still among the ash of a hundred villages. The valley is yours; ${clan} banners climb the shrine as the mist burns off.`, { who: "", big: true });
  await W.say(`Aya finds you on the steps. "It's done. And you — you're no footman now. The lord is dead without heir, and the retainers look to the one who took the valley." She kneels. "They look to you."`, { who: "Aya" });
  WARRIOR.rankUp(6, "proclaimed lord of the clan");
  await W.say(`You sheathe the chipped blade your father gave you. It has carried you from a rice paddy to this — <b>daimyō</b> of the ${clan}. The war is not over. But the ash is answered, and the road runs on.`, { big: true });
  const again = await W.say(`⚔ <b>Way of the Warrior — complete.</b>`, { choices: ["Begin a new life", "Return to menu"] });
  if (again === 0) { WARRIOR3D.leave(); WARRIOR.open(); } else WARRIOR.toTitle();
};

/* ---------- title-screen wiring (additive; no ui.js edits) ---------- */
if (typeof document !== "undefined") {
  document.addEventListener("DOMContentLoaded", () => { const b = document.getElementById("warrior-btn"); if (b) b.onclick = () => WARRIOR.open(); });
}

if (typeof module !== "undefined") module.exports = WARRIOR;
