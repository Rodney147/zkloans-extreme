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
/* Categorie zoals de beoordelaar die ziet: de Loanwise-categorie als die er is, anders het kopje uit de vaste regels */
const categoryOf = row => row.source ? sourceLabel(row.source) : ruleName(row.rule);
/* In de analyse telt de transactie als … (kopje van het maandoverzicht) */
const countsAs = row => row.rule === 10 ? revenueLabel() : [7, 8, 11].includes(row.rule) ? costLabel() : row.rule === 3 ? (PRIVATE_TAX.includes(row.tax?.type) ? 'Niet in de cashflow' : costLabel()) : row.rule === 6 ? (row.amount < 0 ? 'Financieringslasten' : 'Niet in de cashflow') : row.rule === 4 ? 'Financieringslasten' : row.rule === 5 && row.role === 'Groepsmaatschappij' && /management ?fee|managementvergoeding/i.test(row.description) ? costLabel() : 'Niet in de cashflow';
const SORTS = {
  date: (first, second) => first.date.localeCompare(second.date) || first.amount - second.amount,
  account: (first, second) => accountLabel(first.account).localeCompare(accountLabel(second.account), 'nl'),
  name: (first, second) => (first.name ?? '').localeCompare(second.name ?? '', 'nl'),
  category: (first, second) => categoryOf(first).localeCompare(categoryOf(second), 'nl'),
  amount: (first, second) => first.amount - second.amount,
};
const SORT_STATE = { tab: { key: 'date', desc: true }, modal: { key: 'date', desc: true } };
const sortRows = (rows, scope) => { const { key, desc } = SORT_STATE[scope]; const sorted = [...rows].sort(SORTS[key]); return desc ? sorted.reverse() : sorted; };
function transactionTable(rows, limit = 400, scope = 'modal') {
  const sorted = sortRows(rows, scope);
  const shown = sorted.slice(0, limit);
  const { key, desc } = SORT_STATE[scope];
  const head = (id, label, numeric = false) => `<th${numeric ? ' class="num"' : ''} aria-sort="${key === id ? (desc ? 'descending' : 'ascending') : 'none'}"><button type="button" class="sort" data-sort="${id}" data-sort-scope="${scope}">${label}<span aria-hidden="true">${key === id ? (desc ? ' ↓' : ' ↑') : ''}</span></button></th>`;
  return `<div class="table-wrap"><table class="lw-table">
    <thead><tr>${head('date', 'Datum')}${head('account', 'Rekening')}${head('name', 'Tegenpartij')}<th>Omschrijving</th>${head('category', 'Categorie')}${head('amount', 'Bedrag', true)}</tr></thead>
    <tbody>${shown.map(row => `<tr>
      <td>${dateNl(row.date)}</td>
      <td><span class="mono">${esc(accountLabel(row.account))}</span></td>
      <td>${row.name ? esc(row.name) : '<span class="muted">(geen naam)</span>'}<span class="muted mono">${row.counterAccount ? esc(maskIban(row.counterAccount)) : ''}</span></td>
      <td><span class="desc" title="${esc(row.description)}">${esc(row.description)}</span>${row.tax ? `<span class="muted">${esc(taxLabel(row.tax))}${row.tax.reference ? ` · kenmerk ${row.tax.valid === false ? '✕' : row.tax.valid ? '✓' : '?'}` : ''}</span>` : ''}</td>
      <td>${esc(categoryOf(row))}<span class="muted">${esc(countsAs(row))}</span></td>
      <td class="num ${row.amount < 0 ? 'negative' : ''}">${eurCents(row.amount)}</td></tr>`).join('')}</tbody>
  </table></div>${sorted.length > limit ? `<div class="source">${limit} van ${sorted.length} transacties getoond. Verfijn met de filters.</div>` : ''}`;
}
function openModal(title, sub, bodyHtml, footHtml) {
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-sub').textContent = sub;
  document.getElementById('modal-body').innerHTML = bodyHtml;
  document.getElementById('modal-foot').innerHTML = footHtml;
  document.getElementById('modal').hidden = false;
  document.getElementById('modal-close').focus();
}
const closeModal = () => { document.getElementById('modal').hidden = true; MODAL.rows = null; };

