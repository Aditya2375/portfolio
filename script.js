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
      <span class="intro__orbit" aria-hidden="true"></span>
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
const SECTION_TRACKS = {
  home: {
    hero: 'assets/music/hero.mp3',
    about: 'assets/music/about.mp3',
    skills: 'assets/music/skills.mp3',
    projects: 'assets/music/projects.mp3',
    explore: 'assets/music/about.mp3', // Explore reuses the About track
    contact: 'assets/music/contact.mp3',
  },
  academics: { hero: 'assets/music/education.mp3', now: 'assets/music/education.mp3', exams: 'assets/music/education.mp3', school: 'assets/music/education.mp3', olympiads: 'assets/music/education.mp3', learning: 'assets/music/education.mp3' },
  projects:  { hero: 'assets/music/projects.mp3', 'projects-section': 'assets/music/projects.mp3' },
  beyond:    { hero: 'assets/music/about.mp3', trekking: 'assets/music/about.mp3', running: 'assets/music/about.mp3', cycling: 'assets/music/about.mp3', sport: 'assets/music/about.mp3', music: 'assets/music/about.mp3' },
  community: { hero: 'assets/music/about.mp3', leadership: 'assets/music/about.mp3', clubs: 'assets/music/about.mp3', events: 'assets/music/about.mp3', volunteering: 'assets/music/about.mp3', connect: 'assets/music/about.mp3' },
};
const FOOTER_TRACK = 'assets/music/footer.mp3';

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
