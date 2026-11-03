'use strict';
/* ---------- Bouwstenen ---------- */
const ICON = {
  good: '<svg class="icon" viewBox="0 0 16 16" aria-label="Goed"><circle cx="8" cy="8" r="6.5" fill="none" stroke="var(--green-icon)" stroke-width="1.4"/><path d="M5.2 8.2l1.9 1.9 3.7-3.9" fill="none" stroke="var(--green-icon)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  warn: '<svg class="icon" viewBox="0 0 16 16" aria-label="Matig"><circle cx="8" cy="8" r="6.5" fill="none" stroke="var(--amber-icon)" stroke-width="1.4"/><path d="M8 4.6v4.2" stroke="var(--amber-icon)" stroke-width="1.6" stroke-linecap="round"/><circle cx="8" cy="11.1" r="0.95" fill="var(--amber-icon)"/></svg>',
  bad: '<svg class="icon" viewBox="0 0 16 16" aria-label="Slecht"><circle cx="8" cy="8" r="6.5" fill="none" stroke="var(--red-icon)" stroke-width="1.4"/><path d="M5.8 5.8l4.4 4.4M10.2 5.8l-4.4 4.4" stroke="var(--red-icon)" stroke-width="1.5" stroke-linecap="round"/></svg>',
  info: '<svg class="icon" viewBox="0 0 16 16" aria-label="Info"><circle cx="8" cy="8" r="6.5" fill="none" stroke="var(--blue-icon)" stroke-width="1.4"/><path d="M8 7.2v4" stroke="var(--blue-icon)" stroke-width="1.6" stroke-linecap="round"/><circle cx="8" cy="4.9" r="0.95" fill="var(--blue-icon)"/></svg>',
  alert: '<svg class="icon" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="7" fill="var(--amber-icon)"/><path d="M8 4.4v4.4" stroke="#fff" stroke-width="1.6" stroke-linecap="round"/><circle cx="8" cy="11.2" r="1" fill="#fff"/></svg>',
  eye: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M1.5 8s2.4-4.5 6.5-4.5S14.5 8 14.5 8 12.1 12.5 8 12.5 1.5 8 1.5 8z" fill="none" stroke="currentColor" stroke-width="1.4"/><circle cx="8" cy="8" r="2" fill="currentColor"/></svg>',
};
const VERDICT_LABEL = { good: 'Goed', warn: 'Matig', bad: 'Slecht', info: 'Info' };
const chip = verdict => `<span class="chip ${verdict === 'info' ? '' : verdict}">${VERDICT_LABEL[verdict]}</span>`;
const SERIES_COLORS = { revenue: 'var(--primary)', costs: 'var(--chart-line)', other: 'var(--blue-icon)', amber: 'var(--amber-icon)', red: 'var(--red-icon)', green: 'var(--green)' };

