/* =====================================================================
 * warrior3d.js — 3D FIRST-PERSON katana combat for "Way of the Warrior".
 *
 * A clean, stylised 3D duel: the camera is your eyes, your blade sits in
 * view, and low-poly foes close in across a dusk battlefield. You look
 * around by dragging, and Strike / Parry / Block / Dodge with big touch
 * buttons. Built on Three.js (vendored locally, so the game stays
 * self-contained). If WebGL / THREE is unavailable, the caller falls back
 * to the 2D renderer in warrior.js.
 *
 * Public API:
 *   WARRIOR3D.available()                     -> bool
 *   WARRIOR3D.startFight({ player, enemies, theme, intro, onWin, onLose })
 *   WARRIOR3D.stop()
 * ===================================================================== */

const WARRIOR3D = {};

WARRIOR3D.available = function () {
  if (typeof THREE === "undefined" || typeof document === "undefined") return false;
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl") || c.getContext("experimental-webgl"));
  } catch (e) { return false; }
};

/* palette per scene theme */
WARRIOR3D.THEMES = {
  dusk:    { sky: 0xf2a65a, sky2: 0x6a3d6b, fog: 0xdd9a6a, ground: 0x6b5636, ground2: 0x574327, sun: 0xffd9a0, amb: 0x54506a, props: "camp" },
  night:   { sky: 0x1b2340, sky2: 0x070912, fog: 0x161d33, ground: 0x2a2f3f, ground2: 0x20242f, sun: 0x9fb4ff, amb: 0x223055, props: "fort" },
  dawn:    { sky: 0xbcd4e6, sky2: 0xe9b7a0, fog: 0xccd8de, ground: 0x5d6b4a, ground2: 0x4a563a, sun: 0xfff0d8, amb: 0x6d7a8c, props: "shrine" },
  ember:   { sky: 0x7a2c1c, sky2: 0x2a0f08, fog: 0x8a3520, ground: 0x4a3524, ground2: 0x3a281a, sun: 0xffb06a, amb: 0x5a2418, props: "village" },
};

/* ------------------------------------------------------------------ */
WARRIOR3D.stop = function () {
  const E = WARRIOR3D._e; if (!E) return;
  E.running = false;
  if (E.raf) cancelAnimationFrame(E.raf);
  window.removeEventListener("resize", E.onResize);
  try {
    E.renderer.dispose();
    E.scene.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) { const m = o.material; (Array.isArray(m) ? m : [m]).forEach(x => x && x.dispose && x.dispose()); } });
    const cv = E.renderer.domElement; if (cv && cv.parentNode) cv.parentNode.removeChild(cv);
  } catch (e) {}
  WARRIOR3D._e = null;
};

/* ================================================================== *
 *  SETUP
 * ================================================================== */
