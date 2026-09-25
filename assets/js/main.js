/* PRIME Marketing — portfolio interactions (no dependencies) */
(() => {
  'use strict';

  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => [...c.querySelectorAll(s)];
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const wait = ms => new Promise(r => setTimeout(r, ms));

  const root = document.documentElement;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)').matches;

  /* ---------- one shared rAF loop ---------- */
  const tickers = new Set();
  let rafId = 0;
  const loop = now => {
    rafId = requestAnimationFrame(loop);
    for (const fn of tickers) fn(now);
  };
  const addTicker = fn => {
    tickers.add(fn);
    if (!rafId) rafId = requestAnimationFrame(loop);
  };

  const scroll = { y: scrollY, last: scrollY, vel: 0, dir: 1 };
  addEventListener('scroll', () => { scroll.y = scrollY; }, { passive: true });
  addTicker(() => {
    const dy = scroll.y - scroll.last;
    scroll.vel = lerp(scroll.vel, dy, .2);
    if (dy) scroll.dir = dy > 0 ? 1 : -1;
    scroll.last = scroll.y;
  });

  /* ---------- text scramble ---------- */
  const GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#%&*+=<>/';
  function scramble(el, text, dur = 520) {
    if (reduced) { el.textContent = text; return; }
    cancelAnimationFrame(el._scr);
    const start = performance.now();
    const step = now => {
      const p = Math.min(1, (now - start) / dur);
      let out = '';
      for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        out += (ch === ' ' || i < p * text.length) ? ch : GLYPHS[(Math.random() * GLYPHS.length) | 0];
      }
      el.textContent = out;
      if (p < 1) el._scr = requestAnimationFrame(step);
    };
    el._scr = requestAnimationFrame(step);
  }

  let toastTimer = 0;
  function toast(msg) {
    const el = $('.toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('is-on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('is-on'), 2600);
  }

  /* ==========================================================================
     i18n — Slovak is in the markup, English comes from PRIME_I18N.en
     ========================================================================== */
  const DICT = window.PRIME_I18N || { sk: {}, en: {} };
  let lang = 'sk';
  let splitReady = false;
  const cache = new Map();
  const t = key => {
    const d = DICT[lang] || {};
    return d[key] != null ? d[key] : (DICT.sk[key] != null ? DICT.sk[key] : '');
  };
  const originalTitle = document.title;

  function i18nInit() {
    // remember the Slovak originals before any module rewrites the DOM
    $$('[data-i18n]').forEach(el => cache.set(el, Object.assign(cache.get(el) || {}, { text: el.textContent })));
    $$('[data-i18n-html]').forEach(el => cache.set(el, Object.assign(cache.get(el) || {}, { html: el.innerHTML })));
    $$('[data-i18n-attr]').forEach(el => {
      const c = cache.get(el) || {};
      c.attrs = {};
      el.dataset.i18nAttr.split(';').forEach(pair => { const attr = pair.split(':')[0]; c.attrs[attr] = el.getAttribute(attr); });
      cache.set(el, c);
    });
    $$('[data-scramble]').forEach(el => { el.dataset.label = el.textContent.trim(); });

    // Slovak by default; English only after the toggle (remembered) or ?lang=en
    let pick = 'sk';
    try { pick = localStorage.getItem('prime-lang') || 'sk'; } catch (e) { /* storage blocked */ }
    const q = new URLSearchParams(location.search).get('lang');
    if (q === 'sk' || q === 'en') pick = q;
    applyLang(pick, false);
    $$('[data-lang-toggle]').forEach(b => b.addEventListener('click', () => {
      applyLang(lang === 'sk' ? 'en' : 'sk', true);
      try { localStorage.setItem('prime-lang', lang); } catch (e) { /* storage blocked */ }
    }));
  }

  function applyLang(next, animate) {
    lang = next === 'en' ? 'en' : 'sk';
    root.lang = lang;
    const en = lang === 'en';
    const pickText = (el, key) => (en && DICT.en[key] != null ? DICT.en[key] : (cache.get(el) || {}).text);

    $$('[data-i18n]').forEach(el => {
      const v = pickText(el, el.dataset.i18n);
      if (v == null) return;
      if (el.hasAttribute('data-scramble')) {
        el.dataset.label = v;
        if (animate) scramble(el, v, 420); else el.textContent = v;
      } else {
        el.textContent = v;
      }
    });
    $$('[data-i18n-html]').forEach(el => {
      const k = el.dataset.i18nHtml;
      const v = en && DICT.en[k] != null ? DICT.en[k] : (cache.get(el) || {}).html;
      if (v == null) return;
      el.innerHTML = v;
      if (splitReady && el.hasAttribute('data-split')) {
        splitWords(el);
        if (el.classList.contains('is-in')) { el.classList.remove('is-in'); void el.offsetWidth; el.classList.add('is-in'); }
      }
    });
    $$('[data-i18n-attr]').forEach(el => {
      const c = cache.get(el) || {};
      el.dataset.i18nAttr.split(';').forEach(pair => {
        const [attr, key] = pair.split(':');
        const v = en && DICT.en[key] != null ? DICT.en[key] : (c.attrs || {})[attr];
        if (v != null) el.setAttribute(attr, v);
      });
    });
    document.title = en ? (root.dataset.titleEn || DICT.en['meta.title']) : originalTitle;
    $$('[data-lang-toggle]').forEach(b => b.setAttribute('aria-label', t('lang.switch')));
    if (animate && !reduced) {
      root.classList.add('is-switching');
      setTimeout(() => root.classList.remove('is-switching'), 480);
    }
    document.dispatchEvent(new CustomEvent('prime:lang', { detail: lang }));
  }

  /* ==========================================================================
     Preloader → intro
     ========================================================================== */
  function intro() {
    const pctEl = $('.loader__pct');
    const bar = $('.loader__bar');
    let seen = false;
    try { seen = sessionStorage.getItem('prime-seen') === '1'; } catch (e) { /* storage blocked */ }

    const finish = () => {
      try { sessionStorage.setItem('prime-seen', '1'); } catch (e) { /* storage blocked */ }
      root.classList.add('is-loaded');
      document.body.classList.remove('is-locked');
      setTimeout(() => {
        root.classList.add('is-ready');
        document.dispatchEvent(new Event('prime:ready'));
      }, reduced ? 0 : 280);
    };

    if (reduced || !pctEl) { finish(); return; }

    document.body.classList.add('is-locked');
    const minTime = seen ? 500 : 1600;
    const maxTime = 3500;
    const start = performance.now();
    let loaded = document.readyState === 'complete';
    let fontsDone = !document.fonts;
    if (!loaded) addEventListener('load', () => { loaded = true; }, { once: true });
    if (document.fonts) document.fonts.ready.then(() => { fontsDone = true; }, () => { fontsDone = true; });

    let shown = 0;
    const frame = now => {
      const el = now - start;
      const ready = (loaded && fontsDone) || el > maxTime;
      let target = Math.min(1, el / minTime);
      if (!ready) target = Math.min(target, .92);
      shown = lerp(shown, target, .16);
      if (target === 1 && shown > .996) shown = 1;
      pctEl.textContent = String(Math.round(shown * 100)).padStart(3, '0');
      bar.style.setProperty('--p', shown.toFixed(3));
      if (shown === 1) finish();
      else requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }

  /* ==========================================================================
     Hero — the P mark rebuilt from ~4 700 particles
     ========================================================================== */
  function heroParticles() {
    const canvas = $('.hero__canvas');
    if (!canvas) return;
    const M = window.PRIME_MARK;
    if (!M || !canvas.getContext) { root.classList.add('no-particles'); return; }
    const ctx = canvas.getContext('2d');
    const hero = canvas.closest('.hero');
    const small = matchMedia('(max-width: 900px)').matches;

    const hexA = (hex, a) => {
      const n = parseInt(hex.slice(1), 16);
      return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${a})`;
    };
    const palette = M.palette;
    const sprites = palette.map(col => {
      const s = document.createElement('canvas');
      s.width = s.height = 32;
      const g = s.getContext('2d');
      const gr = g.createRadialGradient(16, 16, 0, 16, 16, 16);
      gr.addColorStop(0, hexA(col, .5));
      gr.addColorStop(1, hexA(col, 0));
      g.fillStyle = gr;
      g.fillRect(0, 0, 32, 32);
      return s;
    });

    const cx = M.w / 2, cy = M.h / 2;
    const pts = [];
    for (let i = 0; i < M.points.length; i += 3) {
      const nx = M.points[i], ny = M.points[i + 1], c = M.points[i + 2];
      if (small && ((Math.round(nx / M.step) + Math.round(ny / M.step)) & 1)) continue;
      pts.push({
        nx, ny, c,
        x: 0, y: 0, vx: 0, vy: 0, hx: 0, hy: 0,
        ang: Math.atan2(ny - cy, nx - cx),
        rad: Math.hypot(nx - cx, ny - cy) / M.w,
        spinK: .55 + Math.random() * 1.2,
        out: .5 + Math.random() * 1.7,
        seed: Math.random() * 1000,
        // assemble bottom-left (red) → top-right (teal), like the logo gradient
        delay: ((1 - nx / M.w) * .55 + (ny / M.h) * .45) * 1700 + Math.random() * 520,
        orbit: Math.random() * Math.PI * 2,
        orbitR: 0,
        on: false, onAt: 0, heat: 0
      });
    }
    pts.sort((a, b) => a.c - b.c); // batch fillStyle changes

    let W = 0, H = 0, dpr = 1, scale = 1, size = 2, first = true, startT = 0, started = false;
    let mcx = 0, mcy = 0;
    const bounds = { x: 0, y: 0, w: 0, h: 0 };

    function layout() {
      const r = canvas.getBoundingClientRect();
      W = r.width; H = r.height;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      let tw, ox, oy;
      if (W > 900) {
        tw = Math.min(W * .44, H * .6 * (M.w / M.h), 720);
        ox = W * .735 - tw / 2;
        oy = H * .44 - (M.h * tw / M.w) / 2;
      } else {
        const vh = innerHeight;
        const th = Math.min(vh * .22, W * .8 * M.h / M.w);
        tw = th * M.w / M.h;
        ox = (W - tw) / 2;
        oy = (parseFloat(getComputedStyle(root).getPropertyValue('--nav-h')) || 68) + vh * .03;
      }
      scale = tw / M.w;
      size = Math.max(1.15, M.step * scale * (small ? .78 : .56));
      bounds.x = ox; bounds.y = oy; bounds.w = tw; bounds.h = M.h * scale;
      mcx = ox + tw / 2;
      mcy = oy + bounds.h / 2;
      const far = Math.max(W, H);
      for (const p of pts) {
        p.hx = ox + p.nx * scale;
        p.hy = oy + p.ny * scale;
        if (first) {
          p.orbitR = far * (.5 + Math.random() * .45);
          p.x = mcx + Math.cos(p.orbit) * p.orbitR;
          p.y = mcy + Math.sin(p.orbit) * p.orbitR;
        }
      }
      if (reduced) {
        for (const p of pts) { p.x = p.hx; p.y = p.hy; p.on = true; }
        draw(0, 0);
      }
      first = false;
    }

    const mouse = { x: -1e4, y: -1e4, tx: -1e4, ty: -1e4, on: false };
    const setMouse = e => {
      const r = canvas.getBoundingClientRect();
      mouse.tx = e.clientX - r.left;
      mouse.ty = e.clientY - r.top;
      if (!mouse.on) { mouse.x = mouse.tx; mouse.y = mouse.ty; }
      mouse.on = true;
    };
    const clearMouse = () => { mouse.on = false; mouse.tx = mouse.ty = -1e4; };
    hero.addEventListener('pointermove', setMouse, { passive: true });
    hero.addEventListener('pointerleave', clearMouse);
    hero.addEventListener('pointerup', e => { if (e.pointerType !== 'mouse') clearMouse(); });
    hero.addEventListener('pointercancel', clearMouse);

    const glitch = { until: 0, next: 0, y0: 0, y1: 0, dx: 0, full: false, jx: 0 };

    // click / tap: shockwave through the mark
    hero.addEventListener('pointerdown', e => {
      setMouse(e);
      if (reduced || !started || e.target.closest('a, button')) return;
      const r = canvas.getBoundingClientRect();
      const x = e.clientX - r.left, y = e.clientY - r.top;
      for (const p of pts) {
        const dx = p.x - x, dy = p.y - y, d = Math.hypot(dx, dy) || 1;
        if (d < 300) {
          const f = 1 - d / 300;
          const imp = f * f * 36;
          p.vx += dx / d * imp;
          p.vy += dy / d * imp;
          if (f > p.heat) p.heat = f;
        }
      }
      glitch.until = performance.now() + 180;
      glitch.full = true;
      glitch.jx = (Math.random() - .5) * 14;
    }, { passive: true });

    function draw(sp, now) {
      ctx.clearRect(0, 0, W, H);
      const alpha = 1 - sp * .85;
      if (alpha <= .02) return;
      const g = now < glitch.until;
      const grow = 1 + sp * 1.3;

      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = alpha * .85;
      const gs = size * 8 * grow;
      for (let i = 0; i < pts.length; i += 4) {
        const p = pts[i];
        ctx.drawImage(sprites[p.c], p.x - gs / 2, p.y - gs / 2, gs, gs);
      }
      if (g) {
        // chromatic split in brand colours: a band, or the whole mark
        ctx.globalAlpha = alpha * .85;
        for (let pass = 0; pass < 2; pass++) {
          ctx.fillStyle = pass ? '#ff3131' : '#38cdb9';
          const off = (pass ? 5 : -5) + (glitch.full ? glitch.jx : glitch.dx);
          for (const p of pts) {
            if (!glitch.full && (p.hy < glitch.y0 || p.hy > glitch.y1)) continue;
            ctx.fillRect(p.x + off - size / 2, p.y - size / 2, size, size);
          }
        }
      }
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = alpha;

      let cur = -1;
      for (const p of pts) {
        if (p.c !== cur) { cur = p.c; ctx.fillStyle = palette[cur]; }
        const s = size * grow * (1 + p.heat * 1.6);
        let off = 0;
        if (g) off = glitch.full ? glitch.jx : (p.hy > glitch.y0 && p.hy < glitch.y1 ? glitch.dx : 0);
        ctx.fillRect(p.x + off - s / 2, p.y - s / 2, s, s);
      }
      // white-hot cores on excited particles
      ctx.fillStyle = '#ffffff';
      ctx.globalAlpha = alpha * .85;
      for (const p of pts) {
        if (p.heat < .5) continue;
        const s = size * .85;
        ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s);
      }
      ctx.globalAlpha = 1;
    }

    let visible = true;
    new IntersectionObserver(([en]) => { visible = en.isIntersecting; }).observe(hero);

    function update(now) {
      if (!visible || !started) return;
      const t = now * .001;
      const el = now - startT;
      const sp = Math.pow(clamp(scrollY / (hero.offsetHeight * .9), 0, 1), 1.5);

      mouse.x = lerp(mouse.x, mouse.tx, .3);
      mouse.y = lerp(mouse.y, mouse.ty, .3);
      const R = W > 900 ? 130 : 85, R2 = R * R;
      const flowA = small ? 1.1 : 1.8;
      const wave = ((el / 5600) % 1) * 1.7 - .35; // scan band sweeping the mark
      const rot = sp * 1.15;
      const pull = Math.min(1, sp * 1.6);

      if (now > glitch.next) {
        glitch.until = now + 130 + Math.random() * 150;
        glitch.next = now + 2000 + Math.random() * 2800;
        glitch.full = Math.random() < .22;
        glitch.jx = (Math.random() - .5) * 16;
        const bandH = bounds.h * (.07 + Math.random() * .2);
        glitch.y0 = bounds.y + Math.random() * (bounds.h - bandH);
        glitch.y1 = glitch.y0 + bandH;
        glitch.dx = (Math.random() < .5 ? -1 : 1) * (12 + Math.random() * 30);
      }

      for (const p of pts) {
        if (!p.on) {
          if (el > p.delay) { p.on = true; p.onAt = el; }
          else {
            // circle in slowly before joining the mark
            p.orbit += .005 + .004 * p.spinK;
            p.orbitR *= .9982;
            const ox = mcx + Math.cos(p.orbit) * p.orbitR, oy = mcy + Math.sin(p.orbit) * p.orbitR;
            p.x += (ox - p.x) * .08;
            p.y += (oy - p.y) * .08;
            continue;
          }
        }
        const age = el - p.onAt;
        const landing = age < 1800;
        const k = landing ? lerp(.005, .05, age / 1800) : .05;
        const damp = landing ? .9 : .84;

        let tx = p.hx + Math.sin(t * .9 + p.seed) * flowA + Math.sin(t * .37 + p.ny * .012) * flowA * .6;
        let ty = p.hy + Math.cos(t * 1.1 + p.seed * 1.3) * flowA + Math.cos(t * .29 + p.nx * .01) * flowA * .6;
        const wd = (p.nx / M.w) * .55 + (1 - p.ny / M.h) * .45 - wave;
        const wb = Math.exp(-(wd * wd) / .0035);
        if (wb > .02) {
          ty -= wb * 3.4;
          if (wb * .7 > p.heat) p.heat = wb * .7;
        }
        if (sp > 0) {
          // galaxy swirl + explosion while the hero scrolls away
          const a = p.ang + rot * p.spinK;
          const r = p.rad * M.w * scale * (1 + sp * (1.2 + p.out * 1.8)) + sp * 170 * p.out;
          tx = lerp(tx, mcx + Math.cos(a) * r, pull) + Math.sin(t * 1.7 + p.seed) * sp * 36;
          ty = lerp(ty, mcy + Math.sin(a) * r, pull) + Math.cos(t * 1.3 + p.seed) * sp * 36;
        }
        let ax = (tx - p.x) * k, ay = (ty - p.y) * k;
        if (age < 1300) {
          const sw = (1 - age / 1300) * .95;
          const dx = p.x - mcx, dy = p.y - mcy, d = Math.hypot(dx, dy) || 1;
          ax += (-dy / d) * sw;
          ay += (dx / d) * sw;
        }
        if (mouse.on) {
          const mx = p.x - mouse.x, my = p.y - mouse.y, d2 = mx * mx + my * my;
          if (d2 < R2) {
            const d = Math.sqrt(d2) || 1;
            const f = 1 - d / R;
            const force = f * f * 11;
            ax += (mx / d) * force - (my / d) * force * .45;
            ay += (my / d) * force + (mx / d) * force * .45;
            if (f > p.heat) p.heat = f;
          }
        }
        if (Math.random() < .0009) p.heat = .9; // twinkle
        p.vx = (p.vx + ax) * damp;
        p.vy = (p.vy + ay) * damp;
        p.x += p.vx;
        p.y += p.vy;
        const spd = Math.abs(p.vx) + Math.abs(p.vy);
        if (spd > 2.5) p.heat = Math.max(p.heat, Math.min(.8, spd * .045));
        p.heat *= .93;
      }
      draw(sp, now);
    }

    layout();
    let rt = 0;
    addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(layout, 150); });

    if (reduced) return;
    const go = () => {
      if (started) return;
      started = true;
      startT = performance.now();
      glitch.next = startT + 3600;
      addTicker(update);
    };
    if (root.classList.contains('is-ready')) go();
    else document.addEventListener('prime:ready', go, { once: true });
  }

  /* ==========================================================================
     Cursor, magnetic buttons, scramble links
     ========================================================================== */
  function cursor() {
    if (!finePointer || reduced) return;
    const el = $('.cursor');
    if (!el) return;
    const ring = $('.cursor__ring', el), dot = $('.cursor__dot', el), txt = $('.cursor__text', el);
    root.classList.add('has-cursor');
    let x = -100, y = -100, rx = -100, ry = -100, shown = false;
    addEventListener('pointermove', e => {
      x = e.clientX; y = e.clientY;
      if (!shown) { shown = true; rx = x; ry = y; el.classList.remove('is-hidden'); }
    }, { passive: true });
    root.addEventListener('mouseleave', () => { shown = false; el.classList.add('is-hidden'); });
    addEventListener('pointerdown', () => el.classList.add('is-down'));
    addEventListener('pointerup', () => el.classList.remove('is-down'));
    document.addEventListener('pointerover', e => {
      const tg = e.target.closest('[data-cursor], a, button, label, .panel, .stat');
      if (!tg) { el.classList.remove('is-link', 'is-label'); return; }
      const label = tg.getAttribute('data-cursor');
      if (label) {
        txt.textContent = label;
        el.classList.add('is-label');
        el.classList.remove('is-link');
      } else {
        el.classList.add('is-link');
        el.classList.remove('is-label');
      }
    });
    addTicker(() => {
      rx = lerp(rx, x, .2);
      ry = lerp(ry, y, .2);
      dot.style.transform = `translate3d(${x}px,${y}px,0)`;
      ring.style.transform = `translate3d(${rx.toFixed(1)}px,${ry.toFixed(1)}px,0)`;
    });
  }

  function magnetic() {
    if (!finePointer || reduced) return;
    $$('[data-magnetic]').forEach(el => {
      el.addEventListener('pointermove', e => {
        const r = el.getBoundingClientRect();
        const mx = e.clientX - (r.left + r.width / 2);
        const my = e.clientY - (r.top + r.height / 2);
        el.style.transform = `translate3d(${(mx * .28).toFixed(1)}px,${(my * .38).toFixed(1)}px,0)`;
      });
      el.addEventListener('pointerleave', () => { el.style.transform = ''; });
    });
  }

  function scrambleLinks() {
    $$('[data-scramble]').forEach(a => {
      a.addEventListener('mouseenter', () => {
        const target = a.querySelector('[data-i18n]') || a;
        scramble(target, target.dataset.label || target.textContent, 420);
      });
    });
  }

  /* ==========================================================================
     Reveals + ambient glitch
     ========================================================================== */
  function splitWords(el) {
    let i = 0;
    const walk = node => {
      [...node.childNodes].forEach(n => {
        if (n.nodeType === 3) {
          const frag = document.createDocumentFragment();
          n.textContent.split(/(\s+)/).forEach(part => {
            if (!part) return;
            if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(part)); return; }
            const w = document.createElement('span');
            w.className = 'w';
            const wi = document.createElement('span');
            wi.className = 'wi';
            wi.style.setProperty('--wi', i++);
            wi.textContent = part;
            w.appendChild(wi);
            frag.appendChild(w);
          });
          n.replaceWith(frag);
        } else if (n.nodeType === 1 && !n.classList.contains('w')) {
          walk(n);
        }
      });
    };
    walk(el);
  }

  function reveals() {
    $$('[data-split]').forEach(splitWords);
    splitReady = true;
    const targets = $$('[data-reveal], [data-split]');
    if (!('IntersectionObserver' in window)) { targets.forEach(el => el.classList.add('is-in')); return; }
    const io = new IntersectionObserver(entries => {
      entries.forEach(en => {
        if (!en.isIntersecting) return;
        en.target.classList.add('is-in');
        io.unobserve(en.target);
      });
    }, { rootMargin: '0px 0px -10% 0px', threshold: .1 });
    targets.forEach(el => io.observe(el));
  }

  function ambientGlitch() {
    if (reduced) return;
    const pick = () => {
      const els = $$('.sec-title.is-in, .contact__title.is-in, .ref__title, .plan__name, .panel.is-active strong').filter(el => {
        const r = el.getBoundingClientRect();
        return r.bottom > 0 && r.top < innerHeight;
      });
      if (els.length && !document.hidden) {
        const el = els[(Math.random() * els.length) | 0];
        el.classList.remove('glitch-now');
        void el.offsetWidth;
        el.classList.add('glitch-now');
        setTimeout(() => el.classList.remove('glitch-now'), 800);
      }
      setTimeout(pick, 5500 + Math.random() * 5000);
    };
    setTimeout(pick, 6500);
  }

  /* ==========================================================================
     Stats — counters + hover/tap animations
     ========================================================================== */
  function stats() {
    const fmt = n => Math.round(n).toLocaleString(t('locale') || 'sk-SK');
    const lock = el => {
      el.style.minWidth = '';
      el.textContent = fmt(+el.dataset.count);
      el.style.display = 'inline-block';
      el.style.minWidth = el.getBoundingClientRect().width + 'px';
    };
    const count = (el, dur) => {
      lock(el);
      if (reduced) return;
      const target = +el.dataset.count;
      const start = performance.now();
      cancelAnimationFrame(el._c);
      const step = now => {
        const p = Math.min(1, (now - start) / dur);
        el.textContent = fmt(target * (1 - Math.pow(1 - p, 4)));
        if (p < 1) el._c = requestAnimationFrame(step);
      };
      el._c = requestAnimationFrame(step);
    };

    const mk = (tag, cls) => { const n = document.createElement(tag); n.className = cls; return n; };
    const dots = (cls, n, set) => { const w = mk('div', cls); for (let k = 0; k < n; k++) { const i = document.createElement('i'); set(i, k); w.appendChild(i); } return w; };
    const build = {
      years: fx => fx.appendChild(dots('fx-bars', 8, (i, k) => i.style.setProperty('--k', k))),
      clients: fx => fx.appendChild(dots('fx-dots', 50, (i, k) => i.style.setProperty('--k', k))),
      ppc: fx => {
        fx.innerHTML = '<svg class="fx-line" viewBox="0 0 300 100" preserveAspectRatio="none"><defs><linearGradient id="fxLineGrad" x1="0" x2="1"><stop offset="0" stop-color="#ff3131"/><stop offset="1" stop-color="#38cdb9"/></linearGradient></defs><path d="M0 80 C40 78 60 70 90 72 S140 55 170 52 S220 40 250 28 S290 12 300 8 L300 100 L0 100 Z"/><path pathLength="1" d="M0 80 C40 78 60 70 90 72 S140 55 170 52 S220 40 250 28 S290 12 300 8"/></svg>';
      },
      campaigns: fx => fx.appendChild(dots('fx-grid', 40, i => i.style.setProperty('--dl', (Math.random() * 1.4).toFixed(2) + 's'))),
      event: fx => fx.appendChild(mk('div', 'fx-beams'))
    };

    $$('.stat').forEach(st => {
      const fx = $('.stat__fx', st);
      if (fx && build[st.dataset.stat]) build[st.dataset.stat](fx);
      const counter = $('[data-count]', st);
      const word = $('.stat__word', st);
      let wordTimer = 0, last = 0;
      const activate = () => {
        if (st.classList.contains('is-active')) return;
        st.classList.add('is-active');
        if (counter && performance.now() - last > 900) { last = performance.now(); count(counter, 1100); }
        if (word && !reduced) {
          const words = t('eventWords');
          let i = 0;
          clearInterval(wordTimer);
          wordTimer = setInterval(() => { i = (i + 1) % words.length; scramble(word, words[i], 360); }, 950);
        }
      };
      const deactivate = () => {
        st.classList.remove('is-active');
        clearInterval(wordTimer);
        if (word) scramble(word, t('eventWords')[0] || 'EVENT', 300);
      };
      st.addEventListener('mouseenter', activate);
      st.addEventListener('mouseleave', deactivate);
      st.addEventListener('click', () => {
        if (finePointer) return;
        if (st.classList.contains('is-active')) deactivate();
        else { activate(); clearTimeout(st._t); st._t = setTimeout(deactivate, 3400); }
      });
    });

    const counters = $$('[data-count]');
    const go = () => counters.forEach((el, i) => setTimeout(() => count(el, +el.dataset.count > 1000 ? 2200 : 1500), 700 + i * 120));
    if (root.classList.contains('is-ready')) go();
    else document.addEventListener('prime:ready', go, { once: true });
    document.addEventListener('prime:lang', () => counters.forEach(lock));
  }

  /* ==========================================================================
     Navigation
     ========================================================================== */
  function nav() {
    const bar = $('.nav');
    if (!bar) return;
    const prog = $('.nav__progress i');
    const burger = $('.nav__burger');
    const menu = $('#menu');
    let lastY = scrollY, menuOpen = false;

    const onScroll = () => {
      const y = scrollY;
      const max = root.scrollHeight - innerHeight;
      bar.classList.toggle('is-scrolled', y > 20 || document.body.classList.contains('page'));
      if (!menuOpen) {
        if (y > lastY + 6 && y > 480) bar.classList.add('is-hidden');
        else if (y < lastY - 6 || y < 200) bar.classList.remove('is-hidden');
      }
      lastY = y;
      if (prog) prog.style.transform = `scaleX(${max > 0 ? (y / max).toFixed(4) : 0})`;
    };
    addEventListener('scroll', onScroll, { passive: true });
    onScroll();

    const links = $$('.nav__links a');
    const byId = new Map(links.map(a => [a.getAttribute('href').slice(1), a]));
    const io = new IntersectionObserver(entries => {
      entries.forEach(en => {
        if (!en.isIntersecting) return;
        links.forEach(l => l.classList.remove('is-active'));
        const a = byId.get(en.target.id);
        if (a) a.classList.add('is-active');
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    $$('main > section[id]').forEach(s => io.observe(s));

    if (!burger || !menu) return;
    const setMenu = open => {
      menuOpen = open;
      burger.setAttribute('aria-expanded', String(open));
      menu.classList.toggle('is-open', open);
      menu.setAttribute('aria-hidden', String(!open));
      if (open) menu.removeAttribute('inert'); else menu.setAttribute('inert', '');
      document.body.classList.toggle('is-locked', open);
      bar.classList.remove('is-hidden');
      if (open) setTimeout(() => $('a', menu).focus({ preventScroll: true }), 300);
    };
    burger.addEventListener('click', () => setMenu(!menuOpen));
    $$('.menu__nav a, .menu__mail', menu).forEach((a, i) => {
      a.style.setProperty('--i', i);
      a.addEventListener('click', () => setMenu(false));
    });
    addEventListener('keydown', e => {
      if (e.key === 'Escape' && menuOpen) { setMenu(false); burger.focus(); }
    });
    matchMedia('(min-width: 1101px)').addEventListener('change', e => { if (e.matches && menuOpen) setMenu(false); });
  }

  /* ==========================================================================
     Client logos — seamless marquee
     ========================================================================== */
  function clients() {
    const track = $('.clients__track');
    if (!track || reduced) return;
    const original = [...track.children];
    const cloneSet = () => original.forEach(n => {
      const c = n.cloneNode(true);
      c.setAttribute('aria-hidden', 'true');
      if (c.tagName === 'A') c.setAttribute('tabindex', '-1');
      track.appendChild(c);
    });
    cloneSet();
    const fit = () => {
      // keep at least two full screens of logos so the -50% loop never shows a gap
      while (track.scrollWidth / 2 < innerWidth + 200 && track.children.length < original.length * 8) { cloneSet(); cloneSet(); }
      track.style.setProperty('--dur', (track.scrollWidth / 2 / 55).toFixed(1) + 's');
    };
    fit();
    addEventListener('resize', fit);
    $$('img', track).forEach(img => { if (!img.complete) img.addEventListener('load', fit, { once: true }); });
  }

  /* ==========================================================================
     Top references — stacking cards + scrubbable website previews
     ========================================================================== */
  function refs() {
    const cards = $$('.ref');
    if (!cards.length) return;
    cards.forEach((c, i) => c.style.setProperty('--i', i));

    const stackMQ = matchMedia('(min-width: 1024px) and (min-height: 700px)');
    let tops = [];
    const measure = () => { tops = cards.map(c => parseFloat(getComputedStyle(c).top) || 0); };
    const updateStack = () => {
      if (!stackMQ.matches || reduced) { cards.forEach(c => c.style.removeProperty('--stack')); return; }
      const vh = innerHeight;
      cards.forEach((card, i) => {
        const next = cards[i + 1];
        let p = 0;
        if (next) p = clamp((vh - next.getBoundingClientRect().top) / Math.max(1, vh - tops[i + 1]), 0, 1);
        card.style.setProperty('--stack', p.toFixed(3));
      });
    };
    measure();
    updateStack();
    addEventListener('scroll', updateStack, { passive: true });
    addEventListener('resize', () => { measure(); updateStack(); });

    // anchor links into the stack: land where the card has just pinned
    document.addEventListener('click', e => {
      const a = e.target.closest('a[href^="#ref-"]');
      if (!a || !stackMQ.matches) return;
      const card = document.getElementById(a.getAttribute('href').slice(1));
      const i = cards.indexOf(card);
      if (i < 0) return;
      e.preventDefault();
      let y = card.parentElement.getBoundingClientRect().top + scrollY;
      for (let j = 0; j < i; j++) y += cards[j].offsetHeight + parseFloat(getComputedStyle(cards[j]).marginBottom);
      scrollTo({ top: y - tops[i], behavior: reduced ? 'auto' : 'smooth' });
    });

    const states = cards.map((card, idx) => {
      const preview = $('.ref__preview', card);
      const shots = $$('.shot', card).map(img => ({ img, frame: img.parentElement, max: 0 }));
      const st = {
        card, preview, shots,
        device: $('.ref__device', card),
        glare: $('.ref__glare', card),
        browser: $('.browser', card),
        host: $('.browser__host', card),
        bg: $('.ref__bgword', card),
        links: $$('[data-preview]', card),
        rx: 0, ry: 0, trx: 0, try: 0, s: 0, ts: 0, bgx: 0, tbgx: 0,
        visible: false, hover: false, phase: idx * 1.7, cycle: 0
      };
      st.measure = () => shots.forEach(s => { s.max = Math.max(0, s.img.offsetHeight - s.frame.clientHeight); });
      shots.forEach(s => s.img.addEventListener('load', st.measure));
      st.measure();
      if (finePointer) {
        preview.addEventListener('pointerenter', () => { st.hover = true; preview.classList.add('is-hover'); st.measure(); });
        preview.addEventListener('pointermove', e => {
          const r = preview.getBoundingClientRect();
          const px = clamp((e.clientX - r.left) / r.width, 0, 1);
          const py = clamp((e.clientY - r.top) / r.height, 0, 1);
          st.try = (px - .5) * 10;
          st.trx = (.5 - py) * 7;
          st.ts = clamp((py - .08) / .8, 0, 1);
          st.glare.style.setProperty('--gx', (px * 100).toFixed(1) + '%');
          st.glare.style.setProperty('--gy', (py * 100).toFixed(1) + '%');
        });
        preview.addEventListener('pointerleave', () => {
          st.hover = false;
          preview.classList.remove('is-hover');
          st.trx = st.try = 0;
          st.ts = 0;
        });
        card.addEventListener('pointermove', e => {
          const r = card.getBoundingClientRect();
          st.tbgx = ((e.clientX - r.left) / r.width - .5) * -50;
        });
      }
      return st;
    });
    addEventListener('resize', () => states.forEach(st => st.measure()));

    const io = new IntersectionObserver(entries => {
      entries.forEach(en => {
        const st = states.find(s => s.card === en.target);
        if (!st) return;
        st.visible = en.isIntersecting;
        if (st.visible) {
          st.measure();
          st.links.forEach(l => { new Image().src = l.dataset.desktop; new Image().src = l.dataset.mobile; });
        }
      });
    }, { rootMargin: '200px 0px' });
    states.forEach(st => io.observe(st.card));

    const activate = (st, link) => {
      if (link.classList.contains('is-active')) return;
      st.links.forEach(l => l.classList.toggle('is-active', l === link));
      const [desk, mob] = st.shots;
      const swap = (img, src, alt) => {
        img.style.transition = 'opacity .25s';
        img.style.opacity = '0';
        setTimeout(() => {
          img.src = src;
          if (alt) img.alt = alt;
          const done = () => { img.style.opacity = '1'; st.measure(); };
          if (img.complete) done(); else img.addEventListener('load', done, { once: true });
        }, 200);
      };
      swap(desk.img, link.dataset.desktop, link.dataset.host);
      swap(mob.img, link.dataset.mobile, '');
      st.browser.href = link.href;
      st.browser.setAttribute('aria-label', link.dataset.host);
      scramble(st.host, link.dataset.host, 480);
    };
    states.forEach(st => st.links.forEach(link => {
      link.addEventListener('mouseenter', () => activate(st, link));
      link.addEventListener('focus', () => activate(st, link));
    }));

    const t0 = performance.now();
    addTicker(now => {
      for (const st of states) {
        if (!st.visible) continue;
        if (!finePointer && !reduced) {
          const k = (now - t0) / 1000 * .32 + st.phase;
          st.ts = (1 - Math.cos(k)) / 2;
          const cycle = Math.floor(k / (Math.PI * 2)); // switch sites while scrolled to the top
          if (st.links.length > 1 && cycle !== st.cycle) {
            st.cycle = cycle;
            activate(st, st.links[cycle % st.links.length]);
          }
        }
        const prev = st.rx + st.ry + st.s + st.bgx;
        st.rx = lerp(st.rx, st.trx, .08);
        st.ry = lerp(st.ry, st.try, .08);
        st.s = finePointer ? lerp(st.s, st.ts, .07) : st.ts;
        st.bgx = lerp(st.bgx, st.tbgx, .05);
        if (Math.abs(prev - (st.rx + st.ry + st.s + st.bgx)) < .0005 && !st.hover) continue;
        st.device.style.transform = `rotateX(${st.rx.toFixed(2)}deg) rotateY(${st.ry.toFixed(2)}deg)`;
        for (const s of st.shots) s.img.style.transform = `translate3d(0,${(-st.s * s.max).toFixed(1)}px,0)`;
        if (st.bg) st.bg.style.transform = `translate3d(${st.bgx.toFixed(1)}px,0,0)`;
      }
    });
  }

  /* ==========================================================================
     More websites — the wall flattens as it scrolls in
     ========================================================================== */
  function wall() {
    const w = $('.wall');
    if (!w || reduced) return;
    const plane = $('.wall__plane', w);
    const mq = matchMedia('(min-width: 641px)');
    const update = () => {
      if (!mq.matches) { plane.style.removeProperty('--p'); return; }
      const r = w.getBoundingClientRect();
      const vh = innerHeight;
      if (r.bottom < -100 || r.top > vh + 100) return;
      const p = clamp((vh - r.top) / (vh * .8), 0, 1);
      plane.style.setProperty('--p', (1 - Math.pow(1 - p, 3)).toFixed(3));
    };
    addEventListener('scroll', update, { passive: true });
    addEventListener('resize', update);
    update();
  }

  /* ==========================================================================
     Events — kinetic row, split-flap cities, photo accordion, spinning badge
     ========================================================================== */
  function events() {
    const sec = $('.events');
    if (!sec) return;

    const row = $('.kinetic__row', sec);
    if (row && !reduced) {
      const onScroll = () => {
        const r = sec.getBoundingClientRect();
        const vh = innerHeight;
        if (r.bottom < 0 || r.top > vh) return;
        const p = clamp((vh - r.top) / (vh + Math.min(r.height, vh * 2.2)), 0, 1);
        row.style.transform = `translate3d(${(-p * 36).toFixed(2)}%,0,0)`;
      };
      addEventListener('scroll', onScroll, { passive: true });
      onScroll();
    }

    // split-flap board
    const cellsWrap = $('.board__cells', sec);
    if (cellsWrap) {
      let cities = t('cities');
      let N = 0, cells = [], idx = -1, visible = false;
      const CH = 'ABCDEFGHIJKLMNOPRSTUVWZŠŽČŃÓ0123456789';
      const build = () => {
        N = Math.max(...cities.map(c => [...c].length));
        cellsWrap.innerHTML = '';
        cells = [];
        for (let i = 0; i < N; i++) {
          const f = document.createElement('span');
          f.className = 'flap';
          const b = document.createElement('b');
          b.textContent = ' ';
          f.appendChild(b);
          cellsWrap.appendChild(f);
          cells.push({ f, b, t: 0 });
        }
      };
      const pad = word => {
        const ch = [...word];
        const left = Math.floor((N - ch.length) / 2);
        return Array(left).fill(' ').concat(ch, Array(N - ch.length - left).fill(' '));
      };
      const flip = c => { c.f.classList.remove('is-flip'); void c.f.offsetWidth; c.f.classList.add('is-flip'); };
      const show = word => {
        const target = pad(word);
        cells.forEach((c, i) => {
          clearTimeout(c.t);
          c.f.classList.remove('is-set');
          const flips = reduced ? 0 : 4 + (i % 3) + ((Math.random() * 3) | 0);
          let n = 0;
          const step = () => {
            if (n < flips) {
              c.b.textContent = CH[(Math.random() * CH.length) | 0];
              flip(c);
              n++;
              c.t = setTimeout(step, 70);
            } else {
              const ch = target[i];
              c.b.textContent = ch === ' ' ? ' ' : ch;
              if (ch !== ' ') c.f.classList.add('is-set');
              flip(c);
            }
          };
          c.t = setTimeout(step, i * 45);
        });
      };
      const next = () => { idx = (idx + 1) % cities.length; show(cities[idx]); };
      build();
      new IntersectionObserver(([en]) => {
        const was = visible;
        visible = en.isIntersecting;
        if (visible && !was && idx < 0) next();
      }, { threshold: .3 }).observe(cellsWrap);
      setInterval(() => { if (visible && !document.hidden) next(); }, 2900);
      document.addEventListener('prime:lang', () => {
        cities = t('cities');
        build();
        if (idx >= 0) show(cities[idx % cities.length]);
      });
    }

    // photo accordion
    const gallery = $('.gallery', sec);
    if (gallery) {
      const panels = $$('.panel', gallery);
      panels.forEach(p => {
        const img = $('img', p);
        const setImg = () => p.style.setProperty('--img', `url("${img.currentSrc || img.src}")`);
        if (img.complete) setImg(); else img.addEventListener('load', setImg, { once: true });
        const r = document.createElement('span');
        r.className = 'panel__g panel__g--r';
        const c = document.createElement('span');
        c.className = 'panel__g panel__g--c';
        p.append(r, c);
      });
      const desk = matchMedia('(min-width: 901px)');
      let active = panels.findIndex(p => p.classList.contains('is-active'));
      let hover = false, visible = false;
      const glitch = p => {
        if (reduced) return;
        p.classList.remove('is-glitch');
        void p.offsetWidth;
        p.classList.add('is-glitch');
        clearTimeout(p._g);
        p._g = setTimeout(() => p.classList.remove('is-glitch'), 600);
      };
      const activate = i => {
        if (i === active) return;
        panels[active].classList.remove('is-active');
        active = i;
        panels[i].classList.add('is-active');
        glitch(panels[i]);
      };
      panels.forEach((p, i) => {
        p.tabIndex = 0;
        p.addEventListener('mouseenter', () => { if (desk.matches) activate(i); });
        p.addEventListener('click', () => { if (desk.matches) activate(i); else glitch(p); });
        p.addEventListener('focus', () => activate(i));
      });
      gallery.addEventListener('mouseenter', () => { hover = true; });
      gallery.addEventListener('mouseleave', () => { hover = false; });
      new IntersectionObserver(([en]) => { visible = en.isIntersecting; }, { threshold: .25 }).observe(gallery);
      setInterval(() => {
        if (visible && !hover && !document.hidden && desk.matches && !reduced) activate((active + 1) % panels.length);
      }, 4200);
    }

    // spinning "events • concerts • festivals • theatre" badge
    const spin = $('.spin', sec);
    if (spin) {
      const svg = $('svg', spin);
      const tp = $('.spin__text', spin);
      const text = $('text', spin);
      const fitText = () => {
        tp.textContent = t('spin');
        text.style.letterSpacing = '2px';
        try {
          const len = tp.getComputedTextLength();
          const chars = tp.textContent.length;
          if (len && chars) text.style.letterSpacing = (2 + (486 - len) / chars).toFixed(2) + 'px';
        } catch (e) { /* not rendered yet */ }
      };
      fitText();
      if (document.fonts) document.fonts.ready.then(fitText);
      document.addEventListener('prime:lang', fitText);
      if (!reduced) {
        let a = 0, vis = false;
        new IntersectionObserver(([en]) => { vis = en.isIntersecting; }).observe(spin);
        addTicker(() => {
          if (!vis) return;
          a += .2 + Math.min(Math.abs(scroll.vel) * .14, 4);
          svg.style.transform = `rotate(${a.toFixed(2)}deg)`;
        });
      }
    }
  }

  /* ==========================================================================
     Services — spotlight + ticket stamp on touch
     ========================================================================== */
  function tiles() {
    $$('[data-spot]').forEach(el => {
      el.addEventListener('pointermove', e => {
        const r = el.getBoundingClientRect();
        el.style.setProperty('--mx', (e.clientX - r.left).toFixed(0) + 'px');
        el.style.setProperty('--my', (e.clientY - r.top).toFixed(0) + 'px');
      });
    });
    if (!finePointer) {
      const ticket = $('.tile--event');
      if (ticket) {
        new IntersectionObserver(([en], obs) => {
          if (!en.isIntersecting) return;
          setTimeout(() => ticket.classList.add('is-stamped'), 900);
          obs.disconnect();
        }, { threshold: .6 }).observe(ticket);
      }
    }
  }

  /* ==========================================================================
     Campaign timeline — seats fill up until the SOLD OUT stamp
     ========================================================================== */
  function timeline() {
    const tl = $('.timeline');
    if (!tl) return;
    const stage = $('.timeline__stage', tl);
    const steps = $$('.step', tl);
    const pctEl = $('.meter__pct', tl);
    const bar = $('.meter__bar i', tl);
    const seatsWrap = $('.seats', tl);

    const COLS = 16, ROWS = 7;
    const red = [255, 49, 49], teal = [56, 205, 185];
    const seats = [];
    for (let r = 0; r < ROWS; r++) {
      const k = r / (ROWS - 1);
      const col = red.map((v, i) => Math.round(v + (teal[i] - v) * k)).join(', ');
      for (let c = 0; c < COLS; c++) {
        const el = document.createElement('i');
        el.className = 'seat';
        el.style.setProperty('--c', col);
        seatsWrap.appendChild(el);
        const edge = Math.abs(c - (COLS - 1) / 2) / (COLS / 2);
        seats.push({ el, order: k * .6 + edge * .22 + Math.random() * .3 });
      }
    }
    seats.sort((a, b) => a.order - b.order).forEach((s, i) => { s.t = (i + 1) / seats.length; });

    let sticky = true;
    const measure = () => { sticky = getComputedStyle(stage).position === 'sticky'; };
    measure();
    addEventListener('resize', measure);

    const SOLD_AT = .86;
    let lastPct = -1, lastIdx = -1, lastSold = null;
    const update = () => {
      const vh = innerHeight;
      const tr = tl.getBoundingClientRect();
      if (tr.bottom < -50 || tr.top > vh + 50) return;
      const p = sticky
        ? clamp(-tr.top / Math.max(1, tr.height - vh), 0, 1)
        : clamp((vh * .8 - tr.top) / Math.max(1, tr.height * .9), 0, 1);
      const fill = clamp(p / SOLD_AT, 0, 1);
      const pct = Math.round(fill * 100);
      if (pct !== lastPct) {
        lastPct = pct;
        pctEl.textContent = pct;
        bar.style.setProperty('--p', fill.toFixed(3));
        for (const s of seats) s.el.classList.toggle('is-on', fill >= s.t);
      }
      const idx = Math.min(steps.length - 1, Math.floor(fill * steps.length * .999));
      if (idx !== lastIdx) {
        lastIdx = idx;
        steps.forEach((s, i) => {
          s.classList.toggle('is-active', i === idx);
          s.classList.toggle('is-done', i < idx);
        });
      }
      const sold = pct >= 100;
      if (sold !== lastSold) { lastSold = sold; tl.classList.toggle('is-sold', sold); }
    };
    addEventListener('scroll', update, { passive: true });
    addEventListener('resize', update);
    update();
  }

  /* ---------- pricing CTA pre-selects "website" in the brief ---------- */
  function pricing() {
    $$('[data-plan]').forEach(a => a.addEventListener('click', () => {
      const cb = $('#brief input[value="web"]');
      if (cb) cb.checked = true;
    }));
  }

  /* ==========================================================================
     Terminal typing
     ========================================================================== */
  function terminal() {
    const term = $('.term');
    if (!term || reduced) return;
    const code = $('code', term);
    [...code.childNodes].forEach(n => { if (n.nodeType === 3 && !n.textContent.trim()) n.remove(); });
    const lines = $$('.tl', code);
    const textFor = c => {
      const key = c.dataset.i18n;
      if (key) return lang === 'en' && DICT.en[key] != null ? DICT.en[key] : (cache.get(c) || {}).text || '';
      return c.dataset.src;
    };
    lines.forEach(l => {
      const c = $('.c-cmd', l);
      if (!c) return;
      if (!c.dataset.i18n) c.dataset.src = c.textContent;
      c.textContent = '';
    });
    term.classList.add('is-typing');

    const run = async () => {
      for (const l of lines) {
        l.classList.add('is-shown');
        const c = $('.c-cmd', l);
        if (c) {
          const text = textFor(c);
          for (let i = 1; i <= text.length; i++) {
            c.textContent = text.slice(0, i);
            await wait(26 + Math.random() * 48);
          }
          await wait(240);
        } else {
          await wait(110);
        }
      }
    };
    new IntersectionObserver(([en], obs) => {
      if (!en.isIntersecting) return;
      obs.disconnect();
      setTimeout(run, 350);
    }, { threshold: .35 }).observe(term);
  }

  /* ==========================================================================
     Contact — copy e-mail, brief → mailto, letter wave
     ========================================================================== */
  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (e) {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;opacity:0;pointer-events:none';
      document.body.appendChild(ta);
      ta.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch (e2) { ok = false; }
      ta.remove();
      return ok;
    }
  }

  function contact() {
    $$('[data-copy]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const text = btn.dataset.copy;
        const ok = await copyText(text);
        toast(ok ? t('toast.copied') + text : text);
      });
    });

    const mail = $('.contact__mail');
    if (mail && !reduced) {
      const text = mail.textContent;
      mail.textContent = '';
      [...text].forEach((ch, i) => {
        const s = document.createElement('span');
        s.className = 'ch';
        s.style.setProperty('--ci', i);
        s.textContent = ch;
        mail.appendChild(s);
      });
    }

    const form = $('#brief');
    if (form) {
      form.addEventListener('submit', e => {
        e.preventDefault();
        const needs = $$('input[name="need"]:checked', form).map(i => i.nextElementSibling.textContent.trim());
        const msg = form.elements.msg.value.trim();
        const subject = t('mail.subject') + (needs.length ? ' – ' + needs.join(', ') : '');
        const body = [
          t('mail.greet'),
          '',
          t('mail.interest') + (needs.length ? needs.join(', ') : t('mail.fill')),
          '',
          t('mail.about'),
          msg,
          '',
          t('mail.thanks')
        ].join('\n');
        toast(t('toast.opening'));
        location.href = `mailto:hrnciarik@theprime.pro?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
      });
    }

    $$('[data-year]').forEach(el => { el.textContent = new Date().getFullYear(); });
  }

  /* ==========================================================================
     Portfolio page — lightbox
     ========================================================================== */
  function lightbox() {
    const lb = $('.lightbox');
    if (!lb) return;
    const cards = $$('.card');
    const img = $('.lightbox__fig img', lb);
    const nameEl = $('.lightbox__fig b', lb);
    const catEl = $('.lightbox__fig em', lb);
    const countEl = $('.lightbox__count', lb);
    const btns = $$('.lightbox__btn', lb);
    let i = 0, lastFocus = null;

    const render = () => {
      const c = cards[i];
      const src = $('img', c).getAttribute('src');
      img.classList.add('is-swap');
      setTimeout(() => {
        img.src = src;
        img.alt = $('b', c).textContent;
        const done = () => img.classList.remove('is-swap');
        if (img.complete) done(); else img.addEventListener('load', done, { once: true });
      }, 140);
      nameEl.textContent = $('b', c).textContent;
      catEl.textContent = $('em', c).textContent;
      countEl.textContent = `${String(i + 1).padStart(2, '0')} / ${cards.length}`;
    };
    const open = n => {
      i = n;
      lastFocus = document.activeElement;
      lb.hidden = false;
      render();
      requestAnimationFrame(() => lb.classList.add('is-open'));
      document.body.classList.add('is-locked');
      $('.lightbox__close', lb).focus();
    };
    const close = () => {
      lb.classList.remove('is-open');
      document.body.classList.remove('is-locked');
      setTimeout(() => { lb.hidden = true; }, 350);
      if (lastFocus) lastFocus.focus();
    };
    const go = d => { i = (i + d + cards.length) % cards.length; render(); };

    cards.forEach((c, n) => c.addEventListener('click', () => open(n)));
    $('.lightbox__close', lb).addEventListener('click', close);
    $('.lightbox__prev', lb).addEventListener('click', () => go(-1));
    $('.lightbox__next', lb).addEventListener('click', () => go(1));
    lb.addEventListener('click', e => { if (e.target === lb) close(); });
    addEventListener('keydown', e => {
      if (lb.hidden) return;
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowRight') go(1);
      else if (e.key === 'ArrowLeft') go(-1);
      else if (e.key === 'Tab') {
        const k = btns.indexOf(document.activeElement);
        e.preventDefault();
        btns[(k + (e.shiftKey ? -1 : 1) + btns.length) % btns.length].focus();
      }
    });
    let sx = null;
    lb.addEventListener('pointerdown', e => { sx = e.clientX; });
    lb.addEventListener('pointerup', e => {
      if (sx == null) return;
      const dx = e.clientX - sx;
      if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1);
      sx = null;
    });

    // deep link from the homepage wall: projekty.html#mioli
    const target = location.hash && document.getElementById(location.hash.slice(1));
    if (target && target.classList.contains('card')) {
      target.classList.add('is-target');
      setTimeout(() => target.scrollIntoView({ block: 'center', behavior: reduced ? 'auto' : 'smooth' }), 450);
      setTimeout(() => target.classList.remove('is-target'), 3400);
    }
  }

  /* ---------- boot ---------- */
  const boot = () => {
    [i18nInit, intro, heroParticles, cursor, magnetic, scrambleLinks, reveals, stats, nav, clients, refs, wall, events, tiles, timeline, pricing, terminal, contact, lightbox, ambientGlitch]
      .forEach(fn => {
        try { fn(); } catch (err) { console.error('[prime]', fn.name, err); }
      });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
