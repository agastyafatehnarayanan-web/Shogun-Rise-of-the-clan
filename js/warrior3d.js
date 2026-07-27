/* =====================================================================
 * warrior3d.js — "Way of the Warrior: Rise to Daimyō"
 * A CONTINUOUS first-person 3D world. You never leave your own eyes:
 * story shows as a bubble at the top, you WALK to glowing markers to
 * trigger the next beat, fights happen in the world, and you eat / rest /
 * sleep at camps to heal and grow — all the way to becoming daimyō.
 *
 * SKILL COMBAT (no spam): read the enemy's wind-up DIRECTION and parry in
 * that direction (overhead→↑, thrust→E, left→←, right→→, low→↓) inside a
 * tight window. Wrong direction or bad timing → you're hit. Every action
 * spends STAMINA; run out and you're winded, wide open.
 *
 * Built on Three.js (vendored). The story is an async "director" script in
 * warrior.js driving the promise-based API below.
 *
 * API: available(), enter({player,onExit}), leave(),
 *      say(text,opts)->Promise, goto(x,z,label)->Promise,
 *      fight(defs,opts)->Promise<won>, banner(text), objective(text),
 *      setTheme(name), heal(n), addMaxHp(n), stats()
 * ===================================================================== */

const WARRIOR3D = {};

WARRIOR3D.available = function () {
  if (typeof THREE === "undefined" || typeof document === "undefined") return false;
  try { const c = document.createElement("canvas"); return !!(c.getContext("webgl") || c.getContext("experimental-webgl")); }
  catch (e) { return false; }
};

/* earthy, natural palettes (times of day) */
WARRIOR3D.THEMES = {
  day:   { sky: 0x7fa8d0, sky2: 0xdfe9ee, fog: 0xbcd0da, ground: 0x6d7742, ground2: 0x53602f, sun: 0xfff4d8, amb: 0x9aa7b3, grass: 0x5d7a34, props: "field" },
  dawn:  { sky: 0x9fb6cc, sky2: 0xe7cca6, fog: 0xccd3cf, ground: 0x66714a, ground2: 0x4d5636, sun: 0xffe6bf, amb: 0x8b93a0, grass: 0x5e7538, props: "village" },
  dusk:  { sky: 0x74809c, sky2: 0xcaa078, fog: 0xa9a596, ground: 0x606845, ground2: 0x484f31, sun: 0xffd9a4, amb: 0x6f7486, grass: 0x556b34, props: "camp" },
  night: { sky: 0x18202f, sky2: 0x090d16, fog: 0x131a26, ground: 0x333c2d, ground2: 0x262d22, sun: 0x9fb2d6, amb: 0x2a3346, grass: 0x33452b, props: "forest" },
};

WARRIOR3D.leave = function () {
  const E = WARRIOR3D._e; if (!E) return;
  E.running = false; E.epoch++;
  if (E.raf) cancelAnimationFrame(E.raf);
  window.removeEventListener("resize", E.onResize);
  if (E._key) window.removeEventListener("keydown", E._key);
  if (E._keyUp) window.removeEventListener("keyup", E._keyUp);
  try {
    E.scene.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) { const m = o.material; (Array.isArray(m) ? m : [m]).forEach(x => x && x.dispose && x.dispose()); } });
    E.renderer.dispose();
    const cv = E.renderer.domElement; if (cv && cv.parentNode) cv.parentNode.removeChild(cv);
  } catch (e) {}
  const cb = E.onExit; WARRIOR3D._e = null; if (cb) cb();
};

/* ================================================================== *
 *  ENTER — build the persistent world once
 * ================================================================== */
WARRIOR3D.enter = function (opts) {
  WARRIOR3D.leave();
  const host = document.getElementById("warrior-screen"); if (!host) return;
  const p = opts.player || {};
  host.innerHTML = `
    <div class="w3-stage">
      <div class="w3-canvas" id="w3-canvas"></div>
      <div class="w3-vignette"></div>
      <div class="w3-reticle" id="w3-reticle"></div>
      <div class="w3-obj" id="w3-obj"></div>
      <button class="w3-exit" id="w3-exit" title="Leave to menu">☰</button>
      <div class="w3-banner" id="w3-banner"></div>
      <div class="w3-bubble" id="w3-bubble"><b class="who" id="w3-who"></b><div class="txt" id="w3-btext"></div><div class="cho" id="w3-choices"></div><div class="cont" id="w3-cont">▼ tap / space</div></div>
      <div class="w3-hud">
        <div class="w3-meters" id="w3-meters">
          <div class="w3-m hp"><label>Vitality</label><div class="w3-track"><i id="w3-hp"></i></div></div>
          <div class="w3-m st"><label>Stamina</label><div class="w3-track"><i id="w3-st"></i></div></div>
          <div class="w3-m sm"><label>Food</label><div class="w3-track"><i id="w3-food"></i></div></div>
          <div class="w3-m sm"><label>Rest</label><div class="w3-track"><i id="w3-rest"></i></div></div>
        </div>
        <div class="w3-foe" id="w3-foewrap"><label id="w3-foename">FOE</label><div class="w3-track foe"><i id="w3-foehp"></i></div></div>
        <div class="w3-incoming" id="w3-incoming"></div>
        <div class="w3-prompt" id="w3-prompt"></div>
        <div class="w3-flash" id="w3-flash"></div>
        <div class="w3-joy" id="w3-joy"><span class="w3-joy-base"></span><span class="w3-joy-knob"></span></div>
        <div class="w3-controls" id="w3-controls">
          <div class="w3-cluster left">
            <button class="w3-b block" data-a="block" data-hold="1">🛡️<i>Block</i></button>
            <button class="w3-b dodge" data-a="dodge">💨<i>Dodge</i></button>
            <button class="w3-b aim" data-a="aim" data-hold="1">🎯<i>Aim</i></button>
            <button class="w3-b shoot" data-a="shoot">🏹<i>Shoot</i></button>
          </div>
          <div class="w3-rosette">
            <button class="w3-b up" data-a="dir_up" title="parry/cut high">⤒</button>
            <button class="w3-b left" data-a="dir_left" title="parry/cut left">⇤</button>
            <button class="w3-b stab" data-a="dir_thrust" title="parry/thrust">✦</button>
            <button class="w3-b right" data-a="dir_right" title="parry/cut right">⇥</button>
            <button class="w3-b down" data-a="dir_down" title="parry/cut low">⤓</button>
          </div>
        </div>
        <div class="w3-hint" id="w3-hint">Move: left-drag/WASD · Look: right-drag/mouse · Parry the shown direction · Dodge Space · Block L · Aim Q · Shoot F</div>
      </div>
    </div>`;

  const mount = document.getElementById("w3-canvas");
  const W = mount.clientWidth || window.innerWidth, H = mount.clientHeight || window.innerHeight;
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(W, H);
  if (renderer.outputEncoding !== undefined) renderer.outputEncoding = THREE.sRGBEncoding;
  if (THREE.ACESFilmicToneMapping) renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.02;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  mount.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(72, W / H, 0.1, 320);
  camera.position.set(0, 1.66, 0);
  const view = WARRIOR3D._viewmodel(p); camera.add(view); scene.add(camera);

  const E = WARRIOR3D._e = {
    renderer, scene, camera, view, mount, W, H, running: true, raf: 0, epoch: 0,
    clock: (typeof performance !== "undefined" ? performance.now() : Date.now()),
    onExit: opts.onExit,
    dress: [],                 // scene-dressing objects (removed on setTheme)
    // survival + combat stats
    maxHp: p.maxHp || 40, hp: p.hp || p.maxHp || 40,
    maxSt: p.maxSt || 12, st: p.maxSt || 12,
    food: p.food != null ? p.food : 80, rest: p.rest != null ? p.rest : 80,
    atk: p.atk || 6, guard: p.guard || 4, sp: p.sp != null ? p.sp : 1,
    unit: p.unit || "samurai",
    // world / director
    mode: "explore", foe: null, queue: [], waypoint: null, fightRes: null, onContinue: null, tutorial: false,
    // input
    px: 0, pz: 0, km: {}, joy: { active: false, id: null, ox: 0, oy: 0, x: 0, y: 0 }, look: { active: false, id: null, lx: 0, ly: 0 },
    viewYaw: 0, viewPitch: 0,
    vmClip: "idle", vmT: 0, blocking: false, aiming: false, aimT: 0, dodgeT: 0, dodgeDir: 1, shake: 0, hitFlash: 0,
    winded: 0, vulnT: 0, combo: 0, fov: 72, fovTarget: 72, quiver: 6,
    particles: [], arrows: [],
  };

  WARRIOR3D.setTheme(opts.theme || "day");
  WARRIOR3D._bindControls(E);
  E.onResize = () => { if (!WARRIOR3D._e) return; const w = mount.clientWidth || window.innerWidth, h = mount.clientHeight || window.innerHeight;
    E.W = w; E.H = h; camera.aspect = w / h; camera.updateProjectionMatrix(); renderer.setSize(w, h); };
  window.addEventListener("resize", E.onResize);
  WARRIOR3D._updateMeters(E);
  WARRIOR3D._loop();
};

