// ENSO climate dashboard: Home page (assets/pages/home.html). Introduction and links to the other pages.
(() => {
'use strict';
const D = window.DASH;
document.querySelectorAll('[data-go]').forEach(b => b.addEventListener('click', () => D.go(b.dataset.go)));
D.initHeader(() => {});
})();
