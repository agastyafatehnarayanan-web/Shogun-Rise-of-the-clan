/* =====================================================================
 * warrior.js — "WAY OF THE WARRIOR" — a standalone story mode.
 *
 * A separate experience from the grand-strategy game: you are ONE person
 * — a footman, a bushi, a rōnin — who swears service to a clan and lives
 * a personal Sengoku story. Rise through the ranks, fight duels, wade
 * into battle, and hunt the man who burned your home.
 *
 * This module is fully self-contained. It renders into #warrior-screen and
 * never touches SR / GAME / the strategy state. It reads DATA.clans only
 * for clan names and colours. All DOM access is inside functions so the
 * file can be require()'d headless for logic tests.
 * ===================================================================== */

const WARRIOR = {};

/* ------------------------------------------------------------------ *
 *  ARCHETYPES — the kind of warrior you are
 * ------------------------------------------------------------------ */
WARRIOR.UNITS = {
  ashigaru: { name: "Ashigaru", jp: "足軽", icon: "⚔️", hp: 30, ki: 8, atk: 5, guard: 4,
    blurb: "A conscript spearman — the backbone of every host. Tough and dogged; you start at the very bottom and earn your name in blood." },
  samurai: { name: "Samurai", jp: "侍", icon: "🗡️", hp: 34, ki: 9, atk: 7, guard: 6,
    blurb: "Blade-born bushi, raised to the sword and the code. Balanced, disciplined, deadly in a duel." },
  ronin: { name: "Rōnin", jp: "浪人", icon: "🥷", hp: 27, ki: 12, atk: 9, guard: 3,
    blurb: "Masterless and hungry. No lord, no land — only your sword. Fast and ferocious, but you bruise easily." },
  archer: { name: "Yumi", jp: "弓", icon: "🏹", hp: 27, ki: 9, atk: 6, guard: 4,
    blurb: "A bowman's eye and a steady hand. You open every fight from range — but pray it doesn't get close." },
  teppo: { name: "Teppō", jp: "鉄砲", icon: "🔫", hp: 25, ki: 8, atk: 10, guard: 3,
    blurb: "The new fire from the west. One volley can end a champion — if you live long enough to reload." },
  cavalry: { name: "Rider", jp: "騎馬", icon: "🐎", hp: 36, ki: 10, atk: 8, guard: 5,
    blurb: "Thunder on hooves. Shock, weight, and reach — hard to bring down once you're moving." },
};

/* ------------------------------------------------------------------ *
 *  RANKS — the ladder you climb on renown
 * ------------------------------------------------------------------ */
WARRIOR.RANKS = [
  { name: "Nameless", jp: "無名", need: 0 },
  { name: "Footman", jp: "足軽", need: 3 },
  { name: "Retainer", jp: "郎党", need: 8 },
  { name: "Samurai", jp: "侍", need: 15 },
  { name: "Hatamoto", jp: "旗本", need: 25 },
  { name: "Taishō", jp: "大将", need: 40 },
  { name: "General", jp: "軍神", need: 60 },
];

WARRIOR.rankFor = function (renown) {
  let r = WARRIOR.RANKS[0], idx = 0;
  for (let i = 0; i < WARRIOR.RANKS.length; i++) {
    if (renown >= WARRIOR.RANKS[i].need) { r = WARRIOR.RANKS[i]; idx = i; }
  }
  return { rank: r, idx };
};

/* ------------------------------------------------------------------ *
 *  FOES — enemy templates. skill sets the parry/telegraph window.
 * ------------------------------------------------------------------ */
WARRIOR.FOES = {
  bandit:   { name: "Bandit", icon: "🪓", hp: 20, dmg: 7, skill: 0.62, aggr: 0.72 },
  looter:   { name: "Looter", icon: "🔪", hp: 18, dmg: 7, skill: 0.58, aggr: 0.75 },
  ashigaru: { name: "Enemy Ashigaru", icon: "⚔️", hp: 26, dmg: 8, skill: 0.66, aggr: 0.7 },
  ronin:    { name: "Rōnin Blade", icon: "🥷", hp: 30, dmg: 10, skill: 0.8, aggr: 0.9 },
  guard:    { name: "Gate Guard", icon: "🛡️", hp: 34, dmg: 9, skill: 0.74, aggr: 0.62 },
  captain:  { name: "Guard Captain", icon: "🗡️", hp: 46, dmg: 12, skill: 0.85, aggr: 0.82 },
  duelist:  { name: "Sword Saint's Pupil", icon: "🎏", hp: 42, dmg: 11, skill: 0.9, aggr: 0.8 },
  champion: { name: "Enemy Champion", icon: "👹", hp: 62, dmg: 14, skill: 0.88, aggr: 0.85 },
  kuro:     { name: "Kuroda the Ash-Maker", icon: "💀", hp: 78, dmg: 16, skill: 0.95, aggr: 0.92 },
};

/* ================================================================== *
 *  THE STORY — scenes keyed by id. Each scene is one of:
 *    story    : narrative text + optional choices (each choice -> to)
 *    exchange : turn-based read-the-foe duel (teaches combat)
 *    duel     : real-time first-person duel
 *    melee    : surrounded battlefield fight
 *    rankcheck: award renown, maybe rank up, then continue
 *    ending   : the finale card
 *  Scenes reference the chosen clan via {CLAN} / {LORD} tokens.
 * ================================================================== */
