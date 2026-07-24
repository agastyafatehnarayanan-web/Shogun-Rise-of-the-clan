/* =====================================================================
 * UI: rendering the map, panels, tabs, and modals; player interaction.
 * Talks to the engine (SR.*) and the flow controller (GAME.*).
 * ===================================================================== */

const UI = {
  tab: "province", selected: null, moveMode: null,
  setup: { mode: "A", clan: "takeda", len: 6, ret: 5 },
};

const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));
const esc = (s) => String(s).replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));

UI.showScreen = function (id) {
  $$(".screen").forEach(s => s.classList.remove("active"));
  $("#" + id).classList.add("active");
};

/* ---------------------------------------------------------------------
 * TITLE SCREEN
 * ------------------------------------------------------------------- */
UI.initTitle = function () {
  // clan grid
  const grid = $("#clan-grid");
  grid.innerHTML = Object.keys(DATA.clans).map(cid => {
    const c = DATA.clans[cid];
    return `<div class="clan-card ${cid === UI.setup.clan ? "sel" : ""}" data-clan="${cid}">
      <div class="cc-crest" style="background:${c.color}">${c.crest}</div>
      <div><div class="cc-name">${c.name}</div><div class="cc-lean">${c.strength}</div></div>
    </div>`;
  }).join("");
  grid.querySelectorAll(".clan-card").forEach(el => el.onclick = () => {
    UI.setup.clan = el.dataset.clan;
    grid.querySelectorAll(".clan-card").forEach(x => x.classList.remove("sel"));
    el.classList.add("sel");
  });

  $("#mode-group").querySelectorAll(".opt").forEach(b => b.onclick = () => {
    UI.setup.mode = b.dataset.mode;
    $("#mode-group").querySelectorAll(".opt").forEach(x => x.classList.remove("active"));
    b.classList.add("active");
    const B = UI.setup.mode === "B";
    $("#retainers-wrap").style.display = B ? "" : "none";
    $("#clan-label").textContent = B ? "Choose the House" : "Choose your Clan";
    $("#mode-desc").textContent = B
      ? "You and up to seven AI retainers all serve ONE clan. Hold your fiefs, keep the house alive against outside rivals — and scheme for the succession. Each retainer has a secret Ambition."
      : "You lead a rival daimyō on the national map. Defeat five AI clans across six roads to victory — conquest, wealth, culture, honour, legitimacy, or the shadow war.";
  });
  $("#length-group").querySelectorAll(".opt").forEach(b => b.onclick = () => {
    UI.setup.len = +b.dataset.len;
    $("#length-group").querySelectorAll(".opt").forEach(x => x.classList.remove("active"));
    b.classList.add("active");
  });
  $("#retainers-group").querySelectorAll(".opt").forEach(b => b.onclick = () => {
    UI.setup.ret = +b.dataset.ret;
    $("#retainers-group").querySelectorAll(".opt").forEach(x => x.classList.remove("active"));
    b.classList.add("active");
  });
  $("#start-btn").onclick = () => GAME.start();
  const ob = $("#online-btn"); if (ob) ob.onclick = () => { if (typeof NET !== "undefined") NET.openLobby(); };
  $("#help-btn").onclick = () => UI.showHelp();
};

UI.showHelp = function () {
  UI.modal({
    title: "How to Play",
    body: `<div class="small" style="font-size:13px;line-height:1.6">
      <p><b>Goal.</b> Everything converts to <b>Prestige</b> — the most wins at the end of the final year. Or trigger a <b>sudden win</b>: hold Kyoto + 14 of the 24 provinces (conquest), or amass 30 koban with 3+ ports/markets (wealth).</p>
      <p><b>The year</b> is four seasons: <b>Spring</b> (mobilise), <b>Summer</b> (campaign; typhoons at sea), <b>Autumn</b> (harvest — you collect rice & koban), <b>Winter</b> (½ move, double rice upkeep, no guns, snowbound provinces sealed). Feed your armies with rice every season.</p>
      <p><b>Each season</b> you may recruit, build, march & attack, pacify, run spies, do diplomacy, and climb the Court — all free-form, limited only by resources and one move per army. Then press <b>End Season</b>.</p>
      <p><b>War.</b> Select your province → <b>March</b> → click a neighbour. A <b>Declared</b> attack is honourable; a <b>Surprise</b> attack gives an ambush edge but costs Honour. Terrain sets how many units can fight at once; cavalry shock, guns, and reserves decide the day. Win the field, reduce the castle, then <b>garrison + pay to Pacify</b>.</p>
      <p><b>Honour</b> (0–20) gates the Court, calms conquests, earns trust — and scores big at the end. Ruthlessness (surprise, razing, assassination) works, but it's priced.</p>
      <p><b>The House Divided (Mode B):</b> serve one clan with rival retainers, survive outside threats, answer the lord's directives for <b>Standing</b>, and pursue your secret <b>Ambition</b> — the succession crisis decides all.</p>
    </div>`,
    foot: `<button class="primary" onclick="UI.closeModal()">Understood</button>`,
  });
};

/* ---------------------------------------------------------------------
 * TOP BAR
 * ------------------------------------------------------------------- */
UI.renderTop = function () {
  const S = SR.state, c = S.clans[S.humanClan];
  $("#clan-crest").textContent = c.crest;
  $("#clan-crest").style.background = c.color;
  $("#tb-clan-name").textContent = S.mode === "B" ? c.name : c.name + " Clan";
  $("#tb-clan-sub").textContent = S.mode === "B"
    ? `Retainer of ${S.modeB.house} · Standing ${c.standing}`
    : `${c.daimyo}${c.daimyoAlive ? "" : " (heir pending)"}`;
  $("#season-name").textContent = DATA.seasons[S.seasonIdx];
  $("#year-name").textContent = `Year ${S.year} / ${S.lengthYears}`;
  const w = [];
  if (S.weather.winter) w.push("❄ Winter: ½ move, ×2 upkeep, no guns");
  if (S.weather.typhoon) w.push("🌀 Typhoon at sea");
  if (S.weather.rain) w.push("🌧 Rain: guns dampened");
  if (S.shogun) w.push(`⛩ Shōgun: ${S.clans[S.shogun].name}`);
  $("#weather-line").textContent = w.join("  ·  ");
  $("#r-koban").textContent = c.koban;
  $("#r-rice").textContent = c.rice;
  $("#r-honour").textContent = c.honour;
  const band = SR.honourBand(c.honour);
  $("#r-honour-band").textContent = band.name;
  const est = S.mode === "B" ? c.standing * 3 + Math.round(SR.retainerPower(S, S.humanClan).power) : SR.scoreTotal(S, S.humanClan).total;
  $("#r-prestige").textContent = est;
  $("#tab-ambition").style.display = S.mode === "B" ? "" : "none";
};

/* ---------------------------------------------------------------------
 * MAP
 * ------------------------------------------------------------------- */
UI.ownerColor = function (S, owner) {
  if (!owner) return { c: "#6b6256", c2: "#4b463c" };
  const cl = S.clans[owner];
  return { c: cl.color, c2: cl.color2 };
};
UI.MAP_W = 1536; UI.MAP_H = 1024;
UI.renderMap = function () {
  const S = SR.state, svg = $("#map");
  // The illustrated board. build.js injects window.__NIPPON_MAP__ (a data: URI)
  // for the single-file bundle; the modular version loads the file directly.
  const mapSrc = (typeof window !== "undefined" && window.__NIPPON_MAP__) || "assets/nippon-map.jpg";

  const defs = `<defs>
    <filter id="softtint" x="-60%" y="-60%" width="220%" height="220%">
      <feGaussianBlur stdDeviation="11"/>
    </filter>
  </defs>`;
  const bg = `<image href="${mapSrc}" x="0" y="0" width="${UI.MAP_W}" height="${UI.MAP_H}" preserveAspectRatio="none"/>`;

  let tints = "", rings = "", labels = "", hits = "";
  for (const id in DATA.provinces) {
    const p = DATA.provinces[id], ps = S.provinces[id];
    const owned = ps.owner && ps.status !== "neutral";
    const col = UI.ownerColor(S, ps.owner);
    const sel = UI.selected === id;
    const reachable = UI.moveMode && SR.stat(UI.moveMode).adj.includes(id) &&
      SR.canReach(S, UI.moveMode, id, S.humanClan).ok;
    const daimyoHere = ps.owner && S.clans[ps.owner].daimyoAlive && S.clans[ps.owner].daimyoLoc === id;
    const visible = UI.unitVisible(S, id) || !ps.owner;   // neutral garrisons are public

    // soft territory tint in the controlling clan's colour
    if (owned) tints += `<ellipse class="tint" cx="${p.x}" cy="${p.y}" rx="${p.rx}" ry="${p.ry}" fill="${col.c}" filter="url(#softtint)"/>`;

    // selection / march-reach / siege outlines
    if (reachable) rings += `<ellipse class="ring reach" cx="${p.x}" cy="${p.y}" rx="${p.rx + 5}" ry="${p.ry + 5}"/>`;
    if (sel)       rings += `<ellipse class="ring sel" cx="${p.x}" cy="${p.y}" rx="${p.rx + 7}" ry="${p.ry + 7}"/>`;
    if (ps.siege)  rings += `<ellipse class="ring siege" cx="${p.x}" cy="${p.y}" rx="${p.rx + 3}" ry="${p.ry + 3}"/>`;

    // label pill (name + live stats), sized to fit its text
    const name = (p.kyoto ? "⛩ " : "") + p.name;
    const stat = `禾${SR.provKoku(S, id)} ⚔${visible ? ps.units.length : "?"}` +
      `${ps.castle ? " " + "▲".repeat(ps.castle) : ""}${daimyoHere ? " ★" : ""}`;
    const w = Math.round(Math.max(name.length * 9.5, stat.length * 9) + 22);
    labels += `<g class="plabel ${sel ? "sel" : ""}">
      <rect class="pill" x="${p.x - w / 2}" y="${p.y - 20}" width="${w}" height="40" rx="8"
        style="stroke:${owned ? col.c : "#726a58"}"/>
      <text class="pn" x="${p.x}" y="${p.y - 3}">${esc(name)}</text>
      <text class="ps" x="${p.x}" y="${p.y + 15}">${esc(stat)}</text>
    </g>`;

    // transparent click target covering the province (topmost)
    hits += `<g class="prov ${sel ? "sel" : ""} ${reachable ? "reach" : ""}" data-id="${id}">
      <ellipse class="hit" cx="${p.x}" cy="${p.y}" rx="${p.rx}" ry="${p.ry}"/></g>`;
  }

  svg.innerHTML = defs + bg + tints + rings + labels + hits;
  svg.querySelectorAll(".prov").forEach(g => g.onclick = () => UI.onProvinceClick(g.dataset.id));

  $("#map-legend").innerHTML = `<b>Colour</b> = who controls the province.
    <br><b>禾</b> rice · <b>⚔</b> units · <b>▲</b> castle · <b>★</b> daimyō · <b>⛩</b> Kyoto · <span style="color:#e8b53a">◯ siege</span>`;
};
UI.featGlyph = function (f) {
  return (DATA.features[f] && DATA.features[f].glyph) || "";
};

