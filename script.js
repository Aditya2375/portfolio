// =====================================================
// script.js — all JavaScript for the portfolio.
//
// Every feature in this file is progressive enhancement:
// with script.js deleted, the pure HTML/CSS site works
// exactly the same. JS only layers interactions on top.
// =====================================================
'use strict';

/* ─── GLOBAL STATE ─────────────────────────────────────────
   The sound choice lives on window (window.SOUND_ON) so every
   feature can read it, and in sessionStorage so it survives
   page changes within one visit — the intro only shows once. */
window.SOUND_ON = sessionStorage.getItem('soundChoice') !== 'off'; /* V4: audio defaults ON; the bottom-left toggle is the off switch */
const REDUCED_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
document.body.classList.add(window.SOUND_ON ? 'sound-on' : 'sound-off');

/* Current page id from <body data-page="..."> — drives the
   per-page soundtrack map below. */
const PAGE_ID = document.body.dataset.page || 'home';

/* Each page opens on its own track (Prompt 13 maps sections
   within the page onto the same engine). */
const PAGE_TRACKS = {
  home:      'assets/music/hero.mp3',
  academics: 'assets/music/education.mp3',
  projects:  'assets/music/projects.mp3',
  beyond:    'assets/music/about.mp3',
  community: 'assets/music/skills.mp3',
};

/* ─── SFX HELPER ───────────────────────────────────────────
   One-shot effects (hover blips, scramble ticks, sweeps).
   A fresh Audio per call lets effects overlap naturally.
   Hard rule: nothing plays while the sound choice is off. */
function playSfx(src, volume = 0.25) {
  if (!window.SOUND_ON) return;
  const a = new Audio(src);
  a.volume = volume;
  a.play().catch(() => { /* ignore pre-gesture autoplay rejections */ });
}

/* ─── MUSIC ENGINE (two decks) ─────────────────────────────
   Two <audio> decks (A/B) so every track change is a real
   crossfade: the old deck's gain ramps down while the new
   deck's gain ramps up over ~500ms.
   All volume changes run through a Web Audio GainNode, because
   iPhones and iPads IGNORE audio.volume set from JavaScript —
   a GainNode is the only volume control that works everywhere.
   If the Web Audio API is missing, we fall back to audio.volume. */
const musicEngine = (() => {
  const decks = [new Audio(), new Audio()];
  decks.forEach(d => { d.loop = true; d.preload = 'auto'; });
  let active = 0;           // index of the currently audible deck
  let currentTrack = null;  // src playing on the audible deck
  let ctx = null;
  let gains = [];
  const TARGET = 0.18;      // quiet background-music loudness
  /* Mute persists across pages of one visit via sessionStorage, so
     muting on one page keeps the whole site muted on the next. */
  let muted = sessionStorage.getItem('muted') === '1';
  const targetVolume = () => (muted ? 0 : TARGET);

  /* Must be called inside a user gesture the first time:
     browsers suspend AudioContexts created without one. */
  function ensureContext() {
    if (ctx || !window.AudioContext) return;
    try {
      ctx = new AudioContext();
      gains = decks.map(d => {
        const g = ctx.createGain();
        g.gain.value = 0;
        ctx.createMediaElementSource(d).connect(g).connect(ctx.destination);
        return g;
      });
    } catch (e) { ctx = null; }
  }

  function setDeckVolume(i, v, rampMs = 500) {
    if (ctx) {
      const t = ctx.currentTime;
      gains[i].gain.cancelScheduledValues(t);
      gains[i].gain.setValueAtTime(gains[i].gain.value, t);
      gains[i].gain.linearRampToValueAtTime(v, t + rampMs / 1000);
    } else {
      decks[i].volume = v; // fallback for browsers without Web Audio
    }
  }

  function playTrack(src, { loop = true } = {}) {
    if (ctx && ctx.state === 'suspended') ctx.resume();
    const d = decks[active];
    d.loop = loop;
    if (d.getAttribute('src') !== src) d.src = src;
    const p = d.play();
    setDeckVolume(active, targetVolume(), 300);
    currentTrack = src;
    return p; // a Promise — callers catch autoplay rejection
  }

  function crossfadeTo(src) {
    if (src === currentTrack) return;
    const old = active;
    active = 1 - active;
    const next = decks[active];
    next.loop = true;
    next.src = src;
    if (ctx && ctx.state === 'suspended') ctx.resume();
    next.play().catch(() => {});
    setDeckVolume(old, 0, 500);                  // old track ramps down...
    setDeckVolume(active, targetVolume(), 500);  // ...while the new one ramps up
    currentTrack = src;
  }

  /* Mute is a gain ramp to 0 (and back), never a pause — the track
     position keeps moving so unmuting rejoins mid-song. */
  function setMuted(m) {
    muted = m;
    sessionStorage.setItem('muted', m ? '1' : '0');
    setDeckVolume(active, targetVolume(), 300);
  }

  return {
    ensureContext,
    playTrack,
    crossfadeTo,
    setMuted,
    isMuted: () => muted,
    get currentTrack() { return currentTrack; },
  };
})();

/* Start this page's own track; if the browser blocks audio after
   a page change (no fresh gesture), offer the TAP FOR SOUND chip. */
function startPageMusic() {
  musicEngine.ensureContext();
  const p = musicEngine.playTrack(PAGE_TRACKS[PAGE_ID] || PAGE_TRACKS.home);
  if (p && p.catch) p.catch(() => showTapForSound());
}

/* V4: audio defaults to on, but Chrome still demands one gesture per
   document before sound may start. Arm a one-time unlock: the first
   tap or keypress anywhere starts this page's track and clears the
   TAP FOR SOUND chip if it had appeared. */
function armGestureUnlock() {
  const retry = () => {
    removeEventListener('pointerdown', retry);
    removeEventListener('keydown', retry);
    if (!window.SOUND_ON || musicEngine.currentTrack) return;
    const chip = document.querySelector('.tap-sound');
    if (chip) chip.remove();
    startPageMusic();
  };
  addEventListener('pointerdown', retry);
  addEventListener('keydown', retry);
}

function showTapForSound() {
  if (document.querySelector('.tap-sound')) return;
  const chip = document.createElement('button');
  chip.type = 'button';
  chip.className = 'tap-sound';
  chip.textContent = 'TAP FOR SOUND';
  chip.addEventListener('click', () => {
    musicEngine.ensureContext();
    musicEngine.playTrack(PAGE_TRACKS[PAGE_ID] || PAGE_TRACKS.home);
    chip.remove();
  }, { once: true });
  document.body.appendChild(chip);
}

/* ─── PROMPT 10: INTRO SCREEN WITH SOUND CHOICE ─────────────
   The overlay markup is injected from JS, so with script.js
   deleted the site loads normally and there is no overlay.
   It shows only on the FIRST page of a visit: the ENTER choice
   goes to sessionStorage and every later page skips straight in. */
(function initIntro() {
  /* Later page of the visit: the stored choice rules - start the music,
     and if Chrome blocks autoplay without a fresh gesture the one-time
     unlock starts it on the first tap or keypress instead. */
  if (sessionStorage.getItem('soundChoice')) {
    if (window.SOUND_ON) { startPageMusic(); armGestureUnlock(); }
    return;
  }

  // Pause the hero load-in animations until the site opens (CSS rule).
  document.documentElement.classList.add('intro-gated');

  const overlay = document.createElement('div');
  overlay.className = 'intro';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-label', 'Enter the portfolio');
  overlay.innerHTML = `
    <div class="intro__stage">
      <p class="intro__word" aria-hidden="true">A<span class="intro__d">D</span>ITYA</p>
    </div>
    <p class="intro__readout" role="status">//INITIALIZING PORTFOLIO... [0%]</p>`;
  document.body.appendChild(overlay);
  document.body.style.overflow = 'hidden'; // the overlay gates the site

  /* REAL preload progress, not a fake timer: we count only what the
     first seconds need - the intro + hero tracks, the sound effects,
     and frame01. The other hero frames and section tracks load later. */
  const toPreload = [
    'assets/music/intro.mp3', 'assets/music/hero.mp3',
    'assets/sfx/hover.mp3', 'assets/sfx/scramble.mp3', 'assets/sfx/transition.mp3',
    'assets/sfx/robot-1.mp3', 'assets/sfx/robot-2.mp3',
    'assets/frames/frame01.jpg',
  ];
  let done = 0, entered = false, enterTimer = null;
  const readout = overlay.querySelector('.intro__readout');
  const scheduleEnter = () => {
    if (entered || enterTimer) return;
    enterTimer = setTimeout(enter, REDUCED_MOTION ? 150 : 700);
  };
  const countOne = () => {
    done++;
    const pct = Math.round((done / toPreload.length) * 100);
    readout.textContent = `//INITIALIZING PORTFOLIO... [${pct}%]`;
    if (done >= toPreload.length) scheduleEnter();
  };
  toPreload.forEach(src => {
    if (src.endsWith('.mp3')) {
      const a = new Audio();
      a.preload = 'auto';
      a.addEventListener('canplaythrough', countOne, { once: true });
      a.addEventListener('error', countOne, { once: true });
      a.src = src;
    } else {
      const im = new Image();
      im.onload = countOne;
      im.onerror = countOne;
      im.src = src;
    }
  });
  /* Safety net: on slow mobile data the loader never gets stuck - the
     site opens after ~6s no matter what, and anything still loading
     simply continues in the background. */
  setTimeout(scheduleEnter, 6000);

  /* AUDIO DEFAULT ON (V4): no ENTER buttons - the site opens with sound
     and the bottom-left toggle is where a visitor turns it off. Chrome
     still demands one user gesture before audio may start, so the first
     tap/keypress anywhere unlocks the soundtrack; the TAP FOR SOUND
     chip stays as the visible fallback. */
  let gestureSeen = false;
  const onFirstGesture = () => {
    gestureSeen = true;
    removeEventListener('pointerdown', onFirstGesture);
    removeEventListener('keydown', onFirstGesture);
    if (entered && window.SOUND_ON && !musicEngine.currentTrack) startSoundtrack();
  };
  addEventListener('pointerdown', onFirstGesture);
  addEventListener('keydown', onFirstGesture);

  function startSoundtrack() {
    musicEngine.ensureContext();
    const p = musicEngine.playTrack('assets/music/intro.mp3', { loop: false });
    if (p && p.catch) p.catch(() => showTapForSound());
    playSfx('assets/sfx/transition.mp3', 0.3);
    // crossfade intro -> this page's own track over the next beats
    setTimeout(() => {
      if (window.SOUND_ON) musicEngine.crossfadeTo(PAGE_TRACKS[PAGE_ID] || PAGE_TRACKS.home);
    }, 700);
  }

  function enter() {
    if (entered) return;
    entered = true;
    window.SOUND_ON = true;
    sessionStorage.setItem('soundChoice', 'on');
    document.body.classList.add('sound-on');
    document.body.classList.remove('sound-off');
    document.body.style.overflow = '';

    if (REDUCED_MOTION) {
      overlay.remove();
      document.documentElement.classList.remove('intro-gated');
      if (gestureSeen) startSoundtrack();
      return;
    }

    /* THE D-SWOOP (V4): the camera dollies into the counter of the D in
       ADITYA - the word flies at the camera from the D's centre while a
       hard-edged hole opens there and reveals the site underneath. */
    const word = overlay.querySelector('.intro__word');
    const dSpan = overlay.querySelector('.intro__d');
    const r = dSpan.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    readout.style.transition = 'opacity 0.25s linear';
    readout.style.opacity = '0';
    word.style.transformOrigin = cx + 'px ' + cy + 'px';
    word.style.willChange = 'transform, opacity';
    const DUR = 1150;
    const t0 = performance.now();
    const maxR = Math.hypot(innerWidth, innerHeight) * 0.75;
    let gateOpened = false;
    function frame(t) {
      const p = Math.min(1, (t - t0) / DUR);
      const zoom = p * p * p;               // ease-in: accelerate into the letter
      const hole = p * p * (3 - 2 * p);     // smoothstep: the opening breathes
      word.style.transform = 'scale(' + (1 + zoom * 34) + ')';
      word.style.opacity = String(1 - Math.min(1, Math.max(0, (p - 0.55) / 0.35)));
      const rad = (hole * maxR).toFixed(1);
      overlay.style.webkitMaskImage = overlay.style.maskImage =
        'radial-gradient(circle ' + rad + 'px at ' + cx.toFixed(1) + 'px ' + cy.toFixed(1) +
        'px, transparent 97%, #000 100%)';
      if (!gateOpened && p >= 0.45) {
        gateOpened = true;
        document.documentElement.classList.remove('intro-gated'); // hero slide-in runs now
      }
      if (p < 1) { requestAnimationFrame(frame); return; }
      overlay.remove();
      if (gestureSeen) startSoundtrack();
    }
    requestAnimationFrame(frame);
  }
})();

