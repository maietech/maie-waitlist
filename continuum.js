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
    if (window.MaieRiver) window.MaieRiver.mount();
    initInvitation();
    initJourney();
    initTransition();
    initSurvey();
  }

  // Living Water helper — spawns an echo at an element's current
  // on-screen center. Used at quiet beats (an evolve-line flashing in,
  // an intertitle handing off to the next) so a scene's trace dissolves
  // into the Current instead of just disappearing. Safe to call even if
  // the river hasn't mounted (e.g. reduced motion) — echo() no-ops itself.
  function echoFromEl(el) {
    if (!el || !window.MaieRiver) return;
    var r = el.getBoundingClientRect();
    window.MaieRiver.echo(r.left + r.width / 2, r.top + r.height / 2);
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
    var p = 0;
    var lastWritten = null;

    function read() {
      var rect = root.getBoundingClientRect();
      var vh = window.innerHeight;
      var total = rect.height + vh;
      var traveled = vh - rect.top;
      p = total > 0 ? Math.min(1, Math.max(0, traveled / total)) : 0;
    }
    // .continuum-haze's backdrop-filter blur (index.html) reads this var
    // every time it changes, and a full-viewport backdrop-filter is one of
    // the more GPU-expensive things a browser can be asked to recompute —
    // full precision here would mean redoing that blur on every
    // fractional-pixel scroll delta for no visible difference. Rounding to
    // the nearest 0.01 and skipping the write entirely when that rounded
    // value hasn't moved cuts that recompute rate without changing what's
    // on screen (a 0.01 step is under a third of a pixel of blur radius).
    function write() {
      var quantized = Math.round(p * 100) / 100;
      if (quantized === lastWritten) return;
      lastWritten = quantized;
      document.documentElement.style.setProperty('--continuum-atmosphere', quantized.toFixed(2));
    }

    window.registerScrollBatch(read, write);
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

    // Pixie's base size is 96 (see pixie-companion.js — cssW/cssH work out
    // to size * 2.5, so 96 -> 240px). +60% gives her more presence on
    // wider screens, but the same +60% on a narrow phone (96 -> ~384px)
    // would overflow .continuum-sticky's padded box (padding: 0 24px) and
    // get clipped by its overflow:hidden, or crowd .continuum-invite-line
    // right below her. 480px matches the mobile breakpoint already used
    // for form layout elsewhere on this page (see .f-row2); below it she
    // only grows +30% (96 -> ~125px), which comfortably clears the invite
    // line at that width. Read once at init, same as `reducedMotion`
    // above — Pixie is only ever constructed once per signup, so this
    // doesn't need to track live viewport resizes.
    var pixieIsMobile = window.matchMedia && window.matchMedia('(max-width: 480px)').matches;
    var pixieSize = 96 * (pixieIsMobile ? 1.3 : 1.6);

    var pixieHandle = window.initPixieCompanion(canvas, {
      size: pixieSize, mode: 'ambient', phase: 'idle', archetype: 'archivist',
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
            echoFromEl(evolve);
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
      if (top !== activeIdx) {
        activeIdx = top;
        // The outgoing line dissolves into the Current rather than just
        // being overwritten — a Living Water echo at the same spot,
        // fired the instant the new line takes over.
        echoFromEl(el);
        el.innerHTML = LINES[top].text;
      }
      el.style.opacity = topW;

      // Rapids + Convergence: "almost imperceptibly, the river changes."
      // Held flat through the first half of the Journey, then momentum
      // climbs across the back half as the intertitles build toward
      // "You're not waiting. You're arriving." — the Current quickens
      // and its waveform fragments begin folding into a shared lane
      // right as the copy itself starts talking about arrival.
      if (window.MaieRiver) window.MaieRiver.setMomentum(Math.max(0, (progress - 0.55) / 0.45));

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
  var startPortalCountdown = null;
  var cancelPortalCountdown = null;
  var cancelPendingNavigation = null;

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
    var lastCurtainWritten = null;
    // Long enough that an unengaged visitor who just kept scrolling
    // actually gets to read "Welcome." and notice the survey before the
    // page moves on without them — the previous 1s meant most people
    // never saw this moment at all. Anyone in a hurry still has the
    // "Continue to MAIE" link; this is only the default for people who
    // stop.
    var DWELL_MS = 3200;
    var DEST = 'https://joinmaie.com/';

    // ── Countdown UI — see the .continuum-portal-countdown CSS comment
    // for the reasoning. countdownDeadline drives the numeral off a fixed
    // point in time (Date.now()-based, not a decrementing counter), so a
    // dropped frame or a throttled background tab can't leave it
    // reading the wrong number when it catches back up.
    var countdownEl = document.getElementById('continuum-portal-countdown');
    var countdownFill = document.getElementById('continuum-portal-countdown-fill');
    var countdownNum = document.getElementById('continuum-portal-countdown-num');
    var countdownRaf = null;
    var countdownDeadline = 0;

    function tickCountdown() {
      var remaining = countdownDeadline - Date.now();
      if (countdownNum) countdownNum.textContent = Math.max(1, Math.ceil(remaining / 1000));
      if (remaining <= 0) { countdownRaf = null; return; }
      countdownRaf = requestAnimationFrame(tickCountdown);
    }

    function startCountdown(ms) {
      if (!countdownEl || reducedMotion) return;
      countdownDeadline = Date.now() + ms;
      countdownEl.classList.add('is-active');
      if (countdownRaf == null) countdownRaf = requestAnimationFrame(tickCountdown);
      if (countdownFill) {
        // Force the 0%-width state to actually paint before starting the
        // real transition — otherwise the browser can coalesce both style
        // changes into one frame and the fill just appears already full.
        countdownFill.style.transitionDuration = '0ms';
        countdownFill.style.width = '0%';
        countdownFill.getBoundingClientRect();
        countdownFill.style.transitionDuration = ms + 'ms';
        countdownFill.style.width = '100%';
      }
    }

    function cancelCountdown() {
      if (countdownEl) countdownEl.classList.remove('is-active');
      if (countdownFill) {
        countdownFill.style.transitionDuration = '0ms';
        countdownFill.style.width = '0%';
      }
      if (countdownRaf != null) { cancelAnimationFrame(countdownRaf); countdownRaf = null; }
    }

    startPortalCountdown = startCountdown;
    cancelPortalCountdown = cancelCountdown;
    // engage() (initSurvey, below) needs to stop a navigate that's
    // already in flight the instant someone taps a survey pill — waiting
    // for the next render() call (scroll/resize-driven) to notice
    // surveyEngaged would otherwise mean answering a question while
    // already at the bottom of the page does nothing to stop a countdown
    // that's actively ticking, and the page navigates out from under a
    // reply that's mid-flight.
    cancelPendingNavigation = function () {
      if (navigateTimer) { clearTimeout(navigateTimer); navigateTimer = null; }
      cancelCountdown();
    };

    function go() {
      if (navigated) return;
      navigated = true;
      track('portal_redirected');
      window.location.href = DEST;
    }
    navigateToPortal = go;
    if (link) link.addEventListener('click', function () { track('portal_redirected'); });

    function render(progress, isStatic) {
      // fadeIn widened from 0.15 to 0.35 (ramping from progress 0 instead
      // of 0.20) — a full-bleed rectangle still reads as "a box appearing"
      // if it snaps to solid too quickly; spreading the same fade over
      // more of the scene's scroll distance makes it read as the
      // background gradually taking over rather than popping in.
      var curtainWeight = window.storyStageWeight(progress, 0.35, 1.00, 0.35, 0);
      curtain.style.opacity = curtainWeight; // cheap: opacity is compositor-only, updates every tick same as before
      // Drives the haze cross-fade in .continuum-haze's CSS (index.html) —
      // the haze fades out as this fades in, so by the time the curtain is
      // visible the haze is contributing nothing to blur. Quantized like
      // --continuum-atmosphere above, for the same reason: this feeds a
      // full-viewport backdrop-filter blur, which is worth not recomputing
      // on every one of the ~60 rAF ticks/sec this scene's pacing loop runs.
      var quantizedCurtain = Math.round(curtainWeight * 100) / 100;
      if (quantizedCurtain !== lastCurtainWritten) {
        lastCurtainWritten = quantizedCurtain;
        document.documentElement.style.setProperty('--continuum-curtain', quantizedCurtain.toFixed(2));
      }
      // The panel leads — it materializes first, then Welcome and the
      // survey fade in on top of it, so it never reads as text appearing
      // on top of the still-hazy backdrop.
      if (clarity) clarity.style.opacity = window.storyStageWeight(progress, 0.62, 1.00, 0.14, 0);
      if (welcome) welcome.style.opacity = window.storyStageWeight(progress, 0.72, 1.00, 0.12, 0);
      if (link) link.style.opacity = window.storyStageWeight(progress, 0.86, 1.00, 0.10, 0);
      if (survey) survey.style.opacity = window.storyStageWeight(progress, 0.80, 1.00, 0.12, 0);

      // Rapids carries over from the Journey scene and holds through
      // most of the Transition, then eases back down across the last
      // stretch — "immediately before arrival, everything settles. Like
      // water becoming calm again after passing through rapids." The
      // curtain's own [data-river-density="cinematic"] tag (index.html)
      // is already fading the Current's visibility to near-nothing here;
      // this only governs how fast it's moving underneath that fade.
      if (window.MaieRiver) {
        window.MaieRiver.setMomentum(progress < 0.80 ? 1 : Math.max(0, 1 - (progress - 0.80) / 0.20));
      }

      // Reduced motion (and the one-shot static call every scene gets)
      // renders the settled curtain + panel + Welcome + link above, but
      // never auto-navigates — leaving the page without the visitor
      // acting is a stronger intervention than a visual animation, so it
      // stays manual (the link) whenever motion is reduced.
      if (reducedMotion || isStatic) return;

      if (progress >= 0.98 && !navigated && !navigateTimer && !surveyEngaged) {
        navigateTimer = setTimeout(go, DWELL_MS);
        startCountdown(DWELL_MS);
      } else if ((progress < 0.98 || surveyEngaged) && navigateTimer) {
        clearTimeout(navigateTimer);
        navigateTimer = null;
        cancelCountdown();
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
      if (cancelPendingNavigation) cancelPendingNavigation();
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
      var RESUME_MS = 1400;
      if (startPortalCountdown) startPortalCountdown(RESUME_MS);
      setTimeout(function () { if (navigateToPortal) navigateToPortal(); }, RESUME_MS);
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