WARRIOR3D.startFight = function (opts) {
  WARRIOR3D.stop();
  const host = document.getElementById("warrior-screen");
  if (!host) return;
  const theme = WARRIOR3D.THEMES[opts.theme] || WARRIOR3D.THEMES.dusk;

  // --- stage DOM: canvas + HUD overlay ---
  host.innerHTML = `
    <div class="w3-stage">
      <div class="w3-canvas" id="w3-canvas"></div>
      <div class="w3-hud">
        <div class="w3-top">
          <div class="w3-bar you"><label>YOU</label><div class="w3-track"><i id="w3-hp"></i></div>
            <div class="w3-ki"><i id="w3-ki"></i></div></div>
          <div class="w3-mid" id="w3-wave"></div>
          <div class="w3-bar foe"><label id="w3-foename">FOE</label><div class="w3-track"><i id="w3-foehp"></i></div></div>
        </div>
        <div class="w3-prompt" id="w3-prompt">${opts.intro || "Face your enemy."}</div>
        <div class="w3-flash" id="w3-flash"></div>
        <div class="w3-controls">
          <button class="w3-btn dodge" id="w3-dodge">💨<span>Dodge</span></button>
          <button class="w3-btn block" id="w3-block">🛡️<span>Block</span></button>
          <button class="w3-btn parry" id="w3-parry">⚔️<span>Parry</span></button>
          <button class="w3-btn strike" id="w3-strike">🗡️<span>Strike</span></button>
        </div>
      </div>
    </div>`;

  const mount = document.getElementById("w3-canvas");
  const W = mount.clientWidth || window.innerWidth, H = mount.clientHeight || window.innerHeight;

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(W, H);
  if (renderer.outputEncoding !== undefined) renderer.outputEncoding = THREE.sRGBEncoding;
  if (THREE.ACESFilmicToneMapping) renderer.toneMapping = THREE.ACESFilmicToneMapping;
  mount.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(theme.fog, 10, 46);

  const camera = new THREE.PerspectiveCamera(72, W / H, 0.1, 200);
  camera.position.set(0, 1.65, 0);

  // gradient sky dome
  const sky = WARRIOR3D._sky(theme);
  scene.add(sky);

  // lights
  const hemi = new THREE.HemisphereLight(theme.sky, theme.ground, 0.9);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(theme.sun, 1.15);
  sun.position.set(-8, 12, -6);
  scene.add(sun);
  const amb = new THREE.AmbientLight(theme.amb, 0.5);
  scene.add(amb);

  // ground
  const gGeo = new THREE.PlaneGeometry(120, 120, 1, 1);
  const gMat = new THREE.MeshStandardMaterial({ color: theme.ground, roughness: 1, metalness: 0 });
  const ground = new THREE.Mesh(gGeo, gMat);
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);
  // faint ring pattern so motion reads
  for (let i = 1; i <= 5; i++) {
    const r = new THREE.Mesh(new THREE.RingGeometry(i * 3 - 0.06, i * 3, 48),
      new THREE.MeshBasicMaterial({ color: theme.ground2, transparent: true, opacity: 0.5, side: THREE.DoubleSide }));
    r.rotation.x = -Math.PI / 2; r.position.y = 0.01; scene.add(r);
  }

  // decorative props for depth/atmosphere
  WARRIOR3D._props(scene, theme);

  // first-person katana viewmodel (child of camera)
  const view = WARRIOR3D._viewmodel(opts.player);
  camera.add(view);
  scene.add(camera);

  const E = WARRIOR3D._e = {
    renderer, scene, camera, sky, view, theme,
    W, H, running: true, raf: 0, clock: (typeof performance !== "undefined" ? performance.now() : Date.now()),
    // player
    php: opts.player.hp, phpMax: opts.player.maxHp || opts.player.hp,
    ki: opts.player.ki, kiMax: opts.player.maxKi || opts.player.ki,
    atk: opts.player.atk || 6, guard: opts.player.guard || 4,
    // fight
    queue: (opts.enemies || []).slice(), foe: null, foeIdx: 0, total: (opts.enemies || []).length,
    onWin: opts.onWin, onLose: opts.onLose,
    // input / camera look
    yaw: 0, pitch: 0, yawTarget: 0, pitchTarget: 0, dragId: null, lastX: 0, lastY: 0,
    // viewmodel anim
    vmClip: "idle", vmT: 0, blocking: false, dodgeT: 0, shake: 0, hitFlash: 0,
    combo: 0, ended: false,
    particles: [],
  };

  // controls
  WARRIOR3D._bindControls(E);

  E.onResize = () => {
    if (!WARRIOR3D._e) return;
    const w = mount.clientWidth || window.innerWidth, h = mount.clientHeight || window.innerHeight;
    E.W = w; E.H = h; camera.aspect = w / h; camera.updateProjectionMatrix(); renderer.setSize(w, h);
  };
  window.addEventListener("resize", E.onResize);

  WARRIOR3D._nextEnemy(E);
  WARRIOR3D._updateHud(E);
  WARRIOR3D._loop();
};

/* gradient sky dome via a cheap shader */
WARRIOR3D._sky = function (theme) {
  const geo = new THREE.SphereGeometry(90, 24, 12);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: { top: { value: new THREE.Color(theme.sky) }, bot: { value: new THREE.Color(theme.sky2) } },
    vertexShader: "varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
    fragmentShader: "varying vec3 vP; uniform vec3 top; uniform vec3 bot; void main(){ float h = clamp((normalize(vP).y*0.5+0.5),0.0,1.0); gl_FragColor = vec4(mix(bot,top,h),1.0); }",
  });
  return new THREE.Mesh(geo, mat);
};