/* ─── PROMPT 11: SCRAMBLE ENGINE ─────────────────────────────
   kprverse-style decode, hand-written (no library): revealed
   letters lock in from left to right while the rest flicker as
   random uppercase letters, settling in ~0.3-0.5s.
   Exposed on window so every later feature can call it.
   The original text is kept in data-scramble-text, so it is
   never lost no matter how often the effect runs. */
const SCRAMBLE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ#%&@$';

window.scrambleText = function scrambleText(el, { duration = 400, tick = false } = {}) {
  if (REDUCED_MOTION) return; // reduced motion: text simply appears
  if (el._scrambling) return; // never restart a scramble that is running
  if (!el.dataset.scrambleText) el.dataset.scrambleText = el.textContent;
  const original = el.dataset.scrambleText;
  el._scrambling = true;
  const start = performance.now();
  let lastTick = 0;

  (function frame(now) {
    if (!el._scrambling) return; /* cancelled via scrambleText.cancel() */
    const p = Math.min((now - start) / duration, 1);
    const lockCount = Math.floor(p * original.length);
    let out = original.slice(0, lockCount); // locked-in real letters
    for (let i = lockCount; i < original.length; i++) {
      out += original[i] === ' '
        ? ' '
        : SCRAMBLE_CHARS[(Math.random() * SCRAMBLE_CHARS.length) | 0];
    }
    el.textContent = out;
    /* The tick is throttled to one every ~90ms (a few frames), so rapid
       scrambles never overlap ticks into a buzz - and only with sound on. */
    if (tick && p < 1 && now - lastTick > 90) {
      lastTick = now;
      playSfx('assets/sfx/scramble.mp3', 0.12);
    }
    if (p < 1) requestAnimationFrame(frame);
    else { el.textContent = original; el._scrambling = false; }
  })(performance.now());
};

/* Stop a running scramble without its final write (Prompt 18 needs to
   cut one off when a hold ends early or the reveal takes over). */
window.scrambleText.cancel = function cancelScramble(el) { el._scrambling = false; };

/* First use of the engine: the mono section labels (001 / 002 ...)
   decode when they enter the viewport. V4: NO unobserve - every
   re-entry replays the decode (he wants reveals to fire on every
   scroll past, not just the first). The engine's no-restart guard
   keeps overlapping passes from buzzing. */
(function initLabelScramble() {
  const labels = document.querySelectorAll('.section__header .section-label');
  if (!labels.length) return;
  const io = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      if (!entry.target._scrambling) window.scrambleText(entry.target, { tick: true });
    });
  }, { threshold: 0.6 });
  labels.forEach(label => io.observe(label));
})();

/* ─── PROMPT 12: MUSIC TOGGLE ─────────────────────────────────
   Fixed bottom-left equalizer: 5 thin bars, pure CSS animation —
   JS only toggles a class and calls the engine. Frozen while
   muted, dancing while music plays. Injected from JS so the
   no-JS site never shows it. */
(function initMusicToggle() {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'music-toggle';
  btn.setAttribute('aria-label', 'Toggle music');
  btn.innerHTML = '<span></span><span></span><span></span><span></span><span></span>';
  document.body.appendChild(btn);

  function render() {
    const playing = window.SOUND_ON && !musicEngine.isMuted();
    btn.classList.toggle('music-toggle--playing', playing);
    btn.classList.toggle('music-toggle--muted', !playing);
    btn.setAttribute('aria-pressed', String(playing));
  }
  render();

  btn.addEventListener('click', () => {
    if (!window.SOUND_ON) return; // entered without sound: nothing to toggle
    const nowMuted = !musicEngine.isMuted();
    musicEngine.setMuted(nowMuted);
    if (!nowMuted) playSfx('assets/sfx/hover.mp3', 0.25); // blip on unmute
    render();
  });
})();

/* ─── PROMPT 13: PER-SECTION SOUNDTRACK ───────────────────────
   Each section of a page has its own track; when a section crosses
   the middle of the viewport, the engine crossfades to its track.
   Only sections that exist on the CURRENT page are watched, and
   the map is per page. The mountains art break keeps whatever is
   playing. If the visitor entered without sound or muted, the
   engine's volume stays at 0 - nothing audible happens. */
/* REVIEW ROUND 2: music now changes only between FUNDAMENTALLY
   different zones, not every small section - home has three zones
   (intro/story, work, say-hi) instead of six rapid switches. */
const SECTION_TRACKS = {
  home: {
    hero: 'assets/music/hero.mp3',
    about: 'assets/music/hero.mp3',     // intro/story zone keeps the pop beat
    skills: 'assets/music/hero.mp3',
    projects: 'assets/music/projects.mp3',
    explore: 'assets/music/projects.mp3', // work zone
    contact: 'assets/music/contact.mp3',
  },
  academics: { hero: 'assets/music/education.mp3', now: 'assets/music/education.mp3', exams: 'assets/music/education.mp3', school: 'assets/music/education.mp3', olympiads: 'assets/music/education.mp3', learning: 'assets/music/education.mp3' },
  projects:  { hero: 'assets/music/projects.mp3', 'projects-section': 'assets/music/projects.mp3' },
  beyond:    { hero: 'assets/music/about.mp3', trekking: 'assets/music/about.mp3', running: 'assets/music/about.mp3', cycling: 'assets/music/about.mp3', sport: 'assets/music/about.mp3', music: 'assets/music/about.mp3' },
  community: { hero: 'assets/music/about.mp3', leadership: 'assets/music/about.mp3', clubs: 'assets/music/about.mp3', events: 'assets/music/about.mp3', volunteering: 'assets/music/about.mp3', connect: 'assets/music/about.mp3' },
};
/* REVIEW ROUND 2: footer.mp3 (the dark horror-ish track) is retired -
   the footer stays on the calm contact track. */
/* V6: footer track retired with per-section switching - the page track plays through. */

(function initSectionSoundtrack() {
  /* V6: per-section track switching is gone. He kept hearing the
     static intro restart every time a section boundary crossed into
     a different file (worst at the footer, which had its own track).
     Now the page's track starts with the first section and plays
     straight through to the footer - a track only changes when the
     PAGE changes. The section map stays below as documentation of
     which track owns which page. */
})();


/* ─── PROMPT 14: CURSOR FOLLOWER ──────────────────────────────
   A dot that follows the mouse exactly + a ring that lags behind
   with lerp (each frame the ring closes ~15% of the remaining
   distance, which gives the smooth elastic feel). Both use
   mix-blend-mode: difference so they invert over any background.
   Hidden on touch devices; motion off under reduced motion.
   The CSS crosshair cursor from Prompt 6 stays underneath. */
(function initCursorFollower() {
  // Touch devices and reduced-motion users keep the plain CSS cursor.
  if (window.matchMedia('(hover: none)').matches || REDUCED_MOTION) return;

  const dot = document.createElement('div');
  dot.className = 'cursor-dot';
  const ring = document.createElement('div');
  ring.className = 'cursor-ring';
  dot.setAttribute('aria-hidden', 'true');
  ring.setAttribute('aria-hidden', 'true');
  document.body.append(dot, ring);

  let mouseX = innerWidth / 2, mouseY = innerHeight / 2;
  let ringX = mouseX, ringY = mouseY;

  addEventListener('mousemove', (e) => {
    mouseX = e.clientX;
    mouseY = e.clientY;
    dot.style.transform = `translate(${mouseX}px, ${mouseY}px)`;
  });

  (function follow() {
    // lerp: ring moves 15% of the remaining distance every frame
    ringX += (mouseX - ringX) * 0.15;
    ringY += (mouseY - ringY) * 0.15;
    ring.style.transform = `translate(${ringX}px, ${ringY}px)`;
    requestAnimationFrame(follow);
  })();

  // The ring grows over anything clickable
  document.addEventListener('mouseover', (e) => {
    ring.classList.toggle('cursor-ring--hover',
      !!e.target.closest('a, button, .btn, label[for]'));
  });
})();

/* ─── PROMPT 15: NAVBAR WIRING ────────────────────────────────
   Smooth anchors, scrollspy, hover scramble + blip, hash landing,
   and a JS fallback for the CSS scroll progress bar.
   Section jumps route through window._sectionJump so Prompt 19 can
   later swap in the bracket transition WITHOUT rebinding anything. */
window._sectionJump = function _sectionJump(target) {
  target.scrollIntoView({ behavior: REDUCED_MOTION ? 'auto' : 'smooth' });
};

