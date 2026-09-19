/* ============================================================
   Kevin Ostheimer — Portfolio interactions
   Everything here is progressive enhancement: the page stays
   fully readable and navigable when JavaScript is disabled.
   ============================================================ */
(function () {
  'use strict';

  var doc = document;
  var root = doc.documentElement;
  var motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  var hoverQuery = window.matchMedia('(hover: hover) and (pointer: fine)');
  var reducedMotion = motionQuery.matches;
  var finePointer = hoverQuery.matches;

  /* Safari < 14 only knows addListener */
  function onMediaChange(query, handler) {
    if (typeof query.addEventListener === 'function') {
      query.addEventListener('change', handler);
    } else if (typeof query.addListener === 'function') {
      query.addListener(handler);
    }
  }

  onMediaChange(motionQuery, function (event) { reducedMotion = event.matches; });
  onMediaChange(hoverQuery, function (event) { finePointer = event.matches; });

  function $(selector, context) {
    return (context || doc).querySelector(selector);
  }

  function $$(selector, context) {
    return Array.prototype.slice.call((context || doc).querySelectorAll(selector));
  }

  /* localStorage throws in private browsing / when site data is blocked. */
  var store = {
    read: function (key, fallback) {
      try {
        var raw = window.localStorage.getItem(key);
        return raw === null ? fallback : JSON.parse(raw);
      } catch (error) {
        return fallback;
      }
    },
    write: function (key, value) {
      try {
        window.localStorage.setItem(key, JSON.stringify(value));
      } catch (error) {
        /* storage unavailable — achievements simply won't persist */
      }
    }
  };

  /* ==========================================================
     1. GAMIFICATION — explorer badges
     ========================================================== */
  var BADGES_KEY = 'ko-badges-v2';
  var RING_RADIUS = 16;
  var RING_LENGTH = 2 * Math.PI * RING_RADIUS;

  var BADGES = [
    { id: 'first-signal', icon: 'sensors', title: 'First signal', hint: 'Open the platform.' },
    { id: 'full-tour', icon: 'travel_explore', title: 'Full platform tour', hint: 'Visit every section.' },
    { id: 'deep-dive', icon: 'trending_up', title: 'Deep dive', hint: 'Scroll to the very end.' },
    { id: 'network-node', icon: 'hub', title: 'Network node', hint: 'Visit LinkedIn or GitHub.' },
    { id: 'direct-line', icon: 'mark_email_unread', title: 'Direct line', hint: 'Start an email conversation.' }
  ];

  var hud = $('.explorer-hud');
  var hudToggle = $('.hud-toggle');
  var hudPanel = $('.hud-panel');
  var hudRingBar = $('.hud-ring-bar');
  var hudRingLabel = $('.hud-ring-label');
  var hudList = $('.hud-list');
  var hudCount = $('.hud-count');
  var hudProgress = $('.hud-progress-bar');
  var hudReset = $('.hud-reset');
  var toastRegion = $('.toast-region');

  var badgeState = store.read(BADGES_KEY, []);
  if (Object.prototype.toString.call(badgeState) !== '[object Array]') {
    badgeState = [];
  }
  /* Prune any id that is no longer in the roster. A returning visitor may
     still have a retired badge (e.g. the former credential-collector) in
     localStorage; left in place it would inflate the unlocked count past the
     new total and drive the progress bar beyond 100%.

     The cleaned array has to be written straight back, not just held in
     memory. unlock() is the only other place that persists, so without this
     write-back a visitor who never unlocks anything new would carry the
     retired id in storage indefinitely. */
  var prunedCount = badgeState.length;
  badgeState = badgeState.filter(function (id) { return badgeById(id) !== null; });
  if (badgeState.length !== prunedCount) {
    store.write(BADGES_KEY, badgeState);
  }
  var sectionsSeen = {};
  var sectionTotal = 0;

  function badgeById(id) {
    for (var i = 0; i < BADGES.length; i++) {
      if (BADGES[i].id === id) return BADGES[i];
    }
    return null;
  }

  function renderHud() {
    var unlocked = badgeState.length;
    var total = BADGES.length;
    var ratio = total ? unlocked / total : 0;

    if (hudRingBar) {
      hudRingBar.style.strokeDasharray = RING_LENGTH.toFixed(2);
      hudRingBar.style.strokeDashoffset = (RING_LENGTH * (1 - ratio)).toFixed(2);
    }
    if (hudRingLabel) hudRingLabel.textContent = Math.round(ratio * 100) + '%';
    if (hudCount) hudCount.textContent = unlocked + ' of ' + total + ' unlocked';
    if (hudProgress) hudProgress.style.width = (ratio * 100).toFixed(1) + '%';
    if (hudToggle) {
      hudToggle.setAttribute('aria-label',
        'Explorer progress: ' + unlocked + ' of ' + total + ' badges unlocked. Show achievements.');
    }

    if (!hudList) return;
    hudList.textContent = '';

    BADGES.forEach(function (badge) {
      var got = badgeState.indexOf(badge.id) !== -1;

      var item = doc.createElement('li');
      item.className = got ? 'hud-item is-unlocked' : 'hud-item';

      var icon = doc.createElement('span');
      icon.className = 'hud-item-icon material-symbols-rounded';
      icon.setAttribute('aria-hidden', 'true');
      icon.textContent = got ? badge.icon : 'lock';

      var body = doc.createElement('span');
      body.className = 'hud-item-body';

      var title = doc.createElement('span');
      title.className = 'hud-item-title';
      title.textContent = badge.title;

      var hint = doc.createElement('span');
      hint.className = 'hud-item-hint';
      hint.textContent = got ? 'Unlocked' : badge.hint;

      body.appendChild(title);
      body.appendChild(hint);
      item.appendChild(icon);
      item.appendChild(body);

      var state = doc.createElement('span');
      state.className = 'hud-item-state material-symbols-rounded';
      state.setAttribute('aria-hidden', 'true');
      state.textContent = got ? 'check_circle' : 'radio_button_unchecked';

      item.appendChild(state);
      hudList.appendChild(item);
    });
  }

  function unlock(id) {
    if (badgeState.indexOf(id) !== -1) return false;
    var badge = badgeById(id);
    if (!badge) return false;

    badgeState.push(id);
    store.write(BADGES_KEY, badgeState);
    renderHud();
    showToast(badge);
    celebrateUnlock(badge);

    if (badgeState.length === BADGES.length) celebrate();
    return true;
  }

  /* ---------- unlock feedback ----------
     Layered game-style reward: the HUD ring pops, floating XP rises from it,
     a shockwave rings out, and a soft flash lands on top. All of it routes
     through the FX engine, which no-ops entirely when motion is reduced or
     the tab is hidden — so this never needs its own guard. */
  function celebrateUnlock(badge) {
    /* Anchor the effect to the HUD toggle so the reward visibly emanates
       from the progress ring the player is watching, rather than from the
       centre of the screen where their attention is not. */
    var rect = hudToggle ? hudToggle.getBoundingClientRect() : null;
    var x = rect ? rect.left + rect.width / 2 : window.innerWidth / 2;
    var y = rect ? rect.top + rect.height / 2 : window.innerHeight / 2;

    if (hudToggle) {
      /* Removing the class first and forcing a reflow is what makes the
         animation restart on a second unlock in quick succession. Without
         the reflow the browser coalesces the two class changes and the
         animation never replays. */
      hudToggle.classList.remove('is-celebrating');
      void hudToggle.offsetWidth;
      hudToggle.classList.add('is-celebrating');

      window.setTimeout(function () {
        if (hudToggle) hudToggle.classList.remove('is-celebrating');
      }, 760);
    }

    if (fx) {
      fx.floatText(x, y - 26, '+' + (badgeState.length * 10) + ' XP', {
        size: 15,
        life: 1300,
        vy: -0.72
      });
      fx.shockwave(x, y, {
        maxR: 110,
        life: 700,
        sparks: 16,
        width: 2.4,
        trauma: 0.22
      });
      fx.flash('41,151,255', 0.16, 2.2);
    }
  }
  /* ---------- toast notifications ---------- */
  function showToast(badge) {
    if (!toastRegion) return;

    var toast = doc.createElement('div');
    toast.className = 'toast';

    var icon = doc.createElement('span');
    icon.className = 'toast-icon material-symbols-rounded';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = badge.icon;

    var body = doc.createElement('div');
    body.className = 'toast-body';

    var label = doc.createElement('span');
    label.className = 'toast-label';
    label.textContent = 'Badge unlocked';

    var title = doc.createElement('strong');
    title.className = 'toast-title';
    title.textContent = badge.title;

    body.appendChild(label);
    body.appendChild(title);
    toast.appendChild(icon);
    toast.appendChild(body);
    toastRegion.appendChild(toast);

    /* force a reflow so the entrance transition actually runs */
    void toast.offsetWidth;
    toast.classList.add('is-visible');

    var timer = window.setTimeout(function () { dismissToast(toast); }, 4800);
    toast.addEventListener('click', function () {
      window.clearTimeout(timer);
      dismissToast(toast);
    });
  }

  function dismissToast(toast) {
    if (!toast.parentNode) return;
    toast.classList.remove('is-visible');
    toast.classList.add('is-leaving');
    window.setTimeout(function () {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 420);
  }

  /* ---------- confetti burst once every badge is unlocked ---------- */
  function celebrate() {
    var canvas = $('#confetti-canvas');
    if (!canvas || !canvas.getContext) return;

    var ctx = canvas.getContext('2d');
    if (!ctx) return;

    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var width = window.innerWidth;
    var height = window.innerHeight;

    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';
    canvas.hidden = false;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    /* Confetti is drawn on a black ground, so the blue leads with the dark
       accent; the light-theme #0066CC read as a dull grey-navy there. */
    var colors = ['#2997FF', '#7C3AED', '#2563EB', '#EA580C', '#34C759', '#FF9F0A'];
    var pieces = [];
    var i;

    for (i = 0; i < 120; i++) {
      pieces.push({
        x: width * 0.5 + (Math.random() - 0.5) * width * 0.55,
        y: height * 0.45 + (Math.random() - 0.5) * 70,
        vx: (Math.random() - 0.5) * 10,
        vy: -Math.random() * 12 - 3,
        size: 4 + Math.random() * 6,
        color: colors[(Math.random() * colors.length) | 0],
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 0.3
      });
    }

    var started = performance.now();
    var LIFETIME = 2600;

    function finish() {
      ctx.clearRect(0, 0, width, height);
      canvas.hidden = true;
    }

    function frame(now) {
      var elapsed = now - started;
      var alpha = Math.max(0, 1 - elapsed / LIFETIME);
      ctx.clearRect(0, 0, width, height);

      var alive = false;
      pieces.forEach(function (piece) {
        piece.vy += 0.34;
        piece.vx *= 0.992;
        piece.x += piece.vx;
        piece.y += piece.vy;
        piece.rot += piece.vr;

        if (piece.y < height + 50 && alpha > 0) {
          alive = true;
          ctx.save();
          ctx.globalAlpha = alpha;
          ctx.translate(piece.x, piece.y);
          ctx.rotate(piece.rot);
          ctx.fillStyle = piece.color;
          ctx.fillRect(-piece.size / 2, -piece.size / 2, piece.size, piece.size * 0.62);
          ctx.restore();
        }
      });

      if (alive && elapsed < LIFETIME + 200) {
        requestAnimationFrame(frame);
      } else {
        finish();
      }
    }

    requestAnimationFrame(frame);
  }

  /* ==========================================================
     2. THEME — dark only.
     The page ships a single dark palette, so there is no toggle, no
     persisted preference and no system-preference listener: nothing here
     can change, so nothing needs to be observed.

     data-theme="dark" is still written on <html>. Nothing in this file or
     in styles.css reads it back — no CSS selector keys off it — but it
     remains a cheap, stable hook: it makes the active theme visible in
     devtools, and it gives any future theme work an attribute to target
     without having to reintroduce the plumbing.
     ========================================================== */
  root.setAttribute('data-theme', 'dark');
  /* ==========================================================
     3. NAVIGATION — smooth scrolling + scrollspy
     The link list is a plain inline row on desktop and is hidden on
     phones, so there is no sheet to open, no backdrop, no focus trap and
     no scroll lock. The hero CTA and the contact section already reach
     the same destinations on a phone.
     ========================================================== */
  var navbar = $('.navbar');

  /* ---------- smooth scrolling with navbar offset ---------- */
  function navOffset() {
    return navbar ? navbar.offsetHeight + 12 : 70;
  }

  $$('a[href^="#"]').forEach(function (anchor) {
    anchor.addEventListener('click', function (event) {
      var href = anchor.getAttribute('href');
      if (!href || href === '#') return;

      var target = doc.querySelector(href);
      if (!target) return;

      event.preventDefault();

      var top = target.getBoundingClientRect().top + window.pageYOffset - navOffset();
      window.scrollTo({ top: Math.max(top, 0), behavior: reducedMotion ? 'auto' : 'smooth' });

      if (history.replaceState) history.replaceState(null, '', href);
    });
  });

  /* ---------- scroll progress bar ---------- */
  var scrollBar = $('.scroll-progress-bar');
  var ticking = false;

  function readScroll() {
    ticking = false;

    var scrollY = window.pageYOffset || root.scrollTop;
    if (navbar) navbar.classList.toggle('scrolled', scrollY > 40);

    var docHeight = root.scrollHeight - window.innerHeight;
    var ratio = docHeight > 0 ? Math.min(1, Math.max(0, scrollY / docHeight)) : 0;

    if (scrollBar) scrollBar.style.transform = 'scaleX(' + ratio.toFixed(4) + ')';
    root.style.setProperty('--scroll-progress', ratio.toFixed(4));

    updateBackToTop(scrollY, ratio);
    if (fx) fx.onScroll(scrollY);
    if (ratio > 0.985) unlock('deep-dive');
  }

  function requestScrollRead() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(readScroll);
  }

  window.addEventListener('scroll', requestScrollRead, { passive: true });
  window.addEventListener('resize', requestScrollRead, { passive: true });

  /* ---------- back-to-top button with progress ring ---------- */
  var backToTop = $('.back-to-top');
  var backToTopRing = $('.back-to-top-ring');
  var TOP_RADIUS = 18;
  var TOP_LENGTH = 2 * Math.PI * TOP_RADIUS;

  if (backToTopRing) {
    backToTopRing.style.strokeDasharray = TOP_LENGTH.toFixed(2);
    backToTopRing.style.strokeDashoffset = TOP_LENGTH.toFixed(2);
  }

  function updateBackToTop(scrollY, ratio) {
    if (backToTop) backToTop.classList.toggle('is-visible', scrollY > window.innerHeight * 0.9);
    if (backToTopRing) {
      backToTopRing.style.strokeDashoffset = (TOP_LENGTH * (1 - ratio)).toFixed(2);
    }
  }

  if (backToTop) {
    backToTop.addEventListener('click', function () {
      window.scrollTo({ top: 0, behavior: reducedMotion ? 'auto' : 'smooth' });
    });
  }

  /* ---------- scrollspy: mark the section you are reading ---------- */
  var navLinks = $$('.nav-link[href^="#"]');
  var spyTargets = navLinks
    .map(function (link) { return doc.querySelector(link.getAttribute('href')); })
    .filter(Boolean);

  sectionTotal = $$('main section[id]').length;

  if ('IntersectionObserver' in window && spyTargets.length) {
    var spy = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;

        var id = entry.target.id;
        sectionsSeen[id] = true;

        navLinks.forEach(function (link) {
          var active = link.getAttribute('href') === '#' + id;
          link.classList.toggle('is-active', active);
          if (active) link.setAttribute('aria-current', 'true');
          else link.removeAttribute('aria-current');
        });

        if (sectionTotal > 0 && Object.keys(sectionsSeen).length >= sectionTotal) {
          unlock('full-tour');
        }
      });
    }, { rootMargin: '-45% 0px -45% 0px', threshold: 0 });

    spyTargets.forEach(function (target) { spy.observe(target); });
  }
  /* ==========================================================
     4. SCROLL REVEAL
     ========================================================== */
  var animatedElements = $$('[data-animate], [data-animate-stagger]');

  if (reducedMotion || !('IntersectionObserver' in window)) {
    animatedElements.forEach(function (el) { el.classList.add('animate-in'); });
  } else {
    var revealer = new IntersectionObserver(function (entries, observer) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('animate-in');
        observer.unobserve(entry.target);
        startCounters(entry.target);
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });

    animatedElements.forEach(function (el) { revealer.observe(el); });
  }

  /* ==========================================================
     5. COUNT-UP METRICS — animated once, on first sight
     ========================================================== */
  var counted = new WeakSet();

  function parseMetric(text) {
    var match = text.match(/^([^\d]*)(\d+(?:[.,]\d+)?)(.*)$/);
    if (!match) return null;
    return { prefix: match[1], value: parseFloat(match[2].replace(',', '.')), suffix: match[3] };
  }

  function countUp(element) {
    var parsed = parseMetric(element.textContent.trim());
    if (!parsed || parsed.value <= 0) return;

    var decimals = (String(parsed.value).split('.')[1] || '').length;
    var duration = 1100;
    var started = performance.now();

    function tick(now) {
      var progress = Math.min(1, (now - started) / duration);
      /* easeOutCubic — fast start, soft landing */
      var eased = 1 - Math.pow(1 - progress, 3);
      var current = parsed.value * eased;
      element.textContent = parsed.prefix + current.toFixed(decimals) + parsed.suffix;

      if (progress < 1) requestAnimationFrame(tick);
      else element.textContent = parsed.prefix + parsed.value.toFixed(decimals).replace(/\.0$/, '') + parsed.suffix;
    }

    requestAnimationFrame(tick);
  }

  function startCounters(scope) {
    if (reducedMotion) return;

    $$('.proof-metric, .platform-stats b, .platform-topline strong', scope || doc)
      .forEach(function (element) {
        if (counted.has(element)) return;
        counted.add(element);
        countUp(element);
      });
  }

  /* ==========================================================
     6. SPARKLINE — draws itself when the hero is in view
     ========================================================== */
  var sparkPath = $('.platform-chart svg path[stroke]');

  if (sparkPath && !reducedMotion && typeof sparkPath.getTotalLength === 'function') {
    var pathLength = 0;
    try { pathLength = sparkPath.getTotalLength(); } catch (error) { pathLength = 0; }

    if (pathLength > 0) {
      sparkPath.style.strokeDasharray = pathLength;
      sparkPath.style.strokeDashoffset = pathLength;
      sparkPath.style.transition = 'stroke-dashoffset 1.4s cubic-bezier(0.16, 1, 0.3, 1) 0.25s';

      requestAnimationFrame(function () {
        window.setTimeout(function () { sparkPath.style.strokeDashoffset = '0'; }, 260);
      });
    }
  }

  /* ==========================================================
     7. POINTER GLOW + TILT — fine pointers only
     ========================================================== */
  if (finePointer && !reducedMotion) {
    $$('.expertise-card, .cert-compact, .platform-card').forEach(function (card) {
      card.classList.add('is-interactive');

      card.addEventListener('pointermove', function (event) {
        var rect = card.getBoundingClientRect();
        var x = (event.clientX - rect.left) / rect.width;
        var y = (event.clientY - rect.top) / rect.height;

        card.style.setProperty('--glow-x', (x * 100).toFixed(2) + '%');
        card.style.setProperty('--glow-y', (y * 100).toFixed(2) + '%');
        card.style.setProperty('--tilt-x', ((0.5 - y) * 5).toFixed(2) + 'deg');
        card.style.setProperty('--tilt-y', ((x - 0.5) * 5).toFixed(2) + 'deg');
      });

      card.addEventListener('pointerenter', function () {
        card.classList.add('is-hovered');
      });

      card.addEventListener('pointerleave', function () {
        card.classList.remove('is-hovered');
        card.style.setProperty('--tilt-x', '0deg');
        card.style.setProperty('--tilt-y', '0deg');
      });
    });
  }

  /* ==========================================================
     8. RIPPLE — tactile feedback on buttons
     ========================================================== */
  if (!reducedMotion) {
    doc.addEventListener('pointerdown', function (event) {
      var target = event.target.closest ? event.target.closest('.btn, .nav-cta') : null;
      if (!target) return;

      var rect = target.getBoundingClientRect();
      var ripple = doc.createElement('span');
      ripple.className = 'ripple';
      ripple.style.left = (event.clientX - rect.left) + 'px';
      ripple.style.top = (event.clientY - rect.top) + 'px';

      target.classList.add('has-ripple');
      target.appendChild(ripple);

      /* The ripple is the local, in-button feedback; this is the global
         "hit landed" feedback at the exact same point. Two effects on one
         gesture is what makes a click feel physical rather than merely
         visual. Kept subtle — a click you perform fifty times must not
         become exhausting. */
      if (fx) {
        fx.shockwave(event.clientX, event.clientY, {
          maxR: target.classList.contains('btn-primary') ? 74 : 52,
          life: 520,
          sparks: 7,
          width: 1.8,
          trauma: 0.08
        });
      }

      window.setTimeout(function () {
        if (ripple.parentNode) ripple.parentNode.removeChild(ripple);
      }, 620);
    });
  }

  /* ==========================================================
     8b. MAGNETIC BUTTONS — the button eases toward the cursor
     ----------------------------------------------------------
     Deliberately DOM/CSS rather than canvas: the effect is a transform on a
     real element, so it stays on the compositor and needs no per-frame
     drawing. The pointer position is sampled into rAF rather than written
     on every pointermove, because a 240 Hz mouse fires far more often than
     the display refreshes and each write forces a style recalculation.
     ========================================================== */
  if (finePointer && !reducedMotion) {
    var MAG_STRENGTH = 9;   /* max pull in px, reached at the button's edge */

    $$('.btn-primary').forEach(function (button) {
      var queued = false;
      var cx = 0;
      var cy = 0;

      function apply() {
        queued = false;

        var rect = button.getBoundingClientRect();
        /* Offset from the button's own centre. */
        var dx = cx - (rect.left + rect.width / 2);
        var dy = cy - (rect.top + rect.height / 2);

        /* The pull ramps linearly from 0 at the centre to MAG_STRENGTH at the
           edge. Normalising by half the larger dimension is what makes a wide
           button and a narrow one both reach full pull at their own edge.

           A distance-based falloff is deliberately NOT used here: pointermove
           only fires while the cursor is inside the button, so any falloff
           that reached zero before the corner would make the effect flip off
           and back on as the cursor crossed the corners, visibly flickering.
           A plain proportional offset is monotonic and cannot flicker, and
           |dx| is already bounded by the button's half-width. */
        var reach = Math.max(rect.width, rect.height) * 0.5;
        if (reach <= 0) return;

        button.classList.add('is-magnetic');
        button.classList.remove('is-releasing');
        button.style.setProperty('--mag-x', (dx * MAG_STRENGTH / reach).toFixed(2) + 'px');
        button.style.setProperty('--mag-y', (dy * MAG_STRENGTH / reach).toFixed(2) + 'px');
      }

      function release() {
        if (!button.classList.contains('is-magnetic')) return;
        /* is-releasing lengthens the transition so the button glides home
           instead of teleporting, which is the part that reads as magnetic
           rather than merely offset. */
        button.classList.add('is-releasing');
        button.style.setProperty('--mag-x', '0px');
        button.style.setProperty('--mag-y', '0px');

        window.setTimeout(function () {
          button.classList.remove('is-magnetic');
          button.classList.remove('is-releasing');
        }, 360);
      }

      button.addEventListener('pointermove', function (event) {
        cx = event.clientX;
        cy = event.clientY;
        /* Coalesce to one style write per frame regardless of pointer rate. */
        if (queued) return;
        queued = true;
        requestAnimationFrame(apply);
      });

      button.addEventListener('pointerleave', release);
      /* A click can navigate away before pointerleave fires; resetting on
         blur covers keyboard and touch users too. */
      button.addEventListener('blur', release);
    });
  }
  /* ==========================================================
     9. HUD — panel toggle, reset, dismiss
     ========================================================== */
  function setHudOpen(isOpen) {
    if (!hudPanel) return;
    hudPanel.classList.toggle('is-open', isOpen);
    hudPanel.setAttribute('aria-hidden', String(!isOpen));
    if (hudToggle) hudToggle.setAttribute('aria-expanded', String(isOpen));
  }

  if (hudToggle && hudPanel) {
    setHudOpen(false);
    hudToggle.addEventListener('click', function () {
      setHudOpen(!hudPanel.classList.contains('is-open'));
    });
  }

  if (hud) {
    doc.addEventListener('click', function (event) {
      if (!hudPanel || !hudPanel.classList.contains('is-open')) return;
      if (!hud.contains(event.target)) setHudOpen(false);
    });
  }

  if (hudReset) {
    hudReset.addEventListener('click', function () {
      badgeState = [];
      sectionsSeen = {};
      store.write(BADGES_KEY, badgeState);
      renderHud();
      setHudOpen(true);
    });
  }

  renderHud();

  /* ==========================================================
     10. BADGE TRACKING — network / email
     ========================================================== */
  /* Network + email links */
  doc.addEventListener('click', function (event) {
    var anchor = event.target.closest ? event.target.closest('a') : null;
    if (!anchor) return;

    var href = anchor.getAttribute('href') || '';
    if (href.indexOf('linkedin.com') !== -1 || href.indexOf('github.com') !== -1) {
      unlock('network-node');
    }
    if (href.indexOf('mailto:') === 0) {
      unlock('direct-line');
    }
  });

  /* ==========================================================
     11. FX ENGINE — fixed-timestep render loop
     ----------------------------------------------------------
     Every decision here is a deliberate performance choice:

       • FIXED TIMESTEP. Simulation advances in 1/60 s slices from an
         accumulator, so motion looks identical on 60, 120 and 144 Hz
         displays. Catch-up is capped at 3 slices per frame — without
         that cap a backgrounded tab would try to simulate thousands of
         steps on return and lock up the main thread.

       • OBJECT POOLS. Particles are never allocated while running; they
         are recycled from a pre-grown array. This keeps the garbage
         collector silent, which is what actually causes stutter.

       • PRE-RENDERED SPRITES. A soft glow is a radial gradient. Building
         a gradient object per particle per frame is the most common
         canvas mistake there is; each colour is baked into an offscreen
         canvas once and blitted with drawImage instead.

       • ADDITIVE BLENDING. The page is dark-only, so every glow composites
         with 'lighter' and overlapping light accumulates the way real
         light does instead of washing each other out.

       • IDLE MEANS NO rAF AT ALL. The loop stops itself when nothing is
         left to draw and is woken on demand. A page at rest costs zero
         frames.

       • ADAPTIVE QUALITY. Frame times are sampled and the particle budget
         plus device-pixel-ratio step down on weak hardware instead of
         simply dropping frames.
     ========================================================== */
  var fx = (function () {
    /* ---------- simulation constants ---------- */
    var STEP = 1000 / 60;   /* fixed timestep in ms */
    var MAX_STEPS = 3;      /* catch-up cap — prevents the spiral of death */
    var TAU = Math.PI * 2;

    /* ---------- quality tiers ----------
       Stepped down when frame times slip, back up when there is headroom.
       DPR belongs in the tier because fill rate — not draw-call count —
       is what usually caps a full-viewport particle canvas. */
    var TIERS = [
      { name: 'high',   dpr: 2,   stars: 1.00, dust: 1.00, trail: 1.00, sparks: 1.00 },
      { name: 'medium', dpr: 1.5, stars: 0.60, dust: 0.55, trail: 0.70, sparks: 0.60 },
      { name: 'low',    dpr: 1,   stars: 0.32, dust: 0.28, trail: 0.00, sparks: 0.30 }
    ];
    var tierIndex = 0;
    var tier = TIERS[0];

    /* ---------- palette ----------
       Stored as RGB triples so rgba() strings are cheap to build and the
       sprite cache can key on them without string parsing.

       The page is dark-only, so there is exactly one palette and no theme
       flip to react to. 'lighter' compositing is correct here precisely
       because the ground is black: overlapping glows accumulate like real
       light instead of muddying each other. */
    var palette = {
      star: [206, 224, 255],
      dust: [122, 176, 255],
      accent: [41, 151, 255],
      ai: [167, 139, 250],
      cloud: [96, 165, 250],
      starAlpha: 0.62,
      dustAlpha: 0.26,
      blend: 'lighter'
    };

    function rgba(c, a) {
      return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' +
        (Math.round(a * 1000) / 1000) + ')';
    }

    /* ---------- pre-rendered glow sprites ---------- */
    var SPRITE_SIZE = 64;
    var spriteCache = {};

    function glowSprite(color) {
      var key = color[0] + ',' + color[1] + ',' + color[2];
      if (spriteCache[key]) return spriteCache[key];

      var c = doc.createElement('canvas');
      c.width = SPRITE_SIZE;
      c.height = SPRITE_SIZE;
      var g = c.getContext('2d');
      if (!g) return null;

      var half = SPRITE_SIZE / 2;
      var grad = g.createRadialGradient(half, half, 0, half, half, half);
      grad.addColorStop(0, rgba(color, 1));
      grad.addColorStop(0.28, rgba(color, 0.52));
      grad.addColorStop(0.62, rgba(color, 0.14));
      grad.addColorStop(1, rgba(color, 0));
      g.fillStyle = grad;
      g.fillRect(0, 0, SPRITE_SIZE, SPRITE_SIZE);

      spriteCache[key] = c;
      return c;
    }

    /* ---------- generic object pool ----------
       Live items always occupy indices [0, active). Releasing swaps the
       dead item with the last live one, so removal is O(1) and never
       allocates. Iterating backwards makes that swap safe. */
    function Pool(factory) {
      this.factory = factory;
      this.items = [];
      this.active = 0;
    }

    Pool.prototype.obtain = function () {
      var item;
      if (this.items.length > this.active) {
        item = this.items[this.active];
      } else {
        item = this.factory();
        this.items.push(item);
      }
      this.active++;
      return item;
    };

    Pool.prototype.release = function (index) {
      this.active--;
      var last = this.items[this.active];
      this.items[this.active] = this.items[index];
      this.items[index] = last;
    };

    Pool.prototype.releaseAll = function () { this.active = 0; };
    /* ---------- canvas surface wrapper ----------
       Owns sizing and the DPR transform. Both canvases get their box from
       CSS (the backdrop fills .hero, the overlay is fixed to the viewport),
       so clientWidth/clientHeight is the right measurement for both and no
       getBoundingClientRect call is needed anywhere in the loop. */
    function Surface(canvas) {
      this.canvas = canvas;
      this.ctx = canvas && canvas.getContext ? canvas.getContext('2d') : null;
      this.w = 0;
      this.h = 0;
      this.dpr = 1;
      this.live = false;
    }

    Surface.prototype.usable = function () { return !!this.ctx; };

    Surface.prototype.resize = function () {
      if (!this.ctx) return false;

      var w = this.canvas.clientWidth || window.innerWidth;
      var h = this.canvas.clientHeight || window.innerHeight;
      var dpr = Math.min(window.devicePixelRatio || 1, tier.dpr);

      w = Math.max(1, Math.round(w));
      h = Math.max(1, Math.round(h));
      if (w === this.w && h === this.h && dpr === this.dpr) return false;

      this.w = w;
      this.h = h;
      this.dpr = dpr;
      this.canvas.width = Math.round(w * dpr);
      this.canvas.height = Math.round(h * dpr);
      /* setTransform is absolute, so this also discards any leftover
         state from the previous size instead of compounding scales. */
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      return true;
    };

    Surface.prototype.clear = function () {
      if (this.ctx) this.ctx.clearRect(0, 0, this.w, this.h);
    };

    /* The CSS keeps both layers at opacity 0 until .is-live is added, so
       there is never an empty-canvas flash before the first frame lands. */
    Surface.prototype.markLive = function () {
      if (this.live || !this.ctx) return;
      this.live = true;
      this.canvas.classList.add('is-live');
    };

    var backdrop = new Surface($('#fx-backdrop'));
    var overlay = new Surface($('#fx-overlay'));
    var flashEl = $('#fx-flash');

    /* No 2D context (very old browser, or canvas disabled) means the whole
       engine stays dormant. The page is already fully functional without it. */
    var supported = backdrop.usable() && overlay.usable();
    /* ---------- runtime state ---------- */
    var heroEl = $('.hero');
    var running = false;
    var rafId = 0;
    var lastTime = 0;
    var accumulator = 0;
    var clock = 0;          /* total simulated time in ms */
    var heroInView = true;  /* backdrop only draws while the hero is on screen */

    /* Pointer state is written by events and read by the simulation.
       Events never draw anything themselves — they only store numbers —
       so a burst of pointermove events cannot become a burst of render
       work. The simulation emits at its own fixed rate instead. */
    var pointer = {
      x: 0, y: 0, px: 0, py: 0,
      inside: false,
      moved: false,
      vx: 0, vy: 0,
      speed: 0,
      emitAcc: 0
    };

    /* Trauma-based screen shake. An impact adds trauma, trauma decays
       linearly, and the applied offset scales with trauma SQUARED. The
       square is what makes a big hit feel violent while a small one stays
       barely perceptible — linear response feels mushy at every level. */
    var trauma = 0;
    var shakeX = 0;
    var shakeY = 0;

    /* Screen flash: alpha decays, and the CSS layer reads it straight off
       a custom property so nothing has to be re-styled per frame while it
       is idle (alpha 0 means the layer costs nothing). */
    var flash = { alpha: 0, decay: 0, color: '255,255,255' };

    /* ---------- starfield + dust ----------
       Both live in hero-local space and are reseeded whenever the hero
       changes size, so a resize never leaves a half-empty field behind.
       Counts scale with hero area rather than with the viewport, because
       a tall narrow hero and a wide short hero need different densities
       to look equally populated. */
    var STAR_PER_AREA = 1 / 9000;
    var DUST_PER_AREA = 1 / 34000;
    var STAR_MIN = 40;
    var STAR_MAX = 220;
    var DUST_MIN = 10;
    var DUST_MAX = 60;
    var stars = [];
    var dust = [];
    var fieldReady = false;

    function makeStar(w, h) {
      /* Depth drives three things at once — size, brightness and parallax
         response — which is what sells the field as 3D rather than flat. */
      var z = 0.18 + Math.random() * 0.82;
      return {
        x: Math.random() * w,
        y: Math.random() * h,
        z: z,
        r: 0.35 + z * 1.35,
        base: palette.starAlpha * (0.35 + z * 0.65),
        phase: Math.random() * TAU,
        twinkle: 0.6 + Math.random() * 1.7,
        drift: (0.16 + Math.random() * 0.5) * (0.4 + z)
      };
    }

    function makeDust(w, h) {
      var pick = Math.random();
      return {
        x: Math.random() * w,
        y: Math.random() * h,
        r: 7 + Math.random() * 22,
        /* Three brand colours, weighted so blue dominates and the wash
           never turns into a rainbow. */
        color: pick < 0.56 ? palette.dust : (pick < 0.82 ? palette.cloud : palette.ai),
        phase: Math.random() * TAU,
        wander: 0.18 + Math.random() * 0.4,
        amp: 6 + Math.random() * 20,
        rise: 0.05 + Math.random() * 0.22,
        alpha: palette.dustAlpha * (0.35 + Math.random() * 0.65)
      };
    }

    /* Rebuild the field to match the current hero box. Called on first
       frame and after any resize that actually changed the surface. */
    function seedField() {
      var w = backdrop.w;
      var h = backdrop.h;
      if (!w || !h) return;

      var area = w * h;
      var starCount = Math.round(Math.max(STAR_MIN,
        Math.min(STAR_MAX, area * STAR_PER_AREA)) * tier.stars);
      var dustCount = Math.round(Math.max(DUST_MIN,
        Math.min(DUST_MAX, area * DUST_PER_AREA)) * tier.dust);

      stars.length = 0;
      dust.length = 0;

      var i;
      for (i = 0; i < starCount; i++) stars.push(makeStar(w, h));
      for (i = 0; i < dustCount; i++) dust.push(makeDust(w, h));

      fieldReady = true;
    }
    /* ---------- particle pools ----------
       Four separate pools because each effect has a different lifetime,
       update rule and draw style. Sharing one pool would force every
       particle to carry every field, and the per-frame update would have
       to branch on a type tag. */

    /* Comet trail: short-lived, inherits pointer velocity, decays fast. */
    var trailPool = new Pool(function () {
      return { x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 1, r: 1, color: null };
    });

    /* Sparks: burst outward from an impact, affected by gravity + drag. */
    var sparkPool = new Pool(function () {
      return { x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 1, r: 1, color: null, grav: 0 };
    });

    /* Shockwaves: expanding rings. A ring is stroked, not filled, so it
       costs one path rather than a large blit — cheap even at 200px. */
    var wavePool = new Pool(function () {
      return { x: 0, y: 0, r: 0, maxR: 1, life: 0, maxLife: 1, width: 2, color: null };
    });

    /* Floating XP text. Text is expensive to rasterise, so each item caches
       its own metrics at spawn and the loop never calls measureText. */
    var textPool = new Pool(function () {
      return {
        x: 0, y: 0, vy: 0, life: 0, maxLife: 1,
        label: '', size: 14, color: null, drift: 0
      };
    });

    /* Hard caps. Pools can never exceed these, so a pathological burst of
       clicks degrades the effect instead of degrading the page. */
    var MAX_TRAIL = 90;
    var MAX_SPARKS = 120;
    var MAX_WAVES = 12;
    var MAX_TEXT = 8;

    /* ---------- effect emitters ----------
       These are the only public-ish entry points the rest of main.js uses.
       Every one is a no-op when motion is reduced, the tab is hidden, or
       canvas is unsupported — callers never have to check. */
    function addTrauma(amount) {
      if (!enabled()) return;
      /* Saturating add: two hits landing in the same frame cannot stack
         into a nauseating lurch. */
      trauma = Math.min(1, trauma + amount);
      wake();
    }

    function addFlash(color, alpha, decay) {
      if (!enabled()) return;
      flash.color = color || '255,255,255';
      flash.alpha = Math.min(1, Math.max(flash.alpha, alpha || 0.25));
      flash.decay = decay || 2.6;
      wake();
    }

    /* Expanding ring + optional spark burst + optional trauma. This is the
       single "impact" primitive that clicks, unlocks and toasts reuse. */
    function shockwave(x, y, options) {
      if (!enabled()) return;
      var opts = options || {};

      var color = opts.color || palette.accent;
      var strength = opts.strength || 1;

      if (wavePool.active < MAX_WAVES) {
        var wave = wavePool.obtain();
        wave.x = x;
        wave.y = y;
        wave.r = opts.startR || 4;
        wave.maxR = (opts.maxR || 90) * strength;
        wave.life = 0;
        wave.maxLife = opts.life || 620;
        wave.width = opts.width || 2;
        wave.color = color;
      }

      var sparkCount = Math.round((opts.sparks === undefined ? 10 : opts.sparks) * tier.sparks);
      var i;
      for (i = 0; i < sparkCount; i++) {
        if (sparkPool.active >= MAX_SPARKS) break;
        var s = sparkPool.obtain();
        var angle = Math.random() * TAU;
        var speed = (1.1 + Math.random() * 3.4) * strength;
        s.x = x;
        s.y = y;
        s.vx = Math.cos(angle) * speed;
        s.vy = Math.sin(angle) * speed;
        s.life = 0;
        s.maxLife = 380 + Math.random() * 420;
        s.r = 0.9 + Math.random() * 1.9;
        s.grav = opts.grav === undefined ? 0.012 : opts.grav;
        s.color = Math.random() < 0.72 ? color : palette.cloud;
      }

      if (opts.trauma) addTrauma(opts.trauma);
      wake();
    }

    /* Floating "+XP" style text rising from a point. */
    function floatText(x, y, label, options) {
      if (!enabled()) return;
      if (textPool.active >= MAX_TEXT) return;

      var opts = options || {};
      var item = textPool.obtain();
      item.x = x;
      item.y = y;
      item.vy = opts.vy === undefined ? -0.62 : opts.vy;
      item.life = 0;
      item.maxLife = opts.life || 1200;
      item.label = label;
      item.size = opts.size || 14;
      item.color = opts.color || palette.accent;
      item.drift = (Math.random() - 0.5) * 0.34;
      wake();
    }
    /* ---------- simulation ----------
       Pure state advancement: no canvas calls, no DOM reads, no DOM writes.
       Keeping simulation strictly separate from rendering is what makes the
       fixed timestep possible — the sim can run 0, 1, 2 or 3 times per
       rendered frame without ever changing how things are drawn. */
    function simulate(dt) {
      clock += dt;
      var sec = dt / STEP;   /* normalise so constants read as "per 60Hz frame" */

      /* --- pointer comet trail ---
         Emission is driven by an accumulator rather than by pointermove
         events, which means fast mouse movement cannot spawn more
         particles than the budget allows. */
      if (pointer.inside && pointer.moved && tier.trail > 0) {
        pointer.emitAcc += dt * (0.06 + Math.min(pointer.speed, 26) * 0.012) * tier.trail;

        while (pointer.emitAcc >= 1) {
          pointer.emitAcc -= 1;
          if (trailPool.active >= MAX_TRAIL) break;

          var t = trailPool.obtain();
          /* Spawn along the segment between the previous and current
             position so a fast flick leaves a continuous streak instead
             of a dotted line. */
          var f = Math.random();
          t.x = pointer.px + (pointer.x - pointer.px) * f + (Math.random() - 0.5) * 3;
          t.y = pointer.py + (pointer.y - pointer.py) * f + (Math.random() - 0.5) * 3;
          t.vx = pointer.vx * 0.12 + (Math.random() - 0.5) * 0.35;
          t.vy = pointer.vy * 0.12 + (Math.random() - 0.5) * 0.35 - 0.12;
          t.life = 0;
          t.maxLife = 340 + Math.random() * 380;
          t.r = 1.1 + Math.random() * 2.3;
          t.color = Math.random() < 0.66 ? palette.accent : palette.cloud;
        }
      }

      /* The "moved" signal is consumed by this step whether or not it
         produced particles. Clearing it only inside the tier-gated branch
         above would leave it stuck true on the lowest tier (where the trail
         is disabled outright) and the loop would never be able to sleep. */
      if (pointer.moved) {
        pointer.px = pointer.x;
        pointer.py = pointer.y;
        pointer.moved = false;
      }

      /* Pointer velocity relaxes back to zero so a stationary cursor
         stops feeding momentum into newly spawned particles. */
      pointer.vx *= 0.86;
      pointer.vy *= 0.86;
      pointer.speed *= 0.86;

      /* --- trail particles --- */
      var i;
      for (i = trailPool.active - 1; i >= 0; i--) {
        var p = trailPool.items[i];
        p.life += dt;
        if (p.life >= p.maxLife) { trailPool.release(i); continue; }

        p.x += p.vx * sec;
        p.y += p.vy * sec;
        p.vx *= 0.965;
        p.vy = p.vy * 0.965 - 0.012 * sec;  /* gentle buoyancy: embers rise */
      }

      /* --- sparks --- */
      for (i = sparkPool.active - 1; i >= 0; i--) {
        var sp = sparkPool.items[i];
        sp.life += dt;
        if (sp.life >= sp.maxLife) { sparkPool.release(i); continue; }

        sp.x += sp.vx * sec;
        sp.y += sp.vy * sec;
        sp.vx *= 0.972;
        sp.vy = sp.vy * 0.972 + sp.grav * sec;
      }

      /* --- shockwaves ---
         Radius uses easeOutQuint: the ring snaps outward and then crawls to
         a stop, which reads as a real pressure wave rather than a circle
         that simply grows at constant speed. */
      for (i = wavePool.active - 1; i >= 0; i--) {
        var w = wavePool.items[i];
        w.life += dt;
        if (w.life >= w.maxLife) { wavePool.release(i); continue; }

        var wp = w.life / w.maxLife;
        var eased = 1 - Math.pow(1 - wp, 5);
        w.r = 4 + (w.maxR - 4) * eased;
      }

      /* --- floating text --- */
      for (i = textPool.active - 1; i >= 0; i--) {
        var tx = textPool.items[i];
        tx.life += dt;
        if (tx.life >= tx.maxLife) { textPool.release(i); continue; }

        /* Decelerating rise: text shoots up, then hangs before fading. */
        tx.y += tx.vy * sec * (1 - tx.life / tx.maxLife * 0.72);
        tx.x += tx.drift * sec;
      }

      /* --- trauma decay + shake offset ---
         Trauma decays linearly, but the offset uses trauma^2. Perlin-style
         smooth noise is approximated with two detuned sines: it is smooth
         enough to avoid strobing and costs far less than real noise. */
      if (trauma > 0) {
        trauma = Math.max(0, trauma - dt / 1100);
        var intensity = trauma * trauma;
        var tSeed = clock * 0.055;
        shakeX = Math.sin(tSeed) * 14 * intensity + Math.sin(tSeed * 2.7) * 5 * intensity;
        shakeY = Math.cos(tSeed * 1.31) * 11 * intensity + Math.cos(tSeed * 3.1) * 4 * intensity;
      } else if (shakeX !== 0 || shakeY !== 0) {
        shakeX = 0;
        shakeY = 0;
      }

      /* --- flash decay --- */
      if (flash.alpha > 0) {
        flash.alpha = Math.max(0, flash.alpha - (dt / 1000) * flash.decay);
      }
    }
    /* ---------- parallax ----------
       The pointer drives two independent things:

         1. --par-x / --par-y on .hero, which the CSS multiplies by each
            layer's own --depth. Two style writes per frame total, however
            many layers exist.
         2. A per-star offset inside the canvas, scaled by each star's own
            depth z, so near stars slide further than far ones.

       Both are smoothed with a lerp rather than following the cursor
       directly. A raw cursor-driven transform looks jittery because pointer
       events arrive unevenly; the lerp turns that into a continuous glide.

       Parallax is deliberately a RENDER-side interpolation rather than part
       of simulate(): it holds no state any other system depends on, and
       binding it to the frame keeps it smooth even when the fixed timestep
       runs zero or several slices in a given frame. */
    var PAR_RANGE_X = 16;
    var PAR_RANGE_Y = 11;
    var par = { x: 0, y: 0, tx: 0, ty: 0, writtenX: NaN, writtenY: NaN };

    /* Cached hero box, refreshed on init/resize only — never inside the
       frame, and never on scroll, because getBoundingClientRect forces a
       layout flush. */
    var heroBox = { absTop: 0, height: 0 };

    function measureHero() {
      if (!heroEl) return;
      var rect = heroEl.getBoundingClientRect();
      var scrollY = window.pageYOffset || root.scrollTop || 0;
      /* Stored in DOCUMENT space on purpose. The scroll handler can then
         decide visibility with pure arithmetic instead of calling
         getBoundingClientRect on every scroll event, which would force a
         layout flush dozens of times a second while the user scrolls. */
      heroBox.absTop = rect.top + scrollY;
      heroBox.height = rect.height;
    }

    /* Writes the parallax custom properties, but only when the value has
       moved by a visible amount. A custom property write forces a style
       recalculation on the hero subtree, so writing an unchanged value 60
       times a second would be pure waste. */
    function writeParallax() {
      if (!heroEl) return;

      /* Parallax is a fine-pointer effect only. On touch, par.tx/par.ty are
         never updated, so there is nothing to track — and writing a constant
         0px would still promote the hero layers and recalculate their styles
         for no visible benefit. */
      if (!finePointer) return;

      var px = Math.round(par.x * PAR_RANGE_X * 10) / 10;
      var py = Math.round(par.y * PAR_RANGE_Y * 10) / 10;

      if (px === par.writtenX && py === par.writtenY) return;

      /* Promote the layers to their own compositor surfaces only while there
         is an actual offset to animate. Keeping the class applied at a zero
         offset would hold two large hero surfaces composited for the whole
         session in exchange for nothing — which is exactly what the matching
         CSS rule is written to avoid. */
      if (px === 0 && py === 0) {
        heroEl.classList.remove('is-parallax');
      } else if (!heroEl.classList.contains('is-parallax')) {
        heroEl.classList.add('is-parallax');
      }

      heroEl.style.setProperty('--par-x', px + 'px');
      heroEl.style.setProperty('--par-y', py + 'px');
      par.writtenX = px;
      par.writtenY = py;
    }

    /* Smooth parallax toward its target. Called once per rendered frame. */
    function updateParallax(dt) {
      /* Frame-rate independent smoothing: the factor is derived from the
         real elapsed time, so a 144 Hz display converges at the same rate
         as a 60 Hz one instead of twice as fast. */
      var k = 1 - Math.pow(0.001, dt / 1000);
      par.x += (par.tx - par.x) * k;
      par.y += (par.ty - par.y) * k;

      /* Snap to the target once the difference is sub-pixel, so the loop
         can genuinely go idle instead of lerping forever. */
      if (Math.abs(par.tx - par.x) < 0.001) par.x = par.tx;
      if (Math.abs(par.ty - par.y) < 0.001) par.y = par.ty;

      writeParallax();
    }
    /* ---------- backdrop render ----------
       Starfield + dust in hero-local space. Skipped entirely whenever the
       hero has scrolled off screen: there is no point rasterising a few
       hundred particles nobody can see. */
    function renderBackdrop() {
      if (!backdrop.usable() || !heroInView || !fieldReady) return;

      var ctx = backdrop.ctx;
      var w = backdrop.w;
      var h = backdrop.h;
      var i;

      ctx.clearRect(0, 0, w, h);
      ctx.save();

      /* Shake is applied inside the canvas rather than as a transform on a
         DOM ancestor. That is deliberate: a transform on <body> or <main>
         would make every position:fixed descendant (navbar, HUD, toasts,
         back-to-top, the FX layers themselves) resolve against that element
         instead of the viewport and visibly detach them. Inside the canvas
         it costs one matrix op and cannot break any layout. */
      if (trauma > 0) ctx.translate(shakeX * 0.7, shakeY * 0.7);

      ctx.globalCompositeOperation = palette.blend;

      /* --- dust: large soft washes, drawn first so stars sit on top --- */
      var span = h + 80;
      for (i = 0; i < dust.length; i++) {
        var d = dust[i];
        var sprite = glowSprite(d.color);
        if (!sprite) continue;

        /* Slow rise, wrapped over a slightly taller span than the hero so
           a blob never pops out of existence at the top edge. */
        var dy = d.y - clock * d.rise * 0.02;
        dy = ((dy % span) + span) % span - 40;
        var dx = d.x + Math.sin(clock * 0.00018 * d.wander + d.phase) * d.amp;
        dx += par.x * 10;
        dy += par.y * 7;

        /* Breathing alpha: the wash pulses slowly instead of sitting static,
           which is what makes the hero feel alive rather than patterned. */
        var breathe = 0.72 + Math.sin(clock * 0.00035 * d.wander + d.phase) * 0.28;
        var size = d.r * 2;

        ctx.globalAlpha = d.alpha * breathe;
        ctx.drawImage(sprite, dx - d.r, dy - d.r, size, size);
      }

      /* --- stars ---
         fillRect rather than arc(): stars are 1-3px, so a rect is visually
         identical to a circle at that size and skips the path machinery.
         Across a couple of hundred stars per frame that difference is real.
         The fill style is set once outside the loop. */
      ctx.fillStyle = 'rgb(' + palette.star[0] + ',' +
        palette.star[1] + ',' + palette.star[2] + ')';

      for (i = 0; i < stars.length; i++) {
        var s = stars[i];

        /* Slow lateral drift, wrapped so the field never thins on one side. */
        var sx = (s.x + clock * s.drift * 0.008) % (w + 4);
        if (sx < 0) sx += w + 4;
        /* Near stars respond more to the pointer than far ones — that depth
           differential is the whole reason the field reads as 3D. */
        sx += par.x * s.z * 26;
        var sy = s.y + par.y * s.z * 18;

        /* Twinkle: a slow sine per star, each with its own phase and rate so
           the field never pulses in unison. */
        var tw = 0.6 + Math.sin(clock * 0.001 * s.twinkle + s.phase) * 0.4;
        var alpha = s.base * tw;
        if (alpha <= 0.012) continue;   /* invisible — skip the draw entirely */

        ctx.globalAlpha = alpha > 1 ? 1 : alpha;
        var size = s.r * (0.86 + tw * 0.28);
        ctx.fillRect(sx - size * 0.5, sy - size * 0.5, size, size);
      }

      ctx.restore();
      /* restore() already resets alpha and blend mode, but being explicit
         guards against a later edit adding draws after this point. */
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';

      backdrop.markLive();
    }
    /* ---------- overlay render ----------
       Viewport-space effects. This layer is fixed to the viewport, so its
       coordinate space is already the screen and nothing needs converting. */
    function renderOverlay() {
      if (!overlay.usable()) return;

      var ctx = overlay.ctx;
      var i;

      /* Early out before touching the canvas at all. Clearing a full-
         viewport canvas is not free, so when there is nothing to draw the
         layer is left exactly as it is. */
      if (!trailPool.active && !sparkPool.active && !wavePool.active && !textPool.active) {
        if (overlay.live) overlay.clear();
        return;
      }

      ctx.clearRect(0, 0, overlay.w, overlay.h);
      ctx.save();
      if (trauma > 0) ctx.translate(shakeX * 0.35, shakeY * 0.35);
      ctx.globalCompositeOperation = palette.blend;

      /* --- shockwave rings ---
         Stroked arcs, not filled discs: one path instead of a big blit, and
         the lineWidth shrinking as the ring expands gives it the thinning
         "pressure front" look for free. */
      for (i = 0; i < wavePool.active; i++) {
        var wv = wavePool.items[i];
        var wp = wv.life / wv.maxLife;
        var wAlpha = (1 - wp) * (1 - wp) * 0.55;
        if (wAlpha <= 0.01) continue;

        ctx.globalAlpha = wAlpha;
        ctx.strokeStyle = rgba(wv.color, 1);
        ctx.lineWidth = Math.max(0.4, wv.width * (1 - wp));
        ctx.beginPath();
        ctx.arc(wv.x, wv.y, wv.r, 0, TAU);
        ctx.stroke();
      }

      /* --- comet trail + sparks ---
         Both are soft glows, so both blit the pre-rendered sprite. Alpha
         uses an ease-out curve so particles hold their brightness for most
         of their life and then vanish quickly — a linear fade makes the
         tail look like it is smeared out to nothing. */
      for (i = 0; i < trailPool.active; i++) {
        var tp = trailPool.items[i];
        var tp2 = tp.life / tp.maxLife;
        var tAlpha = (1 - tp2) * (1 - tp2);
        if (tAlpha <= 0.012) continue;

        var tSprite = glowSprite(tp.color);
        if (!tSprite) continue;

        var tSize = tp.r * 2 * (1.6 - tp2 * 0.7);
        ctx.globalAlpha = tAlpha * 0.85;
        ctx.drawImage(tSprite, tp.x - tSize * 0.5, tp.y - tSize * 0.5, tSize, tSize);
      }

      for (i = 0; i < sparkPool.active; i++) {
        var sk = sparkPool.items[i];
        var sp2 = sk.life / sk.maxLife;
        var sAlpha = 1 - sp2 * sp2;
        if (sAlpha <= 0.012) continue;

        var sSprite = glowSprite(sk.color);
        if (!sSprite) continue;

        /* Shrinking as it ages, so a spark reads as cooling down rather
           than simply fading out at constant size. */
        var sSize = sk.r * 2 * (1.5 - sp2 * 0.6);
        ctx.globalAlpha = sAlpha * 0.9;
        ctx.drawImage(sSprite, sk.x - sSize * 0.5, sk.y - sSize * 0.5, sSize, sSize);
      }

      /* --- floating XP text ---
         Text composites normally regardless of blend mode: additive text on
         a light background is unreadable, and readability beats glow here.
         This loop runs at most MAX_TEXT times a frame, so building the font
         string per item is well within budget. */
      ctx.globalCompositeOperation = 'source-over';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      for (i = 0; i < textPool.active; i++) {
        var tt = textPool.items[i];
        var ttp = tt.life / tt.maxLife;
        /* Fade in over the first 12%, hold, then fade out. Without the fade
           in, text pops into existence at full opacity. */
        var ttAlpha = ttp < 0.12 ? ttp / 0.12 : (1 - (ttp - 0.12) / 0.88);
        if (ttAlpha <= 0.012) continue;

        ctx.globalAlpha = Math.max(0, Math.min(1, ttAlpha));
        ctx.font = '600 ' + tt.size + 'px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        ctx.fillStyle = rgba(tt.color, 1);
        /* Slight overshoot scale on spawn sells the "pop" of gaining XP. */
        var pop = ttp < 0.18 ? 0.82 + (ttp / 0.18) * 0.28 : 1.1 - (ttp - 0.18) * 0.12;
        ctx.save();
        ctx.translate(tt.x, tt.y);
        ctx.scale(pop, pop);
        ctx.fillText(tt.label, 0, 0);
        ctx.restore();
      }

      ctx.restore();
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';

      overlay.markLive();
    }

    /* ---------- flash layer ----------
       Driven through a custom property on :root. Writing the property only
       when the rounded value changes means an idle flash costs no style
       work at all, and when it does fire it is a single write. */
    var flashWritten = -1;

    function renderFlash() {
      if (!flashEl) return;

      var quantised = Math.round(flash.alpha * 60) / 60;
      if (quantised === flashWritten) return;
      flashWritten = quantised;

      root.style.setProperty('--fx-flash-a', quantised.toFixed(3));
      if (quantised > 0) {
        root.style.setProperty('--fx-flash-c', 'rgba(' + flash.color + ',1)');
      }
    }
    /* ---------- gating ----------
       A single predicate every emitter consults. Centralising it means the
       rest of main.js can call fx.shockwave() blindly and the reduced-motion,
       hidden-tab and no-canvas cases are all handled in exactly one place. */
    function enabled() {
      return supported && !reducedMotion && !doc.hidden;
    }

    /* ---------- adaptive quality ----------
       Frame times are tracked with a rolling average. Sustained slippage
       steps the tier down; sustained headroom steps it back up. Hysteresis
       (a longer good-window than bad-window) is essential — without it the
       tier would oscillate around the threshold and cause visible popping
       in particle counts. */
    var frameAvg = 16.7;
    var badFrames = 0;
    var goodFrames = 0;
    var BAD_WINDOW = 34;    /* ~0.6 s of slow frames before degrading */
    var GOOD_WINDOW = 240;  /* ~4 s of fast frames before upgrading */

    function trackQuality(dt) {
      /* Ignore outliers above 200ms: those are tab-switch stalls or GC
         pauses, not a genuine signal about render throughput. Feeding them
         into the average would spuriously degrade quality. */
      if (dt > 200) return;

      frameAvg += (dt - frameAvg) * 0.08;

      if (frameAvg > 21) {
        badFrames++;
        goodFrames = 0;
        if (badFrames >= BAD_WINDOW) {
          badFrames = 0;
          setTier(tierIndex + 1);
        }
      } else if (frameAvg < 15.5) {
        goodFrames++;
        badFrames = 0;
        if (goodFrames >= GOOD_WINDOW) {
          goodFrames = 0;
          setTier(tierIndex - 1);
        }
      } else {
        badFrames = 0;
        goodFrames = 0;
      }
    }

    function setTier(index) {
      index = Math.max(0, Math.min(TIERS.length - 1, index));
      if (index === tierIndex) return;

      tierIndex = index;
      tier = TIERS[index];

      /* A tier change alters both the DPR cap and the particle budget.
         Zeroing dpr guarantees resize() sees a difference, so the surfaces
         are rebuilt and resizeSurfaces() reseeds the field to the new
         budget in one pass. */
      backdrop.dpr = 0;
      overlay.dpr = 0;
      resizeSurfaces();

      /* On the lowest tier the comet trail is disabled outright; drop any
         particles already in flight rather than leaving them to expire. */
      if (tier.trail === 0) trailPool.releaseAll();
    }

    /* ---------- loop control ----------
       The loop is demand-driven. wake() starts it, and frame() stops
       scheduling itself once nothing is left to animate. That is what makes
       an idle page cost zero frames instead of a permanent 60 Hz rAF. */
    function wake() {
      if (!enabled() || running) return;
      running = true;
      lastTime = 0;
      accumulator = 0;
      rafId = requestAnimationFrame(frame);
    }

    function sleep() {
      running = false;
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = 0;
      }
    }

    /* True while there is any reason to keep rendering another frame.
       The two surfaces have genuinely different idle conditions, so they
       are tested separately:

         • The backdrop drifts and twinkles forever, so it keeps the loop
           alive for as long as the hero is on screen — and only then. Once
           the hero has scrolled away there is nothing to see, so drawing it
           would be wasted work.
         • The overlay is event-driven and viewport-fixed. Its particles must
           keep animating after the hero is gone (you can trigger a shockwave
           at the bottom of the page), so it is deliberately NOT gated on
           heroInView. */
    function backdropBusy() {
      return heroInView && fieldReady && stars.length > 0;
    }

    function overlayBusy() {
      return pointer.moved ||
        trailPool.active > 0 ||
        sparkPool.active > 0 ||
        wavePool.active > 0 ||
        textPool.active > 0;
    }

    function hasWork() {
      return backdropBusy() ||
        overlayBusy() ||
        trauma > 0 ||
        flash.alpha > 0 ||
        par.x !== par.tx ||
        par.y !== par.ty;
    }

    /* Re-measure both surfaces, reseeding the starfield only if the hero box
       actually changed size. Returns true when anything was resized, so
       callers can tell whether a redraw is needed. */
    function resizeSurfaces() {
      var changed = false;
      if (backdrop.resize()) {
        changed = true;
        seedField();
      }
      if (overlay.resize()) changed = true;
      return changed;
    }

    function frame(now) {
      rafId = 0;

      if (!enabled()) {
        running = false;
        return;
      }

      /* First frame after a wake: lastTime was reset to 0, so there is no
         meaningful delta to measure. Rather than simulate zero steps (which
         would waste the frame entirely and delay the effect by one frame),
         simulate exactly one nominal step. That keeps the loop responsive
         while still guaranteeing no fast-forward: returning from a hidden
         tab costs one step, not the whole hidden duration. */
      var dt;
      if (!lastTime) {
        lastTime = now;
        dt = STEP;
      } else {
        dt = now - lastTime;
        lastTime = now;
      }

      /* Clamp before accumulating. Without this, returning from a hidden
         tab would hand the accumulator a multi-second delta and the capped
         catch-up would still visibly fast-forward the effect. */
      if (dt > 100) dt = 100;
      trackQuality(dt);

      accumulator += dt;

      /* Fixed-timestep catch-up. MAX_STEPS bounds the work per frame so a
         slow device degrades gracefully (motion slows) instead of entering
         the spiral of death where catch-up itself causes the next slow
         frame. Leftover time carries into the next frame. */
      var steps = 0;
      while (accumulator >= STEP && steps < MAX_STEPS) {
        simulate(STEP);
        accumulator -= STEP;
        steps++;
      }
      if (steps === MAX_STEPS) accumulator = 0;

      updateParallax(dt);

      renderBackdrop();
      renderOverlay();
      renderFlash();

      if (hasWork()) {
        rafId = requestAnimationFrame(frame);
      } else {
        running = false;
      }
    }
    /* ---------- hero visibility ----------
       Derived from the cached document-space box with plain arithmetic, so
       it can be called from the scroll handler with zero layout cost. The
       small margin keeps the field alive briefly during overscroll instead
       of blinking off the instant the last pixel leaves. */
    function updateHeroVisibility(scrollY) {
      if (!heroEl || !heroBox.height) {
        heroInView = true;
        return;
      }
      var viewportH = window.innerHeight;
      var margin = 80;
      var top = heroBox.absTop - scrollY;
      var visible = top < viewportH + margin && top + heroBox.height > -margin;

      if (visible === heroInView) return;
      heroInView = visible;

      if (visible) {
        /* Returning to the hero: the canvas was left holding the last frame
           drawn before it scrolled away, which is stale by now. Wake so the
           very next frame redraws rather than showing that old frame. */
        wake();
      }
    }

    /* ---------- pointer wiring ----------
       One passive listener on window feeds both the trail and the parallax
       target. The handler only stores numbers — all drawing happens in the
       simulation, so a high-frequency pointer (240 Hz gaming mice report far
       faster than the display refreshes) cannot inflate render work. */
    function onPointerMove(event) {
      if (!enabled()) return;

      var x = event.clientX;
      var y = event.clientY;

      if (!pointer.inside) {
        pointer.px = x;
        pointer.py = y;
        pointer.inside = true;
      }

      var dx = x - pointer.x;
      var dy = y - pointer.y;

      pointer.x = x;
      pointer.y = y;
      pointer.vx = dx;
      pointer.vy = dy;
      pointer.speed = Math.sqrt(dx * dx + dy * dy);
      pointer.moved = true;

      /* Parallax target is the pointer's offset from the viewport centre,
         normalised to -1..1. Only meaningful while the hero is on screen and
         only for a fine pointer — a finger dragging down the page would turn
         the hero into a distraction rather than a depth cue. */
      if (finePointer && heroInView) {
        par.tx = (x / window.innerWidth - 0.5) * 2;
        par.ty = (y / window.innerHeight - 0.5) * 2;
      }

      wake();
    }

    function onPointerLeave() {
      pointer.inside = false;
      pointer.moved = false;
      pointer.vx = 0;
      pointer.vy = 0;
      pointer.speed = 0;
      /* Ease the hero back to centre rather than freezing it wherever the
         cursor happened to exit. */
      par.tx = 0;
      par.ty = 0;
      wake();
    }

    /* ---------- lifecycle ---------- */
    function onVisibilityChange() {
      if (doc.hidden) {
        /* Nothing can be seen, so stop burning frames immediately. Pools are
           left alone: whatever was mid-flight simply resumes on return. */
        sleep();
      } else {
        /* Reset the clock basis. lastTime = 0 makes the first frame after a
           return start with a zero delta instead of simulating the entire
           time the tab was hidden. */
        lastTime = 0;
        accumulator = 0;
        measureHero();
        resizeSurfaces();
        wake();
      }
    }

    function onMotionPreferenceChange() {
      if (reducedMotion) {
        /* Honour the preference immediately and completely: stop the loop,
           drop every particle, undo the parallax offset, and clear both
           canvases so nothing lingers on screen. */
        sleep();
        trailPool.releaseAll();
        sparkPool.releaseAll();
        wavePool.releaseAll();
        textPool.releaseAll();
        trauma = 0;
        shakeX = 0;
        shakeY = 0;
        flash.alpha = 0;
        par.x = par.tx = 0;
        par.y = par.ty = 0;
        par.writtenX = NaN;
        par.writtenY = NaN;
        if (heroEl) heroEl.classList.remove('is-parallax');
        backdrop.clear();
        overlay.clear();
        renderFlash();
      } else {
        wake();
      }
    }

    /* ---------- initialisation ----------
       Deferred until first use rather than running at parse time, so a page
       that never scrolls and never moves the mouse never pays for any of it. */
    var initialised = false;

    function init() {
      if (initialised || !supported) return;
      initialised = true;

      measureHero();
      resizeSurfaces();

      /* Passive listeners: the browser may scroll while these run, so they
         must never call preventDefault and are declared passive to say so. */
      window.addEventListener('pointermove', onPointerMove, { passive: true });
      window.addEventListener('pointerdown', onPointerMove, { passive: true });
      doc.addEventListener('pointerleave', onPointerLeave);
      window.addEventListener('pointerout', function (event) {
        /* Only treat it as a real exit when the pointer leaves the window
           itself, not when it moves between elements inside the page. */
        if (!event.relatedTarget && !event.toElement) onPointerLeave();
      });

      /* Resizing needs a debounce-free but cheap handler: the surfaces
         re-measure themselves and no-op when nothing changed. Resize is rare
         enough (and the work small enough) that a rAF coalesce is plenty. */
      var resizeQueued = false;
      window.addEventListener('resize', function () {
        if (resizeQueued) return;
        resizeQueued = true;
        requestAnimationFrame(function () {
          resizeQueued = false;
          measureHero();
          resizeSurfaces();
          updateHeroVisibility(window.pageYOffset || root.scrollTop || 0);
          wake();
        });
      }, { passive: true });

      doc.addEventListener('visibilitychange', onVisibilityChange);

      /* The top of this file already keeps `reducedMotion` in sync with the
         media query (registered earlier, so it fires first). This listener
         only has to react to the change, not re-derive the flag. */
      onMediaChange(motionQuery, onMotionPreferenceChange);

      if (!reducedMotion) wake();
    }

    /* ---------- public API ----------
       The only surface the rest of main.js touches. Every method is safe to
       call unconditionally: gating lives inside the engine, so callers never
       need to reason about reduced motion, hidden tabs or canvas support. */
    return {
      init: init,

      /* Impact primitive: ring + sparks + optional trauma. */
      shockwave: shockwave,

      /* Rising "+XP" style label. */
      floatText: floatText,

      /* Screen shake impulse (saturating). */
      trauma: addTrauma,

      /* Full-screen tint. */
      flash: addFlash,

      /* Called from the existing rAF-throttled scroll handler. Doing it this
         way means no second scroll listener is registered and no extra
         layout read happens. */
      onScroll: function (scrollY) {
        if (!initialised || !supported) return;
        updateHeroVisibility(scrollY);
      }
    };
  })();
  /* ==========================================================
     12. BOOT — first signal + initial scroll read
     ========================================================== */
  fx.init();
  requestScrollRead();

  function firstSignal() {
    unlock('first-signal');
    /* kick counters for whatever is already on screen (hero) */
    startCounters();
  }

  if (doc.readyState === 'loading') {
    doc.addEventListener('DOMContentLoaded', firstSignal);
  } else {
    firstSignal();
  }
})();

