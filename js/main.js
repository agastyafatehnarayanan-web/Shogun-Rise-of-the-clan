/* =====================================================================
 * main.js — the flow controller (GAME). Ties the engine, AI, Mode B, and
 * UI together into the season loop.
 * ===================================================================== */

const GAME = {};

window.addEventListener("DOMContentLoaded", () => {
  UI.initTitle();
  UI.initGame();
  if (typeof NET !== "undefined") NET.installWrappers();   // online action routing (inert offline)
  UI.showScreen("title-screen");
});

/* ---- start a new campaign ------------------------------------------ */
GAME.start = function () {
  const s = UI.setup;
  if (UI.audio) UI.audio.init();      // create the AudioContext from this click
  if (s.mode === "B") SR.newGameB({ clan: s.clan, retainers: s.ret, lengthYears: s.len });
  else SR.newGameA({ clan: s.clan, lengthYears: s.len });
  UI.selected = SR.state.clans[SR.state.humanClan].daimyoLoc;
  UI.tab = "province";
  $$(".tab").forEach(t => t.classList.toggle("active", t.dataset.tab === "province"));
  UI.showScreen("game-screen");
  GAME.startSeason(true);
};

/* ---- begin a season (economy, events, then the human acts) --------- */
GAME.startSeason = function (first) {
  const S = SR.state;
  SR.beginSeason(S);
  if (UI.audio) UI.audio.play("season");
  if (UI.seasonBanner) UI.seasonBanner(DATA.seasons[S.seasonIdx], S.year);
  if (S.mode === "B") {
    SR.modeBSeasonStart(S);
    // if the lord just died at the top of the final year, resolve immediately
    if (!S.modeB.lordAlive && S.modeB.successor === undefined && DATA.seasons[S.seasonIdx] === "Spring" && S.year >= S.modeB.lordClock) {
      // let the final year play out; succession resolves at year end
    }
    if (S.modeB.lordAlive && S.modeB.directive) UI.toast(`The lord issues a directive — see the Ambition tab.`);
  }
  UI.render();
  $("#hint").textContent = S.mode === "B"
    ? `Year ${S.year}, ${DATA.seasons[S.seasonIdx]} — hold your fiefs, answer the lord, and scheme. Press End Season when ready.`
    : `Year ${S.year}, ${DATA.seasons[S.seasonIdx]} — take your actions, then press End Season.`;
  if (first && UI.tutorial) setTimeout(() => UI.tutorial.maybeStart(), 500);
  if (SR.state.gameOver) GAME.showGameOver();
};

/* ---- human march / attack from the March modal --------------------- */
GAME.humanMarch = function (m) {
  const S = SR.state, cid = S.humanClan;
  UI.closeModal();
  UI.moveMode = null;
  const { fromId, toId, sel } = m;
  if (!sel.length) return;
  if (typeof NET !== "undefined" && NET.online) {          // online: server resolves & pushes the report
    NET.doAction("move", { fromId, toId, uids: sel, opts: { surprise: m.surprise, deploy: m.deploy, bringDaimyo: m.bringDaimyo } });
    return;
  }
  const hostile = SR.isHostile(S, toId, cid);
  if (!hostile) {
    SR.performMove(S, fromId, toId, sel, cid);
    UI.toast(`Marched to ${SR.stat(toId).name}.`);
    UI.render();
    return;
  }
  const report = SR.executeAttack(S, fromId, toId, sel, cid, {
    surprise: m.surprise, deploy: m.deploy, bringDaimyo: m.bringDaimyo, interactive: true,
  });
  UI.render();
  UI.showBattleReport(report, () => { UI.render(); if (SR.state.gameOver) GAME.showGameOver(); });
};

/* ---- END SEASON: run AI, resolve human defenses, advance ----------- */
GAME.endSeason = function () {
  const S = SR.state;
  if (S.gameOver) return;
  if (typeof NET !== "undefined" && NET.online) { NET.endTurn(); return; }   // online: end my turn
  UI.moveMode = null;
  $("#end-season-btn").disabled = true;
  UI.toast("The rival clans make their moves…");

  // brief delay so the toast shows, then process
  setTimeout(() => {
    // AI economic & military phase
    SR.aiPhase(S);
    if (S.mode === "B") {
      SR.modeBAIDirectives(S);
      SR.modeBInvaderTurn(S);
    }
    const pending = S.pendingDefenses || [];
    GAME.processDefenses(pending, 0);
  }, 260);
};

GAME.processDefenses = function (list, i) {
  const S = SR.state;
  if (i >= list.length) { GAME.finishSeason(); return; }
  const ev = list[i];
  // skip if the target is no longer ours or the attacker vanished
  if (S.provinces[ev.toId].owner !== S.humanClan || !S.provinces[ev.fromId] || S.provinces[ev.fromId].owner !== ev.attCid) {
    GAME.processDefenses(list, i + 1); return;
  }
  UI.render();
  UI.openDefense(ev, () => { UI.render(); GAME.processDefenses(list, i + 1); });
};

