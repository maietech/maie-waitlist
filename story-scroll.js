// story-scroll.js — shared scroll-progress driver for "story scene" sections.
// A story scene is a tall wrapper (e.g. 250vh) with a `position: sticky`
// inner panel — this computes 0..1 progress as the user scrolls through
// that tall wrapper, WITHOUT hijacking scroll (native scrolling the whole
// time; we're just reading position, not setting it). Per the accessibility
// requirement in the brief: under prefers-reduced-motion, progress is
// reported once as 1 (final/settled state) and never updates again —
// no continuous animation loop runs at all.

// Shared scroll-batch registry — one scroll/resize listener for every
// consumer on the page (this file's story-scenes, plus continuum.js's
// atmosphere read) instead of each registering its own. Every consumer's
// "read" (getBoundingClientRect, etc.) runs before any consumer's "write"
// (a style/CSS-var mutation), so N scenes reacting to the same scroll
// event can never interleave into a read-write-read-write layout-thrash
// pattern — that ordering is guaranteed structurally here, not by each
// call site happening to write only inside its own later rAF tick.
// Defined once, on first load of this file (story-scroll.js loads before
// continuum.js — see index.html), so any file loaded after it can rely
// on window.registerScrollBatch existing.
window.registerScrollBatch = window.registerScrollBatch || (function () {
  var reads = [];
  var writes = [];
  var listening = false;

  function runBatch() {
    for (var i = 0; i < reads.length; i++) reads[i]();
    for (var i = 0; i < writes.length; i++) writes[i]();
  }
  function ensureListening() {
    if (listening) return;
    listening = true;
    window.addEventListener('scroll', runBatch, { passive: true });
    window.addEventListener('resize', runBatch);
  }

  return function registerScrollBatch(read, write) {
    ensureListening();
    reads.push(read);
    writes.push(write);
    // Fire once immediately, matching the old per-instance
    // addEventListener-then-call-once behavior each consumer used to
    // have on its own — a scene mounted mid-page (e.g. the Continuum,
    // mounted lazily on signup) needs a correct initial value before
    // the next real scroll/resize event, not just whenever one happens.
    read();
    write();
    return function unregister() {
      var ri = reads.indexOf(read); if (ri !== -1) reads.splice(ri, 1);
      var wi = writes.indexOf(write); if (wi !== -1) writes.splice(wi, 1);
    };
  };
})();

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

  // Routed through the shared scroll-batch registry above (all registered
  // reads run before any writes, across every module using it) instead of
  // each story-scene running its own independent scroll listener with its
  // own interleaved read-then-write. computeTarget is the "read";
  // ensureRunning is the "write" — it just (re)starts the local catch-up
  // loop above if it isn't already running. The actual per-frame
  // onProgress calls happen inside tick(), on their own
  // requestAnimationFrame cadence, since the whole point of the pacing
  // above is that it keeps animating even once scroll input (and
  // therefore the batcher) has gone quiet.
  var unregister = window.registerScrollBatch(computeTarget, ensureRunning);

  return function destroy() {
    unregister();
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