/* 'bekijken': elke knop verwijst naar een vaste set transacties die bij het renderen wordt vastgelegd */
let VIEWS = [];
function viewButton(title, rows, sub = '', label = 'bekijken') {
  VIEWS.push({ title, rows, sub });
  return `<button type="button" class="btn-view" data-view="${VIEWS.length - 1}">${ICON.eye}${label}</button>`;
}
const goButton = (tab, label = 'bekijken') => `<button type="button" class="btn-view" data-go="${tab}">${ICON.eye}${label}</button>`;
const accountLabel = iban => { const account = accountOf(iban); return account ? `${account.bank ?? ''} ${iban.slice(-4)}`.trim() : maskIban(iban); };
const confidenceChip = value => value == null ? '' : `<span class="chip ${value >= CONFIDENCE.categoryThreshold ? 'good' : value >= CONFIDENCE.threshold ? 'warn' : 'bad'}">${Math.round(value)}%</span>`;
const e1Cell = row => row.e1 ? `<span class="e1"><span>${esc(e1Label(row.e1.category))}</span><span class="muted">${dec(row.e1.confidence)}${row.e1Agree === false ? ' · <b class="amber-text">wijkt af</b>' : ''}${row.e1.flags.length ? ` · ${row.e1.flags.map(flag => E1_FLAG_LABEL[flag] ?? flag).join(', ')}` : ''}</span></span>` : '<span class="muted">-</span>';
function transactionTable(rows, limit = 400) {
  const sorted = [...rows].sort((first, second) => second.date.localeCompare(first.date));
  const shown = sorted.slice(0, limit);
  const showE1 = hasE1();
  return `<div class="table-wrap"><table class="lw-table">
    <thead><tr><th>Datum</th><th>Rekening</th><th>Tegenpartij</th><th>Omschrijving</th><th>Regel</th><th>Zekerheid</th>${showE1 ? '<th>E1 (Enable Now)</th>' : ''}<th class="num">Bedrag</th></tr></thead>
    <tbody>${shown.map(row => `<tr>
      <td>${dateNl(row.date)}</td>
      <td><span class="mono">${esc(accountLabel(row.account))}</span></td>
      <td>${row.name ? esc(row.name) : '<span class="muted">(geen naam)</span>'}<span class="muted mono">${row.counterAccount ? esc(maskIban(row.counterAccount)) : ''}</span></td>
      <td><span class="desc" title="${esc(row.description)}">${esc(row.description)}</span>${row.tax ? `<span class="muted">${esc(taxLabel(row.tax))}${row.tax.reference ? ` · kenmerk ${row.tax.valid === false ? '✕' : row.tax.valid ? '✓' : '?'}` : ''}</span>` : row.role ? `<span class="muted">${esc(row.role)}${row.derived === 'own_off' ? ' · rekening uitgezet' : ''}</span>` : ''}</td>
      <td>${ruleRef(row.rule)}</td>
      <td>${confidenceChip(row.confidence)}</td>
      ${showE1 ? `<td>${e1Cell(row)}</td>` : ''}
      <td class="num ${row.amount < 0 ? 'negative' : ''}">${eurCents(row.amount)}</td></tr>`).join('')}</tbody>
  </table></div>${sorted.length > limit ? `<div class="source">${limit} van ${sorted.length} transacties getoond, nieuwste eerst.</div>` : ''}`;
}
function openModal(title, sub, bodyHtml, footHtml) {
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-sub').textContent = sub;
  document.getElementById('modal-body').innerHTML = bodyHtml;
  document.getElementById('modal-foot').innerHTML = footHtml;
  document.getElementById('modal').hidden = false;
  document.getElementById('modal-close').focus();
}
const closeModal = () => { document.getElementById('modal').hidden = true; };
function showView(index) {
  const view = VIEWS[index];
  const total = sum(view.rows.map(row => row.amount));
  openModal(view.title, view.sub || `${monthName(A.MONTHS[0])} – ${monthName(A.MONTHS[11])} · ${weergaveLabel()}`, view.rows.length ? transactionTable(view.rows) : '<div class="card-body">Geen transacties in deze selectie.</div>',
    `<span>${view.rows.length} transacties · in ${eurCents(inflow(view.rows))} · uit ${eurCents(-outflow(view.rows))}</span><span class="check-ok">✓ Σ ${eurCents(total)}</span>`);
}

