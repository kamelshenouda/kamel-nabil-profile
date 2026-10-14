/* Visit alerts for Kamel's sites (kamelnabil.com and its subdomains).
   Pings kamelnabil.com/api/notify when someone opens a site, then sends a
   reading summary when they leave or switch away. A multi-page visit counts
   as one visit. Visiting any site once with ?notrack turns alerts off for
   that browser on every site. Load with: <script src="https://kamelnabil.com/notify.js" defer></script> */
(function () {
  if (!/(^|\.)kamelnabil\.com$/.test(location.hostname)) return;

  var ENDPOINT = 'https://kamelnabil.com/api/notify';
  var OPT_OUT = 'kn_notrack=1';
  var KEY = 'kn-visit';

  try {
    if (/[?&]notrack\b/.test(location.search)) {
      document.cookie = OPT_OUT + '; domain=kamelnabil.com; path=/; max-age=315360000; secure; samesite=lax';
    }
    if (document.cookie.indexOf(OPT_OUT) !== -1 || localStorage.getItem('kn-notrack')) return;
  } catch (e) { return; }

  var visit = null;
  try { visit = JSON.parse(sessionStorage.getItem(KEY) || 'null'); } catch (e) {}
  var isNew = !visit;
  if (isNew) visit = { start: Date.now(), pages: [], sections: [], furthest: -1, furthestTitle: '', sent: null };
  var page = (document.title || location.pathname).slice(0, 80);
  if (visit.pages[visit.pages.length - 1] !== page) visit.pages.push(page);

  function save() { try { sessionStorage.setItem(KEY, JSON.stringify(visit)); } catch (e) {} }
  function send(data) { try { navigator.sendBeacon(ENDPOINT, JSON.stringify(data)); } catch (e) {} }
  save();

  if (isNew) send({ type: 'open', page: page, ref: document.referrer });

  // Pages with collapsible sections (.tg, e.g. the Alpaca take-home): remember
  // which sections were opened and the furthest one in reading order.
  var toggles = Array.prototype.slice.call(document.querySelectorAll('.tg'));
  if (toggles.length) {
    new MutationObserver(function (muts) {
      muts.forEach(function (m) {
        var tg = m.target;
        if (!tg.id || !tg.classList.contains('cur')) return;
        if (visit.sections.indexOf(tg.id) === -1) visit.sections.push(tg.id);
        var i = toggles.indexOf(tg);
        if (i > visit.furthest) {
          var t = tg.querySelector(':scope > .tg-h .tg-t');
          visit.furthest = i;
          visit.furthestTitle = (t ? t.textContent : tg.id).replace(/\s+/g, ' ').trim().slice(0, 80);
        }
        save();
      });
    }).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['class'] });
  }

  // Moving to another page of the same site is not "leaving".
  var navigating = false;
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[href]');
    if (a && a.host === location.host && a.pathname !== location.pathname && !a.target) navigating = true;
  }, true);
  window.addEventListener('pageshow', function () { navigating = false; });

  // Summary when the tab is hidden or closed: always the first time, then
  // only after more reading (a new page or section) or another minute.
  function progress() {
    if (navigating) return;
    var secs = Math.round((Date.now() - visit.start) / 1000);
    var depth = visit.pages.length + visit.sections.length;
    if (visit.sent && depth <= visit.sent.depth && secs - visit.sent.secs < 60) return;
    visit.sent = { secs: secs, depth: depth };
    save();
    send({
      type: 'progress', secs: secs, pages: visit.pages.slice(-5), pageCount: visit.pages.length,
      sections: visit.sections.length, furthest: visit.furthestTitle
    });
  }
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') progress();
  });
  window.addEventListener('pagehide', progress);
})();