/* ---- scene dressing (rebuilt on theme change) ---- */
WARRIOR3D.setTheme = function (name) {
  const E = WARRIOR3D._e; if (!E) return;
  const theme = WARRIOR3D.THEMES[name] || WARRIOR3D.THEMES.day;
  E.theme = theme; E.themeName = name;
  E.dress.forEach(o => { E.scene.remove(o); o.traverse && o.traverse(x => { if (x.geometry) x.geometry.dispose(); }); });
  E.dress = [];
  const add = (o) => { E.dress.push(o); E.scene.add(o); return o; };
  E.scene.fog = new THREE.Fog(theme.fog, 16, 78);
  add(WARRIOR3D._sky(theme));
  WARRIOR3D._sunDisc(E, theme, add); WARRIOR3D._clouds(E, theme, add);
  // lights
  const hemi = new THREE.HemisphereLight(theme.sky, theme.ground, 0.75); add(hemi);
  const sun = new THREE.DirectionalLight(theme.sun, 1.25); sun.position.set(-10, 15, -4); sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024); sun.shadow.camera.near = 1; sun.shadow.camera.far = 46;
  sun.shadow.camera.left = -12; sun.shadow.camera.right = 12; sun.shadow.camera.top = 12; sun.shadow.camera.bottom = -12; sun.shadow.bias = -0.0006; add(sun);
  add(new THREE.DirectionalLight(0xffe9c8, 0.4).translateX(8).translateY(5).translateZ(9));
  add(new THREE.AmbientLight(theme.amb, 0.42));
  WARRIOR3D._terrain(E, theme, add); WARRIOR3D._grass(E, theme, add);
  WARRIOR3D._mountains(E, theme, add); WARRIOR3D._structures(E, theme, add); WARRIOR3D._props(E, theme, add);
};

/* ================================================================== *
 *  ENVIRONMENT BUILDERS
 * ================================================================== */
WARRIOR3D._sky = function (theme) {
  const geo = new THREE.SphereGeometry(150, 24, 14);
  const mat = new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false,
    uniforms: { top: { value: new THREE.Color(theme.sky) }, bot: { value: new THREE.Color(theme.sky2) } },
    vertexShader: "varying vec3 vP; void main(){ vP=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}",
    fragmentShader: "varying vec3 vP; uniform vec3 top; uniform vec3 bot; void main(){ float h=clamp(normalize(vP).y*0.5+0.5,0.0,1.0); gl_FragColor=vec4(mix(bot,top,pow(h,0.8)),1.0);}" });
  return new THREE.Mesh(geo, mat);
};
WARRIOR3D._sunDisc = function (E, theme, add) {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.CircleGeometry(5, 32), new THREE.MeshBasicMaterial({ color: theme.sun, transparent: true, opacity: 0.9, fog: false })));
  const glow = new THREE.Mesh(new THREE.CircleGeometry(12, 32), new THREE.MeshBasicMaterial({ color: theme.sun, transparent: true, opacity: 0.2, blending: THREE.AdditiveBlending, fog: false, depthWrite: false }));
  glow.position.z = -0.1; g.add(glow); g.position.set(-30, 22, -90); g.lookAt(0, 1.6, 0); add(g);
};
WARRIOR3D._clouds = function (E, theme, add) {
  const c = document.createElement("canvas"); c.width = 256; c.height = 128; const x = c.getContext("2d");
  for (let i = 0; i < 40; i++) { const r = 10 + Math.random() * 30, gx = Math.random() * 256, gy = 30 + Math.random() * 60;
    const gr = x.createRadialGradient(gx, gy, 0, gx, gy, r); gr.addColorStop(0, "rgba(255,255,255,0.55)"); gr.addColorStop(1, "rgba(255,255,255,0)");
    x.fillStyle = gr; x.beginPath(); x.arc(gx, gy, r, 0, 7); x.fill(); }
  const tex = new THREE.CanvasTexture(c); const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.55, depthWrite: false, fog: false });
  for (let i = 0; i < 4; i++) { const pl = new THREE.Mesh(new THREE.PlaneGeometry(80, 34), mat); const a = (i / 4) * Math.PI * 2;
    pl.position.set(Math.sin(a) * 80, 30 + Math.random() * 14, -Math.abs(Math.cos(a) * 80) - 12); pl.lookAt(0, 22, 0); add(pl); }
};
WARRIOR3D._groundTex = function (theme) {
  const c = document.createElement("canvas"); c.width = c.height = 256; const x = c.getContext("2d");
  x.fillStyle = "#" + theme.ground.toString(16).padStart(6, "0"); x.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 2600; i++) { x.fillStyle = "rgba(0,0,0," + (Math.random() * 0.14) + ")"; const s = Math.random() * 3 + 1; x.fillRect(Math.random() * 256, Math.random() * 256, s, s); }
  for (let i = 0; i < 700; i++) { x.fillStyle = "rgba(120,150,70," + (Math.random() * 0.10) + ")"; x.fillRect(Math.random() * 256, Math.random() * 256, 2, 3); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(36, 36); return t;
};
WARRIOR3D._terrain = function (E, theme, add) {
  const geo = new THREE.PlaneGeometry(240, 240, 72, 72), pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) { const x = pos.getX(i), y = pos.getY(i), d = Math.hypot(x, y); let h = 0;
    if (d > 15) { const k = Math.min(1, (d - 15) / 34); h = (Math.sin(x * 0.11) * Math.cos(y * 0.09) * 1.5 + Math.sin(x * 0.05 + 1.3) * 2.3 + Math.cos(y * 0.07) * 1.7) * k; }
    pos.setZ(i, h); }
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: theme.ground, roughness: 1, map: WARRIOR3D._groundTex(theme) }));
  m.rotation.x = -Math.PI / 2; m.receiveShadow = true; add(m);
};
WARRIOR3D._grass = function (E, theme, add) {
  const inst = new THREE.InstancedMesh(new THREE.ConeGeometry(0.03, 0.44, 3), new THREE.MeshStandardMaterial({ color: theme.grass, roughness: 1, flatShading: true }), 640);
  const d = new THREE.Object3D();
  for (let i = 0; i < 640; i++) { const a = Math.random() * Math.PI * 2, r = 2.5 + Math.random() * 13.5;
    d.position.set(Math.sin(a) * r, 0.2, -Math.abs(Math.cos(a) * r) - 1); const s = 0.6 + Math.random() * 0.9;
    d.scale.set(s, s * (0.7 + Math.random() * 0.7), s); d.rotation.set((Math.random() - 0.5) * 0.3, Math.random() * 3, (Math.random() - 0.5) * 0.3);
    d.updateMatrix(); inst.setMatrixAt(i, d.matrix); }
  add(inst);
};
WARRIOR3D._mountains = function (E, theme, add) {
  for (let i = 0; i < 11; i++) { const h = 10 + Math.random() * 18;
    const mt = new THREE.Mesh(new THREE.ConeGeometry(9 + Math.random() * 10, h, 4), new THREE.MeshStandardMaterial({ color: theme.ground2, roughness: 1, flatShading: true }));
    const a = (i / 11) * Math.PI * 2; mt.position.set(Math.sin(a) * (48 + Math.random() * 16), h / 2 - 1.5, -Math.abs(Math.cos(a) * (48 + Math.random() * 18)) - 12); mt.rotation.y = Math.random() * 3; add(mt); }
};
WARRIOR3D._structures = function (E, theme, add) {
  const wood = new THREE.MeshStandardMaterial({ color: 0x6a5334, roughness: 1 }), dark = new THREE.MeshStandardMaterial({ color: 0x3a2c1c, roughness: 1 });
  const red = new THREE.MeshStandardMaterial({ color: 0x9a4030, roughness: 0.9 }), stone = new THREE.MeshStandardMaterial({ color: 0x8a8a80, roughness: 1, flatShading: true });
  const S = (m) => { m.castShadow = true; m.receiveShadow = true; return m; };
  const hut = (x, z) => { const g = new THREE.Group(); const b = S(new THREE.Mesh(new THREE.BoxGeometry(3, 2, 3), wood)); b.position.y = 1; g.add(b);
    const r = S(new THREE.Mesh(new THREE.ConeGeometry(2.6, 1.4, 4), dark)); r.position.y = 2.7; r.rotation.y = Math.PI / 4; g.add(r); g.position.set(x, 0, z); add(g); };
  const tent = (x, z) => { const b = S(new THREE.Mesh(new THREE.ConeGeometry(1.7, 2.2, 4), new THREE.MeshStandardMaterial({ color: 0x7a6440, roughness: 1 }))); b.position.set(x, 1.1, z); b.rotation.y = Math.PI / 4; add(b); };
  const torii = (x, z) => { const g = new THREE.Group(); [-1.4, 1.4].forEach(px => { const p = S(new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 5, 10), red)); p.position.set(px, 2.5, 0); g.add(p); });
    const t = S(new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.4, 0.5), red)); t.position.y = 5; g.add(t); g.position.set(x, 0, z); add(g); };
  if (theme.props === "village") { hut(-10, -13); hut(9, -16); hut(-15, -22); }
  else if (theme.props === "camp") { tent(-8, -12); tent(-11, -15); tent(9, -13); }
  else if (theme.props === "forest") { for (let i = 0; i < 5; i++) { const s = S(new THREE.Mesh(new THREE.DodecahedronGeometry(0.8 + Math.random(), 0), stone)); s.position.set((Math.random() - 0.5) * 24, 0.5, -8 - Math.random() * 18); add(s); } }
  else { torii(0, -20); }
};
WARRIOR3D._props = function (E, theme, add) {
  const rnd = (a, b) => a + Math.random() * (b - a), S = (m) => { m.castShadow = true; return m; };
  for (let i = 0; i < 22; i++) { const ang = rnd(0, Math.PI * 2), dist = rnd(10, 34); const x = Math.sin(ang) * dist, z = -Math.abs(Math.cos(ang) * dist) - 4; const k = Math.random();
    if (k < 0.5) { const h = rnd(2.6, 4.8); const tr = S(new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.18, h, 7), new THREE.MeshStandardMaterial({ color: 0x4a3420, roughness: 1 }))); tr.position.set(x, h / 2, z); add(tr);
      const leaf = theme.props === "night" || theme.props === "forest" ? 0x2c3f24 : 0x40602e;
      for (let j = 0; j < 3; j++) { const r = rnd(0.8, 1.3); const cn = S(new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), new THREE.MeshStandardMaterial({ color: leaf, roughness: 1, flatShading: true }))); cn.position.set(x + rnd(-0.5, 0.5), h + rnd(-0.2, 0.6), z + rnd(-0.5, 0.5)); cn.scale.y = 0.85; add(cn); } }
    else { const r = rnd(0.4, 1.0); const rk = S(new THREE.Mesh(new THREE.DodecahedronGeometry(r, 0), new THREE.MeshStandardMaterial({ color: theme.ground2, roughness: 1, flatShading: true }))); rk.position.set(x, r * 0.45, z); rk.rotation.set(rnd(0, 3), rnd(0, 3), rnd(0, 3)); add(rk); } }
};