/* scatter simple props (banners, lanterns, bamboo, rocks) */
WARRIOR3D._props = function (scene, theme) {
  const rnd = (a, b) => a + Math.random() * (b - a);
  const place = (mesh, x, z) => { mesh.position.set(x, mesh.position.y || 0, z); scene.add(mesh); };
  for (let i = 0; i < 26; i++) {
    const ang = rnd(0, Math.PI * 2), dist = rnd(9, 40);
    const x = Math.sin(ang) * dist, z = -Math.abs(Math.cos(ang) * dist) - 4; // bias in front
    const kind = Math.random();
    if (theme.props === "shrine" || theme.props === "camp" ? kind < 0.5 : kind < 0.35) {
      // bamboo / pole
      const h = rnd(3, 6);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, h, 6),
        new THREE.MeshStandardMaterial({ color: theme.props === "night" ? 0x2c3a2c : 0x4a6b3a, roughness: 1 }));
      pole.position.y = h / 2; place(pole, x, z);
    } else if (kind < 0.7) {
      // banner
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 4, 5), new THREE.MeshStandardMaterial({ color: 0x2a1f14 }));
      pole.position.y = 2; place(pole, x, z);
      const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 2.4), new THREE.MeshStandardMaterial({ color: 0x9a2b1e, side: THREE.DoubleSide, roughness: 1 }));
      flag.position.set(x + 0.5, 2.6, z); flag.userData.flag = true; scene.add(flag);
    } else {
      // rock
      const r = rnd(0.4, 1.1);
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(r, 0), new THREE.MeshStandardMaterial({ color: theme.ground2, roughness: 1, flatShading: true }));
      rock.position.y = r * 0.5; rock.rotation.set(rnd(0, 3), rnd(0, 3), rnd(0, 3)); place(rock, x, z);
    }
  }
};

/* first-person katana viewmodel — held low-right, blade angled up across
 * the view for a clean ready stance (no clunky arm-block filling the corner) */
WARRIOR3D._viewmodel = function (player) {
  const g = new THREE.Group();
  const skin = new THREE.MeshStandardMaterial({ color: 0xcaa27a, roughness: 0.85 });
  const cloth = new THREE.MeshStandardMaterial({ color: 0x24304a, roughness: 1 });

  // the sword group (handle + guard + blade), built pointing "forward" (-z)
  const kg = new THREE.Group();
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.26, 8), new THREE.MeshStandardMaterial({ color: 0x14110c, roughness: 0.9 }));
  handle.rotation.x = Math.PI / 2; handle.position.z = 0.10; kg.add(handle);
  const wrap = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.06), skin); // fist over the grip
  wrap.position.z = 0.05; kg.add(wrap);
  const guard = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.018, 14), new THREE.MeshStandardMaterial({ color: 0x8a6a1a, metalness: 0.7, roughness: 0.35 }));
  guard.rotation.x = Math.PI / 2; guard.position.z = -0.03; kg.add(guard);
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.05, 1.15), new THREE.MeshStandardMaterial({ color: 0xe7edf4, metalness: 0.9, roughness: 0.14 }));
  blade.position.z = -0.62; kg.add(blade);
  const edge = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.052, 1.12), new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.6, roughness: 0.2 }));
  edge.position.set(0.011, 0, -0.62); kg.add(edge);
  // held low-right, blade sweeping up-and-inward across the lower view
  kg.position.set(0.26, -0.34, -0.72);
  kg.rotation.set(-0.78, 0.34, -0.12);
  g.add(kg);

  // a slim forearm trailing off the bottom edge (kept small so it doesn't dominate)
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, 0.42), cloth);
  arm.position.set(0.32, -0.54, -0.5); arm.rotation.set(-0.85, -0.2, 0.15); g.add(arm);

  g.userData.katana = kg; g.userData.arm = arm;
  g.userData.rest = { pos: kg.position.clone(), rot: kg.rotation.clone() };
  return g;
};

/* low-poly humanoid foe */
WARRIOR3D._makeFoe = function (def) {
  const g = new THREE.Group();
  const body = new THREE.MeshStandardMaterial({ color: def.color || 0x8a2b22, roughness: 1, flatShading: true });
  const trim = new THREE.MeshStandardMaterial({ color: 0x1c1712, roughness: 1, flatShading: true });
  const skin = new THREE.MeshStandardMaterial({ color: 0xc79a72, roughness: 0.9, flatShading: true });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.72, 0.34), body); torso.position.y = 1.15; g.add(torso);
  const hips = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.3, 0.32), trim); hips.position.y = 0.72; g.add(hips);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.32, 0.3), skin); head.position.y = 1.68; g.add(head);
  const hat = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.24, 12), trim); hat.position.y = 1.9; g.add(hat);
  const mkLimb = (w, h, mat) => new THREE.Mesh(new THREE.BoxGeometry(w, h, w), mat);
  const lArm = mkLimb(0.16, 0.6, body); lArm.position.set(-0.42, 1.2, 0); g.add(lArm);
  const rArm = new THREE.Group(); rArm.position.set(0.42, 1.45, 0);
  const rArmMesh = mkLimb(0.16, 0.6, body); rArmMesh.position.y = -0.28; rArm.add(rArmMesh);
  // weapon in right hand
  const wpn = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.02, 1.0), new THREE.MeshStandardMaterial({ color: 0xcfd6de, metalness: 0.7, roughness: 0.3 }));
  wpn.position.set(0, -0.55, -0.4); wpn.rotation.x = -0.4; rArm.add(wpn);
  g.add(rArm);
  const lLeg = mkLimb(0.2, 0.66, trim); lLeg.position.set(-0.16, 0.35, 0); g.add(lLeg);
  const rLeg = mkLimb(0.2, 0.66, trim); rLeg.position.set(0.16, 0.35, 0); g.add(rLeg);
  // blob shadow
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.55, 20), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.32 }));
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.02; g.add(shadow);
  g.userData = { torso, head, lArm, rArm, lLeg, rLeg, hat };
  return g;
};