/* ---------------------------------------------------------------------
 * PROVINCE CLICK / SELECTION
 * ------------------------------------------------------------------- */
UI.onProvinceClick = function (id) {
  const S = SR.state;
  if (UI.moveMode) {
    if (id === UI.moveMode) { UI.cancelMove(); return; }
    if (SR.stat(UI.moveMode).adj.includes(id)) {
      const chk = SR.canReach(S, UI.moveMode, id, S.humanClan);
      if (!chk.ok) { UI.toast(chk.reason); return; }
      UI.openMarch(UI.moveMode, id);
      return;
    }
    UI.cancelMove();
  }
  UI.selectProvince(id);
};
UI.selectProvince = function (id) {
  UI.selected = id; UI.tab = "province";
  $$(".tab").forEach(t => t.classList.toggle("active", t.dataset.tab === "province"));
  UI.render();
};
UI.enterMove = function (fromId) { UI.moveMode = fromId; UI.toast("Select a neighbouring province to march into."); UI.render(); $("#hint").textContent = "Marching from " + SR.stat(fromId).name + " — click a highlighted neighbour, or click the origin to cancel."; };
UI.cancelMove = function () { UI.moveMode = null; UI.render(); };

/* ---------------------------------------------------------------------
 * TABS
 * ------------------------------------------------------------------- */
UI.renderTab = function () {
  const S = SR.state, body = $("#tab-body");
  const fn = ({ province: UI.tabProvince, clans: UI.tabClans, diplo: UI.tabDiplo,
    spy: UI.tabSpy, court: UI.tabCourt, ambition: UI.tabAmbition, log: UI.tabLog })[UI.tab] || UI.tabProvince;
  body.innerHTML = fn(S);
  UI.wireTab(S);
};

UI.unitLine = function (units) {
  const counts = {};
  units.forEach(u => counts[u.type] = (counts[u.type] || 0) + 1);
  if (!units.length) return `<span class="small">— no units —</span>`;
  return Object.keys(counts).map(t => {
    const d = DATA.units[t];
    return `<span class="unit-row"><span class="unit-glyph" style="background:${UI.unitColor(t)}">${d.glyph}</span>${d.name} ×${counts[t]}</span>`;
  }).join("");
};
UI.unitColor = (t) => ({ ashigaru: "#8a7b52", samurai: "#b0281f", cavalry: "#7d4a1f",
  archers: "#4f6d3a", teppo: "#4a4a4a", warship: "#2f6b7d", siege: "#6b5636" }[t] || "#555");

UI.tabProvince = function (S) {
  const id = UI.selected;
  if (!id) return `<div class="panel"><h3>The Realm</h3><p class="psub">Click a province on the map to inspect it. Your provinces glow when selected; from one of yours, use <b>March</b> to move or attack.</p>
    <div class="divider"></div>${UI.objectivesHTML(S)}</div>`;
  const p = DATA.provinces[id], ps = S.provinces[id];
  const mine = ps.owner === S.humanClan;
  const owner = ps.owner ? S.clans[ps.owner].name : "Independent";
  const feat = p.feature ? `<div class="tag feat" title="${esc(DATA.features[p.feature].desc)}">${DATA.features[p.feature].name}</div>` : "";
  const siegeInfo = ps.siege ? `<div class="tag status-occupied">Under siege by ${S.clans[ps.siege.by].name}</div>` : "";
  let acts = "";
  if (ps.siege && ps.siege.by === S.humanClan) {
    // you are besieging this (enemy/neutral) province — surface the siege command
    acts = `<div class="act-grid" style="margin-bottom:8px">
        <button class="act" data-a="siege" data-id="${id}"><span class="ai">⚔</span>Siege command</button></div>` +
      UI.enemyProvinceActions(S, id, ps);
  } else if (mine) acts = UI.provinceActions(S, id, ps);
  else acts = UI.enemyProvinceActions(S, id, ps);

  return `<div class="panel">
    <h3>${p.kyoto ? "⛩ " : ""}${esc(p.name)}</h3>
    <div class="psub">${p.terrain} · Ruled by <b>${esc(owner)}</b> · <span class="tag status-${ps.status}">${ps.status}</span></div>
    <div style="margin-bottom:6px">${feat}${siegeInfo}</div>
    <div class="kv"><span class="k">Rice (koku)</span><span>禾 ${SR.provKoku(S, id)}</span></div>
    <div class="kv"><span class="k">Castle</span><span>${"▲".repeat(ps.castle) || "none"} (lvl ${ps.castle})</span></div>
    ${ps.unrest ? `<div class="kv"><span class="k">Unrest</span><span class="warn">${ps.unrest}</span></div>` : ""}
    ${Object.keys(ps.buildings).length ? `<div class="kv"><span class="k">Buildings</span><span>${Object.keys(ps.buildings).map(b => DATA.buildings[b] ? DATA.buildings[b].name : b).join(", ")}</span></div>` : ""}
    <div class="divider"></div>
    <div class="k small" style="margin-bottom:4px">Garrison ${UI.revealNote(S, id)}</div>
    ${UI.unitVisible(S, id) ? UI.unitLine(ps.units) : `<span class="small">Unknown — scout with Reconnaissance.</span>`}
    <div class="divider"></div>
    ${acts}
  </div>`;
};
UI.unitVisible = function (S, id) { return SR.visibleTo(S, S.humanClan, id); };
UI.revealNote = (S, id) => UI.unitVisible(S, id) ? "" : "";

UI.provinceActions = function (S, id, ps) {
  const canAct = ps.status === "pacified" || ps.status === "home";
  const besieging = Object.keys(S.provinces).filter(pid => S.provinces[pid].siege && S.provinces[pid].siege.by === S.humanClan &&
    SR.stat(pid).adj.includes(id));
  let mySiege = "";
  if (ps.siege && ps.siege.by === S.humanClan) {
    mySiege = `<div class="act-grid" style="margin-bottom:8px">
      <button class="act" data-a="siege" data-id="${id}"><span class="ai">⚔</span>Siege command</button></div>`;
  } else if (ps.siege && ps.owner === S.humanClan) {
    mySiege = `<div class="act-grid" style="margin-bottom:8px">
      <button class="act" data-a="defsiege" data-id="${id}"><span class="ai">🛡</span>Withstand the siege</button></div>`;
  }
  let g = `<div class="act-grid">`;
  g += `<button class="act" data-a="march" data-id="${id}" ${SR.movableUnits(S, id).length ? "" : "disabled"}><span class="ai">⚔</span>March / Attack</button>`;
  g += `<button class="act" data-a="recruit" data-id="${id}" ${canAct ? "" : "disabled"}><span class="ai">🪖</span>Recruit</button>`;
  g += `<button class="act" data-a="build" data-id="${id}" ${canAct ? "" : "disabled"}><span class="ai">🏗</span>Build</button>`;
  if (ps.status === "occupied") g += `<button class="act" data-a="pacify" data-id="${id}"><span class="ai">🕊</span>Pacify (${SR.pacifyCost(S, id)}◍)</button>`;
  if (canAct && !ps.buildings.__ && S.mode === "A") g += `<button class="act" data-a="raze" data-id="${id}"><span class="ai">🔥</span>Raze</button>`;
  g += `</div>`;
  return mySiege + g;
};
UI.enemyProvinceActions = function (S, id, ps) {
  // find your adjacent provinces with movable armies
  const froms = SR.stat(id).adj.filter(a => S.provinces[a].owner === S.humanClan && SR.movableUnits(S, a).length);
  if (!froms.length) return `<span class="small">March an army to a neighbouring province you hold to attack here.</span>`;
  return `<div class="small" style="margin-bottom:6px">Attack from:</div>` + froms.map(f =>
    `<button class="list-btn" data-a="attackfrom" data-from="${f}" data-to="${id}">
      <div class="lb-t">From ${esc(SR.stat(f).name)}</div>
      <div class="lb-d">${SR.movableUnits(S, f).length} units ready · power ${Math.round(SR.armyPower(SR.movableUnits(S, f)))}</div></button>`).join("");
};

UI.tabClans = function (S) {
  const clans = SR.livingClans(S).sort((a, b) => (S.mode === "B" ? SR.retainerPower(S, b).power - SR.retainerPower(S, a).power : SR.scoreTotal(S, b).total - SR.scoreTotal(S, a).total));
  const maxV = S.mode === "B" ? Math.max(1, ...clans.map(c => SR.retainerPower(S, c).power)) : Math.max(1, ...clans.map(c => SR.scoreTotal(S, c).total));
  return `<div class="panel"><h3>The Powers</h3><p class="psub">${S.mode === "B" ? "Retainers of " + S.modeB.house : "Rival daimyō"} — estimated standing.</p>` +
    clans.map(cid => {
      const c = S.clans[cid];
      const v = S.mode === "B" ? Math.round(SR.retainerPower(S, cid).power) : SR.scoreTotal(S, cid).total;
      const rel = cid === S.humanClan ? "you" : (S.clans[S.humanClan].relations[cid] ? S.clans[S.humanClan].relations[cid].pact : "none");
      return `<div class="clan-list-row">
        <span class="mini-crest" style="background:${c.color}">${c.crest}</span>
        <span class="cln">${esc(c.name)}${cid === S.humanClan ? ' <span class="you-badge">YOU</span>' : ""}
          <div class="bar"><i style="width:${Math.round(v / maxV * 100)}%;background:${c.color}"></i></div>
        </span>
        <span class="clv">${v}</span>
      </div>
      <div class="small" style="padding:0 4px 2px 32px">${SR.pacifiedProvinces(S, cid).length} prov · Honour ${c.honour} (${SR.honourBand(c.honour).name})${rel !== "you" && rel !== "none" ? " · " + rel : ""}</div>
      <div class="axes" style="padding:0 4px 7px 32px">${UI.axisChips(c)}</div>`;
    }).join("") + `</div>`;
};
/* Five-axis clan profile chips (Appendix A). */
UI.axisChips = function (c) {
  const ax = [["MS", c.ms], ["Ec", c.ec], ["Nv", c.nv], ["Dp", c.dp], ["In", c.in]];
  return ax.map(([k, v]) => `<span class="axis" title="${k}: ${v}/5"><b>${k}</b>${"●".repeat(v)}${"○".repeat(5 - v)}</span>`).join("");
};

