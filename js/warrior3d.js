/* =====================================================================
 * warrior3d.js — 3D FIRST-PERSON katana combat for "Way of the Warrior".
 *
 * Clean stylised 3D: the camera is your eyes, your blade (or bow) sits in
 * view, and armoured foes close across an atmospheric battlefield with
 * relief terrain, grass, structures, distant mountains and soft shadows.
 *
 * Full control set — every action is BOTH a key and an on-screen button:
 *   Cut above  ↑ / W        Cut below  ↓ / S
 *   Cut left   ← / A        Cut right  → / D
 *   Stab       E            Parry      J
 *   Block(hold) L / Shift   Dodge      Space
 *   Aim(hold)  Q            Shoot      F
 * Drag / arrow-free-look to look around; lock-on keeps the foe framed.
 *
 * Built on Three.js (vendored locally). If WebGL/THREE is unavailable the
 * caller falls back to the 2D renderer in warrior.js.
 *
 * Public API: available(), startFight({player,enemies,theme,intro,onWin,onLose}), stop()
 * ===================================================================== */

const WARRIOR3D = {};

WARRIOR3D.available = function () {
  if (typeof THREE === "undefined" || typeof document === "undefined") return false;
  try { const c = document.createElement("canvas"); return !!(c.getContext("webgl") || c.getContext("experimental-webgl")); }
  catch (e) { return false; }
};

WARRIOR3D.THEMES = {
  dusk:  { sky: 0xf2a65a, sky2: 0x5a3560, fog: 0xcf8f63, ground: 0x6f5a38, ground2: 0x53412a, sun: 0xffdca6, amb: 0x4a4668, grass: 0x7a6a2e, props: "camp" },
  night: { sky: 0x1b2340, sky2: 0x05070f, fog: 0x121834, ground: 0x2c3140, ground2: 0x20242f, sun: 0xaac0ff, amb: 0x1c2749, grass: 0x2c3a2c, props: "fort" },
  dawn:  { sky: 0xbcd4e6, sky2: 0xf0c0a4, fog: 0xcdd9df, ground: 0x5f6d4c, ground2: 0x49563a, sun: 0xfff1da, amb: 0x6a7789, grass: 0x51713a, props: "shrine" },
  ember: { sky: 0x8a3016, sky2: 0x220a05, fog: 0x7a2e15, ground: 0x4e3826, ground2: 0x3a281a, sun: 0xffb56a, amb: 0x5a2214, grass: 0x5a3a22, props: "village" },
};

/* ------------------------------------------------------------------ */
WARRIOR3D.stop = function () {
  const E = WARRIOR3D._e; if (!E) return;
  E.running = false;
  if (E.raf) cancelAnimationFrame(E.raf);
  window.removeEventListener("resize", E.onResize);
  if (E._key) window.removeEventListener("keydown", E._key);
  if (E._keyUp) window.removeEventListener("keyup", E._keyUp);
  try {
    E.scene.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) { const m = o.material; (Array.isArray(m) ? m : [m]).forEach(x => x && x.dispose && x.dispose()); } });
    E.renderer.dispose();
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

  host.innerHTML = `
    <div class="w3-stage">
      <div class="w3-canvas" id="w3-canvas"></div>
      <div class="w3-vignette"></div>
      <div class="w3-reticle" id="w3-reticle"></div>
      <div class="w3-hud">
        <div class="w3-top">
          <div class="w3-bar you"><label>YOU</label><div class="w3-track"><i id="w3-hp"></i></div><div class="w3-ki"><i id="w3-ki"></i></div></div>
          <div class="w3-mid" id="w3-wave"></div>
          <div class="w3-bar foe"><label id="w3-foename">FOE</label><div class="w3-track"><i id="w3-foehp"></i></div></div>
        </div>
        <div class="w3-prompt" id="w3-prompt">${opts.intro || "Face your enemy."}</div>
        <div class="w3-flash" id="w3-flash"></div>
        <div class="w3-joy" id="w3-joy"><span class="w3-joy-base"></span><span class="w3-joy-knob"></span></div>
        <div class="w3-controls">
          <div class="w3-cluster left">
            <button class="w3-b parry" data-a="parry">⚔️<i>Parry</i></button>
            <button class="w3-b block" data-a="block" data-hold="1">🛡️<i>Block</i></button>
            <button class="w3-b dodge" data-a="dodge">💨<i>Dodge</i></button>
            <button class="w3-b aim" data-a="aim" data-hold="1">🎯<i>Aim</i></button>
            <button class="w3-b shoot" data-a="shoot">🏹<i>Shoot</i></button>
          </div>
          <div class="w3-rosette">
            <button class="w3-b up" data-a="cut_up" title="Cut from above">⤒</button>
            <button class="w3-b left" data-a="cut_left" title="Cut from the left">⇤</button>
            <button class="w3-b stab" data-a="stab" title="Thrust">✦<i>Stab</i></button>
            <button class="w3-b right" data-a="cut_right" title="Cut from the right">⇥</button>
            <button class="w3-b down" data-a="cut_down" title="Rising cut">⤓</button>
          </div>
        </div>
        <div class="w3-hint">Move: left-drag / WASD · Look: right-drag / mouse · Cuts ↑↓←→ · Stab E · Parry J · Block L · Dodge Space · Aim Q · Shoot F</div>
      </div>
    </div>`;

  const mount = document.getElementById("w3-canvas");
  const W = mount.clientWidth || window.innerWidth, H = mount.clientHeight || window.innerHeight;

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(W, H);
  if (renderer.outputEncoding !== undefined) renderer.outputEncoding = THREE.sRGBEncoding;
  if (THREE.ACESFilmicToneMapping) renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  mount.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(theme.fog, 14, 62);

  const camera = new THREE.PerspectiveCamera(72, W / H, 0.1, 260);
  camera.position.set(0, 1.66, 0);

  scene.add(WARRIOR3D._sky(theme));
  WARRIOR3D._sunDisc(scene, theme);
  WARRIOR3D._clouds(scene, theme);

  const hemi = new THREE.HemisphereLight(theme.sky, theme.ground, 0.7); scene.add(hemi);
  const sun = new THREE.DirectionalLight(theme.sun, 1.4);
  sun.position.set(-10, 14, -4); sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.near = 1; sun.shadow.camera.far = 44;
  sun.shadow.camera.left = -11; sun.shadow.camera.right = 11; sun.shadow.camera.top = 11; sun.shadow.camera.bottom = -11;
  sun.shadow.bias = -0.0006; scene.add(sun);
  const rim = new THREE.DirectionalLight(0xffe0b0, 0.55); rim.position.set(7, 5, 9); scene.add(rim);
  scene.add(new THREE.AmbientLight(theme.amb, 0.4));

  WARRIOR3D._terrain(scene, theme);
  WARRIOR3D._grass(scene, theme);
  WARRIOR3D._mountains(scene, theme);
  WARRIOR3D._structures(scene, theme);
  WARRIOR3D._props(scene, theme);

  const view = WARRIOR3D._viewmodel(opts.player);
  camera.add(view); scene.add(camera);

  const E = WARRIOR3D._e = {
    renderer, scene, camera, view, theme, mount,
    W, H, running: true, raf: 0, clock: (typeof performance !== "undefined" ? performance.now() : Date.now()),
    php: opts.player.hp, phpMax: opts.player.maxHp || opts.player.hp,
    ki: opts.player.ki, kiMax: opts.player.maxKi || opts.player.ki,
    atk: opts.player.atk || 6, guard: opts.player.guard || 4,
    queue: (opts.enemies || []).slice(), foe: null, foeIdx: 0, total: (opts.enemies || []).length,
    onWin: opts.onWin, onLose: opts.onLose,
    yaw: 0, pitch: 0, yawTarget: 0, pitchTarget: 0,
    px: 0, pz: 0, km: {}, joy: { active: false, id: null, ox: 0, oy: 0, x: 0, y: 0 },
    vmClip: "idle", vmT: 0, blocking: false, aiming: false, dodgeT: 0, dodgeDir: 1, shake: 0, hitFlash: 0, parryCd: 0,
    fov: 72, fovTarget: 72, combo: 0, ended: false, particles: [], arrows: [],
  };

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