/* ================================================================== *
 *  ENEMY LIFECYCLE + COMBAT FSM
 * ================================================================== */
WARRIOR3D._nextEnemy = function (E) {
  const def = E.queue.shift();
  if (!def) return WARRIOR3D._end(E, true);
  E.foeIdx++;
  const mesh = WARRIOR3D._makeFoe(def);
  const ang = (Math.random() - 0.5) * 0.5;
  mesh.position.set(Math.sin(ang) * 8, 0, -9);
  mesh.rotation.y = Math.PI;              // facing the player
  E.scene.add(mesh);
  E.foe = {
    def, mesh, hp: def.hp, hpMax: def.hp, dmg: def.dmg, skill: def.skill || 0.7, aggr: def.aggr || 0.6,
    state: "approach", stateT: 0, dir: null, winMs: Math.max(560, 1300 - (def.skill || 0.7) * 720),
    walkPhase: 0, dead: false, x: mesh.position.x,
  };
  const nm = document.getElementById("w3-foename"); if (nm) nm.textContent = def.name;
  const wv = document.getElementById("w3-wave"); if (wv) wv.textContent = E.total > 1 ? `${E.foeIdx} / ${E.total}` : "";
  WARRIOR3D._prompt(E, `<b>${def.name}</b> closes in…`, "");
  WARRIOR3D._updateHud(E);
};

WARRIOR3D._foeTelegraph = function (E) {
  const f = E.foe; if (!f) return;
  f.state = "telegraph";
  f.stateT = 0;
  f.dir = ["high", "mid", "low"][Math.floor(Math.random() * 3)];
  const word = { high: "OVERHEAD", mid: "THRUST", low: "LOW SWEEP" }[f.dir];
  WARRIOR3D._prompt(E, `⚠ ${f.def.name} — <b>${word}</b>! Parry the flash, or block / dodge.`, "warn");
};

/* enemy resolves an unblocked hit on the player */
WARRIOR3D._foeHits = function (E, mult) {
  const f = E.foe; const dmg = Math.max(1, Math.round(f.dmg * (mult == null ? 1 : mult)));
  E.php -= dmg;
  E.hitFlash = 1; E.shake = Math.max(E.shake, 0.5);
  WARRIOR3D._updateHud(E);
  if (E.php <= 0) return WARRIOR3D._end(E, false);
  return dmg;
};

WARRIOR3D._damageFoe = function (E, dmg, spark) {
  const f = E.foe; if (!f || f.dead) return;
  f.hp -= dmg;
  f.hitReact = 1;
  if (spark) WARRIOR3D._spawnSpark(E, f);
  else WARRIOR3D._spawnBlood(E, f);
  WARRIOR3D._updateHud(E);
  if (f.hp <= 0) {
    f.dead = true; f.state = "dead"; f.stateT = 0;
    WARRIOR3D._prompt(E, `<b>${f.def.name} falls.</b>`, "good");
  }
};

