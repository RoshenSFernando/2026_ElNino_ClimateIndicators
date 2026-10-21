// ENSO climate dashboard: ENSO: Country Deep Dives page (assets/pages/country.html).
(() => {
'use strict';
const E = window.ENSO, D = window.DASH, M = E.meta, G = E.global;
if (!M || !window.Plotly) {
  document.querySelector('main').innerHTML = '<p class="empty">The dashboard data or the charting library did not load. Run Scripts/Step09_DashboardData.R and check the internet connection (Plotly loads from a CDN).</p>';
  return;
}
D.init(M);
const { $, el, css, fmt, fmtU, fmtP, pTxt } = D;
const VARS = D.VARS, PERIODS = D.PERIODS, PLABEL = D.PLABEL, YEARS = M.years, PHASES = D.PHASES, BL = D.BL;
const TABS = ['variation', 'correlation', 'lp'];
// Accumulated precipitation is a derived indicator that exists only for the response over the next 12 months.
const ACC = 'PREACC';
VARS[ACC] = { code: ACC, name: 'Accumulated Precipitation (from ENSO Onset)', unit: 'mm', pct: false };

const state = { iso: 'IND', variable: 'PRE', period: 'JJA', baseline: 'B6190', metric: 'abs', contrast: 'EN', sample: 'Long', onset: 'All', cumunit: 'mm', tab: 'variation' };
const ci = iso => M.countries.iso.indexOf(iso);

// ---------- Anomaly helpers ----------
const country = () => E.countries[state.iso];
const metricAllowed = () => state.metric !== 'pct' || VARS[state.variable].pct;
const effMetric = () => metricAllowed() ? state.metric : 'abs';
const bIdx = () => state.baseline === 'B6190' ? 0 : 1;
const digits = v => ['PRE', 'PET', 'WET', 'CLD'].includes(v) ? 1 : 2;
const unitFor = (v, metric) => metric === 'pct' ? '% of normal' : metric === 'z' ? 'SD' : VARS[v].unit;
function anomalyOf(v, p, value, metric) {
  const n = (country().normals[v] || {})[p];
  if (!n || value === null || value === undefined) return null;
  const o = bIdx() * 4, mean = n[o], sd = n[o + 1];
  if (mean === null || mean === undefined) return null;
  const a = value - mean;
  if (metric === 'abs') return a;
  if (metric === 'z') return sd > 0 ? a / sd : null;
  const months = /^\d+$/.test(p) ? 1 : p === 'ENSO_YR' ? 12 : 3;
  const ok = v === 'PRE' ? mean >= 5 * months : v === 'WET' ? mean >= months : false;
  return ok ? 100 * a / mean : null;
}
function scaleCI(v, p, half, metric) {
  const n = (country().normals[v] || {})[p];
  if (!n || half === null || half === undefined) return null;
  const o = bIdx() * 4;
  if (metric === 'abs') return half;
  if (metric === 'z') return n[o + 1] > 0 ? half / n[o + 1] : null;
  return n[o] > 0 ? 100 * half / n[o] : null;
}
// Composite array: [N, mA61, mA91, ci, mP61, mP91, mZ61, mZ91, dA, dP61, dP91, dZ61, dZ91, p]
const compMean = (a, m) => !a ? null : m === 'abs' ? a[1 + bIdx()] : m === 'pct' ? a[4 + bIdx()] : a[6 + bIdx()];
const compDiff = (a, m) => !a ? null : m === 'abs' ? a[8] : m === 'pct' ? a[9 + bIdx()] : a[11 + bIdx()];

function seriesFor(v, p, metric) {
  const vals = (country().values[v] || {})[p];
  if (!vals) return [];
  const inst = M.instances[p];
  return inst.years.map((y, i) => {
    const raw = vals[y - YEARS[0]];
    return { year: y, phase: inst.phase[i], roni: inst.roni[i], raw, a: anomalyOf(v, p, raw, metric) };
  }).filter(d => d.raw !== null && d.raw !== undefined);
}

// ---------- Controls ----------
function fillSelects() {
  const cs = $('#country');
  let group = null, label = null;
  M.countries.iso.forEach((iso, i) => {
    const l = `${M.countries.region[i]} · ${M.countries.subregion[i]}`;
    if (l !== label) { group = el('optgroup', { label: l }); cs.appendChild(group); label = l; }
    group.appendChild(el('option', { value: iso }, M.countries.name[i]));
  });
  const vs = $('#variable');
  D.VAR_ORDER.forEach(v => {
    vs.appendChild(el('option', { value: v }, `${VARS[v].name} (${v})`));
    if (v === 'PRE') vs.appendChild(el('option', { value: ACC }, VARS[ACC].name));
  });
  const ps = $('#period');
  const gs = el('optgroup', { label: 'Seasons' }), gm = el('optgroup', { label: 'Months' }), gy = el('optgroup', { label: 'Year' });
  PERIODS.forEach(p => { const o = el('option', { value: p }, D.periodName(p)); (/^\d+$/.test(p) ? gm : p === 'ENSO_YR' ? gy : gs).appendChild(o); });
  ps.append(gs, gm, gy);
}
function syncControls() {
  // Accumulated precipitation can only be chosen on the response tab; elsewhere it falls back to precipitation.
  if (state.tab !== 'lp' && state.variable === ACC) state.variable = 'PRE';
  const accOpt = $('#variable').querySelector(`option[value="${ACC}"]`);
  accOpt.disabled = state.tab !== 'lp';
  accOpt.title = state.tab === 'lp' ? '' : 'Available on the "Historical Climate Response to ENSO" tab';
  $('#country').value = state.iso; $('#variable').value = state.variable; $('#period').value = state.period;
  ['baseline', 'metric', 'contrast', 'sample', 'onset', 'cumunit'].forEach(k => D.syncSeg(k, state[k]));
  const pctBtn = document.querySelector('#metric button[data-v="pct"]');
  pctBtn.disabled = !VARS[state.variable].pct;
  pctBtn.title = VARS[state.variable].pct ? '' : 'Percent of normal is shown for Precipitation and Wet Days only';
  document.querySelectorAll('nav.tabs button').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === state.tab)));
  document.querySelectorAll('section[data-panel]').forEach(s => s.hidden = s.dataset.panel !== state.tab);
}
const hashOf = () => `#${state.iso}/${state.variable}/${state.period}/${state.tab}`;
function readHash() {
  const [iso, v, p, tab] = decodeURIComponent(location.hash.slice(1)).split('/');
  if (iso && M.countries.iso.includes(iso)) state.iso = iso;
  if (v && VARS[v]) state.variable = v;
  if (p && PERIODS.includes(p)) state.period = p;
  if (tab && TABS.includes(tab)) state.tab = tab;
}
function loadCountry(iso) {
  return new Promise((resolve, reject) => {
    if (E.countries[iso]) return resolve(E.countries[iso]);
    (E.waiting[iso] = E.waiting[iso] || []).push(resolve);
    const s = el('script', { src: `data/countries/${iso}.js` });
    s.onerror = () => reject(new Error('Could not load the data for ' + iso));
    document.body.appendChild(s);
  });
}

