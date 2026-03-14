const TABS = [
  { id: 'overview', label: 'Overview', note: 'Main blended view across all scenarios. Use this for quick scouting.' },
  { id: 'pi_patchwerk_5m_on_cd', label: 'PI · 5m On CD', note: 'Power Infusion every cooldown in 5-minute patchwerk sims.' },
  { id: 'pi_patchwerk_5m_spriest_timing', label: 'PI · Spriest Timing', note: 'Power Infusion aligned to Spriest timing windows.' },
  { id: 'pi_opener_40s', label: 'PI · 40s Opener', note: 'Burst opener-focused PI scenario for first 40 seconds.' },
  { id: 'tier_0p_4p', label: 'Tier 0p→4p', note: 'Tier progression gains from 0-piece to 4-piece sets.' },
  { id: 'raw_data', label: 'Raw Data', note: 'Complete filtered dataset table without tab-level scenario restriction.' },
];

const state = {
  metric: 'raw_gain',
  scenario: 'all',
  tierState: 'all',
  className: 'all',
  search: '',
  tab: 'overview',
  theme: 'dark',
  viewMode: 'graph',
  density: 'comfortable',
  filtersOpen: true,
  sortField: 'metric',
  sortDir: 'desc',
};

const fmt = {
  raw_gain: (v) => `${v >= 0 ? '+' : ''}${Math.round(v).toLocaleString()}`,
  pct_gain: (v) => `${(v * 100).toFixed(2)}%`,
  absolute_dps: (v) => Math.round(v).toLocaleString(),
};

const metricLabel = {
  raw_gain: 'Raw Gain',
  pct_gain: '% Gain',
  absolute_dps: 'Absolute DPS',
};

const byMetric = {
  raw_gain: 'rawGain',
  pct_gain: 'pctGain',
  absolute_dps: 'absoluteDps',
};

const CLASS_COLORS = {
  'Death Knight': '#c41f3b',
  'Demon Hunter': '#a330c9',
  Druid: '#ff7d0a',
  Evoker: '#33937f',
  Hunter: '#abd473',
  Mage: '#69ccf0',
  Monk: '#00ff96',
  Paladin: '#f58cba',
  Priest: '#e8e8e8',
  Rogue: '#fff569',
  Shaman: '#0070de',
  Warlock: '#9482c9',
  Warrior: '#c79c6e',
  Unknown: '#7a8394',
};

const TIER_LABEL = { '0p': '0-piece', '2p': '2-piece', '4p': '4-piece' };
const TIER_COLORS = { '0p': '#7a8394', '2p': '#5f7fba', '4p': '#6dcf98' };

const PREF_KEY = 'midnight-dps-intel-prefs-v1';

function loadPrefs() {
  try {
    const parsed = JSON.parse(localStorage.getItem(PREF_KEY) || '{}');
    Object.assign(state, parsed);
  } catch {}
}

function savePrefs() {
  localStorage.setItem(PREF_KEY, JSON.stringify({
    theme: state.theme,
    viewMode: state.viewMode,
    density: state.density,
    filtersOpen: state.filtersOpen,
    metric: state.metric,
    scenario: state.scenario,
    tierState: state.tierState,
    className: state.className,
    tab: state.tab,
    sortField: state.sortField,
    sortDir: state.sortDir,
  }));
}

const el = {
  metric: document.querySelector('#metric'),
  scenario: document.querySelector('#scenario'),
  tierState: document.querySelector('#tierState'),
  className: document.querySelector('#className'),
  search: document.querySelector('#search'),
  rows: document.querySelector('#rows'),
  metricHeader: document.querySelector('#sortMetric'),
  syncInfo: document.querySelector('#syncInfo'),
  kpiTop: document.querySelector('#kpiTop'),
  kpiMedian: document.querySelector('#kpiMedian'),
  kpiCount: document.querySelector('#kpiCount'),
  tabs: document.querySelector('#tabs'),
  tabNote: document.querySelector('#tabNote'),
  bars: document.querySelector('#bars'),
  graphSub: document.querySelector('#graphSub'),
  themeToggle: document.querySelector('#themeToggle'),
  viewToggle: document.querySelector('#viewToggle'),
  filtersToggle: document.querySelector('#filtersToggle'),
  controls: document.querySelector('#controls'),
  resetFilters: document.querySelector('#resetFilters'),
  densityToggle: document.querySelector('#densityToggle'),
  graphLegend: document.querySelector('#graphLegend'),
  graphTicks: document.querySelector('#graphTicks'),
  graphMetricToggle: document.querySelector('#graphMetricToggle'),
  sortTier: document.querySelector('#sortTier'),
  sortMetric: document.querySelector('#sortMetric'),
  sortAbsDps: document.querySelector('#sortAbsDps'),
};

function unique(records, key) {
  return [...new Set(records.map((r) => r[key]).filter(Boolean))].sort();
}