/* ================================================================== *
 *  CHARACTER + VIEWMODEL BUILDERS
 * ================================================================== */
WARRIOR3D._m = function (geo, mat, pos, rot) { const m = new THREE.Mesh(geo, mat); if (pos) m.position.set(pos[0], pos[1], pos[2]); if (rot) m.rotation.set(rot[0], rot[1], rot[2]); return m; };
WARRIOR3D._limb = function (len, rTop, rBot, mat, cap) {
  const g = new THREE.Group();
  const cyl = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, len, 10), mat); cyl.position.y = -len / 2; cyl.castShadow = true; g.add(cyl);
  if (cap) { const c = new THREE.Mesh(new THREE.SphereGeometry(rTop, 12, 8), mat); c.castShadow = true; g.add(c); }
  const end = new THREE.Mesh(new THREE.SphereGeometry(rBot * 1.05, 10, 8), mat); end.position.y = -len; end.castShadow = true; g.add(end);
  return g;
};
WARRIOR3D._makeFoe = function (def) {
  const g = new THREE.Group();
  const armor = new THREE.MeshStandardMaterial({ color: def.color || 0x5a6a4a, roughness: 0.7, metalness: 0.12 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x2a241a, roughness: 0.85 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xc99a6f, roughness: 0.75 });
  const steel = new THREE.MeshStandardMaterial({ color: 0xc7d0d8, roughness: 0.32, metalness: 0.7 });
  const hipY = 0.92, L = WARRIOR3D._limb;
  const lLeg = L(0.9, 0.13, 0.1, dark, true); lLeg.position.set(-0.17, hipY, 0); g.add(lLeg);
  const rLeg = L(0.9, 0.13, 0.1, dark, true); rLeg.position.set(0.17, hipY, 0); g.add(rLeg);
  [-0.17, 0.17].forEach(x => { const f = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.08, 0.3), dark); f.position.set(x, 0.04, 0.07); f.castShadow = true; g.add(f); });
  g.add(WARRIOR3D._m(new THREE.CylinderGeometry(0.2, 0.18, 0.24, 12), dark, [0, hipY + 0.02, 0]));
  const torso = new THREE.Group(); torso.position.y = hipY + 0.1; g.add(torso);
  const chest = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.22, 0.56, 12), armor); chest.position.y = 0.3; chest.castShadow = true; torso.add(chest);
  const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.265, 0.265, 0.06, 12), dark); belt.position.y = 0.14; torso.add(belt);
  const sg = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 8), armor); sg.scale.y = 0.65; sg.position.set(-0.28, 0.5, 0); sg.castShadow = true; torso.add(sg);
  const sg2 = sg.clone(); sg2.position.x = 0.28; torso.add(sg2);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 16, 12), skin); head.position.y = 0.76; head.castShadow = true; torso.add(head);
  const helm = new THREE.Mesh(new THREE.SphereGeometry(0.175, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.58), dark); helm.position.y = 0.79; helm.castShadow = true; torso.add(helm);
  const crest = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.014, 6, 14, Math.PI), steel); crest.position.set(0, 0.9, 0.03); crest.rotation.x = -0.35; torso.add(crest);
  torso.add(WARRIOR3D._m(new THREE.BoxGeometry(0.17, 0.09, 0.03), dark, [0, 0.69, 0.12]));
  const lArm = L(0.6, 0.09, 0.07, armor, true); lArm.position.set(-0.28, 0.52, 0); lArm.rotation.z = 0.16; torso.add(lArm);
  const rArm = new THREE.Group(); rArm.position.set(0.28, 0.52, 0); torso.add(rArm); rArm.add(L(0.58, 0.09, 0.07, armor, true));
  const kat = new THREE.Group(); kat.add(WARRIOR3D._m(new THREE.CylinderGeometry(0.024, 0.024, 0.22, 8), dark, [0, 0, 0.08], [Math.PI / 2, 0, 0]));
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.048, 0.92), steel); blade.position.z = -0.52; blade.castShadow = true; kat.add(blade); kat.position.set(0, -0.58, 0); kat.rotation.x = -0.25; rArm.add(kat);
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.5, 20), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.2 })); shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.02; g.add(shadow);
  g.userData = { torso, head, lArm, rArm, lLeg, rLeg };
  return g;
};
WARRIOR3D._viewmodel = function (p) {
  const g = new THREE.Group();
  const skin = new THREE.MeshStandardMaterial({ color: 0xcaa27a, roughness: 0.85 }), cloth = new THREE.MeshStandardMaterial({ color: 0x384a34, roughness: 1 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x14110c, roughness: 0.9 }), gold = new THREE.MeshStandardMaterial({ color: 0x9a7a1c, roughness: 0.4, metalness: 0.7 });
  const steel = new THREE.MeshStandardMaterial({ color: 0xe9eef4, roughness: 0.13, metalness: 0.92 });
  const kg = new THREE.Group();
  kg.add(WARRIOR3D._m(new THREE.CylinderGeometry(0.023, 0.026, 0.24, 10), dark, [0, 0, 0.11], [Math.PI / 2, 0, 0]));
  const hand = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 10), skin); hand.scale.set(1, 0.85, 1.25); hand.position.z = 0.06; kg.add(hand);
  kg.add(WARRIOR3D._m(new THREE.CylinderGeometry(0.055, 0.055, 0.014, 16), gold, [0, 0, -0.02], [Math.PI / 2, 0, 0]));
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.052, 1.22), steel); blade.position.z = -0.65; blade.castShadow = true; kg.add(blade);
  kg.add(WARRIOR3D._m(new THREE.ConeGeometry(0.026, 0.12, 4), steel, [0, 0, -1.27], [-Math.PI / 2, 0, 0]));
  kg.position.set(0.26, -0.34, -0.72); kg.rotation.set(-0.78, 0.34, -0.12); g.add(kg);
  g.add(WARRIOR3D._m(new THREE.CylinderGeometry(0.055, 0.065, 0.46, 8), cloth, [0.42, -0.66, -0.4], [-0.95, -0.25, 0.2]));
  // bow
  const bg = new THREE.Group();
  const bwood = new THREE.MeshStandardMaterial({ color: 0x6a4423, roughness: 0.7 });
  bg.add(new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.32, 0.08), new THREE.MeshStandardMaterial({ color: 0x452c17, roughness: 0.7 })));
  [[1, 0.3, 0.5, 0.34], [1, 0.56, 0.95, 0.22], [-1, 0.3, -0.5, 0.34], [-1, 0.56, -0.95, 0.22]].forEach(([s, y, rx, len]) => { const lb = new THREE.Mesh(new THREE.BoxGeometry(0.032, len, 0.05), bwood); lb.position.set(0, s * y, -0.06 - (Math.abs(rx) > 0.6 ? 0.14 : 0)); lb.rotation.x = rx; bg.add(lb); });
  const draw = new THREE.Group(); bg.add(draw);
  const strMat = new THREE.MeshBasicMaterial({ color: 0xe8e4d0 });
  const strand = (ax, ay, az) => { const a = new THREE.Vector3(ax, ay, az), b = new THREE.Vector3(0, 0, 0); const m = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, a.distanceTo(b), 4), strMat); m.position.copy(a.clone().add(b).multiplyScalar(0.5)); m.lookAt(b); m.rotateX(Math.PI / 2); return m; };
  draw.add(strand(0, 0.66, -0.34)); draw.add(strand(0, -0.66, -0.34));
  draw.add(WARRIOR3D._m(new THREE.CylinderGeometry(0.0075, 0.0075, 1.4, 5), new THREE.MeshStandardMaterial({ color: 0x7a5a2e }), [0, 0, -0.62], [Math.PI / 2, 0, 0]));
  draw.add(WARRIOR3D._m(new THREE.BoxGeometry(0.002, 0.055, 0.09), new THREE.MeshBasicMaterial({ color: 0xb43a2a }), [0, 0, 0.06]));
  bg.position.set(-0.06, -0.16, -0.92); bg.rotation.set(0.06, 0.16, 0.13); bg.scale.setScalar(0.82); bg.visible = false; g.add(bg);
  g.userData = { katana: kg, bow: bg, bowDraw: draw, rest: { pos: kg.position.clone(), rot: kg.rotation.clone() } };
  return g;
};