function renderCountryHead() {
  const i = ci(state.iso);
  const h = $('#country-head'); h.textContent = '';
  h.append(el('h2', {}, M.countries.name[i]),
    el('span', { class: 'sub' }, `${M.countries.subregion[i]}, ${M.countries.region[i]} · ${VARS[state.variable].name} · ${D.periodName(state.period)} · anomalies vs ${BL[state.baseline]}`));
  if (M.countries.sparse[i]) h.append(el('span', { class: 'flag', title: 'Share of 1991–2025 monthly Precipitation values that repeat three or more times for the same calendar month. CRU fills gaps with climatology, which damps anomalies.' }, `Sparse station data: ${Math.round(M.countries.repeated[i] * 100)}% repeated Precipitation values`));
  if (M.countries.pet_missing[i]) h.append(el('span', { class: 'flag' }, 'PET not available'));
}

// ---------- Variation tab ----------
function renderTiles() {
  const c = country(), v = state.variable, p = state.period, m = effMetric();
  const comp = ((c.comp[v] || {})[p]) || {};
  const unit = unitFor(v, m);
  const tile = (id, key, title, arr) => {
    const t = $(id); t.textContent = '';
    const head = el('div', { class: 'note' }); const k = el('span', { class: 'key' }); k.style.background = D.phaseColor(key); head.append(k, title);
    const d = compDiff(arr, m);
    t.append(head, el('div', { class: 'val' }, d === null || d === undefined ? '–' : `${fmt(d, m === 'abs' ? digits(v) : m === 'pct' ? 0 : 2)} ${unit}`),
      el('div', { class: 'note' }, arr ? `vs Neutral · ${pTxt('p', arr[13])} · n = ${arr[0]} vs ${comp['Neutral'] ? comp['Neutral'][0] : '–'}` : 'No data'));
  };
  tile('#tile-en', 'EN', 'El Niño − Neutral, 1991–2025', comp['El Niño']);
  tile('#tile-ln', 'LN', 'La Niña − Neutral, 1991–2025', comp['La Niña']);
  const cr = (((c.corr[v] || {})[p]) || {})[state.sample];
  const t = $('#tile-r'); t.textContent = '';
  t.append(el('div', { class: 'note' }, `Correlation with RONI (${cr ? cr.start + '–' + cr.end : state.sample === 'Long' ? '1951–2025' : '1991–2025'})`),
    el('div', { class: 'val' }, cr && cr.r ? fmt(cr.r[0]) : '–'),
    el('div', { class: 'note' }, cr && cr.r ? `detrended · ${pTxt('p', cr.p[0])} · ${pTxt('q', cr.q[0])}` : 'No data'));
  const tn = $('#tile-n'); tn.textContent = '';
  const d = seriesFor(v, p, 'abs');
  const cnt = ph => d.filter(x => x.phase === ph).length;
  tn.append(el('div', { class: 'note' }, 'Years in each phase, 1991–2025'),
    el('div', { class: 'val' }, `${cnt('EN')} · ${cnt('NEU')} · ${cnt('LN')}`),
    el('div', { class: 'note' }, 'El Niño · Neutral · La Niña, by the centre month of the period'));
}