/* ---------- Grafieken ---------- */
function barChart(series, { height = 240, stacked = false, labels = A.MONTHS.map(shortMonth), line = null } = {}) {
  const width = 960, left = 64, right = 16, top = 14, bottom = 28;
  const totals = labels.map((label, index) => stacked ? sum(series.map(item => Math.max(0, item.values[index]))) : Math.max(...series.map(item => item.values[index]), 0));
  const minimum = Math.min(0, ...series.flatMap(item => item.values), ...(line ? line.values : []));
  const maximumRaw = Math.max(...totals, ...(line ? line.values : []), 1);
  const step = 10 ** Math.floor(Math.log10(Math.max(maximumRaw - minimum, 1))) / (maximumRaw - minimum > 5 * 10 ** Math.floor(Math.log10(Math.max(maximumRaw - minimum, 1))) ? 1 : 2);
  const maximum = Math.ceil(maximumRaw / step) * step, floor = Math.floor(minimum / step) * step;
  const band = (width - left - right) / labels.length;
  const y = value => top + (maximum - value) / (maximum - floor) * (height - top - bottom);
  let svg = `<svg class="chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(series.map(item => item.label).join(', '))} per maand">`;
  for (let tick = floor; tick <= maximum + 0.001; tick += step) svg += `<line x1="${left}" x2="${width - right}" y1="${y(tick)}" y2="${y(tick)}" stroke="${tick === 0 ? 'var(--chart-line)' : 'var(--grid)'}"/><text x="${left - 8}" y="${y(tick) + 4}" text-anchor="end" class="t-quiet">${tick ? k(tick) : '€ 0'}</text>`;
  const barWidth = stacked ? Math.min(34, band * 0.5) : Math.min(16, band * 0.7 / series.length);
  labels.forEach((label, index) => {
    const center = left + band * index + band / 2;
    let running = 0;
    series.forEach((item, position) => {
      const value = item.values[index];
      const x = stacked ? center - barWidth / 2 : center - (series.length * barWidth) / 2 + position * barWidth;
      const from = stacked ? running : 0, to = stacked ? running + value : value;
      svg += `<rect x="${x}" y="${Math.min(y(from), y(to))}" width="${barWidth - (stacked ? 0 : 2)}" height="${Math.abs(y(from) - y(to))}" fill="${item.color}"><title>${label} · ${esc(item.label)} · ${eur(value)}</title></rect>`;
      if (stacked) running += value;
    });
    svg += `<text x="${center}" y="${height - 8}" text-anchor="middle" class="t-ink">${label}</text>`;
  });
  if (line) {
    const points = labels.map((label, index) => `${left + band * index + band / 2},${y(line.values[index])}`);
    svg += `<polyline points="${points.join(' ')}" fill="none" stroke="${line.color}" stroke-width="2"/>${points.map((point, index) => `<circle cx="${point.split(',')[0]}" cy="${point.split(',')[1]}" r="3" fill="${line.color}"><title>${labels[index]} · ${esc(line.label)} · ${eur(line.values[index])}</title></circle>`).join('')}`;
  }
  return `${svg}</svg>`;
}
function balanceChart() {
  const width = 960, height = 220, left = 64, right = 16, top = 14, bottom = 28;
  const values = A.balance;
  const maximum = Math.max(...values, 0), minimum = Math.min(...values, 0);
  const span = Math.max(maximum - minimum, 1);
  const x = index => left + index / (values.length - 1) * (width - left - right);
  const y = value => top + (maximum - value) / span * (height - top - bottom);
  let svg = `<svg class="chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Saldo per dag">`;
  [maximum, (maximum + minimum) / 2, minimum].forEach(tick => { svg += `<line x1="${left}" x2="${width - right}" y1="${y(tick)}" y2="${y(tick)}" stroke="var(--grid)"/><text x="${left - 8}" y="${y(tick) + 4}" text-anchor="end" class="t-quiet">${k(tick)}</text>`; });
  if (minimum < 0) svg += `<line x1="${left}" x2="${width - right}" y1="${y(0)}" y2="${y(0)}" stroke="var(--red-icon)" stroke-dasharray="4 3"/>`;
  svg += `<polyline points="${values.map((value, index) => `${x(index)},${y(value)}`).join(' ')}" fill="none" stroke="var(--primary)" stroke-width="1.6"/>`;
  A.MONTHS.forEach((key, index) => { const dayIndex = A.days.indexOf(`${key}-01`); svg += `<text x="${x(dayIndex) + 18}" y="${height - 8}" text-anchor="middle" class="t-ink">${shortMonth(key)}</text>`; });
  return `${svg}</svg>`;
}
function sparkBars(values, color = 'var(--chart-line)') {
  const maximum = Math.max(...values.map(Math.abs), 1);
  return `<svg class="spark" width="96" height="22" viewBox="0 0 96 22" aria-hidden="true">${values.map((value, index) => `<rect x="${index * 8}" y="${22 - Math.abs(value) / maximum * 20}" width="6" height="${Math.max(Math.abs(value) / maximum * 20, value ? 1 : 0)}" fill="${color}"/>`).join('')}</svg>`;
}
const legend = items => `<div class="legend">${items.map(([label, color]) => `<span><i class="swatch" style="background:${color}"></i>${label}</span>`).join('')}</div>`;
const card = (title, sub, body, source = '', head = '') => `<div class="card"><div class="card-head"><div><h2>${title}</h2>${sub ? `<p class="sub">${sub}</p>` : ''}</div>${head}</div>${body}${source ? `<div class="source">${source}</div>` : ''}</div>`;
const table = (headers, rowsHtml, foot = '') => `<div class="table-wrap"><table class="lw-table"><thead><tr>${headers.map(header => `<th${/^(num:)/.test(header) ? ' class="num"' : ''}>${header.replace(/^num:/, '')}</th>`).join('')}</tr></thead><tbody>${rowsHtml}</tbody>${foot ? `<tfoot>${foot}</tfoot>` : ''}</table></div>`;
const weergaveLabel = () => ({ zakelijk: 'Zakelijk', prive: 'Privé', samen: 'Zakelijk + privé' })[overlay];
const windowLabel = () => `${monthName(A.MONTHS[0])} – ${monthName(A.MONTHS[11])}`;
const window3Label = () => `${shortMonth(A.MONTHS[9])} – ${monthName(A.MONTHS[11])}`;
const total12 = values => sum(values);
const last3 = values => sum(A.lastThree.map(index => values[index]));
const change3v12 = values => { const average12 = sum(values) / 12; return average12 ? last3(values) / 3 / average12 - 1 : NaN; };