/* ================================================================== *
 *  DIRECTOR API (promise-based) — the story script calls these
 * ================================================================== */
WARRIOR3D._bubble = function () { return document.getElementById("w3-bubble"); };
WARRIOR3D.say = function (text, opts) {
  opts = opts || {}; const E = WARRIOR3D._e; if (!E) return Promise.resolve(true);
  return new Promise(resolve => {
    const b = WARRIOR3D._bubble(); if (!b) return resolve(true);
    document.getElementById("w3-who").textContent = opts.who || "";
    document.getElementById("w3-who").style.display = opts.who ? "" : "none";
    document.getElementById("w3-btext").innerHTML = text;
    const ch = document.getElementById("w3-choices"), cont = document.getElementById("w3-cont");
    ch.innerHTML = ""; b.classList.add("on"); b.classList.toggle("big", !!opts.big);
    if (opts.choices && opts.choices.length) {
      cont.style.display = "none";
      opts.choices.forEach((c, i) => { const btn = document.createElement("button"); btn.className = "w3-choice"; btn.innerHTML = c;
        btn.onclick = () => { b.classList.remove("on"); E.onContinue = null; resolve(i); }; ch.appendChild(btn); });
    } else {
      cont.style.display = ""; E.onContinue = () => { b.classList.remove("on"); E.onContinue = null; resolve(true); };
    }
  });
};
WARRIOR3D.banner = function (text, ms) {
  const el = document.getElementById("w3-banner"); if (!el) return; el.innerHTML = text; el.classList.add("on");
  clearTimeout(WARRIOR3D._bnT); WARRIOR3D._bnT = setTimeout(() => el.classList.remove("on"), ms || 2600);
};
WARRIOR3D.objective = function (text) { const el = document.getElementById("w3-obj"); if (el) el.innerHTML = text ? `🎯 ${text}` : ""; };
WARRIOR3D.goto = function (x, z, label) {
  const E = WARRIOR3D._e; if (!E) return Promise.resolve();
  return new Promise(resolve => {
    const mk = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.7, 0.95, 28), new THREE.MeshBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.85, side: THREE.DoubleSide, fog: false }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.06; mk.add(ring);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 6, 12, 1, true), new THREE.MeshBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.28, side: THREE.DoubleSide, fog: false, depthWrite: false }));
    beam.position.y = 3; mk.add(beam);
    mk.position.set(x, 0, z); E.scene.add(mk);
    E.waypoint = { x, z, r: 1.9, mk, resolve, label: label || "" };
    WARRIOR3D._prompt(E, `↳ walk to <b>${label || "the marker"}</b>`, "");
  });
};
WARRIOR3D.fight = function (defs, opts) {
  opts = opts || {}; const E = WARRIOR3D._e; if (!E) return Promise.resolve(true);
  return new Promise(resolve => {
    E.mode = "fight"; E.tutorial = !!opts.tutorial; E.queue = defs.slice(); E.foe = null; E.combo = 0; E.quiver = 6; E.fightRes = resolve;
    document.getElementById("w3-foewrap").classList.add("on");
    WARRIOR3D._nextFoe(E);
  });
};
WARRIOR3D.heal = function (n) { const E = WARRIOR3D._e; if (!E) return; E.hp = Math.min(E.maxHp, E.hp + n); WARRIOR3D._updateMeters(E); };
WARRIOR3D.setSurvival = function (o) { const E = WARRIOR3D._e; if (!E) return; if (o.food != null) E.food = Math.max(0, Math.min(100, o.food)); if (o.rest != null) E.rest = Math.max(0, Math.min(100, o.rest)); if (o.st != null) E.st = Math.min(E.maxSt, o.st); WARRIOR3D._updateMeters(E); };
WARRIOR3D.addMaxHp = function (n) { const E = WARRIOR3D._e; if (!E) return; E.maxHp += n; E.hp = E.maxHp; WARRIOR3D._updateMeters(E); };
WARRIOR3D.addSp = function (n) { const E = WARRIOR3D._e; if (!E) return; E.sp = Math.max(0, E.sp + n); };
WARRIOR3D.buff = function (o) { const E = WARRIOR3D._e; if (!E) return; o = o || {};
  if (o.maxHp) { E.maxHp += o.maxHp; E.hp = E.maxHp; } if (o.atk) E.atk += o.atk; if (o.guard) E.guard += o.guard; if (o.maxSt) { E.maxSt += o.maxSt; E.st = E.maxSt; } WARRIOR3D._updateMeters(E); };
WARRIOR3D.stats = function () { const E = WARRIOR3D._e; return E ? { hp: E.hp, maxHp: E.maxHp, food: E.food, rest: E.rest, sp: E.sp, atk: E.atk, guard: E.guard, maxSt: E.maxSt } : null; };

/* a real campfire spawned in front of you at a camp */
WARRIOR3D.campfire = function (on) {
  const E = WARRIOR3D._e; if (!E) return;
  if (on) { if (E.fire) return; const g = new THREE.Group();
    for (let i = 0; i < 4; i++) { const log = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.74, 6), new THREE.MeshStandardMaterial({ color: 0x3a2414, roughness: 1 })); log.rotation.set(Math.PI / 2, i * Math.PI / 4, 0); log.position.y = 0.09; log.castShadow = true; g.add(log); }
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.05, 6, 16), new THREE.MeshStandardMaterial({ color: 0x565049, roughness: 1 })); ring.rotation.x = Math.PI / 2; ring.position.y = 0.03; g.add(ring);
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.62, 7), new THREE.MeshBasicMaterial({ color: 0xff7a2a, transparent: true, opacity: 0.92, fog: false })); flame.position.y = 0.42; g.add(flame);
    const flame2 = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.4, 6), new THREE.MeshBasicMaterial({ color: 0xffd23a, transparent: true, opacity: 0.96, fog: false })); flame2.position.y = 0.36; g.add(flame2);
    const light = new THREE.PointLight(0xff8a3a, 2.0, 15); light.position.set(0, 1.1, 0); g.add(light);
    const fwx = -Math.sin(E.viewYaw), fwz = -Math.cos(E.viewYaw);
    g.position.set(E.px + fwx * 2.6, 0, E.pz + fwz * 2.6); g.userData.flames = [flame, flame2]; E.scene.add(g); E.fire = g;
  } else if (E.fire) { E.scene.remove(E.fire); E.fire = null; }
};

/* landmarks the story can drop into the world (cleared on the next setTheme) */
WARRIOR3D.landmark = function (type, x, z) {
  const E = WARRIOR3D._e; if (!E) return; const add = (o) => { E.dress.push(o); E.scene.add(o); };
  const S = (m) => { m.castShadow = true; m.receiveShadow = true; return m; };
  if (type === "fort") {
    const wood = new THREE.MeshStandardMaterial({ color: 0x5a4326, roughness: 1 }), dark = new THREE.MeshStandardMaterial({ color: 0x2f2416, roughness: 1 });
    const g = new THREE.Group();
    [[-3.6], [3.6]].forEach(([wx]) => { const w = S(new THREE.Mesh(new THREE.BoxGeometry(4.4, 3.2, 0.8), wood)); w.position.set(wx, 1.6, 0); g.add(w);
      for (let i = -1.8; i <= 1.8; i += 0.8) { const sp = S(new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.7, 5), dark)); sp.position.set(wx + i, 3.5, 0); g.add(sp); } });
    [-1.4, 1.4].forEach(px => { const pst = S(new THREE.Mesh(new THREE.BoxGeometry(0.5, 3.6, 0.9), dark)); pst.position.set(px, 1.8, 0); g.add(pst);
      const t = new THREE.PointLight(0xffa24a, 1.5, 12); t.position.set(px, 3.0, 0.6); g.add(t);
      const tg = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffb055, fog: false })); tg.position.copy(t.position); g.add(tg); });
    g.add(S(WARRIOR3D._m(new THREE.BoxGeometry(3.4, 0.6, 1.0), wood, [0, 3.4, 0])));
    g.position.set(x, 0, z); add(g);
  } else if (type === "shieldwall") {
    const g = new THREE.Group();
    for (let i = -2; i <= 2; i++) { const s = WARRIOR3D._makeFoe({ color: 0x35507a }); s.position.set(i * 1.15, 0, 0); s.rotation.y = Math.PI;
      const sh = new THREE.Mesh(new THREE.BoxGeometry(0.72, 1.1, 0.08), new THREE.MeshStandardMaterial({ color: 0x8a3026, roughness: 0.8 })); sh.position.set(0, 1.1, 0.42); sh.castShadow = true; s.add(sh); g.add(s); }
    g.position.set(x, 0, z); add(g);
  }
};

