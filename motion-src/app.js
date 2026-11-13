import * as THREE from 'three';

const $ = (s, r = document) => r.querySelector(s);
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const sm = (x) => { x = clamp(x); return x * x * (3 - 2 * x); };
const lerp = (a, b, t) => a + (b - a) * t;
const bell = (p, c, w) => clamp(1 - Math.abs(p - c) / w);
const body = document.body;
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

function goStatic() {
  body.classList.remove('no-js');
  body.classList.add('static');
  const l = $('#loader'); if (l) l.remove();
}

/* ---------- menu (works with or without WebGL) ---------- */
const menu = $('#menu'), menuBtn = $('.menu-btn');
function setMenu(open) {
  menu.hidden = !open;
  menuBtn.setAttribute('aria-expanded', String(open));
  body.classList.toggle('menu-open', open);
}
menuBtn.addEventListener('click', () => setMenu(menu.hidden));
addEventListener('keydown', (e) => { if (e.key === 'Escape' && !menu.hidden) { setMenu(false); menuBtn.focus(); } });

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas: $('#stage'), antialias: true, powerPreference: 'high-performance' });
} catch (e) { renderer = null; }
if (!renderer) { goStatic(); } else { boot(); }

function boot() {
  body.classList.remove('no-js');
  let paused = reduce;
  const motionBtn = $('#motion');
  const syncMotion = () => { motionBtn.textContent = paused ? 'PLAY MOTION' : 'PAUSE MOTION'; motionBtn.setAttribute('aria-pressed', String(paused)); body.classList.toggle('paused', paused); };
  syncMotion();
  motionBtn.addEventListener('click', () => { paused = !paused; syncMotion(); });

  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);
  scene.fog = new THREE.FogExp2(0x000000, 0);
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 900);
  const amb = new THREE.AmbientLight(0xffffff, 0.55);
  const key = new THREE.PointLight(0x9cc4ff, 60, 60, 1.4);
  scene.add(amb, key);

  const loadbar = $('#loadbar');
  let loaded = 0; const total = 6;
  const tick = () => { loaded++; loadbar.style.width = Math.round((loaded / total) * 100) + '%'; };
  const img = (src) => new Promise((res) => { const i = new Image(); i.onload = () => { tick(); res(i); }; i.onerror = () => { tick(); res(null); }; i.src = src; });
  const jobs = [
    document.fonts.load('800 80px Doto').then(tick, tick),
    fetch('assets/review/portrait-wire.json').then((r) => r.json()).then((j) => { tick(); return j; }, () => { tick(); return null; }),
    img('assets/review/quarry.jpg'), img('assets/review/quarto.jpg'), img('assets/review/interval.jpg'),
    new Promise((r) => setTimeout(() => { tick(); r(); }, 900)),
  ];
  Promise.all(jobs).then(([, wire, qi, ti, ii]) => build(wire, { qi, ti, ii })).catch(() => { goStatic(); });

  function build(wire, imgs) {
    /* ===================== HERO: wireframe portrait ===================== */
    const hero = new THREE.Group(); scene.add(hero);
    const uni = { uIntro: { value: 0 }, uDis: { value: 0 }, uTime: { value: 0 }, uGl: { value: 1 }, uPx: { value: renderer.getPixelRatio() } };

    // curved backdrop grid
    {
      const v = [];
      for (let x = -40; x <= 40; x += 2) for (let y = -26; y < 26; y += 0.5) v.push(x, y, 0, x, y + 0.5, 0);
      for (let y = -26; y <= 26; y += 2) for (let x = -40; x < 40; x += 0.5) v.push(x, y, 0, x + 0.5, y, 0);
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
      const m = new THREE.ShaderMaterial({
        uniforms: uni, transparent: true, depthWrite: false,
        vertexShader: `uniform float uIntro,uTime; varying float vA;
          void main(){ vec3 p=position; float r=length(p.xy)/30.0;
            p.z += r*r*14.0; p.xy *= 1.0 + r*r*0.22; p.x += sin(p.y*0.35+uTime*0.4)*0.04;
            vA = smoothstep(0.0,1.0, uIntro*1.8 - r*1.1);
            gl_Position = projectionMatrix*modelViewMatrix*vec4(p,1.0); }`,
        fragmentShader: `varying float vA; void main(){ gl_FragColor=vec4(0.62,0.72,0.78,0.20*vA); }`,
      });
      const grid = new THREE.LineSegments(g, m); grid.position.set(0, 0, -15); grid.frustumCulled = false; hero.add(grid);
    }

    // portrait from his own wire data
    const H = 7.6;
    const toW = (x, y, w) => [(x - 290) / 725 * H, (362 - y) / 725 * H, w * 1.9];
    const portrait = new THREE.Group(); hero.add(portrait);
    if (wire && wire.length) {
      const at = (line, x) => { // linear sample along a contour line
        if (x < line[0][0] || x > line[line.length - 1][0]) return null;
        let lo = 0, hi = line.length - 1;
        while (hi - lo > 1) { const m = (lo + hi) >> 1; if (line[m][0] <= x) lo = m; else hi = m; }
        const a = line[lo], b = line[hi], t = b[0] === a[0] ? 0 : (x - a[0]) / (b[0] - a[0]);
        return [lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
      };
      const P = [], B = [], R = [];
      for (let j = 0; j < wire.length - 1; j++) {
        const A = wire[j], C = wire[j + 1];
        const x0 = Math.max(A[0][0], C[0][0]), x1 = Math.min(A[A.length - 1][0], C[C.length - 1][0]);
        for (const s of [0, 0.34, 0.67]) for (let x = x0; x <= x1; x += 2.4) {
          const a = at(A, x), c = at(C, x); if (!a || !c) continue;
          const w = lerp(a[1], c[1], s), y = lerp(a[0], c[0], s);
          const q = toW(x, y, w); P.push(q[0], q[1], q[2]); B.push(clamp(w / 0.62)); R.push(Math.random());
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
      g.setAttribute('aB', new THREE.Float32BufferAttribute(B, 1));
      g.setAttribute('aR', new THREE.Float32BufferAttribute(R, 1));
      const m = new THREE.ShaderMaterial({
        uniforms: uni, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
        vertexShader: `attribute float aB; attribute float aR; uniform float uIntro,uDis,uTime,uGl,uPx; varying float vB; varying float vA;
          float h(float n){ return fract(sin(n)*43758.5453); }
          void main(){ vec3 p=position; float yn=p.y/${H.toFixed(1)}+0.5;
            float rev = smoothstep(0.0,0.3, uIntro*1.7 - 0.55 - (1.0-yn)*0.9 - aR*0.12);
            float row=floor(p.y*16.0); float gl = step(0.972, h(row*12.9898+floor(uTime*7.0)*78.233)) * uGl;
            p.x += gl*(h(row)-0.5)*1.4;
            float d=uDis; p += vec3((aR-0.5)*9.0,(fract(aR*7.31)-0.5)*7.0,0.0)*d*d + vec3(0.0,0.0,d*14.0*(0.3+aR));
            vec4 mv=modelViewMatrix*vec4(p,1.0); gl_Position=projectionMatrix*mv;
            gl_PointSize = max(1.0, uPx*(1.9+aB*1.4)*(11.0/-mv.z)) * rev;
            vB=aB; vA=rev*(1.0-d*0.7); }`,
        fragmentShader: `varying float vB; varying float vA;
          void main(){ vec2 c=gl_PointCoord-0.5; if(dot(c,c)>0.25) discard;
            vec3 lo=vec3(0.03,0.07,0.10), hi=vec3(0.86,0.97,1.0);
            vec3 col=mix(lo,hi,pow(vB,1.25)); col+=vec3(0.0,0.06,0.18)*smoothstep(0.55,1.0,vB);
            gl_FragColor=vec4(col, vA*(0.22+0.78*vB)); }`,
      });
      const pts = new THREE.Points(g, m); pts.frustumCulled = false; portrait.add(pts);

      // wire mesh (contours + columns)
      const L = [];
      for (let j = 0; j < wire.length; j++) { const l = wire[j]; for (let i = 0; i < l.length - 1; i++) { const a = toW(...l[i]), b = toW(...l[i + 1]); L.push(...a, ...b); } }
      for (let j = 0; j < wire.length - 1; j += 1) {
        const A = wire[j], C = wire[j + 1];
        const x0 = Math.max(A[0][0], C[0][0]), x1 = Math.min(A[A.length - 1][0], C[C.length - 1][0]);
        for (let x = x0; x <= x1; x += 18) { const a = at(A, x), c = at(C, x); if (!a || !c) continue; L.push(...toW(x, a[0], a[1]), ...toW(x, c[0], c[1])); }
      }
      const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(L, 3));
      const lm = new THREE.ShaderMaterial({
        uniforms: uni, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
        vertexShader: `uniform float uIntro,uDis; varying float vA;
          void main(){ vec3 p=position; float yn=p.y/${H.toFixed(1)}+0.5;
            float rev=smoothstep(0.0,0.25,uIntro*1.7 - (1.0-yn)*0.9);
            float fade = 1.0 - smoothstep(0.35,0.95,uIntro);
            vA = rev*(0.10+0.55*fade)*(1.0-uDis); p.z += uDis*uDis*14.0;
            gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.0); }`,
        fragmentShader: `varying float vA; void main(){ gl_FragColor=vec4(0.62,0.9,1.0,vA); }`,
      });
      const lines = new THREE.LineSegments(lg, lm); lines.frustumCulled = false; portrait.add(lines);
    }
    portrait.position.set(2.0, 0.2, -9.5);
    hero.position.set(0, 0, 0);

    /* ===================== textures ===================== */
    const tex = (c) => { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; };
    const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; };
    const PROJ = [
      ['QUARRY', 'SYSTEMS / C'], ['QUARTO', 'ML / PYTHON'], ['MC / JAVA', 'PROBABILITY'], ['INTERVAL', 'SIGNALS / PYTHON'], ['GRAIN', 'DIFFUSION'], ['RELAY RUNNER', 'LOCAL TOOLING'], ['COIL', 'REINFORCEMENT'],
      ['FOURFOLD', 'GAME SEARCH'], ['SETU', 'COMMUNITY'], ['GHATS FIELDNOTES', 'LOCAL-FIRST'], ['5AM RUNNING LOG', 'LOCAL-FIRST'], ['CAMPUS ATLAS', 'SVG'], ['V-TAPER', 'TRAINING LOG'], ['SILLY POINT', 'MQTT'],
      ['COMMITSCAPE', 'GITHUB API'], ['THE BULLETIN', 'EDITORIAL'], ['MARGINALIA', 'DOCUMENTS'], ['TWINSHIELD', 'WI-FI'], ['REPO DOCTOR', 'STATIC CHECKS'], ['WAYBACK WINDOW', 'ARCHIVES'], ['RECIPE SCALER', 'ARITHMETIC'],
    ];
    const wallTex = (() => {
      const [c, x] = mk(2240, 960); x.fillStyle = '#0b0d0f'; x.fillRect(0, 0, 2240, 960);
      const cols = 7, rows = 3, tw = 320, th = 320;
      PROJ.forEach((p, i) => {
        const cx = (i % cols) * tw, cy = Math.floor(i / cols) * th, hot = i < 4;
        const g = x.createLinearGradient(cx, cy, cx + tw, cy + th); g.addColorStop(0, hot ? '#f4f6f7' : '#1a1f23'); g.addColorStop(1, hot ? '#aeb8be' : '#0e1215');
        x.fillStyle = g; x.fillRect(cx + 10, cy + 10, tw - 20, th - 20);
        x.fillStyle = hot ? '#050607' : '#cfe3ea'; x.font = '800 30px Doto, monospace'; x.textBaseline = 'top';
        const words = p[0].split(' '); words.forEach((w, k) => x.fillText(w, cx + 28, cy + 30 + k * 34));
        x.font = '14px monospace'; x.fillStyle = hot ? '#33414a' : '#7d939d'; x.fillText(String(i + 1).padStart(2, '0') + ' / ' + p[1], cx + 28, cy + th - 48);
        x.strokeStyle = hot ? '#05060733' : '#9ed9ff22'; x.lineWidth = 1;
        for (let k = 0; k < 7; k++) { x.beginPath(); x.moveTo(cx + 28, cy + 150 + k * 12); x.lineTo(cx + 28 + 60 + ((i * 37 + k * 53) % 160), cy + 150 + k * 12); x.stroke(); }
      });
      return tex(c);
    })();

    function fitImage(x, im, X, Y, W, Hh) {
      if (!im) return; const r = Math.max(W / im.width, Hh / im.height); const w = im.width * r, h = im.height * r;
      x.save(); x.beginPath(); x.rect(X, Y, W, Hh); x.clip(); x.drawImage(im, X + (W - w) / 2, Y, w, h); x.restore();
    }
    function bigText(x, s, X, Y, size, col) { x.fillStyle = col; x.font = `800 ${size}px Doto, monospace`; x.textBaseline = 'alphabetic'; x.fillText(s, X, Y); }
    const cardTex = [];
    { // 0 QUARRY: amber
      const [c, x] = mk(1344, 840); const g = x.createLinearGradient(0, 0, 1344, 840); g.addColorStop(0, '#ffb21e'); g.addColorStop(1, '#ff5a1f'); x.fillStyle = g; x.fillRect(0, 0, 1344, 840);
      x.fillStyle = '#0a0a0a'; x.fillRect(560, 70, 700, 470); fitImage(x, imgs.qi, 572, 82, 676, 446);
      x.strokeStyle = '#00000044'; for (let i = 0; i < 24; i++) { x.beginPath(); x.moveTo(0, 40 + i * 36); x.lineTo(500, 40 + i * 36); x.stroke(); }
      bigText(x, 'QUARRY', 50, 760, 250, '#0a0a0a'); x.font = '22px monospace'; x.fillStyle = '#0a0a0a'; x.fillText('01 / SYSTEMS / C', 52, 60);
      cardTex.push(tex(c));
    }
    { // 1 QUARTO: blue
      const [c, x] = mk(1344, 840); const g = x.createLinearGradient(0, 840, 1344, 0); g.addColorStop(0, '#0a1a8a'); g.addColorStop(1, '#3d7bff'); x.fillStyle = g; x.fillRect(0, 0, 1344, 840);
      x.fillStyle = '#ffffff'; x.fillRect(64, 70, 660, 440); fitImage(x, imgs.ti, 76, 82, 636, 416);
      bigText(x, 'QUARTO', 300, 780, 250, '#ffffff'); x.font = '22px monospace'; x.fillStyle = '#fff'; x.fillText('02 / MACHINE LEARNING / PYTHON', 780, 100);
      for (let i = 0; i < 40; i++) { x.fillStyle = `rgba(255,255,255,${0.04 + (i % 5) * 0.03})`; x.fillRect(780 + (i % 8) * 70, 150 + Math.floor(i / 8) * 70, 58, 58); }
      cardTex.push(tex(c));
    }
    { // 2 MC: green scatter
      const [c, x] = mk(1344, 840); x.fillStyle = '#06130d'; x.fillRect(0, 0, 1344, 840);
      let s = 7; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
      const cx0 = 840, cy0 = 90, sz = 640;
      for (let i = 0; i < 5200; i++) { const a = rnd(), b = rnd(); const inside = a * a + b * b <= 1; x.fillStyle = inside ? '#7dffb0' : '#1f6b45'; x.fillRect(cx0 + a * sz, cy0 + (1 - b) * sz, 3, 3); }
      x.strokeStyle = '#ffffff'; x.lineWidth = 3; x.beginPath(); x.arc(cx0, cy0 + sz, sz, -Math.PI / 2, 0); x.stroke(); x.strokeRect(cx0, cy0, sz, sz);
      bigText(x, 'MONTE', 48, 520, 200, '#e9ffef'); bigText(x, 'CARLO', 48, 720, 200, '#e9ffef');
      x.font = '800 54px Doto, monospace'; x.fillStyle = '#7dffb0'; x.fillText('\u03c0 \u2248 3.14103', 840, 790); x.font = '22px monospace'; x.fillStyle = '#e9ffef'; x.fillText('03 / PROBABILITY / JAVA', 52, 60);
      cardTex.push(tex(c));
    }
    { // 3 INTERVAL: ecg
      const [c, x] = mk(1344, 840); x.fillStyle = '#12060a'; x.fillRect(0, 0, 1344, 840);
      x.strokeStyle = '#ff2f55'; x.globalAlpha = 0.16; x.lineWidth = 1; for (let i = 0; i < 1344; i += 28) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, 840); x.stroke(); } for (let i = 0; i < 840; i += 28) { x.beginPath(); x.moveTo(0, i); x.lineTo(1344, i); x.stroke(); } x.globalAlpha = 1;
      x.lineWidth = 6; x.strokeStyle = '#ff4d6d'; x.beginPath();
      for (let i = 0; i <= 1344; i += 2) { const t = (i % 336) / 336; let y = 0; if (t > .1 && t < .16) y = -22 * Math.sin((t - .1) / .06 * Math.PI); if (t > .26 && t < .3) y = 26 * ((t - .26) / .04); if (t >= .3 && t < .34) y = 26 - 300 * ((t - .3) / .04); if (t >= .34 && t < .38) y = -274 + 330 * ((t - .34) / .04); if (t > .5 && t < .66) y = -50 * Math.sin((t - .5) / .16 * Math.PI); y += Math.sin(i * .05) * 3; i ? x.lineTo(i, 330 + y) : x.moveTo(i, 330 + y); } x.stroke();
      fitImage(x, imgs.ii, 860, 480, 420, 280);
      bigText(x, 'INTERVAL', 48, 760, 210, '#ffe9ee'); x.font = '22px monospace'; x.fillStyle = '#ffd0da'; x.fillText('04 / SIGNALS / PYTHON', 52, 60);
      cardTex.push(tex(c));
    }

    /* ===================== GALLERY ===================== */
    const gallery = new THREE.Group(); scene.add(gallery);
    {
      const floor = new THREE.Mesh(new THREE.PlaneGeometry(46, 90), new THREE.MeshStandardMaterial({ color: 0x0f1113, roughness: 0.32, metalness: 0.7 }));
      floor.rotation.x = -Math.PI / 2; floor.position.set(0, 0, -75); gallery.add(floor);
      const wallMat = new THREE.MeshStandardMaterial({ color: 0x15181a, roughness: 0.9 });
      const wl = new THREE.Mesh(new THREE.PlaneGeometry(90, 14), wallMat); wl.rotation.y = Math.PI / 2; wl.position.set(-16, 7, -75); gallery.add(wl);
      const wr = wl.clone(); wr.rotation.y = -Math.PI / 2; wr.position.x = 16; gallery.add(wr);
      const ceil = new THREE.Mesh(new THREE.PlaneGeometry(32, 90), new THREE.MeshStandardMaterial({ color: 0x0b0c0d })); ceil.rotation.x = Math.PI / 2; ceil.position.set(0, 12, -75); gallery.add(ceil);
      const back = new THREE.Mesh(new THREE.PlaneGeometry(31, 13.2), new THREE.MeshBasicMaterial({ map: wallTex, toneMapped: false })); back.position.set(0, 6.8, -100); gallery.add(back);
      const strip = new THREE.MeshBasicMaterial({ color: 0xdfeaf0 });
      for (let i = 0; i < 9; i++) { const s = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.06, 7), strip); s.position.set(-6, 11.9, -40 - i * 7); gallery.add(s); const s2 = s.clone(); s2.position.x = 6; gallery.add(s2); }
      const bench = new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 0.3, metalness: 0.5 });
      for (let i = 0; i < 3; i++) { const b = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.7, 12), bench); b.position.set((i - 1) * 8, 0.35, -66 - i * 3); gallery.add(b); }
      const frames = [[imgs.qi, -12, -82, 0.35], [imgs.ti, 12, -82, -0.35], [imgs.ii, 0, -90, 0]];
      frames.forEach(([im, x, z, ry], k) => {
        if (!im) return; const [c, cx] = mk(1024, 704); cx.fillStyle = '#111'; cx.fillRect(0, 0, 1024, 704); fitImage(cx, im, 0, 0, 1024, 704);
        const m = new THREE.Mesh(new THREE.PlaneGeometry(k === 2 ? 9 : 7, k === 2 ? 6.2 : 4.8), new THREE.MeshBasicMaterial({ map: tex(c) })); m.position.set(x, k === 2 ? 4.4 : 3.2, z); m.rotation.y = ry; gallery.add(m);
        const fr = new THREE.Mesh(new THREE.PlaneGeometry(k === 2 ? 9.3 : 7.3, k === 2 ? 6.5 : 5.1), new THREE.MeshBasicMaterial({ color: 0xffffff })); fr.position.copy(m.position); fr.position.z -= 0.02; fr.rotation.y = ry; gallery.add(fr);
      });
    }

    /* ===================== SWOOP: tilted project cards in a white void ===================== */
    const swoop = new THREE.Group(); scene.add(swoop);
    const cardPos = [[4.3, -112, -0.3, 0.1, 0.1], [-4.3, -127, 0.3, -0.1, -0.1], [4.3, -142, -0.3, 0.08, 0.1], [-4.3, -157, 0.3, -0.08, -0.12]];
    const cards = cardPos.map(([x, z, ry, rx, rz], i) => {
      const dark = new THREE.MeshBasicMaterial({ color: 0x111111 });
      const face = new THREE.MeshBasicMaterial({ map: cardTex[i] });
      const m = new THREE.Mesh(new THREE.BoxGeometry(8.4, 5.25, 0.14), [dark, dark, dark, dark, face, dark]);
      m.position.set(x, 0, z); m.rotation.set(rx, ry, rz); m.userData.card = i; swoop.add(m); return m;
    });
    const CARD_URL = ['https://aditya2375.github.io/quarry/', 'https://aditya2375.github.io/quarto-gpt/', 'https://github.com/Aditya2375/mc-java', 'https://aditya2375.github.io/interval-ecg/'];
    { // blue-white shards for depth and parallax
      const [c, x] = mk(256, 256); const g = x.createLinearGradient(0, 0, 256, 256); g.addColorStop(0, '#e8f1ff'); g.addColorStop(0.5, '#5b8cff'); g.addColorStop(1, '#1b36d8'); x.fillStyle = g; x.fillRect(0, 0, 256, 256);
      const t = tex(c); const mat = new THREE.MeshBasicMaterial({ map: t, side: THREE.DoubleSide });
      let s = 11; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
      for (let i = 0; i < 26; i++) { const m = new THREE.Mesh(new THREE.PlaneGeometry(1 + rnd() * 3, 0.5 + rnd() * 1.6), mat); m.position.set((rnd() - 0.5) * 22, (rnd() - 0.5) * 12, -102 - rnd() * 72); m.rotation.set(rnd() * 3, rnd() * 3, rnd() * 3); m.userData.spin = (rnd() - 0.5) * 0.4; swoop.add(m); }
    }

    /* ===================== TUNNEL / HALL ===================== */
    const tunnel = new THREE.Group(); scene.add(tunnel);
    const Z0 = -190, Z1 = -490, LEN = Z0 - Z1;
    const tm = { rack: new THREE.MeshStandardMaterial({ color: 0x2b3238, roughness: 0.55, metalness: 0.6 }), floor: new THREE.MeshStandardMaterial({ color: 0x0b0e11, roughness: 0.35, metalness: 0.7 }), steel: new THREE.MeshStandardMaterial({ color: 0x8b98a2, roughness: 0.35, metalness: 0.8 }) };
    const dummy = new THREE.Object3D();
    const fl = new THREE.Mesh(new THREE.PlaneGeometry(11, LEN), tm.floor); fl.rotation.x = -Math.PI / 2; fl.position.set(0, 0, (Z0 + Z1) / 2); tunnel.add(fl);
    const ce = new THREE.Mesh(new THREE.PlaneGeometry(11, LEN), new THREE.MeshStandardMaterial({ color: 0x07090b, roughness: 1 })); ce.rotation.x = Math.PI / 2; ce.position.set(0, 4.6, (Z0 + Z1) / 2); tunnel.add(ce);
    const steps = Math.floor(LEN / 1.25);
    const racks = new THREE.InstancedMesh(new THREE.BoxGeometry(1.1, 4.3, 1.05), tm.rack, steps * 2);
    let s = 3; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < steps; i++) for (const sd of [-1, 1]) { dummy.position.set(sd * (3.6 + (rnd() < 0.12 ? 0.25 : 0)), 2.15, Z0 - i * 1.25); dummy.rotation.set(0, 0, 0); dummy.scale.set(1, 0.9 + rnd() * 0.18, 1); dummy.updateMatrix(); racks.setMatrixAt(i * 2 + (sd > 0 ? 1 : 0), dummy.matrix); racks.setColorAt(i * 2 + (sd > 0 ? 1 : 0), new THREE.Color().setHSL(0.58, 0.12, 0.7 + rnd() * 0.5)); }
    tunnel.add(racks);
    const ledN = steps * 2 * 7;
    const leds = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.1, 0.06), new THREE.MeshBasicMaterial({ toneMapped: false }), ledN);
    const ledCols = [0x39ff88, 0xffa42b, 0xff3b30, 0x7dd3ff]; let li = 0;
    for (let i = 0; i < steps; i++) for (const sd of [-1, 1]) for (let k = 0; k < 7; k++) { if (rnd() < 0.35) { dummy.scale.set(0, 0, 0); } else { dummy.scale.set(1, 1, 1); } dummy.position.set(sd * 3.01, 0.5 + rnd() * 3.5, Z0 - i * 1.25 - 0.3 + rnd() * 0.6); dummy.rotation.set(0, -sd * Math.PI / 2, 0); dummy.updateMatrix(); leds.setMatrixAt(li, dummy.matrix); leds.setColorAt(li, new THREE.Color(ledCols[Math.floor(rnd() * ledCols.length)])); li++; }
    tunnel.add(leds);
    for (const sd of [-1, 1]) { const r = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, LEN), tm.steel); r.position.set(sd * 0.75, 0.05, (Z0 + Z1) / 2); tunnel.add(r); }
    const sl = new THREE.InstancedMesh(new THREE.BoxGeometry(2.3, 0.08, 0.22), new THREE.MeshStandardMaterial({ color: 0x1b1f23, roughness: 0.8 }), Math.floor(LEN / 1.2));
    for (let i = 0; i < sl.count; i++) { dummy.position.set(0, 0.03, Z0 - i * 1.2); dummy.rotation.set(0, 0, 0); dummy.scale.set(1, 1, 1); dummy.updateMatrix(); sl.setMatrixAt(i, dummy.matrix); }
    tunnel.add(sl);
    const beamN = Math.floor(LEN / 6);
    const beams = new THREE.InstancedMesh(new THREE.BoxGeometry(9.5, 0.22, 0.3), tm.steel, beamN);
    const strips = new THREE.InstancedMesh(new THREE.BoxGeometry(0.16, 0.05, 3.2), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), beamN * 2);
    for (let i = 0; i < beamN; i++) { dummy.position.set(0, 4.45, Z0 - i * 6); dummy.updateMatrix(); beams.setMatrixAt(i, dummy.matrix); for (const k of [0, 1]) { dummy.position.set(k ? 1.6 : -1.6, 4.5, Z0 - i * 6 - 3); dummy.updateMatrix(); strips.setMatrixAt(i * 2 + k, dummy.matrix); } }
    tunnel.add(beams, strips);
    const pipeMat = new THREE.MeshStandardMaterial({ color: 0x66727a, roughness: 0.4, metalness: 0.9 });
    for (const sd of [-1, 1]) for (const y of [3.7, 4.0]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, LEN, 10), pipeMat); p.rotation.x = Math.PI / 2; p.position.set(sd * 2.6, y, (Z0 + Z1) / 2); tunnel.add(p); }
    // blue shaft
    const shaftMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uA: { value: 0 } },
      vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
      fragmentShader: `uniform float uA; varying vec2 vUv; void main(){ float x=abs(vUv.x-0.5)*2.0; float core=exp(-x*x*9.0); float halo=exp(-x*x*2.2)*0.5; float v=(core+halo)*smoothstep(0.0,0.15,vUv.y)*smoothstep(1.0,0.75,vUv.y); gl_FragColor=vec4(mix(vec3(0.2,0.45,1.0),vec3(0.9,0.97,1.0),core)*v*uA,v*uA); }`,
    });
    const shaft = new THREE.Mesh(new THREE.PlaneGeometry(9, 15), shaftMat); shaft.position.set(0, 4.5, -402); tunnel.add(shaft);
    const shaft2 = new THREE.Mesh(new THREE.PlaneGeometry(26, 26), shaftMat); shaft2.position.set(0, 4, -404); tunnel.add(shaft2);
    // red hall machinery
    const redMat = new THREE.MeshStandardMaterial({ color: 0x4a0a05, roughness: 0.45, metalness: 0.75, emissive: 0x2a0402 });
    const rings = [];
    for (let i = 0; i < 34; i++) { const r = new THREE.Mesh(new THREE.TorusGeometry(2.6 + rnd() * 1.4, 0.04 + rnd() * 0.07, 8, 40), redMat); r.position.set((rnd() - 0.5) * 7, 1.2 + rnd() * 3, -412 - i * 2.2); r.rotation.set(rnd() * 3.1, rnd() * 3.1, rnd() * 3.1); r.userData.sp = (rnd() - 0.5) * 0.5; rings.push(r); tunnel.add(r); }
    const endWall = new THREE.Mesh(new THREE.PlaneGeometry(12, 6), new THREE.MeshBasicMaterial({ color: 0x3a0603 })); endWall.position.set(0, 2.3, -489); tunnel.add(endWall);

    /* ===================== camera timeline ===================== */
    const SEG = [
      [0.0, [[0.00, 0, 0, 3.4, 0, 0, -9, 0, 38], [0.06, 0, 0, 0.6, 0, 0.1, -9, 0, 38], [0.115, 0, 0, -5.5, 0, 0.2, -9.5, 0.03, 46]]],
      [0.125, [[0.125, 0, 1.5, -46, 0, 1.7, -80, 0, 50], [0.2, -0.6, 1.6, -58, 0.6, 2.2, -85, -0.04, 50], [0.26, 0.4, 1.7, -68, -0.3, 2.2, -90, 0.03, 52], [0.3, 0, 1.8, -76, 0, 2.4, -95, 0, 55]]],
      [0.3, [[0.3, 0, 0.3, -100, 3, 0, -112, 0.12, 50], [0.36, -1, 0.1, -103.5, 2.4, 0, -112, -0.05, 50], [0.415, 1, 0.1, -118.5, -2.4, 0, -127, 0.06, 50], [0.47, -1, 0.1, -133.5, 2.4, 0, -142, -0.06, 50], [0.525, 1, 0.1, -148.5, -2.4, 0, -157, 0.06, 50], [0.58, 0, 0, -172, 0, 0, -195, 0, 52]]],
      [0.585, [[0.585, 0, 1.4, -200, 0, 1.5, -230, 0, 62], [0.68, 0, 1.3, -262, 0, 1.4, -292, 0, 62], [0.76, 0.2, 1.5, -325, 0, 1.6, -355, 0.02, 62], [0.82, 0, 1.5, -372, 0, 2.2, -402, 0, 62], [0.86, 0.4, 2.4, -392, 0, 0.8, -418, 0.45, 72], [0.9, 0, 1.7, -418, 0, 1.7, -448, 0.1, 64], [0.96, 0, 1.5, -440, 0, 1.6, -470, 0, 58], [1.0, 0, 1.5, -446, 0, 1.6, -476, 0, 54]]],
    ];
    const cr = (a, b, c, d, t) => 0.5 * ((2 * b) + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (-a + 3 * b - 3 * c + d) * t * t * t);
    const out = new Array(8);
    function evalCam(p) {
      let seg = SEG[0][1];
      for (const [start, keys] of SEG) if (p >= start) seg = keys;
      const k = seg; let i = 0;
      while (i < k.length - 2 && p > k[i + 1][0]) i++;
      const t = clamp((p - k[i][0]) / (k[i + 1][0] - k[i][0]));
      const a = k[Math.max(0, i - 1)], b = k[i], c = k[i + 1], d = k[Math.min(k.length - 1, i + 2)];
      for (let j = 0; j < 8; j++) out[j] = cr(a[j + 1], b[j + 1], c[j + 1], d[j + 1], t);
      return out;
    }

    /* ===================== atmosphere keys ===================== */
    const ZONES = [ // from p, bg, fogDensity, light colour, light power, ambient
      [0.0, 0x000000, 0.0, 0x9cd8ff, 0, 0.0],
      [0.125, 0x0a0b0d, 0.010, 0xe6f2ff, 120, 0.7],
      [0.3, 0xf1f1ee, 0.0075, 0xffffff, 0, 1.0],
      [0.585, 0x0a1118, 0.028, 0x8fb6ff, 90, 0.35],
      [0.78, 0x0a1118, 0.030, 0x8fb6ff, 90, 0.35],
      [0.84, 0x1a4a9a, 0.040, 0xaed0ff, 150, 0.5],
      [0.875, 0x0b1e48, 0.036, 0x7aa6ff, 120, 0.4],
      [0.905, 0x3a0705, 0.030, 0xff3b14, 140, 0.45],
      [1.0, 0x2a0402, 0.026, 0xff3a12, 140, 0.45],
    ];
    const c1 = new THREE.Color(), c2 = new THREE.Color();
    function atmos(p) {
      let i = 0; while (i < ZONES.length - 2 && p >= ZONES[i + 1][0]) i++;
      const a = ZONES[i], b = ZONES[i + 1];
      // hard zone cuts happen under flashes; blend only inside tunnel zones
      const hard = (a[0] === 0 || a[0] === 0.125 || a[0] === 0.3);
      const t = hard ? 0 : sm((p - a[0]) / (b[0] - a[0]));
      c1.setHex(a[1]); c2.setHex(b[1]); c1.lerp(c2, t);
      scene.background.copy(c1); scene.fog.color.copy(c1); scene.fog.density = lerp(a[2], b[2], t);
      c1.setHex(a[3]); c2.setHex(b[3]); key.color.copy(c1.lerp(c2, t)); key.intensity = lerp(a[4], b[4], t); amb.intensity = lerp(a[5], b[5], t);
      amb.color.setHex(a[0] === 0.3 ? 0xffffff : 0xb8c8ff);
    }

    /* ===================== DOM wiring ===================== */
    const pans = [...document.querySelectorAll('.pan')].map((el) => ({ el, a: +el.dataset.a, b: +el.dataset.b, card: el.dataset.card != null ? +el.dataset.card : -1, st: 0 }));
    const flash = $('#flash'), pct = $('#pct'), hint = $('#hint'), loader = $('#loader'), track = $('#track');
    const state = { p: 0, target: 0, intro: 0, introStart: -1, mx: 0, my: 0, smx: 0, smy: 0, activeCard: -1, ready: false };
    const hov = new THREE.Raycaster(), ndc = new THREE.Vector2();

    function resize() {
      const w = innerWidth, h = innerHeight; renderer.setSize(w, h, false); camera.aspect = w / h; state.portrait = w / h < 0.9; camera.updateProjectionMatrix();
      portrait.position.x = state.portrait ? 0.4 : 2.0; portrait.scale.setScalar(state.portrait ? 0.85 : 1);
    }
    addEventListener('resize', resize); resize();
    addEventListener('pointermove', (e) => { state.mx = (e.clientX / innerWidth - 0.5) * 2; state.my = (e.clientY / innerHeight - 0.5) * 2; ndc.set(state.mx, -state.my); });
    const readScroll = () => { const m = Math.max(1, document.documentElement.scrollHeight - innerHeight); state.target = clamp(scrollY / m); };
    addEventListener('scroll', readScroll, { passive: true }); readScroll();
    state.p = state.target;

    // in-page jump (LET'S TALK)
    document.querySelectorAll('[data-jump]').forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); scrollTo({ top: document.documentElement.scrollHeight, behavior: reduce || paused ? 'auto' : 'smooth' }); }));
    // click a card in the 3D scene to open it
    addEventListener('click', (e) => {
      if (!menu.hidden || e.target.closest('a,button,nav')) return;
      if (state.p < 0.3 || state.p > 0.58) return;
      hov.setFromCamera(new THREE.Vector2((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1), camera);
      const hit = hov.intersectObjects(cards, false)[0];
      if (hit && hit.object.userData.card === state.activeCard) window.open(CARD_URL[state.activeCard], '_blank', 'noopener,noreferrer');
    });

    const tmpV = new THREE.Vector3();
    function frame(p, time) {
      // light/dark tone, zone visibility
      const light = p >= 0.3 && p < 0.585; body.classList.toggle('light', light);
      hero.visible = p < 0.125; gallery.visible = p >= 0.125 && p < 0.3; swoop.visible = p >= 0.3 && p < 0.585; tunnel.visible = p >= 0.585;
      atmos(p);
      uni.uTime.value = time; uni.uIntro.value = state.intro; uni.uDis.value = sm((p - 0.045) / 0.07); uni.uGl.value = paused ? 0 : 1;
      // flashes
      const f = Math.max(bell(p, 0.125, 0.016), bell(p, 0.3, 0.014), bell(p, 0.585, 0.014), bell(p, 0.845, 0.02));
      flash.style.opacity = String(Math.pow(f, 1.4));
      flash.style.background = p > 0.8 ? '#cfe4ff' : '#ffffff';
      // camera
      const k = evalCam(p);
      const px = paused ? 0 : state.smx, py = paused ? 0 : state.smy;
      camera.fov = k[7] * (state.portrait ? 1.35 : 1); camera.updateProjectionMatrix();
      camera.position.set(k[0] + px * 0.35, k[1] - py * 0.2, k[2]);
      camera.up.set(Math.sin(k[6]), Math.cos(k[6]), 0);
      camera.lookAt(k[3] + px * 0.5, k[4] - py * 0.3, k[5]);
      key.position.copy(camera.position); key.position.y += 1.2;
      // hero parallax
      portrait.rotation.y = -0.18 + (paused ? 0 : px * 0.12); portrait.rotation.x = paused ? 0 : py * 0.05;
      // cards: active card by p window
      state.activeCard = -1; if (p >= 0.3 && p < 0.585) { let best = 1e9; cards.forEach((c, i) => { const d = Math.abs(p - (0.36 + 0.055 * i)); if (d < best) { best = d; state.activeCard = i; } }); }
      if (!paused) { cards.forEach((c, i) => { c.position.y = Math.sin(time * 0.6 + i) * 0.08; }); swoop.children.forEach((m) => { if (m.userData.spin) { m.rotation.x += m.userData.spin * 0.004; m.rotation.y += m.userData.spin * 0.003; } }); rings.forEach((r) => { r.rotation.x += r.userData.sp * 0.004; r.rotation.z += r.userData.sp * 0.003; }); }
      shaftMat.uniforms.uA.value = bell(p, 0.855, 0.05) * 1.2;
      // panels
      for (const pn of pans) {
        const fade = 0.016; let o = (pn.a <= 0 ? 1 : sm((p - pn.a) / fade)) * (1 - sm((p - pn.b + fade) / fade));
        if (pn.card >= 0 && state.activeCard >= 0 && pn.card !== state.activeCard) o = Math.min(o, 0.0);
        if (Math.abs(o - pn.st) > 0.004 || (o === 0) !== (pn.st === 0)) {
          pn.st = o; pn.el.style.opacity = o.toFixed(3); pn.el.classList.toggle('on', o > 0.01); pn.el.classList.toggle('live', o > 0.6);
          pn.el.style.translate = `0 ${((1 - o) * 14).toFixed(1)}px`;
        }
      }
      pct.textContent = String(Math.round(p * 100)).padStart(3, '0');
      hint.style.opacity = p < 0.02 ? '1' : '0';
      renderer.render(scene, camera);
    }

    // make the track tall enough regardless of CSS support
    track.style.height = (innerWidth < 760 ? 1500 : 2000) + 'vh';

    let last = performance.now(), t0 = last;
    function loop(now) {
      requestAnimationFrame(loop);
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      if (state.ready && state.introStart < 0) state.introStart = now;
      state.intro = state.introStart < 0 ? 0 : (paused ? 1 : clamp((now - state.introStart) / 4600));
      const rate = paused ? 40 : 5.2;
      state.p += (state.target - state.p) * (1 - Math.exp(-dt * rate));
      state.smx += (state.mx - state.smx) * (1 - Math.exp(-dt * 3)); state.smy += (state.my - state.smy) * (1 - Math.exp(-dt * 3));
      frame(state.p, (now - t0) / 1000);
    }
    requestAnimationFrame(loop);
    setTimeout(() => { loader.classList.add('gone'); state.ready = true; setTimeout(() => { loader.hidden = true; }, 900); }, 500);

    window.__ditto = { render(p, intro = 1) { state.p = p; state.target = p; state.intro = intro; state.ready = true; state.introStart = 1; frame(p, 3.1); }, state };
  }
}
