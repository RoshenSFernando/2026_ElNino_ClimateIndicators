// ENSO climate dashboard: combined page (ENSO_Dashboard.html, built by Scripts/Step13_CombinedDashboard.R).
// Each page is stored in its frame's data-srcdoc and loaded the first time its tab is chosen.
(() => {
'use strict';
const D = window.DASH;
const PAGES = ['home', 'global', 'country', 'disasters', 'outlook', 'methods'];
const frames = Object.fromEntries(PAGES.map(p => [p, document.querySelector(`iframe[name="${p}"]`)]));
const links = [...document.querySelectorAll('.shell-head nav a')];
const pending = {};

// Called by assets/common.js inside the frames.
window.ENSO_SHELL = {
  take: page => { const h = pending[page] || ''; delete pending[page]; return h; },
  theme: () => document.documentElement.getAttribute('data-theme'),
  open: (page, hash) => show(page, hash)
};

function show(page, hash = '') {
  if (!frames[page]) page = 'home';
  const f = frames[page];
  if (!f.hasAttribute('srcdoc')) { pending[page] = hash; f.srcdoc = f.dataset.srcdoc; }
  else if (hash) f.contentWindow.location.hash = hash;
  PAGES.forEach(p => frames[p].classList.toggle('active', p === page));
  links.forEach(a => { if (a.dataset.page === page) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
  if (location.hash !== `#${page}`) history.replaceState(null, '', `#${page}`);
}

// The theme control is in the tab bar; loaded pages follow it.
D.initHeader(() => PAGES.forEach(p => {
  try { const w = frames[p].contentWindow; if (w && w.DASH && w.DASH.setTheme) w.DASH.setTheme(window.ENSO_SHELL.theme()); } catch (e) {}
}));
links.forEach(a => a.addEventListener('click', e => { e.preventDefault(); show(a.dataset.page); }));
window.addEventListener('hashchange', () => show(location.hash.slice(1)));
show(location.hash.slice(1));
})();