/* ================================================================== *
 *  ENVIRONMENT
 * ================================================================== */
WARRIOR3D._sky = function (theme) {
  const geo = new THREE.SphereGeometry(120, 24, 14);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: { top: { value: new THREE.Color(theme.sky) }, bot: { value: new THREE.Color(theme.sky2) } },
    vertexShader: "varying vec3 vP; void main(){ vP=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}",
    fragmentShader: "varying vec3 vP; uniform vec3 top; uniform vec3 bot; void main(){ float h=clamp(normalize(vP).y*0.5+0.5,0.0,1.0); gl_FragColor=vec4(mix(bot,top,pow(h,0.8)),1.0);}",
  });
  return new THREE.Mesh(geo, mat);
};

WARRIOR3D._sunDisc = function (scene, theme) {
  const g = new THREE.Group();
  const core = new THREE.Mesh(new THREE.CircleGeometry(5, 32), new THREE.MeshBasicMaterial({ color: theme.sun, transparent: true, opacity: 0.95, fog: false }));
  const glow = new THREE.Mesh(new THREE.CircleGeometry(13, 32), new THREE.MeshBasicMaterial({ color: theme.sun, transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, fog: false, depthWrite: false }));
  glow.position.z = -0.1; g.add(glow); g.add(core);
  g.position.set(-26, 10, -80);
  g.lookAt(0, 1.6, 0);
  scene.add(g);
};

WARRIOR3D._clouds = function (scene, theme) {
  const c = document.createElement("canvas"); c.width = 256; c.height = 128;
  const x = c.getContext("2d");
  for (let i = 0; i < 40; i++) { const r = 10 + Math.random() * 30; const gx = Math.random() * 256, gy = 30 + Math.random() * 60;
    const gr = x.createRadialGradient(gx, gy, 0, gx, gy, r); gr.addColorStop(0, "rgba(255,255,255,0.5)"); gr.addColorStop(1, "rgba(255,255,255,0)");
    x.fillStyle = gr; x.beginPath(); x.arc(gx, gy, r, 0, 7); x.fill(); }
  const tex = new THREE.CanvasTexture(c);
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.6, depthWrite: false, fog: false });
  for (let i = 0; i < 4; i++) {
    const pl = new THREE.Mesh(new THREE.PlaneGeometry(70, 30), mat);
    const a = (i / 4) * Math.PI * 2;
    pl.position.set(Math.sin(a) * 70, 26 + Math.random() * 12, -Math.abs(Math.cos(a) * 70) - 10);
    pl.lookAt(0, 20, 0); pl.userData.cloud = 0.4 + Math.random() * 0.5; scene.add(pl);
  }
};

WARRIOR3D._groundTex = function (theme) {
  const c = document.createElement("canvas"); c.width = c.height = 256;
  const x = c.getContext("2d");
  x.fillStyle = "#" + theme.ground.toString(16).padStart(6, "0"); x.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 2600; i++) { x.fillStyle = "rgba(0,0,0," + (Math.random() * 0.16) + ")"; const s = Math.random() * 3 + 1; x.fillRect(Math.random() * 256, Math.random() * 256, s, s); }
  for (let i = 0; i < 600; i++) { x.fillStyle = "rgba(255,240,210," + (Math.random() * 0.06) + ")"; x.fillRect(Math.random() * 256, Math.random() * 256, 2, 2); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(34, 34); return t;
};

/* relief terrain: flat arena in the centre, rolling hills beyond */
WARRIOR3D._terrain = function (scene, theme) {
  const geo = new THREE.PlaneGeometry(220, 220, 72, 72);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i);
    const d = Math.hypot(x, y);
    let h = 0;
    if (d > 14) { const k = Math.min(1, (d - 14) / 30);
      h = (Math.sin(x * 0.12) * Math.cos(y * 0.1) * 1.4 + Math.sin(x * 0.05 + 1.3) * 2.1 + Math.cos(y * 0.07) * 1.6) * k; }
    pos.setZ(i, h);
  }
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ color: theme.ground, roughness: 1, map: WARRIOR3D._groundTex(theme) });
  const m = new THREE.Mesh(geo, mat); m.rotation.x = -Math.PI / 2; m.receiveShadow = true; scene.add(m);
};

WARRIOR3D._grass = function (scene, theme) {
  const blade = new THREE.ConeGeometry(0.03, 0.42, 3);
  const mat = new THREE.MeshStandardMaterial({ color: theme.grass, roughness: 1, flatShading: true });
  const N = 620;
  const inst = new THREE.InstancedMesh(blade, mat, N);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < N; i++) {
    const a = Math.random() * Math.PI * 2, r = 2.5 + Math.random() * 13;
    dummy.position.set(Math.sin(a) * r, 0.2, -Math.abs(Math.cos(a) * r) - 1);
    const s = 0.6 + Math.random() * 0.9; dummy.scale.set(s, s * (0.7 + Math.random() * 0.7), s);
    dummy.rotation.set((Math.random() - 0.5) * 0.3, Math.random() * 3, (Math.random() - 0.5) * 0.3);
    dummy.updateMatrix(); inst.setMatrixAt(i, dummy.matrix);
  }
  scene.add(inst);
};

WARRIOR3D._mountains = function (scene, theme) {
  for (let i = 0; i < 11; i++) {
    const h = 9 + Math.random() * 16;
    const mt = new THREE.Mesh(new THREE.ConeGeometry(8 + Math.random() * 9, h, 4),
      new THREE.MeshStandardMaterial({ color: theme.ground2, roughness: 1, flatShading: true }));
    const a = (i / 11) * Math.PI * 2;
    mt.position.set(Math.sin(a) * (44 + Math.random() * 14), h / 2 - 1.5, -Math.abs(Math.cos(a) * (44 + Math.random() * 16)) - 10);
    mt.rotation.y = Math.random() * 3; scene.add(mt);
  }
};