/* player actions */
WARRIOR3D._input = function (action) {
  const E = WARRIOR3D._e; if (!E || !E.running || E.ended) return;
  const f = E.foe; if (!f) return;
  E.view.userData.rest;

  if (action === "block") { E.blocking = true; WARRIOR3D._vm(E, "block"); return; }

  if (action === "dodge") {
    if (E.ki >= 3) {
      E.ki -= 3; E.dodgeT = 0.42; E.dodgeDir = Math.random() < 0.5 ? -1 : 1;
      WARRIOR3D._vm(E, "dodge");
      if (f.state === "telegraph") { f.state = "recover"; f.stateT = 0; WARRIOR3D._prompt(E, "💨 You slip aside — untouched.", "good"); E.combo = 0; }
      WARRIOR3D._updateHud(E);
    } else { WARRIOR3D._prompt(E, "Out of stamina to dodge!", "warn"); }
    return;
  }

  if (action === "parry") {
    WARRIOR3D._vm(E, "parry");
    if (f.state === "telegraph") {
      const p = f.stateT / (f.winMs / 1000);
      if (p >= 0.6) {           // perfect flash-parry
        f.state = "stagger"; f.stateT = 0; E.combo++;
        E.shake = Math.max(E.shake, 0.35);
        WARRIOR3D._spawnSpark(E, f);
        const dmg = E.atk + 4;
        WARRIOR3D._damageFoe(E, dmg, true);
        if (!f.dead) WARRIOR3D._prompt(E, `⚔️ <b>Perfect parry!</b> Riposte bites — −${dmg}.`, "good");
      } else {                  // early — partial
        WARRIOR3D._foeHits(E, 0.35); f.state = "recover"; f.stateT = 0; E.combo = 0;
        WARRIOR3D._prompt(E, "Too early — you catch most of it, but it stings.", "warn");
      }
    }
    return;
  }

  if (action === "strike") {
    WARRIOR3D._vm(E, "strike");
    if (f.state === "stagger" || f.state === "open") {
      E.combo++; const dmg = E.atk + 3 + Math.min(5, E.combo);
      WARRIOR3D._damageFoe(E, dmg, false);
      if (!f.dead) WARRIOR3D._prompt(E, `🗡️ You cut into the opening — −${dmg}!`, "good");
    } else if (f.state === "telegraph") {
      // trade
      WARRIOR3D._damageFoe(E, Math.round(E.atk / 2), false);
      WARRIOR3D._foeHits(E, 1); f.state = "recover"; f.stateT = 0; E.combo = 0;
      WARRIOR3D._prompt(E, "You trade blows — you got the worse of it.", "warn");
    } else {
      if (E.ki >= 2) { E.ki -= 2; WARRIOR3D._damageFoe(E, Math.max(1, Math.round(E.atk / 2)), false); WARRIOR3D._updateHud(E); }
    }
    return;
  }
};

WARRIOR3D._release = function (action) {
  const E = WARRIOR3D._e; if (!E) return;
  if (action === "block") { E.blocking = false; if (E.vmClip === "block") WARRIOR3D._vm(E, "idle"); }
};

/* ================================================================== *
 *  MAIN LOOP
 * ================================================================== */
WARRIOR3D._loop = function () {
  const E = WARRIOR3D._e; if (!E || !E.running) return;
  E.raf = requestAnimationFrame(WARRIOR3D._loop);
  const now = (typeof performance !== "undefined" ? performance.now() : Date.now());
  let dt = (now - E.clock) / 1000; E.clock = now;
  if (dt > 0.05) dt = 0.05;                 // clamp big gaps

  // stamina regen
  if (E.ki < E.kiMax) { E.ki = Math.min(E.kiMax, E.ki + dt * 1.4); WARRIOR3D._updateHud(E, true); }

  WARRIOR3D._updateFoe(E, dt);
  WARRIOR3D._updateViewmodel(E, dt);
  WARRIOR3D._updateCamera(E, dt);
  WARRIOR3D._updateParticles(E, dt);

  // decay flashes
  if (E.hitFlash > 0) { E.hitFlash = Math.max(0, E.hitFlash - dt * 3); const fl = document.getElementById("w3-flash"); if (fl) fl.style.opacity = E.hitFlash * 0.55; }

  // animate flags gently
  E.scene.children.forEach(o => { if (o.userData && o.userData.flag) o.rotation.z = Math.sin(now / 500 + o.position.x) * 0.12; });

  E.renderer.render(E.scene, E.camera);
};