(function initNavbar() {
  const links = [...document.querySelectorAll('.navbar__link')];

  /* 1 + 2. Clicking a navbar link scrolls smoothly to that section.
     Each page's navbar lists only its own sections, so every #href
     here resolves on this page. */
  links.forEach(a => a.addEventListener('click', (e) => {
    const href = a.getAttribute('href');
    if (!href || !href.startsWith('#')) return;
    const target = document.querySelector(href);
    if (!target) return;
    e.preventDefault();
    window._sectionJump(target);
  }));

  /* 2. Scrollspy: a section crossing the upper-middle band marks its
     navbar link active (the filled square is pure CSS). */
  const spyTargets = links
    .map(a => document.querySelector(a.getAttribute('href')))
    .filter(Boolean);
  if (spyTargets.length) {
    const spy = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        links.forEach(a => a.classList.toggle(
          'navbar__link--active',
          a.getAttribute('href') === '#' + entry.target.id));
      });
    }, { rootMargin: '-40% 0px -55% 0px', threshold: 0 });
    spyTargets.forEach(sec => spy.observe(sec));
  }

  /* When a page opens with a #hash (e.g. index.html#contact from an
     inner page), jump to that section once everything has loaded. */
  if (location.hash) {
    addEventListener('load', () => {
      const target = document.querySelector(location.hash);
      if (target) target.scrollIntoView({ behavior: 'auto' });
    });
  }

  /* 3. Hover scramble + blip on every navbar and footer link.
     V5: the roll-mask spans are gone site-wide, so the decode runs on
     the link's own text. The original text stays safe in the data
     attribute; a running scramble is never restarted (the engine
     guards it). */
  let lastNavHover = 0;
  document.querySelectorAll('.navbar__link, .footer__link, .contact__email, .contact__link').forEach(a => {
    const isNav = a.classList.contains('navbar__link');
    a.addEventListener('mouseenter', () => {
      if (isNav) {
        const now = performance.now();
        if (now - lastNavHover < 700) return; /* calm bar: one decode per crossing */
        lastNavHover = now;
      }
      window.scrambleText(a, { duration: 300 });
      playSfx('assets/sfx/hover.mp3', 0.2);
    });
  });

  /* V7 item 12: scroll-progress bar removed - no fallback needed. */
})();

/* ─── V4: SIDE MENU BACKDROP CURSOR PARALLAX ────────────────
   The 3D wall + perspective floor layers are pure CSS; this adds a
   gentle cursor drift on top. Desktop pointer only, motion-safe
   only, and a no-op wherever the backdrop markup is absent. */
(function initMenuBackdropParallax() {
  if (REDUCED_MOTION || !window.matchMedia('(pointer: fine)').matches) return;
  const overlay = document.querySelector('.nav-overlay');
  const wall = overlay && overlay.querySelector('.nav-overlay__bg-wall');
  const floor = overlay && overlay.querySelector('.nav-overlay__bg-floor');
  if (!wall || !floor) return;
  let tx = 0, ty = 0, cx = 0, cy = 0, raf = null;
  function tick() {
    cx += (tx - cx) * 0.08;
    cy += (ty - cy) * 0.08;
    wall.style.translate = (cx * -18).toFixed(1) + 'px ' + (cy * -10).toFixed(1) + 'px';
    floor.style.translate = (cx * 26).toFixed(1) + 'px ' + (cy * 12).toFixed(1) + 'px';
    if (Math.abs(tx - cx) > 0.0005 || Math.abs(ty - cy) > 0.0005) raf = requestAnimationFrame(tick);
    else raf = null;
  }
  overlay.addEventListener('pointermove', (e) => {
    tx = e.clientX / innerWidth - 0.5;
    ty = e.clientY / innerHeight - 0.5;
    if (!raf) raf = requestAnimationFrame(tick);
  });
})();

/* ─── REVIEW ROUND 2: NAVBAR SCROLL FILL + SKILL EXPANDERS ─────
   Two small wirings: the navbar gets its translucent gray fill once
   the page scrolls, and the + buttons in What I Know open a one-line
   detail under their row (button + hidden span, so no-JS stays clean). */
(function initNavbarFill() {
  const navbar = document.getElementById('navbar');
  if (!navbar) return;
  const onScroll = () => navbar.classList.toggle('navbar--scrolled', window.scrollY > 24);
  addEventListener('scroll', onScroll, { passive: true });
  onScroll();
})();

(function initSkillExpanders() {
  document.querySelectorAll('.skill-row__plus').forEach(btn => {
    const detail = document.getElementById(btn.getAttribute('aria-controls'));
    if (!detail) return;
    btn.addEventListener('click', () => {
      const open = btn.getAttribute('aria-expanded') === 'true';
      btn.setAttribute('aria-expanded', String(!open));
      detail.hidden = open;
      if (!open) {
        playSfx('assets/sfx/hover.mp3', 0.15);
        window.scrambleText(detail, { duration: 350 });
      }
    });
  });
})();

/* ─── PROMPT 16: SIDE MENU UPGRADE ────────────────────────────
   The checkbox/:has() CSS mechanism stays the no-JS base; this only
   layers sound and scramble on top. */
(function initSideMenu() {
  const checkbox = document.getElementById('menu-toggle');
  if (!checkbox) return;
  const links = [...document.querySelectorAll('.nav-overlay__link, .nav-overlay__sub-link')];

  /* 1. On open, each link's label scrambles in, staggered one after
     another (70ms apart), with the tick on the first only. */
  checkbox.addEventListener('change', () => {
    if (!checkbox.checked) return;
    links.forEach((a, i) => {
      setTimeout(() => window.scrambleText(a, { duration: 350, tick: i === 0 }), i * 70);
    });
  });

  /* 2. Hover scramble + blip on every menu link and the MENU trigger.
     Each item scrambles on its own (the engine's no-restart guard is
     per-element), so sweeping down the list leaves several settling. */
  links.forEach(a => a.addEventListener('mouseenter', () => {
    window.scrambleText(a, { duration: 300 });
    playSfx('assets/sfx/hover.mp3', 0.2);
  }));
  const trigger = document.querySelector('.menu-trigger');
  const triggerText = document.querySelector('.menu-trigger__text');
  if (trigger && triggerText) {
    trigger.addEventListener('mouseenter', () => {
      window.scrambleText(triggerText, { duration: 250 });
      playSfx('assets/sfx/hover.mp3', 0.2);
    });
  }


  /* V6 item 7: ESC steps back - closes the side menu from anywhere
     (he shouldn't have to travel to the top-right close button). */
  addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && checkbox.checked) {
      checkbox.checked = false;
      checkbox.dispatchEvent(new Event('change'));
    }
  });

  /* 3. Menu links are anchors inside <label for="menu-toggle">, so a
     click already closes the menu (the label unchecks the box) and
     then follows the link - page links open their page, same-page
     section links smooth-scroll via CSS scroll-behavior. No JS needed
     for the base path; Prompt 19 wraps the jump in the transition. */
})();

/* ─── PROMPT 17: 3D MOUSE PARALLAX (REVIEW ROUND: BG, NOT TEXT) ─
   Mouse-driven depth, lerped in one shared rAF loop:
   1. hero BACKGROUND stack drifts in three depths (portrait, grid,
      crosshair) - the text stays put
   2. project-card plate layers shift opposite the cursor
      (front 20px, mid 10px, back 3px)
   Off by default on touch devices and under prefers-reduced-motion.
   Scroll drift for the same layers is pure CSS (see style.css §32),
   living on `translate` so it adds to these `transform` offsets. */
(function initDepthParallax() {
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)').matches;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!finePointer || reduced) return; /* touch / reduced-motion: static site */

  /* One lerp list drives every animated element. Each entry eases
     cx,cy toward tx,ty; the loop sleeps once everything settles. */
  const items = [];
  let raf = null;
  function loop() {
    let alive = false;
    for (const it of items) {
      it.cx += (it.tx - it.cx) * 0.08; /* ease factor: slow, weighty settle */
      it.cy += (it.ty - it.cy) * 0.08;
      if (Math.abs(it.tx - it.cx) < 0.02 && Math.abs(it.ty - it.cy) < 0.02) {
        it.cx = it.tx; it.cy = it.ty; /* snap the last epsilon, then sleep */
      } else {
        alive = true;
      }
      it.apply(it.cx, it.cy);
    }
    raf = alive ? requestAnimationFrame(loop) : null;
  }
  function kick() { if (!raf) raf = requestAnimationFrame(loop); }

  /* 1. Hero background 3D parallax (review round): the portrait stack
     drifts OPPOSITE the cursor (deepest layer), the grid lines drift
     with it, the crosshair drifts hardest - three depths, one lerp.
     The hero text no longer tilts; it stays put.
     `translate` and `scale` are standalone CSS properties, so they
     compose with the scroll-driven heroZoom `transform` on .hero-bg
     instead of fighting it. The constant 1.05 overscan keeps the
     drift from ever showing an edge. */
  const heroBg = document.querySelector('.hero-bg');
  if (heroBg) {
    const heroArea = heroBg.closest('.hero-sticky');
    const gridLines = heroArea.querySelector('.hero__grid-lines');
    const crosshair = heroArea.querySelector('.hero__crosshair');
    heroBg.style.scale = '1.14'; /* V6: drift cranked, deeper overscan */
    const layers = [
      { el: heroBg,    depth: -84 }, /* V6: opposite the cursor, ±42px */
      { el: gridLines, depth: 34 },  /* V6: with the cursor, ±17px */
      { el: crosshair, depth: 100 }  /* V6: loosest layer, ±50px */
    ].filter(l => l.el).map(l => ({
      cx: 0, cy: 0, tx: 0, ty: 0,
      apply(x, y) {
        l.el.style.translate = `${(x * l.depth).toFixed(2)}px ${(y * l.depth).toFixed(2)}px`;
      }
    }));
    layers.forEach(l => items.push(l));
    heroArea.addEventListener('mousemove', (e) => {
      const r = heroArea.getBoundingClientRect();
      /* V6: clamp -0.5 … 0.5 - pinned/tall areas made raw ratios overshoot
         the overscan and flash edges at the viewport edge. */
      const nx = Math.max(-0.5, Math.min(0.5, (e.clientX - r.left) / r.width - 0.5));
      const ny = Math.max(-0.5, Math.min(0.5, (e.clientY - r.top) / r.height - 0.5));
      layers.forEach(l => { l.tx = nx; l.ty = ny; });
      kick();
    });
    heroArea.addEventListener('mouseleave', () => {
      layers.forEach(l => { l.tx = 0; l.ty = 0; });
      kick();
    });
  }

  /* 2. Card layer parallax: layers move opposite the cursor, scaled
     by depth - front ±20px, mid ±10px, back ±3px - so the plate
     feels like a real stack. */
  document.querySelectorAll('.project-card').forEach((card) => {
    const back = card.querySelector('.layer-back');
    const mid = card.querySelector('.layer-mid');
    const front = card.querySelector('.layer-front');
    const thumb = card.querySelector('.project-card__thumb');
    if (!back || !mid || !front) return;
    const st = {
      cx: 0, cy: 0, tx: 0, ty: 0,
      apply(x, y) {
        /* Review round: the whole plate tilts toward the cursor like a
           physical card (KSR-style 3D), while its layers keep drifting
           inside for parallax depth. */
        if (thumb) thumb.style.transform =
          `perspective(700px) rotateX(${(-y * 13).toFixed(2)}deg) rotateY(${(x * 16).toFixed(2)}deg)` /* V6 cranked */;
        front.style.transform = `translate(${(-x * 84).toFixed(2)}px, ${(-y * 84).toFixed(2)}px)`; /* V6 cranked */
        mid.style.transform   = `translate(${(-x * 44).toFixed(2)}px, ${(-y * 44).toFixed(2)}px)`; /* V6 cranked */
        back.style.transform  = `translate(${(-x * 16).toFixed(2)}px, ${(-y * 16).toFixed(2)}px)`; /* V6 cranked */
      }
    };
    items.push(st);
    card.addEventListener('mousemove', (e) => {
      const r = card.getBoundingClientRect();
      st.tx = Math.max(-0.5, Math.min(0.5, (e.clientX - r.left) / r.width - 0.5)); /* V6: clamp */
      st.ty = Math.max(-0.5, Math.min(0.5, (e.clientY - r.top) / r.height - 0.5)); /* V6: clamp */
      kick();
    });
    card.addEventListener('mouseleave', () => { st.tx = 0; st.ty = 0; kick(); });
  });

  /* 3. v3: photo section backgrounds drift opposite the cursor,
     same depth language as the hero background stack. */
  document.querySelectorAll('.section-bg img').forEach((img) => {
    const sec = img.closest('.section--photo');
    if (!sec) return;
    img.style.scale = '1.22'; /* V6: overscan for the cranked drift */
    const st = {
      cx: 0, cy: 0, tx: 0, ty: 0,
      apply(x, y) {
        img.style.translate = `${(-x * 90).toFixed(2)}px ${(-y * 90).toFixed(2)}px`; /* V6: ±45px, KPR energy */
      }
    };
    items.push(st);
    sec.addEventListener('mousemove', (e) => {
      const r = sec.getBoundingClientRect();
      st.tx = Math.max(-0.5, Math.min(0.5, (e.clientX - r.left) / r.width - 0.5)); /* V6: clamp */
      st.ty = Math.max(-0.5, Math.min(0.5, (e.clientY - r.top) / r.height - 0.5)); /* V6: clamp */
      kick();
    });
    sec.addEventListener('mouseleave', () => { st.tx = 0; st.ty = 0; kick(); });
  });
})();