/* Pop-up met transacties: zoeken, filter op categorie en richting, sorteren op de kolomkoppen */
const MODAL = { rows: null, title: '', sub: '', text: '', category: '', direction: '', limit: 500 };
function showView(index, month = null) {
  const view = VIEWS[index];
  const rows = month == null ? view.rows : view.rows.filter(row => row.monthIndex === month);
  showRows(view.title, view.sub || `${month == null ? windowLabel() : monthName(A.MONTHS[month])} · ${weergaveLabel()}`, rows);
}
function showRows(title, sub, rows) {
  Object.assign(MODAL, { rows, title, sub, text: '', category: '', direction: '', limit: 500 });
  SORT_STATE.modal = { key: 'date', desc: true };
  openModal(title, sub, '', '');
  renderModal();
}
function modalFiltered() {
  const text = MODAL.text.trim().toLowerCase();
  return MODAL.rows.filter(row => (!MODAL.category || categoryOf(row) === MODAL.category) && (!MODAL.direction || (MODAL.direction === 'in' ? row.amount > 0 : row.amount < 0)) && (!text || `${row.name ?? ''} ${row.description} ${row.counterAccount ?? ''} ${categoryOf(row)}`.toLowerCase().includes(text)));
}
function renderModal() {
  if (!MODAL.rows) return;
  const categories = [...groupBy(MODAL.rows, categoryOf).entries()].sort((first, second) => first[0].localeCompare(second[0], 'nl'));
  const list = modalFiltered();
  const controls = MODAL.rows.length ? `<div class="card-body tx-controls modal-controls">
      <label>Zoeken <input type="search" id="modal-text" value="${esc(MODAL.text)}" placeholder="Tegenpartij, omschrijving of IBAN"></label>
      <label>Categorie <select class="inline-select" id="modal-category"><option value="">Alle (${MODAL.rows.length})</option>${categories.map(([label, items]) => `<option value="${esc(label)}" ${MODAL.category === label ? 'selected' : ''}>${esc(label)} (${items.length})</option>`).join('')}</select></label>
      <label>Richting <select class="inline-select" id="modal-direction"><option value="">Bij en af</option><option value="in" ${MODAL.direction === 'in' ? 'selected' : ''}>Bijschrijvingen</option><option value="out" ${MODAL.direction === 'out' ? 'selected' : ''}>Afschrijvingen</option></select></label>
    </div>` : '';
  const body = document.getElementById('modal-body');
  const focused = document.activeElement?.id;
  body.innerHTML = MODAL.rows.length ? `${controls}${list.length ? transactionTable(list, MODAL.limit, 'modal') : '<div class="card-body">Geen transacties met deze filters.</div>'}` : '<div class="card-body">Geen transacties in deze selectie.</div>';
  if (focused === 'modal-text') { const input = document.getElementById('modal-text'); input.focus(); input.setSelectionRange(input.value.length, input.value.length); }
  document.getElementById('modal-foot').innerHTML = `<span>${list.length}${list.length !== MODAL.rows.length ? ` van ${MODAL.rows.length}` : ''} transacties · in ${eurCents(inflow(list))} · uit ${eurCents(-outflow(list))}</span><span class="check-ok">✓ Σ ${eurCents(sum(list.map(row => row.amount)))}</span>`;
}
document.addEventListener('input', event => {
  if (event.target.id === 'modal-text') { MODAL.text = event.target.value; renderModal(); }
});
document.addEventListener('change', event => {
  if (event.target.id === 'modal-category') { MODAL.category = event.target.value; renderModal(); }
  else if (event.target.id === 'modal-direction') { MODAL.direction = event.target.value; renderModal(); }
});
document.addEventListener('click', event => {
  const button = event.target.closest('[data-sort]');
  if (!button) return;
  const scope = button.dataset.sortScope, key = button.dataset.sort;
  const state = SORT_STATE[scope];
  SORT_STATE[scope] = { key, desc: state.key === key ? !state.desc : key === 'date' || key === 'amount' };
  if (scope === 'modal') renderModal(); else renderAll();
});

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
/* Verloop per maand: elk staafje toont bij hover de maand, het bedrag en de tegenpartijen; klikken opent de transacties */
let TIPS = [];
function sparkBars(values, color = 'var(--chart-line)', rows = null, title = '') {
  const maximum = Math.max(...values.map(Math.abs), 1);
  if (!rows) return `<svg class="spark" width="96" height="22" viewBox="0 0 96 22" aria-hidden="true">${values.map((value, index) => `<rect x="${index * 8}" y="${22 - Math.abs(value) / maximum * 20}" width="6" height="${Math.max(Math.abs(value) / maximum * 20, value ? 1 : 0)}" fill="${color}"/>`).join('')}</svg>`;
  const view = VIEWS.push({ title, rows, sub: '' }) - 1;
  return `<span class="spark spark-live" role="group" aria-label="Verloop ${esc(title)}">${values.map((value, index) => {
    const tip = TIPS.push({ title, month: index, rows: rows.filter(row => row.monthIndex === index), value }) - 1;
    const height = value ? Math.max(Math.abs(value) / maximum * 100, 6) : 0;
    return `<button type="button" class="spark-bar" data-view="${view}" data-month="${index}" data-tip="${tip}" aria-label="${shortMonth(A.MONTHS[index])}: ${eur(value)}" ${value ? '' : 'tabindex="-1"'}><i style="height:${height}%;background:${color}"></i></button>`;
  }).join('')}</span>`;
}
function tipHtml(tip) {
  const rows = tip.rows;
  const total = sum(rows.map(row => row.amount));
  const head = `<b>${esc(tip.title)} · ${monthName(A.MONTHS[tip.month])}</b><span class="tip-total ${total < 0 ? 'negative' : ''}">${eurCents(total)} · ${rows.length} transactie${rows.length === 1 ? '' : 's'}</span>`;
  if (!rows.length) return `${head}<span class="muted">Geen transacties</span>`;
  const groups = [...groupBy(rows, row => row.name ?? '(geen naam)').entries()].map(([name, items]) => ({ name, items, amount: sum(items.map(row => row.amount)) })).sort((first, second) => Math.abs(second.amount) - Math.abs(first.amount));
  /* één tegenpartij: de losse transacties; meerdere: per tegenpartij opgeteld */
  const lines = groups.length === 1
    ? rows.slice().sort((first, second) => first.date.localeCompare(second.date)).slice(0, 6).map(row => `<span class="tip-row"><span>${dateNl(row.date).slice(0, 5)} ${esc(row.description.slice(0, 34))}</span><b class="${row.amount < 0 ? 'negative' : ''}">${eurCents(row.amount)}</b></span>`)
    : groups.slice(0, 6).map(group => `<span class="tip-row"><span>${esc(group.name)}${group.items.length > 1 ? ` <i>${group.items.length}×</i>` : ''}</span><b class="${group.amount < 0 ? 'negative' : ''}">${eurCents(group.amount)}</b></span>`);
  const rest = groups.length === 1 ? rows.length - 6 : groups.length - 6;
  return `${head}${lines.join('')}${rest > 0 ? `<span class="muted">+ ${rest} ${groups.length === 1 ? 'transacties' : 'tegenpartijen'}</span>` : ''}<span class="muted tip-hint">Klik voor de transacties</span>`;
}
function showTip(target) {
  const tip = TIPS[Number(target.dataset.tip)];
  if (!tip) return;
  let box = document.getElementById('tip');
  if (!box) { box = Object.assign(document.createElement('div'), { id: 'tip', className: 'tip', role: 'tooltip' }); document.body.appendChild(box); }
  box.innerHTML = tipHtml(tip);
  box.hidden = false;
  const rect = target.getBoundingClientRect(), width = box.offsetWidth, height = box.offsetHeight;
  const left = Math.min(Math.max(8, rect.left + rect.width / 2 - width / 2), window.innerWidth - width - 8);
  const top = rect.top - height - 8 < 8 ? rect.bottom + 8 : rect.top - height - 8;
  box.style.left = `${left}px`; box.style.top = `${top}px`;
}
const hideTip = () => { const box = document.getElementById('tip'); if (box) box.hidden = true; };
document.addEventListener('mouseover', event => { const target = event.target.closest('[data-tip]'); if (target) showTip(target); else if (!event.target.closest('#tip')) hideTip(); });
document.addEventListener('focusin', event => { const target = event.target.closest('[data-tip]'); if (target) showTip(target); else hideTip(); });
document.addEventListener('scroll', hideTip, true);
document.addEventListener('click', event => { if (event.target.closest('[data-tip]')) hideTip(); });
const legend = items => `<div class="legend">${items.map(([label, color]) => `<span><i class="swatch" style="background:${color}"></i>${label}</span>`).join('')}</div>`;
const card = (title, sub, body, source = '', head = '') => `<div class="card"><div class="card-head"><div><h2>${title}</h2>${sub ? `<p class="sub">${sub}</p>` : ''}</div>${head}</div>${body}${source ? `<div class="source">${source}</div>` : ''}</div>`;
const table = (headers, rowsHtml, foot = '') => `<div class="table-wrap"><table class="lw-table"><thead><tr>${headers.map(header => `<th${/^(num:)/.test(header) ? ' class="num"' : ''}>${header.replace(/^num:/, '')}</th>`).join('')}</tr></thead><tbody>${rowsHtml}</tbody>${foot ? `<tfoot>${foot}</tfoot>` : ''}</table></div>`;
const weergaveLabel = () => ({ zakelijk: 'Zakelijk', prive: 'Privé', samen: 'Zakelijk + privé' })[overlay];
const windowLabel = () => `${monthName(A.MONTHS[0])} – ${monthName(A.MONTHS[11])}`;
const window3Label = () => `${shortMonth(A.MONTHS[9])} – ${monthName(A.MONTHS[11])}`;