UI.tabDiplo = function (S) {
  if (S.mode === "B") return `<div class="panel"><h3>Diplomacy</h3><p class="psub">In the House Divided, deal directly with your fellow retainers through the <b>Shadow</b> and the <b>Ambition</b> tab. Formal pacts are for the Warring Clans.</p></div>`;
  const others = SR.livingClans(S).filter(c => c !== S.humanClan);
  let h = `<div class="panel"><h3>Diplomacy</h3><p class="psub">Forge pacts. Binding pacts need both parties at Low Honour or above.</p>`;
  for (const cid of others) {
    const c = S.clans[cid]; const r = S.clans[S.humanClan].relations[cid];
    h += `<div style="border:1px solid var(--paper-line);border-radius:8px;padding:9px;margin-bottom:8px">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
        <span class="mini-crest" style="background:${c.color}">${c.crest}</span>
        <b style="font-family:var(--font-h)">${esc(c.name)}</b>
        <span class="small">${r.pact !== "none" ? "· " + SR.PACTS[r.pact].name : ""}</span>
      </div>
      <div class="chips">
        <button class="chip" data-a="pact" data-to="${cid}" data-p="nap">Non-Aggression</button>
        <button class="chip" data-a="pact" data-to="${cid}" data-p="trade">Trade</button>
        <button class="chip" data-a="pact" data-to="${cid}" data-p="alliance">Alliance</button>
        <button class="chip" data-a="pact" data-to="${cid}" data-p="marriage">Marriage</button>
        <button class="chip" data-a="pact" data-to="${cid}" data-p="vassal">Demand Vassalage</button>
      </div></div>`;
  }
  return h + `</div>`;
};

UI.tabSpy = function (S) {
  const c = S.clans[S.humanClan];
  let h = `<div class="panel"><h3>The Shadow</h3><p class="psub">Recruit Shinobi, embed them (one season), then run ops. Op strength = embedded agents + koban + Spymaster.</p>`;
  h += `<div class="act-grid">
    <button class="act" data-a="agent"><span class="ai">🥷</span>Recruit Shinobi (${SR.AGENT_COST}◍)</button>
    <button class="act" data-a="spymaster" ${c.spymaster ? "disabled" : ""}><span class="ai">👁</span>${c.spymaster ? "Spymaster kept" : "Hire Spymaster (" + SR.SPYMASTER_COST + "◍)"}</button>
  </div><div class="divider"></div>`;
  h += `<div class="k small" style="margin-bottom:5px">Your agents (${c.agents.length})</div>`;
  if (!c.agents.length) h += `<span class="small">None yet.</span>`;
  c.agents.forEach(a => {
    const emb = a.embedAbs !== null && a.embedAbs <= SR.absSeason(S);
    h += `<div class="small" style="padding:3px 0">🥷 ${a.target ? "in " + SR.stat(a.target).name + (emb ? " · <span class='okc'>embedded</span>" : " · embedding…") : "<i>idle</i>"}
      ${!a.target ? `<button class="chip" data-a="deploy" data-uid="${a.uid}" style="padding:2px 8px;font-size:11px">Deploy</button>` : ""}
      ${emb ? `<button class="chip" data-a="op" data-uid="${a.uid}" data-t="${a.target}" style="padding:2px 8px;font-size:11px">Run op</button>` : ""}</div>`;
  });
  return h + `</div>`;
};

UI.tabCourt = function (S) {
  const c = S.clans[S.humanClan];
  const host = S.courtHost ? S.clans[S.courtHost].name : "none (Kyoto contested)";
  let h = `<div class="panel"><h3>The Imperial Court</h3>
    <p class="psub">Kyoto's host: <b>${esc(host)}</b>. Climb the ranks for great Prestige — but Honour gates the way.</p>`;
  h += `<div class="kv"><span class="k">Your Court Rank</span><span>${c.courtRank ? DATA.courtRanks[c.courtRank - 1].name : "none"}</span></div>`;
  const e = SR.courtEligible(S, c.id);
  if (!DATA.courtRanks[c.courtRank]) h += `<p class="okc small" style="margin-top:10px">You hold the highest office.</p>`;
  else {
    const nx = DATA.courtRanks[c.courtRank];
    const cost = SR.courtCost(S, c.id, nx);
    h += `<div class="divider"></div><div class="k small">Next: ${nx.name}</div>
      <div class="small" style="margin:6px 0">Cost ${cost}◍${cost !== nx.cost ? ` <span class="okc">(Dp)</span>` : ""} · Honour ≥ ${nx.honour} (${SR.honourBand(nx.honour).name})${nx.provinces ? " · ≥ " + nx.provinces + " provinces" : ""}${nx.kyoto ? " · control Kyoto" : ""} → +${nx.prestige} Prestige</div>
      <button class="primary" data-a="court" ${e.ok ? "" : "disabled"} style="width:100%">${e.ok ? "Petition the Court" : "Not yet eligible"}</button>
      ${e.ok ? "" : `<p class="warn small" style="margin-top:6px">${e.reason}</p>`}`;
  }
  return h + `</div>`;
};

UI.tabAmbition = function (S) {
  const c = S.clans[S.humanClan]; const M = S.modeB;
  const amb = DATA.ambitions.find(a => a.key === c.ambition);
  const share = Math.round(SR.modeBInvaderShare(S) * 100);
  let h = `<div class="panel"><h3>Your Secret Ambition</h3>
    <div style="background:#f6eed9;border:1px solid var(--gold2);border-radius:8px;padding:11px;margin-bottom:10px">
      <div style="font-family:var(--font-h);font-size:15px;color:var(--vermilion)">${amb.name}</div>
      <div class="small" style="margin-top:4px">${amb.text}</div>
      <div class="small okc" style="margin-top:6px">Win if: ${amb.hint}</div>
    </div>
    <div class="kv"><span class="k">Standing with the lord</span><span>${c.standing}</span></div>
    <div class="kv"><span class="k">The lord (${esc(M.lordName)})</span><span>${M.lordAlive ? "alive" : "<b class='warn'>dead — succession!</b>"}</span></div>
    <div class="kv"><span class="k">Land held by outside rivals</span><span class="${share >= 30 ? "warn" : ""}">${share}%</span></div>`;
  if (M.lordAlive && M.directive) {
    h += `<div class="divider"></div><div class="k small">The lord's directive this season</div>
      <div class="small" style="margin:5px 0">${esc(M.directive.text)} (asks ${M.directive.ask} ${M.directive.give})</div>`;
    if (!M.directiveAsked) h += `<div class="act-grid">
        <button class="act" data-a="contribute"><span class="ai">🤝</span>Contribute (+2 Standing)</button>
        <button class="act" data-a="refuse"><span class="ai">✋</span>Refuse (−2 Standing)</button></div>`;
    else h += `<p class="small okc">You have answered the lord this season.</p>`;
  }
  return h + `</div>`;
};

UI.tabLog = function (S) {
  return `<div class="panel"><h3>Chronicle</h3>` +
    S.log.slice(0, 60).map(e => `<div class="log-entry ${e.kind}"><span class="lt">${e.t}</span><br>${esc(e.msg)}</div>`).join("") + `</div>`;
};

UI.objectivesHTML = function (S) {
  if (S.mode === "B") {
    const c = S.clans[S.humanClan]; const amb = DATA.ambitions.find(a => a.key === c.ambition);
    return `<div class="k small" style="margin-bottom:4px">Your charge</div><div class="small">Keep the House of ${S.modeB.house} alive against outside rivals — and quietly pursue: <b>${amb.name}</b> (${amb.hint}). See the Ambition tab.</div>`;
  }
  const sc = SR.scoreTotal(S, S.humanClan);
  return `<div class="k small" style="margin-bottom:4px">The roads to victory</div>
    <div class="small">Most Prestige at the end of Year ${S.lengthYears} wins. Your estimate: <b>${sc.total}</b>
    (standing ${sc.standing} + banked ${sc.banked} + honour ${sc.honour} + majorities ${sc.majorities}).<br>
    Or a <b>sudden win</b>: Kyoto + ${DATA.win.conquestProvinces} of 24 provinces, or ${DATA.win.wealthKoban} koban with ${DATA.win.wealthBuildings} markets/ports.</div>`;
};

/* ---------------------------------------------------------------------
 * TAB EVENT WIRING (delegated)
 * ------------------------------------------------------------------- */
UI.wireTab = function (S) {
  $("#tab-body").querySelectorAll("[data-a]").forEach(el => {
    el.onclick = () => UI.action(el.dataset.a, el.dataset, el);
  });
};
UI.action = function (a, d) {
  const S = SR.state, cid = S.humanClan;
  const after = (res) => { if (res && res.ok === false) UI.toast(res.reason); UI.render(); };
  switch (a) {
    case "march": UI.enterMove(d.id); break;
    case "attackfrom": UI.openMarch(d.from, d.to); break;
    case "recruit": UI.openRecruit(d.id); break;
    case "build": UI.openBuild(d.id); break;
    case "pacify": after(SR.doPacify(S, d.id, cid)); break;
    case "raze": UI.confirm(`Raze ${SR.stat(d.id).name}? This destroys its buildings & income and costs 3 Honour.`, () => after(SR.doRaze(S, d.id, cid))); break;
    case "assault": UI.doAssault(d.id); break;
    case "lift": SR.liftSiege(S, d.id); UI.render(); break;
    case "siege": UI.openSiege(d.id); break;
    case "sortie": UI.doSortie(d.id); break;
    case "defsiege": UI.openDefenseSiege(d.id); break;
    case "court": after(SR.doCourt(S, cid)); break;
    case "agent": after(SR.recruitAgent(S, cid)); break;
    case "spymaster": after(SR.hireSpymaster(S, cid)); break;
    case "deploy": UI.openDeploy(d.uid); break;
    case "op": UI.openOp(d.uid, d.t); break;
    case "pact": UI.doPact(d.to, d.p); break;
    case "contribute": SR.modeBContribute(S, cid, true); S.modeB.directiveAsked = true; UI.render(); break;
    case "refuse": SR.modeBContribute(S, cid, false); S.modeB.directiveAsked = true; UI.render(); break;
  }
};

/* ---------------------------------------------------------------------
 * ACTION MODALS
 * ------------------------------------------------------------------- */
UI.openRecruit = function (id) {
  const S = SR.state, cid = S.humanClan;
  const types = Object.keys(DATA.units);
  const rows = types.map(t => {
    const acc = SR.canRecruit(S, cid, t);
    const cost = SR.recruitCost(S, cid, t, id);
    const afford = S.clans[cid].koban >= (cost.koban || 0) && S.clans[cid].rice >= (cost.rice || 0);
    const dis = !acc.ok || !afford;
    const d = DATA.units[t];
    return `<button class="list-btn" data-t="${t}" ${dis ? "disabled" : ""}>
      <div class="lb-t"><span class="unit-glyph" style="background:${UI.unitColor(t)}">${d.glyph}</span> ${d.name}
        <span style="float:right">${cost.koban || 0}◍${cost.rice ? " " + cost.rice + "🌾" : ""}</span></div>
      <div class="lb-d">Atk ${d.atk} · Def ${d.def} · Move ${d.move} · upkeep ${d.upkeep}🌾 — ${esc(d.desc)}${acc.ok ? "" : `<br><span class='warn'>${acc.reason}</span>`}</div>
    </button>`;
  }).join("");
  UI.modal({
    title: "Recruit at " + SR.stat(id).name,
    body: `<div class="small" style="margin-bottom:8px">Treasury: ${S.clans[cid].koban}◍ · ${S.clans[cid].rice}🌾. Newly raised troops cannot march until next season.</div>${rows}`,
    foot: `<button class="ghost" onclick="UI.closeModal()">Done</button>`,
  });
  $("#modal-body").querySelectorAll("[data-t]").forEach(b => b.onclick = () => {
    const r = SR.doRecruit(S, cid, id, b.dataset.t); if (!r.ok) UI.toast(r.reason);
    UI.openRecruit(id); UI.renderTop(); UI.renderMap();
  });
};

