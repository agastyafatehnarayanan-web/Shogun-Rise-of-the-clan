/* =====================================================================
 * SHŌGUN — authoritative multiplayer server.
 *
 * Reuses the browser game engine (server/loader.js) so the rules are never
 * re-implemented. Holds the true game state per room and pushes each player
 * a fog-of-war-redacted view. Two room types: public (listed, anyone joins)
 * and private (host approves each joiner).
 *
 * Protocol: JSON messages over WebSocket, each with a `t` (type). No deps
 * beyond `ws`. Run: `PORT=8787 node server/index.js`.
 * ===================================================================== */
const http = require("http");
const { WebSocketServer } = require("ws");
const { loadEngine } = require("./loader");

const PORT = process.env.PORT || 8787;
const rooms = new Map();                 // code -> room
const CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

const uid = () => Math.random().toString(36).slice(2, 10);
const code6 = () => Array.from({ length: 6 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join("");
const send = (ws, obj) => { try { if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj)); } catch (e) {} };

/* ---- room helpers -------------------------------------------------- */
function seatOfClient(room, clientId) {
  for (const cid in room.seats) if (room.seats[cid].clientId === clientId) return cid;
  return null;
}
function humanSeatCount(room) { return Object.values(room.seats).filter(s => s.clientId && !s.isAI).length; }
function takenClans(room) { return new Set(Object.keys(room.seats).filter(c => room.seats[c].clientId || room.seats[c].isAI)); }

function roomMeta(room) {
  return {
    code: room.code, visibility: room.visibility, mode: room.mode, len: room.len,
    phase: room.phase, hostClientId: room.hostClientId, activeClan: room.activeClan || null,
    seats: Object.entries(room.seats).map(([cid, s]) => ({ clan: cid, name: s.name, isAI: s.isAI, ready: !!s.ready, taken: !!(s.clientId || s.isAI) })),
    pending: room.pending.map(p => ({ clientId: p.clientId, name: p.name })),
  };
}
function publicList() {
  return [...rooms.values()].filter(r => r.visibility === "public" && r.phase === "lobby")
    .map(r => ({ code: r.code, mode: r.mode, players: humanSeatCount(r), host: r.hostName || "host" }));
}

/* Deep clone, then redact hidden info for player `cid`. */
function viewFor(room, cid) {
  const S = room.state, SR = room.engine.SR;
  const V = JSON.parse(JSON.stringify({
    mode: S.mode, year: S.year, seasonIdx: S.seasonIdx, lengthYears: S.lengthYears,
    weather: S.weather, flags: S.flags, provinces: S.provinces, clans: S.clans,
    movedUnits: S.movedUnits || {}, order: S.order, shogun: S.shogun,
    courtHost: S.courtHost, log: S.log.slice(0, 60),
    eventCard: S.eventCard ? { name: S.eventCard.name, text: S.eventCard.text } : null,
    gameOver: S.gameOver, winner: S.winner, endReason: S.endReason,
    finalScores: S.finalScores || null, modeB: S.modeB || null,
  }));
  for (const id in V.provinces) {
    if (!SR.visibleTo(S, cid, id)) {
      V.provinces[id].units = [];                       // hide enemy composition/count
      if (V.provinces[id].siege) V.provinces[id].siege.army = [];
    }
  }
  for (const oc in V.clans) {
    if (oc !== cid && !SR.allied(S, cid, oc)) {
      V.clans[oc].agents = [];                          // hide others' spies
      V.clans[oc].ambition = null;                      // hide Mode B ambitions
    }
  }
  V.humanClan = cid;
  V.__you = cid; V.__active = room.activeClan || null; V.__phase = room.phase;
  return V;
}
function broadcastRoom(room, report) {
  // lobby meta to everyone connected to the room
  for (const cid in room.seats) {
    const s = room.seats[cid];
    if (!s.ws) continue;
    send(s.ws, { t: "room", room: roomMeta(room), you: cid });
    if (room.phase === "playing" || room.phase === "over") {
      send(s.ws, { t: "view", state: viewFor(room, cid) });
      if (report) send(s.ws, { t: "report", report });
    }
  }
}