/* ================================================================== *
 *  COMBAT — skill-based directional parry + stamina
 * ================================================================== */
WARRIOR3D.DIRS = ["up", "down", "left", "right", "thrust"];
WARRIOR3D.DIRWORD = { up: "OVERHEAD ↑", down: "LOW ↓", left: "FROM LEFT ←", right: "FROM RIGHT →", thrust: "THRUST ✦" };
WARRIOR3D.DIRKEY = { up: "↑", down: "↓", left: "←", right: "→", thrust: "E" };

WARRIOR3D._nextFoe = function (E) {
  const def = E.queue.shift();
  if (!def) { E.mode = "explore"; document.getElementById("w3-foewrap").classList.remove("on"); WARRIOR3D._prompt(E, "", ""); const r = E.fightRes; E.fightRes = null; if (r) r(true); return; }
  const mesh = WARRIOR3D._makeFoe(def); const ang = (Math.random() - 0.5) * 0.5;
  // spawn ahead of where you're facing, and turn to look at him
  const fwx = -Math.sin(E.viewYaw), fwz = -Math.cos(E.viewYaw);
  mesh.position.set(E.px + fwx * 9 + Math.cos(E.viewYaw) * Math.sin(ang) * 3, 0, E.pz + fwz * 9 - Math.sin(E.viewYaw) * Math.sin(ang) * 3);
  mesh.rotation.y = Math.PI; E.scene.add(mesh);
  E.viewYaw = -Math.atan2(mesh.position.x - E.px, -(mesh.position.z - E.pz));
  const wf = E.tutorial ? 1.7 : 1;
  const pz = Math.round((def.skill || 0.7) * 3) + 3;
  E.foe = { def, mesh, hp: def.hp, hpMax: def.hp, dmg: def.dmg, skill: def.skill || 0.7, aggr: def.aggr || 0.6,
    state: "approach", stateT: 0, dir: null, defended: false, hitReact: 0, walkPhase: 0, dead: false, openSide: null,
    poise: pz, poiseMax: pz, winMs: Math.max(380, 1000 - (def.skill || 0.7) * 560) * wf, feint: false };
  document.getElementById("w3-foename").textContent = def.name;
  WARRIOR3D._updateMeters(E);
};

WARRIOR3D._foeTelegraph = function (E) {
  const f = E.foe; if (!f) return;
  f.state = "windup"; f.stateT = 0; f.defended = false;
  f.dir = WARRIOR3D.DIRS[Math.floor(Math.random() * 5)];
  f.feint = !E.tutorial && Math.random() < f.skill * 0.22;         // veterans feint
  const inc = document.getElementById("w3-incoming");
  if (inc) { inc.className = "w3-incoming on"; inc.innerHTML = `<span class="dir">${WARRIOR3D.DIRWORD[f.dir]}</span><span class="key">parry: ${E.tutorial ? "press " : ""}${WARRIOR3D.DIRKEY[f.dir]}</span>`; }
  WARRIOR3D._prompt(E, `⚠ ${f.def.name} attacks — <b>parry ${WARRIOR3D.DIRWORD[f.dir]}</b>!`, "warn");
};

WARRIOR3D._costOrWinded = function (E, cost) {
  if (E.winded > 0) return false;
  if (E.st < cost) { E.winded = 1.2; E.st = E.maxSt * 0.35; WARRIOR3D._prompt(E, "😮‍💨 <b>Winded!</b> Out of stamina — wide open.", "warn"); WARRIOR3D._updateMeters(E); return false; }
  E.st -= cost; WARRIOR3D._updateMeters(E); return true;
};

WARRIOR3D._dir = function (E, d) {
  const f = E.foe; if (!f || f.dead) return;
  if (f.state === "windup") {
    if (!WARRIOR3D._costOrWinded(E, 1.5)) { WARRIOR3D._vm(E, "parry"); return; }
    WARRIOR3D._vm(E, "parry_" + d);
    if (f.feint) { WARRIOR3D._prompt(E, "✋ A feint! You bit on it — recover.", "warn"); E.vulnT = 0.5; return; }  // parrying a feint whiffs
    if (d === f.dir) {
      const p = f.stateT / (f.winMs / 1000);
      if (p >= 0.55) { f.defended = true; f.poise -= 1; E.combo++; E.shake = Math.max(E.shake, 0.3); E.st = Math.min(E.maxSt, E.st + 1);
        WARRIOR3D._spawnSpark(E, f); WARRIOR3D._damageFoe(E, Math.max(1, Math.round(E.atk * 0.6)), true);
        if (!f.dead && f.poise <= 0) { f.state = "staggered"; f.stateT = 0; f.openSide = f.dir; f.poise = f.poiseMax; WARRIOR3D._prompt(E, `⚔️ <b>Parry breaks his guard!</b> Strike hard!`, "good"); }
        else if (!f.dead) { f.state = "open"; f.stateT = 0; f.openSide = f.dir; WARRIOR3D._prompt(E, `⚔️ <b>Parry!</b> A quick opening — cut him now, then keep pressing!`, "good"); }
        WARRIOR3D._updateMeters(E); }
      else { f.defended = true; f.state = "recover"; f.stateT = 0; WARRIOR3D._foeHits(E, 0.35); WARRIOR3D._prompt(E, "Blocked, but early — it still stung.", "warn"); }
    } else { f.defended = true; f.state = "strike"; f.stateT = 0; WARRIOR3D._foeHits(E, 1); E.combo = 0; WARRIOR3D._prompt(E, `❌ Wrong guard! He struck ${WARRIOR3D.DIRWORD[f.dir]}.`, "warn"); }
    return;
  }
  if (f.state === "staggered" || f.state === "open") {
    if (!WARRIOR3D._costOrWinded(E, 2)) return;
    WARRIOR3D._vm(E, "cut_" + d); E.combo++;
    let dm = E.atk + 2 + Math.min(5, E.combo) + (d === "thrust" ? 2 : 0); if (f.openSide && d === f.openSide) dm += 2;
    WARRIOR3D._damageFoe(E, dm, false); if (!f.dead) WARRIOR3D._prompt(E, `🗡️ cut into the gap — <b>−${dm}</b>!`, "good");
    return;
  }
  // ---- press the attack against his guard (offense breaks his poise) ----
  if (!WARRIOR3D._costOrWinded(E, 2)) return;
  WARRIOR3D._vm(E, "cut_" + d);
  if (f.state === "guard" || f.state === "recover") {
    if (Math.random() < 0.2 + f.skill * 0.28) { E.vulnT = 0.4; E.shake = Math.max(E.shake, 0.16); WARRIOR3D._prompt(E, "🛡️ He turns your blade — come from another line!", "warn"); }
    else { f.poise -= 1; WARRIOR3D._damageFoe(E, Math.max(1, Math.round(E.atk * 0.35)), false);
      if (!f.dead && f.poise <= 0) { f.state = "staggered"; f.stateT = 0; f.openSide = d; f.poise = f.poiseMax; WARRIOR3D._prompt(E, `💥 <b>Guard broken!</b> Strike the opening!`, "good"); }
      else if (!f.dead) WARRIOR3D._prompt(E, `⚔️ You batter his guard — poise ${Math.max(0, f.poise)}. Keep pressing — but watch his blade.`, ""); }
  }
};

WARRIOR3D._input = function (action) {
  const E = WARRIOR3D._e; if (!E || !E.running) return;
  if (E.onContinue && (action === "continue" || action === "dodge")) { E.onContinue(); return; }  // space/enter/tap advances dialogue
  if (action === "block") { E.blocking = true; WARRIOR3D._vm(E, "block"); return; }
  if (action === "aim") { if (E.mode !== "fight") return; E.aiming = true; E.aimT = 0; E.fovTarget = 52; WARRIOR3D._vm(E, "aim"); const rt = document.getElementById("w3-reticle"); if (rt) rt.classList.add("on"); return; }
  if (action === "shoot") { if (E.mode !== "fight") return; const cost = 2;
    if (E.quiver <= 0) { WARRIOR3D._prompt(E, "Out of arrows — draw your blade.", "warn"); return; }
    if (E.winded > 0 || E.st < cost) { WARRIOR3D._prompt(E, "No stamina to shoot.", "warn"); return; }
    E.st -= cost; E.quiver--; WARRIOR3D._vm(E, "shoot"); const charged = Math.min(1, E.aimT / 0.9); const dm = Math.round((E.atk / 3 + 1) + charged * (E.atk / 2 + 2)); WARRIOR3D._fireArrow(E, dm);
    WARRIOR3D._prompt(E, `🏹 loosed — <b>${E.quiver}</b> arrow${E.quiver === 1 ? "" : "s"} left.`, ""); WARRIOR3D._updateMeters(E); return; }
  if (action === "dodge") { if (E.winded > 0) return; const cost = 3.5; if (E.st < cost) { WARRIOR3D._prompt(E, "Too winded to dodge.", "warn"); return; }
    E.st -= cost; E.dodgeT = 0.4; E.dodgeDir = (E.km.a || (E.joy.active && E.joy.x < -0.2)) ? -1 : 1; WARRIOR3D._vm(E, "dodge");
    const f = E.foe; if (f && f.state === "windup") { f.defended = true; f.state = "recover"; f.stateT = 0; WARRIOR3D._prompt(E, "💨 You roll clear — untouched.", "good"); } WARRIOR3D._updateMeters(E); return; }
  if (action === "leave") { WARRIOR3D.leave(); return; }
  if (action.indexOf("dir_") === 0) { if (E.mode === "fight") WARRIOR3D._dir(E, action.slice(4)); return; }
};
WARRIOR3D._release = function (action) {
  const E = WARRIOR3D._e; if (!E) return;
  if (action === "block") { E.blocking = false; if (E.vmClip === "block") WARRIOR3D._vm(E, "idle"); }
  if (action === "aim") { E.aiming = false; E.fovTarget = 72; const rt = document.getElementById("w3-reticle"); if (rt) rt.classList.remove("on"); if (E.vmClip === "aim") WARRIOR3D._vm(E, "idle"); }
};