UI.openBuild = function (id) {
  const S = SR.state, cid = S.humanClan, ps = S.provinces[id];
  const keys = Object.keys(DATA.buildings).concat(["castle"]);
  const rows = keys.map(k => {
    if (k === "castle") {
      const dis = ps.castle >= 4 || S.clans[cid].koban < 4;
      return `<button class="list-btn" data-k="castle" ${dis ? "disabled" : ""}>
        <div class="lb-t">Castle Upgrade <span style="float:right">4◍</span></div>
        <div class="lb-d">Raise the castle to level ${Math.min(4, ps.castle + 1)} (+2 defensive strength, +1 Prestige/level).</div></button>`;
    }
    const b = DATA.buildings[k]; const have = ps.buildings[k];
    let reason = "";
    if (have) reason = "Already built.";
    else if (b.needsCoast && SR.stat(id).terrain !== "Coast") reason = "Needs a Coast province.";
    else if (b.needsMineral && !["silver", "gold"].includes(SR.stat(id).feature)) reason = "Needs a silver/gold feature.";
    else if (b.unique && SR.clanProvinces(S, cid).some(p => S.provinces[p].buildings[k])) reason = "Only one allowed.";
    else if (S.clans[cid].koban < b.cost) reason = "Not enough koban.";
    return `<button class="list-btn" data-k="${k}" ${reason ? "disabled" : ""}>
      <div class="lb-t">${b.name} <span style="float:right">${b.cost}◍</span></div>
      <div class="lb-d">${esc(b.desc)}${reason ? `<br><span class='warn'>${reason}</span>` : ""}</div></button>`;
  }).join("");
  UI.modal({
    title: "Build at " + SR.stat(id).name,
    body: `<div class="small" style="margin-bottom:8px">Treasury: ${S.clans[cid].koban}◍</div>${rows}`,
    foot: `<button class="ghost" onclick="UI.closeModal()">Done</button>`,
  });
  $("#modal-body").querySelectorAll("[data-k]").forEach(b => b.onclick = () => {
    const r = SR.doBuild(S, cid, id, b.dataset.k); if (!r.ok) UI.toast(r.reason);
    UI.openBuild(id); UI.renderTop(); UI.renderMap();
  });
};

/* ---------------------------------------------------------------------
 * DEPLOYMENT BOARD — tap a unit, then a flank, to place it individually.
 * Raise field works (palisade / stakes / gun emplacement / redoubt) into a
 * flank, set each flank's posture, and mark front-rank units. Reused by the
 * attacker (March) and the defender (Under Attack) screens.
 * ------------------------------------------------------------------- */
UI.newDeploy = function (units, worksBudget) {
  return {
    units: units.map(u => ({ uid: u.uid, type: u.type })),
    pool: units.map(u => u.uid), L: [], C: [], R: [], RES: [],
    front: { L: [], C: [], R: [] }, works: { L: [], C: [], R: [] },
    post: { L: "Line", C: "Line", R: "Line" },
    worksBudget: worksBudget || 0, sel: null,
  };
};
UI.dpWorksLeft = st => st.worksBudget - (st.works.L.length + st.works.C.length + st.works.R.length);
UI.dpZoneOf = (st, uid) => ["L", "C", "R", "RES"].find(z => st[z].includes(uid));
UI.dpAuto = function (st, terrain) {
  const d = SR.autoDeploy(st.units.map(u => ({ uid: u.uid, type: u.type })), "att", terrain);
  st.L = d.L.slice(); st.C = d.C.slice(); st.R = d.R.slice(); st.RES = d.RES.slice();
  st.pool = []; st.front = { L: [], C: [], R: [] }; st.post = { L: d.pL, C: d.pC, R: d.pR }; st.sel = null;
};
UI.dpReady = st => st.pool.length === 0 && (st.L.length + st.C.length + st.R.length) > 0;
UI.dpToObj = function (st) {
  return { L: st.L.slice(), C: st.C.slice(), R: st.R.slice(), RES: st.RES.slice(),
    pL: st.post.L, pC: st.post.C, pR: st.post.R,
    front: { L: st.front.L.slice(), C: st.front.C.slice(), R: st.front.R.slice() },
    works: { L: st.works.L.slice(), C: st.works.C.slice(), R: st.works.R.slice() } };
};
UI.dpHTML = function (st) {
  const typeOf = uid => (st.units.find(u => u.uid === uid) || {}).type;
  const chip = (uid, placed) => {
    const t = typeOf(uid), d = DATA.units[t];
    const on = st.sel && st.sel.kind === "unit" && st.sel.uid === uid ? " sel" : "";
    const front = placed && ["L", "C", "R"].some(z => st.front[z].includes(uid));
    return `<span class="dp-unit${on}" data-du="${uid}"><span class="unit-glyph" style="background:${UI.unitColor(t)}">${d.glyph}</span>${d.name}` +
      `${placed ? `<b class="dp-star${front ? " on" : ""}" data-dfront="${uid}" title="Front rank — fights first, shields the rest">★</b>` : ""}</span>`;
  };
  const worksIn = z => st.works[z].map((wk, i) => { const w = DATA.fieldWorks[wk];
    return `<span class="dp-work" title="${esc(w.desc)}">${w.glyph} ${esc(w.name)}<b data-drmwork="${z}:${i}">✕</b></span>`; }).join("");
  const zone = (z, label) => `<div class="dp-zone" data-dzone="${z}">
    <div class="dp-zh">${label}${z !== "RES" ? ` <b class="dp-post" data-dpost="${z}" title="Posture: Deep resists a charge · Wide overlaps · Line balanced">${st.post[z]}</b>` : ""}</div>
    <div class="dp-units">${st[z].map(u => chip(u, true)).join("") || '<span class="dp-empty">—</span>'}</div>
    ${z !== "RES" ? `<div class="dp-works">${worksIn(z)}</div>` : ""}</div>`;
  const left = UI.dpWorksLeft(st);
  const wbtns = Object.keys(DATA.fieldWorks).map(k => { const w = DATA.fieldWorks[k];
    const on = st.sel && st.sel.kind === "work" && st.sel.key === k ? " sel" : "";
    return `<span class="dp-wbtn${on}${left <= 0 ? " dis" : ""}" data-dwork="${k}" title="${esc(w.desc)}">${w.glyph} ${esc(w.name)}</span>`; }).join("");
  return `<div class="dp-wrap">
    <div class="dp-hint">${st.sel ? (st.sel.kind === "unit" ? "Now tap a flank to place this unit." : "Now tap a flank to raise this work.") : "Tap a unit, then tap a flank to place it. Tap ★ for front rank."}</div>
    <div class="dp-pool" data-dzone="POOL"><div class="dp-zh">Not placed (${st.pool.length}) — tap here to pull a unit back</div>
      <div class="dp-units">${st.pool.map(u => chip(u, false)).join("") || '<span class="dp-empty">all placed ✓</span>'}</div></div>
    <div class="dp-board">${zone("L", "◀ Left")}${zone("C", "▲ Centre")}${zone("R", "Right ▶")}</div>
    ${zone("RES", "Reserve — commit mid-battle to a losing flank")}
    ${st.worksBudget ? `<div class="dp-worksbar"><span class="dp-wl">Field works — ${left} left:</span>${wbtns}</div>` : ""}
  </div>`;
};
UI.wireDeploy = function (host, st, rerender) {
  host.querySelectorAll("[data-du]").forEach(el => el.onclick = (e) => {
    if (e.target.closest("[data-dfront]")) return;
    if (st.sel) return;              // an item is in hand → let the click bubble to the flank (drop)
    e.stopPropagation();             // nothing in hand → pick this unit up (don't reach the flank)
    st.sel = { kind: "unit", uid: +el.dataset.du }; rerender();
  });
  host.querySelectorAll("[data-dfront]").forEach(el => el.onclick = (e) => {
    e.stopPropagation(); const uid = +el.dataset.dfront, z = UI.dpZoneOf(st, uid);
    if (z && z !== "RES") { const f = st.front[z], i = f.indexOf(uid); if (i >= 0) f.splice(i, 1); else f.push(uid); }
    rerender();
  });
  host.querySelectorAll("[data-dzone]").forEach(el => el.onclick = () => {
    const z = el.dataset.dzone;
    if (st.sel && st.sel.kind === "unit") {
      const uid = st.sel.uid;
      ["L", "C", "R", "RES"].forEach(zz => { let i = st[zz].indexOf(uid); if (i >= 0) st[zz].splice(i, 1);
        const fi = st.front[zz] ? st.front[zz].indexOf(uid) : -1; if (fi >= 0) st.front[zz].splice(fi, 1); });
      const pi = st.pool.indexOf(uid); if (pi >= 0) st.pool.splice(pi, 1);
      if (z === "POOL") st.pool.push(uid); else st[z].push(uid);
      st.sel = null; rerender();
    } else if (st.sel && st.sel.kind === "work") {
      if (["L", "C", "R"].includes(z) && UI.dpWorksLeft(st) > 0) { st.works[z].push(st.sel.key); st.sel = null; rerender(); }
    }
  });
  host.querySelectorAll("[data-dwork]").forEach(el => el.onclick = () => {
    if (UI.dpWorksLeft(st) <= 0) return; st.sel = { kind: "work", key: el.dataset.dwork }; rerender();
  });
  host.querySelectorAll("[data-drmwork]").forEach(el => el.onclick = (e) => {
    e.stopPropagation(); const [z, i] = el.dataset.drmwork.split(":"); st.works[z].splice(+i, 1); rerender();
  });
  host.querySelectorAll("[data-dpost]").forEach(el => el.onclick = (e) => {
    e.stopPropagation(); const z = el.dataset.dpost, cyc = { Line: "Deep", Deep: "Wide", Wide: "Line" }; st.post[z] = cyc[st.post[z]]; rerender();
  });
};