/* ---------- Dossierkop en gedeelde rekeningen ---------- */
const hasRole = role => DOSSIER.accounts.some(account => (role === 'zakelijk' ? ['zakelijk', 'gemengd'] : [role]).includes(account.role) && account.enabled !== false);
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
    : overlay === 'prive' ? '<span>Privérekening(en) van de aanvrager</span>' : '';
  const rows = DOSSIER.accounts.map(account => {
    const count = DOSSIER.transactions.filter(row => row.account === account.iban).length;
    return `<tr class="${account.enabled === false ? 'off' : ''}" data-account-row="${account.iban}">
      <td><label class="toggle"><input type="checkbox" data-account-toggle="${account.iban}" ${account.enabled !== false ? 'checked' : ''}><span>Mee</span></label></td>
      <td><span class="mono">${esc(formatIban(account.iban))}</span><span class="muted">${esc(account.name)}</span></td>
      <td>${esc(account.bank ?? '-')}</td>
      <td><select class="inline-select" data-account-role="${account.iban}" aria-label="Rol">${[['zakelijk', 'Zakelijk'], ['prive', 'Privé'], ['gemengd', 'Gemengd']].map(([value, label]) => `<option value="${value}" ${account.role === value ? 'selected' : ''}>${label}</option>`).join('')}</select> <span class="muted">${esc(account.kind)}${account.roleSuggested ? ` · voorstel: ${esc(account.roleSuggested)}` : ''}</span></td>
      <td><select class="inline-select" data-account-owner="${account.iban}" aria-label="Eigenaar"><option value="onderneming" ${account.owner === 'onderneming' ? 'selected' : ''}>Onderneming</option>${(DOSSIER.members ?? []).map(member => `<option value="${member.id}" ${account.owner === member.id ? 'selected' : ''}>${esc(memberName(member))} (${esc(member.role)})</option>`).join('')}</select></td>
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
      ${table(['Mee', 'Rekening', 'Bank', 'Rol', 'Eigenaar', 'Gedeeld op', 'num:Transacties', 'num:Saldo'], rows)}
      <div class="source">Rol en eigenaar per rekening zijn een voorstel; pas ze aan als ze niet kloppen. Geld tussen rekeningen van <b>dezelfde eigenaar</b> is intern (${ruleRef(1)}); tussen zakelijk en privé is het een verbonden partij (${ruleRef(5)}) en telt het niet in de cashflow. Gemengd = zakelijk en privé op één rekening: classificatie per transactie. Zet een rekening uit en alles rekent opnieuw.${unshared.length ? ` <b>Niet gedeeld:</b> ${unshared.map(iban => `<span class="mono">${esc(maskIban(iban))}</span>`).join(', ')} staat op naam van de klant maar is niet gedeeld (vermoedelijk spaarrekening).` : ''}</div>
    </details></div>`;
}

/* ---------- Tabbladen ---------- */
/* Navigatie: zes onderdelen, elk één tabblad */
const TAB_LABELS = { overzicht: 'Overzicht', maanden: 'Maandoverzicht', omzet: 'Omzet', kosten: 'Kosten', belasting: 'Belastingen', transacties: 'Transacties', risico: 'Risico-indicatoren' };
const GROUPS = Object.entries(TAB_LABELS).map(([id, label]) => [id, label, [id]]);
const TABS = Object.entries(TAB_LABELS);
const groupOfTab = id => GROUPS.find(([, , tabs]) => tabs.includes(id)) ?? GROUPS[0];
const tabLabel = (id, label) => overlay === 'prive' && id === 'omzet' ? 'Inkomsten' : overlay === 'prive' && id === 'kosten' ? 'Uitgaven' : label;
const tabHidden = () => false;
let currentTab = 'overzicht';
function renderTabs() {
  const taxTones = MODEL?.tax?.lines.filter(line => TAX_FOCUS.includes(line.type)).map(line => line.status.tone) ?? [];
  const status = { risico: MODEL?.hits.some(item => item.ernst === 'bad') ? 'bad' : MODEL?.hits.some(item => item.ernst === 'warn') ? 'warn' : null, belasting: taxTones.includes('warn') ? 'warn' : null };
  const [currentGroup] = groupOfTab(currentTab);
  const groupStatus = tabs => tabs.map(id => status[id]).find(value => value === 'bad') ?? tabs.map(id => status[id]).find(value => value === 'warn') ?? null;
  document.getElementById('tablist').innerHTML = GROUPS.map(([id, label, tabs]) => { const first = tabs.find(tab => !tabHidden(tab)) ?? tabs[0]; const dot = groupStatus(tabs); return `<button type="button" role="tab" data-tab="${id === currentGroup && !tabHidden(currentTab) ? currentTab : first}" data-group="${id}" aria-selected="${id === currentGroup}">${dot ? `<i class="status-dot ${dot}"></i>` : ''}${tabLabel(id, label)}</button>`; }).join('');
  const [, , subTabs] = groupOfTab(currentTab);
  const visible = subTabs.filter(id => !tabHidden(id));
  document.getElementById('subtabs').innerHTML = visible.length > 1 ? visible.map(id => `<button type="button" role="tab" data-tab="${id}" aria-selected="${id === currentTab}">${status[id] ? `<i class="status-dot ${status[id]}"></i>` : ''}${tabLabel(id, TAB_LABELS[id])}</button>`).join('') : '';
  document.getElementById('subtabs').hidden = visible.length <= 1;
}
const RENDERERS = {};
function showTab(id, scroll = false) {
  if (tabHidden(id)) id = 'overzicht';
  currentTab = id;
  document.querySelectorAll('.panel').forEach(panel => { panel.hidden = panel.id !== `panel-${id}`; });
  renderTabs();
  document.getElementById('transactions-button').setAttribute('aria-pressed', String(id === 'transacties'));
  document.getElementById('transactions-count').textContent = A ? A.rows.length : '';
  if (scroll) document.querySelector('.tabbar').scrollIntoView({ block: 'start' });
}
function renderAll({ keepDossier = false } = {}) {
  const scroll = window.scrollY;
  A = analyse();
  VIEWS = [];
  TIPS = [];
  MODEL = buildModel();
  if (keepDossier) syncDossier(); else renderDossier();
  Object.entries(RENDERERS).forEach(([id, render]) => { document.getElementById(`panel-${id}`).innerHTML = tabHidden(id) ? '' : render(); });
  showTab(currentTab);
  document.querySelectorAll('[data-overlay]').forEach(button => { const disabled = button.dataset.overlay !== 'samen' ? !hasRole(button.dataset.overlay) : !(hasRole('zakelijk') && hasRole('prive')); button.disabled = disabled; button.setAttribute('aria-pressed', String(button.dataset.overlay === overlay)); });
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
    resetDossierState();
    const restored = await restoreState();
    overlay = hasRole('zakelijk') || hasRole('gemengd') ? 'zakelijk' : 'prive';
    renderAll();
    const checks = dossierChecks();
    const broken = checks.filter(check => !check.balanceOk || check.runningBreaks);
    showBanner(broken.length ? 'bad' : 'good', `${DOSSIER.transactions.length} transacties ingeladen (${DOSSIER.source}-formaat, ${DOSSIER.files} bestanden)`,
      `${DOSSIER.accounts.length} rekening(en), ${windowLabel()}. ${broken.length ? `Let op: saldo sluit niet aan bij ${broken.map(check => formatIban(check.account.iban)).join(', ')}.` : ''}${restored.restored ? ` <b>Eerder werk hersteld</b> (opgeslagen ${dateNl(restored.savedAt)}).` : ''}${restored.global ? ` ${restored.global} aanpassingen per tegenpartij uit eerdere dossiers toegepast.` : ''}${STORE.available ? '' : ' Opslag in de browser niet beschikbaar: wijzigingen verdwijnen bij herladen.'}`);
  } catch (error) {
    showBanner('bad', 'Dataset niet ingeladen', esc(error.message));
  }
}

