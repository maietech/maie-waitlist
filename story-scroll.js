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

  function read() {
    return sectionEl.getBoundingClientRect();
  }
  function write(rect) {
    var vh = window.innerHeight;
    var total = rect.height - vh;
    var scrolled = -rect.top;
    var progress = total > 0 ? Math.min(1, Math.max(0, scrolled / total)) : (rect.top < vh ? 1 : 0);
    onProgress(progress, false);
  }

  // Routed through reveal.js's shared scroll-batch registry (all
  // registered reads run before any writes, across every module using it)
  // instead of each of up to 7 story-scenes running its own independent
  // scroll listener with its own interleaved read-then-write — found in
  // the pre-production audit's scroll-jank profile as one of the top
  // contributors. reveal.js loads before this file, so
  // registerScrollBatch is always available in practice; the fallback
  // below preserves the original per-instance-listener behavior if that
  // ever changes, so this function stays correct standalone too.
  if (window.registerScrollBatch) {
    return window.registerScrollBatch(read, write);
  }

  var ticking = false;
  function compute() { write(read()); ticking = false; }
  function onScroll() { if (!ticking) { requestAnimationFrame(compute); ticking = true; } }
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);
  compute();

  return function destroy() {
    window.removeEventListener('scroll', onScroll);
    window.removeEventListener('resize', onScroll);
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