function renderTimeline() {
  const v = state.variable, p = state.period, m = effMetric();
  const d = seriesFor(v, p, m);
  $('#timeline-title').textContent = D.tc(`${VARS[v].name} anomalies by year, ${D.periodName(p)}`);
  $('#timeline-desc').textContent = `Anomaly against the ${BL[state.baseline]} normal, coloured by ENSO phase.${state.baseline === 'B6190' && ['TMP', 'TMX', 'TMN', 'VAP', 'PET', 'WBGT'].includes(v) ? ' Against 1961–1990 the warming trend shifts this variable in every phase; compare phases with each other, not with zero.' : ''}`;
  const leg = $('#phase-legend'); leg.textContent = '';
  PHASES.forEach(([k, n]) => { const s = el('span', {}, n); s.style.setProperty('--c', D.phaseColor(k)); leg.appendChild(s); });
  if (!d.some(x => x.a !== null)) return D.noData('p-timeline');
  const unit = unitFor(v, m);
  const traces = PHASES.map(([k, n]) => {
    const dd = d.filter(x => x.phase === k);
    return { type: 'bar', name: n, x: dd.map(x => x.year), y: dd.map(x => x.a), marker: { color: D.phaseColor(k), line: { width: 0 } },
      customdata: dd.map(x => [x.raw, x.roni]), hovertemplate: `<b>%{y:.2f} ${unit}</b><br>%{x} · ${n}<br>value %{customdata[0]} · RONI %{customdata[1]:+.2f}<extra></extra>` };
  });
  D.plot('p-timeline', traces, D.baseLayout({ barmode: 'overlay', bargap: 0.25, xaxis: { dtick: 2 }, yaxis: { title: { text: unit }, zeroline: true } }));
  D.setTable('timeline', ['Year', 'Phase', 'RONI', 'Value', `Anomaly (${unit})`], d.map(x => [x.year, D.phaseName(x.phase), fmt(x.roni), x.raw, fmtU(x.a, 2)]));
}

function renderBox() {
  const v = state.variable, p = state.period, m = effMetric();
  const d = seriesFor(v, p, m).filter(x => x.a !== null);
  if (!d.length) return D.noData('p-box');
  const unit = unitFor(v, m);
  const traces = PHASES.map(([k, n]) => {
    const dd = d.filter(x => x.phase === k), c = D.phaseColor(k);
    return { type: 'box', name: n, y: dd.map(x => x.a), text: dd.map(x => String(x.year)), boxpoints: 'all', jitter: 0.45, pointpos: 0, boxmean: true,
      marker: { color: c, size: 8, line: { color: css('--surface'), width: 2 } }, line: { color: c, width: 1.5 }, fillcolor: D.rgba(c, 0.08),
      hovertemplate: `<b>%{y:.2f} ${unit}</b><br>%{text} · ${n}<extra></extra>` };
  });
  D.plot('p-box', traces, D.baseLayout({ yaxis: { title: { text: unit }, zeroline: true }, xaxis: { showgrid: false } }));
  D.setTable('box', ['Phase', 'n', 'Mean', 'Min', 'Max'], PHASES.map(([k, n]) => {
    const a = d.filter(x => x.phase === k).map(x => x.a);
    return [n, a.length, a.length ? fmtU(a.reduce((s, x) => s + x, 0) / a.length) : '–', a.length ? fmtU(Math.min(...a)) : '–', a.length ? fmtU(Math.max(...a)) : '–'];
  }));
}

