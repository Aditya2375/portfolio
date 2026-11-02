/* Triangle cursor + shard trail.
   A small triangle replaces the pointer, sheds a chain of tiny triangles
   that swirl behind fast movement, bursts on click, and leans toward
   interactive elements. Fine pointers only; touch keeps the native cursor. */
(function () {
  'use strict';

  var fine = window.matchMedia && window.matchMedia('(pointer: fine)').matches;
  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!fine || reduced) return;

  var doc = document, root = doc.documentElement;

  /* ---- theme palette (re-read when the theme flips) ---- */
  var COL = { cursor: '#EDECEA', hover: '#A795F0', trail: ['#A795F0', '#C9BFFF', '#7E6BC4', '#EDECEA'] };
  function readTheme() {
    var cs = getComputedStyle(root);
    var accent = (cs.getPropertyValue('--clr-accent') || '#A795F0').trim();
    var ink = (cs.getPropertyValue('--clr-text') || '#EDECEA').trim();
    COL.cursor = ink;
    COL.hover = accent;
    COL.trail = root.getAttribute('data-theme') === 'light'
      ? [accent, '#6E5BC0', '#C9BFFF', ink]
      : [accent, '#C9BFFF', '#7E6BC4', ink];
  }
  readTheme();
  new MutationObserver(readTheme).observe(root, { attributes: true, attributeFilter: ['data-theme'] });

  /* ---- canvas ---- */
  var canvas = doc.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  canvas.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;pointer-events:none;z-index:2147483000;';
  var ctx = canvas.getContext('2d');
  var hideNative = doc.createElement('style');
  hideNative.textContent = 'html.ak-cursor-on, html.ak-cursor-on * { cursor: none !important; }';
  doc.head.appendChild(hideNative);
  var DPR = 1, VW = 0, VH = 0;
  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    VW = window.innerWidth; VH = window.innerHeight;
    canvas.width = Math.round(VW * DPR);
    canvas.height = Math.round(VH * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }
  resize();
  window.addEventListener('resize', resize);

  /* ---- pointer state ---- */
  var px = -100, py = -100;        // true pointer
  var cx = -100, cy = -100;        // drawn cursor (slight lag for weight)
  var vx = 0, vy = 0;              // pointer velocity (px/frame, smoothed)
  var seen = false;                // first move happened
  var hovering = false;
  var down = false;
  var lastX = 0, lastY = 0;

  var INTERACTIVE = 'a, button, [role="button"], input, textarea, select, label, summary, [data-cursor="hover"]';

  doc.addEventListener('pointermove', function (e) {
    if (e.pointerType !== 'mouse') return;
    if (!seen) { seen = true; cx = px = e.clientX; cy = py = e.clientY; lastX = px; lastY = py; root.classList.add('ak-cursor-on'); }
    px = e.clientX; py = e.clientY;
  }, { passive: true });

  doc.addEventListener('pointerover', function (e) {
    if (e.pointerType !== 'mouse') return;
    hovering = !!(e.target && e.target.closest && e.target.closest(INTERACTIVE));
  }, { passive: true });

  doc.addEventListener('pointerdown', function (e) {
    if (e.pointerType !== 'mouse') return;
    down = true;
    burst(e.clientX, e.clientY);
  }, { passive: true });
  doc.addEventListener('pointerup', function () { down = false; }, { passive: true });
  doc.documentElement.addEventListener('pointerleave', function () { seen = false; root.classList.remove('ak-cursor-on'); });
  doc.documentElement.addEventListener('pointerenter', function (e) { if (e.pointerType === 'mouse') { seen = true; root.classList.add('ak-cursor-on'); } });

  /* ---- trail chain (the swirl) ---- */
  var CHAIN = 12;
  var chain = [];
  for (var i = 0; i < CHAIN; i++) chain.push({ x: -100, y: -100, a: -Math.PI / 4 });

  /* ---- shard pool (confetti) ---- */
  var MAXS = 130;
  var shards = [];
  function spawn(x, y, vx0, vy0, big) {
    if (shards.length >= MAXS) shards.shift();
    var life = 0.45 + Math.random() * 0.5;
    shards.push({
      x: x, y: y,
      vx: vx0 + (Math.random() - 0.5) * 1.6,
      vy: vy0 + (Math.random() - 0.5) * 1.6,
      s: (big ? 4.5 : 2.6) + Math.random() * 3,
      a: Math.random() * Math.PI * 2,
      va: (Math.random() - 0.5) * 0.35,
      t: 0, life: life,
      c: COL.trail[(Math.random() * COL.trail.length) | 0]
    });
  }
  function burst(x, y) {
    for (var k = 0; k < 14; k++) {
      var ang = (k / 14) * Math.PI * 2 + Math.random() * 0.4;
      var sp = 2 + Math.random() * 4.5;
      spawn(x, y, Math.cos(ang) * sp, Math.sin(ang) * sp, true);
    }
  }

  /* ---- magnetic elements ----
     Links and buttons lean a few px toward the pointer. Element list and
     rects are cached and rebuilt on scroll/resize/DOM change, so the frame
     loop only does arithmetic. */
  var MAG_SEL = 'a, button, [role="button"], .menu-trigger, summary';
  var magEls = [];
  function rebuildMagnets() {
    var list = doc.querySelectorAll(MAG_SEL);
    magEls = [];
    for (var i = 0; i < list.length; i++) {
      var r = list[i].getBoundingClientRect();
      if (r.width > 0 && r.height > 0) {
        magEls.push({ el: list[i], x: r.left + r.width / 2, y: r.top + r.height / 2, rad: Math.max(r.width, r.height) * 0.9 + 24 });
      }
    }
  }
  var magTimer = null;
  function scheduleMagnetRebuild() {
    if (magTimer) return;
    magTimer = setTimeout(function () { magTimer = null; rebuildMagnets(); }, 120);
  }
  window.addEventListener('scroll', scheduleMagnetRebuild, { passive: true, capture: true });
  window.addEventListener('resize', scheduleMagnetRebuild);
  new MutationObserver(scheduleMagnetRebuild).observe(doc.body, { childList: true, subtree: true });
  rebuildMagnets();

  function applyMagnets() {
    for (var i = 0; i < magEls.length; i++) {
      var m = magEls[i];
      var dx = px - m.x, dy = py - m.y;
      var d = Math.sqrt(dx * dx + dy * dy);
      if (seen && d < m.rad && d > 0.01) {
        var pull = (1 - d / m.rad) * 6;
        m.el.style.transform = 'translate3d(' + (dx / d * pull).toFixed(2) + 'px,' + (dy / d * pull).toFixed(2) + 'px,0)';
      } else if (m.el.style.transform) {
        m.el.style.transform = '';
      }
    }
  }

  /* ---- triangle drawing ---- */
  function tri(x, y, size, ang, color, alpha) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(ang);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(size, 0);
    ctx.lineTo(-size * 0.7, size * 0.62);
    ctx.lineTo(-size * 0.7, -size * 0.62);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  /* ---- main loop ---- */
  var running = true;
  doc.addEventListener('visibilitychange', function () { running = !doc.hidden; if (running) requestAnimationFrame(tick); });

  var spawnAcc = 0;
  function tick() {
    if (!running) return;
    ctx.clearRect(0, 0, VW, VH);

    // velocity from pointer delta
    var nvx = px - lastX, nvy = py - lastY;
    lastX = px; lastY = py;
    vx += (nvx - vx) * 0.35; vy += (nvy - vy) * 0.35;
    var speed = Math.hypot(vx, vy);

    // cursor follows with a touch of lag
    cx += (px - cx) * 0.55; cy += (py - cy) * 0.55;

    if (seen) {
      // chain followers: each chases the previous point
      var tx = cx, ty = cy;
      for (var i = 0; i < CHAIN; i++) {
        var p = chain[i];
        var k = 0.42 - i * 0.022;
        var ox = p.x, oy = p.y;
        p.x += (tx - p.x) * k; p.y += (ty - p.y) * k;
        var moved = Math.hypot(p.x - ox, p.y - oy);
        if (moved > 0.4) p.a = Math.atan2(p.y - oy, p.x - ox);
        var sz = 6.5 - i * 0.36;
        var fade = Math.max(0.12, 0.85 - i * 0.062);
        var col = COL.trail[i % (COL.trail.length - 1)];
        tri(p.x, p.y, sz, p.a, col, fade);
        tx = p.x; ty = p.y;
      }

      // speed-based shard spray
      spawnAcc += Math.min(speed * 0.09, 3);
      while (spawnAcc >= 1) { spawnAcc -= 1; spawn(cx, cy, vx * 0.22, vy * 0.22, false); }

      // shards
      for (var s = shards.length - 1; s >= 0; s--) {
        var p2 = shards[s];
        p2.t += 1 / 60;
        if (p2.t >= p2.life) { shards.splice(s, 1); continue; }
        p2.vx *= 0.965; p2.vy *= 0.965;
        p2.vy -= 0.012; // gentle lift
        p2.x += p2.vx; p2.y += p2.vy;
        p2.a += p2.va;
        var u = 1 - p2.t / p2.life;
        tri(p2.x, p2.y, p2.s * (0.35 + 0.65 * u), p2.a, p2.c, u * 0.9);
      }

      // the cursor triangle itself
      var ang = -Math.PI / 4;
      if (speed > 1.2) ang = Math.atan2(vy, vx);
      var size = hovering ? 10.5 : 8;
      tri(cx, cy, down ? size * 0.8 : size, ang, hovering ? COL.hover : COL.cursor, 1);
    }

    applyMagnets();
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
})();