/* ---------- Dossierkop en gedeelde rekeningen ---------- */
const hasRole = role => DOSSIER.accounts.some(account => account.role === role && account.enabled !== false);
function renderDossier() {
  const company = DOSSIER.company;
  const showCompany = overlay !== 'prive' && company;
  const privateAccount = DOSSIER.accounts.find(account => account.role === 'prive');
  const title = overlay === 'prive' ? (privateAccount?.name ?? 'Privé') : overlay === 'samen' && privateAccount ? `${company?.name ?? DOSSIER.label} + privé` : (company?.name ?? DOSSIER.label);
  const meta = showCompany ? `
      <span>Rechtsvorm <b>${esc(String(company.legalForm ?? DOSSIER.legalForm).toLowerCase())}</b>${company.kvkNumber ? ` · KvK <b>${esc(company.kvkNumber)}</b>` : ''}</span>
      ${company.industryCode ? `<span>SBI <b>${esc(company.industryCode)}</b> ${esc(String(company.industryDescription ?? '').toLowerCase())}</span>` : ''}
      ${company.numberOfEmployees != null ? `<span><b>${company.numberOfEmployees}</b> werkzame personen${company.startDate ? ` · sinds <b>${dateNl(company.startDate)}</b>` : ''}</span>` : ''}
      ${company.address ? `<span>${esc(company.address)}</span>` : ''}`
    : overlay === 'prive' ? '<span>Privérekening van de aanvrager · E1-profiel <b>retail</b> · geen KvK-gegevens</span>' : `<span>Rechtsvorm <b>${esc(DOSSIER.legalForm)}</b> · geen <code>companyInfo</code></span>`;
  const rows = DOSSIER.accounts.map(account => {
    const count = DOSSIER.transactions.filter(row => row.account === account.iban).length;
    return `<tr class="${account.enabled === false ? 'off' : ''}" data-account-row="${account.iban}">
      <td><label class="toggle"><input type="checkbox" data-account-toggle="${account.iban}" ${account.enabled !== false ? 'checked' : ''}><span>Mee</span></label></td>
      <td><span class="mono">${esc(formatIban(account.iban))}</span><span class="muted">${esc(account.name)}</span></td>
      <td>${esc(account.bank ?? '-')}</td>
      <td><span class="chip outline">${account.role === 'prive' ? 'Privé' : 'Zakelijk'}</span> <span class="muted">${esc(account.kind)}</span></td>
      <td>${account.sharedOn ? dateNl(account.sharedOn) : '-'}</td>
      <td class="num">${count}</td>
      <td class="num">${account.balance != null ? eurCents(account.balance) : '-'}</td></tr>`;
  }).join('');
  const unshared = [...new Set(DOSSIER.transactions.filter(row => row.counterAccount && !accountOf(row.counterAccount) && row.name && sharedHolderNames().has(row.name.toLowerCase())).map(row => row.counterAccount))];
  document.getElementById('dossier').innerHTML = `<div class="card">
    <div class="dossier">
      <div><h2>${esc(title)} <span class="chip ${DOSSIER.source === 'voorbeeld' ? '' : 'good'}">${DOSSIER.source === 'voorbeeld' ? 'Voorbeelddossier' : `Ingeladen · ${DOSSIER.source}`}</span></h2>
        <div class="dossier-meta">${meta}<span>Periode <b>${windowLabel()}</b></span></div></div>
      <div class="dossier-actions">${goButton('transacties', `${A.rows.length} transacties`)}</div>
    </div>
    <details class="accounts" ${DOSSIER.accounts.length > 1 ? 'open' : ''}><summary>Gedeelde rekeningen <span class="muted" id="accounts-summary">${DOSSIER.accounts.filter(account => account.enabled !== false).length} van ${DOSSIER.accounts.length} tellen mee</span></summary>
      ${table(['Mee', 'Rekening', 'Bank', 'Rol', 'Gedeeld op', 'num:Transacties', 'num:Saldo'], rows)}
      <div class="source">Rol per rekening: E1-profiel van de transacties (retail = privé), anders de naam van de rekeninghouder tegen <code>members</code>. Zet een rekening uit en de analyse rekent opnieuw; overboekingen naar die rekening tellen dan als <b>naar of van uitgezette eigen rekening</b>.${unshared.length ? ` <b>Niet gedeeld:</b> ${unshared.map(iban => `<span class="mono">${esc(maskIban(iban))}</span>`).join(', ')} staat op naam van de klant maar is niet gedeeld (vermoedelijk spaarrekening).` : ''}</div>
    </details></div>`;
}