WARRIOR.buildStory = function (clanName, lordName, unitName) {
  const S = {};

  // ---------- PROLOGUE — the burning village ----------
  S["p.intro"] = { type: "story", chapter: "Prologue — Ash", art: "🔥",
    text: [
      `Rain has not come to Ōmi for a month, and the sky over your village is the colour of old iron.`,
      `You are nobody — a ${unitName.toLowerCase()} in the making, a pair of hands in a rice paddy. Then the smoke comes over the ridge, and with it men on foot with torches and blades. Ronin. Ash-makers. They burn what they cannot carry.`,
      `Your father presses a chipped blade into your hands. "Live," he says. That is the whole of his teaching.`,
    ],
    choices: [{ label: "Grip the blade →", to: "p.firstblood" }] };

  S["p.firstblood"] = { type: "exchange", chapter: "Prologue — Ash",
    foe: "looter", intro: "A looter turns from the burning storehouse, grinning, and comes at you. Read him. Guard where he strikes.",
    onWin: "p.after", onLose: "p.after" };

  S["p.after"] = { type: "story", chapter: "Prologue — Ash", art: "🌫️",
    text: [
      `The looter falls. Your hands will not stop shaking. When the smoke clears at dawn, the village is gone — and so is your father.`,
      `A tall man in scorched armour had led them, a burn scar down one cheek, laughing as the roofs came down. The other survivors whisper a name: <b>Kuroda the Ash-Maker</b>.`,
      `You cannot avenge anyone as you are — one blade, no lord, no name. But the banners of the <b>${clanName}</b> fly a day's walk east, and they are taking men.`,
    ],
    choices: [{ label: "Walk east, to the ${CLAN} muster.", to: "c1.muster" }] };

  // ---------- CHAPTER 1 — the muster ----------
  S["c1.muster"] = { type: "story", chapter: "One — The Muster", art: "🏯",
    text: [
      `The ${clanName} camp is a sea of banners and cook-smoke. A grizzled sergeant looks you up and down, unimpressed.`,
      `"Another stray with a grudge. Fine. You eat when you earn it, you live if you're quick." He tosses you a spear. "First, prove you won't run."`,
      `A brawler called Gorō — thick as a temple door — steps into the ring. The men want a show.`,
    ],
    choices: [
      { label: "Fight clean — earn their respect.", to: "c1.goro", note: "honour" },
      { label: "Fight dirty — win at any cost.", to: "c1.goro", note: "ruthless" },
    ] };

  S["c1.goro"] = { type: "exchange", chapter: "One — The Muster",
    foe: "ashigaru", intro: "Gorō telegraphs like a falling tree — but he hits like one too. Watch his shoulders and guard the right line.",
    onWin: "c1.won", onLose: "c1.won" };

  S["c1.won"] = { type: "rankcheck", chapter: "One — The Muster", renown: 3,
    text: `You leave Gorō sitting in the dust. The sergeant almost smiles. "Huh. You'll do." You are ${clanName} now — the lowest rung of it, but yours.`,
    to: "c1.firstbattle.pre" };

  S["c1.firstbattle.pre"] = { type: "story", chapter: "One — The Muster", art: "⚔️",
    text: [
      `Word comes at dawn: a rival column is fording the river below. The ${clanName} host forms up, and you are shoved into the front rank with a hundred other nameless men.`,
      `"Hold the line," the sergeant roars over the drums. "Cut down anything that comes through it."`,
      `Then the enemy hits, and the world narrows to the reach of your spear.`,
    ],
    choices: [{ label: "Brace. Here they come →", to: "c1.melee" }] };

  S["c1.melee"] = { type: "melee", chapter: "One — The Muster",
    intro: "Enemies close from every side. Tap a foe to cut them down before they strike. Don't let them surround you.",
    kills: 8, foes: ["ashigaru", "looter", "bandit"], onWin: "c1.aftermath", onLose: "c1.aftermath" };

  S["c1.aftermath"] = { type: "rankcheck", chapter: "One — The Muster", renown: 4,
    text: `The enemy column breaks and runs. You are still standing — bloodied, ears ringing, alive. Around the fire that night, men who did not know your face now nod to it.`,
    to: "c2.summons" };

  // ---------- CHAPTER 2 — night work (stealth / assassination) ----------
  S["c2.summons"] = { type: "story", chapter: "Two — Night Work", art: "🌙",
    text: [
      `You are summoned — not by the sergeant, but by a quiet woman in grey who serves the ${clanName} lord's shadow. Her name is Aya, and she deals in the work done after dark.`,
      `"A rival captain holds the river fort," she says. "Tonight he dies, and the fort opens like a gate. You have a talent for staying alive. Prove you have a talent for endings too."`,
      `She offers you a black hood. Beyond the treeline, torches move along the fort's palisade.`,
    ],
    choices: [
      { label: "Take the hood. Go over the wall.", to: "c2.infil" },
      { label: "Ask why you — why not a trained shinobi?", to: "c2.why" },
    ] };

  S["c2.why"] = { type: "story", chapter: "Two — Night Work", art: "🌙",
    text: [
      `Aya's mouth twitches. "Because a trained shinobi has a face the enemy knows. You are still nobody. Nobody walks anywhere."`,
      `She presses the hood into your hands. "Kuroda the Ash-Maker rides with the enemy now. Do this well, and I will put you on the road to him."`,
      `Your grip tightens at the name.`,
    ],
    choices: [{ label: "Go over the wall.", to: "c2.infil" }] };

  S["c2.infil"] = { type: "story", chapter: "Two — Night Work", art: "🥷",
    text: [
      `You drop into the fort's shadow. A guard leans on his spear at the corner, half-asleep. The keep — and the captain — lie past him.`,
    ],
    choices: [
      { label: "Slip past in the dark (quiet, risky).", to: "c2.slip" },
      { label: "Silence the guard first (sure, but if you botch it, alarm).", to: "c2.silence" },
    ] };

  S["c2.slip"] = { type: "story", chapter: "Two — Night Work", art: "🥷",
    text: [
      `You breathe with the wind and move between the torch-pools. The guard never turns. The keep door yields to Aya's iron pick.`,
      `Inside, the captain sharpens his blade alone by lamplight. He hears the floorboard. He is not asleep, and he is not slow.`,
    ],
    choices: [{ label: "Draw. This is a duel now.", to: "c2.captain" }] };

  S["c2.silence"] = { type: "exchange", chapter: "Two — Night Work",
    foe: "guard", intro: "The guard turns at the last instant. Take him fast and quiet — read the strike and end it before he can shout.",
    onWin: "c2.captain", onLose: "c2.captain.loud" };

  S["c2.captain.loud"] = { type: "story", chapter: "Two — Night Work", art: "🔔",
    text: [`The guard's shout dies in his throat, but not before it carries. A bell begins to toll. No more shadows — now it is only speed and steel. You kick in the keep door.`],
    choices: [{ label: "Face the captain →", to: "c2.captain" }] };

  S["c2.captain"] = { type: "duel", chapter: "Two — Night Work",
    foe: "captain", intro: "The Guard Captain is fast and precise. Watch his blade: PARRY at the flash for a riposte, DODGE to spend stamina and slip aside, GUARD to weather it. Strike when he's open.",
    onWin: "c2.done", onLose: "c2.fail" };

  S["c2.fail"] = { type: "story", chapter: "Two — Night Work", art: "🩸",
    text: [`Steel finds you. You reel back down the stair, half-blind — but Aya's second blade finds the captain's throat from the dark. "Sloppy," she mutters, hauling you up. "But he's dead, and so is the fort's resolve. Live, and get better."`],
    choices: [{ label: "Withdraw into the night.", to: "c2.done" }] };

  S["c2.done"] = { type: "rankcheck", chapter: "Two — Night Work", renown: 6,
    text: `The captain falls and the fort's heart goes out of it; by dawn it flies ${clanName} colours without another blow. Aya regards you with something close to respect. "Now you're worth a name. And I keep my promises — Kuroda is next."`,
    to: "c3.trail" };

  // ---------- CHAPTER 3 — the trail & the rival ----------
  S["c3.trail"] = { type: "story", chapter: "Three — The Ash-Maker", art: "🏔️",
    text: [
      `Seasons turn. You are ${clanName} steel now, trusted with real work, and every road you ride you ask the same question: where is Kuroda?`,
      `Aya finds him first. "A mountain shrine, two days north. He's gathered his ash-makers and thrown in with the enemy's champion for a raid on our valley. If you want him, it's there — but you'll have to cut through a battle to reach him."`,
    ],
    choices: [
      { label: "Ride now, alone and fast.", to: "c3.ambush", note: "ruthless" },
      { label: "Bring a picked band — do it right.", to: "c3.battle.pre", note: "honour" },
    ] };

  S["c3.ambush"] = { type: "story", chapter: "Three — The Ash-Maker", art: "🌲",
    text: [`You ride alone through the night passes and hit the shrine road at dawn — but Kuroda's scouts are no fools. Bandits boil out of the treeline. You'll carve the path yourself.`],
    choices: [{ label: "Cut through them →", to: "c3.melee" }] };

  S["c3.battle.pre"] = { type: "story", chapter: "Three — The Ash-Maker", art: "🚩",
    text: [`Your picked band crests the ridge as the two hosts collide in the valley below. Somewhere in that storm of banners is Kuroda. "Stay at my shoulder," you tell them, "and carve me a road to the man with the burned face."`],
    choices: [{ label: "Into the storm →", to: "c3.melee" }] };

  S["c3.melee"] = { type: "melee", chapter: "Three — The Ash-Maker",
    intro: "The enemy comes in waves. Cut a path through — reach the shrine steps.",
    kills: 12, foes: ["ashigaru", "ronin", "bandit", "looter"], onWin: "c3.champion.pre", onLose: "c3.champion.pre" };

  S["c3.champion.pre"] = { type: "story", chapter: "Three — The Ash-Maker", art: "👹",
    text: [
      `You reach the shrine steps — and the enemy Champion bars them, a giant in black lacquer with a blade like a barn door.`,
      `Behind him, on the shrine terrace, a man with a burn scar down one cheek watches and laughs. Kuroda. Still laughing, after all these years.`,
      `The Champion will not let you pass.`,
    ],
    choices: [{ label: "Break him.", to: "c3.champion" }] };

  S["c3.champion"] = { type: "duel", chapter: "Three — The Ash-Maker",
    foe: "champion", intro: "The Champion is huge and hits like a rockfall — but he's a beat slow. Weather the big blows with GUARD, DODGE what you can't, and PARRY to open him up. Patience.",
    onWin: "c3.kuro.pre", onLose: "c3.champion" };

  S["c3.kuro.pre"] = { type: "story", chapter: "Three — The Ash-Maker", art: "💀",
    text: [
      `The Champion crashes down across the steps. Kuroda stops laughing.`,
      `"So the little farm-boy grew teeth," he says, drawing a blackened blade. "I remember your village. I remember all of them. They blur together after a while."`,
      `He is faster than the Champion, and there is no one left between you. This is the moment you have carried since the smoke came over the ridge.`,
    ],
    choices: [{ label: "For your father. For the ash.", to: "c3.kuro" }] };

  S["c3.kuro"] = { type: "duel", chapter: "Three — The Ash-Maker",
    foe: "kuro", intro: "Kuroda the Ash-Maker — fast, vicious, and without mercy. Everything you have learned comes to this: read his blade, punish every opening, and do not flinch.",
    onWin: "end.win", onLose: "end.lose" };

  // ---------- ENDINGS ----------
  S["end.win"] = { type: "ending", chapter: "The Way", art: "🌅", win: true,
    text: [
      `Kuroda folds around your blade and goes down among the ash of a hundred villages, and is still.`,
      `The valley is yours — the ${clanName} banners advance over the shrine as the sun burns off the mist. Aya finds you on the steps. "It's done," she says quietly. "So — what now, ${unitName}? A man with your name could go far. Perhaps all the way to a lord's own council."`,
      `You sheathe the chipped blade your father gave you. It has carried you from a rice paddy to this. The war is not over. But the ash is answered — and your road runs on.`,
    ] };

  S["end.lose"] = { type: "ending", chapter: "The Way", art: "🌑", win: false,
    text: [
      `Kuroda is faster, this time. You fall on the shrine steps within reach of the man you swore to kill, and the laughter follows you down into the dark.`,
      `But a story is not ended by one death. The ${clanName} host still climbs the valley behind you, and other hands will take up the blade. Rest, warrior — and when you are ready, walk the road again from the beginning, and this time do not fall.`,
    ] };

  // token substitution
  const sub = (s) => s.replace(/\$\{CLAN\}/g, clanName).replace(/\$\{LORD\}/g, lordName).replace(/\$\{UNIT\}/g, unitName);
  Object.values(S).forEach(sc => {
    if (sc.text) sc.text = Array.isArray(sc.text) ? sc.text.map(sub) : sub(sc.text);
    if (sc.intro) sc.intro = sub(sc.intro);
    if (sc.note) sc.note = sub(sc.note);
    if (sc.choices) sc.choices.forEach(c => { c.label = sub(c.label); if (c.to) c.to = sub(c.to); });
  });
  return S;
};