UI.marchState = null;
UI.openMarch = function (fromId, toId) {
  const S = SR.state, cid = S.humanClan;
  const hostile = SR.isHostile(S, toId, cid);
  const movable = SR.movableUnits(S, fromId);
  UI.marchState = { fromId, toId, sel: movable.map(u => u.uid), surprise: false, bringDaimyo: false,
    dep: hostile ? UI.newDeploy(movable, 1) : null };
  if (hostile && UI.marchState.dep) UI.dpAuto(UI.marchState.dep, SR.stat(toId).terrain);   // start pre-arranged
  UI.renderMarch();
};
UI.renderMarch = function () {
  const S = SR.state, cid = S.humanClan, m = UI.marchState;
  const { fromId, toId } = m;
  const hostile = SR.isHostile(S, toId, cid);
  const ps = S.provinces[toId];
  const movable = SR.movableUnits(S, fromId);
  const daimyoHere = S.clans[cid].daimyoAlive && S.clans[cid].daimyoLoc === fromId;
  const defenders = UI.unitVisible(S, toId) ? `${ps.units.length} units, power ${Math.round(SR.armyPower(ps.units))}${ps.castle ? ", castle lvl " + ps.castle : ""}` : "unknown strength" + (ps.castle ? ", castle lvl " + ps.castle : "");

  if (!hostile) {
    const picks = movable.map(u => { const d = DATA.units[u.type]; const on = m.sel.includes(u.uid);
      return `<span class="upick ${on ? "sel" : ""}" data-uid="${u.uid}"><span class="unit-glyph" style="background:${UI.unitColor(u.type)}">${d.glyph}</span>${d.name}</span>`; }).join("");
    UI.modal({ title: "March",
      body: `<div class="small" style="margin-bottom:10px">Marching into <b>${esc(SR.stat(toId).name)}</b> (${SR.stat(toId).terrain}) from ${esc(SR.stat(fromId).name)}.</div>
        <div class="field"><label>Commit which units (${m.sel.length}/${movable.length})</label><div class="unit-pick">${picks || "<span class='small'>none available</span>"}</div></div>`,
      foot: `<button class="ghost" onclick="UI.closeModal()">Cancel</button><button class="primary" id="march-go" ${m.sel.length ? "" : "disabled"}>March</button>` });
    $("#modal-body").querySelectorAll("[data-uid]").forEach(el => el.onclick = () => { const uid = +el.dataset.uid;
      if (m.sel.includes(uid)) m.sel = m.sel.filter(x => x !== uid); else m.sel.push(uid); UI.renderMarch(); });
    $("#march-go").onclick = () => GAME.humanMarch(m);
    return;
  }

  const ready = UI.dpReady(m.dep);
  UI.modal({
    title: "March to Battle — " + esc(SR.stat(toId).terrain),
    body: `<div class="small" style="margin-bottom:8px">Attacking <b>${esc(SR.stat(toId).name)}</b> from ${esc(SR.stat(fromId).name)}. Defenders: ${defenders}.</div>
      ${UI.dpHTML(m.dep)}
      <div class="dp-opts">
        <span class="chip ${!m.surprise ? "sel" : ""}" data-sur="0">Declared</span>
        <span class="chip ${m.surprise ? "sel" : ""}" data-sur="1">Surprise (−2 Honour, ambush)</span>
        ${daimyoHere ? `<span class="chip ${m.bringDaimyo ? "sel" : ""}" data-daimyo="1">Lead with ${esc(S.clans[cid].daimyo)} (+cmd, at risk)</span>` : ""}
      </div>`,
    foot: `<button class="ghost" onclick="UI.closeModal()">Cancel</button>
      <button class="ghost" id="dp-auto">Auto-arrange</button>
      <button class="primary" id="march-go" ${ready ? "" : "disabled"} title="${ready ? "" : "Place all your units first"}">Engage!</button>`,
  });
  const mb = $("#modal-body");
  UI.wireDeploy(mb, m.dep, UI.renderMarch);
  mb.querySelectorAll("[data-sur]").forEach(el => el.onclick = () => { m.surprise = el.dataset.sur === "1"; UI.renderMarch(); });
  mb.querySelectorAll("[data-daimyo]").forEach(el => el.onclick = () => { m.bringDaimyo = !m.bringDaimyo; UI.renderMarch(); });
  $("#dp-auto").onclick = () => { UI.dpAuto(m.dep, SR.stat(toId).terrain); UI.renderMarch(); };
  $("#march-go").onclick = () => {
    m.sel = [...m.dep.L, ...m.dep.C, ...m.dep.R, ...m.dep.RES];
    m.deploy = UI.dpToObj(m.dep);
    GAME.humanMarch(m);
  };
};

/* ---------------------------------------------------------------------
 * BATTLE REPORT
 * ------------------------------------------------------------------- */
UI.showBattleReport = function (report, onDone) {
  const S = SR.state;
  // A live field battle the human is fighting — play it out on the dice board.
  if (report && report.interactive && report.ctx) { UI.runBattle(report, onDone); return; }
  if (UI.audio) UI.audio.play(report && report.outcome === "occupied" ? "capture" : "battle");
  if (!report || !report.sim) {
    // walkover / siege-start / occupation
    UI.modal({
      title: report && report.outcome === "siege" ? "Siege Begins" : "March",
      body: `<p>${esc(report ? (report.text || report.postText || "The army advances.") : "The army advances.")}</p>
        ${report && report.honourNote ? `<p class="warn small">${esc(report.honourNote)}</p>` : ""}`,
      foot: `<button class="primary" id="br-ok">Continue</button>`,
    });
    $("#br-ok").onclick = () => { UI.closeModal(); onDone && onDone(); };
    return;
  }
  const r = report.sim;
  const attName = report.attCid ? S.clans[report.attCid].name : "Attacker";
  const defName = report.defCid ? S.clans[report.defCid].name : "Independents";
  const humanAtt = report.attCid === S.humanClan;
  const win = (r.winner === "att" && humanAtt) || (r.winner === "def" && report.defCid === S.humanClan);
  let lines = "";
  const all = [...r.rounds];
  all.forEach((ln, i) => {
    lines += `<div class="round-line ${ln.n === "Ambush" ? "ambush" : ""}" style="animation-delay:${i * 0.25}s">${esc(ln.text)}${ln.mA !== undefined ? `<div class="mbar"><span>morale — att ${ln.mA} / def ${ln.mD}</span></div>` : ""}</div>`;
  });
  const outcomeTxt = r.winner === "att"
    ? `${esc(attName)} carry the field${r.routed === "def" ? " — the enemy routs!" : "."}`
    : `${esc(defName)} hold${r.routed === "att" ? " — the attackers rout!" : " the field."}`;
  const body = `
    <div class="battle-head">
      <div class="bh-side att"><div class="bhn">${esc(attName)}</div><div class="small">${report.attStart} units · ${report.terrain}</div></div>
      <div class="bh-vs">⚔</div>
      <div class="bh-side"><div class="bhn">${esc(defName)}</div><div class="small">${report.defStart} units</div></div>
    </div>
    ${report.surprise ? `<p class="small" style="color:var(--vermilion)">A surprise attack — the ambush falls before the lines form.</p>` : ""}
    <div>${lines}</div>
    <div class="outcome ${win ? "win" : "lose"}">${outcomeTxt}</div>
    ${report.postText ? `<p class="small" style="margin-top:8px">${esc(report.postText)}</p>` : ""}
    ${report.honourNote ? `<p class="warn small">${esc(report.honourNote)}</p>` : ""}
    ${report.generalFate && report.generalFate !== "escape" ? `<p class="small"><b>A leader ${report.generalFate === "seppuku" ? "commits seppuku" : report.generalFate === "captured" ? "is captured" : "falls"}.</b></p>` : ""}`;
  UI.modal({ title: "The Field of Battle", body,
    foot: `<button class="primary" id="br-ok">Continue</button>` });
  $("#br-ok").onclick = () => {
    UI.closeModal();
    if (report.pendingSeppuku) { UI.openSeppuku(report.pendingSeppuku, onDone); return; }
    onDone && onDone();
  };
};

/* ---------------------------------------------------------------------
 * INTERACTIVE FIELD OF BATTLE — the player rolls a clickable d6 each round.
 * Deterministic sector strength + one bounded die of friction per side.
 * Deploy is already set from the March plan; each round you may commit the
 * Reserve or wheel a broken flank, then roll to resolve. AI auto-rolls.
 * ------------------------------------------------------------------- */
UI.PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
UI.dieCells = function (n) {
  if (!(n >= 1 && n <= 6)) return `<span class="d6-mark">✕</span>`;
  let s = ""; for (let i = 0; i < 9; i++) s += `<span class="pip${UI.PIPS[n].includes(i) ? " on" : ""}"></span>`; return s;
};

