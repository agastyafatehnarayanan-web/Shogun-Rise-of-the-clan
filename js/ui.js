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
  $("#help-btn").onclick = () => UI.showHelp();
};

UI.showHelp = function () {
  UI.modal({
    title: "How to Play",
    body: `<div class="small" style="font-size:13px;line-height:1.6">
      <p><b>Goal.</b> Everything converts to <b>Prestige</b> — the most wins at the end of the final year. Or trigger a <b>sudden win</b>: hold Kyoto + 55% of Japan (conquest), or amass 60 koban with 3+ ports/markets (wealth).</p>
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
UI.renderMap = function () {
  const S = SR.state, svg = $("#map");
  let links = "", nodes = "";
  const drawn = {};
  for (const id in DATA.provinces) {
    const p = DATA.provinces[id];
    for (const nb of p.adj) {
      const key = [id, nb].sort().join("|");
      if (drawn[key]) continue; drawn[key] = 1;
      const q = DATA.provinces[nb];
      const sea = p.terrain === "Coast" && q.terrain === "Coast";
      links += `<line class="prov-link ${sea ? "sea" : ""}" x1="${p.x}" y1="${p.y}" x2="${q.x}" y2="${q.y}"/>`;
    }
  }
  for (const id in DATA.provinces) {
    const p = DATA.provinces[id], ps = S.provinces[id];
    const col = UI.ownerColor(S, ps.owner);
    const reachable = UI.moveMode && SR.stat(UI.moveMode).adj.includes(id) &&
      SR.canReach(S, UI.moveMode, id, S.humanClan).ok;
    const sel = UI.selected === id;
    const daimyoHere = ps.owner && S.clans[ps.owner].daimyoAlive && S.clans[ps.owner].daimyoLoc === id;
    const nUnits = ps.units.length;
    const feat = p.feature ? UI.featGlyph(p.feature) : "";
    const w = 84, hh = 50, x0 = p.x - w / 2, y0 = p.y - hh / 2;
    const revealed = ps._revealed && ps._revealed >= SR.absSeason(S);
    nodes += `<g class="prov ${sel ? "sel" : ""} ${reachable ? "reach" : ""}" data-id="${id}">
      <rect class="pbody" x="${x0}" y="${y0}" width="${w}" height="${hh}" rx="10"
        fill="${col.c}" style="filter:drop-shadow(0 2px 3px rgba(0,0,0,.5))"/>
      ${ps.siege ? `<rect class="siege-ring" x="${x0 - 4}" y="${y0 - 4}" width="${w + 8}" height="${hh + 8}" rx="13"/>` : ""}
      <text class="pname ${p.kyoto ? "pkyoto" : ""}" x="${p.x}" y="${p.y - 9}">${p.kyoto ? "⛩ " : ""}${esc(p.name)}</text>
      <text class="pinfo" x="${p.x}" y="${p.y + 5}">禾${SR.provKoku(S, id)} · ⚔${nUnits}${daimyoHere ? " ★" : ""}</text>
      <text class="pcastle" x="${p.x}" y="${p.y + 18}">${"▲".repeat(ps.castle) || "—"}${feat ? "  " + feat : ""}</text>
    </g>`;
  }
  svg.innerHTML = links + nodes;
  svg.querySelectorAll(".prov").forEach(g => g.onclick = () => UI.onProvinceClick(g.dataset.id));

  // legend
  const S2 = SR.state;
  $("#map-legend").innerHTML = `<b>禾</b> rice · <b>⚔</b> units · <b>▲</b> castle · <b>★</b> daimyō · <b>⛩</b> Kyoto
    <br><span style="color:#e8b53a">▢ gold ring</span> = under siege`;
};
UI.featGlyph = function (f) {
  return ({ capital: "⛩", teppo_farm: "🌾", horse: "🐎", snowbound: "❄", great_castle: "🏯",
    naval_base: "⚓", free_port: "⛵", crossroads: "🛤", silver: "⚙", gold: "⚙",
    foreign_trade: "🌐", ikko: "☸" })[f] || "";
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
  if (mine) acts = UI.provinceActions(S, id, ps);
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
UI.unitVisible = function (S, id) {
  const ps = S.provinces[id];
  if (ps.owner === S.humanClan) return true;
  if (SR.allied(S, S.humanClan, ps.owner)) return true;
  if (ps._revealed && ps._revealed >= SR.absSeason(S)) return true;
  return false;
};
UI.revealNote = (S, id) => UI.unitVisible(S, id) ? "" : "";

UI.provinceActions = function (S, id, ps) {
  const canAct = ps.status === "pacified" || ps.status === "home";
  const besieging = Object.keys(S.provinces).filter(pid => S.provinces[pid].siege && S.provinces[pid].siege.by === S.humanClan &&
    SR.stat(pid).adj.includes(id));
  let mySiege = "";
  if (ps.siege && ps.siege.by === S.humanClan) {
    mySiege = `<div class="act-grid" style="margin-bottom:8px">
      <button class="act" data-a="assault" data-id="${id}"><span class="ai">🏯</span>Storm the walls</button>
      <button class="act" data-a="lift" data-id="${id}"><span class="ai">↩</span>Lift siege</button></div>`;
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
      <div class="small" style="padding:0 4px 6px 32px">${SR.pacifiedProvinces(S, cid).length} prov · Honour ${c.honour} (${SR.honourBand(c.honour).name})${rel !== "you" && rel !== "none" ? " · " + rel : ""}</div>`;
    }).join("") + `</div>`;
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
    h += `<div class="divider"></div><div class="k small">Next: ${nx.name}</div>
      <div class="small" style="margin:6px 0">Cost ${nx.cost}◍ · Honour ≥ ${nx.honour} (${SR.honourBand(nx.honour).name})${nx.provinces ? " · ≥ " + nx.provinces + " provinces" : ""}${nx.kyoto ? " · control Kyoto" : ""} → +${nx.prestige} Prestige</div>
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
    Or a <b>sudden win</b>: Kyoto + 55% of Japan, or 60 koban with 3 markets/ports.</div>`;
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
    const cost = SR.recruitCost(S, cid, t);
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

UI.marchState = null;
UI.openMarch = function (fromId, toId) {
  const S = SR.state, cid = S.humanClan;
  const hostile = SR.isHostile(S, toId, cid);
  const movable = SR.movableUnits(S, fromId);
  UI.marchState = { fromId, toId, sel: movable.map(u => u.uid), posture: "Line", surprise: false, bringDaimyo: false };
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

  const picks = movable.map(u => {
    const d = DATA.units[u.type]; const on = m.sel.includes(u.uid);
    return `<span class="upick ${on ? "sel" : ""}" data-uid="${u.uid}"><span class="unit-glyph" style="background:${UI.unitColor(u.type)}">${d.glyph}</span>${d.name}</span>`;
  }).join("");

  const body = `
    <div class="small" style="margin-bottom:10px">${hostile ? "Attacking" : "Marching into"} <b>${esc(SR.stat(toId).name)}</b> (${SR.stat(toId).terrain}) from ${esc(SR.stat(fromId).name)}.
    ${hostile ? "Defenders: " + defenders + "." : ""}</div>
    <div class="field"><label>Commit which units (${m.sel.length}/${movable.length})</label><div class="unit-pick">${picks || "<span class='small'>none available</span>"}</div></div>
    ${hostile ? `
    <div class="field"><label>Formation (posture)</label><div class="chips">
      ${["Deep", "Line", "Wide"].map(p => `<span class="chip ${m.posture === p ? "sel" : ""}" data-post="${p}">${p}</span>`).join("")}
      </div><div class="small">Deep resists shock (narrow) · Line balanced · Wide brings more to bear on open ground (brittle).</div></div>
    <div class="field"><label>Manner of attack</label><div class="chips">
      <span class="chip ${!m.surprise ? "sel" : ""}" data-sur="0">Declared (Honour safe)</span>
      <span class="chip ${m.surprise ? "sel" : ""}" data-sur="1">Surprise (−2 Honour, ambush)</span></div></div>
    ${daimyoHere ? `<div class="field"><label>Leadership</label><div class="chips">
      <span class="chip ${m.bringDaimyo ? "sel" : ""}" data-daimyo="1">Lead with ${esc(S.clans[cid].daimyo)} (+command, at risk)</span></div></div>` : ""}
    ` : ""}`;
  UI.modal({
    title: hostile ? "March to Battle" : "March",
    body,
    foot: `<button class="ghost" onclick="UI.closeModal()">Cancel</button>
      <button class="primary" id="march-go" ${m.sel.length ? "" : "disabled"}>${hostile ? "Engage!" : "March"}</button>`,
  });
  const mb = $("#modal-body");
  mb.querySelectorAll("[data-uid]").forEach(el => el.onclick = () => {
    const uid = +el.dataset.uid;
    if (m.sel.includes(uid)) m.sel = m.sel.filter(x => x !== uid); else m.sel.push(uid);
    UI.renderMarch();
  });
  mb.querySelectorAll("[data-post]").forEach(el => el.onclick = () => { m.posture = el.dataset.post; UI.renderMarch(); });
  mb.querySelectorAll("[data-sur]").forEach(el => el.onclick = () => { m.surprise = el.dataset.sur === "1"; UI.renderMarch(); });
  mb.querySelectorAll("[data-daimyo]").forEach(el => el.onclick = () => { m.bringDaimyo = !m.bringDaimyo; UI.renderMarch(); });
  $("#march-go").onclick = () => GAME.humanMarch(m);
};

/* ---------------------------------------------------------------------
 * BATTLE REPORT
 * ------------------------------------------------------------------- */
UI.showBattleReport = function (report, onDone) {
  const S = SR.state;
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
  const st = UI.defState = { response: "stand", postureD: "Line" };
  const render = () => {
    UI.modal({
      title: "Under Attack!",
      body: `<p>${esc(attName)} march on <b>${esc(SR.stat(toId).name)}</b>${ev.opts && ev.opts.surprise ? ' <span class="warn">(a surprise attack!)</span>' : ""}. Your garrison: ${ps.units.length} units (power ${Math.round(SR.armyPower(ps.units))}), castle lvl ${ps.castle}.</p>
        <div class="field"><label>Your response</label><div class="chips">
          <span class="chip ${st.response === "stand" ? "sel" : ""}" data-r="stand">Stand & fight</span>
          ${canFortify ? `<span class="chip ${st.response === "fortify" ? "sel" : ""}" data-r="fortify">Fortify (withdraw into castle → siege)</span>` : ""}
          ${escapes.length ? `<span class="chip ${st.response.startsWith("retreat") ? "sel" : ""}" data-r="retreat:${escapes[0]}">Retreat to ${esc(SR.stat(escapes[0]).name)}</span>` : ""}
        </div></div>
        ${st.response === "stand" ? `<div class="field"><label>Formation</label><div class="chips">
          ${["Deep", "Line", "Wide"].map(p => `<span class="chip ${st.postureD === p ? "sel" : ""}" data-post="${p}">${p}</span>`).join("")}
        </div></div>` : ""}`,
      foot: `<button class="primary" id="def-go">Confirm</button>`,
    });
    const mb = $("#modal-body");
    mb.querySelectorAll("[data-r]").forEach(el => el.onclick = () => { st.response = el.dataset.r; render(); });
    mb.querySelectorAll("[data-post]").forEach(el => el.onclick = () => { st.postureD = el.dataset.post; render(); });
    $("#def-go").onclick = () => {
      const opts = Object.assign({}, ev.opts, { response: st.response, postureD: st.postureD });
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
  $("#modal-x").onclick = () => UI.closeModal();
};

if (typeof module !== "undefined") module.exports = UI;
