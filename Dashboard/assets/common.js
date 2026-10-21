// ENSO climate dashboard: shared code for all pages (home, global variations, country deep dives, disasters, outlook,
// methods) and for the combined page.
// Loaded before the data files, so it also defines the window.ENSO registry those files call.
window.ENSO = {
  countries: {}, waiting: {},
  setMeta(m) { this.meta = m; },
  setGlobal(g) { this.global = g; },
  setDisasters(d) { this.disasters = d; },
  setOutlook(o) { this.outlook = o; },
  setAdm1Geo(g) { this.adm1geo = g; },
  addCountry(c) {
    this.countries[c.iso] = c;
    (this.waiting[c.iso] || []).forEach(f => f(c));
    delete this.waiting[c.iso];
  }
};

window.DASH = (() => {
  'use strict';
  const D = {};

  // ---------- Combined dashboard ----------
  // In ENSO_Dashboard.html each page runs in its own frame, named after the page. The frame hides its own header
  // (the combined page has one), takes the theme from the combined page and can be handed a starting hash.
  D.shell = null;
  try { if (window.frameElement && window.parent.ENSO_SHELL) D.shell = window.parent.ENSO_SHELL; } catch (e) {}
  if (D.shell) {
    document.documentElement.classList.add('embedded');
    const h = D.shell.take(window.name);
    if (h) location.hash = h;
    // Links within the page ('#section') would otherwise resolve against the combined page and reload it in the frame.
    document.addEventListener('click', e => {
      const a = e.target.closest && e.target.closest('a[href^="#"]');
      if (!a) return;
      e.preventDefault();
      const t = document.getElementById(decodeURIComponent(a.getAttribute('href').slice(1)));
      if (t) t.scrollIntoView({ behavior: 'smooth' });
    });
  }
  // Keeps the page state in the hash. A relative '#...' would resolve against the combined page's address inside a
  // frame, which the browser refuses, so the frame's own address is given in full.
  D.replaceHash = h => history.replaceState(null, '', D.shell ? `about:srcdoc${h}` : h);
  // Opens another page: a tab of the combined dashboard, or the page's own file.
  D.go = (page, hash = '') => {
    if (D.shell) D.shell.open(page, hash);
    else location.href = `${page}.html${hash}`;
  };

  // ---------- Constants ----------
  D.VAR_ORDER = ['TMP', 'TMX', 'TMN', 'DTR', 'WBGT', 'PRE', 'WET', 'CLD', 'VAP', 'PET'];
  // +1: a positive value is a warmer/drier signal (red); -1: a positive value is cooler/wetter (blue).
  D.WARM_DRY = { TMP: 1, TMX: 1, TMN: 1, DTR: 1, PET: 1, WBGT: 1, PRE: -1, WET: -1, CLD: -1, VAP: -1 };
  D.PHASES = [['EN', 'El Niño'], ['NEU', 'Neutral'], ['LN', 'La Niña']];
  D.BL = { B6190: '1961–1990', B9120: '1991–2020' };
  D.MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  D.init = M => {
    D.VARS = {};
    const vi = M.variables;
    vi.Variable.forEach((v, i) => D.VARS[v] = { code: v, name: vi.Name[i], unit: vi.Unit[i], agg: vi.Aggregation[i], pct: vi.Percent_Anomaly[i] });
    D.PERIODS = M.periods.code;
    D.PLABEL = Object.fromEntries(M.periods.code.map((c, i) => [c, M.periods.label[i]]));
    D.periodName = p => p === 'ENSO_YR' ? 'ENSO year (Jun–May)' : D.PLABEL[p];
    D.countryName = iso => M.countries.name[M.countries.iso.indexOf(iso)];
  };

  // ---------- Formatting ----------
  D.$ = s => document.querySelector(s);
  D.css = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  D.fmt = (x, d = 2) => (x === null || x === undefined || Number.isNaN(x)) ? '–' : (x > 0 ? '+' : x < 0 ? '−' : '') + Math.abs(x).toFixed(d);
  D.fmtU = (x, d = 2) => (x === null || x === undefined || Number.isNaN(x)) ? '–' : Number(x).toFixed(d);
  D.fmtP = p => p === null || p === undefined ? '–' : p < 0.001 ? '<0.001' : p.toFixed(3);
  D.pTxt = (lbl, p) => p === null || p === undefined ? `${lbl} –` : p < 0.001 ? `${lbl} < 0.001` : `${lbl} = ${p.toFixed(3)}`;
  D.el = (tag, attrs = {}, text) => {
    const e = document.createElement(tag);
    Object.entries(attrs).forEach(([k, v]) => e.setAttribute(k, v));
    if (text !== undefined) e.textContent = text;
    return e;
  };
  D.rgba = (hex, a) => {
    const h = hex.replace('#', '');
    const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  };
  D.phaseColor = ph => ph === 'EN' ? D.css('--en') : ph === 'LN' ? D.css('--ln') : D.css('--neu');
  D.phaseName = ph => ph === 'EN' ? 'El Niño' : ph === 'LN' ? 'La Niña' : 'Neutral';
  D.median = a => { const s = a.filter(x => x !== null && x !== undefined && !Number.isNaN(x)).sort((x, y) => x - y); if (!s.length) return null; const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
  D.dateOf = ix => `${Math.floor(ix / 12)}-${String(ix % 12 + 1).padStart(2, '0')}-15`;
  D.monthLabel = ix => `${D.MONTHS[ix % 12]} ${Math.floor(ix / 12)}`;

  // Title Case for headings, chart titles, axis titles and legends: every word capitalised except articles,
  // conjunctions and short prepositions (plus "with" and "from"), unless first, last or after a colon; each part of a
  // hyphenated word is treated as a word. Words that already contain capitals (ENSO, RONI, JJA, UN), units (mm, km²)
  // and statistical symbols (n, p, q, r, h) are left as they are.
  const MINOR = new Set(['a', 'an', 'the', 'and', 'but', 'or', 'nor', 'for', 'so', 'yet', 'as', 'at', 'by', 'in', 'of', 'off', 'on', 'per', 'to', 'up', 'via', 'vs', 'with', 'from']);
  const KEEP = new Set(['mm', 'mm/day', 'km', 'km²', 'km/h', 'n', 'p', 'q', 'r', 'h']);
  D.tc = text => {
    const words = String(text).split(' ');
    return words.map((w, i) => {
      const edge = i === 0 || i === words.length - 1 || /[:–—]$/.test(words[i - 1]);
      return w.split('-').map((part, j) => {
        const m = part.match(/^([^A-Za-zÀ-ÿ]*)([A-Za-zÀ-ÿ].*)$/);
        if (!m) return part;
        const pre = m[1], core = m[2];
        if (/[A-Z]/.test(core)) return part;
        if (KEEP.has(core.toLowerCase().replace(/[^a-z²/]/g, ''))) return part;
        if (!edge && j === 0 && MINOR.has(core.replace(/[^a-z]/g, ''))) return part;
        return pre + core[0].toUpperCase() + core.slice(1);
      }).join('-');
    }).join(' ');
  };

  // ---------- Plotly ----------
  D.baseLayout = (extra = {}) => {
    const ink2 = D.css('--ink-2'), muted = D.css('--muted'), grid = D.css('--grid'), axis = D.css('--axis');
    const ax = { gridcolor: grid, linecolor: axis, zerolinecolor: axis, tickfont: { color: muted, size: 11 }, title: { font: { color: ink2, size: 12 } }, automargin: true };
    const layout = {
      paper_bgcolor: 'rgba(0,0,0,0)', plot_bgcolor: 'rgba(0,0,0,0)',
      font: { family: 'system-ui, -apple-system, "Segoe UI", sans-serif', color: ink2, size: 12 },
      margin: { l: 56, r: 16, t: 10, b: 40 },
      xaxis: Object.assign({}, ax), yaxis: Object.assign({}, ax),
      showlegend: false,
      hoverlabel: { bgcolor: D.css('--surface'), bordercolor: D.css('--axis'), font: { color: D.css('--ink'), size: 12 } },
      bargap: 0.18
    };
    for (const [k, v] of Object.entries(extra)) {
      if (/^[xy]axis\d*$/.test(k) && typeof v === 'object') layout[k] = Object.assign({}, ax, layout[k] || {}, v, { title: Object.assign({}, ax.title, v.title || {}) });
      else layout[k] = v;
    }
    return layout;
  };
  D.PCONF = { displaylogo: false, responsive: true, scrollZoom: false, modeBarButtonsToRemove: ['select2d', 'lasso2d', 'autoScale2d', 'toggleSpikelines', 'hoverClosestCartesian', 'hoverCompareCartesian', 'zoomInGeo', 'zoomOutGeo', 'resetGeo', 'hoverClosestGeo', 'pan2d'], toImageButtonOptions: { format: 'png', scale: 2 } };
  // Flat world map (equirectangular) that cannot be dragged, rotated or zoomed; clicking countries still works.
  D.mapLayout = () => D.baseLayout({
    margin: { l: 0, r: 0, t: 0, b: 0 }, dragmode: false,
    geo: { projection: { type: 'equirectangular' }, showframe: false, showcoastlines: false, bgcolor: 'rgba(0,0,0,0)', showland: true,
      landcolor: D.css('--grid'), showcountries: false, lataxis: { range: [-58, 84] }, lonaxis: { range: [-180, 180] } }
  });
  // Every chart goes through D.plot, so axis titles, legend entries and colour-bar labels get Title Case here.
  D.plot = (id, traces, layout) => {
    D.clearEmpty(id);
    Object.keys(layout).forEach(k => {
      if (/^[xy]axis\d*$/.test(k) && layout[k].title && layout[k].title.text) layout[k].title.text = D.tc(layout[k].title.text);
    });
    traces.forEach(t => {
      if (t.name) t.name = D.tc(t.name);
      if (t.colorbar) {
        if (t.colorbar.ticktext) t.colorbar.ticktext = t.colorbar.ticktext.map(x => D.tc(String(x)));
        if (t.colorbar.title && t.colorbar.title.text) t.colorbar.title.text = D.tc(t.colorbar.title.text);
      }
    });
    Plotly.react(id, traces, layout, D.PCONF);
  };
  // Diverging: gray midpoint, equal steps on each arm, so small values stay close to neutral.
  D.divergingScale = () => [[0, D.css('--div-neg-3')], [0.18, D.css('--div-neg-2')], [0.36, D.css('--div-neg-1')], [0.5, D.css('--div-mid')], [0.64, D.css('--div-pos-1')], [0.82, D.css('--div-pos-2')], [1, D.css('--div-pos-3')]];
  D.noData = (id, msg) => {
    if (window.Plotly) Plotly.purge(id);
    const n = document.getElementById(id); n.textContent = '';
    n.appendChild(D.el('div', { class: 'empty' }, msg || 'Not available for this selection.'));
  };
  D.clearEmpty = id => { const n = document.getElementById(id); const e = n && n.querySelector('.empty'); if (e) e.remove(); };

  // ---------- Table views ----------
  const tables = {};
  // Tables with only two columns add nothing to the chart, so their Table button is hidden.
  D.setTable = (chart, head, rows) => {
    tables[chart] = { head, rows };
    const card = document.querySelector(`[data-chart="${chart}"]`);
    const btn = card && card.querySelector('[data-table]');
    if (btn) {
      btn.hidden = head.length <= 2;
      if (btn.hidden && card.classList.contains('show-table')) { card.classList.remove('show-table'); btn.textContent = 'Table'; }
    }
    D.renderTable(chart);
  };
  D.renderTable = chart => {
    const card = document.querySelector(`[data-chart="${chart}"]`);
    if (!card || !card.classList.contains('show-table')) return;
    const wrap = card.querySelector('.tablewrap');
    wrap.textContent = '';
    const t = tables[chart];
    if (!t) return;
    const table = D.el('table', { class: 'data' });
    const tr = D.el('tr'); t.head.forEach(h => tr.appendChild(D.el('th', {}, h))); table.appendChild(D.el('thead')).appendChild(tr);
    const tb = D.el('tbody');
    t.rows.forEach(r => { const row = D.el('tr'); r.forEach(c => row.appendChild(D.el('td', {}, c === null || c === undefined ? '–' : String(c)))); tb.appendChild(row); });
    table.appendChild(tb); wrap.appendChild(table);
  };
  D.bindTableButtons = () => document.querySelectorAll('[data-table]').forEach(b => b.addEventListener('click', () => {
    const card = b.closest('.card');
    card.classList.toggle('show-table');
    b.textContent = card.classList.contains('show-table') ? 'Chart' : 'Table';
    D.renderTable(card.dataset.chart);
    if (!card.classList.contains('show-table')) { const p = card.querySelector('.plot'); if (p && p.data) Plotly.Plots.resize(p); }
  }));

  // ---------- Range slider ----------
  // Two-handle slider for a range of years (or any integers). It replaces Plotly's range slider, which repeats the
  // whole chart in miniature. onChange receives [from, to] while the handles move.
  D.rangeSlider = (container, { min, max, value, step = 1, format = x => String(x), onChange }) => {
    container.textContent = '';
    container.classList.add('range');
    const lab = D.el('span', { class: 'vals' });
    const dual = D.el('div', { class: 'dual' });
    const track = D.el('div', { class: 'track' }), fill = D.el('div', { class: 'fill' });
    const lo = D.el('input', { type: 'range', min, max, step, value: value[0], 'aria-label': 'From' });
    const hi = D.el('input', { type: 'range', min, max, step, value: value[1], 'aria-label': 'To' });
    dual.append(track, fill, lo, hi);
    container.append(dual, lab);
    const update = (fire, moved) => {
      let a = Number(lo.value), b = Number(hi.value);
      if (a > b) { if (moved === lo) { b = a; hi.value = b; } else { a = b; lo.value = a; } }
      const pct = x => 100 * (x - min) / (max - min || 1);
      fill.style.left = pct(a) + '%'; fill.style.width = (pct(b) - pct(a)) + '%';
      lab.textContent = `${format(a)} – ${format(b)}`;
      if (fire) onChange([a, b]);
    };
    lo.addEventListener('input', () => update(true, lo));
    hi.addEventListener('input', () => update(true, hi));
    update(false);
    return { get: () => [Number(lo.value), Number(hi.value)] };
  };

  // ---------- Segmented controls ----------
  D.syncSeg = (id, value) => document.querySelectorAll(`#${id} button`).forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === value)));
  D.bindSeg = (id, onPick) => document.querySelectorAll(`#${id} button`).forEach(b => b.addEventListener('click', () => { if (!b.disabled) onPick(b.dataset.v); }));

  // ---------- Theme (shared header control) ----------
  // Light or dark. The first visit follows the system setting; after that the viewer's choice is remembered.
  D.initHeader = onTheme => {
    let theme = null;
    try { theme = localStorage.getItem('enso-theme'); } catch (e) {}
    if (D.shell) theme = D.shell.theme();
    if (theme !== 'light' && theme !== 'dark') theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    const apply = () => {
      document.documentElement.setAttribute('data-theme', theme);
      D.syncSeg('theme', theme);
    };
    apply();
    D.setTheme = v => { theme = v; try { localStorage.setItem('enso-theme', theme); } catch (e) {} apply(); onTheme(); };
    D.bindSeg('theme', D.setTheme);
  };

  return D;
})();