/* ================================================================== *
 *  STATE & PROGRESSION
 * ================================================================== */
WARRIOR.newGame = function (opts) {
  const u = WARRIOR.UNITS[opts.unit] || WARRIOR.UNITS.ashigaru;
  const clanName = (typeof DATA !== "undefined" && DATA.clans[opts.clan]) ? DATA.clans[opts.clan].name : "Takeda";
  const lordName = (typeof DATA !== "undefined" && DATA.clans[opts.clan] && DATA.clans[opts.clan].daimyo) ? DATA.clans[opts.clan].daimyo : "the lord";
  WARRIOR.state = {
    name: opts.name || "Ronin",
    clan: opts.clan, clanName,
    unit: opts.unit, unitName: u.name,
    maxHp: u.hp, hp: u.hp,
    maxKi: u.ki, ki: u.ki,
    atk: u.atk, guard: u.guard,
    renown: 0, honour: 0, ruthless: 0,
    scene: "p.intro",
    story: WARRIOR.buildStory(clanName, lordName, u.name),
    log: [],
  };
  return WARRIOR.state;
};

// growth on rank-up: +HP, +atk
WARRIOR.applyRenown = function (st, gain) {
  const before = WARRIOR.rankFor(st.renown).idx;
  st.renown += gain;
  const after = WARRIOR.rankFor(st.renown);
  const rankedUp = after.idx > before;
  if (rankedUp) {
    const steps = after.idx - before;
    st.maxHp += 4 * steps; st.hp = st.maxHp;         // full heal on promotion
    st.maxKi += 1 * steps; st.ki = st.maxKi;
    st.atk += 1 * steps; st.guard += 1 * steps;
  }
  return { rankedUp, rank: after.rank };
};

/* ------------------------------------------------------------------ *
 *  PURE COMBAT HELPERS (unit-testable)
 * ------------------------------------------------------------------ */
// read-the-foe exchange: player guards a line, enemy strikes a line.
WARRIOR.LINES = ["high", "mid", "low"];
WARRIOR.exchangeOutcome = function (guardLine, strikeLine) {
  // matched guard -> you parry & riposte; mismatch -> you're hit
  return guardLine === strikeLine ? "parry" : "hit";
};
// telegraph window (ms) shrinks with foe skill and grows with your rank
WARRIOR.duelWindow = function (foeSkill, rankIdx) {
  const base = 1350 - foeSkill * 700;      // 0.5 skill -> ~1000ms, 0.9 -> ~720ms
  return Math.round(base + rankIdx * 55);  // veterans read faster
};

/* ================================================================== *
 *  UI  (browser only — guarded so headless require() is safe)
 * ================================================================== */
WARRIOR.el = function (id) { return document.getElementById(id); };

