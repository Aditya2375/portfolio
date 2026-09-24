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
    setDeckVolume(active, TARGET, 300);
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
    setDeckVolume(old, 0, 500);         // old track ramps down...
    setDeckVolume(active, TARGET, 500); // ...while the new one ramps up
    currentTrack = src;
  }

  return {
    ensureContext,
    playTrack,
    crossfadeTo,
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