/* ─── PROMPT 18: HOLD-DOWN STAT CARDS ─────────────────────────
   beyond.html running stats start as a glitching placeholder with a
   mono HOLD TO REVEAL hint. Press-and-hold for 600ms: the placeholder
   cycles through the scramble engine (tick sound when sound is on)
   while a CSS progress line fills; a full hold decodes to the real
   stat; letting go early resets to the placeholder. The real stat is
   in the HTML and in aria-label, so no-JS and screen-reader visitors
   get it without the game. */
(function initHoldRevealStats() {
  const cards = document.querySelectorAll('.stat-card');
  if (!cards.length) return;
  const HOLD_MS = 600;

  /* Random noise of the same length as a string, keeping its spaces */
  function noiseLike(str) {
    let out = '';
    for (const ch of str) {
      out += ch === ' ' ? ' ' : SCRAMBLE_CHARS[(Math.random() * SCRAMBLE_CHARS.length) | 0];
    }
    return out;
  }

  cards.forEach((card) => {
    const valueEl = card.querySelector('.stat-card__value');
    if (!valueEl) return;
    const real = valueEl.textContent.trim();
    const labelEl = card.querySelector('.stat-card__label');
    const labelText = labelEl ? labelEl.textContent.trim().toLowerCase() : '';

    /* a11y: the stat reads without the interaction */
    card.setAttribute('role', 'button');
    card.setAttribute('tabindex', '0');
    card.setAttribute('aria-label', `${real}${labelText ? ', ' + labelText : ''}. Hold to reveal.`);
    valueEl.setAttribute('aria-hidden', 'true');

    /* hint + progress line, injected so the no-JS page never shows them */
    const hint = document.createElement('span');
    hint.className = 'stat-card__hint';
    hint.textContent = 'HOLD TO REVEAL';
    hint.setAttribute('aria-hidden', 'true');
    const progress = document.createElement('span');
    progress.className = 'stat-card__progress';
    progress.setAttribute('aria-hidden', 'true');
    progress.innerHTML = '<i></i>';
    card.append(hint, progress);

    let holding = false, revealed = false, holdTimer = null, cycleTimer = null;

    /* placeholder state */
    valueEl.dataset.scrambleText = real; /* engine decodes to THIS on reveal */
    valueEl.textContent = noiseLike(real);

    /* Idle glitch: re-randomize the placeholder every couple of seconds
       (skipped under reduced motion - the placeholder just sits still) */
    let idleTimer = null;
    if (!REDUCED_MOTION) {
      idleTimer = setInterval(() => {
        if (!revealed && !holding) valueEl.textContent = noiseLike(real);
      }, 2400);
    }

    /* While held: short engine scrambles into random targets, back to
       back, so the placeholder churns with the engine's own tick. */
    function cycle() {
      if (!holding || revealed || REDUCED_MOTION) return;
      valueEl.dataset.scrambleText = noiseLike(real);
      window.scrambleText(valueEl, { duration: 140, tick: true });
      cycleTimer = setTimeout(cycle, 150); /* 140ms run + 10ms gap: no guard clash */
    }

    function reveal() {
      if (revealed) return;
      revealed = true; holding = false;
      clearTimeout(cycleTimer);
      clearInterval(idleTimer);
      window.scrambleText.cancel(valueEl); /* cut any mid-cycle scramble */
      card.classList.remove('is-holding');
      card.classList.add('is-revealed'); /* hides the hint via CSS */
      card.setAttribute('aria-label', `${real}${labelText ? ', ' + labelText : ''}.`);
      valueEl.dataset.scrambleText = real;
      window.scrambleText(valueEl, { duration: 260 }); /* the settle decode */
      if (REDUCED_MOTION) valueEl.textContent = real;  /* engine no-ops there */
    }

    function startHold(e) {
      if (revealed || holding) return;
      if (e.type === 'keydown') {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        e.preventDefault(); /* keep Space from scrolling the page */
        if (e.repeat) return;
      }
      holding = true;
      card.classList.add('is-holding'); /* CSS fills the progress line */
      cycle();
      holdTimer = setTimeout(reveal, HOLD_MS);
    }

    function endHold() {
      if (!holding || revealed) return;
      holding = false;
      clearTimeout(holdTimer);
      clearTimeout(cycleTimer);
      window.scrambleText.cancel(valueEl);
      card.classList.remove('is-holding'); /* line snaps back via CSS */
      valueEl.dataset.scrambleText = real;
      valueEl.textContent = noiseLike(real); /* back to the placeholder */
    }

    card.addEventListener('mousedown', startHold);
    card.addEventListener('mouseup', endHold);
    card.addEventListener('mouseleave', endHold);
    card.addEventListener('touchstart', startHold, { passive: true });
    card.addEventListener('touchend', endHold);
    card.addEventListener('touchcancel', endHold);
    card.addEventListener('keydown', startHold);
    card.addEventListener('keyup', endHold);
    card.addEventListener('blur', endHold);
    /* long-press on touch would pop the context menu mid-hold */
    card.addEventListener('contextmenu', (e) => e.preventDefault());
  });
})();

/* ─── REVIEW ROUND: HOLD A PROJECT CARD FOR CONTEXT ───────────
   Each projects.html card carries a data-context one-liner (the WHY
   behind the build). Press-and-hold the card for 600ms: a black
   circle fills out from the press point (same language as the
   cursor) and the context scrambles in on top. Let go early and the
   circle shrinks back; leave the card and it resets. The full
   description stays in the DOM, so the overlay is aria-hidden. */
(function initCardContextHold() {
  const cards = document.querySelectorAll('.project-card[data-context]');
  if (!cards.length) return;
  const HOLD_MS = 600;
  cards.forEach(card => {
    const overlay = document.createElement('div');
    overlay.className = 'card-context';
    overlay.setAttribute('aria-hidden', 'true');
    overlay.innerHTML =
      '<span class="card-context__fill"></span>' +
      '<div class="card-context__body">' +
        '<p class="card-context__kicker">//CONTEXT</p>' +
        '<p class="card-context__text"></p>' +
      '</div>';
    card.appendChild(overlay);
    const hint = document.createElement('span');
    hint.className = 'card-context-hint';
    hint.setAttribute('aria-hidden', 'true');
    hint.textContent = 'HOLD FOR CONTEXT';
    card.appendChild(hint);
    const textEl = overlay.querySelector('.card-context__text');

    let holding = false, revealed = false, holdTimer = null;
    let sx = 0, sy = 0;

    function arm(e) {
      if (revealed || holding) return;
      const r = card.getBoundingClientRect();
      sx = e.clientX - r.left; sy = e.clientY - r.top;
      /* circle big enough to cover the farthest corner from the press */
      const far = Math.max(
        Math.hypot(sx, sy), Math.hypot(r.width - sx, sy),
        Math.hypot(sx, r.height - sy), Math.hypot(r.width - sx, r.height - sy));
      overlay.style.setProperty('--cx', sx + 'px');
      overlay.style.setProperty('--cy', sy + 'px');
      overlay.style.setProperty('--r', (far / 12 + 1).toFixed(1));
      holding = true;
      overlay.classList.add('is-holding');
      holdTimer = setTimeout(reveal, HOLD_MS);
    }
    function disarm(e) {
      if (!holding || revealed) return;
      if (e && e.type === 'pointermove') {
        if (Math.hypot(e.clientX - sx - card.getBoundingClientRect().left + card.getBoundingClientRect().left, 0) < 0) return;
      }
      holding = false;
      clearTimeout(holdTimer);
      overlay.classList.remove('is-holding');
    }
    function reveal() {
      holding = false; revealed = true;
      overlay.classList.remove('is-holding');
      overlay.classList.add('is-revealed');
      playSfx('assets/sfx/hover.mp3', 0.15);
      textEl.dataset.scrambleText = card.dataset.context;
      if (REDUCED_MOTION) textEl.textContent = card.dataset.context;
      else window.scrambleText(textEl, { duration: 450 });
    }
    function reset() {
      if (!revealed) return;
      revealed = false;
      overlay.classList.remove('is-revealed');
    }

    card.addEventListener('pointerdown', arm);
    card.addEventListener('pointerup', () => disarm());
    card.addEventListener('pointercancel', () => disarm());
    card.addEventListener('pointermove', (e) => {
      /* a drag means scrolling, not holding - cancel past a small deadzone */
      if (!holding) return;
      const r = card.getBoundingClientRect();
      if (Math.hypot(e.clientX - r.left - sx, e.clientY - r.top - sy) > 14) disarm();
    });
    card.addEventListener('pointerleave', () => { disarm(); reset(); });
  });
})();

/* ─── PROMPT 19: BRACKET-FRAME SCREEN TRANSITIONS ─────────────
   window.playTransition(callback): the bracket overlay covers the
   screen, runs callback() at full cover (with the transition sweep
   when sound is on), then uncovers. Same-page section jumps happen
   INSTANTLY under the cover; other-page links navigate at full cover
   and the new page starts covered (sessionStorage handshake) and
   uncovers once loaded. If playTransition somehow never loads, every
   link keeps its default behavior (smooth scroll / normal open). */