/* themed set-dressing behind the arena */
WARRIOR3D._structures = function (scene, theme) {
  const wood = new THREE.MeshStandardMaterial({ color: 0x4a3524, roughness: 1 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x2a1f16, roughness: 1 });
  const red = new THREE.MeshStandardMaterial({ color: 0x8f2c1e, roughness: 0.9 });
  const stone = new THREE.MeshStandardMaterial({ color: 0x6a6a62, roughness: 1, flatShading: true });
  const S = (m) => { m.castShadow = true; m.receiveShadow = true; return m; };
  const hut = (x, z, burning) => {
    const g = new THREE.Group();
    const base = S(new THREE.Mesh(new THREE.BoxGeometry(3, 2, 3), wood)); base.position.y = 1; g.add(base);
    const roof = S(new THREE.Mesh(new THREE.ConeGeometry(2.6, 1.5, 4), dark)); roof.position.y = 2.75; roof.rotation.y = Math.PI / 4; g.add(roof);
    if (burning) { const fire = new THREE.PointLight(0xff6a2a, 1.4, 14); fire.position.set(0, 2.4, 0); g.add(fire);
      const gl = new THREE.Mesh(new THREE.SphereGeometry(0.6, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff7a2a, transparent: true, opacity: 0.8, fog: false })); gl.position.y = 2.6; gl.userData.fire = 1; g.add(gl); }
    g.position.set(x, 0, z); scene.add(g);
  };
  const tent = (x, z) => {
    const g = new THREE.Group();
    const body = S(new THREE.Mesh(new THREE.ConeGeometry(1.7, 2.2, 4), new THREE.MeshStandardMaterial({ color: 0x6a5030, roughness: 1 }))); body.position.y = 1.1; body.rotation.y = Math.PI / 4; g.add(body);
    g.position.set(x, 0, z); scene.add(g);
  };
  const torii = (x, z) => {
    const g = new THREE.Group();
    [-1.4, 1.4].forEach(px => { const p = S(new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 5, 10), red)); p.position.set(px, 2.5, 0); g.add(p); });
    const top = S(new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.4, 0.5), red)); top.position.y = 5; g.add(top);
    const top2 = S(new THREE.Mesh(new THREE.BoxGeometry(3.7, 0.28, 0.4), dark)); top2.position.y = 4.4; g.add(top2);
    g.position.set(x, 0, z); scene.add(g);
  };
  const wall = (x, z) => {
    const g = new THREE.Group();
    const w = S(new THREE.Mesh(new THREE.BoxGeometry(9, 3, 0.8), wood)); w.position.y = 1.5; g.add(w);
    for (let i = -4; i <= 4; i += 2) { const spike = S(new THREE.Mesh(new THREE.ConeGeometry(0.25, 0.7, 5), dark)); spike.position.set(i, 3.3, 0); g.add(spike); }
    const torch = new THREE.PointLight(0xffa24a, 1.1, 12); torch.position.set(x < 0 ? 4 : -4, 3, 0.4); g.add(torch);
    const tg = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffb055, fog: false })); tg.position.copy(torch.position); tg.userData.fire = 1; g.add(tg);
    g.position.set(x, 0, z); scene.add(g);
  };
  if (theme.props === "village") { hut(-9, -12, true); hut(8, -15, true); hut(-14, -20, false); }
  else if (theme.props === "camp") { tent(-8, -12); tent(-11, -15); tent(9, -13); }
  else if (theme.props === "shrine") { torii(0, -16); const steps = new THREE.Mesh(new THREE.BoxGeometry(6, 0.5, 3), stone); steps.position.set(0, 0.25, -22); steps.castShadow = true; scene.add(steps); }
  else if (theme.props === "fort") { wall(-6, -16); wall(6, -16); }
};

WARRIOR3D._props = function (scene, theme) {
  const rnd = (a, b) => a + Math.random() * (b - a);
  const S = (m) => { m.castShadow = true; return m; };
  for (let i = 0; i < 22; i++) {
    const ang = rnd(0, Math.PI * 2), dist = rnd(10, 32);
    const x = Math.sin(ang) * dist, z = -Math.abs(Math.cos(ang) * dist) - 4;
    const kind = Math.random();
    if (kind < 0.44) {
      const h = rnd(2.6, 4.6);
      const trunk = S(new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.18, h, 7), new THREE.MeshStandardMaterial({ color: 0x3a2a1a, roughness: 1 })));
      trunk.position.set(x, h / 2, z); scene.add(trunk);
      const leaf = theme.props === "ember" ? 0x5a3a22 : theme.props === "night" ? 0x27331f : 0x3f5b2e;
      for (let k = 0; k < 3; k++) { const r = rnd(0.8, 1.3);
        const can = S(new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), new THREE.MeshStandardMaterial({ color: leaf, roughness: 1, flatShading: true })));
        can.position.set(x + rnd(-0.5, 0.5), h + rnd(-0.2, 0.6), z + rnd(-0.5, 0.5)); can.scale.y = 0.85; scene.add(can); }
    } else if (kind < 0.72) {
      const pole = S(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 4, 6), new THREE.MeshStandardMaterial({ color: 0x2a1f14, roughness: 1 })));
      pole.position.set(x, 2, z); scene.add(pole);
      const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 2.2), new THREE.MeshStandardMaterial({ color: 0x9a2b1e, side: THREE.DoubleSide, roughness: 1 }));
      flag.position.set(x + 0.45, 2.7, z); flag.userData.flag = 1; scene.add(flag);
    } else {
      const r = rnd(0.4, 1.0);
      const rock = S(new THREE.Mesh(new THREE.DodecahedronGeometry(r, 0), new THREE.MeshStandardMaterial({ color: theme.ground2, roughness: 1, flatShading: true })));
      rock.position.set(x, r * 0.45, z); rock.rotation.set(rnd(0, 3), rnd(0, 3), rnd(0, 3)); scene.add(rock);
    }
  }
};

/* ================================================================== *
 *  CHARACTERS
 * ================================================================== */
WARRIOR3D._limb = function (len, rTop, rBot, mat, cap) {
  const g = new THREE.Group();
  const cyl = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, len, 10), mat); cyl.position.y = -len / 2; cyl.castShadow = true; g.add(cyl);
  if (cap) { const c = new THREE.Mesh(new THREE.SphereGeometry(rTop, 12, 8), mat); c.castShadow = true; g.add(c); }
  const end = new THREE.Mesh(new THREE.SphereGeometry(rBot * 1.05, 10, 8), mat); end.position.y = -len; end.castShadow = true; g.add(end);
  return g;
};

WARRIOR3D._foeKatana = function (steel, dark) {
  const g = new THREE.Group();
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.22, 8), dark); grip.rotation.x = Math.PI / 2; grip.position.z = 0.08; g.add(grip);
  const tsuba = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.015, 12), steel); tsuba.rotation.x = Math.PI / 2; tsuba.position.z = -0.03; g.add(tsuba);
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.048, 0.92), steel); blade.position.z = -0.52; blade.castShadow = true; g.add(blade);
  return g;
};

