// pixie-companion.js — vanilla-JS port of the real PixieCompanion.tsx
// canvas engine (spring physics nucleus, gaze, aerodynamic wake, particle
// field, orbit rings). The math below — ARCHETYPE_ENERGY, phaseEnergy,
// buildCorePath, springStep, ARCHETYPE_SPRING, TEMPERAMENT_ENERGY_MULT,
// and the whole animate() loop — is copied from the app's component
// as-is; only the React wrapper (useRef/useEffect/props plumbing) was
// removed, since none of the rendering itself depended on React.
//
// Two features are intentionally omitted, not stubbed:
//   - Reputation echoes (the `echoes` prop) — satellite marks driven by
//     a signed-in user's history. A site visitor has none; the correct
//     rendering for that state is "no echoes", not a fake one.
//   - Skin compositing (`assetUrl`) — a purchased AGENT_SKIN image.
//     Same reasoning: no account, no skin, procedural rendering only.
// Everything else renders exactly as the app does for a fresh Pixie at
// rest: mode "ambient", phase "idle", archetype "archivist".

(function () {
  var ARCHETYPE_ENERGY = {
    archivist:   { speedMult: 1.0,  wobbleMult: 0.8, connectionDist: 45, breatheSpeed: 1.2 },
    artisan:     { speedMult: 1.3,  wobbleMult: 1.4, connectionDist: 55, breatheSpeed: 1.8 },
    navigator:   { speedMult: 0.9,  wobbleMult: 1.0, connectionDist: 40, breatheSpeed: 2.2 },
    oracle:      { speedMult: 0.7,  wobbleMult: 1.8, connectionDist: 70, breatheSpeed: 0.8 },
    forgekeeper: { speedMult: 0.3,  wobbleMult: 0.4, connectionDist: 30, breatheSpeed: 0.5 },
  };

  var ARCHETYPE_SPRING = {
    archivist:   { stiffness: 0.09, damping: 0.80 },
    artisan:     { stiffness: 0.12, damping: 0.76 },
    navigator:   { stiffness: 0.10, damping: 0.80 },
    oracle:      { stiffness: 0.07, damping: 0.85 },
    forgekeeper: { stiffness: 0.05, damping: 0.90 },
  };

  var TEMPERAMENT_ENERGY_MULT = { idle: 1.0, curious: 1.05, focused: 1.0, celebrating: 1.3, recovering: 0.7 };

  // Shared theme-color reader for every Pixie call site — reads the same
  // tokens scene-opening.js already reads via getComputedStyle for its own
  // theme-aware canvas colors, so both call sites (companion-intro,
  // scene-agent) stay in sync with the toggle instead of rendering the
  // engine's hardcoded default (a fixed muted crimson) regardless of theme.
  // Fallbacks match styles.css's dark-mode :root values, same convention
  // scene-opening.js's themeColor() already uses.
  window.getPixieThemeColors = function () {
    var s = getComputedStyle(document.documentElement);
    var core = (s.getPropertyValue('--brand-light') || '').trim();
    var accent = (s.getPropertyValue('--accent') || '').trim();
    return { coreColor: core || '#C24E4E', accentColor: accent || '#FFD166' };
  };

  function phaseEnergy(phase, progress) {
    switch (phase) {
      case 'executing': return 1.2 + (progress / 100) * 0.8;
      case 'planning':  return 1.1;
      case 'review':    return 1.0;
      case 'completed': return 1.3;
      case 'failed':    return 0.5;
      case 'cancelled': return 0.4;
      default:          return 0.8;
    }
  }

  function buildCorePath(ctx, shape, cx, cy, r) {
    ctx.beginPath();
    switch (shape) {
      case 'hexagon': {
        for (var i = 0; i < 6; i++) {
          var a = (i / 6) * Math.PI * 2 - Math.PI / 6;
          var x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
          i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.closePath(); break;
      }
      case 'diamond': {
        ctx.moveTo(cx, cy - r); ctx.lineTo(cx + r * 0.8, cy);
        ctx.lineTo(cx, cy + r); ctx.lineTo(cx - r * 0.8, cy);
        ctx.closePath(); break;
      }
      case 'shield': {
        ctx.moveTo(cx, cy - r);
        ctx.quadraticCurveTo(cx + r, cy - r * 0.6, cx + r, cy);
        ctx.quadraticCurveTo(cx + r, cy + r * 0.4, cx, cy + r);
        ctx.quadraticCurveTo(cx - r, cy + r * 0.4, cx - r, cy);
        ctx.quadraticCurveTo(cx - r, cy - r * 0.6, cx, cy - r);
        ctx.closePath(); break;
      }
      default: ctx.arc(cx, cy, r, 0, Math.PI * 2); break;
    }
  }

  function springStep(pos, target, velocity, stiffness, damping) {
    var force = (target - pos) * stiffness;
    var nextVelocity = (velocity + force) * damping;
    return { value: pos + nextVelocity, velocity: nextVelocity };
  }

  // ── Public init ──────────────────────────────────────────────────────
  // opts: { size, mode, phase, progress, archetype, temperament, theme,
  //         preferences: { coreShape, particleDensity, animationStyle, ringCount } }
  window.initPixieCompanion = function (canvas, opts) {
    opts = opts || {};
    var size        = opts.size || 88;
    var mode        = opts.mode || 'ambient';
    var phase       = opts.phase || 'idle';
    var progress    = opts.progress || 0;
    var archetype   = opts.archetype || 'archivist';
    var temperament = opts.temperament || 'idle';
    var theme       = opts.theme || null; // { coreColor, accentColor } hex strings
    var prefs       = opts.preferences || {};

    var ctx = canvas.getContext('2d');
    if (!ctx) return;

    var dpr = window.devicePixelRatio || 1;
    var cssW = size * 2.5, cssH = size * 2.5;
    canvas.width = cssW * dpr;
    canvas.height = cssH * dpr;
    canvas.style.width = cssW + 'px';
    canvas.style.height = cssH + 'px';

    var drawScale = size / 120;
    ctx.scale(dpr * drawScale, dpr * drawScale);

    var w = 120 * 2.5, h = 120 * 2.5;
    var cx = w / 2, cy = h / 2;

    var nucleusPos  = { x: cx, y: cy };
    var targetPos   = { x: cx, y: cy };
    var velocity    = { x: 0, y: 0 };
    var mouse       = { x: 0, y: 0, active: false };
    var frame       = 0;

    var density   = prefs.particleDensity || 'normal';
    var baseCount = archetype === 'oracle' ? 52 : archetype === 'forgekeeper' ? 24 : 40;
    var numPart   = density === 'dense' ? Math.floor(baseCount * 1.5) : density === 'sparse' ? Math.floor(baseCount * 0.6) : baseCount;

    var particles = [];
    for (var i = 0; i < numPart; i++) {
      particles.push({
        angle: (Math.PI * 2 * i) / numPart + Math.random() * 0.5,
        radius: 28 + Math.random() * 44, baseRadius: 28 + Math.random() * 44,
        speed: 0.003 + Math.random() * 0.009, size: 1 + Math.random() * 2.5,
        opacity: 0.3 + Math.random() * 0.5, hueShift: Math.random() * 30 - 15,
        phase: Math.random() * Math.PI * 2, wobble: 0.5 + Math.random() * 1.5,
      });
    }

    function onMouseMove(e) {
      var r = canvas.getBoundingClientRect();
      mouse.x = (e.clientX - r.left) / drawScale;
      mouse.y = (e.clientY - r.top) / drawScale;
      mouse.active = true;
    }
    function onMouseLeave() { mouse.active = false; }
    canvas.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('mouseleave', onMouseLeave);

    var animId;

    function renderFrame() {
      frame++;
      ctx.clearRect(0, 0, w, h);

      var t = frame * 0.01;
      var arcEnergy  = ARCHETYPE_ENERGY[archetype] || ARCHETYPE_ENERGY.archivist;
      var modeEnergy = phaseEnergy(phase, progress) * (TEMPERAMENT_ENERGY_MULT[temperament] || 1.0);
      var breatheSp  = arcEnergy.breatheSpeed * (phase === 'executing' ? 1.6 : 1.0);
      var particleSp = arcEnergy.speedMult * (mode === 'active' ? 1.8 : 1.0);

      var cR = theme ? parseInt(theme.coreColor.slice(1, 3), 16) : 167;
      var cG = theme ? parseInt(theme.coreColor.slice(3, 5), 16) : 65;
      var cB = theme ? parseInt(theme.coreColor.slice(5, 7), 16) : 51;
      var aR = theme ? parseInt(theme.accentColor.slice(1, 3), 16) : 0;
      var aG = theme ? parseInt(theme.accentColor.slice(3, 5), 16) : 93;
      var aB = theme ? parseInt(theme.accentColor.slice(5, 7), 16) : 154;
      var baseHue = Math.round(Math.atan2(cG - 128, cR - 128) * (180 / Math.PI) + 180);

      if (mouse.active) {
        var dx = mouse.x - cx, dy = mouse.y - cy;
        var dist = Math.sqrt(dx * dx + dy * dy);
        var maxD = mode === 'tools' ? 30 : 20, infl = Math.min(dist / 100, 1);
        if (dist > 0.1) { targetPos.x = cx + (dx / dist) * maxD * infl; targetPos.y = cy + (dy / dist) * maxD * infl; }
      } else {
        var drift = phase === 'executing' ? 6 : 3;
        targetPos.x = cx + Math.sin(t * 0.5) * drift;
        targetPos.y = cy + Math.cos(t * 0.7) * drift;
      }
      var spring = ARCHETYPE_SPRING[archetype] || ARCHETYPE_SPRING.archivist;
      var stiffness = spring.stiffness * (mode === 'active' ? 1.3 : 1.0);

      var sx = springStep(nucleusPos.x, targetPos.x, velocity.x, stiffness, spring.damping);
      var sy = springStep(nucleusPos.y, targetPos.y, velocity.y, stiffness, spring.damping);
      nucleusPos.x = sx.value; velocity.x = sx.velocity;
      nucleusPos.y = sy.value; velocity.y = sy.velocity;
      var nx = nucleusPos.x, ny = nucleusPos.y;

      var moveSpeed = Math.sqrt(sx.velocity * sx.velocity + sy.velocity * sy.velocity);
      var moveAngle = Math.atan2(sy.velocity, sx.velocity);
      var wakeStretch  = 1 + Math.min(moveSpeed * 0.45, 0.35);
      var wakeCompress = 1 / wakeStretch;

      var mouseDist = 999;
      if (mouse.active) { var mdx = mouse.x - nx, mdy = mouse.y - ny; mouseDist = Math.sqrt(mdx * mdx + mdy * mdy); }
      var reactivity = Math.max(0, 1 - mouseDist / 150);

      ctx.save();
      ctx.translate(nx, ny); ctx.rotate(moveAngle); ctx.scale(wakeStretch, wakeCompress);
      ctx.rotate(-moveAngle); ctx.translate(-nx, -ny);

      var glowR = (100 + reactivity * 30) * modeEnergy;
      var og = ctx.createRadialGradient(nx, ny, 0, nx, ny, glowR);
      og.addColorStop(0, 'rgba(' + cR + ',' + cG + ',' + cB + ',' + (0.06 + reactivity * 0.08) * modeEnergy + ')');
      og.addColorStop(0.4, 'rgba(' + cR + ',' + cG + ',' + cB + ',' + (0.03 + reactivity * 0.04) * modeEnergy + ')');
      og.addColorStop(0.7, 'rgba(' + aR + ',' + aG + ',' + aB + ',' + (0.02 + reactivity * 0.03) * modeEnergy + ')');
      og.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = og; ctx.fillRect(0, 0, w, h);

      var shape = prefs.coreShape || 'circle';
      var breathe = Math.sin(t * breatheSp) * 0.15 + 1;
      var coreSz = (18 + reactivity * 8) * breathe * (modeEnergy * 0.85 + 0.15);

      for (var layer = 3; layer >= 0; layer--) {
        var lSz = coreSz + layer * (8 + reactivity * 4);
        var grad = ctx.createRadialGradient(nx, ny, 0, nx, ny, lSz);
        var alpha = ((0.12 - layer * 0.025) + reactivity * 0.06) * modeEnergy;
        if (layer % 2 === 0) {
          grad.addColorStop(0, 'rgba(' + cR + ',' + cG + ',' + cB + ',' + alpha * 1.5 + ')');
          grad.addColorStop(0.6, 'rgba(' + cR + ',' + cG + ',' + cB + ',' + alpha * 0.8 + ')');
          grad.addColorStop(1, 'rgba(' + cR + ',' + cG + ',' + cB + ',0)');
        } else {
          grad.addColorStop(0, 'rgba(255,209,102,' + alpha + ')');
          grad.addColorStop(0.6, 'rgba(' + aR + ',' + aG + ',' + aB + ',' + alpha * 0.5 + ')');
          grad.addColorStop(1, 'rgba(' + aR + ',' + aG + ',' + aB + ',0)');
        }
        ctx.fillStyle = grad; buildCorePath(ctx, shape, nx, ny, lSz); ctx.fill();
      }

      var attentionStrength = reactivity * (mode === 'tools' ? 0.55 : 0.4);
      var gazeX = mouse.active ? nx + (mouse.x - nx) * attentionStrength * 0.15 : nx;
      var gazeY = mouse.active ? ny + (mouse.y - ny) * attentionStrength * 0.15 : ny;

      var coreGrad = ctx.createRadialGradient(gazeX, gazeY, 0, nx, ny, coreSz);
      coreGrad.addColorStop(0, 'rgba(255,230,200,' + (0.9 + reactivity * 0.1) + ')');
      coreGrad.addColorStop(0.3, 'rgba(255,180,120,' + (0.6 + reactivity * 0.2) + ')');
      coreGrad.addColorStop(0.7, 'rgba(' + cR + ',' + cG + ',' + cB + ',' + (0.3 + reactivity * 0.15) + ')');
      coreGrad.addColorStop(1, 'rgba(' + cR + ',' + cG + ',' + cB + ',0)');
      ctx.fillStyle = coreGrad; buildCorePath(ctx, shape, nx, ny, coreSz); ctx.fill();

      if (phase === 'executing' && progress > 0) {
        var rR = coreSz + 22, sa = -Math.PI / 2, ea = sa + (progress / 100) * Math.PI * 2;
        ctx.strokeStyle = 'rgba(' + cR + ',' + cG + ',' + cB + ',0.4)'; ctx.lineWidth = 2; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.arc(nx, ny, rR, sa, ea); ctx.stroke();
        ctx.strokeStyle = 'rgba(255,255,255,0.04)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(nx, ny, rR, 0, Math.PI * 2); ctx.stroke();
      }

      ctx.restore();

      var animation = prefs.animationStyle || 'orbit';
      var connDist = arcEnergy.connectionDist;
      particles.forEach(function (p, i) {
        var wF = arcEnergy.wobbleMult;
        if (animation === 'static') { p.angle += p.speed * 0.1; }
        else if (animation === 'wave') { p.angle += p.speed * particleSp; p.radius = p.baseRadius + Math.sin(t * 1.5 + p.phase) * 12 + reactivity * 10; }
        else if (animation === 'pulse') { p.angle += p.speed * particleSp; p.radius = p.baseRadius + Math.sin(t * 2.0) * 8 + Math.sin(t * p.wobble * wF + p.phase) * 4 + reactivity * 12; }
        else if (animation === 'neural') { p.angle += p.speed * 0.6; p.radius = p.baseRadius + Math.sin(t * p.wobble * wF + p.phase) * 10 + reactivity * 20; }
        else { p.angle += p.speed * particleSp * (1 + reactivity * 1.5); var wo = Math.sin(t * p.wobble * wF + p.phase) * 6; p.radius += (p.baseRadius + wo + reactivity * 15 - p.radius) * 0.05; }

        var px = nx + Math.cos(p.angle) * p.radius, py = ny + Math.sin(p.angle) * p.radius;
        var pSz = p.size * (1 + reactivity * 0.6) * (modeEnergy * 0.7 + 0.3);
        var hue = baseHue + p.hueShift + reactivity * 20, sat = 70 + reactivity * 20, lght = 55 + reactivity * 15;

        ctx.save(); ctx.globalAlpha = p.opacity * (0.6 + reactivity * 0.4) * modeEnergy;
        var pG = ctx.createRadialGradient(px, py, 0, px, py, pSz * 3);
        pG.addColorStop(0, 'hsla(' + hue + ',' + sat + '%,' + lght + '%,0.8)');
        pG.addColorStop(0.5, 'hsla(' + hue + ',' + sat + '%,' + (lght - 15) + '%,0.3)');
        pG.addColorStop(1, 'hsla(' + hue + ',' + sat + '%,' + (lght - 30) + '%,0)');
        ctx.fillStyle = pG; ctx.beginPath(); ctx.arc(px, py, pSz * 3, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'hsla(' + hue + ',' + sat + '%,' + (lght + 20) + '%,0.9)';
        ctx.beginPath(); ctx.arc(px, py, pSz * 0.6, 0, Math.PI * 2); ctx.fill();
        ctx.restore();

        var lineFD = animation === 'neural' ? connDist * 1.2 : connDist;
        var next = particles[(i + 1) % particles.length];
        var npx = nx + Math.cos(next.angle) * next.radius, npy = ny + Math.sin(next.angle) * next.radius;
        var lD = Math.sqrt(Math.pow(px - npx, 2) + Math.pow(py - npy, 2));
        if (lD < lineFD) {
          ctx.strokeStyle = 'rgba(' + cR + ',' + cG + ',' + cB + ',' + (1 - lD / lineFD) * 0.1 * (1 + reactivity) + ')';
          ctx.lineWidth = 0.5; ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(npx, npy); ctx.stroke();
        }
        if (animation === 'neural' && i % 4 === 0) {
          var tgt = particles[(i + 5) % particles.length];
          var tpx = nx + Math.cos(tgt.angle) * tgt.radius, tpy = ny + Math.sin(tgt.angle) * tgt.radius;
          var tD = Math.sqrt(Math.pow(px - tpx, 2) + Math.pow(py - tpy, 2));
          if (tD < connDist * 1.5) { ctx.strokeStyle = 'rgba(' + aR + ',' + aG + ',' + aB + ',' + (1 - tD / (connDist * 1.5)) * 0.06 + ')'; ctx.lineWidth = 0.4; ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(tpx, tpy); ctx.stroke(); }
        }
      });

      var ringCount = prefs.ringCount || 2;
      var ringPhase = (t * (phase === 'executing' ? 1.2 : 0.8)) % (Math.PI * 2);
      var ringAlpha = Math.sin(ringPhase) * 0.5 + 0.5;

      ctx.save();
      ctx.translate(nx, ny); ctx.rotate(moveAngle); ctx.scale(wakeStretch, wakeCompress);
      ctx.rotate(-moveAngle); ctx.translate(-nx, -ny);
      for (var r = 0; r < ringCount; r++) {
        var rSz = 55 + r * 18 + ringAlpha * (12 - r * 3) + reactivity * (18 - r * 4);
        ctx.strokeStyle = 'rgba(' + cR + ',' + cG + ',' + cB + ',' + (0.05 * ringAlpha * (1 + reactivity) / (r + 1)) + ')';
        ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(nx, ny, rSz, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.restore();

      // No reputation echoes rendered — no signed-in user, no history yet.
    }

    // isIntersecting starts true so the very first paint (below) and any
    // frames before the IntersectionObserver's first async callback fires
    // still render — a brief, harmless grace period, not a correctness gap.
    var isIntersecting = true;
    function animate() {
      renderFrame();
      if (isIntersecting) {
        animId = requestAnimationFrame(animate);
      } else {
        animId = null; // lets the observer's callback know it's safe to restart the chain
      }
    }

    animate();
    var reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reducedMotion) {
      cancelAnimationFrame(animId); // one frame drawn, then hold
      animId = null;
    } else if (typeof IntersectionObserver !== 'undefined') {
      // The continuous ambient animation (spring physics, particle field,
      // orbit rings) ran unconditionally at 60fps even while the canvas was
      // scrolled completely out of view — both instances on this page
      // (companion-intro, scene-agent) do this simultaneously by design,
      // doubling the always-on cost. Found as a top-5 contributor in the
      // pre-production audit's scroll-jank CPU profile. update() (below) is
      // NOT gated by this — it always applies immediately regardless of
      // visibility, so state changes (theme toggle, scene-agent's per-step
      // updates) are never lost; the moment the canvas scrolls back into
      // view, animate() resumes and its very next renderFrame() call reads
      // the already-current closure state, so nothing needs to be
      // re-synced on resume.
      var pixieVisibilityObserver = new IntersectionObserver(function (entries) {
        isIntersecting = entries[entries.length - 1].isIntersecting;
        if (isIntersecting && !animId) {
          animId = requestAnimationFrame(animate);
        }
      }, { threshold: 0 });
      pixieVisibilityObserver.observe(canvas);
    }

    // update() lets a call site change mode/phase/progress/temperament
    // (and archetype, though changing that won't retroactively resize the
    // particle field already built at init) after the fact, without a
    // second init/teardown cycle. archetype/mode/phase/progress/temperament
    // are the same closure vars renderFrame() already reads every frame, so
    // reassigning them here is normally all that's needed — no restart
    // required. Exception: under reduced motion, the RAF loop that would
    // have picked these up on its next frame was already canceled after
    // the first paint (see above), so update() has to trigger that repaint
    // itself here — otherwise every later update() call (the theme-toggle
    // live-update, scene-agent's per-step changes) would silently do
    // nothing visible, leaving the canvas frozen on its init-time state
    // (found in the pre-production audit).
    function update(patch) {
      patch = patch || {};
      if (patch.mode !== undefined) mode = patch.mode;
      if (patch.phase !== undefined) phase = patch.phase;
      if (patch.progress !== undefined) progress = patch.progress;
      if (patch.archetype !== undefined) archetype = patch.archetype;
      if (patch.temperament !== undefined) temperament = patch.temperament;
      if (patch.theme !== undefined) theme = patch.theme;
      if (reducedMotion) renderFrame();
    }

    return {
      destroy: function () {
        cancelAnimationFrame(animId);
        canvas.removeEventListener('mousemove', onMouseMove);
        canvas.removeEventListener('mouseleave', onMouseLeave);
        if (pixieVisibilityObserver) pixieVisibilityObserver.disconnect();
      },
      update: update,
    };
  };
})();