(function initTransitions() {
  const COVER_MS = 680;   /* V6: seven-slice alternating shutter */
  const HOLD_MS = 560;    /* beat at full cover - scanline sweeps, label reads */
  const UNCOVER_MS = 680; /* V6: shutter peels back out */
  let overlay = null, running = false;

  function buildOverlay() {
    if (overlay) return overlay;
    overlay = document.createElement('div');
    overlay.className = 'transition-overlay';
    overlay.setAttribute('aria-hidden', 'true');
    overlay.innerHTML =
      '<div class="transition-overlay__veil"></div>' +
      '<span class="transition-overlay__slice transition-overlay__slice--1"></span>' +
      '<span class="transition-overlay__slice transition-overlay__slice--2"></span>' +
      '<span class="transition-overlay__slice transition-overlay__slice--3"></span>' +
      '<span class="transition-overlay__slice transition-overlay__slice--4"></span>' +
      '<span class="transition-overlay__slice transition-overlay__slice--5"></span>' +
      '<span class="transition-overlay__slice transition-overlay__slice--6"></span>' +
      '<span class="transition-overlay__slice transition-overlay__slice--7"></span>' +
      '<span class="transition-overlay__blade"></span>' +
      '<span class="transition-overlay__scan"></span>' +
      '<span class="transition-overlay__label"></span>' +
      '<span class="transition-overlay__bracket transition-overlay__bracket--tl"></span>' +
      '<span class="transition-overlay__bracket transition-overlay__bracket--tr"></span>' +
      '<span class="transition-overlay__bracket transition-overlay__bracket--br"></span>' +
      '<span class="transition-overlay__bracket transition-overlay__bracket--bl"></span>' +
      '<span class="transition-overlay__shard transition-overlay__shard--1"></span>' +
      '<span class="transition-overlay__shard transition-overlay__shard--2"></span>' +
      '<span class="transition-overlay__shard transition-overlay__shard--3"></span>' +
      '<span class="transition-overlay__panel transition-overlay__panel--left"></span>' +
      '<span class="transition-overlay__panel transition-overlay__panel--right"></span>';
    document.body.appendChild(overlay);
    return overlay;
  }

  window.playTransition = function playTransition(callback, opts) {
    /* Re-entrant call while one is running: skip the animation but
       never drop the action. */
    if (running) { if (callback) callback(); return; }
    running = true;
    const el = buildOverlay();
    /* mode 'sides' (Prompt 20's guide): two black panels close in from
       the left and right edges instead of the single veil wipe. */
    const sides = !!(opts && opts.mode === 'sides');
    if (sides) el.classList.add('transition-overlay--sides');
    /* V6 item 8: destination tag in the cover - mono index + page name,
       KPR HUD style. Text is from our own static map, safe to inject. */
    const labelEl = el.querySelector('.transition-overlay__label');
    const label = (opts && opts.label) || '';
    if (labelEl) labelEl.textContent = label;
    const coverMs = REDUCED_MOTION ? 0 : COVER_MS;
    const uncoverMs = REDUCED_MOTION ? 0 : UNCOVER_MS;
    el.classList.add('is-active', 'is-covering');
    setTimeout(() => {
      el.classList.remove('is-covering');
      el.classList.add('is-covered');
      playSfx('assets/sfx/transition.mp3', 0.5); /* sweep at full cover */
      try { if (callback) callback(); } catch (err) { console.error(err); }
      /* If the callback navigated away, the rest never runs here. */
      setTimeout(() => {
        el.classList.remove('is-covered');
        el.classList.add('is-uncovering');
        setTimeout(() => {
          el.classList.remove('is-active', 'is-uncovering', 'transition-overlay--sides');
          running = false;
        }, uncoverMs);
      }, REDUCED_MOTION ? 0 : HOLD_MS);
    }, coverMs);
  };

  /* REVIEW ROUND 2: same-page jumps no longer play the bracket
     transition (it felt like being taken to a different website).
     Clicking a nav link now just glides down to the section - a
     visible SCROLL animation, eased through Lenis when it runs.
     Page-to-page links still get the full transition below. */
  window._sectionJump = function _sectionJump(target) {
    if (window._lenis) {
      window._lenis.scrollTo(target, { duration: 1.4 }); /* slow, weighty glide */
      return;
    }
    target.scrollIntoView({ behavior: REDUCED_MOTION ? 'auto' : 'smooth', block: 'start' });
  };

  /* Arriving from another page through a transition: start covered,
     uncover once the page is ready. */
  if (sessionStorage.getItem('ak-transition-arrive') === '1') {
    sessionStorage.removeItem('ak-transition-arrive');
    const el = buildOverlay();
    const arriveLabel = sessionStorage.getItem('ak-transition-label') || '';
    sessionStorage.removeItem('ak-transition-label');
    if (arriveLabel) el.querySelector('.transition-overlay__label').textContent = arriveLabel;
    el.classList.add('is-active', 'is-covered');
    running = true;
    const uncover = () => {
      el.classList.remove('is-covered');
      el.classList.add('is-uncovering');
      setTimeout(() => {
        el.classList.remove('is-active', 'is-uncovering');
        running = false;
      }, REDUCED_MOTION ? 0 : UNCOVER_MS);
    };
    if (document.readyState === 'complete') setTimeout(uncover, 90);
    else window.addEventListener('load', () => setTimeout(uncover, 90), { once: true });
  }

  /* One delegated click handler covers navbar leftovers, side-menu
     page links and sub-links, footer quick links, NEXT rows, and
     CONTACT from inner pages. Handled clicks call preventDefault;
     anything already handled (navbar same-page links) or external
     passes through untouched. */
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href]');
    if (!a || e.defaultPrevented) return;
    if (a.target === '_blank' || a.hasAttribute('download')) return;
    const href = a.getAttribute('href');
    if (!href || /^(https?:|mailto:|tel:)/i.test(href)) return;

    /* same-page section anchor (side-menu sub-links, footer quick links) */
    if (href.startsWith('#')) {
      const target = document.querySelector(href);
      if (!target) return;
      e.preventDefault();
      const mt = document.getElementById('menu-toggle');
      if (mt) mt.checked = false; /* close the side menu over the jump */
      window._sectionJump(target);
      return;
    }

    /* other-page .html links open under full cover */
    let url;
    try { url = new URL(href, location.href); } catch { return; }
    if (url.origin !== location.origin || !/\.html?$/i.test(url.pathname)) return;
    if (url.pathname === location.pathname && url.hash) {
      const target = document.querySelector(url.hash);
      if (!target) return;
      e.preventDefault();
      const mt = document.getElementById('menu-toggle');
      if (mt) mt.checked = false;
      window._sectionJump(target);
      return;
    }
    if (url.pathname === location.pathname) return; /* bare self-link: default */
    e.preventDefault();
    const PAGE_TAGS = {
      'index.html': '01 - HOME',
      'academics.html': '02 - ACADEMICS',
      'projects.html': '03 - PROJECTS',
      'beyond.html': '04 - BEYOND THE TERMINAL',
      'community.html': '05 - COMMUNITY'
    };
    const tag = PAGE_TAGS[url.pathname.split('/').pop()] || '';
    window.playTransition(() => {
      sessionStorage.setItem('ak-transition-arrive', '1');
      sessionStorage.setItem('ak-transition-label', tag);
      location.href = url.href; /* a #hash rides along: lands on the section */
    }, { label: tag });
  });
})();

/* ─── PROMPT 20: THE AI GUIDE ─────────────────────────────────
   A fully scripted host - no API, no AI. It talks to the visitor
   about Aditya and what they came to see, walks the page section by
   section, and times each line to land just after the section's own
   scramble decode begins. Lines live in LINES below, one array per
   page, each entry tied to a section selector - edit them here. */
