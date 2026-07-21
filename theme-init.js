// theme-init.js — LAYER 0.5 theme seed (waitlist)
// Must load synchronously in <head>, before the inline <style> block,
// so data-theme is on <html> before [data-theme="light"] rules apply.
// Same localStorage key as the portal ("maie-theme") for a consistent
// feel across MAIE properties, even though these are separate
// Cloudflare Pages deployments with separate storage.
(function () {
  try {
    var stored = localStorage.getItem('maie-theme');
    document.documentElement.setAttribute('data-theme', stored === 'light' ? 'light' : 'dark');
  } catch (e) {
    document.documentElement.setAttribute('data-theme', 'dark');
  }
})();