WARRIOR.open = function () {
  if (typeof document === "undefined") return;
  if (typeof UI !== "undefined" && UI.audio) { try { UI.audio.init(); } catch (e) {} }
  WARRIOR.renderCreate();
  if (typeof UI !== "undefined" && UI.showScreen) UI.showScreen("warrior-screen");
  else { document.querySelectorAll(".screen").forEach(s => s.classList.remove("active")); WARRIOR.el("warrior-screen").classList.add("active"); }
};

WARRIOR.back = function () {
  WARRIOR.stopDuel();
  if (WARRIOR.stopMelee) WARRIOR.stopMelee();
  if (typeof WARRIOR3D !== "undefined" && WARRIOR3D.stop) WARRIOR3D.stop();
  if (typeof UI !== "undefined" && UI.showScreen) UI.showScreen("title-screen");
};

WARRIOR.setScreen = function (html) {
  const s = WARRIOR.el("warrior-screen");
  if (s) s.innerHTML = `<div class="wr-stage">${html}</div>`;
};

/* ---------- character creation ---------- */
WARRIOR.renderCreate = function () {
  const clans = (typeof DATA !== "undefined") ? Object.keys(DATA.clans) : [];
  WARRIOR._pick = WARRIOR._pick || { clan: clans[0] || "takeda", unit: "ashigaru", name: "" };
  const p = WARRIOR._pick;
  const clanCards = clans.map(cid => {
    const c = DATA.clans[cid];
    return `<button class="wr-card wr-clan ${cid === p.clan ? "sel" : ""}" data-clan="${cid}">
      <span class="wr-crest" style="background:${c.color}">${c.crest}</span>
      <span class="wr-cardname">${c.name}</span></button>`;
  }).join("");
  const unitCards = Object.keys(WARRIOR.UNITS).map(uk => {
    const u = WARRIOR.UNITS[uk];
    return `<button class="wr-card wr-unit ${uk === p.unit ? "sel" : ""}" data-unit="${uk}">
      <span class="wr-uicon">${u.icon}</span>
      <span class="wr-cardname">${u.name} <span class="wr-jp">${u.jp}</span></span></button>`;
  }).join("");
  const u = WARRIOR.UNITS[p.unit];
  WARRIOR.setScreen(`
    <div class="wr-titlebar">
      <button class="wr-ghost" id="wr-exit">‹ Menu</button>
      <div class="wr-kanji">武士道</div>
      <div style="width:64px"></div>
    </div>
    <h1 class="wr-h1">Way of the Warrior</h1>
    <p class="wr-sub">A single life in the age of war. Serve a clan, rise from nothing, and answer the ash. <b>This is a separate story mode — your strategy campaigns are untouched.</b></p>

    <div class="wr-panel">
      <label class="wr-label">Your name</label>
      <input id="wr-name" class="wr-input" maxlength="18" placeholder="e.g. Sanada, Kenji, Tomoe…" value="${p.name ? esc(p.name) : ""}" />

      <label class="wr-label">Choose the clan you will serve</label>
      <div class="wr-cardgrid">${clanCards}</div>

      <label class="wr-label">Choose what you are</label>
      <div class="wr-cardgrid">${unitCards}</div>

      <div class="wr-unitblurb" id="wr-blurb">
        <div class="wr-statline">
          <span>❤️ ${u.hp} vitality</span><span>⚡ ${u.ki} stamina</span>
          <span>🗡️ ${u.atk} attack</span><span>🛡️ ${u.guard} guard</span>
        </div>
        <p>${u.blurb}</p>
      </div>

      <button class="wr-begin" id="wr-begin">Begin your story ⚔</button>
    </div>`);

  const s = WARRIOR.el("warrior-screen");
  s.querySelector("#wr-exit").onclick = () => WARRIOR.back();
  s.querySelector("#wr-name").oninput = (e) => { WARRIOR._pick.name = e.target.value; };
  s.querySelectorAll(".wr-clan").forEach(b => b.onclick = () => { WARRIOR._pick.clan = b.dataset.clan; WARRIOR.renderCreate(); });
  s.querySelectorAll(".wr-unit").forEach(b => b.onclick = () => { WARRIOR._pick.unit = b.dataset.unit; WARRIOR.renderCreate(); });
  s.querySelector("#wr-begin").onclick = () => {
    const name = (WARRIOR._pick.name || "").trim() || "Ronin";
    WARRIOR.newGame({ clan: WARRIOR._pick.clan, unit: WARRIOR._pick.unit, name });
    WARRIOR.playScene(WARRIOR.state.scene);
  };
};

/* ---------- persistent HUD ---------- */
WARRIOR.hud = function () {
  const st = WARRIOR.state; if (!st) return "";
  const rf = WARRIOR.rankFor(st.renown);
  const next = WARRIOR.RANKS[rf.idx + 1];
  const prog = next ? Math.min(100, Math.round(((st.renown - rf.rank.need) / (next.need - rf.rank.need)) * 100)) : 100;
  return `<div class="wr-hud">
    <div class="wr-hud-l"><span class="wr-uicon sm">${WARRIOR.UNITS[st.unit].icon}</span>
      <div><div class="wr-hud-name">${esc(st.name)}</div>
      <div class="wr-hud-rank">${rf.rank.name} <span class="wr-jp">${rf.rank.jp}</span> · ${esc(st.clanName)}</div></div></div>
    <div class="wr-hud-r">
      <div class="wr-renown">renown ${st.renown}${next ? ` → ${next.name}` : " · max"}</div>
      <div class="wr-rbar"><i style="width:${prog}%"></i></div>
    </div>
  </div>`;
};

/* ---------- scene dispatcher ---------- */
WARRIOR.playScene = function (id) {
  const st = WARRIOR.state; if (!st) return;
  st.scene = id;
  const sc = st.story[id];
  if (!sc) { WARRIOR.back(); return; }
  if (sc.type === "story") return WARRIOR.renderStory(sc);
  if (sc.type === "rankcheck") return WARRIOR.renderRankcheck(sc);
  if (sc.type === "exchange") return WARRIOR.renderExchange(sc);
  if (sc.type === "duel") return WARRIOR.renderDuel(sc);
  if (sc.type === "melee") return WARRIOR.renderMelee(sc);
  if (sc.type === "ending") return WARRIOR.renderEnding(sc);
};

WARRIOR.renderStory = function (sc) {
  const st = WARRIOR.state;
  const body = sc.text.map(t => `<p>${t}</p>`).join("");
  const choices = (sc.choices || []).map((c, i) =>
    `<button class="wr-choice" data-i="${i}">${c.label}</button>`).join("");
  WARRIOR.setScreen(`${WARRIOR.hud()}
    <div class="wr-scene">
      <div class="wr-chap">${sc.chapter || ""}</div>
      ${sc.art ? `<div class="wr-art">${sc.art}</div>` : ""}
      <div class="wr-prose">${body}</div>
      <div class="wr-choices">${choices}</div>
    </div>`);
  const s = WARRIOR.el("warrior-screen");
  s.querySelectorAll(".wr-choice").forEach(b => b.onclick = () => {
    const c = sc.choices[+b.dataset.i];
    if (c.note === "honour") st.honour++;
    if (c.note === "ruthless") st.ruthless++;
    WARRIOR.playScene(c.to);
  });
};