(function initGuide() {
  /* Review round: the agent narrates from the LIVE DOM instead of a
     canned script - each line is built from the section's own heading
     and first real paragraph, so the tour can never go stale. */
  function firstSentence(t) {
    const clean = t.trim().replace(/\s+/g, ' ');
    const m = clean.match(/^.*?[.!?](?=\s|$)/);
    return (m ? m[0] : clean).slice(0, 220);
  }
  function buildLines() {
    const out = [{
      sel: null,
      text: "Hi - I'm the AI agent built into this site. Sit back, I'll scroll and show you what Aditya does."
    }];
    document.querySelectorAll('main > section, footer.footer').forEach(sec => {
      if (sec.classList.contains('footer')) {
        out.push({ sel: '.footer', text: "That's the tour. Say hi before you go - the links are right here." });
        return;
      }
      if (!sec.id) return;
      let text;
      if (sec.id === 'hero') {
        const sub = sec.querySelector('.hero__sub');
        text = 'This is Aditya Kulkarni. ' + (sub ? firstSentence(sub.textContent) : '');
      } else {
        const head = sec.querySelector('h1, h2, h3');
        const label = sec.querySelector('.section-label');
        const name = (head || label ? (head || label).textContent : sec.id)
          .trim().replace(/\s+/g, ' ').replace(/[.:;]+$/, '');
        const p = [...sec.querySelectorAll('p')].find(el =>
          !el.classList.contains('section-label') && el.textContent.trim().length > 40);
        text = name + '. ' + (p ? firstSentence(p.textContent) : '');
      }
      out.push({ sel: '#' + sec.id, text: text.trim() });
    });
    return out;
  }

  /* Where the guide sends the visitor after the last line */
  const NEXT = {
    'index.html':     { href: 'academics.html', name: 'Academics' },
    'academics.html': { href: 'projects.html',  name: 'Projects' },
    'projects.html':  { href: 'beyond.html',    name: 'Beyond The Terminal' },
    'beyond.html':    { href: 'community.html', name: 'Community' },
    'community.html': { href: 'index.html',     name: 'Back Home' }
  };

  const page = location.pathname.split('/').pop() || 'index.html';
  const lines = buildLines();
  if (!lines || !lines.length) return;
  const next = NEXT[page];

  const waveHTML = '<span class="guide-wave" aria-hidden="true"><i></i><i></i><i></i><i></i></span>';

  /* Review round: one translucent bottom-center bar replaces the old
     ASK THE GUIDE button and the corner FAB. Hold SPACE (or press and
     hold the bar itself) for 900ms and the AI agent takes over with a
     blackout, then walks the page on its own. Music keeps playing. */
  const bar = document.createElement('button');
  bar.type = 'button';
  bar.className = 'guide-hold';
  bar.innerHTML =
    '<span class="guide-hold__fill" aria-hidden="true"></span>' +
    '<span class="guide-hold__label">HOLD SPACE FOR AI AGENT</span>' + waveHTML;
  bar.setAttribute('aria-label', 'Hold space, or press and hold, for the AI agent');
  document.body.appendChild(bar);

  const HOLD_MS = 900;
  let holdTimer = null;
  function startHold() {
    if (isOpen || holdTimer) return;
    bar.classList.add('is-holding');
    holdTimer = setTimeout(() => { cancelHold(); openGuide(); }, HOLD_MS);
  }
  function cancelHold() {
    if (holdTimer) { clearTimeout(holdTimer); holdTimer = null; }
    bar.classList.remove('is-holding');
  }
  bar.addEventListener('pointerdown', (e) => { e.preventDefault(); startHold(); });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach(ev =>
    bar.addEventListener(ev, cancelHold));
  bar.addEventListener('keydown', (e) => {
    if (e.code === 'Space') { e.preventDefault(); if (!e.repeat) startHold(); }
  });
  bar.addEventListener('keyup', (e) => { if (e.code === 'Space') cancelHold(); });
  addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isOpen) { closeGuide(); return; }
    if (e.code !== 'Space' || isOpen) return;
    const t = e.target;
    if (t && t.closest && t.closest('input, textarea, select, [contenteditable], a, button')) return;
    e.preventDefault(); /* space scrolls by default - the hold owns it here,
                           auto-repeat keydowns included (V4: holding space
                           used to scroll the page before the agent opened) */
    if (!e.repeat) startHold();
  });
  addEventListener('keyup', (e) => { if (e.code === 'Space') cancelHold(); });

  /* V4: the bottom-right text panel is gone - the agent is voice plus
     on-page decode only. The hold bar doubles as the status pill while
     the agent speaks, and as the stop switch (tap it or press ESC). */
  const barLabel = bar.querySelector('.guide-hold__label');

  /* V4: a female voice for the agent. Chrome ships several; pick the
     best known female one, else let a raised pitch carry the default.
     The voice list can arrive async, so the cache resets on change. */
  let voiceCache = null;
  function pickVoice() {
    if (voiceCache) return voiceCache;
    const vs = speechSynthesis.getVoices();
    if (!vs.length) return null;
    const score = (v) => {
      const n = v.name.toLowerCase();
      let s = 0;
      /* Microsoft's neural "Online (Natural)" voices read far more human */
      if (n.includes('natural') || n.includes('online')) s += 4;
      if (n.includes('female')) s += 3;
      if (/zira|samantha|victoria|karen|moira|tessa|fiona|susan|allison|ava|serena|kate|stephanie|catherine|joelle|aditi|swara|heera|kalpana|neerja|lekha|veena|raveena|ananya|aarohi/.test(n)) s += 2;
      /* his ear is Indian English - prefer it as the tiebreak */
      if (/en-in|india|indian/.test(n) || v.lang === 'en-IN') s += 1;
      if (n.includes('google us english')) s += 1; /* reads female */
      return s;
    };
    const best = vs.slice().sort((a, b) => score(b) - score(a))[0];
    if (score(best) > 0) voiceCache = best;
    return voiceCache;
  }
  if ('speechSynthesis' in window) {
    speechSynthesis.onvoiceschanged = () => { voiceCache = null; };
  }

  let idx = 0, isOpen = false, robotFlip = false;
  let timers = [];
  function clearTimers() { timers.forEach(clearTimeout); timers = []; }

  /* (b) the section decode: mono label, headline and key text run
     scrambleText() again while cards/rows pop back in via CSS */
  function decodeSection(section) {
    section.classList.remove('guide-arrived');
    void section.offsetWidth; /* restart the CSS reveal */
    section.classList.add('guide-arrived');
    const targets = [...section.querySelectorAll('.section-label, .reveal-text, h2, h3, p')]
      .filter(el => el.children.length === 0 && el.textContent.trim())
      .slice(0, 6);
    targets.forEach(el => window.scrambleText(el, { duration: 450 }));
  }

  /* V6 item 10: speech SYNCS the tour. speakAndThen() chains the next
     step off the utterance's real onend - never an estimate - so the
     agent can neither skip ahead mid-sentence nor start late. Some
     engines drop onend; a generous fallback timer keeps the tour
     moving without ever cutting a line short. */
  function speakAndThen(text, onDone) {
    let done = false;
    const finish = () => { if (!done) { done = true; onDone(); } };
    const estimateMs = 1200 + text.length * 85; /* ceiling, not a schedule */
    timers.push(setTimeout(finish, estimateMs * 1.15)); /* V7: ceiling already generous; 2x was the dead gap */
    if (window.SOUND_ON && 'speechSynthesis' in window) {
      try {
        speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(text);
        const v = pickVoice();
        if (v) u.voice = v;
        u.rate = 1.04;
        u.pitch = v ? 1.0 : 1.25;
        u.volume = 0.9;
        u.onend = finish;
        u.onerror = finish;
        timers.push(setTimeout(() => {
          try { speechSynthesis.speak(u); } catch (err) { finish(); }
        }, 60));
      } catch (err) { finish(); }
    } else {
      /* sound off: keep the old estimated reading beat */
      timers.push(setTimeout(finish, REDUCED_MOTION ? 60 : estimateMs));
    }
    try { if ('vibrate' in navigator) navigator.vibrate(25); } catch (err) { /* no-op */ }
    bar.classList.add('is-speaking');
    const dur = REDUCED_MOTION ? 0 : Math.min(1100, 220 + text.length * 14);
    timers.push(setTimeout(() => bar.classList.remove('is-speaking'), dur + 150));
  }

  /* V5: the agent SCROLLS the page slowly at its own reading pace - a
     steady linear drive matched to the line length, never a jump-cut.
     Lenis gets a linear easing; without it a rAF drive does the same. */
  function guidedScroll(section, ms, onComplete) {
    if (REDUCED_MOTION) {
      section.scrollIntoView({ block: 'start' });
      if (onComplete) onComplete();
      return;
    }
    /* V7 item 3: the ride FILLS the pause between lines - its length comes
       from the distance to the section (~455px/s), so a short hop never
       sits frozen for seconds and a long ride is a real interlude. */
    const rideMs = Math.min(9000, Math.max(1400, Math.abs(ms) * 2.2));
    /* V6 item 10: the rAF drive is authoritative (Lenis is parked while
       the tour runs) so the landing is PIXEL-EXACT and onComplete fires
       the moment the section top reaches the viewport top - speech
       starts on the landing, never before, never after. */
    const startY = window.scrollY;
    const targetY = startY + section.getBoundingClientRect().top;
    const t0 = performance.now();
    (function step(now) {
      if (!isOpen) return; /* a stop mid-drive freezes the page where it is */
      const p = Math.min((now - t0) / rideMs, 1);
      window.scrollTo({ left: 0, top: startY + (targetY - startY) * p, behavior: 'instant' });
      if (p < 1) { requestAnimationFrame(step); return; }
      window.scrollTo({ left: 0, top: targetY, behavior: 'instant' }); /* pixel-aligned */
      if (onComplete) onComplete();
    })(t0);
  }

  /* (a) scroll -> (b) decode as it arrives -> (c) line 0.7s later */
  let lastShowAt = 0;
  function showLine(i) {
    const now = Date.now();
    if (now - lastShowAt < 900) return; /* v3: no accidental section skips */
    lastShowAt = now;
    idx = Math.max(0, Math.min(lines.length - 1, i));
    clearTimers();
    const { sel, text } = lines[idx];
    const section = sel ? document.querySelector(sel) : null;
    const advance = () => {
      if (!isOpen) return;
      if (idx < lines.length - 1) showLine(idx + 1);
      else closeGuide();
    };
    if (section) {
      /* V7 item 3: no fixed timer - the scroll ride IS the gap between
         lines. Distance in, duration derived inside guidedScroll. */
      guidedScroll(section, section.getBoundingClientRect().top, () => {
        /* landed pixel-exact: decode the section, THEN speak - the line
           starts on the landing, and the next section only scrolls once
           this line has fully sounded. */
        decodeSection(section);
        timers.push(setTimeout(() => {
          speakAndThen(text, () => timers.push(setTimeout(advance, 250)));
        }, REDUCED_MOTION ? 60 : 350));
      });
    } else {
      timers.push(setTimeout(() => {
        speakAndThen(text, () => timers.push(setTimeout(advance, 250)));
      }, 300));
    }
  }

  function openGuide() {
    if (isOpen) return;
    isOpen = true;
    cancelHold();
    bar.classList.add('is-live');
    barLabel.textContent = 'AI AGENT SPEAKING — ESC TO STOP';
    window.playTransition(() => {
      idx = 0;
      if (window._lenis) try { window._lenis.stop(); } catch (err) {} /* V6: rAF drive owns the tour */
      /* first line after the panels open back out */
      setTimeout(() => showLine(0), REDUCED_MOTION ? 60 : 500);
    }, { mode: 'sides' });
  }

  function closeGuide() {
    if (!isOpen) return;
    isOpen = false;
    clearTimers();
    if ('speechSynthesis' in window) try { speechSynthesis.cancel(); } catch (err) {}
    if (window._lenis) try { window._lenis.start(); window._lenis.scrollTo(window.scrollY, { immediate: true }); } catch (err) {}
    bar.classList.remove('is-live', 'is-speaking');
    barLabel.textContent = 'HOLD SPACE FOR AI AGENT';
    window.playTransition(() => {
      /* the visitor stays exactly where the agent stopped */
    }, { mode: 'sides' });
  }

  /* tap the live bar to stop the tour early (ESC works too) */
  bar.addEventListener('click', () => { if (isOpen) closeGuide(); });

  /* V5: the visitor grabs the wheel, the agent politely leaves. Any
     manual scroll input (wheel, touch drag, scroll keys) closes the
     tour instantly instead of fighting the guided drive. */
  ['wheel', 'touchmove'].forEach(ev =>
    addEventListener(ev, () => { if (isOpen) closeGuide(); }, { passive: true }));
  addEventListener('keydown', (e) => {
    if (isOpen && /^(ArrowUp|ArrowDown|PageUp|PageDown|Home|End)$/.test(e.key)) closeGuide();
  });
})();

/* ─── PROMPT 21: SCRAMBLE-ON-SCROLL EVERYWHERE ────────────────
   Section headlines and project card titles decode once when they
   first enter the viewport (the mono labels already do - Prompt 11).
   One pass per element: IntersectionObserver + unobserve. Body
   paragraphs and long text are deliberately excluded. The guide's
   section decode (Prompt 20) may still replay a section by calling
   scrambleText() directly. Reduced-motion: the engine no-ops, so
   text simply appears. */
(function initScrollScramble() {
  const targets = [...document.querySelectorAll('.section h2, .project-card__title')]
    .filter(el => el.children.length === 0 && el.textContent.trim());
  if (!targets.length) return;
  const io = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      /* V4: replays on every entry - no unobserve */
      if (!entry.target._scrambling) window.scrambleText(entry.target, { tick: true });
    });
  }, { threshold: 0.6 });
  targets.forEach(el => io.observe(el));
})();