WARRIOR3D._foeHits = function (E, mult) {
  if (E.blocking && E.st > 0) { const chip = Math.max(1, Math.round(E.foe.dmg * 0.3)); E.hp -= chip; E.st = Math.max(0, E.st - 2); if (E.st <= 0) E.winded = 1.0; }
  else { let dmg = Math.round(E.foe.dmg * (mult == null ? 1 : mult)); if (E.winded > 0 || E.vulnT > 0) dmg = Math.round(dmg * 1.5); E.hp -= dmg; }
  E.hitFlash = 1; E.shake = Math.max(E.shake, 0.55); WARRIOR3D._updateMeters(E);
  if (E.hp <= 0) WARRIOR3D._defeat(E);
};
WARRIOR3D._damageFoe = function (E, dmg, spark) {
  const f = E.foe; if (!f || f.dead) return; f.hp -= dmg; f.hitReact = 1;
  if (spark) WARRIOR3D._spawnSpark(E, f); else WARRIOR3D._spawnBlood(E, f);
  WARRIOR3D._updateMeters(E);
  if (f.hp <= 0) { f.dead = true; f.state = "dead"; f.stateT = 0; WARRIOR3D._prompt(E, `<b>${f.def.name} falls.</b>`, "good"); }
};
WARRIOR3D._defeat = function (E) {
  if (E.mode !== "fight") return; E.mode = "explore";
  if (E.foe && E.foe.mesh) { E.scene.remove(E.foe.mesh); E.foe = null; }
  document.getElementById("w3-foewrap").classList.remove("on");
  E.hp = Math.max(1, Math.round(E.maxHp * 0.25)); WARRIOR3D._updateMeters(E);
  const r = E.fightRes; E.fightRes = null; E.queue = []; if (r) r(false);
};

WARRIOR3D._fireArrow = function (E, dmg) {
  const from = new THREE.Vector3(); E.camera.getWorldPosition(from); from.y -= 0.12;
  const f = E.foe; const to = f ? f.mesh.position.clone().setY(1.3) : from.clone().add(new THREE.Vector3(0, 0, -8));
  const a = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.7, 5), new THREE.MeshStandardMaterial({ color: 0x6a4a26 }));
  a.position.copy(from); a.lookAt(to); a.rotateX(Math.PI / 2); E.scene.add(a);
  E.arrows.push({ m: a, v: to.clone().sub(from).normalize().multiplyScalar(48), dmg, life: 0 });
};

/* ================================================================== *
 *  MAIN LOOP
 * ================================================================== */
WARRIOR3D._loop = function () {
  const E = WARRIOR3D._e; if (!E || !E.running) return;
  E.raf = requestAnimationFrame(WARRIOR3D._loop);
  const now = (typeof performance !== "undefined" ? performance.now() : Date.now());
  let dt = (now - E.clock) / 1000; E.clock = now; if (dt > 0.05) dt = 0.05;

  // stamina & winded
  if (E.winded > 0) E.winded = Math.max(0, E.winded - dt);
  if (E.vulnT > 0) E.vulnT = Math.max(0, E.vulnT - dt);
  if (E.aiming) E.aimT += dt;
  const regen = (E.rest < 30 ? 1.7 : 2.6) * (E.blocking ? 0.2 : 1);
  if (E.winded <= 0 && E.st < E.maxSt) { E.st = Math.min(E.maxSt, E.st + dt * regen); WARRIOR3D._updateMeters(E, true); }
  if (E.blocking && E.mode === "fight") { E.st = Math.max(0, E.st - dt * 1.1); if (E.st <= 0) { E.winded = 1.0; E.blocking = false; } WARRIOR3D._updateMeters(E, true); }

  if (E.foe) WARRIOR3D._updateFoe(E, dt);
  WARRIOR3D._updateViewmodel(E, dt);
  WARRIOR3D._updateCamera(E, dt);
  WARRIOR3D._updateParticles(E, dt);
  WARRIOR3D._updateArrows(E, dt);
  WARRIOR3D._updateWaypoint(E);

  if (E.hitFlash > 0) { E.hitFlash = Math.max(0, E.hitFlash - dt * 3); const fl = document.getElementById("w3-flash"); if (fl) fl.style.opacity = E.hitFlash * 0.5; }
  if (E.fire) { const s = 0.8 + Math.sin(now / 70) * 0.22; E.fire.userData.flames.forEach((fl, i) => { fl.scale.set(s + i * 0.1, 1 + Math.sin(now / 55 + i) * 0.15, s + i * 0.1); fl.rotation.y += dt * (3 + i * 2); }); }
  if (E.waypoint) { E.waypoint.mk.rotation.y += dt * 1.5; E.waypoint.mk.children[0].material.opacity = 0.6 + Math.sin(now / 250) * 0.3; }
  E.renderer.render(E.scene, E.camera);
};

WARRIOR3D._updateWaypoint = function (E) {
  const w = E.waypoint; if (!w) return;
  if (Math.hypot(E.px - w.x, E.pz - w.z) < w.r) { E.scene.remove(w.mk); E.waypoint = null; WARRIOR3D._prompt(E, "", ""); const r = w.resolve; if (r) r(); }
};

