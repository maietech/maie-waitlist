// telemetry.js — anonymous session id, UTM/referral capture, and a
// fire-and-forget event beacon. Loaded first so story-scroll.js,
// pixie-companion.js, continuum.js, and the inline form script can all
// call window.MaieTelemetry.track(name, metadata) without checking for it.
//
// Nothing here blocks rendering or the submission flow: track() never
// throws, and attribution capture is a couple of sessionStorage reads on
// script load. See form-overview.md items 8-10 and the "Privacy
// Recommendation" in the second demand-engine note — no fingerprinting,
// no device signals beyond what the URL/referrer already carry, and the
// session id is never sent anywhere except this site's own /api/events
// and /api/waitlist.

(function () {
  var SID_KEY = 'maie_sid';
  var ATTR_KEY = 'maie_attribution';

  function makeId() {
    if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
    // Fallback for older browsers — good enough for a non-cryptographic
    // session key, not used for anything security-sensitive.
    return 'sid-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
  }

  function getSessionId() {
    try {
      var existing = sessionStorage.getItem(SID_KEY);
      if (existing) return existing;
      var id = makeId();
      sessionStorage.setItem(SID_KEY, id);
      return id;
    } catch (e) {
      // Storage disabled/unavailable (private mode, etc.) — fall back to an
      // in-memory id for this page load only.
      return makeId();
    }
  }

  // Captured once per browser session, on whichever page the visitor
  // actually lands on — a later internal navigation (e.g. skip-link,
  // theme toggle) shouldn't overwrite the original ?utm_source=... that
  // brought them here.
  function captureAttribution() {
    try {
      var stored = sessionStorage.getItem(ATTR_KEY);
      if (stored) return JSON.parse(stored);
    } catch (e) { /* fall through and recompute */ }

    var params = new URLSearchParams(window.location.search);
    var attribution = {
      utm_source: params.get('utm_source') || null,
      utm_medium: params.get('utm_medium') || null,
      utm_campaign: params.get('utm_campaign') || null,
      utm_content: params.get('utm_content') || null,
      utm_term: params.get('utm_term') || null,
      referral_code: params.get('ref') || null,
      referrer_url: document.referrer ? document.referrer.slice(0, 500) : null,
      landing_path: (window.location.pathname + window.location.search).slice(0, 500),
    };

    try { sessionStorage.setItem(ATTR_KEY, JSON.stringify(attribution)); } catch (e) { /* ignore */ }
    return attribution;
  }

  var sessionId = getSessionId();
  var attribution = captureAttribution();

  // Best-effort funnel telemetry. Uses sendBeacon so it survives page
  // unload (e.g. the moment `portal_redirected` fires); falls back to a
  // keepalive fetch for browsers/contexts where sendBeacon isn't
  // available. Never throws, never retries, never blocks the caller.
  function track(eventName, metadata) {
    var payload = {
      session_id: sessionId,
      event: eventName,
      path: window.location.pathname,
      referrer: attribution.referrer_url,
      metadata: metadata || undefined,
    };

    try {
      var body = JSON.stringify(payload);
      if (navigator.sendBeacon) {
        var blob = new Blob([body], { type: 'application/json' });
        navigator.sendBeacon('/api/events', blob);
      } else {
        fetch('/api/events', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: body,
          keepalive: true,
        }).catch(function () { /* telemetry is best-effort */ });
      }
    } catch (e) {
      // Never let a telemetry failure surface anywhere.
    }
  }

  window.MaieTelemetry = {
    sessionId: sessionId,
    attribution: attribution,
    track: track,
  };

  track('landing_view');
})();