UI.runBattle = function (report, onDone) {
  const S = SR.state;
  const ctx = report.ctx;
  const B = SR.beginBattle(ctx);
  const humanSide = B.humanSide, foeSide = humanSide === "att" ? "def" : "att";
  const attName = report.attCid ? S.clans[report.attCid].name : "Attackers";
  const defName = report.defCid ? S.clans[report.defCid].name : "Independents";
  const sideName = (sk) => sk === "att" ? attName : defName;
  const youName = sideName(humanSide), foeName = sideName(foeSide);
  if (UI.audio) UI.audio.play("battle");

  let phase = "choose";      // choose → shown → over
  let order = null;          // pending order for this round
  let stance = { L: "line", C: "line", R: "line" };   // 1066 per-flank stance this round
  let rolling = false, finalized = false, closedHandled = false;
  let lastRR = null;         // last round result
  const narr = [];           // running narration (player perspective)
  const STANCE_LBL = { line: "Line", shieldwall: "Shield wall", charge: "Charge", feign: "Feign" };
  const STANCE_ICON = { line: "▦", shieldwall: "🛡", charge: "⚔", feign: "↩" };
  const STANCE_CYCLE = { line: "shieldwall", shieldwall: "charge", charge: "feign", feign: "line" };

  /* Sector strengths for the upcoming round (preview) or current state. */
  function board(preview) {
    if (preview) B.round++;
    const rows = SR.SECTORS.map(sec => ({
      sec, name: SR.sectorName[sec],
      a: SR.sectorSS(B, "att", sec), d: SR.sectorSS(B, "def", sec),
      aU: SR.secUnits(B, "att", sec), dU: SR.secUnits(B, "def", sec),
    }));
    if (preview) B.round--;
    return rows;
  }
  function unitGlyphs(units) {
    if (!units.length) return `<span class="bt-empty">—</span>`;
    // a block of individual soldiers — the block visibly thins as they fall
    return units.map(u => `<span class="bt-sol" style="background:${UI.unitColor(u.type)}" title="${esc(DATA.units[u.type].name)}">${DATA.units[u.type].glyph}</span>`).join("");
  }
  function partsText(parts) {
    const ks = Object.keys(parts); if (!ks.length) return "";
    return ks.map(k => `${k} ${parts[k] >= 0 ? "+" : ""}${parts[k]}`).join(" · ");
  }
  function moraleBar(sk) {
    const m = Math.max(0, Math.round(B.morale[sk])), m0 = B.morale0[sk] || 1;
    const pct = Math.max(3, Math.min(100, Math.round(100 * m / m0)));
    return `<div class="bt-mor ${sk === humanSide ? "you" : "foe"}">
      <div class="bt-mor-l">${sk === humanSide ? "Your morale" : esc(foeName) + " morale"} <b>${m}</b></div>
      <div class="bt-mor-bar"><span style="width:${pct}%"></span></div></div>`;
  }
  function nerveBar(sk, sec, cls) {
    const n = Math.max(0, B.nerve[sk][sec]), n0 = B.nerve0[sk][sec] || 6;
    const pct = Math.max(0, Math.min(100, Math.round(100 * n / n0)));
    const low = n <= 2 ? " low" : "";
    return `<div class="bt-nerve ${cls}${low}" title="Nerve ${n}/${n0} — break it and this flank routs"><span style="width:${pct}%"></span></div>`;
  }
  function sectorHTML(preview) {
    const rows = board(preview);
    const mainYou = B.side[humanSide].mainSec, mainFoe = B.side[foeSide].mainSec;
    return `<div class="bt-board${preview ? "" : " clashing"}">` + rows.map(r => {
      const attYou = humanSide === "att";
      const topSS = attYou ? r.a : r.d, botSS = attYou ? r.d : r.a;
      const topU = attYou ? r.aU : r.dU, botU = attYou ? r.dU : r.aU;
      const isMainYou = r.sec === mainYou, isMainFoe = r.sec === mainFoe;
      const youHas = (humanSide === "att" ? r.aU : r.dU).length;
      const stanceChip = preview && youHas
        ? `<div class="bt-stance-wrap"><span class="bt-stance s-${stance[r.sec]}" data-stance="${r.sec}" title="Tap to change: Line → Shield wall → Charge → Feign retreat">${STANCE_ICON[stance[r.sec]]} ${STANCE_LBL[stance[r.sec]]}</span></div>`
        : "";
      return `<div class="bt-sec">
        <div class="bt-sec-h">${esc(r.name)}${isMainYou ? ' <span class="bt-tag you">your main</span>' : ""}${isMainFoe ? ' <span class="bt-tag foe">enemy main</span>' : ""}</div>
        <div class="bt-side-row you">
          <div class="bt-units">${unitGlyphs(topU)}</div>
          <div class="bt-ss" title="${esc(partsText(topSS.parts))}">${topSS.ss}</div>
        </div>
        ${nerveBar(humanSide, r.sec, "you")}
        ${stanceChip}
        ${preview ? `<div class="bt-parts">${esc(partsText(topSS.parts))}</div>` : ""}
        <div class="bt-clash">⚔</div>
        <div class="bt-side-row foe">
          <div class="bt-units">${unitGlyphs(botU)}</div>
          <div class="bt-ss" title="${esc(partsText(botSS.parts))}">${botSS.ss}</div>
        </div>
        ${nerveBar(foeSide, r.sec, "foe")}
      </div>`;
    }).join("") + `</div>`;
  }
  function ordersHTML() {
    const canRes = B.deploy[humanSide].RES.length > 0;
    const canWheel = !!B.broke[humanSide];
    const tip = `<div class="bt-orders"><span class="bto-label">Tap a flank's stance — 🛡 Shield wall (hold) · ⚔ Charge (smash, tires you) · ↩ Feign retreat (lure, then counter next round) — then roll.</span></div>`;
    if (!canRes && !canWheel) return tip;
    let h = tip + `<div class="bt-orders"><span class="bto-label">Orders:</span>
      <span class="bto ${!order ? "sel" : ""}" data-ord="hold">Hold</span>`;
    if (canRes) h += ["L", "C", "R"].map(s => `<span class="bto ${order && order.type === "reserve" && order.sector === s ? "sel" : ""}" data-ord="res:${s}">Reserve → ${esc(SR.sectorName[s])} (${B.deploy[humanSide].RES.length})</span>`).join("");
    if (canWheel) h += `<span class="bto ${order && order.type === "wheel" ? "sel" : ""}" data-ord="wheel">Wheel broken flank → Centre</span>`;
    return h + `</div>`;
  }
  function narrHTML() {
    if (!narr.length) return "";
    return `<div class="bt-log">` + narr.map(n => `<div class="bt-line ${n.cls}">${esc(n.text)}</div>`).join("") + `</div>`;
  }

  function finalize() {
    if (finalized) return; finalized = true;
    if (!B.done) { let g = 0; while (!B.done && g++ < 6) SR.stepBattle(B); }
    const res = SR.battleResult(B);
    report.interactive = false;
    SR.applyFieldResult(S, report, res, report.apply);
  }
  function closeDone() {
    closedHandled = true; UI._onClose = null; UI.closeModal();
    UI.render();
    if (report.pendingSeppuku) { UI.openSeppuku(report.pendingSeppuku, onDone); return; }
    onDone && onDone();
  }
  const onClose = () => {   // X-button / stray close → finish the fight fairly
    if (closedHandled) return; closedHandled = true;
    finalize();
    UI.render();
    if (report.pendingSeppuku) { UI.openSeppuku(report.pendingSeppuku, onDone); return; }
    onDone && onDone();
  };

  function render() {
    const terr = report.terrain;
    let body = `<div class="bt-wrap">
      <div class="bt-morales">${moraleBar(humanSide)}${moraleBar(foeSide)}</div>
      ${sectorHTML(phase === "choose")}`;

    if (phase === "choose") {
      body += ordersHTML() + `
        <div class="bt-dice">
          <div class="bt-die-wrap">
            <div class="d6 you clickable" id="bt-roll" role="button" tabindex="0" title="Click to roll">${UI.dieCells(1)}</div>
            <div class="bt-die-lbl">You — <b>click to roll</b></div>
          </div>
          <div class="bt-swords">⚔</div>
          <div class="bt-die-wrap">
            <div class="d6 foe" id="bt-foe"><span class="d6-mark">?</span></div>
            <div class="bt-die-lbl">${esc(foeName)}</div>
          </div>
        </div>`;
    } else {
      const youDie = humanSide === "att" ? lastRR.dieA : lastRR.dieD;
      const foeDie = humanSide === "att" ? lastRR.dieD : lastRR.dieA;
      body += `<div class="bt-dice">
          <div class="bt-die-wrap">
            <div class="d6 you landed">${UI.dieCells(youDie)}</div>
            <div class="bt-die-lbl">You rolled <b>${youDie >= 1 ? youDie : "—"}</b></div>
          </div>
          <div class="bt-swords">⚔</div>
          <div class="bt-die-wrap">
            <div class="d6 foe landed">${UI.dieCells(foeDie)}</div>
            <div class="bt-die-lbl">${esc(foeName)} rolled <b>${foeDie >= 1 ? foeDie : "—"}</b></div>
          </div>
        </div>`;
    }
    body += narrHTML();

    if (phase === "over") {
      const humanWon = B.winner === humanSide;
      body += `<div class="bt-outcome ${humanWon ? "win" : "lose"}">${humanWon ? "Victory!" : "The field is lost."}${B.routed === foeSide ? " The enemy routs!" : B.routed === humanSide ? " Your army breaks!" : ""}</div>
        ${report.postText ? `<p class="small" style="margin-top:6px">${esc(report.postText)}</p>` : ""}
        ${report.generalFate && report.generalFate !== "escape" ? `<p class="small"><b>A leader ${report.generalFate === "seppuku" ? "commits seppuku" : report.generalFate === "captured" ? "is captured" : "falls in the rout"}.</b></p>` : ""}
        ${report.honourNote ? `<p class="warn small">${esc(report.honourNote)}</p>` : ""}`;
    }
    body += `</div>`;

    let foot;
    if (phase === "choose") foot = `<button class="ghost" id="bt-auto">Resolve automatically</button>`;
    else if (phase === "shown") foot = B.done ? `<button class="primary" id="bt-next">See the outcome →</button>` : `<button class="primary" id="bt-next">Press the attack →</button>`;
    else foot = `<button class="primary" id="bt-fin">Continue</button>`;

    UI.modal({ title: `The Field of Battle — ${esc(terr)}${report.surprise ? " · surprise!" : ""}`, body, foot, onClose });

    if (phase === "choose") {
      const mb = $("#modal-body");
      mb.querySelectorAll("[data-ord]").forEach(el => el.onclick = () => {
        const v = el.dataset.ord;
        if (v === "hold") order = null;
        else if (v.startsWith("res:")) order = { type: "reserve", sector: v.slice(4) };
        else if (v === "wheel") order = { type: "wheel", sector: B.broke[humanSide] };
        render();
      });
      mb.querySelectorAll("[data-stance]").forEach(el => el.onclick = () => {
        const sec = el.dataset.stance; stance[sec] = STANCE_CYCLE[stance[sec]] || "line"; render();
      });
      const die = $("#bt-roll");
      const roll = () => doRoll();
      die.onclick = roll;
      die.onkeydown = (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); roll(); } };
      $("#bt-auto").onclick = () => { finalize(); phase = "over"; render(); };
    } else if (phase === "shown") {
      $("#bt-next").onclick = () => {
        if (B.done) { finalize(); phase = "over"; }
        else { order = null; phase = "choose"; }
        render();
      };
    } else {
      $("#bt-fin").onclick = closeDone;
    }
  }

  function doRoll() {
    if (rolling) return; rolling = true;
    const die = $("#bt-roll");
    if (die) { die.classList.add("rolling"); die.classList.remove("clickable"); }
    if (UI.audio) UI.audio.play("battle");
    let ticks = 0;
    const iv = setInterval(() => { if (die) die.innerHTML = UI.dieCells(SR.rint(1, 6)); if (++ticks >= 8) clearInterval(iv); }, 70);
    setTimeout(() => {
      const v = SR.rint(1, 6);
      const myOrder = Object.assign({ type: "hold" }, order || {}, { stance });
      SR.applyOrders(B, { [humanSide]: myOrder });
      const rr = SR.resolveRound(B, { [humanSide]: v });
      lastRR = rr;
      const youDie = humanSide === "att" ? rr.dieA : rr.dieD;
      narr.push({ cls: "hd", text: `Round ${rr.round}${rr.ambush ? (humanSide === "att" ? " — you strike from ambush!" : " — ambushed!") : ""} — you rolled ${youDie >= 1 ? youDie : "—"}.` });
      rr.results.forEach(x => {
        const youWon = x.winner === humanSide;
        const yourSS = humanSide === "att" ? x.attSS : x.defSS, foeSS = humanSide === "att" ? x.defSS : x.attSS;
        const yourDie = humanSide === "att" ? x.dieA : x.dieD, foeDie = humanSide === "att" ? x.dieD : x.dieA;
        const yourTot = humanSide === "att" ? x.totA : x.totD, foeTot = humanSide === "att" ? x.totD : x.totA;
        // strength + 🎲 = total, spelled out so the dice's role is visible
        let t = `${x.name}: you ${yourSS}+🎲${yourDie}=${yourTot} vs ${foeSS}+🎲${foeDie}=${foeTot} — `;
        if (x.margin === 0) t += "a dead-even clash";
        else t += youWon ? `you win by ${x.margin}` : `they win by ${x.margin}`;
        if (x.loseCas) { const loserIsYou = (x.winner === "att" ? "def" : "att") === humanSide; t += `, ${loserIsYou ? "you lose" : "they lose"} ${x.loseCas}`; }
        if (x.flankRout) t += youWon ? " — their nerve breaks, the flank routs!" : " — your nerve breaks, the flank routs!";
        else if (x.broke) t += youWon ? " — you shatter their line!" : " — your line breaks!";
        narr.push({ cls: youWon ? "good" : "bad", text: t + (t.endsWith("!") ? "" : ".") });
        // feign retreat springs / dice callout
        if (x.feinted) { const meFeinted = (x.winner === "att" ? "def" : "att") === humanSide;
          narr.push({ cls: "dice", text: meFeinted ? "  ↩ you feign retreat — fall back and set the trap for next round." : "  ↩ they feign retreat, giving ground on purpose." }); }
        if (x.decidedByDice && !x.feinted) narr.push({ cls: youWon ? "dice good" : "dice bad",
          text: youWon ? "  🎲 the dice won you this flank — the stronger line would have lost!" : "  🎲 the dice cost you this flank." });
      });
      rolling = false; order = null; stance = { L: "line", C: "line", R: "line" }; phase = "shown";
      render();
    }, 640);
  }

  render();
};