WARRIOR3D._updateFoe = function (E, dt) {
  const f = E.foe; if (!f) return;
  f.stateT += dt;
  const m = f.mesh, u = m.userData;
  // hit react decay
  if (f.hitReact > 0) f.hitReact = Math.max(0, f.hitReact - dt * 4);

  if (f.state === "dead") {
    // collapse
    const t = Math.min(1, f.stateT / 0.9);
    m.rotation.x = -t * 1.4; m.position.y = -t * 0.4;
    m.traverse(o => { if (o.material && o.material.transparent !== undefined) { o.material.transparent = true; o.material.opacity = 1 - t; } });
    if (f.stateT > 1.0) {
      E.scene.remove(m);
      E.foe = null;
      if (E.queue.length) setTimeout(() => { if (WARRIOR3D._e === E && E.running) WARRIOR3D._nextEnemy(E); }, 350);
      else WARRIOR3D._end(E, true);
    }
    return;
  }

  // face player, walk-bob
  const dist = Math.hypot(m.position.x - E.camera.position.x, m.position.z - E.camera.position.z);
  const recoil = f.hitReact * 0.25;

  if (f.state === "approach") {
    f.walkPhase += dt * 7;
    if (dist > 2.4) {
      const dx = E.camera.position.x - m.position.x, dz = E.camera.position.z - m.position.z;
      const len = Math.hypot(dx, dz) || 1;
      m.position.x += (dx / len) * dt * 2.0; m.position.z += (dz / len) * dt * 2.0;
      if (u.lLeg) { u.lLeg.rotation.x = Math.sin(f.walkPhase) * 0.6; u.rLeg.rotation.x = -Math.sin(f.walkPhase) * 0.6; }
      if (u.rArm) u.rArm.rotation.x = -0.3 + Math.sin(f.walkPhase) * 0.2;
    } else {
      if (u.lLeg) { u.lLeg.rotation.x *= 0.8; u.rLeg.rotation.x *= 0.8; }
      f.state = "ready"; f.stateT = 0;
    }
  } else if (f.state === "ready") {
    if (u.rArm) u.rArm.rotation.x = -0.3 + Math.sin(E.clock / 300) * 0.08;
    // decide to attack
    const wait = 0.5 + (1 - f.aggr) * 0.9;
    if (f.stateT > wait) {
      if (Math.random() < 0.72) WARRIOR3D._foeTelegraph(E);
      else { f.state = "open"; f.stateT = 0; WARRIOR3D._prompt(E, `${f.def.name} overreaches — an opening! <b>Strike!</b>`, "good"); }
    }
  } else if (f.state === "telegraph") {
    // raise weapon by dir
    if (u.rArm) {
      const p = Math.min(1, f.stateT / (f.winMs / 1000));
      const target = f.dir === "high" ? -2.4 : f.dir === "low" ? 0.7 : -1.2;
      u.rArm.rotation.x = THREE.MathUtils.lerp(-0.3, target, p);
    }
    if (f.stateT >= f.winMs / 1000) {
      // player failed to react — swing connects
      if (E.blocking) { WARRIOR3D._foeHits(E, Math.max(0.15, 0.5 - E.guard * 0.04)); WARRIOR3D._prompt(E, "🛡️ Blocked — you weather it.", ""); }
      else WARRIOR3D._foeHits(E, 1);
      f.state = "swing"; f.stateT = 0; E.combo = 0;
    }
  } else if (f.state === "swing") {
    if (u.rArm) u.rArm.rotation.x = THREE.MathUtils.lerp(u.rArm.rotation.x, 0.6, dt * 12);
    if (f.stateT > 0.18) { f.state = "recover"; f.stateT = 0; }
  } else if (f.state === "stagger") {
    if (u.rArm) u.rArm.rotation.x = THREE.MathUtils.lerp(u.rArm.rotation.x, 0.9, dt * 8);
    u.torso.rotation.x = -0.25;
    if (f.stateT > 0.7) { u.torso.rotation.x = 0; f.state = "recover"; f.stateT = 0; }
  } else if (f.state === "open") {
    u.torso.rotation.x = 0.15;
    if (f.stateT > 1.1) { u.torso.rotation.x = 0; f.state = "ready"; f.stateT = 0; }
  } else if (f.state === "recover") {
    if (u.rArm) u.rArm.rotation.x = THREE.MathUtils.lerp(u.rArm.rotation.x, -0.3, dt * 6);
    if (f.stateT > 0.45) { f.state = "ready"; f.stateT = 0; }
  }

  // apply recoil offset on torso
  if (u.torso && f.state !== "open" && f.state !== "stagger") u.torso.position.z = -recoil;
};

WARRIOR3D._vm = function (E, clip) { E.vmClip = clip; E.vmT = 0; };

