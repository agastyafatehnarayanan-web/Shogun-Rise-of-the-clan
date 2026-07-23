/* =====================================================================
 * Online multiplayer client. Talks to the authoritative server (see
 * /server) over WebSocket, renders the per-player view it pushes, and
 * routes the player's actions to the server instead of mutating locally.
 * The whole existing UI is reused: a received view becomes SR.state with
 * the local player's clan as S.humanClan.
 * ===================================================================== */

const NET = {
  ws: null, online: false, url: "", clientId: null, token: null,
  you: null, active: null, meta: null, name: "Daimyō", isHost: false,

  available() { return !!(window.SHOGUN_SERVER && String(window.SHOGUN_SERVER).trim()); },

  connect(cb) {
    this.url = String(window.SHOGUN_SERVER || "").trim();
    if (!this.url) { UI.toast("No online server is configured — see the README."); return; }
    try { this.ws = new WebSocket(this.url); } catch (e) { UI.toast("Could not reach the server."); return; }
    this.ws.onopen = () => cb && cb();
    this.ws.onmessage = (e) => { let m; try { m = JSON.parse(e.data); } catch (_) { return; } NET.onMessage(m); };
    this.ws.onclose = () => { if (NET.online) UI.toast("Disconnected from the server."); };
    this.ws.onerror = () => UI.toast("Connection error.");
  },
  send(obj) { try { if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(obj)); } catch (e) {} },

  /* -------- outgoing API -------- */
  host(o)        { this.name = o.name || this.name; this.isHost = true; this.send({ t: "host", ...o }); },
  join(code, name, clan) { this.name = name || this.name; this.send({ t: "join", code, name, clan }); },
  listPublic()   { this.send({ t: "listPublic" }); },
  approve(cid, ok) { this.send({ t: "approve", clientId: cid, ok }); },
  pickClan(clan) { this.send({ t: "pickClan", clan }); },
  ready()        { this.send({ t: "ready" }); },
  startGame()    { this.send({ t: "start" }); },
  endTurn()      { this.send({ t: "endTurn" }); },
  doAction(kind, payload) { this.send({ t: "action", kind, payload }); },

  /* -------- incoming -------- */
  onMessage(m) {
    switch (m.t) {
      case "hello": this.clientId = m.clientId; this.token = m.token; break;
      case "hosted": this.you = null; UI.toast("Room created — code " + m.code); break;
      case "joined": this.you = m.clan; break;
      case "pending": UI.toast("Waiting for the host to admit you…"); break;
      case "denied": UI.toast("The host declined your request."); NET.closeLobby(); break;
      case "publicRooms": NET.renderPublicList(m.rooms); break;
      case "joinRequest": NET.onJoinRequest(m); break;
      case "room":
        this.meta = m.room; this.you = m.you; this.active = m.room.activeClan;
        this.isHost = m.room.hostClientId === this.clientId;
        if (m.room.phase === "lobby") NET.renderRoom();
        break;
      case "view": NET.onView(m.state); break;
      case "report": UI.showBattleReport(m.report, () => { UI.render(); }); break;
      case "actionResult": if (m.ok === false) UI.toast(m.reason || "Action failed."); break;
      case "error": UI.toast(m.msg || "Server error."); break;
      case "chat": UI.toast((m.name || "?") + ": " + m.msg); break;
    }
  },

  onView(state) {
    this.online = true;
    this.you = state.__you; this.active = state.__active;
    SR.state = state;
    if (!UI.selected || !state.provinces[UI.selected]) {
      const mine = Object.keys(state.provinces).find(id => state.provinces[id].owner === this.you);
      UI.selected = mine || Object.keys(state.provinces)[0];
    }
    UI.closeModal();
    UI.showScreen("game-screen");
    $$(".tab").forEach(t => t.classList.toggle("active", t.dataset.tab === UI.tab));
    if (UI.audio) UI.audio.init();
    UI.render();
    const myTurn = this.you === this.active;
    $("#hint").textContent = state.gameOver ? "The game is over."
      : myTurn ? "Your turn — take your actions, then End Turn."
      : `Waiting for ${SR.stat ? "" : ""}${(state.clans[this.active] && state.clans[this.active].name) || "the other players"}…`;
    const btn = $("#end-season-btn");
    if (btn) { btn.textContent = myTurn ? "End Turn ▸" : "Waiting…"; btn.disabled = !myTurn || state.gameOver; }
    if (state.gameOver && !NET._shownOver) { NET._shownOver = true; GAME.showGameOver(); }
  },

  myTurn() { return this.online && this.you && this.you === this.active; },

  /* -------- lobby UI (built on UI.modal) -------- */
  openLobby() {
    if (!this.available()) {
      UI.modal({ title: "Online Play", body: `<div class="small" style="line-height:1.6">
        Online multiplayer needs a game server. It's included in this project under
        <b>/server</b> — deploy it to a free host (see <b>server/README.md</b>), then set
        <b>window.SHOGUN_SERVER</b> in <b>js/netconfig.js</b> to its address and reload.</div>`,
        foot: `<button class="ghost" onclick="UI.closeModal()">Close</button>` });
      return;
    }
    const connectThen = (fn) => { if (this.ws && this.ws.readyState === 1) fn(); else this.connect(fn); };
    UI.modal({
      title: "Play Online",
      body: `<div class="field"><label>Your name</label>
          <input id="net-name" class="net-in" maxlength="18" placeholder="Daimyō" value="${esc(this.name)}"></div>
        <div class="divider"></div>
        <div class="field"><label>Host a new game</label>
          <div class="chips">
            <button class="chip sel" id="vis-private" data-vis="private">Private (you approve players)</button>
            <button class="chip" id="vis-public" data-vis="public">Public (anyone can join)</button>
          </div>
          <div class="chips" style="margin-top:6px">
            <button class="chip sel" data-hmode="A">Warring Clans</button>
            <button class="chip" data-hmode="B">House Divided</button>
          </div>
          <button class="primary" id="net-host" style="margin-top:8px;width:100%">Host game</button>
        </div>
        <div class="divider"></div>
        <div class="field"><label>Join by code</label>
          <div style="display:flex;gap:8px"><input id="net-code" class="net-in" maxlength="6" placeholder="ABC123" style="text-transform:uppercase">
          <button class="primary" id="net-join">Join</button></div></div>
        <div class="divider"></div>
        <div class="field"><label>Public games</label>
          <button class="ghost" id="net-refresh" style="margin-bottom:6px">Refresh list</button>
          <div id="net-public" class="small">—</div></div>`,
      foot: `<button class="ghost" onclick="UI.closeModal()">Close</button>`,
    });
    let vis = "private", hmode = "A";
    const nm = () => ($("#net-name").value || "Daimyō").slice(0, 18);
    $("#vis-private").onclick = () => { vis = "private"; $("#vis-private").classList.add("sel"); $("#vis-public").classList.remove("sel"); };
    $("#vis-public").onclick = () => { vis = "public"; $("#vis-public").classList.add("sel"); $("#vis-private").classList.remove("sel"); };
    document.querySelectorAll("[data-hmode]").forEach(b => b.onclick = () => {
      hmode = b.dataset.hmode; document.querySelectorAll("[data-hmode]").forEach(x => x.classList.remove("sel")); b.classList.add("sel");
    });
    $("#net-host").onclick = () => connectThen(() => this.host({ name: nm(), visibility: vis, mode: hmode, len: 6, clan: "oda" }));
    $("#net-join").onclick = () => { const c = ($("#net-code").value || "").toUpperCase().trim(); if (c) connectThen(() => this.join(c, nm())); };
    $("#net-refresh").onclick = () => connectThen(() => this.listPublic());
    connectThen(() => this.listPublic());
  },

  renderPublicList(list) {
    const el = document.getElementById("net-public"); if (!el) return;
    if (!list || !list.length) { el.innerHTML = "<i>No public games right now — host one!</i>"; return; }
    el.innerHTML = list.map(r => `<button class="list-btn" data-code="${r.code}">
      <div class="lb-t">Room ${r.code} · ${r.mode === "B" ? "House Divided" : "Warring Clans"}</div>
      <div class="lb-d">${r.players} player(s) · host ${esc(r.host)}</div></button>`).join("");
    el.querySelectorAll("[data-code]").forEach(b => b.onclick = () => this.join(b.dataset.code, ($("#net-name") ? $("#net-name").value : this.name) || "Daimyō"));
  },

  onJoinRequest(m) {
    // host is prompted to admit/deny
    UI.toast(`${m.name} wants to join.`);
    this._pendingReq = this._pendingReq || [];
    // rendered inside the room panel; keep latest meta refresh via room msgs
    NET.renderRoom();
    setTimeout(() => {
      const box = document.getElementById("net-requests");
      if (box && this.meta) NET.renderRequests();
    }, 30);
  },

  renderRoom() {
    if (!this.meta) return;
    const r = this.meta;
    const clanBtns = Object.keys(DATA.clans).map(cid => {
      const taken = r.seats.find(s => s.clan === cid && s.taken);
      const mine = this.you === cid;
      return `<button class="chip ${mine ? "sel" : ""}" data-pick="${cid}" ${taken && !mine ? "disabled" : ""}>
        <span style="color:${DATA.clans[cid].color}">${DATA.clans[cid].crest}</span> ${DATA.clans[cid].name}</button>`;
    }).join("");
    const seatList = r.seats.filter(s => s.taken).map(s =>
      `<div class="small">${DATA.clans[s.clan] ? DATA.clans[s.clan].crest : "?"} <b>${esc(s.name)}</b> — ${DATA.clans[s.clan] ? DATA.clans[s.clan].name : s.clan}${s.isAI ? " (AI)" : s.ready ? " · <span class='okc'>ready</span>" : " · not ready"}</div>`).join("");
    const hostControls = this.isHost
      ? `<div id="net-requests"></div>
         <button class="primary" id="net-start" style="width:100%;margin-top:8px">Start game</button>`
      : `<div class="small" style="margin-top:8px">Waiting for the host to start…</div>`;
    UI.modal({
      title: `Room ${r.code} · ${r.visibility === "public" ? "Public" : "Private"}`,
      body: `<div class="small">Share this code with friends: <b style="font-size:16px;letter-spacing:2px">${r.code}</b></div>
        <div class="divider"></div>
        <div class="field"><label>Your clan</label><div class="chips">${clanBtns}</div></div>
        <button class="ghost" id="net-ready">Toggle ready</button>
        <div class="divider"></div>
        <div class="field"><label>Players</label>${seatList || "<i>Just you so far.</i>"}</div>
        ${hostControls}`,
      foot: `<button class="ghost" id="net-leave">Leave</button>`,
    });
    document.querySelectorAll("[data-pick]").forEach(b => b.onclick = () => this.pickClan(b.dataset.pick));
    $("#net-ready").onclick = () => this.ready();
    $("#net-leave").onclick = () => { this.send({ t: "leave" }); UI.closeModal(); };
    const st = $("#net-start"); if (st) st.onclick = () => this.startGame();
    if (this.isHost) this.renderRequests();
  },

  renderRequests() {
    const box = document.getElementById("net-requests"); if (!box || !this.meta) return;
    const reqs = this.meta.pending || [];
    box.innerHTML = reqs.length
      ? `<div class="small" style="margin-top:8px"><b>Join requests</b></div>` + reqs.map(p =>
          `<div class="small" style="display:flex;gap:6px;align-items:center;margin-top:4px">
             ${esc(p.name)} <button class="chip" data-ap="${p.clientId}">Admit</button>
             <button class="chip" data-dn="${p.clientId}">Deny</button></div>`).join("")
      : "";
    box.querySelectorAll("[data-ap]").forEach(b => b.onclick = () => this.approve(b.dataset.ap, true));
    box.querySelectorAll("[data-dn]").forEach(b => b.onclick = () => this.approve(b.dataset.dn, false));
  },

  closeLobby() { UI.closeModal(); },

  /* Install client-side wrappers: in online mode, mutating engine calls are
   * sent to the server instead of applied locally. Harmless offline. */
  installWrappers() {
    const map = {
      doRecruit: (S, cid, id, type) => ["recruit", { provId: id, unit: type }],
      doBuild:   (S, cid, id, key) => ["build", { provId: id, key }],
      doPacify:  (S, id, cid) => ["pacify", { provId: id }],
      doRaze:    (S, id, cid) => ["raze", { provId: id }],
      doCourt:   (S, cid) => ["court", {}],
      doSellRice:(S, cid, amt) => ["sellRice", { amount: amt }],
      recruitAgent: (S, cid) => ["agent", {}],
      hireSpymaster: (S, cid) => ["spymaster", {}],
      deployAgent: (S, cid, u, prov) => ["deploy", { agentUid: u, provId: prov }],
      runOp:     (S, cid, opKey, prov, koban) => ["op", { opKey, provId: prov, koban }],
      proposePact: (S, from, to, type) => ["pact", { to, pactType: type }],
      liftSiege: (S, id) => ["lift", { provId: id }],
    };
    for (const fn in map) {
      const orig = SR[fn];
      if (!orig) continue;
      SR[fn] = function (...args) {
        if (NET.online) { const [k, p] = map[fn](...args); NET.doAction(k, p); return { ok: true, online: true }; }
        return orig.apply(SR, args);
      };
    }
  },
};

if (typeof window !== "undefined" && typeof SR !== "undefined") { /* wrappers installed from main.js after load */ }
if (typeof module !== "undefined") module.exports = NET;
