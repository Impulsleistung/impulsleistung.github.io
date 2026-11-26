/* ============================================================
   Kevin Ostheimer — Portfolio interactions
   Everything here is progressive enhancement: the page stays
   fully readable and navigable when JavaScript is disabled.

   Deliberately small. The old achievement HUD, confetti, pointer
   comet trails, screen shake and magnetic buttons are gone: they
   were game feedback on a professional portfolio and cost a
   permanent canvas render loop for no benefit. The marquee scrolls
   and pauses entirely in CSS, so it needs no JavaScript at all.
   ============================================================ */
(function () {
  'use strict';

  var doc = document;
  var root = doc.documentElement;
  var motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  var reducedMotion = motionQuery.matches;

  /* Safari < 14 only knows addListener */
  function onMediaChange(query, handler) {
    if (typeof query.addEventListener === 'function') {
      query.addEventListener('change', handler);
    } else if (typeof query.addListener === 'function') {
      query.addListener(handler);
    }
  }

  onMediaChange(motionQuery, function (event) { reducedMotion = event.matches; });

  function $(selector, context) {
    return (context || doc).querySelector(selector);
  }

  function $$(selector, context) {
    return Array.prototype.slice.call((context || doc).querySelectorAll(selector));
  }

  /* ==========================================================
     CONTACT DETAILS — human-initiated reveal
     Values are XOR-obfuscated and decoded only after a deliberate
     interaction. This deters static scrapers; it is not encryption.
     ========================================================== */
  var CONTACT_VALUES = {
    email: { display: 'Wk9FWkZPakNHWl9GWUZPQ1leX0RNBE5P', target: null },
    phone: { display: 'AR4TCgIaAx0aHhkKEx4aGhoe', target: 'AR4THRoeGRMeGhoaHg==' }
  };

  function decodeContactValue(encoded) {
    var bytes = window.atob(encoded);
    var value = '';
    for (var i = 0; i < bytes.length; i += 1) {
      value += String.fromCharCode(bytes.charCodeAt(i) ^ 42);
    }
    return value;
  }

  $$('[data-contact-reveal]').forEach(function (button) {
    button.disabled = false;
    button.addEventListener('click', function () {
      var kind = button.getAttribute('data-contact-reveal');
      var details = CONTACT_VALUES[kind];
      if (!details) return;

      var displayValue = decodeContactValue(details.display);
      var targetValue = details.target ? decodeContactValue(details.target) : displayValue;
      var revealedLabel = button.getAttribute('data-contact-revealed-label');
      var link = doc.createElement('a');
      link.className = button.className + ' is-revealed';
      link.href = (kind === 'email' ? 'mailto:' : 'tel:') + targetValue;
      link.textContent = revealedLabel || displayValue;
      if (revealedLabel) link.setAttribute('aria-label', revealedLabel + ': ' + displayValue);
      button.parentNode.replaceChild(link, button);
      link.focus();
    });
  });

  /* ==========================================================
     NAVIGATION — smooth scrolling, progress + scrollspy
     The link list is a plain inline row on desktop and is hidden
     on phones. The hero CTA and the contact section already reach
     the same destinations on a phone, so there is no menu to open.
     ========================================================== */
  var navbar = $('.navbar');

  function navOffset() {
    return navbar ? navbar.offsetHeight + 12 : 68;
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

  var scrollBar = $('.scroll-progress-bar');
  var ticking = false;

  function readScroll() {
    ticking = false;

    var scrollY = window.pageYOffset || root.scrollTop;
    if (navbar) navbar.classList.toggle('scrolled', scrollY > 40);

    var docHeight = root.scrollHeight - window.innerHeight;
    var ratio = docHeight > 0 ? Math.min(1, Math.max(0, scrollY / docHeight)) : 0;
    if (scrollBar) scrollBar.style.transform = 'scaleX(' + ratio.toFixed(4) + ')';
    updateBackToTop(scrollY, ratio);
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

  if ('IntersectionObserver' in window && spyTargets.length) {
    var spy = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        navLinks.forEach(function (link) {
          var active = link.getAttribute('href') === '#' + entry.target.id;
          link.classList.toggle('is-active', active);
          if (active) link.setAttribute('aria-current', 'true');
          else link.removeAttribute('aria-current');
        });
      });
    }, { rootMargin: '-45% 0px -45% 0px', threshold: 0 });

    spyTargets.forEach(function (target) { spy.observe(target); });
  }

  /* ==========================================================
     SCROLL REVEAL
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
    /* Tall sections may never fit 12% of their height into a small viewport,
       especially with enlarged text. Reveal as soon as they enter instead. */
    }, { threshold: 0, rootMargin: '0px 0px -40px 0px' });

    animatedElements.forEach(function (el) { revealer.observe(el); });
  }

  /* ==========================================================
     COUNT-UP METRICS — animated once, on first sight
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
     SPARKLINE — draws itself when the hero is in view
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
     RIPPLE — small tactile feedback on buttons.
     Hover feedback on the cards comes entirely from CSS, so no
     pointermove work happens over the content at all.
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
      target.appendChild(ripple);

      window.setTimeout(function () {
        if (ripple.parentNode) ripple.parentNode.removeChild(ripple);
      }, 620);
    });
  }

  /* ==========================================================
     BOOT — initial scroll read + counters already in view
     Deferred with the script tag, so the DOM is parsed by now.
     ========================================================== */
  requestScrollRead();
  startCounters();
})();
