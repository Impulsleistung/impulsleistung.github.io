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
  var BADGES_KEY = 'ko-badges-v1';
  var CRED_KEY = 'ko-credential-openings-v1';
  var THEME_KEY = 'ko-theme-v1';
  var RING_RADIUS = 16;
  var RING_LENGTH = 2 * Math.PI * RING_RADIUS;

  var BADGES = [
    { id: 'first-signal', icon: 'sensors', title: 'First signal', hint: 'Open the platform.' },
    { id: 'full-tour', icon: 'travel_explore', title: 'Full platform tour', hint: 'Visit every section.' },
    { id: 'deep-dive', icon: 'trending_up', title: 'Deep dive', hint: 'Scroll to the very end.' },
    { id: 'credential-collector', icon: 'workspace_premium', title: 'Credential collector', hint: 'Open three credentials.' },
    { id: 'network-node', icon: 'hub', title: 'Network node', hint: 'Visit LinkedIn or GitHub.' },
    { id: 'direct-line', icon: 'mark_email_unread', title: 'Direct line', hint: 'Start an email conversation.' },
    { id: 'night-owl', icon: 'dark_mode', title: 'Night owl', hint: 'Switch to the dark theme.' }
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

    if (badgeState.length === BADGES.length) celebrate();
    return true;
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

    var colors = ['#0066CC', '#7C3AED', '#2563EB', '#EA580C', '#34C759', '#FF9F0A'];
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
     2. THEME — light / dark / system, persisted
     ========================================================== */
  var systemDark = window.matchMedia('(prefers-color-scheme: dark)');
  var themeButtons = $$('.theme-toggle');
  var themeValue = store.read(THEME_KEY, 'auto');
  if (['light', 'dark', 'auto'].indexOf(themeValue) === -1) themeValue = 'auto';

  function applyTheme() {
    var resolved = themeValue === 'auto'
      ? (systemDark.matches ? 'dark' : 'light')
      : themeValue;

    root.setAttribute('data-theme', resolved);
    root.setAttribute('data-theme-choice', themeValue);

    themeButtons.forEach(function (button) {
      var icon = $('.material-symbols-rounded', button);
      if (icon) icon.textContent = resolved === 'dark' ? 'dark_mode' : 'light_mode';
      button.setAttribute('aria-label',
        'Theme: ' + themeValue + '. Switch to ' + (resolved === 'dark' ? 'light' : 'dark') + '.');
      button.setAttribute('aria-pressed', String(themeValue === 'dark'));
    });
  }

  themeButtons.forEach(function (button) {
    button.addEventListener('click', function () {
      var resolved = root.getAttribute('data-theme');
      themeValue = resolved === 'dark' ? 'light' : 'dark';
      store.write(THEME_KEY, themeValue);
      applyTheme();
      unlock('night-owl');
    });
  });

  onMediaChange(systemDark, function () {
    if (themeValue === 'auto') applyTheme();
  });

  applyTheme();
  /* ==========================================================
     3. NAVIGATION — sheet, focus management, scrollspy
     ========================================================== */
  var navToggle = $('.nav-toggle');
  var navMenu = $('.nav-menu');
  var navBackdrop = $('.nav-backdrop');
  var navbar = $('.navbar');
  var navToggleIcon = navToggle ? $('.material-symbols-rounded', navToggle) : null;
  var menuOpen = false;
  var lastFocused = null;

  function setMenuState(isOpen) {
    if (!navToggle || !navMenu) return;
    if (isOpen === menuOpen) return;

    menuOpen = isOpen;
    navMenu.classList.toggle('active', isOpen);
    navToggle.classList.toggle('is-open', isOpen);
    if (navBackdrop) navBackdrop.classList.toggle('active', isOpen);
    if (navToggleIcon) navToggleIcon.textContent = isOpen ? 'close' : 'menu';

    navToggle.setAttribute('aria-expanded', String(isOpen));
    navToggle.setAttribute('aria-label', isOpen ? 'Close menu' : 'Open menu');
    doc.body.classList.toggle('menu-open', isOpen);

    if (isOpen) {
      lastFocused = doc.activeElement;
      window.setTimeout(function () {
        var first = $('.nav-link', navMenu);
        if (first && menuOpen) first.focus({ preventScroll: true });
      }, 60);
    } else if (lastFocused && typeof lastFocused.focus === 'function') {
      lastFocused.focus({ preventScroll: true });
      lastFocused = null;
    }
  }

  if (navToggle) {
    navToggle.addEventListener('click', function () {
      setMenuState(!menuOpen);
    });
  }

  if (navBackdrop) {
    navBackdrop.addEventListener('click', function () { setMenuState(false); });
  }

  /* Keep focus inside the sheet while it is open. */
  doc.addEventListener('keydown', function (event) {
    if (!menuOpen) return;

    if (event.key === 'Escape' || event.key === 'Esc') {
      event.preventDefault();
      setMenuState(false);
      return;
    }

    if (event.key !== 'Tab') return;

    var focusables = $$('.nav-scope a[href], .nav-scope button:not([disabled])')
      .filter(function (el) { return el.offsetWidth > 0 || el.offsetHeight > 0; });
    if (!focusables.length) return;

    var firstEl = focusables[0];
    var lastEl = focusables[focusables.length - 1];

    if (event.shiftKey && doc.activeElement === firstEl) {
      event.preventDefault();
      lastEl.focus();
    } else if (!event.shiftKey && doc.activeElement === lastEl) {
      event.preventDefault();
      firstEl.focus();
    }
  });

  /* Rotating the device or resizing past the breakpoint must not leave the
     sheet open with the page locked behind it. Must match the CSS breakpoint. */
  var mobileQuery = window.matchMedia('(max-width: 768px)');
  function syncMenuWithViewport() {
    if (!mobileQuery.matches && menuOpen) setMenuState(false);
  }
  onMediaChange(mobileQuery, syncMenuWithViewport);
  window.addEventListener('resize', syncMenuWithViewport);
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
      var wasOpen = menuOpen;
      setMenuState(false);

      var top = target.getBoundingClientRect().top + window.pageYOffset - navOffset();
      var go = function () {
        window.scrollTo({ top: Math.max(top, 0), behavior: reducedMotion ? 'auto' : 'smooth' });
      };

      /* Let the sheet finish closing before scrolling on mobile. */
      if (wasOpen && !reducedMotion) window.setTimeout(go, 180);
      else go();

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

      window.setTimeout(function () {
        if (ripple.parentNode) ripple.parentNode.removeChild(ripple);
      }, 620);
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
     10. BADGE TRACKING — credential / network / email
     ========================================================== */
  var credentialOpenings = store.read(CRED_KEY, []);
  if (Object.prototype.toString.call(credentialOpenings) !== '[object Array]') {
    credentialOpenings = [];
  }

  function trackCredential(link) {
    var id = link.getAttribute('href') || link.getAttribute('data-credential') || link.textContent.trim();
    if (!id || credentialOpenings.indexOf(id) !== -1) return;

    credentialOpenings.push(id);
    store.write(CRED_KEY, credentialOpenings);
    if (credentialOpenings.length >= 3) unlock('credential-collector');
  }

  /* Certificate links inside the Skills section */
  $$('.cert-compact a[href], a[data-credential]').forEach(function (link) {
    link.addEventListener('click', function () { trackCredential(link); });
  });

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
     11. BOOT — first signal + initial scroll read
     ========================================================== */
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