WARRIOR.renderRankcheck = function (sc) {
  const st = WARRIOR.state;
  const res = WARRIOR.applyRenown(st, sc.renown || 0);
  const rankMsg = res.rankedUp
    ? `<div class="wr-rankup">⬆ You rise to <b>${res.rank.name}</b> <span class="wr-jp">${res.rank.jp}</span> — wounds mended, strength grown.</div>` : "";
  WARRIOR.setScreen(`${WARRIOR.hud()}
    <div class="wr-scene">
      <div class="wr-chap">${sc.chapter || ""}</div>
      <div class="wr-art">🎌</div>
      <div class="wr-prose"><p>${sc.text}</p><p class="wr-reward">+${sc.renown} renown</p>${rankMsg}</div>
      <div class="wr-choices"><button class="wr-choice" id="wr-cont">Continue →</button></div>
    </div>`);
  WARRIOR.el("warrior-screen").querySelector("#wr-cont").onclick = () => WARRIOR.playScene(sc.to);
};

/* ---- 3D combat routing (falls back to the 2D renderers below) ---- */
WARRIOR.use3d = function () {
  return typeof WARRIOR3D !== "undefined" && WARRIOR3D.available();
};
WARRIOR.themeFor = function (sc) {
  const c = (sc.chapter || "").toLowerCase();
  if (c.indexOf("prologue") >= 0) return "ember";
  if (c.indexOf("night") >= 0) return "night";
  if (c.indexOf("ash-maker") >= 0 || c.indexOf("three") >= 0) return "dawn";
  return "dusk";
};
WARRIOR.fight3d = function (sc, enemies, onWin, onLose) {
  const st = WARRIOR.state;
  WARRIOR3D.startFight({
    player: { hp: st.hp, maxHp: st.maxHp, ki: st.ki, maxKi: st.maxKi, atk: st.atk, guard: st.guard },
    enemies: enemies,
    theme: sc.theme || WARRIOR.themeFor(sc),
    intro: sc.intro,
    onWin: (res) => { st.hp = Math.max(1, res.hp); if (res.ki != null) st.ki = res.ki; onWin(); },
    onLose: (res) => { st.hp = Math.max(1, Math.round(st.maxHp * 0.4)); onLose(); },
  });
};

/* ================================================================== *
 *  COMBAT 1 — read-the-foe EXCHANGE (turn based, teaches timing)
 * ================================================================== */
WARRIOR.renderExchange = function (sc) {
  const st = WARRIOR.state;
  if (WARRIOR.use3d())
    return WARRIOR.fight3d(sc, [Object.assign({}, WARRIOR.FOES[sc.foe])],
      () => WARRIOR.playScene(sc.onWin), () => WARRIOR.playScene(sc.onLose));
  const foe = Object.assign({}, WARRIOR.FOES[sc.foe]);
  const g = { pHp: st.hp, foeHp: foe.hp, round: 0, intent: null, tell: null, locked: false };

  const draw = (msg, msgcls) => {
    WARRIOR.setScreen(`${WARRIOR.hud()}
      <div class="wr-combat wr-exchange">
        <div class="wr-cb-head"><span class="wr-chap">${sc.chapter}</span><span class="wr-vs">読み — the reading</span></div>
        <div class="wr-arena">
          <div class="wr-fighter foe"><div class="wr-fig">${foe.icon}</div><div class="wr-fname">${foe.name}</div>
            <div class="wr-hpbar foe"><i style="width:${Math.max(0, g.foeHp / foe.hp * 100)}%"></i></div></div>
          <div class="wr-fighter you"><div class="wr-fig">${WARRIOR.UNITS[st.unit].icon}</div><div class="wr-fname">${esc(st.name)}</div>
            <div class="wr-hpbar you"><i style="width:${Math.max(0, g.pHp / st.maxHp * 100)}%"></i></div></div>
        </div>
        <div class="wr-callout ${msgcls || ""}" id="wr-call">${msg}</div>
        <div class="wr-actions" id="wr-acts">
          <button class="wr-act" data-line="high">⬆ Guard High</button>
          <button class="wr-act" data-line="mid">➡ Guard Mid</button>
          <button class="wr-act" data-line="low">⬇ Guard Low</button>
        </div>
      </div>`);
    const s = WARRIOR.el("warrior-screen");
    s.querySelectorAll(".wr-act").forEach(b => b.onclick = () => resolve(b.dataset.line));
  };

  const nextRound = () => {
    g.round++;
    g.intent = WARRIOR.LINES[Math.floor(Math.random() * 3)];
    // a "tell": truthful with prob (1-skill*0.6); veterans of skill feint more
    const truthful = Math.random() > foe.skill * 0.55;
    g.tell = truthful ? g.intent : WARRIOR.LINES[Math.floor(Math.random() * 3)];
    const tellWord = { high: "raises the blade — a HIGH cut looks likely", mid: "squares up — a MID thrust looks likely", low: "drops his stance — a LOW sweep looks likely" }[g.tell];
    const first = g.round === 1 ? `${sc.intro}<br><br>` : "";
    draw(`${first}<b>${foe.name}</b> ${tellWord}. <i>Guard the line you think he'll strike.</i>`, "read");
  };

  const resolve = (guardLine) => {
    const out = WARRIOR.exchangeOutcome(guardLine, g.intent);
    let msg;
    if (out === "parry") { const dmg = st.atk + 2; g.foeHp -= dmg; msg = `✅ You read him true — guard meets steel and your riposte bites deep. <b>−${dmg}</b> to ${foe.name}.`; }
    else { const dmg = foe.dmg; g.pHp -= dmg; msg = `❌ He strikes the open line. <b>−${dmg}</b> to you.`; }
    // end?
    if (g.foeHp <= 0) { st.hp = g.pHp; return finish(true, msg); }
    if (g.pHp <= 0) { st.hp = 1; return finish(false, msg); }
    draw(msg + `<br><span class="small">Foe ${Math.max(0, g.foeHp)} vit · You ${Math.max(0, g.pHp)} vit</span>`, out === "parry" ? "good" : "bad");
    const s = WARRIOR.el("warrior-screen");
    s.querySelector("#wr-acts").innerHTML = `<button class="wr-act cont" id="wr-nx">Next exchange →</button>`;
    s.querySelector("#wr-nx").onclick = nextRound;
  };

  const finish = (won, msg) => {
    draw(`${msg}<br><br>${won ? "🏆 <b>He falls.</b>" : "🩸 <b>You are beaten down.</b>"}`, won ? "good" : "bad");
    const s = WARRIOR.el("warrior-screen");
    s.querySelector("#wr-acts").innerHTML = `<button class="wr-act cont" id="wr-nx">Continue →</button>`;
    s.querySelector("#wr-nx").onclick = () => WARRIOR.playScene(won ? sc.onWin : sc.onLose);
  };

  nextRound();
};

/* ================================================================== *
 *  COMBAT 2 — real-time first-person DUEL
 *  Enemy telegraphs; you PARRY (timed) / DODGE (ki) / GUARD, and STRIKE
 *  into openings. First to 0 vitality loses.
 * ================================================================== */