/* ---------- Tabbladen ---------- */
const TABS = [
  ['overzicht', 'Overzicht'], ['controle', 'Controle'], ['omzet', 'Omzet'], ['kosten', 'Kosten'], ['resultaat', 'Resultaat'], ['cashflow', 'Cashflow'],
  ['belasting', 'Belasting'], ['verplichtingen', 'Verplichtingen'], ['verbonden', 'Verbonden partijen'], ['signalen', 'Signalen'],
  ['categorieen', 'Categorieën'], ['tegenpartijen', 'Tegenpartijen'], ['regels', 'Regels'],
];
const tabLabel = (id, label) => overlay === 'prive' && id === 'omzet' ? 'Inkomsten' : overlay === 'prive' && id === 'kosten' ? 'Uitgaven' : label;
const tabHidden = id => overlay === 'prive' && ['resultaat', 'controle'].includes(id);
let currentTab = 'overzicht';
function renderTabs() {
  const status = { controle: overlay !== 'prive' ? (reviewState().needed ? 'warn' : 'good') : null, signalen: SIGNAL_STATUS() };
  document.getElementById('tablist').innerHTML = TABS.filter(([id]) => !tabHidden(id)).map(([id, label]) => `<button type="button" role="tab" data-tab="${id}" aria-selected="${id === currentTab}">${status[id] ? `<i class="status-dot ${status[id]}"></i>` : ''}${tabLabel(id, label)}</button>`).join('');
}
const RENDERERS = {};
function showTab(id, scroll = false) {
  if (tabHidden(id)) id = 'overzicht';
  currentTab = id;
  document.querySelectorAll('.panel').forEach(panel => { panel.hidden = panel.id !== `panel-${id}`; });
  document.querySelectorAll('#tablist button').forEach(button => button.setAttribute('aria-selected', String(button.dataset.tab === id)));
  document.getElementById('transactions-button').setAttribute('aria-pressed', String(id === 'transacties'));
  document.getElementById('transactions-count').textContent = A ? A.rows.length : '';
  if (scroll) document.querySelector('.tabbar').scrollIntoView({ block: 'start' });
}
function renderAll({ keepDossier = false } = {}) {
  const scroll = window.scrollY;
  A = analyse();
  VIEWS = [];
  if (keepDossier) syncDossier(); else renderDossier();
  Object.entries(RENDERERS).forEach(([id, render]) => { document.getElementById(`panel-${id}`).innerHTML = tabHidden(id) ? '' : render(); });
  renderTabs();
  showTab(currentTab);
  document.querySelectorAll('[data-overlay]').forEach(button => { const disabled = button.dataset.overlay !== 'samen' ? !hasRole(button.dataset.overlay) : !(hasRole('zakelijk') && hasRole('prive')); button.disabled = disabled; button.setAttribute('aria-pressed', String(button.dataset.overlay === overlay)); });
  document.getElementById('internal-include').setAttribute('aria-pressed', String(includeInternal));
  document.getElementById('internal-exclude').setAttribute('aria-pressed', String(!includeInternal));
  window.scrollTo(0, scroll);
}
/* Alleen de wijzigingen in de dossierkop bijwerken, zodat de vinkjes niet opnieuw worden opgebouwd */
function syncDossier() {
  DOSSIER.accounts.forEach(account => {
    const row = document.querySelector(`[data-account-row="${account.iban}"]`);
    if (row) row.classList.toggle('off', account.enabled === false);
  });
  const summary = document.getElementById('accounts-summary');
  if (summary) summary.textContent = `${DOSSIER.accounts.filter(account => account.enabled !== false).length} van ${DOSSIER.accounts.length} tellen mee`;
  const count = document.querySelector('#dossier .dossier-actions .btn-view');
  if (count) count.lastChild.textContent = `${A.rows.length} transacties`;
}

