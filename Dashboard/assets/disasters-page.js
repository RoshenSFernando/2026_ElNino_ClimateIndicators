// ENSO climate dashboard: Climate-Related Disasters page (assets/pages/disasters.html), built on EM-DAT.
(() => {
'use strict';
const E = window.ENSO, D = window.DASH, M = E.meta, X = E.disasters;
if (!M || !X || !window.Plotly) {
  document.querySelector('main').innerHTML = '<p class="empty">The disaster data or the charting library did not load. Run Scripts/Step08_Disasters.R and Step09_DashboardData.R, and check the internet connection (Plotly loads from a CDN).</p>';
  return;
}
D.init(M);
const { $, el, css, fmt, fmtU, pTxt } = D;

const HAZ = X.hazards, ALL = HAZ[0];
const SHORT = { [ALL]: 'All hazards', 'Tropical cyclone': 'Trop. cyclone', 'Cold wave and severe winter': 'Cold wave', 'Landslide (wet)': 'Landslide' };
const short = h => SHORT[h] || h;
// Ratios are shown only when the phase and Neutral periods together hold at least this many events.
const MIN_RATIO_EVENTS = 10;
const PH = [['EN', 'El Niño'], ['NEU', 'Neutral'], ['LN', 'La Niña']];
const MEASURES = {
  Deaths: { label: 'deaths', unit: 'deaths' }, Injured: { label: 'people injured', unit: 'people' },
  Affected: { label: 'people affected', unit: 'people' }, Damage: { label: 'economic damage', unit: 'US$ million' }
};
// tl: the ENSO years shown in the timeline, set by its slider.
const state = { scope: 'WLD', hazard: ALL, phase: 'EN', lag: '0', measure: 'Deaths', tl: [X.years[0], X.years[1] - 1] };

const S = X.scopes;
const scopeLabel = Object.fromEntries(S.id.map((id, i) => [id, S.label[i]]));
const scopeKind = Object.fromEntries(S.id.map((id, i) => [id, S.kind[i]]));
const subOfIso = Object.fromEntries(S.id.map((id, i) => [id, S.subregion[i]]).filter((d, i) => S.kind[i] === 'country'));
const SUBS = S.id.filter((id, i) => S.kind[i] === 'subregion');
const COUNTRIES = S.id.filter((id, i) => S.kind[i] === 'country');
const years = (lag, ph) => { const e = X.exposure; for (let i = 0; i < e.lag.length; i++) if (String(e.lag[i]) === String(lag) && e.phase[i] === ph) return e.years[i]; return null; };
const ev = X.events, NEV = ev.iso.length;
const phaseOf = i => ev['ph' + state.lag][i];
const clampLog = (x, lo = 0.1, hi = 10) => x === null || x === undefined || !(x > 0) ? null : Math.min(hi, Math.max(lo, x));

// ---------- Event filters ----------
function inScope(i, scope = state.scope) {
  if (scope === 'WLD') return true;
  if (scope.startsWith('SUB:')) return subOfIso[ev.iso[i]] === scope.slice(4);
  return ev.iso[i] === scope;
}
function inHazard(i, hazard = state.hazard) {
  return hazard === ALL || HAZ[ev.hazard[i]] === hazard;
}
const selected = () => { const out = []; for (let i = 0; i < NEV; i++) if (inScope(i) && inHazard(i)) out.push(i); return out; };
const rateRow = (scope, hazard) => (((X.rates[state.lag] || {})[scope]) || {})[hazard];

// ---------- Controls ----------
function fillControls() {
  const sc = $('#scope');
  const gw = el('optgroup', { label: 'World' }); gw.appendChild(el('option', { value: 'WLD' }, 'World')); sc.appendChild(gw);
  const gs = el('optgroup', { label: 'UN subregions' });
  SUBS.forEach(id => gs.appendChild(el('option', { value: id }, scopeLabel[id])));
  sc.appendChild(gs);
  let group = null, cur = null;
  COUNTRIES.forEach(id => {
    const sub = subOfIso[id];
    if (sub !== cur) { group = el('optgroup', { label: `Countries · ${sub}` }); sc.appendChild(group); cur = sub; }
    group.appendChild(el('option', { value: id }, scopeLabel[id]));
  });
  const hz = $('#hazard');
  HAZ.forEach(h => hz.appendChild(el('option', { value: h }, h)));
  sc.addEventListener('change', e => { state.scope = e.target.value; render(); });
  hz.addEventListener('change', e => { state.hazard = e.target.value; render(); });
  ['phase', 'lag', 'measure'].forEach(k => D.bindSeg(k, v => { state[k] = v; render(); }));
  D.rangeSlider($('#timeline-range'), { min: state.tl[0], max: state.tl[1], value: state.tl, format: y => `${y}/${String(y + 1).slice(2)}`,
    onChange: v => { state.tl = v; renderTimeline(); } });
}
function syncControls() {
  $('#scope').value = state.scope; $('#hazard').value = state.hazard;
  ['phase', 'lag', 'measure'].forEach(k => D.syncSeg(k, state[k]));
  D.replaceHash(`#${encodeURIComponent(state.scope)}/${encodeURIComponent(state.hazard)}`);
}
function readHash() {
  const [scope, hazard] = location.hash.slice(1).split('/').map(decodeURIComponent);
  if (scope && scopeLabel[scope]) state.scope = scope;
  if (hazard && HAZ.includes(hazard)) state.hazard = hazard;
}

function renderHead() {
  const n = selected().length;
  const h = $('#scope-head'); h.textContent = '';
  const kind = scopeKind[state.scope] === 'subregion' ? 'UN subregion' : scopeKind[state.scope] === 'country' ? subOfIso[state.scope] : 'All countries';
  h.append(el('h2', {}, scopeLabel[state.scope]), el('span', { class: 'sub' }, `${kind} · ${state.hazard} · ${n.toLocaleString()} events, ${X.years[0]}–${X.years[1]} · ENSO phase ${state.lag === '0' ? 'at the start of each event' : `${state.lag} months before the start`}`));
}

// ---------- Rate ratios by hazard ----------
// Rate row: [n EN, NEU, LN, low EN, NEU, LN, high EN, NEU, LN, ratio EN, low, high, p, ratio LN, low, high, p]
function renderRatios() {
  const rows = [], traces = [];
  [['EN', 9, -0.17], ['LN', 13, 0.17]].forEach(([k, o, dy]) => {
    const y = [], x = [], lo = [], hi = [], cd = [], sym = [];
    HAZ.forEach((h, i) => {
      const r = rateRow(state.scope, h);
      if (!r || !(r[o] > 0)) return;
      const v = clampLog(r[o]), l = clampLog(r[o + 1]) ?? 0.1, u = clampLog(r[o + 2] ?? 10) ?? 10;
      y.push(i + dy); x.push(v); lo.push(v - l); hi.push(u - v);
      sym.push(r[o + 3] !== null && r[o + 3] < 0.05 ? 'circle' : 'circle-open');
      cd.push([h, fmtU(r[o], 2), fmtU(r[o + 1], 2), r[o + 2] === null ? '∞' : fmtU(r[o + 2], 2), pTxt('p', r[o + 3]), r[k === 'EN' ? 0 : 2], r[1]]);
    });
    traces.push({ x, y, mode: 'markers', name: D.phaseName(k), marker: { size: 10, color: D.phaseColor(k), symbol: sym, line: { width: 2, color: D.phaseColor(k) } },
      error_x: { type: 'data', symmetric: false, array: hi, arrayminus: lo, color: D.phaseColor(k), thickness: 1.5, width: 0 }, customdata: cd,
      hovertemplate: `<b>${D.phaseName(k)}: %{customdata[1]}×</b> (95% CI %{customdata[2]}–%{customdata[3]})<br>%{customdata[0]} · %{customdata[4]}<br>%{customdata[5]} events vs %{customdata[6]} in Neutral periods<extra></extra>` });
  });
  HAZ.forEach(h => { const r = rateRow(state.scope, h); if (r) rows.push([h, r[0], r[1], r[2], fmtU(r[9], 2), `${fmtU(r[10], 2)}–${r[11] === null ? '∞' : fmtU(r[11], 2)}`, fmtU(r[12], 3), fmtU(r[13], 2), `${fmtU(r[14], 2)}–${r[15] === null ? '∞' : fmtU(r[15], 2)}`, fmtU(r[16], 3)]); });
  if (!rows.length) return D.noData('p-ratios', 'No recorded events for this area.');
  $('#ratios-desc').textContent = `Rate during El Niño and La Niña divided by the rate during Neutral periods, ${scopeLabel[state.scope]}. Filled markers: p < 0.05. Logarithmic axis, capped at 0.1 and 10.`;
  const l = D.baseLayout({ showlegend: true, legend: { orientation: 'h', y: 1.08, x: 0 }, margin: { l: 190, r: 16, t: 24, b: 40 },
    xaxis: { type: 'log', range: [-1, 1], title: { text: 'Rate ratio (×, compared with Neutral)' }, tickvals: [0.1, 0.25, 0.5, 1, 2, 4, 10], ticktext: ['0.1', '0.25', '0.5', '1', '2', '4', '10'] },
    yaxis: { tickvals: HAZ.map((h, i) => i), ticktext: HAZ, autorange: 'reversed', showgrid: false, range: [HAZ.length - 0.5, -0.5] } });
  l.shapes = [{ type: 'line', x0: 1, x1: 1, yref: 'paper', y0: 0, y1: 1, line: { color: css('--axis'), width: 1 } }];
  D.plot('p-ratios', traces, l);
  D.setTable('ratios', ['Hazard', 'Events EN', 'Neutral', 'LN', 'Ratio EN', '95% CI', 'p', 'Ratio LN', '95% CI', 'p'], rows);
}

// ---------- Sensitivity to RONI ----------
// Sensitivity row: [events, IRR, low, high, p, Spearman, p]
function renderSens() {
  const sens = (X.sensitivity[state.scope]) || {};
  const y = [], x = [], lo = [], hi = [], cd = [], sym = [], rows = [];
  const ink = css('--ink-2');
  HAZ.forEach((h, i) => {
    const s = sens[h]; if (!s) return;
    const v = clampLog(s[1], 0.25, 4), l = clampLog(s[2], 0.25, 4), u = clampLog(s[3], 0.25, 4);
    y.push(i); x.push(v); lo.push(v - l); hi.push(u - v);
    sym.push(s[4] !== null && s[4] < 0.05 ? 'circle' : 'circle-open');
    cd.push([h, fmtU(s[1], 2), fmtU(s[2], 2), fmtU(s[3], 2), pTxt('p', s[4]), fmt(s[5]), pTxt('p', s[6]), s[0]]);
    rows.push([h, s[0], fmtU(s[1], 2), `${fmtU(s[2], 2)}–${fmtU(s[3], 2)}`, fmtU(s[4], 3), fmt(s[5]), fmtU(s[6], 3)]);
  });
  if (!rows.length) return D.noData('p-sens', 'Too few events (fewer than 10) to estimate for this area.');
  const l = D.baseLayout({ margin: { l: 190, r: 16, t: 10, b: 40 },
    xaxis: { type: 'log', range: [Math.log10(0.25), Math.log10(4)], title: { text: 'Change in yearly events per +1 °C RONI (×)' }, tickvals: [0.25, 0.5, 0.75, 1, 1.5, 2, 4], ticktext: ['0.25', '0.5', '0.75', '1', '1.5', '2', '4'] },
    yaxis: { tickvals: HAZ.map((h, i) => i), ticktext: HAZ, showgrid: false, range: [HAZ.length - 0.5, -0.5] } });
  l.shapes = [{ type: 'line', x0: 1, x1: 1, yref: 'paper', y0: 0, y1: 1, line: { color: css('--axis'), width: 1 } }];
  D.plot('p-sens', [{ x, y, mode: 'markers', marker: { size: 10, color: ink, symbol: sym, line: { width: 2, color: ink } },
    error_x: { type: 'data', symmetric: false, array: hi, arrayminus: lo, color: ink, thickness: 1.5, width: 0 }, customdata: cd,
    hovertemplate: '<b>%{customdata[1]}× per +1 °C</b> (95% CI %{customdata[2]}–%{customdata[3]})<br>%{customdata[0]} · %{customdata[4]} · %{customdata[7]} events<br>Spearman correlation of yearly counts with RONI: %{customdata[5]} (%{customdata[6]})<extra></extra>' }], l);
  D.setTable('sens', ['Hazard', 'Events', 'Rate ratio per +1 °C', '95% CI', 'p', 'Spearman', 'p'], rows);
}

// ---------- Timeline by ENSO year ----------
function renderTimeline() {
  const Y = M.enso_years;
  const yrs = [], roni = [], ph = [];
  Y.year.forEach((y, i) => { if (y >= state.tl[0] && y <= state.tl[1]) { yrs.push(y); roni.push(Y.roni[i]); ph.push(Y.phase[i]); } });
  const counts = Object.fromEntries(yrs.map(y => [y, 0]));
  selected().forEach(i => { const ix = ev.index[i], m = ix % 12 + 1, y = Math.floor(ix / 12), ey = m >= 6 ? y : y - 1; if (ey in counts) counts[ey]++; });
  const labels = yrs.map(y => `${y}/${String(y + 1).slice(2)}`);
  $('#timeline-title').textContent = D.tc(`${state.hazard} per ENSO year, ${scopeLabel[state.scope]}`);
  const top = PH.map(([k, n]) => { const idx = yrs.map((y, i) => i).filter(i => ph[i] === k); return {
    type: 'bar', x: idx.map(i => labels[i]), y: idx.map(i => roni[i]), marker: { color: D.phaseColor(k) }, name: n, xaxis: 'x', yaxis: 'y',
    hovertemplate: `RONI <b>%{y:+.2f}</b> · %{x} · ${n}<extra></extra>` }; });
  const bottom = PH.map(([k, n]) => { const idx = yrs.map((y, i) => i).filter(i => ph[i] === k); return {
    type: 'bar', x: idx.map(i => labels[i]), y: idx.map(i => counts[yrs[i]]), marker: { color: D.phaseColor(k) }, name: n, showlegend: false, xaxis: 'x', yaxis: 'y2',
    hovertemplate: `<b>%{y} events</b> · %{x} · ${n}<extra></extra>` }; });
  const l = D.baseLayout({ grid: { rows: 2, columns: 1, pattern: 'coupled', roworder: 'top to bottom', ygap: 0.18 }, barmode: 'overlay', bargap: 0.25,
    showlegend: true, legend: { orientation: 'h', y: 1.1, x: 0 }, margin: { l: 56, r: 16, t: 24, b: 50 },
    xaxis: { type: 'category', categoryorder: 'array', categoryarray: labels, tickangle: -45, showgrid: false },
    yaxis: { title: { text: 'RONI (DJF)' }, zeroline: true, domain: [0.62, 1] }, yaxis2: { title: { text: 'Events' }, domain: [0, 0.5], rangemode: 'tozero' } });
  D.plot('p-timeline', [...top, ...bottom], l);
  D.setTable('timeline', ['ENSO year', 'Phase', 'RONI (DJF)', 'Events'], yrs.map((y, i) => [labels[i], D.phaseName(ph[i]), fmt(roni[i]), counts[y]]));
}

// ---------- Subregion x hazard heat table ----------
function renderSubHeat() {
  const o = state.phase === 'EN' ? 9 : 13, nIdx = state.phase === 'EN' ? 0 : 2;
  $('#subheat-title').textContent = D.tc(`${D.phaseName(state.phase)} compared with Neutral, by UN subregion and hazard`);
  const z = [], text = [], hover = [], rows = [];
  SUBS.forEach(id => {
    const zr = [], tr = [], hr = [], row = [scopeLabel[id]];
    HAZ.forEach(h => {
      const r = rateRow(id, h);
      const enough = r && r[nIdx] + r[1] >= MIN_RATIO_EVENTS;
      const rr = enough ? r[o] : null;
      zr.push(!enough ? null : rr > 0 ? Math.max(-2, Math.min(2, Math.log2(rr))) : -2);
      tr.push(enough && r[o + 3] !== null && r[o + 3] < 0.05 ? '●' : '');
      hr.push(!r ? `${scopeLabel[id]} · ${h}<br>no recorded events`
        : !enough ? `${scopeLabel[id]} · ${h}<br>too few events for a ratio (${r[nIdx]} vs ${r[1]} in Neutral periods)`
        : `<b>${fmtU(rr, 2)}×</b> ${pTxt('p', r[o + 3])}<br>${scopeLabel[id]} · ${h}<br>${r[nIdx]} events vs ${r[1]} in Neutral periods`);
      row.push(enough ? fmtU(rr, 2) + (r[o + 3] < 0.05 ? '*' : '') : '');
    });
    z.push(zr); text.push(tr); hover.push(hr); rows.push(row);
  });
  const l = D.baseLayout({ margin: { l: 170, r: 8, t: 6, b: 80 }, xaxis: { showgrid: false, tickangle: -40, tickfont: { size: 11 } }, yaxis: { showgrid: false, autorange: 'reversed', tickfont: { size: 11 } } });
  const xi = HAZ.indexOf(state.hazard), yi = SUBS.indexOf(state.scope);
  l.shapes = [];
  if (xi >= 0) l.shapes.push({ type: 'rect', x0: xi - 0.5, x1: xi + 0.5, y0: -0.5, y1: SUBS.length - 0.5, line: { color: css('--ink'), width: 1.5 } });
  if (yi >= 0) l.shapes.push({ type: 'rect', x0: -0.5, x1: HAZ.length - 0.5, y0: yi - 0.5, y1: yi + 0.5, line: { color: css('--ink'), width: 1.5 } });
  D.plot('p-subheat', [{ type: 'heatmap', x: HAZ.map(short), y: SUBS.map(id => scopeLabel[id]), z, text, customdata: hover, texttemplate: '%{text}', textfont: { color: css('--ink'), size: 10 },
    hovertemplate: '%{customdata}<extra></extra>', colorscale: D.divergingScale(), zmin: -2, zmax: 2, xgap: 2, ygap: 2,
    colorbar: { thickness: 10, len: 0.8, outlinewidth: 0, tickvals: [-2, -1, 0, 1, 2], ticktext: ['¼×', '½×', '1×', '2×', '4×'], tickfont: { color: css('--muted'), size: 11 } } }], l);
  const n = document.getElementById('p-subheat');
  if (!n.dataset.bound) { n.dataset.bound = '1'; n.on('plotly_click', ev2 => { const p = ev2.points[0]; state.scope = SUBS[p.pointIndex[0]]; state.hazard = HAZ[p.pointIndex[1]]; render(); }); }
  D.setTable('subheat', ['UN subregion', ...HAZ], rows);
}

// ---------- Events per year in each phase ----------
function renderRates() {
  const r = rateRow(state.scope, state.hazard);
  $('#rates-title').textContent = D.tc(`${state.hazard}: events per year in each phase`);
  if (!r) return D.noData('p-rates', 'No recorded events for this selection.');
  const yrs = PH.map(([k]) => years(state.lag, k));
  const rate = PH.map((p, j) => r[j] / yrs[j]);
  D.plot('p-rates', [{ type: 'bar', x: PH.map(p => p[1]), y: rate, marker: { color: PH.map(([k]) => D.phaseColor(k)) },
    error_y: { type: 'data', symmetric: false, array: PH.map((p, j) => r[6 + j] - rate[j]), arrayminus: PH.map((p, j) => rate[j] - r[3 + j]), color: css('--muted'), thickness: 1, width: 4 },
    customdata: PH.map((p, j) => [r[j], fmtU(yrs[j], 1), fmtU(r[3 + j], 2), fmtU(r[6 + j], 2)]),
    hovertemplate: '<b>%{y:.2f} events per year</b> (95% CI %{customdata[2]}–%{customdata[3]})<br>%{x}: %{customdata[0]} events in %{customdata[1]} years<extra></extra>' }],
    D.baseLayout({ bargap: 0.4, yaxis: { title: { text: 'Events per year in phase' }, rangemode: 'tozero' }, xaxis: { showgrid: false } }));
  D.setTable('rates', ['Phase', 'Events', 'Years in phase', 'Per year', '95% CI'], PH.map((p, j) => [p[1], r[j], fmtU(yrs[j], 2), fmtU(rate[j], 2), `${fmtU(r[3 + j], 2)}–${fmtU(r[6 + j], 2)}`]));
}

// ---------- Country map ----------
function renderMap() {
  const o = state.phase === 'EN' ? 9 : 13;
  const iso = [], z = [], op = [], cd = [], rows = [];
  COUNTRIES.forEach(id => {
    const r = rateRow(id, state.hazard);
    if (!r || r[state.phase === 'EN' ? 0 : 2] + r[1] < MIN_RATIO_EVENTS) return;
    const rr = r[o] > 0 ? r[o] : null;
    iso.push(id); z.push(rr === null ? -2 : Math.max(-2, Math.min(2, Math.log2(rr))));
    const sig = r[o + 3] !== null && r[o + 3] < 0.05;
    op.push(sig ? 1 : 0.4);
    cd.push([scopeLabel[id], rr === null ? '0' : fmtU(rr, 2), pTxt('p', r[o + 3]), r[state.phase === 'EN' ? 0 : 2], r[1], subOfIso[id]]);
    rows.push([scopeLabel[id], subOfIso[id], r[state.phase === 'EN' ? 0 : 2], r[1], rr === null ? '0' : fmtU(rr, 2), fmtU(r[o + 3], 3)]);
  });
  $('#map-title').textContent = D.tc(`${state.hazard}: ${D.phaseName(state.phase)} compared with Neutral, by country`);
  $('#map-desc').textContent = `Rate ratio for countries with at least ${MIN_RATIO_EVENTS} events in the two periods compared. Red: more frequent than in Neutral periods; blue: less frequent. Faded: p ≥ 0.05. Click a country to select it.`;
  if (!iso.length) return D.noData('p-map', `No country has ${MIN_RATIO_EVENTS} or more events of this hazard in the periods compared.`);
  D.plot('p-map', [{ type: 'choropleth', locationmode: 'ISO-3', locations: iso, z, customdata: cd, colorscale: D.divergingScale(), zmin: -2, zmax: 2,
    marker: { opacity: op, line: { color: css('--surface'), width: 0.4 } },
    hovertemplate: '<b>%{customdata[1]}×</b> %{customdata[2]}<br>%{customdata[0]} · %{customdata[5]}<br>%{customdata[3]} events vs %{customdata[4]} in Neutral periods<extra></extra>',
    colorbar: { thickness: 10, len: 0.8, outlinewidth: 0, tickvals: [-2, -1, 0, 1, 2], ticktext: ['¼×', '½×', '1×', '2×', '4×'], tickfont: { color: css('--muted'), size: 11 } } }],
    D.mapLayout());
  const n = document.getElementById('p-map');
  if (!n.dataset.bound) { n.dataset.bound = '1'; n.on('plotly_click', e => { const id = e.points[0].location; if (scopeLabel[id]) { state.scope = id; render(); } }); }
  D.setTable('map', ['Country', 'UN subregion', `Events (${D.phaseName(state.phase)})`, 'Events (Neutral)', 'Rate ratio', 'p'], rows.sort((a, b) => a[0].localeCompare(b[0])));
}

// ---------- Impacts ----------
// Impact row: [reported EN, NEU, LN, median EN, NEU, LN, per year EN, NEU, LN, Wilcoxon p EN, LN, Spearman of totals, p]
function impactRow() { return (((X.impacts[state.measure] || {})[state.scope]) || {})[state.hazard]; }
function renderImpact() {
  const m = state.measure, info = MEASURES[m];
  const ids = selected().filter(i => ev[m.toLowerCase()][i] !== null && ev[m.toLowerCase()][i] > 0);
  $('#impact-title').textContent = D.tc(`${state.hazard}: ${info.label} per event`);
  const row = impactRow();
  const pText = state.lag !== '0' ? 'Rank-sum tests are computed with the phase at the start of each event; choose "At start" to see them.'
    : row ? `Median: El Niño ${fmtU(row[3], 1)}, Neutral ${fmtU(row[4], 1)}, La Niña ${fmtU(row[5], 1)} ${info.unit}. Rank-sum test against Neutral: El Niño ${pTxt('p', row[9])}, La Niña ${pTxt('p', row[10])}.` : 'Too few events with a reported value for tests.';
  $('#impact-desc').textContent = `${ids.length.toLocaleString()} events with a reported value above zero. Logarithmic axis. ${pText}`;
  if (ids.length < 3) return D.noData('p-impact', 'Too few events with a reported value.');
  const key = m.toLowerCase();
  const traces = PH.map(([k, n]) => {
    const sel = ids.filter(i => phaseOf(i) === k), c = D.phaseColor(k);
    return { type: 'box', name: n, y: sel.map(i => ev[key][i]), text: sel.map(i => `${scopeLabel[ev.iso[i]] || ev.iso[i]}, ${D.monthLabel(ev.index[i])}`),
      boxpoints: 'all', jitter: 0.5, pointpos: 0, marker: { color: c, size: 5, opacity: 0.7 }, line: { color: c, width: 1.5 }, fillcolor: D.rgba(c, 0.08),
      hovertemplate: `<b>%{y:,.0f} ${info.unit}</b><br>%{text}<extra></extra>` };
  });
  D.plot('p-impact', traces, D.baseLayout({ yaxis: { type: 'log', title: { text: `${info.unit} (log scale)` } }, xaxis: { showgrid: false } }));
  D.setTable('impact', ['Phase', 'Events with value', 'Median', 'Mean'], PH.map(([k, n]) => {
    const v = ids.filter(i => phaseOf(i) === k).map(i => ev[key][i]).sort((a, b) => a - b);
    return [n, v.length, v.length ? fmtU(D.median(v), 1) : '–', v.length ? fmtU(v.reduce((s, x) => s + x, 0) / v.length, 1) : '–'];
  }));
}
function renderBurden() {
  const m = state.measure, info = MEASURES[m], key = m.toLowerCase();
  const ids = selected().filter(i => ev[key][i] !== null);
  const tot = PH.map(([k]) => ids.filter(i => phaseOf(i) === k).reduce((s, i) => s + ev[key][i], 0));
  const per = PH.map(([k], j) => tot[j] / years(state.lag, k));
  $('#burden-title').textContent = D.tc(`${state.hazard}: ${info.label} per year in each phase`);
  const row = impactRow();
  $('#burden-desc').textContent = `Sum of ${info.label} over events starting in each phase, divided by the years spent in that phase. ${row ? `Spearman correlation of yearly totals with RONI: ${fmt(row[11])} (${pTxt('p', row[12])}).` : ''}`;
  if (!ids.length) return D.noData('p-burden', 'No events with a reported value.');
  D.plot('p-burden', [{ type: 'bar', x: PH.map(p => p[1]), y: per, marker: { color: PH.map(([k]) => D.phaseColor(k)) },
    customdata: PH.map((p, j) => [tot[j].toLocaleString(undefined, { maximumFractionDigits: 0 }), fmtU(years(state.lag, p[0]), 1)]),
    hovertemplate: `<b>%{y:,.0f} ${info.unit} per year</b><br>%{x}: %{customdata[0]} in %{customdata[1]} years<extra></extra>` }],
    D.baseLayout({ bargap: 0.4, yaxis: { title: { text: `${info.unit} per year` }, rangemode: 'tozero' }, xaxis: { showgrid: false } }));
  D.setTable('burden', ['Phase', 'Total', 'Years in phase', 'Per year'], PH.map(([k, n], j) => [n, fmtU(tot[j], 0), fmtU(years(state.lag, k), 2), fmtU(per[j], 1)]));
}
function renderLargest() {
  const m = state.measure, info = MEASURES[m], key = m.toLowerCase();
  const ids = selected().filter(i => ev[key][i] !== null && ev[key][i] > 0).sort((a, b) => ev[key][b] - ev[key][a]).slice(0, 10);
  $('#largest-title').textContent = D.tc(`Largest events by ${info.label}`);
  const box = $('#largest'); box.textContent = '';
  if (!ids.length) { box.appendChild(el('div', { class: 'empty' }, 'No events with a reported value.')); return; }
  const table = el('table', { class: 'data' });
  const hr = el('tr'); ['Phase', 'Start', 'Country', 'Event', info.unit].forEach(h => hr.appendChild(el('th', {}, h)));
  table.appendChild(el('thead')).appendChild(hr);
  const tb = el('tbody');
  ids.forEach(i => {
    const row = el('tr');
    const c1 = el('td'); const k = el('span', { class: 'key' }); k.style.background = D.phaseColor(phaseOf(i)); c1.append(k, D.phaseName(phaseOf(i)));
    const nm = ev.name[i] ? `${X.subtypes[ev.subtype[i]]}: ${ev.name[i]}` : X.subtypes[ev.subtype[i]];
    const c4 = el('td', {}, nm); c4.style.whiteSpace = 'normal'; c4.style.textAlign = 'left';
    row.append(c1, el('td', {}, D.monthLabel(ev.index[i])), el('td', {}, scopeLabel[ev.iso[i]] || ev.iso[i]), c4, el('td', {}, Math.round(ev[key][i]).toLocaleString()));
    tb.appendChild(row);
  });
  table.appendChild(tb); box.appendChild(table);
}

function render() {
  syncControls(); renderHead();
  renderRatios(); renderSens(); renderTimeline(); renderSubHeat(); renderRates(); renderMap(); renderImpact(); renderBurden(); renderLargest();
}
D.bindTableButtons();
D.initHeader(render);
readHash();
fillControls();
window.addEventListener('hashchange', () => { readHash(); render(); });
render();
})();
