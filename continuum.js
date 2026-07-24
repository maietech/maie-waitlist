// continuum.js — the MAIE Cinematic Continuum: what happens after
// "Reserve my spot." The waitlist isn't the end of the funnel, it's the
// opening act — the user never "changes pages," they continue the story.
//
// Scene 1 (Threshold) is a direct DOM swap, triggered by MaieContinuum
// .begin() from the submit handler in index.html the moment a signup
// succeeds. Scenes 2-4 (Invitation, Journey, Transition) are
// story-scroll.js-driven scenes — same pattern joinmaie-landing uses for
// its own cinematic sections (see its DESIGN-DEV-GUIDE.md §4: a tall
// wrapper, a `position: sticky` inner panel, progress read from scroll
// position via initScrollScene, never set — no scroll-jacking).
//
// Mounted lazily: nothing here runs, and #continuum adds no height or
// scroll listeners, until begin() actually fires. A visitor who never
// signs up never pays for any of this.

(function () {
  var reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var started = false;

  function begin(opts) {
    if (started) return;
    started = true;
    opts = opts || {};

    var formStage = document.getElementById('wl-form-stage');
    var threshold = document.getElementById('continuum-threshold');
    var headline = document.getElementById('continuum-threshold-headline');
    var hint = document.getElementById('continuum-threshold-hint');
    var continuumRoot = document.getElementById('continuum');
    var skipLink = document.getElementById('skip-link');
    var ghLink = document.querySelector('.wl-corner-gh');

    // On a tall revealed multi-stage form (any viewport short enough that
    // the fields + submit button don't all fit at once — an iPad in
    // particular), reaching "Reserve my spot" already requires scrolling
    // partway down. Nothing else here resets that, so without this,
    // "You're in." can render far below the fold, or even fully above the
    // viewport — reported as empty space / the headline being "too far
    // down." Instant, not smooth: this is the quiet beat before the
    // headline fades in, not a moment for its own scroll animation.
    window.scrollTo(0, 0);

    // The corner easter eggs (plain-form skip link, GitHub) belonged to
    // the form scene. Nothing left for them to point at once it's gone.
    if (skipLink) skipLink.style.display = 'none';
    if (ghLink) ghLink.style.display = 'none';

    // Lets .wl-main drop its form-oriented top padding and become a true
    // full-viewport centering box instead (see index.html) — otherwise
    // "You're in." centers within whatever space is left under that
    // padding rather than the actual screen, which reads as "too far
    // down" on shorter viewports (reported on an iPad-sized one).
    document.body.classList.add('continuum-active');

    if (formStage) formStage.classList.add('wl-form-stage-hidden');
    if (headline) headline.textContent = opts.alreadyJoined ? "You're already in." : "You're in.";
    if (threshold) threshold.classList.add('wl-threshold-visible');
    if (continuumRoot) continuumRoot.classList.remove('continuum-hidden');

    setTimeout(function () {
      if (hint) hint.classList.add('continuum-in');
    }, reducedMotion ? 0 : 900);

    initAtmosphere();
    initInvitation();
    initJourney();
    initTransition();
  }

  // ── Environmental storytelling ───────────────────────────────────────
  // "Don't animate text. Animate atmosphere." One CSS var, read by the
  // haze overlay and the existing background orbs (see index.html). This
  // is a discrete scroll-position read on scroll/resize events, not a
  // continuous animation loop, so it's left running under reduced motion
  // too — the visual effect itself is neutralized there via CSS instead.
  function initAtmosphere() {
    var root = document.getElementById('continuum');
    if (!root) return;
    var ticking = false;
    function compute() {
      var rect = root.getBoundingClientRect();
      var vh = window.innerHeight;
      var total = rect.height + vh;
      var traveled = vh - rect.top;
      var p = total > 0 ? Math.min(1, Math.max(0, traveled / total)) : 0;
      document.documentElement.style.setProperty('--continuum-atmosphere', p.toFixed(3));
      ticking = false;
    }
    function onScroll() { if (!ticking) { requestAnimationFrame(compute); ticking = true; } }
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    compute();
  }

  // ── Scene 2: The Invitation — Pixie appears, observes, says one thing,
  // then evolves with progress instead of repeating herself, then
  // disappears with no explanation. ────────────────────────────────────
  function initInvitation() {
    var section = document.getElementById('continuum-invitation');
    var canvas = document.getElementById('continuum-pixie-canvas');
    var line = document.getElementById('continuum-invite-line');
    var evolve = document.getElementById('continuum-invite-evolve');
    if (!section || !canvas || !window.initPixieCompanion) return;

    var pixieHandle = window.initPixieCompanion(canvas, {
      size: 96, mode: 'ambient', phase: 'idle', archetype: 'archivist',
      temperament: 'curious',
      theme: window.getPixieThemeColors ? window.getPixieThemeColors() : null,
    });
    document.addEventListener('maie:themechange', function () {
      if (pixieHandle && pixieHandle.update && window.getPixieThemeColors) {
        pixieHandle.update({ theme: window.getPixieThemeColors() });
      }
    });

    var EVOLVE = [
      { at: 0.25, text: 'Keep going.', temperament: 'curious' },
      { at: 0.40, text: 'You’re beginning to see it.', temperament: 'focused' },
      { at: 0.60, text: 'Almost there.', temperament: 'celebrating' },
    ];
    var shown = {};

    function render(progress, isStatic) {
      // Reduced motion: this scene's whole arc (appear -> evolve ->
      // disappear by 80%) is scroll-progress choreography with no single
      // frame at progress=1 that reads as "finished" on its own — unlike
      // Journey below, whose final line's window deliberately extends to
      // 1.0. Show the settled, meaningful version instead: Pixie present,
      // her one sentence visible, no micro-copy (it's a scroll-driven
      // aside, not something with a static equivalent worth keeping).
      if (isStatic) {
        canvas.style.opacity = 1;
        if (line) line.style.opacity = 1;
        if (evolve) evolve.style.opacity = 0;
        return;
      }

      var presence = progress < 0.80 ? Math.min(1, progress / 0.10) : Math.max(0, 1 - (progress - 0.80) / 0.06);
      canvas.style.opacity = presence;
      if (line) line.style.opacity = window.storyStageWeight(progress, 0.10, 0.26, 0.05, 0.06);

      EVOLVE.forEach(function (s, i) {
        if (progress >= s.at && !shown[i]) {
          shown[i] = true;
          if (evolve) {
            evolve.textContent = s.text;
            evolve.classList.remove('continuum-flash');
            void evolve.offsetWidth;
            evolve.classList.add('continuum-flash');
          }
          if (pixieHandle && pixieHandle.update) pixieHandle.update({ temperament: s.temperament });
        }
      });
      if (evolve) {
        evolve.style.opacity = progress < 0.80
          ? (shown[0] ? 1 : 0)
          : Math.max(0, 1 - (progress - 0.80) / 0.05);
      }
    }

    window.initScrollScene(section, function (progress, isStatic) { render(progress, isStatic); });
  }

  // ── Scene 3: The Journey — one idea, one viewport, then it's gone. ──
  function initJourney() {
    var section = document.getElementById('continuum-journey');
    var el = document.getElementById('continuum-journey-line');
    if (!section || !el) return;

    var LINES = [
      { start: 0.00, end: 0.20, text: 'Every story begins with a signal.' },
      { start: 0.20, end: 0.40, text: 'What if software could direct itself?' },
      { start: 0.40, end: 0.60, text: 'Not another editor.<br>A production partner.' },
      { start: 0.60, end: 0.80, text: 'Media, moving at the speed of imagination.' },
      { start: 0.80, end: 1.00, text: 'You’re not waiting.<br>You’re arriving.' },
    ];
    var activeIdx = -1;

    function render(progress) {
      var top = 0, topW = 0;
      LINES.forEach(function (l, i) {
        var w = window.storyStageWeight(progress, l.start, l.end, 0.03, 0.03);
        if (w > topW) { topW = w; top = i; }
      });
      if (top !== activeIdx) { activeIdx = top; el.innerHTML = LINES[top].text; }
      el.style.opacity = topW;
    }

    // The last line's window ends exactly at 1.00 (same idiom scene-
    // opening.js uses), so reduced motion's single progress=1 call already
    // lands correctly on "You're not waiting. You're arriving." — no
    // isStatic special-case needed here.
    window.initScrollScene(section, function (progress) { render(progress); });
  }

  // ── Scene 4: The Transition — the page itself becomes the curtain. ──
  function initTransition() {
    var section = document.getElementById('continuum-transition');
    var curtain = document.getElementById('continuum-curtain');
    var welcome = document.getElementById('continuum-welcome');
    var link = document.getElementById('continuum-enter-link');
    if (!section || !curtain) return;

    var navigateTimer = null;
    var navigated = false;
    var DWELL_MS = 1000;
    var DEST = 'https://joinmaie.com/';

    function render(progress, isStatic) {
      curtain.style.opacity = window.storyStageWeight(progress, 0.35, 1.00, 0.15, 0);
      if (welcome) welcome.style.opacity = window.storyStageWeight(progress, 0.75, 1.00, 0.15, 0);
      if (link) link.style.opacity = window.storyStageWeight(progress, 0.85, 1.00, 0.10, 0);

      // Reduced motion (and the one-shot static call every scene gets)
      // renders the settled curtain + Welcome + link above, but never
      // auto-navigates — leaving the page without the visitor acting is a
      // stronger intervention than a visual animation, so it stays manual
      // (the link) whenever motion is reduced.
      if (reducedMotion || isStatic) return;

      if (progress >= 0.98 && !navigated && !navigateTimer) {
        navigateTimer = setTimeout(function () {
          navigated = true;
          window.location.href = DEST;
        }, DWELL_MS);
      } else if (progress < 0.98 && navigateTimer) {
        clearTimeout(navigateTimer);
        navigateTimer = null;
      }
    }

    window.initScrollScene(section, function (progress, isStatic) { render(progress, isStatic); });
  }

  window.MaieContinuum = { begin: begin };
})();
