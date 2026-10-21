// ENSO climate dashboard: ENSO: Global Variations page (assets/pages/global.html).
(() => {
'use strict';
const E = window.ENSO, D = window.DASH, M = E.meta, G = E.global;
if (!M || !G || !window.Plotly) {
  document.querySelector('main').innerHTML = '<p class="empty">The dashboard data or the charting library did not load. Run Scripts/Step09_DashboardData.R and check the internet connection (Plotly loads from a CDN).</p>';
  return;
}
D.init(M);
const { $, el, css, fmt, fmtU } = D;

const E_ = M.enso;
const lastIdx = E_.index[E_.index.length - 1];
const firstYear = Math.floor(E_.index[0] / 12), lastYear = Math.floor(lastIdx / 12);
// hist: the years shown in the history section, set by the slider.
const state = { gv: 'PRE', gp: 'DJF', layer: 'rL', gb: 'B9120', ep: 'all', hist: [firstYear, lastYear] };
const inHist = ix => { const y = Math.floor(ix / 12); return y >= state.hist[0] && y <= state.hist[1]; };
const subOf = Object.fromEntries(M.countries.iso.map((iso, i) => [iso, M.countries.subregion[i]]));
const SUBREGIONS = [...new Set(M.countries.subregion)];
const openCountry = (iso, v, p) => D.go('country', `#${iso}/${v}/${p}/variation`);

// ---------- RONI history ----------
function renderRoni() {
  const traces = D.PHASES.map(([k, n]) => {
    const ix = E_.index.map((x, i) => i).filter(i => E_.phase[i] === k && inHist(E_.index[i]));
    return { type: 'bar', name: n, x: ix.map(i => D.dateOf(E_.index[i])), y: ix.map(i => E_.roni[i]), marker: { color: D.phaseColor(k), line: { width: 0 } },
      hovertemplate: `<b>%{y:+.2f}</b> · %{x|%b %Y} · ${n}<extra></extra>` };
  });
  const l = D.baseLayout({
    barmode: 'overlay', bargap: 0, showlegend: true, legend: { orientation: 'h', y: 1.12, x: 0 },
    margin: { l: 44, r: 10, t: 30, b: 30 }, yaxis: { title: { text: 'RONI (°C)' }, zeroline: true },
    xaxis: { type: 'date', showgrid: false, range: [`${state.hist[0]}-01-01`, `${state.hist[1]}-12-31`] }
  });
  l.shapes = [0.5, -0.5].map(y => ({ type: 'line', xref: 'paper', x0: 0, x1: 1, y0: y, y1: y, line: { color: css('--axis'), width: 1 } }));
  D.plot('p-roni', traces, l);
  D.setTable('roni', ['Month', 'RONI', 'Phase'], E_.index.map((x, i) => [x, i]).filter(([x]) => inHist(x)).map(([x, i]) => [D.monthLabel(x), fmt(E_.roni[i]), D.phaseName(E_.phase[i])]).reverse());
}

// ---------- ENSO calendar ----------
function renderCalendar() {
  const years = []; for (let y = state.hist[1]; y >= state.hist[0]; y--) years.push(y);
  const pos = Object.fromEntries(E_.index.map((x, i) => [x, i]));
  const z = years.map(y => D.MONTHS.map((m, j) => { const i = pos[y * 12 + j]; return i === undefined ? null : E_.roni[i]; }));
  const cd = years.map(y => D.MONTHS.map((m, j) => { const i = pos[y * 12 + j]; return i === undefined ? '' : D.phaseName(E_.phase[i]); }));
  D.plot('p-calendar', [{
    type: 'heatmap', x: D.MONTHS, y: years.map(String), z, customdata: cd, colorscale: D.divergingScale(), zmin: -2.5, zmax: 2.5, xgap: 1, ygap: 1,
    hovertemplate: '<b>%{z:+.2f}</b> · %{x} %{y}<br>%{customdata}<extra></extra>',
    colorbar: { thickness: 10, len: 0.6, outlinewidth: 0, title: { text: 'RONI', font: { size: 11, color: css('--muted') } }, tickfont: { color: css('--muted'), size: 11 } }
  }], D.baseLayout({ margin: { l: 44, r: 10, t: 6, b: 28 }, xaxis: { showgrid: false, side: 'top' }, yaxis: { showgrid: false, dtick: years.length > 30 ? 5 : 1, type: 'category' } }));
  D.setTable('calendar', ['Year', ...D.MONTHS], years.map((y, r) => [y, ...z[r].map(v => v === null ? '' : fmt(v))]));
}

// ---------- ENSO years by decade ----------
function renderDecades() {
  const yrs = M.enso_years;
  const decades = {};
  yrs.year.forEach((y, i) => { if (y < 1950) return; const d = Math.floor(y / 10) * 10; decades[d] = decades[d] || { EN: 0, NEU: 0, LN: 0 }; decades[d][yrs.phase[i]]++; });
  const keys = Object.keys(decades).map(Number).sort();
  const labels = keys.map(d => `${d}s`);
  const traces = D.PHASES.map(([k, n]) => ({ type: 'bar', name: n, x: labels, y: keys.map(d => decades[d][k]), marker: { color: D.phaseColor(k) },
    hovertemplate: `<b>%{y}</b> ${n} years · %{x}<extra></extra>` }));
  D.plot('p-decades', traces, D.baseLayout({ barmode: 'stack', bargap: 0.35, showlegend: true, legend: { orientation: 'h', y: 1.06, x: 0 }, margin: { l: 36, r: 10, t: 30, b: 36 }, yaxis: { title: { text: 'ENSO years' }, dtick: 2 }, xaxis: { showgrid: false } }));
  D.setTable('decades', ['Decade', 'El Niño', 'Neutral', 'La Niña'], keys.map(d => [`${d}s`, decades[d].EN, decades[d].NEU, decades[d].LN]));
}

// ---------- Niño regions ----------
function renderNino() {
  const regions = [['n12', 'Niño 1+2'], ['n3', 'Niño 3'], ['n34', 'Niño 3.4'], ['n4', 'Niño 4']];
  const first = E_.n34.findIndex(x => x !== null);
  const keep = E_.index.map((ix, i) => i).filter(i => i >= first && inHist(E_.index[i]));
  if (!keep.length) return D.noData('p-nino', 'The Niño region series start in 1982; move the slider to include later years.');
  const idx = keep.map(i => E_.index[i]);
  const x = idx.map(D.dateOf);
  const ink = css('--ink-2');
  const traces = regions.map(([k, n], r) => ({
    x, y: keep.map(i => E_[k][i]), mode: 'lines', line: { color: ink, width: 1.5 }, fill: 'tozeroy', fillcolor: D.rgba(ink, 0.12),
    xaxis: 'x', yaxis: r ? `y${r + 1}` : 'y', name: n, hovertemplate: `${n}: <b>%{y:+.2f} °C</b> · %{x|%b %Y}<extra></extra>`
  }));
  const extra = { grid: { rows: 4, columns: 1, pattern: 'coupled', roworder: 'top to bottom', ygap: 0.25 }, margin: { l: 44, r: 10, t: 16, b: 30 }, xaxis: { type: 'date', showgrid: false } };
  regions.forEach(([k, n], r) => { extra[r ? `yaxis${r + 1}` : 'yaxis'] = { zeroline: true, title: { text: '°C' } }; });
  const l = D.baseLayout(extra);
  l.annotations = regions.map(([k, n], r) => ({ text: `<b>${n}</b>`, xref: 'paper', yref: `${r ? 'y' + (r + 1) : 'y'} domain`, x: 0.005, y: 1.18, xanchor: 'left', showarrow: false, font: { size: 12, color: css('--ink') } }));
  l.shapes = regions.flatMap(([k], r) => [0.5, -0.5].map(y => ({ type: 'line', xref: 'paper', yref: r ? `y${r + 1}` : 'y', x0: 0, x1: 1, y0: y, y1: y, line: { color: css('--axis'), width: 1 } })));
  D.plot('p-nino', traces, l);
  D.setTable('nino', ['Month', ...regions.map(r => r[1])], keep.map(i => [D.monthLabel(E_.index[i]), ...regions.map(([k]) => fmt(E_[k][i]))]).reverse());
}

// ---------- Episodes ----------
function renderEpisodes() {
  const ep = M.episodes, box = $('#episodes'); box.textContent = '';
  const table = el('table', { class: 'data' });
  const hr = el('tr'); ['Phase', 'Start', 'End', 'Months', 'Peak RONI', 'Peak month', 'Strength', 'Type'].forEach(h => hr.appendChild(el('th', {}, h)));
  table.appendChild(el('thead')).appendChild(hr);
  const tb = el('tbody');
  const order = ep.Episode.map((e, i) => i).reverse();
  order.forEach(i => {
    const code = ep.Phase[i] === 'El Niño' ? 'EN' : 'LN';
    if (state.ep !== 'all' && state.ep !== code) return;
    if (Number(ep.End[i].slice(0, 4)) < state.hist[0] || Number(ep.Start[i].slice(0, 4)) > state.hist[1]) return;
    const row = el('tr');
    const first = el('td'); const k = el('span', { class: 'key' }); k.style.background = D.phaseColor(code); first.append(k, ep.Phase[i]);
    row.append(first, el('td', {}, ep.Start[i]), el('td', {}, ep.End[i]), el('td', {}, ep.Months[i]), el('td', {}, fmt(ep.Peak_RONI[i])),
      el('td', {}, ep.Peak_Month[i]), el('td', {}, ep.Strength[i]), el('td', {}, ep.Type[i] || ''));
    tb.appendChild(row);
  });
  table.appendChild(tb); box.appendChild(table);
}

// ---------- Teleconnections ----------
function layerValues() {
  const L = ((G.layers[state.gv] || {})[state.gp]) || null;
  if (!L) return null;
  const b1 = state.gb === 'B6190';
  if (state.layer === 'rL') return { v: L.rL, sig: L.qL.map(q => q !== null && q < 0.05), unit: 'Correlation Coefficient', zmax: 0.8, label: 'correlation with RONI, 1951–2025', test: 'q < 0.05' };
  if (state.layer === 'rR') return { v: L.rR, sig: L.qR.map(q => q !== null && q < 0.05), unit: 'Correlation Coefficient', zmax: 0.8, label: 'correlation with RONI, 1991–2025', test: 'q < 0.05' };
  if (state.layer === 'en') return { v: b1 ? L.enZ1 : L.enZ2, sig: L.enP.map(p => p !== null && p < 0.05), unit: 'Difference (SD)', zmax: 1.5, label: `El Niño − Neutral (SD of ${D.BL[state.gb]})`, test: 'p < 0.05' };
  return { v: b1 ? L.lnZ1 : L.lnZ2, sig: L.lnP.map(p => p !== null && p < 0.05), unit: 'Difference (SD)', zmax: 1.5, label: `La Niña − Neutral (SD of ${D.BL[state.gb]})`, test: 'p < 0.05' };
}
function choropleth(id, values, sig, zmax, unit, sign, ticktext, onClick) {
  const names = G.iso.map(D.countryName);
  const trace = {
    type: 'choropleth', locationmode: 'ISO-3', locations: G.iso, z: values.map(x => x === null || x === undefined ? null : sign * x),
    customdata: G.iso.map((iso, i) => [names[i], values[i] === null || values[i] === undefined ? '–' : fmt(values[i]), sig[i] ? 'significant' : 'not significant', subOf[iso]]),
    hovertemplate: `${unit}: <b>%{customdata[1]}</b><br>%{customdata[0]} · %{customdata[3]}<br>%{customdata[2]}<extra></extra>`,
    colorscale: D.divergingScale(), zmin: -zmax, zmax, marker: { opacity: sig.map(s => s ? 1 : 0.4), line: { color: css('--surface'), width: 0.4 } },
    colorbar: { thickness: 10, len: 0.8, outlinewidth: 0, tickvals: [-zmax, 0, zmax], ticktext, tickfont: { color: css('--muted'), size: 11 } }
  };
  D.plot(id, [trace], D.mapLayout());
  const n = document.getElementById(id);
  if (!n.dataset.bound) { n.dataset.bound = '1'; n.on('plotly_click', ev => onClick(ev.points[0].location)); }
  return names;
}
function renderTele() {
  const v = state.gv, p = state.gp, V = D.VARS[v], sign = D.WARM_DRY[v];
  const lv = layerValues();
  if (!lv) { D.noData('p-map'); D.noData('p-subregions'); D.noData('p-ranking'); return; }
  $('#map-title').textContent = D.tc(`${V.name}, ${D.periodName(p)}: ${lv.label}`);
  $('#map-desc').textContent = `Red: warmer or drier; blue: cooler or wetter. Faded countries are not significant (${lv.test}). Click a country to open its deep dive.`;
  const tick = state.layer.startsWith('r') ? ['El Niño cooler / wetter', '0', 'El Niño warmer / drier'] : ['cooler / wetter', '0', 'warmer / drier'];
  const names = choropleth('p-map', lv.v, lv.sig, lv.zmax, lv.unit, sign, tick, iso => { if (M.countries.iso.includes(iso)) openCountry(iso, state.gv, state.gp); });
  D.setTable('map', ['Country', 'UN subregion', lv.unit, 'Significant'], G.iso.map((iso, i) => [names[i], subOf[iso], fmt(lv.v[i]), lv.sig[i] ? 'yes' : '']).sort((a, b) => a[0].localeCompare(b[0])));

  // Subregion x period heat table.
  $('#sub-title').textContent = D.tc(`${V.name} by UN subregion and period: median ${lv.label}`);
  const z = [], text = [], hover = [], rows = [];
  SUBREGIONS.forEach(sr => {
    const members = G.iso.map((iso, i) => i).filter(i => subOf[G.iso[i]] === sr);
    const zr = [], tr = [], hr = [], row = [sr];
    D.PERIODS.forEach(pp => {
      const saveP = state.gp; state.gp = pp; const lp = layerValues(); state.gp = saveP;
      if (!lp) { zr.push(null); tr.push(''); hr.push(''); row.push(''); return; }
      const vals = members.map(i => lp.v[i]).filter(x => x !== null && x !== undefined);
      const nsig = members.filter(i => lp.sig[i]).length;
      const med = D.median(vals);
      zr.push(med === null ? null : sign * med);
      tr.push(vals.length && nsig / vals.length >= 0.5 ? '●' : '');
      hr.push(`${lp.unit} (median): <b>${fmt(med)}</b><br>${sr}, ${D.PLABEL[pp]}<br>${nsig} of ${vals.length} countries significant`);
      row.push(fmt(med));
    });
    z.push(zr); text.push(tr); hover.push(hr); rows.push(row);
  });
  const hl = D.baseLayout({ margin: { l: 170, r: 8, t: 6, b: 50 }, xaxis: { showgrid: false, tickangle: -45, tickfont: { size: 10.5 } }, yaxis: { showgrid: false, autorange: 'reversed', tickfont: { size: 11 } } });
  const xi = D.PERIODS.indexOf(p);
  hl.shapes = [{ type: 'rect', x0: xi - 0.5, x1: xi + 0.5, y0: -0.5, y1: SUBREGIONS.length - 0.5, line: { color: css('--ink'), width: 1.5 } }];
  D.plot('p-subregions', [{
    type: 'heatmap', x: D.PERIODS.map(pp => D.PLABEL[pp]), y: SUBREGIONS, z, text, customdata: hover, texttemplate: '%{text}', textfont: { color: css('--ink'), size: 10 },
    hovertemplate: '%{customdata}<extra></extra>', colorscale: D.divergingScale(), zmin: -lv.zmax / 1.5, zmax: lv.zmax / 1.5, xgap: 2, ygap: 2,
    colorbar: { thickness: 10, len: 0.8, outlinewidth: 0, tickvals: [-lv.zmax / 1.5, 0, lv.zmax / 1.5], ticktext: tick, tickfont: { color: css('--muted'), size: 11 } }
  }], hl);
  const sn = document.getElementById('p-subregions');
  if (!sn.dataset.bound) { sn.dataset.bound = '1'; sn.on('plotly_click', ev => { state.gp = D.PERIODS[ev.points[0].pointIndex[1]]; $('#g-period').value = state.gp; renderTele(); }); }
  D.setTable('subregions', ['UN subregion', ...D.PERIODS.map(pp => D.PLABEL[pp])], rows);

  // Ranking of the strongest links.
  const ranked = G.iso.map((iso, i) => ({ iso, i, v: lv.v[i], sig: lv.sig[i] })).filter(d => d.v !== null && d.v !== undefined)
    .sort((a, b) => Math.abs(b.v) - Math.abs(a.v)).slice(0, 20);
  D.plot('p-ranking', [{
    type: 'bar', orientation: 'h', y: ranked.map(d => D.countryName(d.iso)), x: ranked.map(d => d.v),
    marker: { color: ranked.map(d => sign * d.v > 0 ? css('--div-pos-2') : css('--div-neg-2')), opacity: ranked.map(d => d.sig ? 1 : 0.4) },
    customdata: ranked.map(d => [subOf[d.iso], d.sig ? 'significant' : 'not significant', d.iso]),
    hovertemplate: `${lv.unit}: <b>%{x:+.2f}</b><br>%{y} · %{customdata[0]}<br>%{customdata[1]}<extra></extra>`
  }], D.baseLayout({ margin: { l: 130, r: 12, t: 6, b: 36 }, yaxis: { autorange: 'reversed', showgrid: false, tickfont: { size: 11 } }, xaxis: { title: { text: lv.unit }, zeroline: true } }));
  const rn = document.getElementById('p-ranking');
  if (!rn.dataset.bound) { rn.dataset.bound = '1'; rn.on('plotly_click', ev => { openCountry(ev.points[0].customdata[2], state.gv, state.gp); }); }
  D.setTable('ranking', ['Country', 'UN subregion', lv.unit, 'Significant'], ranked.map(d => [D.countryName(d.iso), subOf[d.iso], fmt(d.v), d.sig ? 'yes' : '']));
}

// ---------- Controls ----------
function fillControls() {
  const gv = $('#g-var'), gp = $('#g-period');
  D.VAR_ORDER.forEach(v => gv.appendChild(el('option', { value: v }, `${D.VARS[v].name} (${v})`)));
  const gs = el('optgroup', { label: 'Seasons' }), gm = el('optgroup', { label: 'Months' }), gy = el('optgroup', { label: 'Year' });
  D.PERIODS.forEach(p => { const o = el('option', { value: p }, D.periodName(p)); (/^\d+$/.test(p) ? gm : p === 'ENSO_YR' ? gy : gs).appendChild(o); });
  gp.append(gs, gm, gy);
  gv.value = state.gv; gp.value = state.gp; $('#g-layer').value = state.layer;
  gv.addEventListener('change', e => { state.gv = e.target.value; renderTele(); });
  gp.addEventListener('change', e => { state.gp = e.target.value; renderTele(); });
  $('#g-layer').addEventListener('change', e => { state.layer = e.target.value; renderTele(); });
  D.bindSeg('g-baseline', v => { state.gb = v; D.syncSeg('g-baseline', v); renderTele(); });
  D.bindSeg('ep-filter', v => { state.ep = v; D.syncSeg('ep-filter', v); renderEpisodes(); });
  D.rangeSlider($('#hist-range'), { min: firstYear, max: lastYear, value: state.hist, onChange: v => { state.hist = v; renderRoni(); renderCalendar(); renderNino(); renderEpisodes(); } });
  D.syncSeg('g-baseline', state.gb); D.syncSeg('ep-filter', state.ep);
}

function renderAll() {
  renderRoni(); renderCalendar(); renderDecades(); renderNino(); renderEpisodes(); renderTele();
}
D.bindTableButtons();
D.initHeader(renderAll);
fillControls();
renderAll();
})();
