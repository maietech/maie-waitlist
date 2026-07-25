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
  var signupEmail = null;

  function track(name, metadata) {
    if (window.MaieTelemetry) window.MaieTelemetry.track(name, metadata);
  }

  function begin(opts) {
    if (started) return;
    started = true;
    opts = opts || {};
    signupEmail = opts.email || null;
    track('threshold_viewed');

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
    initSurvey();
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
    var pixieStartedTracked = false;

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
        if (!pixieStartedTracked) { pixieStartedTracked = true; track('pixie_started'); }
        return;
      }

      var presence = progress < 0.80 ? Math.min(1, progress / 0.10) : Math.max(0, 1 - (progress - 0.80) / 0.06);
      canvas.style.opacity = presence;
      if (presence > 0 && !pixieStartedTracked) {
        pixieStartedTracked = true;
        track('pixie_started');
      }
      if (line) line.style.opacity = window.storyStageWeight(progress, 0.08, 0.36, 0.06, 0.08);

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
    var completedTracked = false;

    function render(progress) {
      var top = 0, topW = 0;
      LINES.forEach(function (l, i) {
        var w = window.storyStageWeight(progress, l.start, l.end, 0.03, 0.03);
        if (w > topW) { topW = w; top = i; }
      });
      if (top !== activeIdx) { activeIdx = top; el.innerHTML = LINES[top].text; }
      el.style.opacity = topW;
      if (progress >= 0.98 && !completedTracked) {
        completedTracked = true;
        track('journey_completed');
      }
    }

    // The last line's window ends exactly at 1.00 (same idiom scene-
    // opening.js uses), so reduced motion's single progress=1 call already
    // lands correctly on "You're not waiting. You're arriving." — no
    // isStatic special-case needed here.
    window.initScrollScene(section, function (progress) { render(progress); });
  }

  // ── Scene 4: The Transition — the page itself becomes the curtain. ──
  // Auto-navigation is deliberately paused once the visitor engages with
  // the survey below (see initSurvey/surveyEngaged) — instrumenting the
  // moment shouldn't cut it short. Nothing here blocks a visitor who
  // ignores the survey entirely; it behaves exactly as before for them.
  var surveyEngaged = false;
  var navigateToPortal = null;

  function initTransition() {
    var section = document.getElementById('continuum-transition');
    var curtain = document.getElementById('continuum-curtain');
    var clarity = document.getElementById('continuum-clarity');
    var welcome = document.getElementById('continuum-welcome');
    var link = document.getElementById('continuum-enter-link');
    var survey = document.getElementById('continuum-survey');
    if (!section || !curtain) return;

    var navigateTimer = null;
    var navigated = false;
    // Long enough that an unengaged visitor who just kept scrolling
    // actually gets to read "Welcome." and notice the survey before the
    // page moves on without them — the previous 1s meant most people
    // never saw this moment at all. Anyone in a hurry still has the
    // "Continue to MAIE" link; this is only the default for people who
    // stop.
    var DWELL_MS = 3200;
    var DEST = 'https://joinmaie.com/';

    function go() {
      if (navigated) return;
      navigated = true;
      track('portal_redirected');
      window.location.href = DEST;
    }
    navigateToPortal = go;
    if (link) link.addEventListener('click', function () { track('portal_redirected'); });

    function render(progress, isStatic) {
      var curtainWeight = window.storyStageWeight(progress, 0.35, 1.00, 0.15, 0);
      curtain.style.opacity = curtainWeight;
      // Drives the haze cross-fade in .continuum-haze's CSS (index.html) —
      // the haze fades out as this fades in, so by the time the curtain is
      // visible the haze is contributing nothing to blur.
      document.documentElement.style.setProperty('--continuum-curtain', curtainWeight);
      // The panel leads — it materializes first, then Welcome and the
      // survey fade in on top of it, so it never reads as text appearing
      // on top of the still-hazy backdrop.
      if (clarity) clarity.style.opacity = window.storyStageWeight(progress, 0.62, 1.00, 0.14, 0);
      if (welcome) welcome.style.opacity = window.storyStageWeight(progress, 0.72, 1.00, 0.12, 0);
      if (link) link.style.opacity = window.storyStageWeight(progress, 0.86, 1.00, 0.10, 0);
      if (survey) survey.style.opacity = window.storyStageWeight(progress, 0.80, 1.00, 0.12, 0);

      // Reduced motion (and the one-shot static call every scene gets)
      // renders the settled curtain + panel + Welcome + link above, but
      // never auto-navigates — leaving the page without the visitor
      // acting is a stronger intervention than a visual animation, so it
      // stays manual (the link) whenever motion is reduced.
      if (reducedMotion || isStatic) return;

      if (progress >= 0.98 && !navigated && !navigateTimer && !surveyEngaged) {
        navigateTimer = setTimeout(go, DWELL_MS);
      } else if ((progress < 0.98 || surveyEngaged) && navigateTimer) {
        clearTimeout(navigateTimer);
        navigateTimer = null;
      }
    }

    window.initScrollScene(section, function (progress, isStatic) { render(progress, isStatic); });
  }

  // ── Scene 4.5: "Help us build MAIE" — optional micro-survey. Answering
  // one question reveals the next; answering the last (or Skip) submits
  // whatever was answered and lets the visitor continue on to the portal
  // link. Entirely optional — ignoring it changes nothing about the rest
  // of the experience. See form-overview.md item 12. ───────────────────
  function initSurvey() {
    var root = document.getElementById('continuum-survey');
    var thanks = document.getElementById('continuum-survey-thanks');
    var skipBtn = document.getElementById('continuum-survey-skip');
    if (!root) return;

    var questions = Array.prototype.slice.call(root.querySelectorAll('.continuum-survey-q'));
    var answers = {};
    var activeIdx = 0;
    var finished = false;

    function reveal(idx) {
      questions.forEach(function (q, i) {
        q.classList.toggle('csq-active', i === idx);
        if (i === idx) {
          if (reducedMotion) {
            q.classList.add('csq-in');
          } else {
            requestAnimationFrame(function () { q.classList.add('csq-in'); });
          }
        }
      });
    }

    function engage() {
      if (surveyEngaged) return;
      surveyEngaged = true;
      track('micro_survey_started');
    }

    function finish(skipped) {
      if (finished) return;
      finished = true;
      questions.forEach(function (q) { q.classList.add('csq-done'); });
      if (skipBtn) skipBtn.style.display = 'none';

      if (skipped) {
        track('micro_survey_skipped', answers);
        resumeNavigation();
        return;
      }

      if (thanks) thanks.classList.add('csq-in');
      track('micro_survey_completed', answers);

      if (signupEmail) {
        fetch('/api/survey', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(Object.assign({ email: signupEmail }, answers)),
        }).catch(function () { /* best-effort — the funnel event above already fired */ });
      }

      resumeNavigation();
    }

    function resumeNavigation() {
      // Auto-nav was paused for engage() above; once the visitor is done
      // with the survey (answered or skipped), give it a short beat and
      // continue as if they'd never paused it. Reduced motion never
      // auto-navigates, same as the rest of this scene — the "Continue to
      // MAIE" link stays the way through.
      surveyEngaged = false;
      if (reducedMotion || !navigateToPortal) return;
      setTimeout(function () { if (navigateToPortal) navigateToPortal(); }, 1400);
    }

    questions.forEach(function (q, idx) {
      var field = q.getAttribute('data-field');
      q.querySelectorAll('.continuum-survey-pill').forEach(function (pill) {
        pill.addEventListener('click', function () {
          engage();
          answers[field] = pill.getAttribute('data-value');
          if (idx + 1 < questions.length) {
            activeIdx = idx + 1;
            reveal(activeIdx);
          } else {
            finish(false);
          }
        });
      });
    });

    if (skipBtn) {
      skipBtn.addEventListener('click', function () {
        engage();
        finish(true);
      });
    }

    reveal(0);
  }

  window.MaieContinuum = { begin: begin };
})();