WARRIOR3D._makeFoe = function (def) {
  const g = new THREE.Group();
  const armor = new THREE.MeshStandardMaterial({ color: def.color || 0x8f2c22, roughness: 0.6, metalness: 0.15 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x241c14, roughness: 0.85 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xc99a6f, roughness: 0.75 });
  const steel = new THREE.MeshStandardMaterial({ color: 0xcdd6df, roughness: 0.3, metalness: 0.7 });
  const hipY = 0.92, L = WARRIOR3D._limb;

  const lLeg = L(0.9, 0.13, 0.1, dark, true); lLeg.position.set(-0.17, hipY, 0); g.add(lLeg);
  const rLeg = L(0.9, 0.13, 0.1, dark, true); rLeg.position.set(0.17, hipY, 0); g.add(rLeg);
  [-0.17, 0.17].forEach(x => { const f = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.08, 0.3), dark); f.position.set(x, 0.04, 0.07); f.castShadow = true; g.add(f); });
  const pelvis = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.18, 0.24, 12), dark); pelvis.position.y = hipY + 0.02; pelvis.castShadow = true; g.add(pelvis);

  const torso = new THREE.Group(); torso.position.y = hipY + 0.1; g.add(torso);
  const chest = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.22, 0.56, 12), armor); chest.position.y = 0.3; chest.castShadow = true; torso.add(chest);
  const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.265, 0.265, 0.06, 12), dark); belt.position.y = 0.14; torso.add(belt);
  const sg = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 8), armor); sg.scale.y = 0.65; sg.position.set(-0.28, 0.5, 0); sg.castShadow = true; torso.add(sg);
  const sg2 = sg.clone(); sg2.position.x = 0.28; torso.add(sg2);

  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.1, 8), skin); neck.position.y = 0.62; torso.add(neck);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 16, 12), skin); head.position.y = 0.76; head.scale.z = 1.05; head.castShadow = true; torso.add(head);
  const helm = new THREE.Mesh(new THREE.SphereGeometry(0.175, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.58), dark); helm.position.y = 0.79; helm.castShadow = true; torso.add(helm);
  const crest = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.014, 6, 14, Math.PI), steel); crest.position.set(0, 0.9, 0.03); crest.rotation.x = -0.35; torso.add(crest);
  const menpo = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.09, 0.03), dark); menpo.position.set(0, 0.69, 0.12); torso.add(menpo);

  const lArm = L(0.6, 0.09, 0.07, armor, true); lArm.position.set(-0.28, 0.52, 0); lArm.rotation.z = 0.16; torso.add(lArm);
  const rArm = new THREE.Group(); rArm.position.set(0.28, 0.52, 0); torso.add(rArm);
  rArm.add(L(0.58, 0.09, 0.07, armor, true));
  const katana = WARRIOR3D._foeKatana(steel, dark); katana.position.set(0, -0.58, 0); katana.rotation.x = -0.25; rArm.add(katana);

  const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.5, 20), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.2 }));
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.02; g.add(shadow);

  g.userData = { torso, head, lArm, rArm, lLeg, rLeg, hat: helm };
  return g;
};

/* first-person viewmodel: katana (default) + bow (shown when aiming/shooting) */
WARRIOR3D._viewmodel = function (player) {
  const g = new THREE.Group();
  const skin = new THREE.MeshStandardMaterial({ color: 0xcaa27a, roughness: 0.85 });
  const cloth = new THREE.MeshStandardMaterial({ color: 0x243049, roughness: 1 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x14110c, roughness: 0.9 });
  const gold = new THREE.MeshStandardMaterial({ color: 0x9a7a1c, roughness: 0.4, metalness: 0.7 });
  const steel = new THREE.MeshStandardMaterial({ color: 0xe9eef4, roughness: 0.13, metalness: 0.92 });

  // katana
  const kg = new THREE.Group();
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.023, 0.026, 0.24, 10), dark); grip.rotation.x = Math.PI / 2; grip.position.z = 0.11; kg.add(grip);
  const hand = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 10), skin); hand.scale.set(1, 0.85, 1.25); hand.position.z = 0.06; kg.add(hand);
  const tsuba = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.014, 16), gold); tsuba.rotation.x = Math.PI / 2; tsuba.position.z = -0.02; kg.add(tsuba);
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.052, 1.22), steel); blade.position.z = -0.65; blade.castShadow = true; kg.add(blade);
  const edge = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.055, 1.16), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.25, metalness: 0.5 })); edge.position.set(0.011, 0, -0.64); kg.add(edge);
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.026, 0.12, 4), steel); tip.rotation.x = -Math.PI / 2; tip.position.z = -1.27; kg.add(tip);
  kg.position.set(0.26, -0.34, -0.72); kg.rotation.set(-0.78, 0.34, -0.12); g.add(kg);
  const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.065, 0.46, 8), cloth); arm.position.set(0.42, -0.66, -0.4); arm.rotation.set(-0.95, -0.25, 0.2); g.add(arm);

  // bow (hidden until aim/shoot) — a proper vertical bow held out in the
  // left hand, body bladed to the target; string+arrow drawn back to the eye.
  const bg = new THREE.Group();
  const bwood = new THREE.MeshStandardMaterial({ color: 0x6a4423, roughness: 0.7 });
  const bwood2 = new THREE.MeshStandardMaterial({ color: 0x452c17, roughness: 0.7 });
  const strMat = new THREE.MeshBasicMaterial({ color: 0xe8e4d0 });
  const riser = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.32, 0.08), bwood2); bg.add(riser);
  const bgrip = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.14, 8), bwood2); bg.add(bgrip);
  // limbs curving forward, top & bottom
  [[1, 0.3, 0.5, 0.34], [1, 0.56, 0.95, 0.22], [-1, 0.3, -0.5, 0.34], [-1, 0.56, -0.95, 0.22]].forEach(([s, y, rx, len]) => {
    const lb = new THREE.Mesh(new THREE.BoxGeometry(0.032, len, 0.05), bwood);
    lb.position.set(0, s * y, -0.06 - (Math.abs(rx) > 0.6 ? 0.14 : 0)); lb.rotation.x = rx; bg.add(lb);
  });
  const bhand = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), skin); bhand.scale.set(1, 1.2, 1); bg.add(bhand);
  // draw group: string + nocked arrow (slides back toward the eye when drawn)
  const draw = new THREE.Group(); bg.add(draw);
  const strand = (ax, ay, az) => { const a = new THREE.Vector3(ax, ay, az), b = new THREE.Vector3(0, 0, 0);
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, a.distanceTo(b), 4), strMat);
    m.position.copy(a.clone().add(b).multiplyScalar(0.5)); m.lookAt(b); m.rotateX(Math.PI / 2); return m; };
  draw.add(strand(0, 0.66, -0.34)); draw.add(strand(0, -0.66, -0.34));
  const arrow = new THREE.Mesh(new THREE.CylinderGeometry(0.0075, 0.0075, 1.4, 5), new THREE.MeshStandardMaterial({ color: 0x7a5a2e, roughness: 0.8 }));
  arrow.rotation.x = Math.PI / 2; arrow.position.set(0, 0, -0.62); draw.add(arrow);
  const head = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.07, 6), steel); head.rotation.x = -Math.PI / 2; head.position.set(0, 0, -1.34); draw.add(head);
  const fletch = new THREE.Mesh(new THREE.BoxGeometry(0.002, 0.055, 0.09), new THREE.MeshBasicMaterial({ color: 0xb43a2a })); fletch.position.set(0, 0, 0.06); draw.add(fletch);
  // bow-arm reaching up from lower-left to the grip (suggests the bladed body)
  const barm = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.062, 0.62, 8), cloth); barm.position.set(-0.3, -0.52, 0.3); barm.rotation.set(-1.05, 0.35, -0.25); bg.add(barm);
  bg.position.set(-0.06, -0.16, -0.92); bg.rotation.set(0.06, 0.16, 0.13); bg.scale.setScalar(0.82);
  bg.visible = false; g.add(bg);

  g.userData = { katana: kg, bow: bg, bowDraw: draw, arm, rest: { pos: kg.position.clone(), rot: kg.rotation.clone() } };
  return g;
};

/* ================================================================== *
 *  ENEMY LIFECYCLE + FSM
 * ================================================================== */
