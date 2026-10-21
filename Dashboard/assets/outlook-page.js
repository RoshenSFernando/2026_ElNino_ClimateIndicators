// ENSO climate dashboard: ENSO: Outlook page (assets/pages/outlook.html). WMO Lead Centre forecasts: the Niño 3.4 multi-model forecast
// and the probabilistic multi-model seasonal forecasts by country and ADM1 region.
(() => {
'use strict';
const E = window.ENSO, D = window.DASH, M = E.meta, O = E.outlook;
if (!M || !O || !window.Plotly) {
  document.querySelector('main').insertAdjacentHTML('afterbegin', '<p class="empty">The outlook data or the charting library did not load. Run Scripts/Step12_WMO_AggregateADM1.R and check the internet connection (Plotly loads from a CDN).</p>');
  return;
}
D.init(M);
const { $, el, css, fmt, fmtU } = D;
const VAR_NAME = { TMP: 'Mean Temperature', PRE: 'Precipitation' };
// Colour: red is warmer or drier, blue cooler or wetter, gray near normal, as on the other pages.
const SIGN = { TMP: 1, PRE: -1 };
const CAT = { '-1': 'Below normal', '0': 'Near normal', '1': 'Above normal' };
const state = { v: 'TMP', p: O.periods[1] || O.periods[0], area: 'WORLD' };

// ---------- ENSO prediction ----------
function renderNino() {
  const N = O.nino;
  const msg = $('#nino-msg'); msg.textContent = '';
  if (!N) {
    $('#nino-desc').textContent = 'No Niño 3.4 forecast has been added for this issue yet.';
    const p1 = el('p', { class: 'desc' });
    p1.append('Source: the WMO Lead Centre for Long-Range Forecast Multi-Model Ensemble, ',
      el('a', { href: 'https://www.wmolc.org/seasonIndicesUI/plot_Indices', target: '_blank', rel: 'noopener' }, 'Seasonal › Forecast › Indices'),
      ' (choose Niño3.4 and the latest issue, then the Table view). It gives the forecast Niño 3.4 anomaly of each global prediction system and their multi-model mean for the next three seasons.');
    const p2 = el('p', { class: 'desc' },
      `To show it here, save the table export as Data/Raw/WMO/Nino34_Forecast_${O.issue_code}.csv, then rerun Scripts/Step12_WMO_AggregateADM1.R.`);
    const p3 = el('p', { class: 'desc' });
    p3.append('For a consolidated statement of the expected strength and the probabilities of El Niño, Neutral and La Niña conditions, see the ',
      el('a', { href: 'https://wmo.int/topics/el-nino-la-nina', target: '_blank', rel: 'noopener' }, 'WMO El Niño/La Niña Update'), '.');
    msg.append(p1, p2, p3);
    D.noData('p-nino', 'Niño 3.4 forecast not yet added.');
    document.querySelector('[data-chart="nino"] [data-table]').hidden = true;
    return;
  }
  const d = N.data, periods = N.periods, ink = css('--ink'), muted = css('--muted');
  // Headline: peak of the multi-model mean and the strength class it falls in.
  const mi = d.Model.map((x, i) => i).filter(i => /^mme$/i.test(d.Model[i]));
  let peak = '';
  if (mi.length) {
    const k = mi.reduce((a, i) => Math.abs(d.Nino34_Anomaly[i]) > Math.abs(d.Nino34_Anomaly[a]) ? i : a, mi[0]);
    const v = d.Nino34_Anomaly[k], a = Math.abs(v);
    const cls = a >= 2 ? 'very strong' : a >= 1.5 ? 'strong' : a >= 1 ? 'moderate' : a >= 0.5 ? 'weak' : 'neutral';
    peak = cls === 'neutral' ? `The multi-model mean stays within ±0.5 °C (neutral), peaking at ${fmt(v)} °C in ${d.Period[k]}. `
      : `The multi-model mean peaks at ${fmt(v)} °C in ${d.Period[k]}, a ${cls} ${v > 0 ? 'El Niño' : 'La Niña'}. `;
  }
  const nsys = N.models.filter(m => !/^mme$/i.test(m)).length;
  $('#nino-desc').textContent = `Issued ${O.issue}. ${peak}Thin lines: ${nsys} individual prediction systems (hover for names); thick line: multi-model mean. Hairlines mark the ENSO strength thresholds.`;
  const traces = N.models.map(m => {
    const mme = /^mme$/i.test(m);
    const ix = d.Model.map((x, i) => i).filter(i => d.Model[i] === m);
    return { x: ix.map(i => d.Period[i]), y: ix.map(i => d.Nino34_Anomaly[i]), mode: 'lines+markers', name: mme ? 'Multi-Model Mean' : m,
      line: { color: mme ? ink : D.rgba(muted, 0.7), width: mme ? 3 : 1.2 }, marker: { size: mme ? 8 : 4, color: mme ? ink : muted },
      showlegend: mme, hovertemplate: `${mme ? 'Multi-model mean' : m}: <b>%{y:+.2f} °C</b> · %{x}<extra></extra>` };
  });
  const l = D.baseLayout({ showlegend: true, legend: { orientation: 'h', y: 1.1, x: 0 }, margin: { l: 56, r: 90, t: 24, b: 40 },
    xaxis: { type: 'category', categoryorder: 'array', categoryarray: periods, showgrid: false }, yaxis: { title: { text: 'Niño 3.4 Anomaly (°C)' }, zeroline: true } });
  // Thresholds are drawn only on the side(s) of zero the forecasts reach, so they do not stretch the axis.
  const levels = [[0.5, 'Weak'], [1, 'Moderate'], [1.5, 'Strong'], [2, 'Very Strong']];
  const vals = d.Nino34_Anomaly.filter(x => x !== null);
  const sides = [...(vals.some(x => x > 0) ? [[1, 'El Niño']] : []), ...(vals.some(x => x < 0) ? [[-1, 'La Niña']] : [])];
  const lines = levels.flatMap(([y, t]) => sides.map(([s, ph]) => [s * y, `${t} ${ph}`]));
  l.shapes = lines.map(([v]) => ({ type: 'line', xref: 'paper', x0: 0, x1: 1, y0: v, y1: v, line: { color: css('--axis'), width: 1 } }));
  l.annotations = lines.map(([y, t]) => ({ xref: 'paper', x: 1.01, y, text: t, showarrow: false, xanchor: 'left', font: { size: 10, color: css('--muted') } }));
  D.plot('p-nino', traces, l);
  D.setTable('nino', ['Prediction System', ...periods], N.models.map(m => [m, ...periods.map(p => { const i = d.Model.findIndex((x, k) => x === m && d.Period[k] === p); return i < 0 ? '–' : fmt(d.Nino34_Anomaly[i]); })]));
}

// ---------- Seasonal forecasts by region ----------
function fillControls() {
  const seg = $('#f-period');
  O.periods.forEach(p => seg.appendChild(el('button', { 'data-v': p }, p)));
  const sel = $('#f-country');
  sel.appendChild(el('option', { value: 'WORLD' }, 'World (countries)'));
  const order = O.adm0.iso.map((iso, i) => i).sort((a, b) => O.adm0.name[a].localeCompare(O.adm0.name[b]));
  order.forEach(i => sel.appendChild(el('option', { value: O.adm0.iso[i] }, O.adm0.name[i])));
  D.bindSeg('f-var', v => { state.v = v; renderForecast(); });
  D.bindSeg('f-period', v => { state.p = v; renderForecast(); });
  sel.addEventListener('change', e => { state.area = e.target.value; renderForecast(); });
}
function renderForecast() {
  D.syncSeg('f-var', state.v); D.syncSeg('f-period', state.p); $('#f-country').value = state.area;
  const V = O.values[state.v][state.p];
  const world = state.area === 'WORLD';
  const src = world ? V.adm0 : V.adm1;
  const ids = world ? O.adm0.iso : O.adm1.id;
  const names = world ? O.adm0.name : O.adm1.name;
  const keep = ids.map((x, i) => i).filter(i => (world || O.adm1.iso[i] === state.area) && src.cat[i] !== null);
  const countryName = world ? 'World' : O.adm0.name[O.adm0.iso.indexOf(state.area)];
  $('#forecast-note').textContent = `WMO Lead Centre probabilistic multi-model forecast issued ${O.issue}, combining the latest runs of global prediction systems. Choose the climate indicator, the season and an area; click a country on the world map to see its regions.`;
  $('#fmap-title').textContent = D.tc(`${VAR_NAME[state.v]}, ${state.p}: most likely category${world ? ' by country' : ` by region, ${countryName}`}`);
  $('#fmap-desc').textContent = `${state.v === 'TMP' ? 'Red: warmer than normal; blue: cooler than normal' : 'Blue: wetter than normal; red: drier than normal'}; gray: near normal. Deeper colours mean higher probabilities.`;
  const z = keep.map(i => src.cat[i] * SIGN[state.v] * src.p[i]);
  const cd = keep.map(i => [names[i], CAT[String(src.cat[i])], src.p[i], Math.round(100 * src.below[i]), Math.round(100 * src.near[i]), Math.round(100 * src.above[i])]);
  const labels = state.v === 'TMP' ? ['Cooler Than Normal', 'Near Normal', 'Warmer Than Normal'] : ['Wetter Than Normal', 'Near Normal', 'Drier Than Normal'];
  const trace = {
    type: 'choropleth', locations: keep.map(i => ids[i]), z, customdata: cd, zmin: -100, zmax: 100, colorscale: D.divergingScale(),
    marker: { line: { color: css('--surface'), width: world ? 0.4 : 0.6 } },
    hovertemplate: '<b>%{customdata[1]}: %{customdata[2]}%</b><br>%{customdata[0]}<br>Share of area most likely below / near / above: %{customdata[3]}% / %{customdata[4]}% / %{customdata[5]}%<extra></extra>',
    colorbar: { thickness: 10, len: 0.8, outlinewidth: 0, tickvals: [-90, 0, 90], ticktext: labels, tickfont: { color: css('--muted'), size: 11 } }
  };
  let layout;
  if (world) {
    trace.locationmode = 'ISO-3';
    layout = D.mapLayout();
  } else {
    trace.geojson = E.adm1geo;
    trace.featureidkey = 'properties.shapeID';
    layout = D.baseLayout({ margin: { l: 0, r: 0, t: 0, b: 0 }, dragmode: false,
      geo: { projection: { type: 'equirectangular' }, fitbounds: 'locations', showframe: false, showcoastlines: false, bgcolor: 'rgba(0,0,0,0)',
        showland: true, landcolor: css('--grid'), showcountries: true, countrycolor: css('--axis') } });
  }
  D.plot('p-fmap', [trace], layout);
  const n = document.getElementById('p-fmap');
  if (!n.dataset.bound) { n.dataset.bound = '1'; n.on('plotly_click', ev => { if (state.area === 'WORLD' && O.adm0.iso.includes(ev.points[0].location)) { state.area = ev.points[0].location; renderForecast(); } }); }
  D.setTable('fmap', [world ? 'Country' : 'Region', 'Most Likely Category', 'Probability (%)', 'Area Below (%)', 'Area Near (%)', 'Area Above (%)'],
    cd.map(r => r.slice()).sort((a, b) => a[0].localeCompare(b[0])));
}

function render() { renderNino(); renderForecast(); }
D.bindTableButtons();
D.initHeader(render);
fillControls();
render();
})();
