/* =====================================================================
 * Audio — fully synthesized with the Web Audio API (no external files, so
 * it stays self-contained, CSP-safe, and works offline). A gentle ambient
 * pad plus SFX for seasons, battle, building, capture, and victory.
 * A mute toggle lives in the top bar and is remembered in localStorage.
 * ===================================================================== */

UI.audio = {
  ctx: null, master: null, muted: false, ambient: null,

  loadMute() { try { this.muted = localStorage.getItem("sr_muted") === "1"; } catch (e) {} },

  // Must be created from a user gesture (browsers block autoplay).
  init() {
    if (this.ctx) { if (this.ctx.state === "suspended") this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try { this.ctx = new AC(); } catch (e) { return; }
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.5;
    this.master.connect(this.ctx.destination);
    this.startAmbient();
  },

  setMuted(m) {
    this.muted = m;
    try { localStorage.setItem("sr_muted", m ? "1" : "0"); } catch (e) {}
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.5, this.ctx.currentTime, 0.05);
  },
  toggle() { this.init(); this.setMuted(!this.muted); return this.muted; },

  /* one plucked/blown tone with an exponential decay */
  tone(freq, dur, type, gain, delay, glideTo) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + (delay || 0);
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type || "triangle";
    o.frequency.setValueAtTime(freq, t);
    if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain || 0.2, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.05);
  },

  /* a short filtered noise burst (drum body / gunfire) */
  noise(dur, gain, delay, cutoff) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + (delay || 0);
    const n = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = this.ctx.createBufferSource(); src.buffer = buf;
    const f = this.ctx.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = cutoff || 1200;
    const g = this.ctx.createGain(); g.gain.value = gain || 0.2;
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t);
  },

  // pentatonic (min-yo) scale in Hz for koto-like flourishes
  SCALE: [220, 261.6, 293.7, 349.2, 392, 440, 523.3, 587.3],

  play(name) {
    if (!this.ctx || this.muted) return;
    switch (name) {
      case "season":  // a soft two-note koto pluck
        this.tone(this.SCALE[4], 1.1, "triangle", 0.16, 0);
        this.tone(this.SCALE[6], 1.4, "triangle", 0.12, 0.12);
        break;
      case "battle":  // taiko thud + a rattle
        this.tone(90, 0.5, "sine", 0.5, 0, 45);
        this.noise(0.25, 0.25, 0.02, 900);
        this.tone(70, 0.4, "sine", 0.35, 0.18, 40);
        break;
      case "gun":     // teppō volley
        this.noise(0.12, 0.35, 0, 2200); this.noise(0.1, 0.25, 0.09, 1800);
        break;
      case "build":   // wood-block / construction
        this.tone(660, 0.12, "square", 0.12, 0); this.tone(440, 0.16, "square", 0.1, 0.06);
        break;
      case "recruit": // a short horn call
        this.tone(330, 0.3, "sawtooth", 0.14, 0, 392);
        break;
      case "capture": // a rising flourish when a province falls
        [0, 2, 4, 6].forEach((s, i) => this.tone(this.SCALE[s], 0.5, "triangle", 0.16, i * 0.09));
        this.tone(90, 0.6, "sine", 0.35, 0, 50);
        break;
      case "victory": // a fuller ascending run
        [0, 2, 3, 5, 6, 7].forEach((s, i) => this.tone(this.SCALE[s], 0.9, "triangle", 0.18, i * 0.13));
        break;
      case "click":
        this.tone(520, 0.06, "sine", 0.07, 0);
        break;
    }
  },

  /* a slow, very quiet evolving pad — the atmosphere under the game */
  startAmbient() {
    if (!this.ctx || this.ambient) return;
    const g = this.ctx.createGain(); g.gain.value = 0.05; g.connect(this.master);
    const lp = this.ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 520; lp.connect(g);
    const freqs = [110, 164.8, 220]; // A2 / E3 / A3 drone
    freqs.forEach((f, i) => {
      const o = this.ctx.createOscillator(); o.type = "triangle";
      o.frequency.value = f * (1 + (i - 1) * 0.004); // slight detune
      // slow tremolo so the pad breathes
      const lfo = this.ctx.createOscillator(); lfo.frequency.value = 0.05 + i * 0.02;
      const lg = this.ctx.createGain(); lg.gain.value = f * 0.003;
      lfo.connect(lg); lg.connect(o.frequency);
      o.connect(lp); o.start(); lfo.start();
    });
    this.ambient = g;
  },
};

if (typeof module !== "undefined" && typeof UI !== "undefined") module.exports = UI.audio;
