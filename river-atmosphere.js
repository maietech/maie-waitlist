// river-atmosphere.js — "The River Finds You": the Continuum's dedicated
// atmospheric layer (see design doc: MAIE Waitlist Continuum — Design
// Direction "The River Finds You"). This replaces the old flat
// --continuum-atmosphere-only treatment with three coordinated systems
// the doc calls out by name:
//
//   1. THE CURRENT — a canvas of waveform fragments, pulses, and
//      destination nodes drifting downward at all times, independent of
//      scroll. Scrolling briefly strengthens it; it always settles back
//      to its resting pace on its own.
//   2. LIVING WATER — short-lived "echoes" that continuum.js spawns at
//      quiet beats (an evolve-line flashing in, an intertitle handing
//      off to the next) so a scene's traces dissolve into the Current
//      instead of just vanishing.
//   3. RAPIDS + CONVERGENCE — a single "momentum" value (0..1) that
//      continuum.js raises through the Journey/Transition scenes: the
//      Current quickens, depth separation increases, reflections
//      brighten, and waveform fragments bend toward a shared lane
//      (Convergence) — then it all eases back to calm right before
//      arrival, the way a river settles after rapids.
//
// Mounted lazily, same discipline as the rest of the Continuum (see its
// own header comment): nothing here allocates a canvas or starts a
// requestAnimationFrame loop until mount() is called from continuum.js's
// begin(). A visitor who never signs up never pays for any of this.
//
// Deterministic on purpose (Technical Principles in the design doc):
// every particle's shape, lane, and phase come from a fixed hash of its
// index, never Math.random(). The same visitor sees the same handcrafted
// flow every time, not a fresh scatter on each reload — only the Living
// Water echoes (genuinely one-off events tied to a scene beat) use
// Math.random(), and only for their short-lived, low-stakes scatter.
//
// Density is content-adaptive, also per the doc's Technical Principles:
// any element carrying [data-river-density="quiet|narrative|cinematic"]
// is watched by an IntersectionObserver, and whichever tagged element is
// most visible sets the Current's target density — fading or
// intensifying the whole layer rather than relying on one fixed global
// opacity. Rapids/Convergence is layered on top as a separate value
// continuum.js drives explicitly, since it needs to ramp continuously
// within a single scene rather than switch at a section boundary.