/* ─── PROMPT 22: LENIS SMOOTH SCROLL ──────────────────────────
   Loaded from the jsDelivr CDN in each page's <head>. If the CDN
   fails (no window.Lenis) or reduced motion is on, the site simply
   keeps native scrolling - CSS scroll-behavior stays the fallback. */
(function initLenis() {
  if (REDUCED_MOTION) return;          /* reduced motion: native scrolling */
  if (typeof Lenis === 'undefined') return; /* CDN unreachable: native stays */
  const lenis = new Lenis({
    duration: 1.7,        /* V7 item 13: safarnamma-style weight - scroll takes its time */
    easing: (t) => 1 - Math.pow(1 - t, 4), /* their exact curve (1-(1-t)^4): hard start, long heavy glide tail */
    smoothWheel: true,    /* smooth the mouse wheel (trackpads already glide) */
    wheelMultiplier: 0.85, /* V7 item 13: each wheel tick travels less - deliberate, heavy */
    autoRaf: typeof gsap === 'undefined'
    /* One rAF authority only: when GSAP is present its ticker drives
       lenis.raf (Prompt 23), so autoRaf must stand down; when GSAP is
       absent Lenis runs its own loop. Double-driving would double-step
       the scroll every frame. */
  });
  window._lenis = lenis;  /* the transition jump and the guide reach it here */
})();

/* ─── PROMPT 23: GSAP + SCROLLTRIGGER ─────────────────────────
   Loaded from the jsDelivr CDN in every page. Everything below is
   layered: if the CDN fails, the CSS scroll-driven versions under
   Prompts 9G/17/23-fallbacks keep working untouched. Reduced motion
   skips all of it. */
(function initGsap() {
  if (REDUCED_MOTION) return;
  if (typeof gsap === 'undefined' || typeof ScrollTrigger === 'undefined') return;
  gsap.registerPlugin(ScrollTrigger);

  /* 1. Lenis <-> ScrollTrigger sync. Lenis is the scroll source of
     truth, so ScrollTrigger must re-measure on every Lenis scroll
     event (ScrollTrigger.update), and Lenis must step inside GSAP's
     ticker so scroll physics and tween sampling share one clock -
     two independent rAF loops would drift a frame apart and judder. */
  if (window._lenis) {
    window._lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add((time) => window._lenis.raf(time * 1000));
    gsap.ticker.lagSmoothing(0); /* no catch-up jumps after tab switches */
  }

  /* 2a. Page background fades white -> soft lavender -> white as the
     skills section passes through (index only). Flat colors only. */
  const skills = document.getElementById('skills');
  if (skills) {
    gsap.timeline({
      scrollTrigger: { trigger: skills, start: 'top bottom', end: 'bottom top', scrub: true }
    })
      .to(document.body, { backgroundColor: '#E9E4F8', ease: 'none' })
      .to(document.body, { backgroundColor: '#FFFFFF', ease: 'none' });
  }

  /* 2b. Mountains art break (beyond.html): re-drive the ridges with
     ScrollTrigger scrub so speeds feel physical. The CSS animation is
     switched off inline so the two never run at the same time. */
  const artBack = document.querySelector('.art-layer--back');
  const artMid = document.querySelector('.art-layer--mid');
  if (artBack && artMid) {
    [artBack, artMid].forEach(l => { l.style.animation = 'none'; });
    gsap.fromTo(artBack, { yPercent: -10 }, {
      yPercent: 20, ease: 'none',
      scrollTrigger: { trigger: '.art-break', start: 'top bottom', end: 'bottom top', scrub: true }
    });
    gsap.fromTo(artMid, { yPercent: -5 }, {
      yPercent: 10, ease: 'none',
      scrollTrigger: { trigger: '.art-break', start: 'top bottom', end: 'bottom top', scrub: true }
    });
  }

  /* 3. Fallbacks ONLY for browsers without CSS scroll-driven
     animations - where CSS handles it, GSAP stays off these. */
  const cssScrollOK = CSS.supports('animation-timeline: scroll()');
  const cssViewOK = CSS.supports('animation-timeline: view()');

  /* 3a. Hero portrait sequence fallback: 12-frame crossfade + slight
     scale, reading the same --frame-count as the CSS version. */
  const stage = document.querySelector('.hero-stage');
  if (stage && !cssScrollOK) {
    const frames = [...stage.querySelectorAll('.portrait-frame')];
    const bg = stage.querySelector('.hero-bg');
    const count = parseInt(stage.style.getPropertyValue('--frame-count'), 10) || frames.length;
    gsap.set(frames, { opacity: 0, animation: 'none' });
    gsap.set(frames[0], { opacity: 1 });
    ScrollTrigger.create({
      trigger: stage, start: 'top top', end: 'bottom bottom', scrub: true,
      onUpdate(self) {
        /* Same maths as the CSS slices: frame i crossfades in from
           (i-2)/(count-1) to i/(count-1) of a 77% window, then holds. */
        const q = self.progress * 100;
        frames.forEach((f, i) => {
          if (i === 0) return; /* the base frame stays on */
          const start = Math.max(0, (i + 1 - 2.5) / (count - 1) * 77);
          const end = (i + 1) / (count - 1) * 77;
          f.style.opacity = Math.min(1, Math.max(0, (q - start) / (end - start))).toFixed(3);
        });
        if (bg) bg.style.transform = `scale(${(1 + 0.06 * Math.min(1, q / 84)).toFixed(4)})`;
      }
    });
  }

  /* 3b. Project-card layer parallax fallback: same drifts as the CSS
     keyframes (back 10px, mid 15px, front 20px), scrubbed. */
  if (!cssViewOK) {
    document.querySelectorAll('.project-card').forEach(card => {
      const layers = [
        { el: card.querySelector('.layer-back'),  px: 5 },
        { el: card.querySelector('.layer-mid'),   px: 7.5 },
        { el: card.querySelector('.layer-front'), px: 10 }
      ].filter(l => l.el);
      layers.forEach(({ el, px }) => {
        el.style.animation = 'none';
        gsap.fromTo(el, { y: px }, {
          y: -px, ease: 'none',
          scrollTrigger: { trigger: card, start: 'top bottom', end: 'bottom top', scrub: true }
        });
      });
    });
  }
})();

/* ─── REVIEW ROUND: FOOTER LOCAL TIME ───────────────────────
   The third footer column shows Bengaluru time, live. */
(function initFooterClock() {
  const els = document.querySelectorAll('.footer-clock');
  if (!els.length) return;
  const fmt = new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Kolkata'
  });
  function tick() { const t = fmt.format(new Date()); els.forEach(el => el.textContent = t); }
  tick();
  setInterval(tick, 30000);
})();

/* ─── V4: FACE-CLIP HERO (drop-in hook for the AI video) ─────
   When Aditya's generated face clip lands, set ONE attribute on the
   hero stage - data-face-clip="assets/video/face-turn.mp4" - and this
   swaps the 12-frame crossfade stack for the video, scrubbing its
   playhead with scroll progress (the smooth turn he wants, zero
   stepped frames). With the attribute absent everything stays as-is.
   The video is decorative: muted, playsinline, preload auto. */
(function initFaceClip() {
  const stage = document.querySelector('.hero-stage');
  if (!stage || !stage.dataset.faceClip) return;
  const bg = stage.querySelector('.hero-bg');
  if (!bg) return;
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  video.src = stage.dataset.faceClip;
  video.setAttribute('aria-hidden', 'true');
  video.className = 'hero-clip';
  bg.appendChild(video);
  stage.classList.add('hero--clip'); /* CSS hides the frame stack */
  let ticking = false;
  function scrub() {
    ticking = false;
    if (!video.duration) return;
    const r = stage.getBoundingClientRect();
    const range = r.height - innerHeight;
    if (range <= 0) return;
    const p = Math.min(1, Math.max(0, -r.top / range));
    /* frames hold through the first 77% in the image version; the clip
       maps the whole turn onto the same window, then holds its last
       frame while About scrolls in. */
    const t = Math.min(1, p / 0.77) * video.duration;
    if (Math.abs(video.currentTime - t) > 0.04) video.currentTime = t;
  }
  addEventListener('scroll', () => {
    if (!ticking) { ticking = true; requestAnimationFrame(scrub); }
  }, { passive: true });
  video.addEventListener('loadedmetadata', scrub);
  scrub();
})();

/* ─── V3: SCROLL-STAGED HERO SEQUENCE ────────────────────────
   Progress over the (now 380vh) hero stage flips three beat classes
   on the stage: the name swings in first, the tagline follows, the
   buttons land last - all while the face keeps turning underneath.
   Reduced motion never gets .hero-seq, so nothing is ever hidden. */
(function initHeroSequence() {
  if (REDUCED_MOTION) return;
  const stage = document.querySelector('.hero-stage');
  if (!stage) return;
  stage.classList.add('hero-seq');
  const state = { name: null, sub: null, cta: null };
  let ticking = false;
  function update() {
    ticking = false;
    const r = stage.getBoundingClientRect();
    const range = r.height - innerHeight;
    if (range <= 0) return;
    const p = Math.min(1, Math.max(0, -r.top / range));
    /* V6 item 2: exit fires early enough that the name has fully lifted
       away BEFORE About enters the viewport (was 0.90 - About was already
       on screen, so name + About 'landed together'). */
    const beats = { name: p >= 0.05, sub: p >= 0.28, cta: p >= 0.46, exit: p >= 0.70 };
    for (const k of ['name', 'sub', 'cta', 'exit']) {
      if (beats[k] === state[k]) continue;
      if (k === 'name' && beats.name && state.name !== null) {
        playSfx('assets/sfx/hover.mp3', 0.12); /* a soft stamp as the name lands */
      }
      state[k] = beats[k];
      stage.classList.toggle('seq-' + k, beats[k]);
    }
  }
  addEventListener('scroll', () => {
    if (!ticking) { ticking = true; requestAnimationFrame(update); }
  }, { passive: true });
  update();
})();

/* ─── REVIEW ROUND: HERO SCROLL STORY ─────────────────────────
   As the 300vh hero-stage scrolls past, a small mono line at the
   right edge narrates the face turn in four beats, then clears
   before About arrives. JS-injected, so no-JS never sees it;
   beat swaps run through scrambleText (plain text under
   reduced motion). */
