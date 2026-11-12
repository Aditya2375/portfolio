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
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let storedPause = false;
  try { storedPause = localStorage.getItem('portfolio-motion-paused') === 'true'; } catch {}
  let paused = reduced.matches || storedPause;
  const canvas = document.querySelector('#portrait');
  const hero = document.querySelector('.hero');
  const sequence = document.querySelector('.hero-sequence');
  const screens = [...document.querySelectorAll('.project-screen')];
  const toggle = document.querySelector('.motion-button');
  const context = canvas?.getContext('2d');
  const wrapper = canvas?.closest('.hero-art');
  let points = null, mesh = [], active = false, frame = 0, last = 0;
  let pointerX = 0, pointerY = 0, heroVisible = true, dirty = true;
  const clamp = (v,a,b) => Math.max(a,Math.min(b,v));
  const motion = () => {
    const progress = sequence ? clamp(-sequence.getBoundingClientRect().top / (Math.max(1,sequence.offsetHeight-innerHeight)),0,1) : 0;
    if (sequence) {
      const scale = 1-progress*.16;
      hero.style.transform = paused ? '' : `perspective(1600px) rotateX(${progress*12}deg) scale(${scale})`;
    }
    screens.forEach(screen => {
      const rect = screen.getBoundingClientRect();
      if (rect.bottom < -150 || rect.top > innerHeight+150) return;
      const offset = clamp((rect.top + rect.height*.5 - innerHeight*.5)/innerHeight,-1,1);
      screen.style.transform = paused ? '' : `perspective(1400px) rotateX(${offset*-10}deg) rotateY(${offset*7}deg) translateY(${offset*22}px)`;
    });
    return progress;
  };
  const draw = (time,progress) => {
    if (!points || !context || !heroVisible) return;
    context.clearRect(0,0,580,725);
    const angle = paused ? -.04 : -.04 + progress*.42 + pointerX*.09 + Math.sin(time*.00013)*.035;
    const ca=Math.cos(angle), sa=Math.sin(angle);
    const project = p => {
      const x=p[0]-290, y=p[1]-360;
      const depth=(p[2]-.3)*70 + Math.sqrt(Math.max(0,1-(x/310)**2))*35;
      return [290+x*ca-depth*sa,360+y+(paused?0:pointerY*depth*.08)-progress*26,p[2]];
    };
    const projected = points.map(row=>row.map(project));
    mesh.forEach(([r,i,j,k])=>{
      const a=projected[r][i],b=projected[r][i+1],c=projected[r+1][j],d=projected[r+1][k];
      const value=(a[2]+b[2]+c[2]+d[2])*.25;
      const light=clamp(value*1.4+.045,0,.95);
      const shade=Math.round(18+light*185);
      context.fillStyle=`rgb(${Math.round(shade*.81)},${shade},${Math.round(shade*.96)})`;
      context.beginPath();context.moveTo(a[0],a[1]);context.lineTo(b[0],b[1]);context.lineTo(d[0],d[1]);context.lineTo(c[0],c[1]);context.closePath();context.fill();
    });
    context.lineWidth=.42;
    projected.forEach((row,r)=>{
      context.strokeStyle=`rgba(211,239,225,${r%3===0?.5:.25})`;
      context.beginPath();row.forEach((p,i)=>i?context.lineTo(p[0],p[1]):context.moveTo(p[0],p[1]));context.stroke();
    });
    context.strokeStyle='rgba(5,14,10,.55)';context.lineWidth=.55;
    mesh.forEach(([r,i,j])=>{const a=projected[r][i],b=projected[r+1][j];context.beginPath();context.moveTo(a[0],a[1]);context.lineTo(b[0],b[1]);context.stroke();});
  };
  const tick = time => {
    active=false;
    if (document.hidden) return;
    if (dirty || (!paused && heroVisible && points)) {
      if (time-last>40 || dirty) {const progress=motion();draw(time,paused?0:progress);last=time;dirty=false;}
    }
    if ((!paused && heroVisible && points) || dirty) start();
  };
  const start = () => {if (!active && !document.hidden) {active=true;frame=requestAnimationFrame(tick);}};
  const update = () => {dirty=true;start();};
  const sync = () => {
    document.body.classList.toggle('motion-paused',paused);
    if (toggle) {toggle.textContent=paused?'RESUME MOTION':'PAUSE MOTION';toggle.setAttribute('aria-pressed',String(paused));}
    cancelAnimationFrame(frame);active=false;pointerX=pointerY=0;update();
  };
  toggle?.addEventListener('click',()=>{paused=!paused;try { localStorage.setItem('portfolio-motion-paused',String(paused)); } catch {}sync();});
  reduced.addEventListener('change',()=>{paused=reduced.matches;sync();});
  addEventListener('scroll',update,{passive:true});
  addEventListener('resize',update,{passive:true});
  document.addEventListener('visibilitychange',update);
  if (hero) {
    hero.addEventListener('pointermove',event=>{if (!paused && event.pointerType==='mouse') {pointerX=event.clientX/innerWidth-.5;pointerY=event.clientY/innerHeight-.5;update();}},{passive:true});
    hero.addEventListener('pointerleave',()=>{pointerX=pointerY=0;update();});
    new IntersectionObserver(entries=>{heroVisible=entries[0].isIntersecting;update();},{threshold:.01}).observe(hero);
  }
  if (context) {
    canvas.width=1160;canvas.height=1450;context.scale(2,2);
    fetch('assets/review/portrait-wire.json').then(r=>{if(!r.ok)throw new Error('Portrait unavailable');return r.json();}).then(data=>{
      // Restore a regular lattice from the authored contour relief before projection.
      points=data.map(row=>row.map(([x,y,v])=>{
        const baseY=Math.round(y+v*29);
        const baseX=Math.round((x-Math.sin(baseY/725*Math.PI)*v*29*.45-4)/6)*6+4;
        return [baseX,baseY,v];
      }));
      for(let r=0;r<points.length-1;r++) {
        const next=points[r+1];
        for(let i=0;i<points[r].length-1;i++) {
          const a=points[r][i],b=points[r][i+1];
          let j=0,k=0;
          next.forEach((p,n)=>{if(Math.abs(p[0]-a[0])<Math.abs(next[j][0]-a[0]))j=n;if(Math.abs(p[0]-b[0])<Math.abs(next[k][0]-b[0]))k=n;});
          if(Math.abs(next[j][0]-a[0])<12 && Math.abs(next[k][0]-b[0])<12 && Math.abs(next[j][1]-a[1])<35)mesh.push([r,i,j,k]);
        }
      }
      wrapper.classList.add('ready');update();
    }).catch(()=>{update();});
  } else if (toggle && !screens.length) toggle.hidden=true;
  sync();
})();