WARRIOR3D._updateFoe = function (E, dt) {
  const f = E.foe; if (!f) return; f.stateT += dt; const m = f.mesh, u = m.userData;
  if (f.hitReact > 0) f.hitReact = Math.max(0, f.hitReact - dt * 4);
  if (f.state === "dead") {
    const t = Math.min(1, f.stateT / 0.9); m.rotation.x = -t * 1.4; m.position.y = -t * 0.4;
    m.traverse(o => { if (o.material && "opacity" in o.material) { o.material.transparent = true; o.material.opacity = 1 - t; } });
    if (f.stateT > 1.0) { E.scene.remove(m); E.foe = null; const inc = document.getElementById("w3-incoming"); if (inc) inc.className = "w3-incoming";
      setTimeout(() => { if (WARRIOR3D._e === E && E.running && E.mode === "fight") WARRIOR3D._nextFoe(E); }, 300); }
    return;
  }
  const dist = Math.hypot(m.position.x - E.camera.position.x, m.position.z - E.camera.position.z);
  const recoil = f.hitReact * 0.25;
  // always turn to face the player — if you run or circle, he tracks you
  m.rotation.y = Math.atan2(E.camera.position.x - m.position.x, E.camera.position.z - m.position.z) + Math.PI;
  // if you break contact (run away), he stops swinging at air and gives chase
  if (dist > 3.2 && (f.state === "guard" || f.state === "recover" || f.state === "windup")) {
    if (f.state === "windup") { const inc = document.getElementById("w3-incoming"); if (inc) inc.className = "w3-incoming"; if (u.torso) u.torso.rotation.z = 0; }
    f.state = "approach"; f.stateT = 0;
  }
  if (f.state === "approach") {
    f.walkPhase += dt * 7;
    if (dist > 2.4) { const dx = E.camera.position.x - m.position.x, dz = E.camera.position.z - m.position.z, len = Math.hypot(dx, dz) || 1;
      m.position.x += (dx / len) * dt * 2.0; m.position.z += (dz / len) * dt * 2.0;
      if (u.lLeg) { u.lLeg.rotation.x = Math.sin(f.walkPhase) * 0.6; u.rLeg.rotation.x = -Math.sin(f.walkPhase) * 0.6; }
      if (u.rArm) u.rArm.rotation.x = -0.3 + Math.sin(f.walkPhase) * 0.2; m.position.y = Math.abs(Math.sin(f.walkPhase)) * 0.04;
      // face the player
      m.rotation.y = Math.atan2(E.camera.position.x - m.position.x, E.camera.position.z - m.position.z) + Math.PI;
    } else { if (u.lLeg) { u.lLeg.rotation.x *= 0.8; u.rLeg.rotation.x *= 0.8; } m.position.y = 0; f.state = "guard"; f.stateT = 0; }
  } else if (f.state === "guard") {
    if (u.rArm) u.rArm.rotation.x = -0.3 + Math.sin(E.clock / 300) * 0.08;
    m.rotation.y = Math.atan2(E.camera.position.x - m.position.x, E.camera.position.z - m.position.z) + Math.PI;
    const wait = 0.34 + (1 - f.aggr) * 0.55;
    if (f.stateT > wait) { if (Math.random() < 0.88) WARRIOR3D._foeTelegraph(E); else { f.state = "open"; f.stateT = 0; f.openSide = WARRIOR3D.DIRS[Math.floor(Math.random() * 5)]; WARRIOR3D._prompt(E, `${f.def.name} overreaches — <b>an opening! Cut!</b>`, "good"); } }
  } else if (f.state === "windup") {
    if (u.rArm) { const p = Math.min(1, f.stateT / (f.winMs / 1000)); const tgt = f.dir === "up" ? -2.4 : f.dir === "down" ? 0.7 : f.dir === "thrust" ? -1.3 : -1.0; u.rArm.rotation.x = THREE.MathUtils.lerp(-0.3, tgt, p); if (u.torso) u.torso.rotation.z = (f.dir === "left" ? 0.5 : f.dir === "right" ? -0.5 : 0) * p; }
    if (f.stateT >= f.winMs / 1000) { if (f.feint) { f.state = "guard"; f.stateT = 0; const inc = document.getElementById("w3-incoming"); if (inc) inc.className = "w3-incoming"; if (u.torso) u.torso.rotation.z = 0; }
      else if (!f.defended) { if (dist < 2.9) WARRIOR3D._foeHits(E, 1); else WARRIOR3D._prompt(E, "You keep your distance — his cut finds only air.", "good"); f.state = "strike"; f.stateT = 0; if (u.torso) u.torso.rotation.z = 0; const inc = document.getElementById("w3-incoming"); if (inc) inc.className = "w3-incoming"; } }
  } else if (f.state === "strike") { if (u.rArm) u.rArm.rotation.x = THREE.MathUtils.lerp(u.rArm.rotation.x, 0.6, dt * 14); if (f.stateT > 0.16) { f.state = "recover"; f.stateT = 0; const inc = document.getElementById("w3-incoming"); if (inc) inc.className = "w3-incoming"; }
  } else if (f.state === "staggered") { if (u.rArm) u.rArm.rotation.x = THREE.MathUtils.lerp(u.rArm.rotation.x, 0.9, dt * 8); if (u.torso) u.torso.rotation.x = -0.25; if (f.stateT > 0.65) { if (u.torso) u.torso.rotation.x = 0; f.state = "recover"; f.stateT = 0; f.openSide = null; }
  } else if (f.state === "open") { if (u.torso) u.torso.rotation.x = 0.15; if (f.stateT > 0.75) { if (u.torso) u.torso.rotation.x = 0; f.state = "guard"; f.stateT = 0; f.openSide = null; }
  } else if (f.state === "recover") { if (u.rArm) u.rArm.rotation.x = THREE.MathUtils.lerp(u.rArm.rotation.x, -0.3, dt * 6); if (f.stateT > 0.28) { if (dist < 3 && Math.random() < f.aggr * 0.45) WARRIOR3D._foeTelegraph(E); else { f.state = "guard"; f.stateT = 0; } } }
  if (u.torso && f.state !== "open" && f.state !== "staggered") u.torso.position.z = -recoil;
};

/* per-attack viewmodel animation */
WARRIOR3D.SWING = {
  cut_up: { dp: [-0.15, 0.34, 0.30], dr: [-2.0, -0.5, 0], dur: 0.28 }, cut_down: { dp: [-0.10, -0.30, 0.26], dr: [1.5, 0.3, 0], dur: 0.28 },
  cut_left: { dp: [-0.58, 0.12, 0.20], dr: [-0.3, 1.5, -1.3], dur: 0.26 }, cut_right: { dp: [0.34, 0.12, 0.20], dr: [-0.3, -1.5, 1.3], dur: 0.26 },
  cut_thrust: { dp: [-0.10, -0.04, 0.62], dr: [-0.2, 0.1, 0], dur: 0.24 },
  parry_up: { dp: [-0.05, 0.24, 0.06], dr: [-0.9, 0.3, 0.2], dur: 0.2 }, parry_down: { dp: [-0.05, -0.14, 0.06], dr: [0.7, 0.3, 0.2], dur: 0.2 },
  parry_left: { dp: [-0.24, 0.12, 0.05], dr: [-0.3, 0.9, 0.7], dur: 0.2 }, parry_right: { dp: [0.18, 0.12, 0.05], dr: [-0.3, -0.7, -0.5], dur: 0.2 },
  parry_thrust: { dp: [-0.02, 0.04, 0.14], dr: [-0.2, 0.5, 0.3], dur: 0.2 }, parry: { dp: [-0.1, 0.14, 0.05], dr: [-0.4, 0.6, 0.4], dur: 0.18 },
};
WARRIOR3D._vm = function (E, clip) { E.vmClip = clip; E.vmT = 0; };
WARRIOR3D._updateViewmodel = function (E, dt) {
  const V = E.view.userData, kg = V.katana, R = V.rest, bow = V.bow; E.vmT += dt;
  const bob = Math.sin(E.clock / 600) * 0.012, sway = Math.cos(E.clock / 900) * 0.01;
  const showBow = (E.vmClip === "aim" || E.vmClip === "shoot"); kg.visible = !showBow; bow.visible = showBow;
  const set = (px, py, pz, rx, ry, rz) => { kg.position.set(px, py, pz); kg.rotation.set(rx, ry, rz); };
  if (showBow) { const d = V.bowDraw; if (E.vmClip === "aim") d.position.z = THREE.MathUtils.lerp(d.position.z, 0.24, dt * 9);
    else { const t = Math.min(1, E.vmT / 0.16); d.position.z = THREE.MathUtils.lerp(0.24, 0, t); if (t >= 1) WARRIOR3D._vm(E, E.aiming ? "aim" : "idle"); } return; }
  const sw = WARRIOR3D.SWING[E.vmClip];
  if (sw) { const t = Math.min(1, E.vmT / sw.dur), s = Math.sin(t * Math.PI);
    set(R.pos.x + sw.dp[0] * s, R.pos.y + sw.dp[1] * s, R.pos.z + sw.dp[2] * s, R.rot.x + sw.dr[0] * s, R.rot.y + sw.dr[1] * s, R.rot.z + sw.dr[2] * s);
    if (t >= 1) WARRIOR3D._vm(E, E.blocking ? "block" : "idle");
  } else if (E.vmClip === "block") { set(R.pos.x - 0.2, R.pos.y + 0.24, R.pos.z + 0.14, R.rot.x - 0.2, R.rot.y + 1.25, -0.5);
  } else if (E.vmClip === "dodge") { const t = Math.min(1, E.vmT / 0.4), s = Math.sin(t * Math.PI); set(R.pos.x, R.pos.y - s * 0.14, R.pos.z + s * 0.05, R.rot.x + s * 0.2, R.rot.y, R.rot.z); if (t >= 1) WARRIOR3D._vm(E, E.blocking ? "block" : "idle");
  } else { set(R.pos.x + sway, R.pos.y + bob, R.pos.z, R.rot.x, R.rot.y, R.rot.z); }
};

WARRIOR3D._updateCamera = function (E, dt) {
  const cam = E.camera, f = E.foe;
  // FREE LOOK: E.viewYaw is your persistent facing (set by right-drag / mouse).
  // In a fight, gently steer it toward the foe so combat stays framed — but you
  // can still turn freely; in the open world there is no auto-turn at all.
  if (E.mode === "fight" && f && f.mesh && !f.dead) {
    const foeYaw = -Math.atan2(f.mesh.position.x - E.px, -(f.mesh.position.z - E.pz));
    let diff = foeYaw - E.viewYaw; while (diff > Math.PI) diff -= 2 * Math.PI; while (diff < -Math.PI) diff += 2 * Math.PI;
    E.viewYaw += diff * Math.min(1, dt * (E.look.active ? 0.5 : 2.2));
  }
  const camYaw = E.viewYaw;
  // movement, relative to where you are actually looking
  let mx = (E.km.d ? 1 : 0) - (E.km.a ? 1 : 0), my = (E.km.w ? 1 : 0) - (E.km.s ? 1 : 0);
  if (E.joy.active) { mx = E.joy.x; my = E.joy.y; }
  const ml = Math.hypot(mx, my); if (ml > 1) { mx /= ml; my /= ml; }
  if (mx || my) { const spd = (E.winded > 0 ? 1.6 : 3.4); const fwdX = -Math.sin(camYaw), fwdZ = -Math.cos(camYaw), rgtX = Math.cos(camYaw), rgtZ = -Math.sin(camYaw);
    E.px += (rgtX * mx + fwdX * my) * spd * dt; E.pz += (rgtZ * mx + fwdZ * my) * spd * dt;
    const r = Math.hypot(E.px, E.pz); if (r > 13) { E.px *= 13 / r; E.pz *= 13 / r; } }
  if (f && f.mesh && !f.dead) { const dx = E.px - f.mesh.position.x, dz = E.pz - f.mesh.position.z, d = Math.hypot(dx, dz) || 1; if (d < 1.5) { E.px = f.mesh.position.x + dx / d * 1.5; E.pz = f.mesh.position.z + dz / d * 1.5; } }
  let strafe = 0, dip = 0;
  if (E.dodgeT > 0) { E.dodgeT = Math.max(0, E.dodgeT - dt); const s = Math.sin((0.4 - E.dodgeT) / 0.4 * Math.PI); strafe = (E.dodgeDir || 1) * s * 0.7; dip = -s * 0.12; }
  let sh = 0; if (E.shake > 0) { E.shake = Math.max(0, E.shake - dt * 2.2); sh = E.shake; }
  E.fov += (E.fovTarget - E.fov) * Math.min(1, dt * 8); cam.fov = E.fov; cam.updateProjectionMatrix();
  cam.rotation.set(E.viewPitch + (Math.random() - 0.5) * sh * 0.04, camYaw + (Math.random() - 0.5) * sh * 0.04, 0, "YXZ");
  const rgtX = Math.cos(camYaw), rgtZ = -Math.sin(camYaw);
  cam.position.set(E.px + rgtX * strafe, 1.66 + dip, E.pz + rgtZ * strafe);
};