WARRIOR.stopDuel = function () {
  if (WARRIOR._duel) {
    clearTimeout(WARRIOR._duel.beatT);
    if (WARRIOR._duel.raf) cancelAnimationFrame(WARRIOR._duel.raf);
    WARRIOR._duel.dead = true;
  }
  WARRIOR._duel = null;
};

WARRIOR.renderDuel = function (sc) {
  const st = WARRIOR.state;
  if (WARRIOR.use3d())
    return WARRIOR.fight3d(sc, [Object.assign({}, WARRIOR.FOES[sc.foe])],
      () => WARRIOR.playScene(sc.onWin), () => WARRIOR.playScene(sc.onLose));
  const foe = Object.assign({}, WARRIOR.FOES[sc.foe]);
  const rankIdx = WARRIOR.rankFor(st.renown).idx;
  WARRIOR.stopDuel();
  const d = WARRIOR._duel = {
    id: Math.random(), dead: false, sc, foe,
    pHp: st.hp, foeHp: foe.hp, ki: st.ki, maxKi: st.maxKi,
    phase: "idle", dir: null, barStart: 0, barDur: 0, raf: 0, beatT: 0, combo: 0,
    winMs: WARRIOR.duelWindow(foe.skill, rankIdx),
  };

  WARRIOR.setScreen(`${WARRIOR.hud()}
    <div class="wr-combat wr-duel">
      <div class="wr-cb-head"><span class="wr-chap">${sc.chapter}</span><span class="wr-vs">一騎討ち — the duel</span></div>
      <div class="wr-duelbars">
        <div class="wr-fighter foe"><div class="wr-fig" id="wr-foefig">${foe.icon}</div><div class="wr-fname">${foe.name}</div>
          <div class="wr-hpbar foe"><i id="wr-foehp" style="width:100%"></i></div></div>
        <div class="wr-fighter you"><div class="wr-fig" id="wr-youfig">${WARRIOR.UNITS[st.unit].icon}</div><div class="wr-fname">${esc(st.name)}</div>
          <div class="wr-hpbar you"><i id="wr-youhp" style="width:100%"></i></div>
          <div class="wr-kibar"><i id="wr-ki" style="width:100%"></i></div></div>
      </div>
      <div class="wr-tele" id="wr-tele"><div class="wr-tele-txt" id="wr-teletxt">Ready…</div>
        <div class="wr-tele-track"><i id="wr-telebar"></i><span class="wr-perfect"></span></div></div>
      <div class="wr-callout" id="wr-duelmsg">${sc.intro}</div>
      <div class="wr-actions duel">
        <button class="wr-act atk" data-a="strike">🗡️ Strike</button>
        <button class="wr-act par" data-a="parry">⚔️ Parry</button>
        <button class="wr-act dod" data-a="dodge">💨 Dodge</button>
        <button class="wr-act grd" data-a="guard">🛡️ Guard</button>
      </div>
    </div>`);

  const s = WARRIOR.el("warrior-screen");
  s.querySelectorAll(".wr-act[data-a]").forEach(b => b.onclick = () => WARRIOR.duelInput(b.dataset.a));
  setTimeout(() => WARRIOR.duelBeat(), 1100);
};

WARRIOR.duelDraw = function (msg, cls) {
  const d = WARRIOR._duel; if (!d) return; const st = WARRIOR.state;
  const foehp = WARRIOR.el("wr-foehp"), youhp = WARRIOR.el("wr-youhp"), ki = WARRIOR.el("wr-ki");
  if (foehp) foehp.style.width = Math.max(0, d.foeHp / d.foe.hp * 100) + "%";
  if (youhp) youhp.style.width = Math.max(0, d.pHp / st.maxHp * 100) + "%";
  if (ki) ki.style.width = Math.max(0, d.ki / d.maxKi * 100) + "%";
  if (msg != null) { const m = WARRIOR.el("wr-duelmsg"); if (m) { m.innerHTML = msg; m.className = "wr-callout " + (cls || ""); } }
};

WARRIOR.duelBeat = function () {
  const d = WARRIOR._duel; if (!d || d.dead) return;
  if (d.foeHp <= 0) return WARRIOR.duelEnd(true);
  if (d.pHp <= 0) return WARRIOR.duelEnd(false);
  // regen a little stamina between beats
  d.ki = Math.min(d.maxKi, d.ki + 1);
  const roll = Math.random();
  const openChance = 0.28 + (1 - d.foe.aggr) * 0.12;
  if (roll < openChance) {
    // enemy leaves an opening
    d.phase = "opening";
    d.barDur = Math.max(520, d.winMs * 0.8);
    d.barStart = Date.now();
    const tele = WARRIOR.el("wr-tele"); if (tele) tele.className = "wr-tele open";
    const tt = WARRIOR.el("wr-teletxt"); if (tt) tt.textContent = "▲ OPENING — STRIKE!";
    WARRIOR.duelDraw(`<b>${d.foe.name}</b> overreaches — an opening! <b>Strike now.</b>`, "read");
    WARRIOR.duelBar(() => { // window expired unused
      if (!d || d.dead || d.phase !== "opening") return;
      d.phase = "idle"; WARRIOR.duelDraw("You hesitate — the opening closes.", "");
      d.beatT = setTimeout(() => WARRIOR.duelBeat(), 620);
    });
  } else {
    // enemy attacks along a line
    d.phase = "attack";
    d.dir = ["high", "mid", "low"][Math.floor(Math.random() * 3)];
    d.barDur = d.winMs;
    d.barStart = Date.now();
    const arrow = { high: "⬆ HIGH", mid: "➡ THRUST", low: "⬇ LOW" }[d.dir];
    const tele = WARRIOR.el("wr-tele"); if (tele) tele.className = "wr-tele atk";
    const tt = WARRIOR.el("wr-teletxt"); if (tt) tt.textContent = "⚠ " + arrow + " strike incoming";
    const ff = WARRIOR.el("wr-foefig"); if (ff) { ff.classList.remove("lunge"); void ff.offsetWidth; ff.classList.add("wind"); }
    WARRIOR.duelDraw(`<b>${d.foe.name}</b> attacks — <b>${arrow}</b>! Parry at the flash, or dodge/guard.`, "");
    WARRIOR.duelBar(() => { // player failed to react in time -> full hit
      if (!d || d.dead || d.phase !== "attack") return;
      WARRIOR.duelHitPlayer(d.foe.dmg, `You react too late — ${d.foe.name}'s blade lands clean.`);
      d.phase = "recover";
      d.beatT = setTimeout(() => WARRIOR.duelBeat(), 640);
    });
  }
};

