/* =====================================================================
 * Tutorial — a first-run coach-mark overlay that spotlights the key parts
 * of the screen and explains the loop. Shown once (remembered in
 * localStorage); replayable from the "?" button.
 * ===================================================================== */

UI.tutorial = {
  i: 0, layer: null,
  steps: [
    { el: null, title: "Welcome, daimyō",
      text: "You lead one clan in the Warring States. Everything converts to <b>Prestige</b> — hold the most by the final year to win, or seize a sudden victory by conquest or wealth." },
    { el: "#map-wrap", title: "The map of Nippon",
      text: "This is the realm. Each province is washed in the <b>colour of the clan that controls it</b>. Click any province to inspect it; your own glow when selected." },
    { el: "#side", title: "Your province & actions",
      text: "The side panel shows the selected province. From one you hold you can <b>Recruit</b> troops, <b>Build</b> (markets, temples, castles), and <b>March / Attack</b> a neighbour." },
    { el: "#tabs", title: "The other levers",
      text: "Tabs switch to <b>Powers</b> (rivals), <b>Diplomacy</b> (pacts & marriages), the <b>Shadow</b> (spies & assassins), and the <b>Court</b> (climb ranks to Shōgun)." },
    { el: "#end-season-btn", title: "Turn the season",
      text: "When you're done, <b>End Season</b>. Rivals move, the season turns, and each <b>Autumn you harvest</b> rice and koban. Feed your armies or they starve." },
    { el: ".bb-actions", title: "You're ready",
      text: "Replay this any time with <b>?</b>, toggle music with <b>🔊</b>. Fortune favours the bold — now go and unite Japan." },
  ],

  seen() { try { return localStorage.getItem("sr_tut_seen") === "1"; } catch (e) { return false; } },
  markSeen() { try { localStorage.setItem("sr_tut_seen", "1"); } catch (e) {} },
  maybeStart() { if (!this.seen()) this.start(); },

  start() {
    this.i = 0;
    if (!this.layer) {
      this.layer = document.createElement("div");
      this.layer.id = "tut-layer";
      this.layer.innerHTML =
        `<div id="tut-spot"></div>
         <div id="tut-card">
           <div id="tut-title"></div><div id="tut-text"></div>
           <div id="tut-nav">
             <span id="tut-count"></span>
             <span style="flex:1"></span>
             <button id="tut-skip" class="ghost">Skip</button>
             <button id="tut-back" class="ghost">Back</button>
             <button id="tut-next" class="primary">Next</button>
           </div>
         </div>`;
      document.body.appendChild(this.layer);
      this.layer.querySelector("#tut-skip").onclick = () => this.close();
      this.layer.querySelector("#tut-back").onclick = () => { this.i = Math.max(0, this.i - 1); this.render(); };
      this.layer.querySelector("#tut-next").onclick = () => {
        if (this.i >= this.steps.length - 1) this.close();
        else { this.i++; this.render(); }
      };
      window.addEventListener("resize", () => { if (this.layer && this.layer.style.display !== "none") this.render(); });
    }
    this.layer.style.display = "block";
    this.render();
  },

  render() {
    const s = this.steps[this.i];
    const spot = this.layer.querySelector("#tut-spot");
    const card = this.layer.querySelector("#tut-card");
    this.layer.querySelector("#tut-title").innerHTML = s.title;
    this.layer.querySelector("#tut-text").innerHTML = s.text;
    this.layer.querySelector("#tut-count").textContent = `${this.i + 1} / ${this.steps.length}`;
    this.layer.querySelector("#tut-back").style.visibility = this.i === 0 ? "hidden" : "visible";
    this.layer.querySelector("#tut-next").textContent = this.i >= this.steps.length - 1 ? "Begin" : "Next";

    const el = s.el && document.querySelector(s.el);
    if (el) {
      const r = el.getBoundingClientRect(), pad = 6;
      spot.style.display = "block";
      spot.style.left = (r.left - pad) + "px"; spot.style.top = (r.top - pad) + "px";
      spot.style.width = (r.width + pad * 2) + "px"; spot.style.height = (r.height + pad * 2) + "px";
      // place the card near the highlight, kept on-screen
      let cx = Math.min(Math.max(r.left, 12), window.innerWidth - 360);
      let cy = r.bottom + 12;
      if (cy + 190 > window.innerHeight) cy = Math.max(12, r.top - 200);
      card.style.left = cx + "px"; card.style.top = cy + "px";
      card.style.transform = "none";
    } else {
      spot.style.display = "none";
      card.style.left = "50%"; card.style.top = "50%"; card.style.transform = "translate(-50%,-50%)";
    }
  },

  close() { this.markSeen(); if (this.layer) this.layer.style.display = "none"; },
};

if (typeof module !== "undefined" && typeof UI !== "undefined") module.exports = UI.tutorial;