WARRIOR3D._nextEnemy = function (E) {
  const def = E.queue.shift();
  if (!def) return WARRIOR3D._end(E, true);
  E.foeIdx++;
  const mesh = WARRIOR3D._makeFoe(def);
  const ang = (Math.random() - 0.5) * 0.5;
  mesh.position.set(Math.sin(ang) * 8, 0, -10); mesh.rotation.y = Math.PI;
  E.scene.add(mesh);
  E.foe = { def, mesh, hp: def.hp, hpMax: def.hp, dmg: def.dmg, skill: def.skill || 0.7, aggr: def.aggr || 0.6,
    state: "approach", stateT: 0, dir: null, winMs: Math.max(410, 1040 - (def.skill || 0.7) * 640), walkPhase: 0, dead: false, hitReact: 0, openSide: null };
  const nm = document.getElementById("w3-foename"); if (nm) nm.textContent = def.name;
  const wv = document.getElementById("w3-wave"); if (wv) wv.textContent = E.total > 1 ? `${E.foeIdx} / ${E.total}` : "";
  WARRIOR3D._prompt(E, `<b>${def.name}</b> closes in… <span class="w3-dim">shoot while you can</span>`, "");
  WARRIOR3D._updateHud(E);
};

WARRIOR3D._foeTelegraph = function (E) {
  const f = E.foe; if (!f) return;
  f.state = "telegraph"; f.stateT = 0;
  f.dir = ["high", "mid", "low", "side"][Math.floor(Math.random() * 4)];
  const word = { high: "OVERHEAD", mid: "THRUST", low: "LOW SWEEP", side: "SIDE CUT" }[f.dir];
  WARRIOR3D._prompt(E, `⚠ ${f.def.name} — <b>${word}</b>! Parry the flash · Block · or Dodge.`, "warn");
};

WARRIOR3D._foeHits = function (E, mult) {
  const f = E.foe; const dmg = Math.max(1, Math.round(f.dmg * (mult == null ? 1 : mult)));
  E.php -= dmg; E.hitFlash = 1; E.shake = Math.max(E.shake, 0.55);
  WARRIOR3D._updateHud(E);
  if (E.php <= 0) return WARRIOR3D._end(E, false);
  return dmg;
};

WARRIOR3D._damageFoe = function (E, dmg, spark) {
  const f = E.foe; if (!f || f.dead) return;
  f.hp -= dmg; f.hitReact = 1;
  if (spark) WARRIOR3D._spawnSpark(E, f); else WARRIOR3D._spawnBlood(E, f);
  WARRIOR3D._updateHud(E);
  if (f.hp <= 0) { f.dead = true; f.state = "dead"; f.stateT = 0; WARRIOR3D._prompt(E, `<b>${f.def.name} falls.</b>`, "good"); }
};

/* ================================================================== *
 *  INPUT — every action (keys + buttons)
 * ================================================================== */
WARRIOR3D.CUTS = { cut_up: { word: "overhead cut", side: "high" }, cut_down: { word: "rising cut", side: "low" }, cut_left: { word: "cut from the left", side: "side" }, cut_right: { word: "cut from the right", side: "side" }, stab: { word: "thrust", side: "mid", stab: true } };

WARRIOR3D._input = function (action) {
  const E = WARRIOR3D._e; if (!E || !E.running || E.ended) return;
  const f = E.foe; if (!f) return;

  if (action === "block") { E.blocking = true; WARRIOR3D._vm(E, "block"); return; }
  if (action === "aim") { E.aiming = true; E.fovTarget = 54; WARRIOR3D._vm(E, "aim"); const rt = document.getElementById("w3-reticle"); if (rt) rt.classList.add("on"); return; }

  if (action === "shoot") {
    const cost = E.aiming ? 3 : 2;
    if (E.ki < cost) { WARRIOR3D._prompt(E, "Out of stamina to shoot.", "warn"); return; }
    E.ki -= cost; WARRIOR3D._vm(E, "shoot");
    const dmg = E.aiming ? (E.atk + 3) : (Math.round(E.atk / 2) + 1);
    WARRIOR3D._fireArrow(E, dmg);
    WARRIOR3D._updateHud(E, true);
    return;
  }

  if (action === "dodge") {
    if (E.ki >= 3) { E.ki -= 3; E.dodgeT = 0.42; E.dodgeDir = Math.random() < 0.5 ? -1 : 1; WARRIOR3D._vm(E, "dodge");
      if (f.state === "telegraph") { f.state = "recover"; f.stateT = 0; WARRIOR3D._prompt(E, "💨 You slip aside — untouched.", "good"); E.combo = 0; }
      WARRIOR3D._updateHud(E, true);
    } else WARRIOR3D._prompt(E, "Out of stamina to dodge!", "warn");
    return;
  }

  if (action === "parry") {
    if (E.parryCd > 0) { WARRIOR3D._prompt(E, "Blade out of line — you can't parry yet.", "warn"); return; }  // no spam
    WARRIOR3D._vm(E, "parry"); E.parryCd = 0.5;
    if (f.state === "telegraph") {
      const p = f.stateT / (f.winMs / 1000);
      if (p >= 0.72) { f.state = "stagger"; f.stateT = 0; f.openSide = f.dir; E.combo++; E.shake = Math.max(E.shake, 0.35); E.parryCd = 0.12;
        WARRIOR3D._spawnSpark(E, f); const d = E.atk + 4; WARRIOR3D._damageFoe(E, d, true);
        if (!f.dead) WARRIOR3D._prompt(E, `⚔️ <b>Perfect parry!</b> Riposte bites — −${d}. Now strike the opening!`, "good"); }
      else { WARRIOR3D._foeHits(E, 0.4); f.state = "recover"; f.stateT = 0; E.combo = 0; WARRIOR3D._prompt(E, "Mistimed — the blow gets through.", "warn"); }
    }
    return;
  }

  // directional cuts + stab
  const cut = WARRIOR3D.CUTS[action];
  if (cut) {
    WARRIOR3D._vm(E, action);
    if (f.state === "stagger" || f.state === "open") {
      E.combo++;
      let d = E.atk + 3 + Math.min(5, E.combo) + (cut.stab ? 2 : 0);
      if (f.openSide && (f.openSide === cut.side)) d += 2;              // hit the exposed line
      WARRIOR3D._damageFoe(E, d, false);
      if (!f.dead) WARRIOR3D._prompt(E, `🗡️ ${cut.word} into the gap — <b>−${d}</b>!`, "good");
    } else if (f.state === "telegraph") {
      WARRIOR3D._damageFoe(E, Math.round(E.atk / 2), false); WARRIOR3D._foeHits(E, 1); f.state = "recover"; f.stateT = 0; E.combo = 0;
      WARRIOR3D._prompt(E, "You trade blows — you got the worse of it.", "warn");
    } else {
      if (E.ki >= 2) { E.ki -= 2; WARRIOR3D._damageFoe(E, Math.max(1, Math.round(E.atk / 2)), false); WARRIOR3D._updateHud(E, true); }
    }
    return;
  }
};

WARRIOR3D._release = function (action) {
  const E = WARRIOR3D._e; if (!E) return;
  if (action === "block") { E.blocking = false; if (E.vmClip === "block") WARRIOR3D._vm(E, "idle"); }
  if (action === "aim") { E.aiming = false; E.fovTarget = 72; const rt = document.getElementById("w3-reticle"); if (rt) rt.classList.remove("on"); if (E.vmClip === "aim") WARRIOR3D._vm(E, "idle"); }
};