// animate the telegraph track; call onEnd when it fills
WARRIOR.duelBar = function (onEnd) {
  const d = WARRIOR._duel; if (!d) return;
  const bar = WARRIOR.el("wr-telebar");
  const perfect = document.querySelector("#wr-tele .wr-perfect");
  // perfect zone: last 32% of the track for attacks (flash), whole for openings
  if (perfect) { perfect.style.left = (d.phase === "attack" ? 68 : 0) + "%"; perfect.style.width = (d.phase === "attack" ? 32 : 100) + "%"; }
  const step = () => {
    if (!d || d.dead) return;
    const t = (Date.now() - d.barStart) / d.barDur;
    if (bar) bar.style.width = Math.min(100, t * 100) + "%";
    if (t >= 1) { d.raf = 0; onEnd && onEnd(); return; }
    d.raf = requestAnimationFrame(step);
  };
  d.raf = requestAnimationFrame(step);
};

WARRIOR.duelProgress = function () {
  const d = WARRIOR._duel; if (!d) return 0;
  return Math.min(1, (Date.now() - d.barStart) / d.barDur);
};

WARRIOR.duelInput = function (a) {
  const d = WARRIOR._duel; if (!d || d.dead) return;
  const st = WARRIOR.state;

  if (d.phase === "opening") {
    if (a === "strike") {
      if (d.raf) cancelAnimationFrame(d.raf), d.raf = 0;
      d.combo++;
      const dmg = st.atk + 3 + Math.min(4, d.combo);
      d.foeHp -= dmg;
      const ff = WARRIOR.el("wr-foefig"); if (ff) { ff.classList.add("hit"); setTimeout(() => ff && ff.classList.remove("hit"), 260); }
      WARRIOR.duelDraw(`🗡️ You lunge into the gap — <b>−${dmg}</b>! ${d.foe.name} reels.`, "good");
      d.phase = "recover";
      d.beatT = setTimeout(() => WARRIOR.duelBeat(), 560);
    } else {
      WARRIOR.duelDraw("You waste the opening.", "");
    }
    return;
  }

  if (d.phase === "attack") {
    const p = WARRIOR.duelProgress();
    if (d.raf) cancelAnimationFrame(d.raf), d.raf = 0;
    if (a === "parry") {
      if (p >= 0.66) { // perfect parry -> riposte
        d.combo++;
        const dmg = st.atk + 4;
        d.foeHp -= dmg;
        const ff = WARRIOR.el("wr-foefig"); if (ff) { ff.classList.add("hit"); setTimeout(() => ff && ff.classList.remove("hit"), 260); }
        WARRIOR.duelDraw(`⚔️ <b>Perfect parry!</b> Steel rings and your riposte bites — <b>−${dmg}</b>.`, "good");
      } else { // early parry -> partial
        const dmg = Math.max(1, Math.round(d.foe.dmg * 0.4));
        WARRIOR.duelHitPlayer(dmg, `Too early — you catch most of it but it still stings. <b>−${dmg}</b>.`);
        d.combo = 0;
      }
    } else if (a === "dodge") {
      if (d.ki >= 3) { d.ki -= 3; WARRIOR.duelDraw("💨 You slip aside — untouched.", "good"); d.combo = 0; }
      else { WARRIOR.duelHitPlayer(d.foe.dmg, "Out of stamina — the dodge fails and you're hit."); d.combo = 0; }
    } else if (a === "guard") {
      const dmg = Math.max(1, d.foe.dmg - Math.round(st.guard / 2) - 2);
      WARRIOR.duelHitPlayer(dmg, `🛡️ You take it on the guard — <b>−${dmg}</b>.`);
      d.combo = 0;
    } else if (a === "strike") { // striking into an attack = bad trade
      d.foeHp -= Math.round(st.atk / 2);
      WARRIOR.duelHitPlayer(d.foe.dmg, `You trade blows — you both bleed, but you got the worse of it.`);
      d.combo = 0;
    }
    if (d.foeHp <= 0) return WARRIOR.duelEnd(true);
    if (d.pHp <= 0) return WARRIOR.duelEnd(false);
    d.phase = "recover";
    d.beatT = setTimeout(() => WARRIOR.duelBeat(), 620);
    return;
  }

  // idle / recover: a Strike is a cautious poke (costs stamina)
  if (a === "strike" && (d.phase === "idle" || d.phase === "recover")) {
    if (d.ki >= 2) { d.ki -= 2; const dmg = Math.max(1, Math.round(st.atk / 2)); d.foeHp -= dmg;
      WARRIOR.duelDraw(`A quick jab — <b>−${dmg}</b>.`, "");
      if (d.foeHp <= 0) return WARRIOR.duelEnd(true); WARRIOR.duelDraw(null); }
  }
};

WARRIOR.duelHitPlayer = function (dmg, msg) {
  const d = WARRIOR._duel; if (!d) return;
  d.pHp -= dmg;
  const yf = WARRIOR.el("wr-youfig"); if (yf) { yf.classList.add("hit"); setTimeout(() => yf && yf.classList.remove("hit"), 260); }
  const st = WARRIOR.state;
  WARRIOR.duelDraw(msg + ` <span class="small">You ${Math.max(0, d.pHp)} vit</span>`, "bad");
};

WARRIOR.duelEnd = function (won) {
  const d = WARRIOR._duel; if (!d) return; const st = WARRIOR.state; const sc = d.sc;
  st.hp = won ? Math.max(1, d.pHp) : Math.max(1, Math.round(st.maxHp * 0.35));
  st.ki = d.ki;
  clearTimeout(d.beatT); if (d.raf) cancelAnimationFrame(d.raf);
  d.dead = true;
  const tele = WARRIOR.el("wr-tele"); if (tele) tele.className = "wr-tele";
  WARRIOR.duelDraw(won ? `🏆 <b>${d.foe.name} falls.</b> The duel is yours.` : `🩸 <b>You are cut down.</b>`, won ? "good" : "bad");
  const acts = document.querySelector(".wr-actions.duel");
  if (acts) acts.innerHTML = `<button class="wr-act cont wide" id="wr-cont">Continue →</button>`;
  const cb = WARRIOR.el("wr-cont"); if (cb) cb.onclick = () => { WARRIOR._duel = null; WARRIOR.playScene(won ? sc.onWin : sc.onLose); };
};

/* ================================================================== *
 *  COMBAT 3 — battlefield MELEE (surrounded; tap foes before they cut you)
 * ================================================================== */
WARRIOR.stopMelee = function () {
  if (WARRIOR._melee) { clearInterval(WARRIOR._melee.tick); WARRIOR._melee.dead = true; }
  WARRIOR._melee = null;
};

WARRIOR.renderMelee = function (sc) {
  const st = WARRIOR.state;
  if (WARRIOR.use3d()) {
    const pool = sc.foes || ["ashigaru"]; const arr = [];
    const n = Math.min(sc.kills || 6, 5);   // a run of foes, paced for 3D duelling
    for (let i = 0; i < n; i++) arr.push(Object.assign({}, WARRIOR.FOES[pool[i % pool.length]]));
    return WARRIOR.fight3d(sc, arr, () => WARRIOR.playScene(sc.onWin), () => WARRIOR.playScene(sc.onLose));
  }
  WARRIOR.stopMelee();
  const m = WARRIOR._melee = { sc, dead: false, pHp: st.hp, kills: 0, need: sc.kills || 8, foes: [], nextId: 1, tick: 0, spawnAcc: 0 };

  WARRIOR.setScreen(`${WARRIOR.hud()}
    <div class="wr-combat wr-melee">
      <div class="wr-cb-head"><span class="wr-chap">${sc.chapter}</span><span class="wr-vs">乱戦 — the melee</span></div>
      <div class="wr-melee-stat">
        <div>Foes cut down: <b id="wr-kills">0</b> / ${m.need}</div>
        <div class="wr-hpbar you inline"><i id="wr-mhp" style="width:100%"></i></div>
      </div>
      <div class="wr-callout" id="wr-mmsg">${sc.intro}</div>
      <div class="wr-field" id="wr-field"></div>
    </div>`);

  m.tick = setInterval(() => WARRIOR.meleeTick(), 100);
};