function options(select, items) {
  select.innerHTML = ['<option value="all">All</option>', ...items.map((v) => `<option value="${v}">${v}</option>`)].join('');
}

function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function recordsForTab(records) {
  if (state.tab === 'overview' || state.tab === 'raw_data') return records;
  return records.filter((r) => r.scenario === state.tab);
}

function applyFilters(records) {
  return records
    .filter((r) => state.scenario === 'all' || r.scenario === state.scenario)
    .filter((r) => state.tierState === 'all' || r.tierState === state.tierState)
    .filter((r) => state.className === 'all' || r.className === state.className)
    .filter((r) => !state.search || r.specLabel.toLowerCase().includes(state.search));
}

function renderTabs() {
  el.tabs.innerHTML = TABS.map((tab) => `<button class="tab-btn ${tab.id === state.tab ? 'active' : ''}" data-tab="${tab.id}">${tab.label}</button>`).join('');
  el.tabNote.textContent = TABS.find((t) => t.id === state.tab)?.note || '';
  for (const btn of el.tabs.querySelectorAll('.tab-btn')) {
    btn.addEventListener('click', () => {
      state.tab = btn.dataset.tab;
      if (state.tab === 'overview') {
        state.scenario = 'baseline_raw_sim_dps';
        el.scenario.value = state.scenario;
      }
      savePrefs();
      render(window.__records);
      renderTabs();
    });
  }
}

function renderGraph(rows, key) {
  const gmButtons = el.graphMetricToggle.querySelectorAll('.gm-btn');
  gmButtons.forEach((b) => b.classList.toggle('active', b.dataset.metric === state.metric));
  const top = rows.slice(0, 120);
  const max = Math.max(...top.map((r) => Math.max(0, r[key] ?? 0)), 1);
  const tickVals = [0, .25, .5, .75, 1].map((x) => max * x);
  el.graphSub.textContent = `${metricLabel[state.metric]} · top ${top.length} specs (scroll)`;
  el.graphTicks.innerHTML = tickVals.map((v) => `<span>${fmt[state.metric](v)}</span>`).join('');

  const topClasses = [...new Set(top.slice(0, 8).map((r) => r.className))];
  const tierLegend = ['0p', '2p', '4p'].map((t) => `<span class="legend-item"><span class="class-dot" style="background:${TIER_COLORS[t]}"></span>${TIER_LABEL[t]}</span>`).join('');
  const classLegend = topClasses.map((c) => `<span class="legend-item"><span class="class-dot" style="background:${CLASS_COLORS[c] || CLASS_COLORS.Unknown}"></span>${c}</span>`).join('');
  el.graphLegend.innerHTML = `${tierLegend}${classLegend}`;

  el.bars.innerHTML = top.map((r) => {
    const val = Math.max(0, r[key] ?? 0);
    const width = (val / max) * 100;
    const classColor = CLASS_COLORS[r.className] || CLASS_COLORS.Unknown;
    return `<div class="bar-row">
      <div class="bar-label">${r.specLabel} <span class="tier-chip" style="border-color:${TIER_COLORS[r.tierState] || '#7a8394'};color:${TIER_COLORS[r.tierState] || '#7a8394'}">${TIER_LABEL[r.tierState] || r.tierState}</span></div>
      <div class="bar-track"><div class="bar-fill" style="width:${width}%;background:linear-gradient(90deg, ${classColor}, color-mix(in oklab, ${classColor} 65%, #fff));"></div></div>
      <div class="bar-val">${fmt[state.metric](r[key] ?? 0)}</div>
    </div>`;
  }).join('');
}

function sortRows(rows) {
  const metricKey = byMetric[state.metric];
  const dir = state.sortDir === 'asc' ? 1 : -1;
  const tierOrder = { '0p': 0, '2p': 1, '4p': 2 };
  return [...rows].sort((a, b) => {
    if (state.sortField === 'tier') return ((tierOrder[a.tierState] ?? 99) - (tierOrder[b.tierState] ?? 99)) * dir;
    if (state.sortField === 'abs_dps') return ((a.absoluteDps ?? 0) - (b.absoluteDps ?? 0)) * dir;
    return ((a[metricKey] ?? 0) - (b[metricKey] ?? 0)) * dir;
  });
}

function updateSortHeaders() {
  for (const h of [el.sortTier, el.sortMetric, el.sortAbsDps]) h.classList.remove('asc', 'desc');
  const map = { tier: el.sortTier, metric: el.sortMetric, abs_dps: el.sortAbsDps };
  map[state.sortField]?.classList.add(state.sortDir);
}