/* ---------- Interactie ---------- */
document.addEventListener('click', event => {
  const target = event.target.closest('button, [data-account-toggle]');
  if (!target) { if (event.target.id === 'modal') closeModal(); return; }
  const data = target.dataset;
  if (data.view != null) showView(Number(data.view), data.month != null ? Number(data.month) : null);
  else if (data.tab) showTab(data.tab);
  else if (data.go) { closeModal(); showTab(data.go, true); }
  else if (data.overlay) { overlay = data.overlay; renderAll(); }
  else if (data.quick) { TX.quick = data.quick; TX.limit = 150; renderAll(); }
  else if (data.more != null) { TX.limit += 300; renderAll(); }
  else if (data.bannerClose != null) showBanner();
  else if (target.id === 'modal-close') closeModal();
  else if (target.id === 'load-button') document.getElementById('load-input').click();
  else if (target.id === 'reset-button') startSample();
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
    audit(`Rekening ${formatIban(account.iban)} ${account.enabled ? 'meegenomen' : 'uitgezet'}`, !account.enabled, account.enabled);
    saveState();
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

/* ---------- Dossiermodel: kredietanalyse altijd op de zakelijke weergave, privé ernaast ---------- */
let MODEL = null;
function buildModel() {
  const business = DOSSIER.accounts.some(account => account.enabled !== false && ['zakelijk', 'gemengd'].includes(account.role));
  const privateAccounts = DOSSIER.accounts.some(account => account.enabled !== false && account.role === 'prive');
  const Az = !business ? null : overlay === 'zakelijk' ? A : analyseFor('zakelijk');
  const Ap = !privateAccounts ? null : overlay === 'prive' ? A : analyseFor('prive');
  const checks = risks(Az, Ap);
  return { Az, Ap, checks, hits: riskHits(checks), tax: taxOverview(Az, Ap) };
}
async function startSample() {
  DOSSIER = buildSampleDossier();
  finishBalances(DOSSIER.accounts, DOSSIER.transactions);
  attachSampleAnalyses();
  DOSSIER.members = dedupeMembers(DOSSIER.members, DOSSIER.legalForm);
  assignOwners(DOSSIER.accounts, DOSSIER.members);
  DOSSIER.accounts.forEach(account => { account.roleConfirmed = false; });
  resetDossierState();
  await restoreState();
  overlay = 'zakelijk';
  showBanner();
  renderAll();
}