UI.openSeppuku = function (pending, onDone) {
  const S = SR.state;
  UI.modal({
    title: "Your Daimyō is Cornered",
    body: `<p>${esc(S.clans[pending.loserCid].daimyo)} is trapped in the rout. Do they die by their own hand — denying the enemy the capture and preserving Honour — or risk being taken alive?</p>`,
    foot: `<button class="ghost" id="sep-live">Risk capture</button><button class="primary" id="sep-die">Commit seppuku (+1 Honour)</button>`,
  });
  $("#sep-die").onclick = () => { SR.resolveSeppuku(S, pending.loserCid, pending.winnerCid, true); UI.closeModal(); UI.render(); onDone && onDone(); };
  $("#sep-live").onclick = () => { SR.resolveSeppuku(S, pending.loserCid, pending.winnerCid, false); UI.closeModal(); UI.render(); onDone && onDone(); };
};

/* ---------------------------------------------------------------------
 * DEFENDER RESPONSE (human is attacked)
 * ------------------------------------------------------------------- */
UI.openDefense = function (ev, onDone) {
  const S = SR.state;
  const attName = S.clans[ev.attCid].name;
  const toId = ev.toId, ps = S.provinces[toId];
  const canFortify = ps.castle >= 1;
  const escapes = SR.stat(toId).adj.filter(a => S.provinces[a].owner === S.humanClan || (!S.provinces[a].owner && !S.provinces[a].units.length));
  const worksBudget = 2 + (ps.buildings && ps.buildings.fort ? DATA.buildings.fort.extraWorks : 0);
  const st = UI.defState = { response: "stand", dep: UI.newDeploy(ps.units, worksBudget) };
  UI.dpAuto(st.dep, SR.stat(toId).terrain);
  const render = () => {
    const standReady = st.response !== "stand" || UI.dpReady(st.dep);
    UI.modal({
      title: "Under Attack!",
      body: `<p class="small">${esc(attName)} march on <b>${esc(SR.stat(toId).name)}</b> (${SR.stat(toId).terrain})${ev.opts && ev.opts.surprise ? ' <span class="warn">— a surprise attack!</span>' : ""}. Garrison: ${ps.units.length} units, castle lvl ${ps.castle}${ps.buildings && ps.buildings.fort ? ", Fort (+3 def, +1 work)" : ""}.</p>
        <div class="chips" style="margin-bottom:8px">
          <span class="chip ${st.response === "stand" ? "sel" : ""}" data-r="stand">Stand &amp; fight</span>
          ${canFortify ? `<span class="chip ${st.response === "fortify" ? "sel" : ""}" data-r="fortify">Fortify (→ siege)</span>` : ""}
          ${escapes.length ? `<span class="chip ${st.response.startsWith("retreat") ? "sel" : ""}" data-r="retreat:${escapes[0]}">Retreat to ${esc(SR.stat(escapes[0]).name)}</span>` : ""}
        </div>
        ${st.response === "stand" ? UI.dpHTML(st.dep) : "<p class='small'>You withdraw — no field deployment needed.</p>"}`,
      foot: `${st.response === "stand" ? `<button class="ghost" id="dp-auto">Auto-arrange</button>` : ""}<button class="primary" id="def-go" ${standReady ? "" : "disabled"}>Confirm</button>`,
    });
    const mb = $("#modal-body");
    mb.querySelectorAll("[data-r]").forEach(el => el.onclick = () => { st.response = el.dataset.r; render(); });
    if (st.response === "stand") { UI.wireDeploy(mb, st.dep, render);
      const au = $("#dp-auto"); if (au) au.onclick = () => { UI.dpAuto(st.dep, SR.stat(toId).terrain); render(); }; }
    $("#def-go").onclick = () => {
      const opts = Object.assign({}, ev.opts, { response: st.response, defDeploy: st.response === "stand" ? UI.dpToObj(st.dep) : undefined, interactive: true });
      const report = SR.executeAttack(S, ev.fromId, toId, ev.uids, ev.attCid, opts);
      UI.render();
      UI.showBattleReport(report, onDone);
    };
  };
  render();
};

/* ---------------------------------------------------------------------
 * DIPLOMACY / ESPIONAGE / ASSAULT small flows
 * ------------------------------------------------------------------- */
UI.doPact = function (to, type) {
  const S = SR.state;
  const chk = SR.canOfferPact(S, S.humanClan, to, type);
  if (!chk.ok) { UI.toast(chk.reason); return; }
  const r = SR.proposePact(S, S.humanClan, to, type);
  UI.toast(r.accepted ? `${S.clans[to].name} agrees.` : (r.reason || "Declined."));
  UI.render();
};
UI.openDeploy = function (uid) {
  const S = SR.state;
  const targets = Object.keys(S.provinces).filter(id => S.provinces[id].owner && S.provinces[id].owner !== S.humanClan && !S.clans[S.provinces[id].owner].isNeutral || (S.provinces[id].owner === "invaders"));
  const opts = targets.map(id => `<button class="list-btn" data-id="${id}"><div class="lb-t">${esc(SR.stat(id).name)}</div><div class="lb-d">${S.clans[S.provinces[id].owner].name}${S.clans[S.provinces[id].owner].daimyoLoc === id ? " · daimyō here" : ""}</div></button>`).join("");
  UI.modal({ title: "Deploy Agent", body: opts || "<p class='small'>No valid targets.</p>", foot: `<button class="ghost" onclick="UI.closeModal()">Cancel</button>` });
  $("#modal-body").querySelectorAll("[data-id]").forEach(b => b.onclick = () => { SR.deployAgent(S, S.humanClan, +uid, b.dataset.id); UI.closeModal(); UI.render(); });
};
UI.openOp = function (uid, target) {
  const S = SR.state;
  const rows = Object.keys(SR.ops).map(k => {
    const op = SR.ops[k];
    return `<button class="list-btn" data-k="${k}"><div class="lb-t">${op.name} <span style="float:right">${op.koban}◍+</span></div><div class="lb-d">${esc(op.desc)}${op.risk ? " <span class='warn'>(high blowback)</span>" : ""}</div></button>`;
  }).join("");
  UI.modal({ title: "Run Operation on " + SR.stat(target).name, body: `<div class="small" style="margin-bottom:8px">Commit extra koban to raise the odds. Treasury ${S.clans[S.humanClan].koban}◍.</div>${rows}`, foot: `<button class="ghost" onclick="UI.closeModal()">Cancel</button>` });
  $("#modal-body").querySelectorAll("[data-k]").forEach(b => b.onclick = () => {
    const commit = Math.min(2, Math.max(0, S.clans[S.humanClan].koban - SR.ops[b.dataset.k].koban));
    const r = SR.runOp(S, S.humanClan, b.dataset.k, target, commit);
    UI.closeModal();
    if (r.ok) UI.modal({ title: r.success ? "Operation Succeeds" : "Operation Fails", body: r.lines.map(l => `<p>${esc(l)}</p>`).join(""), foot: `<button class="primary" onclick="UI.closeModal();UI.render()">Continue</button>` });
    else UI.toast(r.reason);
    UI.render();
  });
};
UI.doAssault = function (id) {
  const S = SR.state;
  UI.confirm(`Storm the walls of ${SR.stat(id).name}? Assaulting a castle is bloody — the defender fights with its full castle bonus.`, () => {
    const report = SR.siegeAssault(S, id, true);
    UI.render();
    UI.showBattleReport(report, () => UI.render());
  });
};