WARRIOR3D._updateViewmodel = function (E, dt) {
  const kg = E.view.userData.katana, rest = E.view.userData.rest;
  E.vmT += dt;
  const bob = Math.sin(E.clock / 600) * 0.012, sway = Math.cos(E.clock / 900) * 0.01;
  const set = (px, py, pz, rx, ry, rz) => { kg.position.set(px, py, pz); kg.rotation.set(rx, ry, rz); };
  const R = rest;
  if (E.vmClip === "strike") {
    const t = Math.min(1, E.vmT / 0.28);
    const s = Math.sin(t * Math.PI);
    set(R.pos.x - s * 0.5, R.pos.y + s * 0.34, R.pos.z + s * 0.3, R.rot.x - s * 1.9, R.rot.y - s * 0.6, R.rot.z);
    if (t >= 1) WARRIOR3D._vm(E, "idle");
  } else if (E.vmClip === "parry") {
    const t = Math.min(1, E.vmT / 0.24); const s = Math.sin(t * Math.PI);
    set(R.pos.x - s * 0.18, R.pos.y + s * 0.16, R.pos.z + s * 0.08, R.rot.x - s * 0.5, R.rot.y + s * 0.9, R.rot.z + s * 0.7);
    if (t >= 1) WARRIOR3D._vm(E, E.blocking ? "block" : "idle");
  } else if (E.vmClip === "block") {
    set(R.pos.x - 0.18, R.pos.y + 0.2, R.pos.z + 0.12, R.rot.x - 0.2, R.rot.y + 1.2, -0.5);
  } else if (E.vmClip === "dodge") {
    const t = Math.min(1, E.vmT / 0.42); const s = Math.sin(t * Math.PI);
    set(R.pos.x, R.pos.y - s * 0.12, R.pos.z + s * 0.05, R.rot.x + s * 0.2, R.rot.y, R.rot.z);
    if (t >= 1) WARRIOR3D._vm(E, E.blocking ? "block" : "idle");
  } else { // idle
    set(R.pos.x + sway, R.pos.y + bob, R.pos.z, R.rot.x, R.rot.y, R.rot.z);
  }
};

WARRIOR3D._updateCamera = function (E, dt) {
  const cam = E.camera, f = E.foe;
  // base yaw faces the current foe (lock-on) so combat stays framed
  let baseYaw = 0;
  if (f && f.mesh) baseYaw = Math.atan2(f.mesh.position.x - cam.position.x, -(f.mesh.position.z - cam.position.z)) * -1;
  // ease look offsets back toward 0
  E.yaw += (E.yawTarget - E.yaw) * Math.min(1, dt * 10);
  E.pitch += (E.pitchTarget - E.pitch) * Math.min(1, dt * 10);
  E.yawTarget *= (1 - Math.min(1, dt * 1.5));
  E.pitchTarget *= (1 - Math.min(1, dt * 1.5));
  // dodge strafe
  let strafe = 0, dip = 0;
  if (E.dodgeT > 0) { E.dodgeT = Math.max(0, E.dodgeT - dt); const s = Math.sin((0.42 - E.dodgeT) / 0.42 * Math.PI); strafe = (E.dodgeDir || 1) * s * 0.7; dip = -s * 0.12; }
  // shake
  let sh = 0; if (E.shake > 0) { E.shake = Math.max(0, E.shake - dt * 2.2); sh = E.shake; }
  cam.rotation.set(E.pitch + (Math.random() - 0.5) * sh * 0.04, baseYaw + E.yaw + (Math.random() - 0.5) * sh * 0.04, 0, "YXZ");
  cam.position.x = strafe; cam.position.y = 1.65 + dip;
};

/* ================================================================== *
 *  PARTICLES
 * ================================================================== */
WARRIOR3D._foePoint = function (E, f, up) {
  const p = f.mesh.position.clone(); p.y = up == null ? 1.2 : up; return p;
};
WARRIOR3D._spawnSpark = function (E, f) {
  const p = WARRIOR3D._foePoint(E, f, 1.3);
  for (let i = 0; i < 10; i++) WARRIOR3D._particle(E, p, 0xffe08a, 4 + Math.random() * 4, 0.35);
};
WARRIOR3D._spawnBlood = function (E, f) {
  const p = WARRIOR3D._foePoint(E, f, 1.25);
  for (let i = 0; i < 8; i++) WARRIOR3D._particle(E, p, 0x9a1f14, 2.5 + Math.random() * 3, 0.5);
};
WARRIOR3D._particle = function (E, pos, color, speed, life) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.05), new THREE.MeshBasicMaterial({ color }));
  m.position.copy(pos);
  const dir = new THREE.Vector3((Math.random() - 0.5), Math.random() * 0.9 + 0.2, (Math.random() - 0.5) - 0.3).normalize();
  E.scene.add(m);
  E.particles.push({ m, v: dir.multiplyScalar(speed), life, age: 0 });
};
WARRIOR3D._updateParticles = function (E, dt) {
  for (let i = E.particles.length - 1; i >= 0; i--) {
    const p = E.particles[i]; p.age += dt;
    p.v.y -= dt * 9.8; p.m.position.addScaledVector(p.v, dt);
    if (p.m.position.y < 0.02 || p.age > p.life) { E.scene.remove(p.m); if (p.m.geometry) p.m.geometry.dispose(); if (p.m.material) p.m.material.dispose(); E.particles.splice(i, 1); }
  }
};