/* ---------- Inladen ---------- */
function showBanner(tone, title, text) {
  const banner = document.getElementById('load-banner');
  banner.hidden = !title;
  banner.innerHTML = title ? `<div class="card"><div class="review-strip ${tone === 'bad' ? 'amber' : 'green'}">${tone === 'bad' ? ICON.alert : ICON.good}<div><strong>${esc(title)}</strong><span>${text}</span></div><button type="button" class="btn-outline" data-banner-close>Sluiten</button></div></div>` : '';
}
function dossierChecks() {
  return DOSSIER.accounts.map(account => {
    const own = DOSSIER.transactions.filter(row => row.account === account.iban);
    const last = own.at(-1);
    const balanceOk = account.reportedBalance == null || !last || Math.abs(last.balanceAfter - account.reportedBalance) < 0.01;
    const runningBreaks = own.filter(row => Math.abs(row.balanceAfter - row.computedBalance) >= 0.01).length;
    return { account, balanceOk, runningBreaks, count: own.length };
  });
}
async function loadFiles(files) {
  try {
    const dossier = await readDataset(files);
    DOSSIER = dossier;
    Object.keys(decisions).forEach(key => delete decisions[key]);
    overlay = hasRole('zakelijk') ? 'zakelijk' : 'prive';
    renderAll();
    const checks = dossierChecks();
    const broken = checks.filter(check => !check.balanceOk || check.runningBreaks);
    const analysisNote = DOSSIER.analyses ? ` Analyse-JSON: ${Object.keys(DOSSIER.analyses).map(profile => `${profile} ✓`).join(', ')}.` : '';
    showBanner(broken.length ? 'bad' : 'good', `${DOSSIER.transactions.length} transacties ingeladen (${DOSSIER.source}-formaat, ${DOSSIER.files} bestanden)`,
      `${DOSSIER.accounts.length} rekening(en), ${windowLabel()}. ${broken.length ? `Saldo sluit niet aan bij ${broken.map(check => formatIban(check.account.iban)).join(', ')}: zie Controle.` : 'Saldi sluiten aan op elke transactie.'}${hasE1() ? ' E1-categorieën gevonden: gebruikt als extra signaal naast de eigen regels.' : ' Geen E1-categorieën: alleen de eigen regels.'}${analysisNote}`);
  } catch (error) {
    showBanner('bad', 'Dataset niet ingeladen', esc(error.message));
  }
}