function heatTrace(getVal, getSig, getHover, zmax, ticktext) {
  const vars = D.VAR_ORDER.filter(v => country().values[v]);
  const z = [], text = [], hover = [];
  vars.forEach(v => {
    const zr = [], tr = [], hr = [];
    PERIODS.forEach(p => {
      const val = getVal(v, p);
      zr.push(val === null || val === undefined ? null : D.WARM_DRY[v] * val);
      tr.push(getSig(v, p) ? '●' : '');
      hr.push(getHover(v, p, val));
    });
    z.push(zr); text.push(tr); hover.push(hr);
  });
  const trace = {
    type: 'heatmap', x: PERIODS.map(p => PLABEL[p]), y: vars, z, text, customdata: hover,
    texttemplate: '%{text}', textfont: { color: css('--ink'), size: 10 }, hovertemplate: '%{customdata}<extra></extra>',
    colorscale: D.divergingScale(), zmin: -zmax, zmax, xgap: 2, ygap: 2,
    colorbar: { thickness: 10, len: 0.9, outlinewidth: 0, tickvals: [-zmax, 0, zmax], ticktext, tickfont: { color: css('--muted'), size: 11 } }
  };
  const l = D.baseLayout({ margin: { l: 48, r: 8, t: 6, b: 50 }, xaxis: { showgrid: false, tickangle: -45, tickfont: { size: 10.5 } }, yaxis: { showgrid: false, autorange: 'reversed' } });
  const xi = PERIODS.indexOf(state.period), yi = vars.indexOf(state.variable);
  if (xi >= 0 && yi >= 0) l.shapes = [{ type: 'rect', x0: xi - 0.5, x1: xi + 0.5, y0: yi - 0.5, y1: yi + 0.5, line: { color: css('--ink'), width: 2 } }];
  return { trace, layout: l, vars };
}
function bindHeatClick(id) {
  const n = document.getElementById(id);
  if (n.dataset.bound) return; n.dataset.bound = '1';
  n.on('plotly_click', ev => { const pt = ev.points[0]; state.variable = pt.y; state.period = PERIODS[pt.pointIndex[1]]; render(); });
}
function renderHeat() {
  const c = country(), g = state.contrast === 'EN' ? 'El Niño' : 'La Niña';
  $('#heat-title').textContent = D.tc(`${g} minus Neutral, all variables`);
  const { trace, layout, vars } = heatTrace(
    (v, p) => compDiff(((c.comp[v] || {})[p] || {})[g], 'z'),
    (v, p) => { const a = ((c.comp[v] || {})[p] || {})[g]; return a && a[13] !== null && a[13] < 0.05; },
    (v, p, val) => { const a = ((c.comp[v] || {})[p] || {})[g]; return a ? `<b>${fmt(val)} SD</b> (${fmt(a[8], digits(v))} ${VARS[v].unit})<br>${VARS[v].name}, ${PLABEL[p]}<br>${pTxt('p', a[13])} · n = ${a[0]}` : 'No data'; },
    1.5, ['cooler / wetter', '0', 'warmer / drier']);
  D.plot('p-heat', [trace], layout);
  bindHeatClick('p-heat');
  D.setTable('heat', ['Variable', ...PERIODS.map(p => PLABEL[p])], vars.map(v => [v, ...PERIODS.map(p => { const a = ((c.comp[v] || {})[p] || {})[g]; return a ? fmt(compDiff(a, 'z')) + (a[13] < 0.05 ? '*' : '') : '–'; })]));
}

function renderCycle() {
  const c = country(), v = state.variable, m = effMetric();
  const cy = (c.cycle || {})[v];
  if (!cy || !Object.values(cy).some(arr => arr.some(a => a[2] !== null))) return D.noData('p-cycle');
  const labels = ['Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May'].map((x, i) => x + (i < 7 ? ' (0)' : ' (+1)'));
  const monthCode = i => String(((i + 5) % 12) + 1);
  const unit = unitFor(v, m), b = bIdx();
  const traces = [], rows = [];
  PHASES.forEach(([k, n]) => {
    const arr = cy[k]; if (!arr || !arr.length) return;
    const mean = arr.map(a => m === 'abs' ? a[1 + b] : m === 'pct' ? a[4 + b] : a[6 + b]);
    const half = arr.map((a, i) => scaleCI(v, monthCode(i), a[3], m));
    const col = D.phaseColor(k);
    const lo = mean.map((x, i) => x === null || half[i] === null ? null : x - half[i]);
    const hi = mean.map((x, i) => x === null || half[i] === null ? null : x + half[i]);
    traces.push({ x: labels, y: hi, mode: 'lines', name: `${n} upper 95% bound`, showlegend: false, line: { width: 0 }, hoverinfo: 'skip' });
    traces.push({ x: labels, y: lo, mode: 'lines', name: `${n} lower 95% bound`, showlegend: false, line: { width: 0 }, fill: 'tonexty', fillcolor: D.rgba(col, 0.12), hoverinfo: 'skip' });
    traces.push({ x: labels, y: mean, mode: 'lines+markers', name: `${n} (n=${arr[0][0]})`, showlegend: true, line: { color: col, width: 2 }, marker: { size: 6, color: col },
      hovertemplate: `${n}: <b>%{y:.2f}</b> ${unit}<extra></extra>` });
    mean.forEach((x, i) => { rows[i] = rows[i] || [labels[i]]; rows[i].push(fmtU(x)); });
  });
  D.plot('p-cycle', traces, D.baseLayout({ hovermode: 'x unified', showlegend: true, legend: { orientation: 'h', y: 1.12, x: 0 }, yaxis: { title: { text: unit }, zeroline: true }, xaxis: { showgrid: false } }));
  D.setTable('cycle', ['Month', ...PHASES.map(x => x[1])], rows);
}