WARRIOR3D._fireArrow = function (E, dmg) {
  const from = new THREE.Vector3(); E.camera.getWorldPosition(from); from.y -= 0.15;
  const f = E.foe; const to = f ? f.mesh.position.clone().setY(1.3) : from.clone().add(new THREE.Vector3(0, 0, -8));
  const arrow = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.7, 5), new THREE.MeshStandardMaterial({ color: 0x6a4a26 }));
  arrow.position.copy(from); arrow.lookAt(to); arrow.rotateX(Math.PI / 2);
  E.scene.add(arrow);
  const dir = to.clone().sub(from).normalize();
  E.arrows.push({ m: arrow, v: dir.multiplyScalar(46), dmg, life: 0 });
};

/* ================================================================== *
 *  MAIN LOOP
 * ================================================================== */
WARRIOR3D._loop = function () {
  const E = WARRIOR3D._e; if (!E || !E.running) return;
  E.raf = requestAnimationFrame(WARRIOR3D._loop);
  const now = (typeof performance !== "undefined" ? performance.now() : Date.now());
  let dt = (now - E.clock) / 1000; E.clock = now; if (dt > 0.05) dt = 0.05;

  if (E.ki < E.kiMax) { E.ki = Math.min(E.kiMax, E.ki + dt * 1.4); WARRIOR3D._updateHud(E, true); }
  if (E.parryCd > 0) E.parryCd = Math.max(0, E.parryCd - dt);

  WARRIOR3D._updateFoe(E, dt);
  WARRIOR3D._updateViewmodel(E, dt);
  WARRIOR3D._updateCamera(E, dt);
  WARRIOR3D._updateParticles(E, dt);
  WARRIOR3D._updateArrows(E, dt);

  if (E.hitFlash > 0) { E.hitFlash = Math.max(0, E.hitFlash - dt * 3); const fl = document.getElementById("w3-flash"); if (fl) fl.style.opacity = E.hitFlash * 0.5; }
  E.scene.children.forEach(o => { if (o.userData && o.userData.flag) o.rotation.z = Math.sin(now / 500 + o.position.x) * 0.12; if (o.userData && o.userData.fire) { o.scale.setScalar(0.9 + Math.sin(now / 90 + o.position.x) * 0.14); } });

  E.renderer.render(E.scene, E.camera);
};

WARRIOR3D._updateFoe = function (E, dt) {
  const f = E.foe; if (!f) return;
  f.stateT += dt; const m = f.mesh, u = m.userData;
  if (f.hitReact > 0) f.hitReact = Math.max(0, f.hitReact - dt * 4);

  if (f.state === "dead") {
    const t = Math.min(1, f.stateT / 0.9);
    m.rotation.x = -t * 1.4; m.position.y = -t * 0.4;
    m.traverse(o => { if (o.material && "opacity" in o.material) { o.material.transparent = true; o.material.opacity = 1 - t; } });
    if (f.stateT > 1.0) { E.scene.remove(m); E.foe = null;
      if (E.queue.length) setTimeout(() => { if (WARRIOR3D._e === E && E.running) WARRIOR3D._nextEnemy(E); }, 350);
      else WARRIOR3D._end(E, true); }
    return;
  }

  const dist = Math.hypot(m.position.x - E.camera.position.x, m.position.z - E.camera.position.z);
  const recoil = f.hitReact * 0.25;

  // give chase if the player has moved out of reach
  if ((f.state === "ready" || f.state === "recover") && dist > 3.3) { f.state = "approach"; f.stateT = 0; }

  if (f.state === "approach") {
    f.walkPhase += dt * 7;
    if (dist > 2.5) { const dx = E.camera.position.x - m.position.x, dz = E.camera.position.z - m.position.z; const len = Math.hypot(dx, dz) || 1;
      m.position.x += (dx / len) * dt * 1.9; m.position.z += (dz / len) * dt * 1.9;
      if (u.lLeg) { u.lLeg.rotation.x = Math.sin(f.walkPhase) * 0.6; u.rLeg.rotation.x = -Math.sin(f.walkPhase) * 0.6; }
      if (u.rArm) u.rArm.rotation.x = -0.3 + Math.sin(f.walkPhase) * 0.2;
      m.position.y = Math.abs(Math.sin(f.walkPhase)) * 0.04;
    } else { if (u.lLeg) { u.lLeg.rotation.x *= 0.8; u.rLeg.rotation.x *= 0.8; } m.position.y = 0; f.state = "ready"; f.stateT = 0; }
  } else if (f.state === "ready") {
    if (u.rArm) u.rArm.rotation.x = -0.3 + Math.sin(E.clock / 300) * 0.08;
    const wait = 0.26 + (1 - f.aggr) * 0.5;
    if (f.stateT > wait) { if (Math.random() < 0.9) WARRIOR3D._foeTelegraph(E); else { f.state = "open"; f.stateT = 0; f.openSide = ["high", "mid", "low", "side"][Math.floor(Math.random() * 4)];
      WARRIOR3D._prompt(E, `${f.def.name} overreaches — an opening! <b>Cut or Stab!</b>`, "good"); } }
  } else if (f.state === "telegraph") {
    if (u.rArm) { const p = Math.min(1, f.stateT / (f.winMs / 1000)); const target = f.dir === "high" ? -2.4 : f.dir === "low" ? 0.7 : f.dir === "side" ? -1.0 : -1.3;
      u.rArm.rotation.x = THREE.MathUtils.lerp(-0.3, target, p); if (f.dir === "side" && u.torso) u.torso.rotation.z = THREE.MathUtils.lerp(0, 0.5, p); }
    if (f.stateT >= f.winMs / 1000) {
      if (E.blocking) { WARRIOR3D._foeHits(E, Math.max(0.15, 0.5 - E.guard * 0.04)); WARRIOR3D._prompt(E, "🛡️ Blocked — you weather it.", ""); }
      else WARRIOR3D._foeHits(E, 1);
      if (u.torso) u.torso.rotation.z = 0; f.state = "swing"; f.stateT = 0; E.combo = 0;
    }
  } else if (f.state === "swing") {
    if (u.rArm) u.rArm.rotation.x = THREE.MathUtils.lerp(u.rArm.rotation.x, 0.6, dt * 12);
    if (f.stateT > 0.18) { f.state = "recover"; f.stateT = 0; }
  } else if (f.state === "stagger") {
    if (u.rArm) u.rArm.rotation.x = THREE.MathUtils.lerp(u.rArm.rotation.x, 0.9, dt * 8); if (u.torso) u.torso.rotation.x = -0.25;
    if (f.stateT > 0.7) { if (u.torso) u.torso.rotation.x = 0; f.state = "recover"; f.stateT = 0; f.openSide = null; }
  } else if (f.state === "open") {
    if (u.torso) u.torso.rotation.x = 0.15;
    if (f.stateT > 0.8) { if (u.torso) u.torso.rotation.x = 0; f.state = "ready"; f.stateT = 0; f.openSide = null; }
  } else if (f.state === "recover") {
    if (u.rArm) u.rArm.rotation.x = THREE.MathUtils.lerp(u.rArm.rotation.x, -0.3, dt * 6);
    // aggressive foes chain a fast follow-up instead of resetting — punishes button-mashing
    if (f.stateT > 0.28) { if (dist < 3.0 && Math.random() < f.aggr * 0.5) WARRIOR3D._foeTelegraph(E); else { f.state = "ready"; f.stateT = 0; } }
  }
  if (u.torso && f.state !== "open" && f.state !== "stagger") u.torso.position.z = -recoil;
};

