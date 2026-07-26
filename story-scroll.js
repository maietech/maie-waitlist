// story-scroll.js — shared scroll-progress driver for "story scene" sections.
// A story scene is a tall wrapper (e.g. 250vh) with a `position: sticky`
// inner panel — this computes 0..1 progress as the user scrolls through
// that tall wrapper, WITHOUT hijacking scroll (native scrolling the whole
// time; we're just reading position, not setting it). Per the accessibility
// requirement in the brief: under prefers-reduced-motion, progress is
// reported once as 1 (final/settled state) and never updates again —
// no continuous animation loop runs at all.

window.initScrollScene = function (sectionEl, onProgress) {
  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced) { onProgress(1, true); return function () {}; }

  // ── Pacing ────────────────────────────────────────────────────────
  // The progress reported to onProgress is rate-limited on its way
  // toward the raw scroll-position value, so a fast flick or fling —
  // the mobile momentum-scroll case in particular — can't blow through
  // a scene's story beats in a couple of frames. This never touches,
  // delays, or hijacks the actual scroll: the page keeps moving exactly
  // as fast as the gesture driving it. Only the *visual* progress this
  // function reports lags behind and eases toward wherever the user
  // actually is, continuing to animate via requestAnimationFrame even
  // after the gesture (and its momentum) have already ended. Anyone
  // scrolling slower than PACE is completely unaffected — nothing here
  // does anything until a gesture is actually outrunning it.
  //
  // One shared constant, not a per-scene knob, so every story-scene
  // (Invitation, Journey, Transition) gets the same "weight" — it should
  // read as a property of scrolling through this experience, not as a
  // quirk of any one section.
  var PACE = 0.3; // full 0→1 traversal takes at least ~3.3s, however fast the gesture behind it
  var current = 0;
  var target = 0;
  var lastT = null;
  var raf = null;
  var running = false;

  function computeTarget() {
    var rect = sectionEl.getBoundingClientRect();
    var vh = window.innerHeight;
    var total = rect.height - vh;
    var scrolled = -rect.top;
    target = total > 0 ? Math.min(1, Math.max(0, scrolled / total)) : (rect.top < vh ? 1 : 0);
  }

  function tick(t) {
    if (lastT == null) lastT = t;
    // Clamp dt so a backgrounded tab (or a long main-thread stall) can't
    // resume with one giant catch-up step that defeats the whole point.
    var dt = Math.min(0.1, (t - lastT) / 1000);
    lastT = t;
    var delta = target - current;
    var step = PACE * dt;
    current = Math.abs(delta) <= step ? target : current + (delta > 0 ? step : -step);
    onProgress(current, false);
    if (current !== target) {
      raf = requestAnimationFrame(tick);
    } else {
      running = false;
      lastT = null;
    }
  }

  function ensureRunning() {
    if (!running) { running = true; raf = requestAnimationFrame(tick); }
  }

  function onScrollOrResize() { computeTarget(); ensureRunning(); }

  // Routed through reveal.js's shared scroll-batch registry (all
  // registered reads run before any writes, across every module using it)
  // instead of each of up to 7 story-scenes running its own independent
  // scroll listener with its own interleaved read-then-write — found in
  // the pre-production audit's scroll-jank profile as one of the top
  // contributors. computeTarget is the "read"; ensureRunning is the
  // "write" — it just (re)starts the local catch-up loop above if it
  // isn't already running. The actual per-frame onProgress calls happen
  // inside tick(), on their own requestAnimationFrame cadence, since the
  // whole point of the pacing above is that it keeps animating even once
  // scroll input (and therefore the batcher) has gone quiet. reveal.js
  // loads before this file, so registerScrollBatch is always available
  // in practice; the fallback below preserves the original
  // per-instance-listener behavior if that ever changes, so this
  // function stays correct standalone too.
  if (window.registerScrollBatch) {
    window.registerScrollBatch(computeTarget, ensureRunning);
  } else {
    window.addEventListener('scroll', onScrollOrResize, { passive: true });
    window.addEventListener('resize', onScrollOrResize);
  }
  computeTarget();
  ensureRunning();

  return function destroy() {
    if (!window.registerScrollBatch) {
      window.removeEventListener('scroll', onScrollOrResize);
      window.removeEventListener('resize', onScrollOrResize);
    }
    running = false;
    if (raf != null) cancelAnimationFrame(raf);
  };
};

// Smoothstep-style window: 1 inside [start,end], eased 0 outside, for
// crossfading between morph stages.
window.storyStageWeight = function (progress, start, end, fadeIn, fadeOut) {
  fadeIn = fadeIn != null ? fadeIn : 0.04;
  fadeOut = fadeOut != null ? fadeOut : 0.04;
  if (progress < start - fadeIn || progress > end + fadeOut) return 0;
  if (progress < start) return (progress - (start - fadeIn)) / fadeIn;
  if (progress > end) return 1 - (progress - end) / fadeOut;
  return 1;
};