/* particles + arrows */
WARRIOR3D._fp = function (E, f, up) { const p = f.mesh.position.clone(); p.y = up == null ? 1.2 : up; return p; };
WARRIOR3D._spawnSpark = function (E, f) { const p = WARRIOR3D._fp(E, f, 1.4); for (let i = 0; i < 11; i++) WARRIOR3D._particle(E, p, 0xffe08a, 4 + Math.random() * 4, 0.35); };
WARRIOR3D._spawnBlood = function (E, f) { const p = WARRIOR3D._fp(E, f, 1.3); for (let i = 0; i < 9; i++) WARRIOR3D._particle(E, p, 0x9a1f14, 2.5 + Math.random() * 3, 0.5); };
WARRIOR3D._particle = function (E, pos, color, speed, life) { const m = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.05), new THREE.MeshBasicMaterial({ color })); m.position.copy(pos);
  const dir = new THREE.Vector3((Math.random() - 0.5), Math.random() * 0.9 + 0.2, (Math.random() - 0.5) - 0.3).normalize(); E.scene.add(m); E.particles.push({ m, v: dir.multiplyScalar(speed), life, age: 0 }); };
WARRIOR3D._updateParticles = function (E, dt) { for (let i = E.particles.length - 1; i >= 0; i--) { const p = E.particles[i]; p.age += dt; p.v.y -= dt * 9.8; p.m.position.addScaledVector(p.v, dt);
  if (p.m.position.y < 0.02 || p.age > p.life) { E.scene.remove(p.m); if (p.m.geometry) p.m.geometry.dispose(); if (p.m.material) p.m.material.dispose(); E.particles.splice(i, 1); } } };
WARRIOR3D._updateArrows = function (E, dt) { for (let i = E.arrows.length - 1; i >= 0; i--) { const a = E.arrows[i]; a.life += dt; a.m.position.addScaledVector(a.v, dt); const f = E.foe; let hit = false;
  if (f && !f.dead) { const d = Math.hypot(a.m.position.x - f.mesh.position.x, a.m.position.z - f.mesh.position.z); if (d < 0.7 && a.m.position.y > 0.4 && a.m.position.y < 2) hit = true; }
  if (hit) { WARRIOR3D._damageFoe(E, a.dmg, false); if (!f.dead) WARRIOR3D._prompt(E, `🏹 arrow hits — <b>−${a.dmg}</b>.`, "good"); }
  if (hit || a.life > 1.4 || a.m.position.y < 0.02) { E.scene.remove(a.m); if (a.m.geometry) a.m.geometry.dispose(); if (a.m.material) a.m.material.dispose(); E.arrows.splice(i, 1); } } };

/* HUD */
WARRIOR3D._updateMeters = function (E, light) {
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.style.width = Math.max(0, v) + "%"; };
  set("w3-st", E.st / E.maxSt * 100); if (light) return;
  set("w3-hp", E.hp / E.maxHp * 100); set("w3-food", E.food); set("w3-rest", E.rest);
  if (E.foe) set("w3-foehp", E.foe.hp / E.foe.hpMax * 100);
};
WARRIOR3D._prompt = function (E, html, cls) { const el = document.getElementById("w3-prompt"); if (el) { el.innerHTML = html; el.className = "w3-prompt " + (cls || ""); } };

WARRIOR3D._bindControls = function (E) {
  const cv = E.renderer.domElement;
  const joyEl = document.getElementById("w3-joy"), knob = joyEl && joyEl.querySelector(".w3-joy-knob"), R = 56, halfW = () => (E.mount.clientWidth || window.innerWidth) * 0.5;
  const look = E.look;
  const startMove = (x, y, id) => { E.joy.active = true; E.joy.id = id; E.joy.ox = x; E.joy.oy = y; E.joy.x = 0; E.joy.y = 0; if (joyEl) { joyEl.style.left = x + "px"; joyEl.style.top = y + "px"; joyEl.classList.add("on"); if (knob) knob.style.transform = "translate(-50%,-50%)"; } };
  const doMove = (x, y) => { let dx = x - E.joy.ox, dy = y - E.joy.oy; const d = Math.hypot(dx, dy); if (d > R) { dx *= R / d; dy *= R / d; } E.joy.x = dx / R; E.joy.y = -dy / R; if (knob) knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`; };
  const endMove = () => { E.joy.active = false; E.joy.x = 0; E.joy.y = 0; if (joyEl) joyEl.classList.remove("on"); };
  const start = (x, y, id) => { if (x < halfW()) startMove(x, y, id); else { look.active = true; look.id = id; look.lx = x; look.ly = y; } };
  const moveTo = (x, y, id) => { if (E.joy.active && E.joy.id === id) doMove(x, y); else if (look.active && look.id === id) { E.viewYaw -= (x - look.lx) * 0.006; E.viewPitch = THREE.MathUtils.clamp(E.viewPitch - (y - look.ly) * 0.005, -0.5, 0.5); look.lx = x; look.ly = y; } };
  const end = (id) => { if (E.joy.id === id) endMove(); if (look.id === id) look.active = false; };
  cv.addEventListener("mousedown", e => start(e.clientX, e.clientY, "m"));
  window.addEventListener("mousemove", e => moveTo(e.clientX, e.clientY, "m"));
  window.addEventListener("mouseup", () => end("m"));
  cv.addEventListener("touchstart", e => { for (const t of e.changedTouches) start(t.clientX, t.clientY, t.identifier); }, { passive: true });
  cv.addEventListener("touchmove", e => { for (const t of e.changedTouches) moveTo(t.clientX, t.clientY, t.identifier); }, { passive: true });
  cv.addEventListener("touchend", e => { for (const t of e.changedTouches) end(t.identifier); }, { passive: true });
  // continue-on-tap for the dialogue bubble
  const cont = document.getElementById("w3-cont"); if (cont) cont.onclick = () => WARRIOR3D._input("continue");
  const exit = document.getElementById("w3-exit"); if (exit) exit.onclick = () => WARRIOR3D.leave();
  const bub = document.getElementById("w3-bubble"); if (bub) bub.addEventListener("click", (e) => { if (e.target.classList.contains("w3-choice")) return; if (E.onContinue) WARRIOR3D._input("continue"); });

  document.querySelectorAll("#warrior-screen .w3-b").forEach(b => { const action = b.dataset.a, hold = b.dataset.hold;
    const press = (e) => { e.preventDefault(); e.stopPropagation(); WARRIOR3D._input(action); };
    b.addEventListener("touchstart", press, { passive: false }); b.addEventListener("mousedown", press);
    if (hold) { const rel = () => WARRIOR3D._release(action); b.addEventListener("touchend", rel); b.addEventListener("mouseup", rel); b.addEventListener("mouseleave", rel); } });

  const KEY = { arrowup: "dir_up", arrowdown: "dir_down", arrowleft: "dir_left", arrowright: "dir_right", e: "dir_thrust", " ": "dodge", f: "shoot", enter: "continue" };
  const HOLD = { l: "block", shift: "block", q: "aim" }; const MOVE = { w: 1, a: 1, s: 1, d: 1 };
  E._key = (e) => { const k = e.key.toLowerCase();
    if (MOVE[k]) { E.km[k] = 1; e.preventDefault(); return; }
    if (HOLD[k]) { e.preventDefault(); if (!E["_h" + k]) { E["_h" + k] = 1; WARRIOR3D._input(HOLD[k]); } return; }
    if (KEY[k]) { e.preventDefault(); WARRIOR3D._input(KEY[k]); } };
  E._keyUp = (e) => { const k = e.key.toLowerCase(); if (MOVE[k]) E.km[k] = 0; if (HOLD[k]) { E["_h" + k] = 0; WARRIOR3D._release(HOLD[k]); } };
  window.addEventListener("keydown", E._key); window.addEventListener("keyup", E._keyUp);
};

if (typeof module !== "undefined") module.exports = WARRIOR3D;