function render(records) {
  const key = byMetric[state.metric];
  const scoped = recordsForTab(records);
  const filtered = sortRows(applyFilters(scoped));

  el.metricHeader.textContent = `${metricLabel[state.metric]}`;
  updateSortHeaders();
  el.rows.innerHTML = filtered.slice(0, 300).map((r, i) => `
    <tr>
      <td class="rank">${i + 1}</td>
      <td>${r.specLabel}</td>
      <td><span class="class-badge"><span class="class-dot" style="background:${CLASS_COLORS[r.className] || CLASS_COLORS.Unknown}"></span>${r.className}</span></td>
      <td>${r.tierState}</td>
      <td>${r.scenario}</td>
      <td class="num">${fmt[state.metric](r[key] ?? 0)}</td>
      <td class="num">${fmt.absolute_dps(r.absoluteDps)}</td>
    </tr>
  `).join('');
  renderGraph(filtered, key);

  el.kpiCount.textContent = filtered.length.toLocaleString();
  el.kpiTop.textContent = filtered[0] ? `${filtered[0].specLabel} (${fmt[state.metric](filtered[0][key])})` : '-';
  el.kpiMedian.textContent = fmt[state.metric](median(filtered.map((r) => r[key] ?? 0)));
}

const data = await fetch(`./data/normalized.json?v=${Date.now()}`, { cache: 'no-store' }).then((r) => r.json());
window.__records = data.records;
options(el.scenario, unique(data.records, 'scenario'));
options(el.tierState, unique(data.records, 'tierState'));
options(el.className, unique(data.records, 'className'));
el.syncInfo.textContent = `Last ingest: ${new Date(data.generatedAt).toLocaleString()}`;

for (const key of ['metric', 'scenario', 'tierState', 'className']) {
  el[key].addEventListener('change', (e) => {
    state[key] = e.target.value;
    savePrefs();
    render(data.records);
  });
}
el.search.addEventListener('input', (e) => {
  state.search = e.target.value.trim().toLowerCase();
  render(data.records);
});

el.themeToggle.addEventListener('click', () => {
  state.theme = state.theme === 'dark' ? 'light' : 'dark';
  applyUiState();
  savePrefs();
});

el.viewToggle.addEventListener('click', () => {
  state.viewMode = state.viewMode === 'graph' ? 'raw' : 'graph';
  applyUiState();
  savePrefs();
});

el.filtersToggle.addEventListener('click', () => {
  state.filtersOpen = !state.filtersOpen;
  applyUiState();
  savePrefs();
});

el.densityToggle.addEventListener('click', () => {
  state.density = state.density === 'comfortable' ? 'compact' : 'comfortable';
  applyUiState();
  savePrefs();
});

el.graphMetricToggle.addEventListener('click', (e) => {
  const btn = e.target.closest('.gm-btn');
  if (!btn) return;
  state.metric = btn.dataset.metric;
  el.metric.value = state.metric;
  state.sortField = 'metric';
  savePrefs();
  render(data.records);
});

el.resetFilters.addEventListener('click', () => {
  state.metric = 'raw_gain';
  state.scenario = 'all';
  state.tierState = 'all';
  state.className = 'all';
  state.search = '';
  state.tab = 'overview';
  state.sortField = 'metric';
  state.sortDir = 'desc';
  el.metric.value = state.metric;
  el.scenario.value = state.scenario;
  el.tierState.value = state.tierState;
  el.className.value = state.className;
  el.search.value = '';
  renderTabs();
  savePrefs();
  render(data.records);
});

function toggleSort(field) {
  if (state.sortField === field) state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
  else {
    state.sortField = field;
    state.sortDir = 'desc';
  }
  savePrefs();
  render(data.records);
}

el.sortTier.addEventListener('click', () => toggleSort('tier'));
el.sortMetric.addEventListener('click', () => toggleSort('metric'));
el.sortAbsDps.addEventListener('click', () => toggleSort('abs_dps'));

function applyUiState() {
  document.body.classList.toggle('light', state.theme === 'light');
  document.body.classList.toggle('graph-only', state.viewMode === 'graph');
  document.body.classList.toggle('compact', state.density === 'compact');
  el.controls.classList.toggle('hidden', !state.filtersOpen);
  el.filtersToggle.textContent = state.filtersOpen ? 'Hide' : 'Show';
  el.themeToggle.textContent = state.theme === 'dark' ? '🌙 Dark' : '☀️ Light';
  el.viewToggle.classList.toggle('active', state.viewMode === 'graph');
  el.viewToggle.textContent = state.viewMode === 'graph' ? '📊 Graph View' : '🧾 Raw Data View';
  el.densityToggle.textContent = state.density === 'comfortable' ? 'Comfortable' : 'Compact';
}

loadPrefs();
if (state.tab === 'overview' && (!state.scenario || state.scenario === 'all')) {
  state.scenario = 'baseline_raw_sim_dps';
}
el.metric.value = state.metric;
el.scenario.value = state.scenario;
el.tierState.value = state.tierState;
el.className.value = state.className;
applyUiState();
renderTabs();
render(data.records);