/* Interactive siege command — the besieger chooses how to break the castle. */
UI.openSiege = function (id) {
  const S = SR.state, ps = S.provinces[id];
  if (!ps.siege || ps.siege.by !== S.humanClan) return;
  const done = () => { UI.render(); if (SR.state.gameOver) GAME.showGameOver(); };
  const render = () => {
    const st = SR.siegeStatus(S, id);
    if (!st) { UI.closeModal(); UI.render(); return; }
    const acted = st.actedThisSeason;
    const koban = S.clans[S.humanClan].koban;
    const bar = (label, val, cls) => `<div class="sg-gauge"><span>${label}</span><div class="sg-meter"><span class="${cls}" style="width:${Math.round(val / 6 * 100)}%"></span></div><b>${val}/6</b></div>`;
    const body = `
      <div class="sg-status">
        <div class="sg-row"><span>Castle walls</span><b>${st.castle > 0 ? "level " + st.castle : "breached!"}</b></div>
        <div class="sg-row"><span>Garrison inside</span><b>${st.garrison} unit${st.garrison === 1 ? "" : "s"}</b></div>
        <div class="sg-row"><span>Your siege army</span><b>${st.besiegers} units${st.trains ? ` · ${st.trains} siege train${st.trains > 1 ? "s" : ""}` : " · no siege trains"}</b></div>
        ${bar("Food", st.supply, "food")}
        ${bar("Will", st.spirit, "will")}
        <div class="small" style="margin-top:3px;color:var(--ink2)">Empty their <b>Food</b> or their <b>Will</b> and the town falls.</div>
      </div>
      <p class="small">${acted ? "Your siege lines have given their order this season — you may still storm or lift." : "Give one order this season; storm or lift at any time."}</p>
      <div class="sg-acts">
        <button class="act sg-btn" id="sg-starve" ${acted ? "disabled" : ""}><span class="ai">🚫</span>Blockade &amp; starve<small>Choke off supply — Food drops fast. Safe and steady.</small></button>
        <button class="act sg-btn" id="sg-bombard" ${acted ? "disabled" : ""}><span class="ai">💥</span>Bombard the walls<small>${st.trains ? "Siege trains batter the castle down." : "Weak without siege trains — bring siege weapons."}</small></button>
        <button class="act sg-btn" id="sg-mine" ${acted ? "disabled" : ""}><span class="ai">⛏</span>Sap &amp; mine the walls<small>Tunnel under the walls — no guns needed, but chancy. Can collapse a whole section.</small></button>
        <button class="act sg-btn" id="sg-rumours" ${acted ? "disabled" : ""}><span class="ai">🗣</span>Spread rumours<small>Agents sap the garrison's Will (stronger with high Intrigue).</small></button>
        <button class="act sg-btn" id="sg-poison" ${acted ? "disabled" : ""}><span class="ai">☠</span>Poison the wells<small>Foul their water — Food & Will fall hard, but −2 Honour (dishonourable).</small></button>
        <button class="act sg-btn" id="sg-incite" ${acted || koban < 3 ? "disabled" : ""}><span class="ai">🤝</span>Bribe &amp; incite treachery<small>3 koban${koban < 3 ? " — not enough" : ""} — buy men inside; they may open the gates or desert.</small></button>
        <button class="act sg-btn" id="sg-terms"><span class="ai">🏳</span>Offer terms<small>Demand surrender — likelier as Food & Will run low.</small></button>
        <button class="act sg-btn" id="sg-storm"><span class="ai">🏯</span>Storm the walls<small>Assault now — bloody; a starved, dispirited garrison fights far worse.</small></button>
        <button class="act sg-btn" id="sg-lift"><span class="ai">↩</span>Lift the siege<small>Withdraw your army back home.</small></button>
      </div>`;
    UI.modal({ title: "Siege of " + esc(SR.stat(id).name), body, foot: `<button class="primary" onclick="UI.closeModal()">Close</button>` });
    const act = (a) => {
      const r = SR.siegeAction(S, id, a);
      if (!r.ok) { UI.toast(r.reason); return; }
      if (r.lifted) { UI.closeModal(); UI.render(); UI.toast("Siege lifted."); return; }
      if (r.report) { UI.closeModal(); UI.render(); UI.showBattleReport(r.report, done); return; }
      if (r.surrender) { UI.closeModal(); UI.render();
        UI.modal({ title: "The Town Falls", body: r.lines.map(l => `<p>${esc(l)}</p>`).join(""), foot: `<button class="primary" onclick="UI.closeModal()">Continue</button>` }); return; }
      UI.render(); if (r.lines && r.lines.length) UI.toast(r.lines[0]); render();
    };
    ["starve", "bombard", "mine", "rumours", "poison", "incite", "terms", "storm", "lift"].forEach(a => {
      const el = document.getElementById("sg-" + a); if (el) el.onclick = () => act(a);
    });
  };
  render();
};
UI.doSortie = function (id) {
  const S = SR.state;
  UI.confirm(`Sortie from ${SR.stat(id).name}? Your garrison sallies out to break the besieging army — it catches them off guard, but if it fails you're thrown back with losses.`, () => {
    const r = SR.siegeSortie(S, id);
    if (!r.ok) { UI.toast(r.reason); return; }
    UI.render();
    UI.showBattleReport(r.report, () => { UI.render(); if (SR.state.gameOver) GAME.showGameOver(); });
  });
};
/* The defender's siege panel — hold, ration, rally, sortie, or surrender. */
UI.openDefenseSiege = function (id) {
  const S = SR.state, ps = S.provinces[id];
  if (!ps.siege || ps.owner !== S.humanClan) return;
  const done = () => { UI.render(); if (SR.state.gameOver) GAME.showGameOver(); };
  const render = () => {
    const st = SR.siegeStatus(S, id); const sg = ps.siege;
    if (!st || !sg) { UI.closeModal(); UI.render(); return; }
    const acted = sg.defSeason === SR.siegeSeasonKey(S);
    const koban = S.clans[S.humanClan].koban;
    const bar = (label, val, cls) => `<div class="sg-gauge"><span>${label}</span><div class="sg-meter"><span class="${cls}" style="width:${Math.round(val / 6 * 100)}%"></span></div><b>${val}/6</b></div>`;
    const body = `
      <div class="sg-status">
        <div class="sg-row"><span>Your walls</span><b>${st.castle > 0 ? "level " + st.castle : "breached!"}</b></div>
        <div class="sg-row"><span>Your garrison</span><b>${st.garrison} unit${st.garrison === 1 ? "" : "s"}</b></div>
        <div class="sg-row"><span>Besieging army</span><b>${st.besiegers} units</b></div>
        ${bar("Food", st.supply, "food")}
        ${bar("Will", st.spirit, "will")}
        <div class="small" style="margin-top:3px;color:var(--ink2)">Outlast them — but if your <b>Food</b> or <b>Will</b> runs out, the town falls.</div>
      </div>
      <p class="small">${acted ? "Your garrison has given its order this season — you may still sortie or surrender." : "Give one order this season; sortie or surrender at any time."}</p>
      <div class="sg-acts">
        <button class="act sg-btn" id="ds-hold" ${acted ? "disabled" : ""}><span class="ai">🛡</span>Hold the walls<small>Endure — samurai and your lord steady the men (Will holds).</small></button>
        <button class="act sg-btn" id="ds-ration" ${acted ? "disabled" : ""}><span class="ai">🍚</span>Ration the stores<small>Stretch the food (+Food), but short rations sap morale (−Will).</small></button>
        <button class="act sg-btn" id="ds-rally" ${acted || koban < 2 ? "disabled" : ""}><span class="ai">🎌</span>Rally the garrison<small>2 koban${koban < 2 ? " — not enough" : ""} — pay and inspire the men (+2 Will).</small></button>
        <button class="act sg-btn" id="ds-sortie"><span class="ai">🐎</span>Sortie — break out<small>Sally out to shatter the besiegers by surprise. Risky.</small></button>
        <button class="act sg-btn" id="ds-surrender"><span class="ai">🏳</span>Surrender the town<small>Yield the province to end the siege (−1 Honour).</small></button>
      </div>`;
    UI.modal({ title: "Under Siege — " + esc(SR.stat(id).name), body, foot: `<button class="primary" onclick="UI.closeModal()">Close</button>` });
    const act = (a) => {
      const r = SR.defenseSiegeAction(S, id, a);
      if (!r.ok) { UI.toast(r.reason); return; }
      if (r.report) { UI.closeModal(); UI.render(); UI.showBattleReport(r.report, done); return; }
      if (r.surrendered) { UI.closeModal(); UI.render(); UI.modal({ title: "The Town Yields", body: r.lines.map(l => `<p>${esc(l)}</p>`).join(""), foot: `<button class="primary" onclick="UI.closeModal()">Continue</button>` }); return; }
      UI.render(); if (r.lines && r.lines.length) UI.toast(r.lines[0]); render();
    };
    ["hold", "ration", "rally", "sortie", "surrender"].forEach(a => { const el = document.getElementById("ds-" + a); if (el) el.onclick = () => act(a); });
  };
  render();
};

/* ---------------------------------------------------------------------
 * GENERIC MODAL / CONFIRM / TOAST
 * ------------------------------------------------------------------- */
UI.modal = function (o) {
  $("#modal-title").textContent = o.title || "";
  $("#modal-body").innerHTML = o.body || "";
  $("#modal-foot").innerHTML = o.foot || "";
  $("#modal-layer").classList.remove("hidden");
  UI._onClose = o.onClose || null;
};
UI.closeModal = function () { $("#modal-layer").classList.add("hidden"); const f = UI._onClose; UI._onClose = null; if (f) f(); };
UI.confirm = function (msg, onYes) {
  UI.modal({ title: "Confirm", body: `<p>${esc(msg)}</p>`, foot: `<button class="ghost" id="c-no">No</button><button class="primary" id="c-yes">Yes</button>` });
  $("#c-yes").onclick = () => { UI.closeModal(); onYes(); };
  $("#c-no").onclick = () => UI.closeModal();
};
UI._toastT = null;
UI.toast = function (msg) {
  const t = $("#toast"); t.textContent = msg; t.classList.add("show");
  clearTimeout(UI._toastT); UI._toastT = setTimeout(() => t.classList.remove("show"), 2200);
};

/* ---------------------------------------------------------------------
 * MASTER RENDER
 * ------------------------------------------------------------------- */
UI.render = function () {
  if (!SR.state) return;
  UI.renderTop();
  UI.renderMap();
  UI.renderTab();
};

UI.initGame = function () {
  $$(".tab").forEach(t => t.onclick = () => { UI.tab = t.dataset.tab; $$(".tab").forEach(x => x.classList.remove("active")); t.classList.add("active"); UI.renderTab(); });
  $("#end-season-btn").onclick = () => GAME.endSeason();
  $("#objectives-btn").onclick = () => UI.modal({ title: "Objectives", body: `<div class="panel">${UI.objectivesHTML(SR.state)}</div>`, foot: `<button class="primary" onclick="UI.closeModal()">Close</button>` });
  const cbtn = $("#copyright-btn"); if (cbtn) cbtn.onclick = () => UI.showCopyright();
  const hb = $("#help2-btn"); if (hb) hb.onclick = () => UI.showHelp();
  const mb = $("#mute-btn");
  if (mb && UI.audio) {
    UI.audio.loadMute(); mb.textContent = UI.audio.muted ? "🔇" : "🔊";
    mb.onclick = () => { const m = UI.audio.toggle(); mb.textContent = m ? "🔇" : "🔊"; };
  }
  $("#modal-x").onclick = () => UI.closeModal();
};

UI.COPYRIGHT = "COPYRIGHT: © Agastya Fateh Narayanan 22 July 2026. All content available on this website is meticulously curated and is subject to stringent data protection laws and Copyright regulations. Unauthorized use, reproduction, or distribution of any content from this site without proper permission from Agastya Fateh Narayanan and any owners of any videos or pictures is strictly prohibited.";
UI.showCopyright = function () {
  UI.modal({
    title: "Copyright & Terms",
    body: `<div class="small" style="font-size:13px;line-height:1.7">${esc(UI.COPYRIGHT)}</div>`,
    foot: `<button class="primary" onclick="UI.closeModal()">Understood</button>`,
  });
};

/* Transient season banner (a little polish at each season change). */
UI.seasonBanner = function (season, year) {
  const jp = { Spring: "春", Summer: "夏", Autumn: "秋", Winter: "冬" }[season] || "";
  let el = document.getElementById("season-banner");
  if (!el) { el = document.createElement("div"); el.id = "season-banner"; document.body.appendChild(el); }
  el.innerHTML = `<div class="sb-jp">${jp}</div><div class="sb-en">${esc(season)} · Year ${year}</div>`;
  el.classList.add("show");
  clearTimeout(UI._bannerT);
  UI._bannerT = setTimeout(() => el.classList.remove("show"), 1500);
};

if (typeof module !== "undefined") module.exports = UI;