/* ---- turn loop ----------------------------------------------------- */
function beginRoomSeason(room) {
  const S = room.state, SR = room.engine.SR;
  SR.beginSeason(S);
  room.order = SR.livingClans(S).filter(c => S.clans[c].alive)
    .sort((a, b) => SR.scoreTotal(S, a).total - SR.scoreTotal(S, b).total);
  room.turnIdx = 0;
  stepTurns(room);
}
function stepTurns(room) {
  const S = room.state, SR = room.engine.SR;
  while (room.turnIdx < room.order.length) {
    const cid = room.order[room.turnIdx];
    if (!S.clans[cid] || !S.clans[cid].alive) { room.turnIdx++; continue; }
    const seat = room.seats[cid];
    if (seat && !seat.isAI && seat.ws) { room.activeClan = cid; broadcastRoom(room); return; }
    try { SR.aiClanTurn(S, cid); } catch (e) { console.error("AI error", cid, e.message); }
    room.turnIdx++;
  }
  endRoomSeason(room);
}
function endRoomSeason(room) {
  const S = room.state, SR = room.engine.SR, DATA = room.engine.DATA;
  room.activeClan = null;
  if (DATA.seasons[S.seasonIdx] === "Winter") {
    if (SR.checkVictory(S)) return finishGame(room);
    if (S.year >= S.lengthYears) { SR.endGame(S, null, null); return finishGame(room); }
    S.year += 1; S.seasonIdx = 0;
  } else S.seasonIdx += 1;
  const alive = SR.livingClans(S).filter(c => S.clans[c].alive);
  if (alive.length <= 1) { SR.endGame(S, alive[0] || null, "Only one clan remains."); return finishGame(room); }
  beginRoomSeason(room);
}
function finishGame(room) { room.phase = "over"; broadcastRoom(room); }

/* ---- apply a player action through the shared engine --------------- */
function applyAction(room, cid, kind, p) {
  const S = room.state, SR = room.engine.SR;
  p = p || {};
  switch (kind) {
    case "recruit": return SR.doRecruit(S, cid, p.provId, p.unit);
    case "build":   return SR.doBuild(S, cid, p.provId, p.key);
    case "pacify":  return SR.doPacify(S, p.provId, cid);
    case "raze":    return SR.doRaze(S, p.provId, cid);
    case "court":   return SR.doCourt(S, cid);
    case "sellRice":return SR.doSellRice(S, cid, p.amount);
    case "agent":   return SR.recruitAgent(S, cid);
    case "spymaster": return SR.hireSpymaster(S, cid);
    case "deploy":  return SR.deployAgent(S, cid, p.agentUid, p.provId);
    case "op":      return SR.runOp(S, cid, p.opKey, p.provId, p.koban);
    case "pact":    return SR.proposePact(S, cid, p.to, p.pactType);
    case "lift":    SR.liftSiege(S, p.provId); return { ok: true };
    case "assault": { const r = SR.siegeAssault(S, p.provId, true); return { ok: true, report: r }; }
    case "move": {
      const hostile = SR.isHostile(S, p.toId, cid);
      if (hostile) { const rep = SR.executeAttack(S, p.fromId, p.toId, p.uids, cid, p.opts || {}); return { ok: true, report: rep }; }
      SR.performMove(S, p.fromId, p.toId, p.uids, cid); return { ok: true };
    }
    default: return { ok: false, reason: "Unknown action." };
  }
}

/* ---- start the game ------------------------------------------------ */
function startGame(room) {
  room.engine = loadEngine();
  const SR = room.engine.SR;
  // seat clans: fill unseated clans as AI
  const first = Object.keys(room.seats)[0];
  if (room.mode === "B") SR.newGameB({ clan: room.houseClan || "takeda", retainers: 5, lengthYears: room.len });
  else SR.newGameA({ clan: first, lengthYears: room.len });
  room.state = SR.state;
  // A sentinel that matches no clan id and no neutral owner (null) — the AI's
  // "attack the human" branch never fires, so AI vs human battles auto-resolve.
  room.state.humanClan = "__SERVER__";
  for (const cid in room.state.clans) {
    const seat = room.seats[cid];
    room.state.clans[cid].isHuman = !!(seat && seat.ws && !seat.isAI);
    if (!seat) room.seats[cid] = { name: room.state.clans[cid].name + " (AI)", isAI: true };
  }
  room.phase = "playing";
  beginRoomSeason(room);
}