/* ---- advance the clock / detect game end --------------------------- */
GAME.finishSeason = function () {
  const S = SR.state;
  $("#end-season-btn").disabled = false;

  if (S.mode === "B") { GAME.finishSeasonB(S); return; }

  const ended = SR.advanceSeason(S);
  if (ended) { UI.render(); GAME.showGameOver(); return; }
  GAME.startSeason();
};

GAME.finishSeasonB = function (S) {
  const M = S.modeB;
  // collective collapse?
  if (SR.modeBInvaderShare(S) >= 0.4) {
    SR.modeBResolve(S, true); UI.render(); GAME.showGameOverB(); return;
  }
  const isWinter = DATA.seasons[S.seasonIdx] === "Winter";
  if (isWinter) {
    if (!M.lordAlive) { SR.modeBSuccession(S); SR.modeBResolve(S, false); UI.render(); GAME.showGameOverB(); return; }
    if (S.year >= S.lengthYears) {
      SR.modeBLordDies(S, `${M.lordName} passes away as the campaign draws to its close.`);
      SR.modeBSuccession(S); SR.modeBResolve(S, false); UI.render(); GAME.showGameOverB(); return;
    }
    S.year += 1; S.seasonIdx = 0;
  } else {
    S.seasonIdx += 1;
  }
  GAME.startSeason();
};

/* ---- GAME OVER: Mode A scoring ------------------------------------- */
GAME.showGameOver = function () {
  const S = SR.state;
  const scores = S.finalScores || SR.livingClans(S).map(c => ({ cid: c, ...SR.scoreTotal(S, c) })).sort((a, b) => b.total - a.total);
  const winCid = S.winner;
  const youWin = winCid === S.humanClan;
  if (UI.audio && youWin) UI.audio.play("victory");
  const rows = scores.map((s, i) => {
    const c = S.clans[s.cid];
    return `<div class="score-row ${s.cid === winCid ? "win" : ""}">
      <span class="sr-rank">${i + 1}</span>
      <span class="mini-crest" style="background:${c.color}">${c.crest}</span>
      <span class="sr-name">${esc(c.name)}${s.cid === S.humanClan ? ' <span class="you-badge">YOU</span>' : ""}
        <div class="score-detail">standing ${s.standing} · banked ${s.banked} · honour ${s.honour} (${s.band}) · majorities ${s.majorities}</div>
      </span>
      <span class="sr-total">${s.total}</span>
    </div>`;
  }).join("");
  UI.modal({
    title: youWin ? "Victory!" : "The Campaign Ends",
    body: `<p style="font-family:var(--font-h);font-size:16px;margin-top:0">${esc(S.endReason || "")}</p>
      <p class="${youWin ? "okc" : "warn"}" style="font-family:var(--font-h)">${youWin ? "Your clan stands supreme over Japan." : `The ${esc(S.clans[winCid].name)} clan claims the highest Prestige.`}</p>
      <div class="divider"></div>${rows}`,
    foot: `<button class="primary" onclick="location.reload()">Play Again</button>`,
  });
};

/* ---- GAME OVER: Mode B succession --------------------------------- */
GAME.showGameOverB = function () {
  const S = SR.state, M = S.modeB;
  const ranking = M.finalRanking || [];
  const you = ranking.find(r => r.isHuman);
  const youWon = ranking[0] && ranking[0].isHuman;
  const youAch = S.humanAchieved;
  const rows = ranking.map((r, i) => `<div class="score-row ${i === 0 ? "win" : ""}">
      <span class="sr-rank">${i + 1}</span>
      <span class="mini-crest" style="background:${S.clans[r.r].color}">${S.clans[r.r].crest}</span>
      <span class="sr-name">${esc(r.name)}${r.isHuman ? ' <span class="you-badge">YOU</span>' : ""}
        <div class="score-detail">${esc(r.ambition.name)} — ${r.achieved ? "<b class='okc'>fulfilled</b>" : "unfulfilled"} · Standing ${r.standing} · power ${r.power}</div>
      </span>
    </div>`).join("");
  UI.modal({
    title: youWon ? "The House is Yours" : "The Succession is Decided",
    body: `<p style="font-family:var(--font-h);font-size:16px;margin-top:0">${esc(S.endReason || "")}</p>
      <p class="${youAch ? "okc" : "warn"}" style="font-family:var(--font-h)">Your ambition — <b>${esc(you ? you.ambition.name : "")}</b> — was ${youAch ? "fulfilled." : "not fulfilled."} ${youWon ? "You come out ahead of every rival." : ""}</p>
      <div class="divider"></div>${rows}`,
    foot: `<button class="primary" onclick="location.reload()">Play Again</button>`,
  });
};

if (typeof module !== "undefined") module.exports = GAME;