/* ---------- Interactie ---------- */
document.addEventListener('click', event => {
  const target = event.target.closest('button, [data-account-toggle]');
  if (!target) { if (event.target.id === 'modal') closeModal(); return; }
  const data = target.dataset;
  if (data.view != null) showView(Number(data.view));
  else if (data.tab) showTab(data.tab);
  else if (data.go) { closeModal(); showTab(data.go, true); }
  else if (data.overlay) { overlay = data.overlay; renderAll(); }
  else if (data.decide) {
    const key = decisionKey(data.side, data.key);
    if (data.decide === 'reset') delete decisions[key]; else decisions[key] = data.decide;
    renderAll();
  } else if (data.filter) { transactionFilter = data.filter; transactionLimit = 100; renderAll(); }
  else if (data.taxfilter) { taxListFilter = data.taxfilter; renderAll(); }
  else if (data.more != null) { transactionLimit += 200; renderAll(); }
  else if (data.bannerClose != null) showBanner();
  else if (target.id === 'modal-close') closeModal();
  else if (target.id === 'internal-include' || target.id === 'internal-exclude') { includeInternal = target.id === 'internal-include'; renderAll(); }
  else if (target.id === 'load-button') document.getElementById('load-input').click();
  else if (target.id === 'reset-button') { DOSSIER = buildSampleDossier(); finishBalances(DOSSIER.accounts, DOSSIER.transactions); attachSampleAnalyses(); overlay = 'zakelijk'; Object.keys(decisions).forEach(key => delete decisions[key]); showBanner(); renderAll(); }
});
document.addEventListener('change', event => {
  if (event.target.dataset.accountToggle) {
    const account = accountOf(event.target.dataset.accountToggle);
    if (!event.target.checked && DOSSIER.accounts.filter(item => item.enabled !== false).length === 1) {
      event.target.checked = true;
      showBanner('bad', 'Minimaal één rekening telt mee', 'Zet eerst een andere rekening aan voordat je deze uitzet.');
      return;
    }
    account.enabled = event.target.checked;
    if (!hasRole(overlay === 'samen' ? 'zakelijk' : overlay) || (overlay === 'samen' && !(hasRole('zakelijk') && hasRole('prive')))) { overlay = hasRole('zakelijk') ? 'zakelijk' : 'prive'; renderAll(); return; }
    renderAll({ keepDossier: true });
  }
  if (event.target.id === 'load-input' && event.target.files.length) { loadFiles([...event.target.files]); event.target.value = ''; }
});
document.addEventListener('keydown', event => { if (event.key === 'Escape') closeModal(); });
document.addEventListener('dragover', event => { event.preventDefault(); document.body.classList.add('dragging'); });
document.addEventListener('dragleave', event => { if (!event.relatedTarget) document.body.classList.remove('dragging'); });
document.addEventListener('drop', event => { event.preventDefault(); document.body.classList.remove('dragging'); if (event.dataTransfer.files.length) loadFiles([...event.dataTransfer.files]); });

function attachSampleAnalyses() {
  const view = role => { const accounts = DOSSIER.accounts.filter(account => account.role === role); const ibans = accounts.map(account => account.iban); const rows = DOSSIER.transactions.filter(row => ibans.includes(row.account)); return { ...computeE1Analysis(rows, role, accounts), ...(role === 'zakelijk' ? { companyInfo: DOSSIER.company } : {}) }; };
  DOSSIER.analyses = { corporate: view('zakelijk'), retail: view('prive') };
}
