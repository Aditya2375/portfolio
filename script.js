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
window.SOUND_ON = sessionStorage.getItem('soundChoice') === 'on';
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
  community: 'assets/music/about.mp3',
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
  if (sessionStorage.getItem('soundChoice')) {
    // A later page of the visit: restore the choice, start the music.
    if (window.SOUND_ON) startPageMusic();
    return;
  }

  // Pause the hero load-in animations until the visitor enters (CSS rule).
  document.documentElement.classList.add('intro-gated');

  const overlay = document.createElement('div');
  overlay.className = 'intro';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-label', 'Enter the portfolio');
  overlay.innerHTML = `
    <div class="intro__stage">
      <p class="intro__word" aria-hidden="true">ADITYA</p>
    </div>
    <p class="intro__readout" role="status">//INITIALIZING PORTFOLIO... [0%]</p>
    <div class="intro__actions">
      <button type="button" class="btn intro__btn" data-sound="on">ENTER WITH SOUND</button>
      <button type="button" class="btn intro__btn" data-sound="off">ENTER WITHOUT SOUND</button>
    </div>`;
  document.body.appendChild(overlay);
  document.body.style.overflow = 'hidden'; // the overlay gates the site

  /* REAL preload progress, not a fake timer: we count only what the
     first seconds need — the intro + hero tracks, the sound effects,
     and frame01 from whichever frame set this screen actually uses.
     The other hero frames and section tracks load on their own later. */
  const frameSrc = window.matchMedia('(min-aspect-ratio: 1/1)').matches
    ? 'assets/frames/landscape/frame01_16x9.jpg'
    : 'assets/frames/frame01.jpg';
  const toPreload = [
    'assets/music/intro.mp3', 'assets/music/hero.mp3',
    'assets/sfx/hover.mp3', 'assets/sfx/scramble.mp3', 'assets/sfx/transition.mp3',
    'assets/sfx/robot-1.mp3', 'assets/sfx/robot-2.mp3',
    frameSrc,
  ];
  let done = 0;
  const readout = overlay.querySelector('.intro__readout');
  const showEnter = () => overlay.classList.add('intro--ready');
  const countOne = () => {
    done++;
    const pct = Math.round((done / toPreload.length) * 100);
    readout.textContent = `//INITIALIZING PORTFOLIO... [${pct}%]`;
    if (done >= toPreload.length) showEnter();
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
  /* Safety net: on slow mobile data the loader can never get stuck —
     the ENTER buttons appear after ~6s no matter what, and anything
     still loading simply continues in the background. */
  setTimeout(showEnter, 6000);

  function enter(withSound) {
    window.SOUND_ON = withSound;
    sessionStorage.setItem('soundChoice', withSound ? 'on' : 'off');
    document.body.classList.toggle('sound-on', withSound);
    document.body.classList.toggle('sound-off', !withSound);
    document.body.style.overflow = '';

    /* Browser autoplay rules: audio may only start inside a user
       gesture. That is why the intro track starts on THIS click and
       could not start while the loader was still preloading. */
    if (withSound) {
      musicEngine.ensureContext();
      musicEngine.playTrack('assets/music/intro.mp3', { loop: false });
      playSfx('assets/sfx/transition.mp3', 0.3);
    }

    overlay.classList.add('intro--leaving'); // clip-path wipe (CSS)
    document.documentElement.classList.remove('intro-gated'); // hero slide-in runs now

    setTimeout(() => {
      overlay.remove();
      // crossfade intro -> this page's own track over the next beats
      if (withSound) musicEngine.crossfadeTo(PAGE_TRACKS[PAGE_ID] || PAGE_TRACKS.home);
    }, REDUCED_MOTION ? 0 : 700);
  }

  overlay.querySelector('[data-sound="on"]').addEventListener('click', () => enter(true));
  overlay.querySelector('[data-sound="off"]').addEventListener('click', () => enter(false));
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
   decode once when they first enter the viewport. IntersectionObserver
   + unobserve guarantees exactly one pass per label. */
(function initLabelScramble() {
  const labels = document.querySelectorAll('.section__header .section-label');
  if (!labels.length) return;
  const io = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      window.scrambleText(entry.target, { tick: true });
      io.unobserve(entry.target);
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
const FOOTER_TRACK = 'assets/music/contact.mp3';

(function initSectionSoundtrack() {
  const map = SECTION_TRACKS[PAGE_ID] || {};
  const sections = Object.keys(map)
    .map(id => document.getElementById(id))
    .filter(Boolean);
  const footer = document.querySelector('.footer');
  if (!sections.length && !footer) return;

  /* rootMargin -50% top/bottom collapses the observation band to the
     exact middle line of the viewport: a section "owns" the music when
     it crosses that line. */
  const io = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      const track = entry.target.classList.contains('footer')
        ? FOOTER_TRACK
        : map[entry.target.id];
      if (track) musicEngine.crossfadeTo(track);
    });
  }, { rootMargin: '-50% 0px -50% 0px', threshold: 0 });

  sections.forEach(sec => io.observe(sec));
  if (footer) io.observe(footer);
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
     The decode runs on the DUPLICATE label (.roll-text--dup), so the
     CSS roll hover and the scramble resolve together. The original
     text stays safe in the data attribute; a running scramble is
     never restarted (the engine guards it). With script.js deleted,
     the CSS roll hover still works on its own. */
  document.querySelectorAll('.navbar__link, .footer__link').forEach(a => {
    const dup = a.querySelector('.roll-text--dup') || a;
    a.addEventListener('mouseenter', () => {
      window.scrambleText(dup, { duration: 300 });
      playSfx('assets/sfx/hover.mp3', 0.2);
    });
  });

  /* 4. Progress-bar fallback: where CSS scroll-timeline is unsupported
     the @supports block never renders the bar, so JS drives scaleX. */
  if (!CSS.supports('animation-timeline: scroll()')) {
    const bar = document.querySelector('.scroll-progress');
    if (bar) {
      bar.style.display = 'block';
      const update = () => {
        const max = document.documentElement.scrollHeight - innerHeight;
        bar.style.transform = `scaleX(${max > 0 ? scrollY / max : 0})`;
      };
      addEventListener('scroll', update, { passive: true });
      update();
    }
  }
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
    heroBg.style.scale = '1.05';
    const layers = [
      { el: heroBg,    depth: -36 }, /* opposite the cursor, ±18px */
      { el: gridLines, depth: 16 },  /* with the cursor, ±8px */
      { el: crosshair, depth: 44 }   /* loosest layer, ±22px */
    ].filter(l => l.el).map(l => ({
      cx: 0, cy: 0, tx: 0, ty: 0,
      apply(x, y) {
        l.el.style.translate = `${(x * l.depth).toFixed(2)}px ${(y * l.depth).toFixed(2)}px`;
      }
    }));
    layers.forEach(l => items.push(l));
    heroArea.addEventListener('mousemove', (e) => {
      const r = heroArea.getBoundingClientRect();
      const nx = (e.clientX - r.left) / r.width - 0.5;  /* -0.5 … 0.5 */
      const ny = (e.clientY - r.top) / r.height - 0.5;
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
          `perspective(700px) rotateX(${(-y * 9).toFixed(2)}deg) rotateY(${(x * 11).toFixed(2)}deg)`;
        front.style.transform = `translate(${(-x * 40).toFixed(2)}px, ${(-y * 40).toFixed(2)}px)`;
        mid.style.transform   = `translate(${(-x * 20).toFixed(2)}px, ${(-y * 20).toFixed(2)}px)`;
        back.style.transform  = `translate(${(-x * 6).toFixed(2)}px, ${(-y * 6).toFixed(2)}px)`;
      }
    };
    items.push(st);
    card.addEventListener('mousemove', (e) => {
      const r = card.getBoundingClientRect();
      st.tx = (e.clientX - r.left) / r.width - 0.5;
      st.ty = (e.clientY - r.top) / r.height - 0.5;
      kick();
    });
    card.addEventListener('mouseleave', () => { st.tx = 0; st.ty = 0; kick(); });
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
  const COVER_MS = 380;   /* veil wipe-in */
  const HOLD_MS = 80;     /* beat at full cover before uncovering */
  const UNCOVER_MS = 380; /* veil wipe-out */
  let overlay = null, running = false;

  function buildOverlay() {
    if (overlay) return overlay;
    overlay = document.createElement('div');
    overlay.className = 'transition-overlay';
    overlay.setAttribute('aria-hidden', 'true');
    overlay.innerHTML =
      '<div class="transition-overlay__veil"></div>' +
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
    window.playTransition(() => {
      sessionStorage.setItem('ak-transition-arrive', '1');
      location.href = url.href; /* a #hash rides along: lands on the section */
    });
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
    if (e.code === 'Space' && !e.repeat) { e.preventDefault(); startHold(); }
  });
  bar.addEventListener('keyup', (e) => { if (e.code === 'Space') cancelHold(); });
  addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isOpen) { closeGuide(); return; }
    if (e.code !== 'Space' || e.repeat || isOpen) return;
    const t = e.target;
    if (t && t.closest && t.closest('input, textarea, select, [contenteditable], a, button')) return;
    e.preventDefault(); /* space scrolls by default - the hold owns it here */
    startHold();
  });
  addEventListener('keyup', (e) => { if (e.code === 'Space') cancelHold(); });

  /* The docked panel */
  const panel = document.createElement('aside');
  panel.className = 'guide-panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Site guide');
  panel.innerHTML =
    '<p class="guide-panel__kicker">//AI AGENT</p>' +
    '<p class="guide-panel__line" aria-live="polite"></p>' +
    '<span class="guide-panel__wave" aria-hidden="true"><i></i><i></i><i></i><i></i></span>' +
    '<div class="guide-panel__controls">' +
      '<button type="button" data-guide="prev">PREV</button>' +
      '<button type="button" data-guide="next">NEXT</button>' +
      '<button type="button" data-guide="close">CLOSE</button>' +
    '</div>' +
    (next ? `<a class="guide-panel__nextpage" href="${next.href}" hidden><span>NEXT</span><span>${next.name} →</span></a>` : '');
  document.body.appendChild(panel);
  const lineEl = panel.querySelector('.guide-panel__line');
  const prevBtn = panel.querySelector('[data-guide="prev"]');
  const nextBtn = panel.querySelector('[data-guide="next"]');
  const nextRow = panel.querySelector('.guide-panel__nextpage');

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

  /* (c) the line itself: robot sting, waveform on, scramble in, vibrate */
  function speak(text) {
    robotFlip = !robotFlip;
    playSfx(robotFlip ? 'assets/sfx/robot-1.mp3' : 'assets/sfx/robot-2.mp3', 0.15);
    try { if ('vibrate' in navigator) navigator.vibrate(25); } catch (err) { /* no-op */ }
    panel.classList.add('is-speaking');
    lineEl.dataset.scrambleText = text;
    const dur = REDUCED_MOTION ? 0 : Math.min(1100, 220 + text.length * 14);
    window.scrambleText(lineEl, { duration: dur });
    if (REDUCED_MOTION) lineEl.textContent = text;
    timers.push(setTimeout(() => panel.classList.remove('is-speaking'), dur + 150));
  }

  /* (a) scroll -> (b) decode as it arrives -> (c) line 0.7s later */
  function showLine(i) {
    idx = Math.max(0, Math.min(lines.length - 1, i));
    clearTimers();
    const { sel, text } = lines[idx];
    const section = sel ? document.querySelector(sel) : null;
    if (section) {
      /* Prompt 22: eased through Lenis when it runs, native otherwise */
      if (window._lenis) window._lenis.scrollTo(section, { duration: 1.0 });
      else section.scrollIntoView({ behavior: REDUCED_MOTION ? 'auto' : 'smooth', block: 'start' });
      timers.push(setTimeout(() => decodeSection(section), REDUCED_MOTION ? 0 : 550));
      timers.push(setTimeout(() => speak(text), REDUCED_MOTION ? 60 : 1250));
    } else {
      timers.push(setTimeout(() => speak(text), 300));
    }
    prevBtn.disabled = idx === 0;
    nextBtn.disabled = idx === lines.length - 1;
    if (nextRow) nextRow.hidden = idx !== lines.length - 1;
    /* Auto-tour (review round): after the line lands, the agent moves
       to the next section on its own - no clicks needed. Manual
       PREV/NEXT re-enters the same flow at that line. */
    const speakDur = REDUCED_MOTION ? 0 : Math.min(1100, 220 + text.length * 14);
    const readPause = 1600 + text.length * 30;
    if (idx < lines.length - 1) {
      timers.push(setTimeout(() => { if (isOpen) showLine(idx + 1); },
        (REDUCED_MOTION ? 60 : 1250) + speakDur + readPause));
    }
  }

  function openGuide() {
    if (isOpen) return;
    isOpen = true;
    cancelHold();
    bar.classList.add('is-hidden');
    window.playTransition(() => {
      panel.classList.add('is-open');
      idx = 0;
      /* first line after the panels open back out */
      setTimeout(() => showLine(0), REDUCED_MOTION ? 60 : 500);
    }, { mode: 'sides' });
  }

  function closeGuide() {
    if (!isOpen) return;
    isOpen = false;
    clearTimers();
    window.playTransition(() => {
      panel.classList.remove('is-open', 'is-speaking');
      bar.classList.remove('is-hidden');
      /* the visitor stays exactly where the agent stopped */
    }, { mode: 'sides' });
  }

  prevBtn.addEventListener('click', () => showLine(idx - 1));
  nextBtn.addEventListener('click', () => showLine(idx + 1));
  panel.querySelector('[data-guide="close"]').addEventListener('click', closeGuide);
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
      window.scrambleText(entry.target, { tick: true });
      io.unobserve(entry.target); /* exactly one pass per element */
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
    duration: 1.55,       /* REVIEW ROUND 2: heavier, KSR-style scroll weight (was 1.1) */
    easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)), /* exponential-out: fast start, soft landing */
    smoothWheel: true,    /* smooth the mouse wheel (trackpads already glide) */
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
          const start = (i - 2) / (count - 1) * 77;
          const end = i / (count - 1) * 77;
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

  const io = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      io.unobserve(footer); /* the ending happens once */
      wordmark.classList.add('is-dropping');
      if (!REDUCED_MOTION) {
        letters.forEach((s, i) => {
          s.style.animationDelay = (i * 0.09) + 's';
          setTimeout(() => playSfx('assets/sfx/scramble.mp3', 0.08), i * 90);
        });
        /* after the last letter lands: one subtle scramble over the
           footer mono links (the visible roll-text of each) */
        setTimeout(() => {
          document.querySelectorAll('.footer__link .roll-text:not(.roll-text--dup)')
            .forEach(el => window.scrambleText(el, { duration: 350 }));
        }, letters.length * 90 + 550);
      } else {
        /* reduced motion: letters simply appear, links decode instantly */
        document.querySelectorAll('.footer__link .roll-text:not(.roll-text--dup)')
          .forEach(el => window.scrambleText(el, { duration: 0 }));
      }
    });
  }, { threshold: 0.3 });
  io.observe(footer);
})();