(function () {
  var reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Atmospheric Density presets — see the design doc's "Atmospheric
  // Density" section. Rapids isn't a fourth entry here: it's the
  // `momentum` value below, which multiplies on top of whichever of
  // these is currently active (Journey stays "quiet" while momentum
  // climbs, which is exactly "current becomes faster, nothing becomes
  // chaotic" — the content is still typography-led, it's just moving).
  var DENSITY = {
    quiet:     { alpha: 1.00, speed: 1.00, depth: 1.00, glow: 1.00 },
    narrative: { alpha: 0.50, speed: 1.00, depth: 0.82, glow: 0.85 },
    cinematic: { alpha: 0.06, speed: 0.85, depth: 0.55, glow: 0.70 },
  };

  var canvas = null, ctx = null, dpr = 1, vw = 0, vh = 0;
  var particles = [];
  var echoes = [];
  var raf = null;
  var lastT = null;
  var mounted = false;

  // Smoothed state — every value eases toward its *Target rather than
  // snapping, so density changes, scroll impulses, and momentum shifts
  // all read as the river responding, not switching frames.
  var densityKey = 'quiet';
  var density = { alpha: 1, speed: 1, depth: 1, glow: 1 };
  var current = 1;        // scroll-driven strength multiplier, eases back to 1
  var currentTarget = 1;
  var momentum = 0;       // Rapids/Convergence driver, 0..1, set by continuum.js
  var momentumTarget = 0;
  var lastScrollY = null;
  var pinnedUntil = 0;    // setDensity() briefly overrides the IntersectionObserver

  var colors = { primary: '#A52A2A', accent: '#FFD166', soft: 'rgba(232,230,227,0.9)' };

  function readColors() {
    var cs = getComputedStyle(document.documentElement);
    colors.primary = (cs.getPropertyValue('--primary-light') || '').trim() || colors.primary;
    colors.accent = (cs.getPropertyValue('--accent') || '').trim() || colors.accent;
    colors.soft = (cs.getPropertyValue('--text-1') || '').trim() || colors.soft;
  }

  // ── Deterministic particle field ────────────────────────────────────
  // One fixed hash, seeded by index only — see header comment above.
  function hash(n) {
    var x = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
    return x - Math.floor(x);
  }

  function buildParticles(count) {
    var list = [];
    for (var i = 0; i < count; i++) {
      var kindRoll = hash(i * 2.13 + 1);
      list.push({
        // wave = a waveform fragment, pulse = pulse geometry, node = a
        // destination node — the brand's own visual primitives (see the
        // design doc's "Brand Language" section), not generic dots.
        kind: kindRoll < 0.55 ? 'wave' : (kindRoll < 0.85 ? 'pulse' : 'node'),
        x: hash(i * 3.71 + 2),                  // 0..1 fraction of viewport width, fixed lane
        y0: hash(i * 5.09 + 3),                 // 0..1 initial phase along the fall
        depth: hash(i * 1.31 + 4),              // 0 (far/slow) .. 1 (near/fast) — parallax
        amp: 0.015 + hash(i * 4.4 + 5) * 0.05,  // sideways drift amplitude
        freq: 0.10 + hash(i * 6.6 + 6) * 0.22,  // sideways drift frequency
        phase: hash(i * 8.8 + 7) * Math.PI * 2,
        rotPhase: hash(i * 9.9 + 8) * Math.PI * 2,
        size: 8 + hash(i * 2.2 + 9) * 20,
        fallSpeed: 0.6 + hash(i * 3.3 + 10) * 0.9,
        accentHue: hash(i * 6.2 + 12) < 0.22,    // a minority render in accent gold, not brand red
      });
    }
    return list;
  }

  function resize() {
    if (!canvas) return;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    vw = window.innerWidth;
    vh = window.innerHeight;
    canvas.width = Math.round(vw * dpr);
    canvas.height = Math.round(vh * dpr);
    canvas.style.width = vw + 'px';
    canvas.style.height = vh + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  // ── Density: content-adaptive via IntersectionObserver ─────────────
  function watchDensity() {
    var els = document.querySelectorAll('[data-river-density]');
    if (!els.length || !('IntersectionObserver' in window)) return;
    var ratios = new Map();
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        ratios.set(entry.target, entry.isIntersecting ? entry.intersectionRatio : 0);
      });
      // A manual setDensity() call (continuum.js forcing a moment like
      // "settle right before arrival") stays in effect for its pin
      // window even if a tagged section is technically still onscreen.
      if (Date.now() < pinnedUntil) return;
      var totals = {};
      els.forEach(function (el) {
        var level = el.getAttribute('data-river-density');
        totals[level] = (totals[level] || 0) + (ratios.get(el) || 0);
      });
      var winner = null, best = 0;
      Object.keys(totals).forEach(function (level) {
        if (totals[level] > best) { best = totals[level]; winner = level; }
      });
      if (winner && DENSITY[winner]) densityKey = winner;
    }, { threshold: [0, 0.25, 0.5, 0.75, 1] });
    els.forEach(function (el) { observer.observe(el); });
  }

  function lerp(a, b, t) { return a + (b - a) * t; }

  // ── Public API ───────────────────────────────────────────────────────
  function setDensity(key, opts) {
    if (!DENSITY[key]) return;
    densityKey = key;
    if (opts && opts.pinMs) pinnedUntil = Date.now() + opts.pinMs;
  }

  function setMomentum(v) {
    momentumTarget = Math.max(0, Math.min(1, v));
  }

  // Living Water: a scene beat dissolving into the Current instead of
  // just disappearing. clientX/clientY are viewport coordinates (e.g.
  // from an element's getBoundingClientRect center) since the canvas is
  // position:fixed. A no-op under reduced motion — nothing here should
  // introduce motion that wasn't already running.
  function echo(clientX, clientY, opts) {
    if (reducedMotion || !mounted) return;
    opts = opts || {};
    var n = opts.count || 5;
    for (var i = 0; i < n; i++) {
      echoes.push({
        x: clientX, y: clientY,
        vx: (Math.random() - 0.5) * 24,
        vy: -6 - Math.random() * 16,
        life: 0, maxLife: 1100 + Math.random() * 500,
        size: 3 + Math.random() * 5,
      });
    }
    // One expanding ring alongside the dissolving fragments — "a pulse
    // may become a ripple" from the design doc.
    echoes.push({ ring: true, x: clientX, y: clientY, life: 0, maxLife: 900 });
  }

  // ── Frame loop ───────────────────────────────────────────────────────
  function frame(t) {
    if (!mounted) return;
    if (lastT == null) lastT = t;
    var dt = Math.min(0.05, (t - lastT) / 1000);
    lastT = t;

    // Current strength: a scroll impulse briefly raises `current` above
    // 1, then it decays back down on its own — "scrolling should briefly
    // strengthen the current before it naturally settles back into its
    // gentle pace," independent of the Rapids momentum below.
    var y = window.scrollY;
    if (lastScrollY != null) {
      var delta = Math.abs(y - lastScrollY);
      currentTarget = Math.max(currentTarget, 1 + Math.min(1.4, delta / 40));
    }
    lastScrollY = y;
    currentTarget = 1 + (currentTarget - 1) * Math.pow(0.5, dt / 0.35);
    current += (currentTarget - current) * Math.min(1, dt * 4);

    momentum += (momentumTarget - momentum) * Math.min(1, dt * 1.6);

    var target = DENSITY[densityKey] || DENSITY.quiet;
    density.alpha += (target.alpha - density.alpha) * Math.min(1, dt * 1.5);
    density.speed += (target.speed - density.speed) * Math.min(1, dt * 1.5);
    density.depth += (target.depth - density.depth) * Math.min(1, dt * 1.5);
    density.glow += (target.glow - density.glow) * Math.min(1, dt * 1.5);

    draw(t, dt);
    raf = requestAnimationFrame(frame);
  }

  function draw(t, dt) {
    ctx.clearRect(0, 0, vw, vh);
    var overallAlpha = density.alpha;
    if (overallAlpha <= 0.002 && !echoes.length) return;

    var speed = density.speed * current * (1 + momentum * 0.6);
    var depthSpread = density.depth * (1 + momentum * 0.5);
    var align = momentum; // Convergence: 0 = independent drift, 1 = aligned into a shared lane

    particles.forEach(function (p) {
      var depthMul = lerp(1 - 0.4 * depthSpread, 1 + 0.4 * depthSpread, p.depth);
      var fall = (p.y0 + t * 0.000018 * p.fallSpeed * speed * depthMul);
      var yFrac = (fall % 1.2) - 0.1;
      var ampMul = 1 - align * 0.65; // straightens out as the river converges
      var xFrac = p.x + Math.sin(t * 0.0006 * p.freq + p.phase) * p.amp * ampMul;
      // Convergence also nudges lanes gently toward the centerline, as
      // if separate signals were folding into one shared direction.
      xFrac = lerp(xFrac, 0.5, align * 0.35);

      var px = xFrac * vw;
      var py = yFrac * vh;
      if (px < -60 || px > vw + 60) return;
      var a = overallAlpha * (0.35 + 0.65 * p.depth) * density.glow * (1 + momentum * 0.35);

      drawParticle(p, px, py, a, t, align);
    });

    drawEchoes(dt);
  }

  function drawParticle(p, px, py, a, t, align) {
    var color = p.accentHue ? colors.accent : colors.primary;
    ctx.save();
    ctx.translate(px, py);
    var rot = Math.sin(t * 0.0004 + p.rotPhase) * 0.5 * (1 - align * 0.7);
    ctx.rotate(rot);
    ctx.globalAlpha = a;

    if (p.kind === 'wave') {
      // A short waveform fragment — three points forming a tiny crest,
      // not a generic line. Straightens slightly as alignment (align)
      // rises, echoing Convergence.
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.4;
      ctx.lineCap = 'round';
      ctx.beginPath();
      var s = p.size * 0.5;
      var lift = s * (0.6 + align * 0.4);
      ctx.moveTo(-s, 0);
      ctx.quadraticCurveTo(-s * 0.4, -lift, 0, 0);
      ctx.quadraticCurveTo(s * 0.4, lift, s, 0);
      ctx.stroke();
    } else if (p.kind === 'pulse') {
      var beat = 0.6 + 0.4 * Math.sin(t * 0.0012 + p.phase);
      var r = p.size * 0.22 * (0.7 + 0.3 * beat);
      var grad = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 3);
      grad.addColorStop(0, color);
      grad.addColorStop(1, 'transparent');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(0, 0, r * 3, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // node — a "destination node": a soft, neutral point that grows a
      // faint ring once Convergence is meaningfully underway, as though
      // it just locked into the shared direction.
      ctx.fillStyle = colors.soft;
      ctx.beginPath();
      ctx.arc(0, 0, p.size * 0.14 * (0.7 + align * 0.6), 0, Math.PI * 2);
      ctx.fill();
      if (align > 0.15) {
        ctx.strokeStyle = colors.accent;
        ctx.globalAlpha = a * align * 0.6;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(0, 0, p.size * 0.14 * 2.4, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  function drawEchoes(dt) {
    if (!echoes.length) return;
    for (var i = echoes.length - 1; i >= 0; i--) {
      var e = echoes[i];
      e.life += dt * 1000;
      var t = Math.min(1, e.life / e.maxLife);
      if (t >= 1) { echoes.splice(i, 1); continue; }
      var a = (1 - t) * Math.max(density.alpha, 0.2);
      ctx.save();
      ctx.globalAlpha = a;
      if (e.ring) {
        ctx.strokeStyle = colors.accent;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(e.x, e.y, 4 + t * 46, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        e.x += e.vx * dt;
        e.y += e.vy * dt;
        ctx.fillStyle = colors.primary;
        ctx.beginPath();
        ctx.arc(e.x, e.y, e.size * (1 - t * 0.6), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  // Reduced motion: one settled frame at low density, particles placed
  // at their resting phase, no rAF loop afterward — atmosphere without
  // motion, matching the design doc's own accessibility note under
  // "Technical Principles."
  function drawStatic() {
    resize();
    density = { alpha: 0.28, speed: 1, depth: 0.6, glow: 0.7 };
    ctx.clearRect(0, 0, vw, vh);
    particles.forEach(function (p) {
      var px = p.x * vw;
      var py = ((p.y0 * 1.2) - 0.1) * vh;
      drawParticle(p, px, py, 0.28 * (0.35 + 0.65 * p.depth), 0, 0);
    });
  }

  function mount() {
    if (mounted) return;
    mounted = true;
    readColors();
    document.addEventListener('maie:themechange', readColors);

    canvas = document.createElement('canvas');
    canvas.id = 'river-atmosphere';
    canvas.setAttribute('aria-hidden', 'true');
    canvas.style.position = 'fixed';
    canvas.style.inset = '0';
    canvas.style.zIndex = '1';
    canvas.style.pointerEvents = 'none';
    canvas.style.display = 'block';
    // Inserted right before the haze layer so paint order stays
    // grain/orbs -> river -> haze -> curtain, matching the z-index:1
    // stack those layers already establish (see index.html).
    var haze = document.querySelector('.continuum-haze');
    if (haze && haze.parentNode) {
      haze.parentNode.insertBefore(canvas, haze);
    } else {
      document.body.insertBefore(canvas, document.body.firstChild);
    }
    ctx = canvas.getContext('2d');

    particles = buildParticles(reducedMotion ? 26 : 70);
    resize();
    window.addEventListener('resize', resize);
    watchDensity();

    if (reducedMotion) {
      drawStatic();
      return;
    }
    raf = requestAnimationFrame(frame);
  }

  window.MaieRiver = {
    mount: mount,
    setDensity: setDensity,
    setMomentum: setMomentum,
    echo: echo,
  };
})();