WARRIOR.meleeTick = function () {
  const m = WARRIOR._melee; if (!m || m.dead) return; const st = WARRIOR.state; const sc = m.sc;
  const field = WARRIOR.el("wr-field"); if (!field) { WARRIOR.stopMelee(); return; }

  // spawn: keep 2..4 foes on the field until the quota's committed
  m.spawnAcc += 100;
  const alive = m.foes.length;
  const committed = m.kills + alive;
  const target = Math.min(4, 2 + Math.floor(m.kills / 3));
  if (alive < target && committed < m.need && m.spawnAcc > 480) {
    m.spawnAcc = 0;
    const key = sc.foes[Math.floor(Math.random() * sc.foes.length)];
    const f = WARRIOR.FOES[key];
    const fuse = 2200 + Math.random() * 1600 - Math.min(900, m.kills * 40); // gets faster
    m.foes.push({ id: m.nextId++, icon: f.icon, name: f.name, dmg: f.dmg, hp: 1, fuse, t: 0,
      x: 8 + Math.random() * 84, y: 12 + Math.random() * 66 });
  }

  // advance fuses; strike the player when a fuse burns out
  for (const f of m.foes) {
    f.t += 100;
    if (f.t >= f.fuse) {
      m.pHp -= f.dmg;
      f.struck = true;
      const yf = WARRIOR.el("wr-mhp"); if (yf) yf.parentElement.classList.add("flash");
      setTimeout(() => { const e = WARRIOR.el("wr-mhp"); if (e) e.parentElement.classList.remove("flash"); }, 200);
    }
  }
  // remove foes that already struck
  m.foes = m.foes.filter(f => !f.struck);

  // render field
  field.innerHTML = m.foes.map(f => {
    const prog = Math.min(100, f.t / f.fuse * 100);
    const danger = prog > 66 ? " danger" : prog > 33 ? " near" : "";
    return `<button class="wr-foe${danger}" data-id="${f.id}" style="left:${f.x}%;top:${f.y}%">
      <span class="wr-foe-icon">${f.icon}</span>
      <span class="wr-foe-ring"><i style="width:${prog}%"></i></span></button>`;
  }).join("");
  field.querySelectorAll(".wr-foe").forEach(b => b.onclick = (e) => { e.preventDefault(); WARRIOR.meleeStrike(+b.dataset.id); });

  const kEl = WARRIOR.el("wr-kills"); if (kEl) kEl.textContent = m.kills;
  const hEl = WARRIOR.el("wr-mhp"); if (hEl) hEl.style.width = Math.max(0, m.pHp / st.maxHp * 100) + "%";

  if (m.pHp <= 0) return WARRIOR.meleeEnd(false);
  if (m.kills >= m.need) return WARRIOR.meleeEnd(true);
};

WARRIOR.meleeStrike = function (id) {
  const m = WARRIOR._melee; if (!m || m.dead) return;
  const i = m.foes.findIndex(f => f.id === id); if (i < 0) return;
  m.foes.splice(i, 1);
  m.kills++;
  const kEl = WARRIOR.el("wr-kills"); if (kEl) kEl.textContent = m.kills;
};

WARRIOR.meleeEnd = function (won) {
  const m = WARRIOR._melee; if (!m) return; const st = WARRIOR.state; const sc = m.sc;
  clearInterval(m.tick); m.dead = true;
  st.hp = won ? Math.max(1, m.pHp) : Math.max(1, Math.round(st.maxHp * 0.4));
  WARRIOR.setScreen(`${WARRIOR.hud()}
    <div class="wr-combat wr-melee">
      <div class="wr-cb-head"><span class="wr-chap">${sc.chapter}</span><span class="wr-vs">乱戦 — the melee</span></div>
      <div class="wr-art">${won ? "🏆" : "🩸"}</div>
      <div class="wr-callout ${won ? "good" : "bad"}">${won
        ? `<b>The line holds — the enemy breaks and runs.</b> You cut down ${m.kills}, and you are still standing.`
        : `<b>They overwhelm you.</b> You go down under the press — but comrades drag you clear before the end.`}</div>
      <div class="wr-actions"><button class="wr-act cont wide" id="wr-cont">Continue →</button></div>
    </div>`);
  const cb = WARRIOR.el("wr-cont"); if (cb) cb.onclick = () => { WARRIOR._melee = null; WARRIOR.playScene(won ? sc.onWin : sc.onLose); };
};

/* ---------- ending ---------- */
WARRIOR.renderEnding = function (sc) {
  const st = WARRIOR.state;
  const rf = WARRIOR.rankFor(st.renown);
  const path = st.honour > st.ruthless ? "You walked the honourable road — men will remember you as a warrior of the code."
    : st.ruthless > st.honour ? "You did what the age demanded, and worse — feared more than loved, but victorious."
    : "You walked the middle way — pragmatic, unbroken, your own man to the end.";
  WARRIOR.setScreen(`
    <div class="wr-scene ending">
      <div class="wr-chap">${sc.chapter}</div>
      <div class="wr-art big">${sc.art}</div>
      <h1 class="wr-h1">${sc.win ? "The Ash Is Answered" : "A Story Unfinished"}</h1>
      <div class="wr-prose">${sc.text.map(t => `<p>${t}</p>`).join("")}</div>
      <div class="wr-endcard">
        <div><b>${esc(st.name)}</b> — ${rf.rank.name} <span class="wr-jp">${rf.rank.jp}</span> of ${esc(st.clanName)}</div>
        <div class="small">Renown ${st.renown} · Honour ${st.honour} · Ruthlessness ${st.ruthless}</div>
        <div class="wr-endpath">${sc.win ? path : ""}</div>
      </div>
      <div class="wr-choices">
        <button class="wr-choice" id="wr-again">${sc.win ? "Begin a new life ⚔" : "Walk the road again ⚔"}</button>
        <button class="wr-ghost" id="wr-menu">Return to menu</button>
      </div>
    </div>`);
  const s = WARRIOR.el("warrior-screen");
  s.querySelector("#wr-again").onclick = () => WARRIOR.renderCreate();
  s.querySelector("#wr-menu").onclick = () => WARRIOR.back();
};

/* ---------- title-screen wiring (additive; no edits to ui.js) ---------- */
if (typeof document !== "undefined") {
  document.addEventListener("DOMContentLoaded", () => {
    const btn = document.getElementById("warrior-btn");
    if (btn) btn.onclick = () => WARRIOR.open();
  });
}

if (typeof module !== "undefined") module.exports = WARRIOR;