/* per-attack viewmodel animation */
WARRIOR3D.SWING = {
  cut_up:    { dp: [-0.15, 0.34, 0.30], dr: [-2.0, -0.5, 0.0], dur: 0.30 },
  cut_down:  { dp: [-0.10, -0.30, 0.26], dr: [1.5, 0.3, 0.0], dur: 0.30 },
  cut_left:  { dp: [-0.58, 0.12, 0.20], dr: [-0.3, 1.5, -1.3], dur: 0.28 },
  cut_right: { dp: [0.34, 0.12, 0.20], dr: [-0.3, -1.5, 1.3], dur: 0.28 },
  stab:      { dp: [-0.10, -0.04, 0.62], dr: [-0.2, 0.1, 0.0], dur: 0.26 },
  parry:     { dp: [-0.18, 0.16, 0.08], dr: [-0.5, 0.9, 0.7], dur: 0.22 },
};
WARRIOR3D._vm = function (E, clip) { E.vmClip = clip; E.vmT = 0; };
WARRIOR3D._updateViewmodel = function (E, dt) {
  const V = E.view.userData, kg = V.katana, R = V.rest, bow = V.bow; E.vmT += dt;
  const bob = Math.sin(E.clock / 600) * 0.012, sway = Math.cos(E.clock / 900) * 0.01;
  const showBow = (E.vmClip === "aim" || E.vmClip === "shoot");
  kg.visible = !showBow; bow.visible = showBow;
  const set = (px, py, pz, rx, ry, rz) => { kg.position.set(px, py, pz); kg.rotation.set(rx, ry, rz); };

  if (showBow) {
    const d = V.bowDraw;
    if (E.vmClip === "aim") { d.position.z = THREE.MathUtils.lerp(d.position.z, 0.24, dt * 9); }   // draw the string back
    else { const t = Math.min(1, E.vmT / 0.16); d.position.z = THREE.MathUtils.lerp(0.24, 0, t); if (t >= 1) WARRIOR3D._vm(E, E.aiming ? "aim" : "idle"); }  // loose
    return;
  }
  const sw = WARRIOR3D.SWING[E.vmClip];
  if (sw) {
    const t = Math.min(1, E.vmT / sw.dur), s = Math.sin(t * Math.PI);
    set(R.pos.x + sw.dp[0] * s, R.pos.y + sw.dp[1] * s, R.pos.z + sw.dp[2] * s, R.rot.x + sw.dr[0] * s, R.rot.y + sw.dr[1] * s, R.rot.z + sw.dr[2] * s);
    if (t >= 1) WARRIOR3D._vm(E, E.blocking ? "block" : "idle");
  } else if (E.vmClip === "block") {
    set(R.pos.x - 0.2, R.pos.y + 0.24, R.pos.z + 0.14, R.rot.x - 0.2, R.rot.y + 1.25, -0.5);
  } else if (E.vmClip === "dodge") {
    const t = Math.min(1, E.vmT / 0.42), s = Math.sin(t * Math.PI);
    set(R.pos.x, R.pos.y - s * 0.14, R.pos.z + s * 0.05, R.rot.x + s * 0.2, R.rot.y, R.rot.z);
    if (t >= 1) WARRIOR3D._vm(E, E.blocking ? "block" : "idle");
  } else {
    set(R.pos.x + sway, R.pos.y + bob, R.pos.z, R.rot.x, R.rot.y, R.rot.z);
  }
};

WARRIOR3D._updateCamera = function (E, dt) {
  const cam = E.camera, f = E.foe;
  let baseYaw = 0;
  if (f && f.mesh) baseYaw = -Math.atan2(f.mesh.position.x - E.px, -(f.mesh.position.z - E.pz));
  E.yaw += (E.yawTarget - E.yaw) * Math.min(1, dt * 10);
  E.pitch += (E.pitchTarget - E.pitch) * Math.min(1, dt * 10);
  E.yawTarget *= (1 - Math.min(1, dt * 1.5)); E.pitchTarget *= (1 - Math.min(1, dt * 1.5));
  const camYaw = baseYaw + E.yaw;

  // movement (WASD or left-stick), relative to facing
  let mx = (E.km.d ? 1 : 0) - (E.km.a ? 1 : 0), my = (E.km.w ? 1 : 0) - (E.km.s ? 1 : 0);
  if (E.joy.active) { mx = E.joy.x; my = E.joy.y; }
  const ml = Math.hypot(mx, my); if (ml > 1) { mx /= ml; my /= ml; }
  if (mx || my) {
    const spd = 3.5;
    const fwdX = -Math.sin(camYaw), fwdZ = -Math.cos(camYaw), rgtX = Math.cos(camYaw), rgtZ = -Math.sin(camYaw);
    E.px += (rgtX * mx + fwdX * my) * spd * dt; E.pz += (rgtZ * mx + fwdZ * my) * spd * dt;
    const r = Math.hypot(E.px, E.pz); if (r > 12) { E.px *= 12 / r; E.pz *= 12 / r; }   // stay on the flat arena
  }
  // don't walk through the foe
  if (f && f.mesh && !f.dead) { const dx = E.px - f.mesh.position.x, dz = E.pz - f.mesh.position.z; const d = Math.hypot(dx, dz) || 1;
    if (d < 1.5) { E.px = f.mesh.position.x + dx / d * 1.5; E.pz = f.mesh.position.z + dz / d * 1.5; } }

  let strafe = 0, dip = 0;
  if (E.dodgeT > 0) { E.dodgeT = Math.max(0, E.dodgeT - dt); const s = Math.sin((0.42 - E.dodgeT) / 0.42 * Math.PI); strafe = (E.dodgeDir || 1) * s * 0.7; dip = -s * 0.12; }
  let sh = 0; if (E.shake > 0) { E.shake = Math.max(0, E.shake - dt * 2.2); sh = E.shake; }
  E.fov += (E.fovTarget - E.fov) * Math.min(1, dt * 8); cam.fov = E.fov; cam.updateProjectionMatrix();
  cam.rotation.set(E.pitch + (Math.random() - 0.5) * sh * 0.04, camYaw + (Math.random() - 0.5) * sh * 0.04, 0, "YXZ");
  // dodge strafe is relative to facing
  const rgtX = Math.cos(camYaw), rgtZ = -Math.sin(camYaw);
  cam.position.set(E.px + rgtX * strafe, 1.66 + dip, E.pz + rgtZ * strafe);
};

/* ================================================================== *
 *  PARTICLES + ARROWS
 * ================================================================== */