function renderGroups() {
  const c = country(), v = state.variable, p = state.period, m = effMetric();
  const comp = (c.comp[v] || {})[p];
  const order = ['El Niño: strong', 'El Niño: moderate', 'El Niño: weak', 'El Niño: Eastern Pacific', 'El Niño: Central Pacific', 'El Niño', 'Neutral', 'La Niña', 'La Niña: weak', 'La Niña: moderate', 'La Niña: strong'];
  const g = comp ? order.filter(k => comp[k] && comp[k][0] > 0 && compMean(comp[k], m) !== null) : [];
  if (!g.length) return D.noData('p-groups');
  const unit = unitFor(v, m);
  const mean = g.map(k => compMean(comp[k], m));
  // Intervals from fewer than three years are not meaningful and would swamp the axis.
  const half = g.map(k => comp[k][0] >= 3 ? scaleCI(v, p, comp[k][3], m) : null);
  const col = g.map(k => k.startsWith('El') ? css('--en') : k.startsWith('La') ? css('--ln') : css('--neu'));
  const ends = mean.flatMap((x, i) => x === null ? [] : [x - (half[i] || 0), x + (half[i] || 0)]);
  const lo = Math.min(0, ...ends), hi = Math.max(0, ...ends), pad = 0.08 * (hi - lo || 1);
  D.plot('p-groups', [{ type: 'bar', orientation: 'h', y: g.map(k => `${k} (n=${comp[k][0]})`), x: mean, marker: { color: col, opacity: g.map(k => k.includes(':') ? 0.6 : 1) },
    error_x: { type: 'data', array: half, color: css('--muted'), thickness: 1, width: 3 },
    customdata: g.map((k, i) => [k, comp[k][0], k === 'Neutral' ? '' : `difference from Neutral ${fmt(compDiff(comp[k], m))} · ${pTxt('p', comp[k][13])}`, half[i] === null ? 'too few years for an interval' : `95% CI ±${fmtU(half[i])}`]),
    hovertemplate: `<b>%{x:.2f} ${unit}</b><br>%{customdata[0]} · n = %{customdata[1]}<br>%{customdata[3]}<br>%{customdata[2]}<extra></extra>` }],
    D.baseLayout({ xaxis: { title: { text: unit }, zeroline: true, range: [lo - pad, hi + pad] }, yaxis: { showgrid: false, autorange: 'reversed', tickfont: { size: 11.5 } }, bargap: 0.3, margin: { l: 56, r: 16, t: 6, b: 40 } }));
  D.setTable('groups', ['Group', 'n', `Mean (${unit})`, '95% CI ±', 'Difference from Neutral', 'p'], g.map((k, i) => [k, comp[k][0], fmtU(mean[i]), fmtU(half[i]), k === 'Neutral' ? '' : fmt(compDiff(comp[k], m)), k === 'Neutral' ? '' : fmtP(comp[k][13])]));
}

// ---------- Correlation tab ----------
function renderCorrHeat() {
  const c = country(), s = state.sample;
  const { trace, layout, vars } = heatTrace(
    (v, p) => { const x = (((c.corr[v] || {})[p]) || {})[s]; return x && x.r ? x.r[0] : null; },
    (v, p) => { const x = (((c.corr[v] || {})[p]) || {})[s]; return x && x.q && x.q[0] !== null && x.q[0] < 0.05; },
    (v, p, val) => { const x = (((c.corr[v] || {})[p]) || {})[s]; return x && x.r ? `Correlation coefficient: <b>${fmt(val)}</b><br>${VARS[v].name}, ${PLABEL[p]}<br>${x.start}–${x.end} · ${pTxt('p', x.p[0])} · ${pTxt('q', x.q[0])}` : 'No data'; },
    0.8, ['El Niño cooler / wetter', '0', 'El Niño warmer / drier']);
  D.plot('p-corrheat', [trace], layout);
  bindHeatClick('p-corrheat');
  D.setTable('corrheat', ['Variable', ...PERIODS.map(p => PLABEL[p])], vars.map(v => [v, ...PERIODS.map(p => { const x = (((c.corr[v] || {})[p]) || {})[s]; return x && x.r ? fmt(x.r[0]) + (x.q[0] < 0.05 ? '*' : '') : '–'; })]));
}

function renderIndices() {
  const x = ((country().corr[state.variable] || {})[state.period]);
  if (!x || !x.Long.ir.some(r => r !== null)) return D.noData('p-indices');
  const names = ['RONI', 'Niño 1+2', 'Niño 3', 'Niño 3.4', 'Niño 4'];
  $('#indices-desc').textContent = `Detrended correlation at lag 0, 1951–2025 (SST indices from ${x.Long.istart ? x.Long.istart[1] : 1982}) and 1991–2025. Filled bars: p < 0.05.`;
  const tr = [['Long', '1951–2025', css('--long')], ['Recent', '1991–2025', css('--recent')]].map(([k, n, col]) => ({
    type: 'bar', name: n, x: names, y: x[k].ir, marker: { color: x[k].ip.map(pp => pp !== null && pp < 0.05 ? col : D.rgba(col, 0.2)), line: { color: col, width: 1 } },
    hovertemplate: `Correlation coefficient: <b>%{y:+.2f}</b><br>%{x} · ${n}<extra></extra>` }));
  D.plot('p-indices', tr, D.baseLayout({ barmode: 'group', bargap: 0.3, bargroupgap: 0.08, showlegend: true, legend: { orientation: 'h', y: 1.1, x: 0 }, yaxis: { title: { text: 'Correlation Coefficient' }, range: [-1, 1], zeroline: true }, xaxis: { showgrid: false } }));
  D.setTable('indices', ['Index', 'Correlation Coefficient (1951–2025)', 'p', 'Correlation Coefficient (1991–2025)', 'p'], names.map((n, i) => [n, fmt(x.Long.ir[i]), fmtP(x.Long.ip[i]), fmt(x.Recent.ir[i]), fmtP(x.Recent.ip[i])]));
}

