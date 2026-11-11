'use strict';
(() => {
  document.body.classList.remove('no-js');
  const header = document.querySelector('.site-header');
  const menuButton = document.querySelector('.menu-button');
  const menu = document.querySelector('.site-menu');
  const main = document.querySelector('main');
  const footer = document.querySelector('footer');
  let menuOpen = false;
  const setMenu = open => {
    menuOpen = open;
    menu.hidden = !open;
    menuButton.setAttribute('aria-expanded', String(open));
    menuButton.innerHTML = open ? 'CLOSE <span aria-hidden="true">×</span>' : 'MENU <span aria-hidden="true">☰</span>';
    header.classList.toggle('menu-open', open);
    main.inert = open;
    footer.inert = open;
    document.body.style.overflow = open ? 'hidden' : '';
    if (open) menu.querySelector('a').focus();
  };
  menuButton.addEventListener('click', () => setMenu(!menuOpen));
  menu.addEventListener('click', event => {if (event.target.closest('a')) setMenu(false);});
  document.addEventListener('keydown', event => {
    if (!menuOpen) return;
    if (event.key === 'Escape') {setMenu(false); menuButton.focus();}
    if (event.key === 'Tab') {
      const items = [menuButton, ...menu.querySelectorAll('a[href]')];
      const i = items.indexOf(document.activeElement);
      if (event.shiftKey && i === 0) {event.preventDefault();items[items.length-1].focus();}
      else if (!event.shiftKey && i === items.length-1) {event.preventDefault();items[0].focus();}
    }
  });
  let scrollQueued = false;
  const syncHeader = () => {
    header.classList.toggle('scrolled', scrollY > 24);
    const item = document.elementFromPoint(Math.max(15, innerWidth / 2), 80);
    header.classList.toggle('paper-header', !!item?.closest('.project-stage,.work-intro,.all-work,.project-index'));
    scrollQueued = false;
  };
  addEventListener('scroll', () => {if (!scrollQueued) {scrollQueued = true;requestAnimationFrame(syncHeader);}}, {passive:true});
  syncHeader();
  const canvas = document.querySelector('#portrait');
  if (!canvas) return;
  const wrapper = canvas.closest('.hero-art');
  const hero = document.querySelector('.hero');
  const toggle = document.querySelector('.motion-button');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const context = canvas.getContext('2d');
  if (!context) {toggle.hidden = true; return;}
  let points = null, paused = reduced.matches, visible = true, pointerX = 0, pointerY = 0, last = 0, frame = 0, active = false;
  const draw = time => {
    if (!points) return;
    context.clearRect(0, 0, 580, 725);
    context.save();
    const progress = paused ? 0 : Math.min(1, Math.max(0, scrollY / hero.offsetHeight));
    context.translate(290, 360 - progress * 24);
    context.scale(1 + progress * .06, 1 + progress * .06);
    context.translate(-290, -360);
    const phase = paused ? 0 : time * .0003;
    context.lineWidth = .7;
    for (let j = 0; j < points.length; j++) {
      const row = points[j];
      const v = row.reduce((a,p) => a + p[2], 0) / row.length;
      context.strokeStyle = `rgba(182,224,207,${.28+v*.65})`;
      context.beginPath();
      row.forEach(([x,y,v],i) => {
        const z = v * 17;
        const xx = x + (paused ? 0 : Math.sin(phase + y*.009)*2) + pointerX*z;
        const yy = y + pointerY*z;
        i ? context.lineTo(xx,yy) : context.moveTo(xx,yy);
      });
      context.stroke();
    }
    context.strokeStyle = 'rgba(160,205,188,.20)';
    context.lineWidth = .55;
    for (let col = 0; col < 96; col += 2) {
      let previous = null;
      for (const row of points) {
        const p = row[col];
        if (!p) {previous=null;continue;}
        if (previous && Math.abs(previous[0]-p[0]) < 17 && Math.abs(previous[1]-p[1])<20) {
          context.beginPath();context.moveTo(previous[0]+pointerX*previous[2]*17,previous[1]+pointerY*previous[2]*17);context.lineTo(p[0]+pointerX*p[2]*17,p[1]+pointerY*p[2]*17);context.stroke();
        }
        previous=p;
      }
    }
    context.restore();
  };
  const tick = t => {
    if (paused || !visible || document.hidden) {active=false;return;}
    if (t-last > 40) {draw(t);last=t;}
    frame=requestAnimationFrame(tick);
  };
  const start = () => {if (!active && points && !paused && visible && !document.hidden) {active=true;frame=requestAnimationFrame(tick);}};
  const sync = () => {
    document.body.classList.toggle('motion-paused', paused);
    toggle.textContent = paused ? 'RESUME MOTION' : 'PAUSE MOTION';
    toggle.setAttribute('aria-pressed', String(paused));
    if (paused) {cancelAnimationFrame(frame);active=false;pointerX=pointerY=0;draw(0);} else start();
  };
  toggle.addEventListener('click', () => {paused=!paused;sync();});
  reduced.addEventListener('change', () => {paused=reduced.matches;sync();});
  hero.addEventListener('pointermove', event => {
    if (paused || event.pointerType !== 'mouse') return;
    pointerX=(event.clientX/innerWidth-.5)*.7;
    pointerY=(event.clientY/innerHeight-.5)*.35;
  },{passive:true});
  hero.addEventListener('pointerleave',()=>{pointerX=pointerY=0;});
  new IntersectionObserver(entries => {visible=entries[0].isIntersecting;start();},{threshold:.01}).observe(hero);
  document.addEventListener('visibilitychange', start);
  fetch('assets/review/portrait-wire.json').then(response => {if (!response.ok) throw new Error('Portrait data unavailable');return response.json();}).then(data => {
    points=data;draw(0);wrapper.classList.add('ready');sync();
  }).catch(() => {toggle.hidden=true;});
})();