WARRIOR3D._foePoint = function (E, f, up) { const p = f.mesh.position.clone(); p.y = up == null ? 1.2 : up; return p; };
WARRIOR3D._spawnSpark = function (E, f) { const p = WARRIOR3D._foePoint(E, f, 1.4); for (let i = 0; i < 12; i++) WARRIOR3D._particle(E, p, 0xffe08a, 4 + Math.random() * 4, 0.35); };
WARRIOR3D._spawnBlood = function (E, f) { const p = WARRIOR3D._foePoint(E, f, 1.3); for (let i = 0; i < 9; i++) WARRIOR3D._particle(E, p, 0x9a1f14, 2.5 + Math.random() * 3, 0.5); };
WARRIOR3D._particle = function (E, pos, color, speed, life) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.05), new THREE.MeshBasicMaterial({ color })); m.position.copy(pos);
  const dir = new THREE.Vector3((Math.random() - 0.5), Math.random() * 0.9 + 0.2, (Math.random() - 0.5) - 0.3).normalize();
  E.scene.add(m); E.particles.push({ m, v: dir.multiplyScalar(speed), life, age: 0 });
};
WARRIOR3D._updateParticles = function (E, dt) {
  for (let i = E.particles.length - 1; i >= 0; i--) { const p = E.particles[i]; p.age += dt; p.v.y -= dt * 9.8; p.m.position.addScaledVector(p.v, dt);
    if (p.m.position.y < 0.02 || p.age > p.life) { E.scene.remove(p.m); if (p.m.geometry) p.m.geometry.dispose(); if (p.m.material) p.m.material.dispose(); E.particles.splice(i, 1); } }
};
WARRIOR3D._updateArrows = function (E, dt) {
  for (let i = E.arrows.length - 1; i >= 0; i--) { const a = E.arrows[i]; a.life += dt; a.m.position.addScaledVector(a.v, dt);
    const f = E.foe; let hit = false;
    if (f && !f.dead) { const d = Math.hypot(a.m.position.x - f.mesh.position.x, a.m.position.z - f.mesh.position.z); if (d < 0.7 && a.m.position.y > 0.4 && a.m.position.y < 2) hit = true; }
    if (hit) { WARRIOR3D._damageFoe(E, a.dmg, false); if (!f.dead) WARRIOR3D._prompt(E, `🏹 Your arrow strikes — <b>−${a.dmg}</b>.`, "good"); }
    if (hit || a.life > 1.4 || a.m.position.y < 0.02) { E.scene.remove(a.m); if (a.m.geometry) a.m.geometry.dispose(); if (a.m.material) a.m.material.dispose(); E.arrows.splice(i, 1); }
  }
};

/* ================================================================== *
 *  HUD / CONTROLS
 * ================================================================== */
WARRIOR3D._updateHud = function (E, kiOnly) {
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.style.width = Math.max(0, v) + "%"; };
  set("w3-ki", E.ki / E.kiMax * 100); if (kiOnly) return;
  set("w3-hp", E.php / E.phpMax * 100); if (E.foe) set("w3-foehp", E.foe.hp / E.foe.hpMax * 100);
};
WARRIOR3D._prompt = function (E, html, cls) { const el = document.getElementById("w3-prompt"); if (el) { el.innerHTML = html; el.className = "w3-prompt " + (cls || ""); } };

WARRIOR3D._bindControls = function (E) {
  const cv = E.renderer.domElement;
  // Left half of the screen = MOVE stick; right half = LOOK (change view).
  const joyEl = document.getElementById("w3-joy"), knob = joyEl && joyEl.querySelector(".w3-joy-knob");
  const R = 56, halfW = () => (E.mount.clientWidth || window.innerWidth) * 0.5;
  const look = E.look = { active: false, id: null, lx: 0, ly: 0 };
  const startMove = (x, y, id) => { E.joy.active = true; E.joy.id = id; E.joy.ox = x; E.joy.oy = y; E.joy.x = 0; E.joy.y = 0;
    if (joyEl) { joyEl.style.left = x + "px"; joyEl.style.top = y + "px"; joyEl.classList.add("on"); if (knob) knob.style.transform = "translate(-50%,-50%)"; } };
  const doMove = (x, y) => { let dx = x - E.joy.ox, dy = y - E.joy.oy; const d = Math.hypot(dx, dy); if (d > R) { dx *= R / d; dy *= R / d; }
    E.joy.x = dx / R; E.joy.y = -dy / R; if (knob) knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`; };
  const endMove = () => { E.joy.active = false; E.joy.x = 0; E.joy.y = 0; if (joyEl) joyEl.classList.remove("on"); };
  const start = (x, y, id) => { if (x < halfW()) startMove(x, y, id); else { look.active = true; look.id = id; look.lx = x; look.ly = y; } };
  const moveTo = (x, y, id) => {
    if (E.joy.active && E.joy.id === id) doMove(x, y);
    else if (look.active && look.id === id) {
      E.yawTarget = THREE.MathUtils.clamp(E.yawTarget + (x - look.lx) * -0.006, -1.4, 1.4);
      E.pitchTarget = THREE.MathUtils.clamp(E.pitchTarget + (y - look.ly) * -0.005, -0.5, 0.5);
      look.lx = x; look.ly = y;
    } };
  const end = (id) => { if (E.joy.id === id) endMove(); if (look.id === id) look.active = false; };
  cv.addEventListener("mousedown", e => start(e.clientX, e.clientY, "m"));
  window.addEventListener("mousemove", e => moveTo(e.clientX, e.clientY, "m"));
  window.addEventListener("mouseup", () => end("m"));
  cv.addEventListener("touchstart", e => { for (const t of e.changedTouches) start(t.clientX, t.clientY, t.identifier); }, { passive: true });
  cv.addEventListener("touchmove", e => { for (const t of e.changedTouches) moveTo(t.clientX, t.clientY, t.identifier); }, { passive: true });
  cv.addEventListener("touchend", e => { for (const t of e.changedTouches) end(t.identifier); }, { passive: true });

  document.querySelectorAll("#warrior-screen .w3-b").forEach(b => {
    const action = b.dataset.a, hold = b.dataset.hold;
    const press = (e) => { e.preventDefault(); e.stopPropagation(); WARRIOR3D._input(action); };
    b.addEventListener("touchstart", press, { passive: false });
    b.addEventListener("mousedown", press);
    if (hold) { const rel = () => WARRIOR3D._release(action); b.addEventListener("touchend", rel); b.addEventListener("mouseup", rel); b.addEventListener("mouseleave", rel); }
  });

  const KEY = { arrowup: "cut_up", arrowdown: "cut_down", arrowleft: "cut_left", arrowright: "cut_right", e: "stab", j: "parry", " ": "dodge", f: "shoot" };
  const HOLD = { l: "block", shift: "block", q: "aim" };
  const MOVE = { w: "w", a: "a", s: "s", d: "d" };
  E._key = (e) => { const k = e.key.toLowerCase();
    if (MOVE[k]) { E.km[k] = 1; e.preventDefault(); return; }
    if (HOLD[k]) { e.preventDefault(); if (!E["_h" + k]) { E["_h" + k] = 1; WARRIOR3D._input(HOLD[k]); } return; }
    if (KEY[k]) { e.preventDefault(); WARRIOR3D._input(KEY[k]); } };
  E._keyUp = (e) => { const k = e.key.toLowerCase(); if (MOVE[k]) E.km[k] = 0; if (HOLD[k]) { E["_h" + k] = 0; WARRIOR3D._release(HOLD[k]); } };
  window.addEventListener("keydown", E._key); window.addEventListener("keyup", E._keyUp);
};

WARRIOR3D._end = function (E, won) {
  if (E.ended) return; E.ended = true;
  window.removeEventListener("keydown", E._key); window.removeEventListener("keyup", E._keyUp);
  const cb = won ? E.onWin : E.onLose; const hp = Math.max(1, Math.round(E.php));
  WARRIOR3D._prompt(E, won ? "🏆 <b>Victory.</b>" : "🩸 <b>You are cut down.</b>", won ? "good" : "warn");
  const ctr = document.querySelector("#warrior-screen .w3-controls");
  if (ctr) ctr.innerHTML = `<button class="w3-b cont" id="w3-cont">Continue →</button>`;
  const rt = document.getElementById("w3-reticle"); if (rt) rt.classList.remove("on");
  const b = document.getElementById("w3-cont"); if (b) b.onclick = () => { WARRIOR3D.stop(); if (cb) cb({ hp, ki: E.ki }); };
};

if (typeof module !== "undefined") module.exports = WARRIOR3D;