function renderLeadLag() {
  const x = ((country().corr[state.variable] || {})[state.period]);
  if (!x || !x.Long.r.some(r => r !== null)) return D.noData('p-leadlag');
  const lags = [...Array(13).keys()];
  const tr = [['Long', `${x.Long.start}–${x.Long.end}`, css('--long')], ['Recent', '1991–2025', css('--recent')]].map(([k, n, col]) => ({
    x: lags, y: x[k].r, mode: 'lines+markers', name: n, line: { color: col, width: 2 },
    marker: { size: 8, color: x[k].p.map(pp => pp !== null && pp < 0.05 ? col : css('--surface')), line: { color: col, width: 2 } },
    hovertemplate: `${n}: <b>%{y:+.2f}</b><extra></extra>` }));
  D.plot('p-leadlag', tr, D.baseLayout({ hovermode: 'x unified', showlegend: true, legend: { orientation: 'h', y: 1.12, x: 0 }, xaxis: { title: { text: 'RONI lead (months)' }, dtick: 2 }, yaxis: { title: { text: 'Correlation Coefficient' }, zeroline: true } }));
  D.setTable('leadlag', ['Lag (Months)', 'Correlation Coefficient (1951–2025)', 'p', 'Correlation Coefficient (1991–2025)', 'p'], lags.map(l => [l, fmt(x.Long.r[l]), fmtP(x.Long.p[l]), fmt(x.Recent.r[l]), fmtP(x.Recent.p[l])]));
}

function renderScatter() {
  const v = state.variable, p = state.period, m = effMetric();
  const d = seriesFor(v, p, m).filter(x => x.a !== null);
  if (d.length < 3) return D.noData('p-scatter');
  const unit = unitFor(v, m);
  const xs = d.map(x => x.roni), ys = d.map(x => x.a);
  const mx = xs.reduce((s, x) => s + x, 0) / xs.length, my = ys.reduce((s, x) => s + x, 0) / ys.length;
  const b = xs.reduce((s, x, i) => s + (x - mx) * (ys[i] - my), 0) / xs.reduce((s, x) => s + (x - mx) ** 2, 0);
  const x0 = Math.min(...xs), x1 = Math.max(...xs);
  const traces = PHASES.map(([k, n]) => { const dd = d.filter(x => x.phase === k); return {
    x: dd.map(x => x.roni), y: dd.map(x => x.a), text: dd.map(x => String(x.year)), mode: 'markers', name: n,
    marker: { size: 9, color: D.phaseColor(k), line: { color: css('--surface'), width: 2 } },
    hovertemplate: `<b>%{y:.2f} ${unit}</b><br>%{text} · RONI %{x:+.2f} · ${n}<extra></extra>` }; });
  traces.unshift({ x: [x0, x1], y: [my + b * (x0 - mx), my + b * (x1 - mx)], mode: 'lines', name: 'Linear Fit', showlegend: false, line: { color: css('--ink-2'), width: 1.5 }, hoverinfo: 'skip' });
  const top = [...d].sort((a, c) => Math.abs(c.roni) - Math.abs(a.roni)).slice(0, 4);
  const l = D.baseLayout({ xaxis: { title: { text: 'RONI at the centre of the period' }, zeroline: true }, yaxis: { title: { text: unit }, zeroline: true } });
  l.annotations = top.map((t, i) => ({ x: t.roni, y: t.a, text: String(t.year), showarrow: false, yshift: i % 2 ? -14 : 12, font: { size: 11, color: css('--ink-2') } }));
  D.plot('p-scatter', traces, l);
  D.setTable('scatter', ['Year', 'Phase', 'RONI', `Anomaly (${unit})`], d.map(x => [x.year, D.phaseName(x.phase), fmt(x.roni), fmtU(x.a)]));
}

function renderRolling() {
  const r = ((country().roll || {})[state.variable] || {})[state.period];
  if (!r || !r.r || !r.r.some(x => x !== null)) return D.noData('p-rolling');
  const yrs = r.r.map((_, i) => r.start + i);
  const l = D.baseLayout({ xaxis: { title: { text: 'Centre year of 21-year window' } }, yaxis: { title: { text: 'Correlation Coefficient' }, range: [-1, 1], zeroline: true } });
  l.shapes = [0.43, -0.43].map(y => ({ type: 'line', xref: 'paper', x0: 0, x1: 1, y0: y, y1: y, line: { color: css('--axis'), width: 1 } }));
  D.plot('p-rolling', [{ x: yrs, y: r.r, mode: 'lines', line: { color: css('--long'), width: 2 }, hovertemplate: 'Correlation coefficient: <b>%{y:+.2f}</b><br>%{x} ± 10 years<extra></extra>' }], l);
  D.setTable('rolling', ['Centre Year', 'Correlation Coefficient'], yrs.map((y, i) => [y, fmt(r.r[i])]));
}