/* ---- message handling ---------------------------------------------- */
function handle(ws, msg) {
  const t = msg.t;
  if (t === "host") {
    let code; do { code = code6(); } while (rooms.has(code));
    const clan = msg.clan || "oda";
    const room = {
      code, visibility: msg.visibility === "public" ? "public" : "private",
      mode: msg.mode === "B" ? "B" : "A", len: [4, 6, 8].includes(msg.len) ? msg.len : 6,
      hostClientId: ws._cid, hostName: msg.name || "Host", phase: "lobby",
      engine: null, state: null, seats: {}, pending: [], order: [], turnIdx: 0, activeClan: null,
      houseClan: clan,
    };
    room.seats[clan] = { clientId: ws._cid, ws, name: msg.name || "Host", token: ws._token, isAI: false, ready: false };
    rooms.set(code, room);
    ws._room = code;
    send(ws, { t: "hosted", code });
    broadcastRoom(room);
    return;
  }
  if (t === "listPublic") { send(ws, { t: "publicRooms", rooms: publicList() }); return; }

  if (t === "join") {
    const room = rooms.get((msg.code || "").toUpperCase());
    if (!room) return send(ws, { t: "error", msg: "No such room." });
    if (room.phase !== "lobby") return send(ws, { t: "error", msg: "That game has already begun." });
    if (room.visibility === "public") { seatPlayer(room, ws, msg.name, msg.clan); }
    else {
      room.pending.push({ clientId: ws._cid, ws, name: msg.name || "Player", clan: msg.clan });
      ws._room = room.code;
      send(ws, { t: "pending", code: room.code });
      const host = room.seats[seatOfClient(room, room.hostClientId)];
      if (host && host.ws) send(host.ws, { t: "joinRequest", clientId: ws._cid, name: msg.name || "Player" });
      broadcastRoom(room);   // refresh the host's room view so it lists the request
    }
    return;
  }
  if (t === "approve") {           // host admits/denies a pending private joiner
    const room = rooms.get(ws._room);
    if (!room || room.hostClientId !== ws._cid) return;
    const idx = room.pending.findIndex(p => p.clientId === msg.clientId);
    if (idx < 0) return;
    const pend = room.pending.splice(idx, 1)[0];
    if (msg.ok) seatPlayer(room, pend.ws, pend.name, pend.clan);
    else { send(pend.ws, { t: "denied" }); }
    broadcastRoom(room);
    return;
  }
  // everything below needs the player's room
  const room = rooms.get(ws._room);
  if (!room) return;
  const myClan = seatOfClient(room, ws._cid);

  if (t === "pickClan") {
    if (room.phase !== "lobby" || !myClan) return;
    const want = msg.clan;
    if (want && !takenClans(room).has(want)) {
      const seat = room.seats[myClan]; delete room.seats[myClan]; room.seats[want] = seat;
    }
    broadcastRoom(room); return;
  }
  if (t === "ready") { if (myClan) room.seats[myClan].ready = !room.seats[myClan].ready; broadcastRoom(room); return; }
  if (t === "start") {
    if (room.hostClientId !== ws._cid || room.phase !== "lobby") return;
    if (humanSeatCount(room) < 1) return send(ws, { t: "error", msg: "Need at least one player." });
    startGame(room); return;
  }
  if (t === "action") {
    if (room.phase !== "playing" || myClan !== room.activeClan) return send(ws, { t: "error", msg: "Not your turn." });
    const res = applyAction(room, myClan, msg.kind, msg.payload) || {};
    if (res.ok === false) send(ws, { t: "actionResult", ok: false, reason: res.reason });
    broadcastRoom(room, res.report);
    return;
  }
  if (t === "endTurn") {
    if (room.phase !== "playing" || myClan !== room.activeClan) return;
    room.turnIdx++; stepTurns(room);
    return;
  }
  if (t === "chat") { for (const cid in room.seats) if (room.seats[cid].ws) send(room.seats[cid].ws, { t: "chat", from: myClan, name: room.seats[myClan] && room.seats[myClan].name, msg: String(msg.msg || "").slice(0, 240) }); return; }
}

function seatPlayer(room, ws, name, wantClan) {
  const taken = takenClans(room);
  const allClans = Object.keys(room.engine ? room.engine.DATA.clans : loadEngine().DATA.clans);
  let clan = wantClan && !taken.has(wantClan) ? wantClan : allClans.find(c => !taken.has(c));
  if (!clan) { send(ws, { t: "error", msg: "Room is full." }); return; }
  room.seats[clan] = { clientId: ws._cid, ws, name: name || "Player", token: ws._token, isAI: false, ready: false };
  ws._room = room.code;
  send(ws, { t: "joined", code: room.code, clan });
  broadcastRoom(room);
}

function dropClient(ws) {
  const room = rooms.get(ws._room);
  if (!room) return;
  room.pending = room.pending.filter(p => p.clientId !== ws._cid);
  const cid = seatOfClient(room, ws._cid);
  if (cid) {
    if (room.phase === "lobby") { delete room.seats[cid]; }
    else { room.seats[cid].isAI = true; room.seats[cid].ws = null; room.seats[cid].clientId = null;  // hand the clan to the AI
      if (room.activeClan === cid) { room.turnIdx++; stepTurns(room); } }
  }
  // host left in lobby → close room
  if (room.hostClientId === ws._cid && room.phase === "lobby") { rooms.delete(room.code); }
  else broadcastRoom(room);
}

/* ---- wire up the server ------------------------------------------- */
const server = http.createServer((req, res) => {
  res.writeHead(200, { "content-type": "text/plain" });
  res.end("Shogun multiplayer server. Rooms: " + rooms.size);
});
const wss = new WebSocketServer({ server });
wss.on("connection", (ws) => {
  ws._cid = uid(); ws._token = uid();
  send(ws, { t: "hello", clientId: ws._cid, token: ws._token });
  ws.on("message", (data) => {
    let msg; try { msg = JSON.parse(data); } catch (e) { return; }
    try { handle(ws, msg); } catch (e) { console.error("handler error", e); send(ws, { t: "error", msg: "Server error." }); }
  });
  ws.on("close", () => { try { dropClient(ws); } catch (e) {} });
});
server.listen(PORT, () => console.log("Shōgun multiplayer server listening on :" + PORT));