(function initHeroStory() {
  const stage = document.querySelector('.hero-stage');
  if (!stage) return;
  const sticky = stage.querySelector('.hero-sticky');
  if (!sticky) return;
  const BEATS = [
    [0.00, 'SCROLL — THE FACE TURNS'],
    [0.28, 'EVERY FRAME, A DIFFERENT ANGLE.'],
    [0.56, 'SAME GUY. DEEPER STORY.'],
    [0.82, 'NOW THE WORK ↓']
  ];
  const el = document.createElement('p');
  el.className = 'hero__story';
  el.setAttribute('aria-hidden', 'true');
  sticky.appendChild(el);
  let current = -1, ticking = false;
  function update() {
    ticking = false;
    const r = stage.getBoundingClientRect();
    const range = r.height - innerHeight;
    if (range <= 0) return;
    const p = Math.min(1, Math.max(0, -r.top / range));
    let beat = -1;
    for (let i = 0; i < BEATS.length; i++) if (p >= BEATS[i][0]) beat = i;
    if (p > 0.97) beat = -1; /* clear before About takes over */
    if (beat === current) return;
    current = beat;
    if (beat < 0) { el.classList.remove('is-live'); return; }
    el.classList.add('is-live');
    el.dataset.scrambleText = BEATS[beat][1];
    if (REDUCED_MOTION || el._scrambling) el.textContent = BEATS[beat][1];
    else window.scrambleText(el, { duration: 300 });
  }
  addEventListener('scroll', () => {
    if (!ticking) { ticking = true; requestAnimationFrame(update); }
  }, { passive: true });
  update();
})();

/* ─── PROMPT 24: FOOTER WORDMARK FINALE ───────────────────────
   When the footer first scrolls into view, ADITYA assembles letter
   by letter: the A drops first in lavender, each letter follows with
   a small settle bounce and a quiet tick, then one last scramble
   pass runs over the footer mono links. Once, via IO + unobserve. */
(function initFooterFinale() {
  const footer = document.querySelector('.footer');
  const wordmark = document.querySelector('.footer__wordmark');
  if (!footer || !wordmark) return;

  /* split the wordmark (aria-hidden decor, so spans are safe) */
  const text = wordmark.textContent;
  wordmark.textContent = '';
  const letters = [...text].map((ch, i) => {
    const s = document.createElement('span');
    s.className = 'footer__letter' + (i === 0 ? ' footer__letter--first' : '');
    s.textContent = ch;
    wordmark.appendChild(s);
    return s;
  });

  const acro = document.querySelector('.footer__acrostic');
  if (acro && !REDUCED_MOTION) acro.classList.add('will-stage');

  /* V4: the finale replays on EVERY scroll into the footer - he called
     out the wordmark + acrostic + quicklinks animations firing only on
     first load. Scrolling away resets the state; re-entering re-runs. */
  let finaleTimers = [];
  let finaleRunning = false;
  function runFinale() {
    if (finaleRunning) return;
    finaleRunning = true;
    wordmark.classList.remove('is-dropping');
    void wordmark.offsetWidth; /* restart the letter animations */
    wordmark.classList.add('is-dropping');
    /* the acrostic stages in right after the last letter lands */
    if (acro) {
      acro.classList.remove('is-staged');
      finaleTimers.push(setTimeout(() => acro.classList.add('is-staged'),
        REDUCED_MOTION ? 0 : letters.length * 90 + 400));
    }
    if (!REDUCED_MOTION) {
      letters.forEach((s, i) => {
        s.style.animationDelay = (i * 0.09) + 's';
        finaleTimers.push(setTimeout(() => playSfx('assets/sfx/scramble.mp3', 0.08), i * 90));
      });
      /* after the last letter lands: one subtle scramble over the
         footer mono links */
      finaleTimers.push(setTimeout(() => {
        document.querySelectorAll('.footer__link')
          .forEach(el => window.scrambleText(el, { duration: 350 }));
        finaleRunning = false;
      }, letters.length * 90 + 550));
    } else {
      /* reduced motion: letters simply appear, links decode instantly */
      document.querySelectorAll('.footer__link')
        .forEach(el => window.scrambleText(el, { duration: 0 }));
      finaleRunning = false;
    }
  }
  const io = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) { runFinale(); return; }
      finaleTimers.forEach(clearTimeout); finaleTimers = [];
      finaleRunning = false;
      wordmark.classList.remove('is-dropping');
      if (acro) acro.classList.remove('is-staged');
    });
  }, { threshold: 0.3 });
  io.observe(footer);
})();

/* ─── V4 ITEM 15: PROJECT ROWS - HOLD SUMMARY + EVERYTHING ────
   Five full-width rows. Hold a card 900ms: the lavender fill grows
   from the press point and the SUMMARY opens. The + EVERYTHING
   button skips the hold and opens the full story. ESC / tap
   outside closes. Where CSS view-timeline is missing, an IO drives
   the edge-on -> flat reveal (replaying both ways). */
(function initProjectRows() {
  const rows = [...document.querySelectorAll('.prow')];
  if (!rows.length) return;

  if (!CSS.supports('animation-timeline: view()') && !REDUCED_MOTION) {
    document.documentElement.classList.add('no-view-timeline');
    const io = new IntersectionObserver((entries) => {
      entries.forEach(entry => entry.target.classList.toggle('is-flat', entry.isIntersecting));
    }, { threshold: 0.35 });
    rows.forEach(r => io.observe(r));
  }

  const overlay = document.createElement('div');
  overlay.className = 'prow-overlay';
  overlay.innerHTML =
    '<div class="prow-overlay__panel" role="dialog" aria-modal="true">' +
      '<p class="prow-overlay__kicker section-label"></p>' +
      '<h3 class="prow-overlay__title"></h3>' +
      '<div class="prow-overlay__body"></div>' +
      '<p class="prow-overlay__hint section-label">ESC OR TAP OUTSIDE TO CLOSE</p>' +
      '<span class="prow-overlay__scan" aria-hidden="true"></span>' +
    '</div>';
  document.body.appendChild(overlay);
  const kickerEl = overlay.querySelector('.prow-overlay__kicker');
  const titleEl = overlay.querySelector('.prow-overlay__title');
  const bodyEl = overlay.querySelector('.prow-overlay__body');
  let openRow = null;

  function openOverlay(mode, row) {
    openRow = row;
    kickerEl.textContent = (mode === 'summary' ? 'SUMMARY' : 'ALL DETAILS') + ' — ' + row.dataset.number; /* V7 item 9: renamed */
    titleEl.textContent = row.dataset.title;
    bodyEl.textContent = mode === 'summary' ? row.dataset.summary : row.dataset.details;
    overlay.classList.add('is-open');
    if (!REDUCED_MOTION) window.scrambleText(titleEl, { duration: 300 });
    playSfx('assets/sfx/transition.mp3', 0.25);
  }
  function closeOverlay() {
    overlay.classList.remove('is-open');
    openRow = null;
  }
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeOverlay(); });
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && openRow) closeOverlay(); });

  const HOLD_MS = 900;
  rows.forEach(row => {
    /* V7 item 9: KPR press ring - a circular progress line grows around the
       press point; when it completes the full circle, you go in. */
    const ring = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    ring.setAttribute('class', 'prow__pressring');
    ring.setAttribute('viewBox', '0 0 132 132');
    ring.setAttribute('aria-hidden', 'true');
    ring.innerHTML = '<circle class="bg" cx="66" cy="66" r="54"></circle><circle class="fg" cx="66" cy="66" r="54"></circle>';
    row.appendChild(ring);
    let holdTimer = null;
    function startHold(x, y) {
      if (openRow || holdTimer) return;
      const r = row.getBoundingClientRect();
      ring.style.left = (x - r.left) + 'px';
      ring.style.top = (y - r.top) + 'px';
      row.classList.add('is-holding');
      ring.classList.remove('is-live');
      void ring.getBoundingClientRect(); /* restart the dash draw */
      ring.classList.add('is-live');
      holdTimer = setTimeout(() => {
        holdTimer = null;
        row.classList.remove('is-holding');
        ring.classList.remove('is-live');
        try { if ('vibrate' in navigator) navigator.vibrate(30); } catch (err) { /* no-op */ }
        openOverlay('summary', row);
      }, HOLD_MS + 80); /* the circle completes first, THEN you go in */
    }
    function cancelHold() {
      if (holdTimer) { clearTimeout(holdTimer); holdTimer = null; }
      row.classList.remove('is-holding');
      ring.classList.remove('is-live');
    }
    row.addEventListener('pointerdown', (e) => {
      if (e.target.closest('button, a')) return;
      startHold(e.clientX, e.clientY);
    });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach(ev => row.addEventListener(ev, cancelHold));
    row.addEventListener('pointermove', (e) => {
      if (!holdTimer) return;
      const r = row.getBoundingClientRect();
      ring.style.left = (e.clientX - r.left) + 'px';
      ring.style.top = (e.clientY - r.top) + 'px';
    });
    row.addEventListener('contextmenu', (e) => e.preventDefault());
    /* keyboard: hold ENTER on a focused card for the summary */
    row.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.repeat && document.activeElement === row) {
        const r = row.getBoundingClientRect();
        startHold(r.left + r.width / 2, r.top + r.height / 2);
      }
    });
    row.addEventListener('keyup', (e) => { if (e.key === 'Enter') cancelHold(); });
    row.querySelector('[data-everything]').addEventListener('click', (e) => {
      e.stopPropagation();
      cancelHold();
      openOverlay('everything', row);
    });
  });
})();

/* ─── V5: KPR CURSOR TILT ON PROJECT ROWS ───────────────────
   The row leans toward the cursor in 3D - KPR's card feel. Fine
   pointers + motion-safe only; rows are fully readable without
   it. Lerp-driven so it glides instead of snapping. */
(function initProwTilt() {
  if (REDUCED_MOTION || !window.matchMedia('(pointer: fine)').matches) return;
  document.querySelectorAll('.prow__card').forEach((row) => { /* V6 item 4: tilt the KPR card, never the text */
    let rx = 0, ry = 0, tx = 0, ty = 0, mx = 0, my = 0, tmx = 0, tmy = 0, raf = null;
    function loop() {
      rx += (tx - rx) * 0.12;
      ry += (ty - ry) * 0.12;
      mx += (tmx - mx) * 0.14;
      my += (tmy - my) * 0.14;
      row.style.transform = 'translate3d(' + mx.toFixed(2) + 'px,' + my.toFixed(2) + 'px,0) rotateX(' + rx.toFixed(3) + 'deg) rotateY(' + ry.toFixed(3) + 'deg)';
      if (Math.abs(tx - rx) > 0.005 || Math.abs(ty - ry) > 0.005 || Math.abs(tmx - mx) > 0.02 || Math.abs(tmy - my) > 0.02) {
        raf = requestAnimationFrame(loop);
      } else {
        row.style.transform = (tx === 0 && ty === 0 && tmx === 0 && tmy === 0) ? '' : row.style.transform;
        raf = null;
      }
    }
    function kick() { if (!raf) raf = requestAnimationFrame(loop); }
    row.addEventListener('pointermove', (e) => {
      const r = row.getBoundingClientRect();
      const nx = (e.clientX - r.left) / r.width - 0.5;
      const ny = (e.clientY - r.top) / r.height - 0.5;
      ty = nx * 6;   /* rotateY follows x */
      tx = -ny * 4;  /* rotateX follows y */
      tmx = nx * 34; /* V7 item 8: the window MOVES with the cursor (+-17px) */
      tmy = ny * 22; /* +-11px vertical drift */
      kick();
    });
    row.addEventListener('pointerleave', () => { tx = 0; ty = 0; tmx = 0; tmy = 0; kick(); });
  });
})();