function renderNeighbours() {
  const v = state.variable, p = state.period, sub = M.countries.subregion[ci(state.iso)];
  $('#neighbours-title').textContent = D.tc(`Compared with ${sub}`);
  const L = ((G.layers[v] || {})[p]);
  if (!L) return D.noData('p-neighbours');
  const rr = state.sample === 'Long' ? L.rL : L.rR, qq = state.sample === 'Long' ? L.qL : L.qR;
  const rows = G.iso.map((iso, i) => ({ iso, r: rr[i], q: qq[i] })).filter(d => M.countries.subregion[ci(d.iso)] === sub && d.r !== null).sort((a, b) => a.r - b.r);
  if (!rows.length) return D.noData('p-neighbours');
  const sel = css('--ink');
  D.plot('p-neighbours', [{
    type: 'bar', orientation: 'h', y: rows.map(d => D.countryName(d.iso)), x: rows.map(d => d.r),
    marker: { color: rows.map(d => D.WARM_DRY[v] * d.r > 0 ? css('--div-pos-2') : css('--div-neg-2')), opacity: rows.map(d => d.q !== null && d.q < 0.05 ? 1 : 0.4),
      line: { color: rows.map(d => d.iso === state.iso ? sel : 'rgba(0,0,0,0)'), width: rows.map(d => d.iso === state.iso ? 2 : 0) } },
    customdata: rows.map(d => [d.iso, fmtP(d.q)]), hovertemplate: 'Correlation coefficient: <b>%{x:+.2f}</b><br>%{y} · q %{customdata[1]}<extra></extra>'
  }], D.baseLayout({ margin: { l: 120, r: 12, t: 6, b: 36 }, yaxis: { showgrid: false, tickfont: { size: 11 } }, xaxis: { title: { text: `Correlation Coefficient (${state.sample === 'Long' ? '1951–2025' : '1991–2025'})` }, range: [-1, 1], zeroline: true } }));
  const n = document.getElementById('p-neighbours');
  if (!n.dataset.bound) { n.dataset.bound = '1'; n.on('plotly_click', ev => { state.iso = ev.points[0].customdata[0]; render(); }); }
  D.setTable('neighbours', ['Country', 'Correlation Coefficient', 'q'], rows.map(d => [D.countryName(d.iso), fmt(d.r), fmtP(d.q)]).reverse());
}