/* ================================================================== *
 *  HUD / PROMPTS / CONTROLS
 * ================================================================== */
WARRIOR3D._updateHud = function (E, kiOnly) {
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.style.width = Math.max(0, v) + "%"; };
  set("w3-ki", E.ki / E.kiMax * 100);
  if (kiOnly) return;
  set("w3-hp", E.php / E.phpMax * 100);
  if (E.foe) set("w3-foehp", E.foe.hp / E.foe.hpMax * 100);
};
WARRIOR3D._prompt = function (E, html, cls) {
  const el = document.getElementById("w3-prompt"); if (el) { el.innerHTML = html; el.className = "w3-prompt " + (cls || ""); }
};

WARRIOR3D._bindControls = function (E) {
  const cv = E.renderer.domElement;
  const down = (x, y, id) => { E.dragId = id; E.lastX = x; E.lastY = y; };
  const move = (x, y) => {
    if (E.dragId == null) return;
    E.yawTarget = THREE.MathUtils.clamp(E.yawTarget + (x - E.lastX) * -0.005, -0.7, 0.7);
    E.pitchTarget = THREE.MathUtils.clamp(E.pitchTarget + (y - E.lastY) * -0.004, -0.4, 0.4);
    E.lastX = x; E.lastY = y;
  };
  const up = () => { E.dragId = null; };
  cv.addEventListener("mousedown", e => down(e.clientX, e.clientY, "m"));
  window.addEventListener("mousemove", e => move(e.clientX, e.clientY));
  window.addEventListener("mouseup", up);
  cv.addEventListener("touchstart", e => { const t = e.changedTouches[0]; down(t.clientX, t.clientY, t.identifier); }, { passive: true });
  cv.addEventListener("touchmove", e => { const t = e.changedTouches[0]; move(t.clientX, t.clientY); }, { passive: true });
  cv.addEventListener("touchend", up, { passive: true });

  const bind = (id, action, holdable) => {
    const b = document.getElementById(id); if (!b) return;
    const press = (e) => { e.preventDefault(); WARRIOR3D._input(action); };
    b.addEventListener("touchstart", press, { passive: false });
    b.addEventListener("mousedown", press);
    if (holdable) {
      const rel = () => WARRIOR3D._release(action);
      b.addEventListener("touchend", rel); b.addEventListener("mouseup", rel); b.addEventListener("mouseleave", rel);
    }
  };
  bind("w3-strike", "strike"); bind("w3-parry", "parry"); bind("w3-block", "block", true); bind("w3-dodge", "dodge");

  // keyboard (desktop testing)
  E._key = (e) => {
    if (e.key === "j" || e.key === "J") WARRIOR3D._input("strike");
    else if (e.key === "k" || e.key === "K") WARRIOR3D._input("parry");
    else if (e.key === "l" || e.key === "L") WARRIOR3D._input("block");
    else if (e.key === " ") { e.preventDefault(); WARRIOR3D._input("dodge"); }
  };
  E._keyUp = (e) => { if (e.key === "l" || e.key === "L") WARRIOR3D._release("block"); };
  window.addEventListener("keydown", E._key);
  window.addEventListener("keyup", E._keyUp);
};

WARRIOR3D._end = function (E, won) {
  if (E.ended) return; E.ended = true;
  window.removeEventListener("keydown", E._key);
  window.removeEventListener("keyup", E._keyUp);
  const cb = won ? E.onWin : E.onLose;
  const hp = Math.max(1, Math.round(E.php));
  WARRIOR3D._prompt(E, won ? "🏆 <b>Victory.</b>" : "🩸 <b>You are cut down.</b>", won ? "good" : "warn");
  const ctr = document.querySelector(".w3-controls");
  if (ctr) ctr.innerHTML = `<button class="w3-btn cont" id="w3-cont">Continue →</button>`;
  const b = document.getElementById("w3-cont");
  if (b) b.onclick = () => { WARRIOR3D.stop(); if (cb) cb({ hp, ki: E.ki }); };
  // let the death anim finish rendering a moment, then it's on the button
};

if (typeof module !== "undefined") module.exports = WARRIOR3D;