// ---------- Local projection tab ----------
const Z90 = 1.6449;
function bandTraces(x, mean, lo, hi, col, name, unit) {
  return [
    { x, y: hi, mode: 'lines', name: `${name} upper 90% bound`, showlegend: false, line: { width: 0 }, hoverinfo: 'skip' },
    { x, y: lo, mode: 'lines', name: `${name} lower 90% bound`, showlegend: false, line: { width: 0 }, fill: 'tonexty', fillcolor: D.rgba(col, 0.14), hoverinfo: 'skip' },
    { x, y: mean, mode: 'lines+markers', name, line: { color: col, width: 2 }, marker: { size: 6, color: col },
      customdata: mean.map((_, i) => [lo[i], hi[i]]), hovertemplate: `${name}: <b>%{y:.2f}</b> ${unit} (90% CI %{customdata[0]:.2f} to %{customdata[1]:.2f})<extra></extra>` }
  ];
}
function renderLP() {
  const c = country(), v = state.variable, mdl = state.onset, H = M.lp.horizons;
  const acc = v === ACC;
  const onsetTxt = mdl === 'All' ? 'any season of onset' : `onset in ${mdl}`;
  // Accumulated precipitation uses the cumulative regressions for precipitation, in mm or % of the annual normal.
  const annN = ((c.normals.PRE || {}).ANN || [])[bIdx() * 4];
  const pctMode = acc && state.cumunit === 'pct';
  const sc = pctMode && annN ? 100 / annN : 1;
  const unit = acc ? (pctMode ? '% of annual normal' : 'mm') : VARS[v].unit;
  const dg = acc ? 1 : 3;
  const lp = acc ? (c.lp.PRE || {}).C : (c.lp[v] || {}).M;
  $('#cumunit-field').hidden = !acc;
  $('#lpm-title').textContent = D.tc(`${VARS[v].name}: historical response by month after onset`);
  $('#lpm-desc').textContent = acc
    ? `Precipitation surplus (+) or deficit (−) that has historically accumulated from the onset month to h months later, RONI = +1 or −1 (${onsetTxt}), 1951–2025, with 90% intervals.${pctMode ? ` Scaled by the ${BL[state.baseline]} annual normal (${annN ? Math.round(annN) : '–'} mm).` : ''}`
    : `Average anomaly that followed an onset month with RONI = +1 or −1 by h months (${onsetTxt}), 1951–2025, with 90% intervals. Units: ${unit}.`;
  const leg = $('#lp-legend'); leg.textContent = '';
  [['EN', 'El Niño (RONI +1)'], ['LN', 'La Niña (RONI −1)']].forEach(([k, n]) => { const s2 = el('span', {}, n); s2.style.setProperty('--c', D.phaseColor(k)); leg.appendChild(s2); });
  if (!lp || !lp.All.EN.r.some(x => x !== null)) D.noData('p-lpm');
  else {
    const tr = [], rows = H.map(h => [h]);
    [['EN', 'El Niño'], ['LN', 'La Niña']].forEach(([k, n]) => {
      const d = lp[mdl][k];
      const mean = d.r.map(x => x * sc), lo = d.r.map((x, i) => (x - Z90 * d.se[i]) * sc), hi = d.r.map((x, i) => (x + Z90 * d.se[i]) * sc);
      tr.push(...bandTraces(H, mean, lo, hi, D.phaseColor(k), n, unit));
      H.forEach((h, i) => rows[i].push(fmtU(mean[i], dg), `${fmtU(lo[i], dg)} to ${fmtU(hi[i], dg)}`));
    });
    D.plot('p-lpm', tr, D.baseLayout({ hovermode: 'x unified', xaxis: { title: { text: 'Months after onset' }, dtick: 1 }, yaxis: { title: { text: unit }, zeroline: true } }));
    D.setTable('lpm', ['Horizon', 'El Niño', '90% CI', 'La Niña', '90% CI'], rows);
  }

  // Summary table across variables.
  const hs = [0, 2, 4, 6, 9, 12];
  $('#lpsum-desc').textContent = `Historical response to RONI = ±1 at selected horizons (${onsetTxt}). Bold: 90% interval excludes zero. Units are each variable's own; the last row is Accumulated Precipitation in mm.`;
  const box = $('#lpsum'); box.textContent = '';
  const table = el('table', { class: 'data' });
  const hr = el('tr'); hr.appendChild(el('th', {}, 'Variable'));
  ['El Niño', 'La Niña'].forEach(n => hs.forEach(h => hr.appendChild(el('th', {}, `${n} h=${h}`))));
  table.appendChild(el('thead')).appendChild(hr);
  const tb = el('tbody');
  const addRow = (label, d) => {
    const row = el('tr'); row.appendChild(el('td', {}, label));
    ['EN', 'LN'].forEach(k => hs.forEach(h => {
      const x = d ? d[mdl][k] : null;
      const ok = x && x.r[h] !== null;
      const td = el('td', {}, ok ? fmt(x.r[h], 2) : '–');
      if (ok && Math.abs(x.r[h]) > Z90 * x.se[h]) td.style.fontWeight = '600'; else td.style.color = 'var(--muted)';
      row.appendChild(td);
    }));
    tb.appendChild(row);
  };
  D.VAR_ORDER.forEach(vv => addRow(`${VARS[vv].name} (${VARS[vv].unit})`, (c.lp[vv] || {}).M));
  addRow('Accumulated Precipitation (mm)', (c.lp.PRE || {}).C);
  table.appendChild(tb); box.appendChild(table);
}

// ---------- Main render ----------
let token = 0;
async function render() {
  const my = ++token;
  syncControls();
  if (location.hash !== hashOf()) D.replaceHash(hashOf());
  document.body.classList.add('loading');
  try { await loadCountry(state.iso); } catch (e) { document.body.classList.remove('loading'); $('#country-head').textContent = e.message; return; }
  if (my !== token) return;
  document.body.classList.remove('loading');
  renderCountryHead();
  if (state.tab === 'variation') { renderTiles(); renderTimeline(); renderBox(); renderHeat(); renderCycle(); renderGroups(); }
  if (state.tab === 'correlation') { renderCorrHeat(); renderIndices(); renderLeadLag(); renderScatter(); renderRolling(); renderNeighbours(); }
  if (state.tab === 'lp') renderLP();
}

D.bindTableButtons();
D.initHeader(() => render());
readHash();
fillSelects();
$('#country').addEventListener('change', e => { state.iso = e.target.value; render(); });
$('#variable').addEventListener('change', e => { state.variable = e.target.value; render(); });
$('#period').addEventListener('change', e => { state.period = e.target.value; render(); });
['baseline', 'metric', 'contrast', 'sample', 'onset', 'cumunit'].forEach(k => D.bindSeg(k, v => { state[k] = v; render(); }));
document.querySelectorAll('nav.tabs button').forEach(b => b.addEventListener('click', () => { state.tab = b.dataset.tab; render(); }));
window.addEventListener('hashchange', () => { if (location.hash !== hashOf()) { readHash(); render(); } });
render();
})();
