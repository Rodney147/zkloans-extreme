'use strict';
/* ---------- Bouwstenen voor de tabbladen ---------- */
const tile = (label, value, unit, sub) => `<div class="tile"><span class="tile-label">${label}</span><span class="tile-value">${value}${unit ? `<small>${unit}</small>` : ''}</span><span class="tile-sub">${sub}</span></div>`;
const isPrivate = () => overlay === 'prive';
const revenueLabel = () => isPrivate() ? 'Inkomsten' : 'Omzet';
const costLabel = () => isPrivate() ? 'Uitgaven' : 'Kosten';
const total = values => sum(values);
const averageSub = values => { const average = A.averages(values); return `gem. <b>${eur(average.m12)}</b>/mnd · laatste 3 mnd <b>${eur(average.m3)}</b>/mnd`; };
const lampIcon = ernst => ICON[ernst] ?? ICON.info;
function averagesTable(lines) {
  const head = ['', 'num:Gem. 3 mnd', 'num:Gem. 6 mnd', 'num:Gem. 12 mnd', 'num:3 mnd t.o.v. 12 mnd', 'num:Totaal 12 mnd'];
  return table(head, lines.map(([label, values, bold]) => {
    const average = A.averages(values);
    const change = average.m12 ? (average.m3 - average.m12) / Math.abs(average.m12) : NaN;
    return `<tr${bold ? ' class="total-row"' : ''}><td>${bold ? `<b>${label}</b>` : label}</td><td class="num">${eur(average.m3)}</td><td class="num">${eur(average.m6)}</td><td class="num">${eur(average.m12)}</td><td class="num">${signedPct(change)}</td><td class="num">${bold ? `<b>${eur(total(values))}</b>` : eur(total(values))}</td></tr>`;
  }).join(''));
}

/* ---------- Overzicht ---------- */
RENDERERS.overzicht = () => {
  const tiles = [
    tile(`${revenueLabel()} 12 mnd`, eur(A.revenue12), '', averageSub(A.revenue)),
    tile(`${costLabel()} 12 mnd`, eur(A.costs12), '', averageSub(A.costs)),
    tile('Netto cashflow 12 mnd', eur(A.net12), '', averageSub(A.net)),
    tile('Saldo nu', eur(A.balance.at(-1)), '', `${A.visibleAccounts.length} rekening(en) · laagste <b>${eur(Math.min(...A.balance))}</b>`),
  ];
  const lamps = MODEL.hits;
  const lampList = lamps.length ? `<div class="lamps">${lamps.map(item => `<div class="lamp">${lampIcon(item.ernst)}<div><b>${esc(item.titel)}</b><span>${esc(item.wat)}</span></div>${item.rows.length ? viewButton(item.titel, item.rows) : ''}</div>`).join('')}</div>` : '<div class="card-body">Geen risico-indicatoren.</div>';
  return `${A.householdOnly ? `<div class="card review-strip amber">${ICON.alert}<div><strong>Huishoudoverzicht</strong><span>Bij een bv vallen in Samen de betalingen tussen bv en DGA weg en tellen privé-inkomsten als inkomsten. Kies Zakelijk voor de cijfers van de onderneming.</span></div></div>` : ''}
    <div class="card"><div class="tiles" style="border-top:0">${tiles.join('')}</div></div>
    ${card('Risico-indicatoren', `${lamps.filter(item => item.ernst === 'bad').length} rood · ${lamps.filter(item => item.ernst === 'warn').length} oranje · ${lamps.filter(item => item.ernst === 'info').length} ter info`, lampList, 'Een lampje laat zien wat er in de transacties staat. De interpretatie en toelichting horen in je eigen beoordeling.', goButton('risico', 'alle'))}
    ${card(`${revenueLabel()}, ${costLabel().toLowerCase()} en netto cashflow per maand`, `${windowLabel()} · lijn = netto cashflow`,
      `<div class="card-body scroll-x">${barChart([{ label: revenueLabel(), color: SERIES_COLORS.revenue, values: A.revenue }, { label: costLabel(), color: SERIES_COLORS.costs, values: A.costs }], { line: { label: 'Netto cashflow', color: 'var(--amber-icon)', values: A.net } })}</div>`,
      `<b>Herleiding:</b> ${revenueLabel().toLowerCase()} = ${ruleRef(10)}; ${costLabel().toLowerCase()} = ${ruleRef(11)} + lonen + bankkosten + belasting${isPrivate() ? '' : ' (zonder IB en Zvw) + managementfee'}; netto cashflow = ${revenueLabel().toLowerCase()} − ${costLabel().toLowerCase()} − financieringslasten. Zie het Maandoverzicht.`,
      legend([[revenueLabel(), SERIES_COLORS.revenue], [costLabel(), SERIES_COLORS.costs], ['Netto cashflow', 'var(--amber-icon)']]))}
    ${card('Ontwikkeling', 'Gemiddelde per maand over de laatste 3, 6 en 12 maanden', averagesTable([[revenueLabel(), A.revenue], [costLabel(), A.costs], ['Operationele cashflow', A.operating], ['Financieringslasten', A.financing.values.map(value => -value)], ['Netto cashflow (bestedingsvermogen)', A.net, true]]))}`;
};

/* ---------- Maandoverzicht: het hart ---------- */
const monthsOpen = {};
RENDERERS.maanden = () => {
  const cells = (values, rows, bold = false) => {
    const view = rows ? VIEWS.push({ title: '', rows, sub: '' }) - 1 : null;
    const cell = (value, index) => {
      const text = value ? (bold ? `<b>${eur(value)}</b>` : eur(value)) : '<span class="muted">·</span>';
      return `<td class="num ${value < 0 ? 'negative' : ''}">${view != null && value ? `<button type="button" class="cell-link" data-view="${view}" data-month="${index}">${text}</button>` : text}</td>`;
    };
    return `${values.map(cell).join('')}<td class="num total"><b class="${total(values) < 0 ? 'negative' : ''}">${eur(total(values))}</b></td><td class="num">${eur(total(values) / 12)}</td>`;
  };
  const titled = (title, rows) => { if (rows) VIEWS[VIEWS.length - 1].title = title; };
  /* postnaam klikbaar: alle transacties van die post over 12 maanden */
  const labelLink = (title, rows, label = title) => `<button type="button" class="cell-link label-link" data-view="${VIEWS.push({ title, rows, sub: `${windowLabel()} · ${weergaveLabel()}` }) - 1}">${esc(label)}</button>`;
  const lineRow = (item, indent = false) => {
    const open = monthsOpen[item.key];
    const toggle = item.split && item.split.length > 1 ? `<button type="button" class="group-toggle" data-month-line="${esc(item.key)}" aria-expanded="${!!open}">${open ? '▾' : '▸'}</button>` : '<span class="toggle-space"></span>';
    const main = `<tr><td class="label${indent ? ' indent' : ''}">${toggle}${labelLink(item.label, item.rows)}<span class="muted">${item.rows.length}</span></td>${cells(item.values, item.rows)}</tr>`;
    titled(item.label, item.rows);
    const sub = open && item.split ? item.split.slice(0, 20).map(part => { const html = `<tr class="sub"><td class="label indent">${labelLink(`${item.label} · ${part.label}`, part.rows, part.label)}<span class="muted">${part.rows.length}</span></td>${cells(part.values, part.rows)}</tr>`; titled(`${item.label} · ${part.label}`, part.rows); return html; }).join('') + (item.split.length > 20 ? `<tr class="sub"><td class="label indent muted" colspan="15">+ ${item.split.length - 20} kleinere posten, klik op ${esc(item.label)} voor alles</td></tr>` : '') : '';
    return main + sub;
  };
  const totalRow = (label, values, extra = '') => `<tr class="total-row${extra}"><th scope="row">${label}</th>${cells(values, null, true)}</tr>`;
  const apartOpen = monthsOpen.apart;
  const body = `<tbody>
      ${A.income.map(item => lineRow(item)).join('')}
      ${A.expenses.map(item => lineRow(item)).join('')}
      ${totalRow('= Operationele cashflow', A.operating)}
      ${lineRow(A.financing)}
      ${totalRow('= Netto cashflow (bestedingsvermogen)', A.net, ' net')}
    </tbody>
    <tbody class="month-group">
      <tr class="group-head"><th scope="rowgroup"><button type="button" class="group-toggle" data-month-line="apart" aria-expanded="${!!apartOpen}">${apartOpen ? '▾' : '▸'} Niet in de cashflow</button></th>${cells(A.MONTHS.map((key, index) => round2(sum(A.apart.map(item => item.values[index])))), null, true)}</tr>
      ${apartOpen ? A.apart.map(item => { const html = `<tr><td class="label indent">${labelLink(item.label, item.rows)}<span class="muted">${item.rows.length}</span></td>${cells(item.values, item.rows)}</tr>`; titled(item.label, item.rows); return html; }).join('') : ''}
    </tbody>
    <tbody class="month-total">
      <tr><th scope="row">Netto mutatie rekeningen</th>${cells(A.mutation, null, true)}</tr>
      <tr><th scope="row">Saldo einde maand</th>${A.monthEnd.map(value => `<td class="num ${value < 0 ? 'negative' : ''}">${eur(value)}</td>`).join('')}<td class="num total muted">-</td><td></td></tr>
    </tbody>`;
  return card('Maandoverzicht', `${weergaveLabel()} · ${windowLabel()} · klik op een maand, een post of een bedrag voor de transacties; ▸ klapt de post uit`,
    `<div class="table-wrap month-wrap"><table class="lw-table month-table"><thead><tr><th>Post</th>${A.MONTHS.map((key, index) => `<th class="num"><button type="button" class="cell-link month-link" data-view="${VIEWS.push({ title: `Alle transacties ${monthName(key)}`, rows: A.rows.filter(row => row.monthIndex === index), sub: `${monthName(key)} · ${weergaveLabel()}` }) - 1}" title="Alle transacties van ${monthName(key)}">${shortMonth(key)}<span class="muted">${key.slice(2, 4)}</span></button></th>`).join('')}<th class="num">12 mnd</th><th class="num">Gem./mnd</th></tr></thead>${body}</table></div>`,
    `<b>Herleiding:</b> ${revenueLabel().toLowerCase()} (${ruleRef(10)}) min ${costLabel().toLowerCase()} = operationele cashflow; min financieringslasten (${ruleRef(6)} en ${ruleRef(4)}) = netto cashflow, het bestedingsvermogen. Interne boekingen, privé-opnamen, loon DGA, IB/Zvw en ontvangen financiering staan onder <b>Niet in de cashflow</b>. Netto cashflow + niet in de cashflow = netto mutatie op de rekeningen (controle-som).`);
};

/* ---------- Omzet ---------- */
function accountRevenueCard() {
  const rows = A.visibleAccounts.map(account => {
    const own = A.rows.filter(row => row.account === account.iban && row.amount > 0);
    const revenue = own.filter(row => row.rule === 10), internal = own.filter(row => row.rule === 1), other = own.filter(row => ![1, 10].includes(row.rule));
    return `<tr><td><span class="mono">${esc(formatIban(account.iban))}</span><span class="muted">${esc(account.bank ?? '')} · ${esc(account.name)}</span></td>
      <td class="num">${eur(inflow(own))}</td><td class="num">${internal.length ? eur(-inflow(internal)) : '-'}</td><td class="num">${other.length ? eur(-inflow(other)) : '-'}</td><td class="num"><b>${eur(inflow(revenue))}</b></td><td class="num">${eur(inflow(revenue) / 12)}</td>
      <td class="action">${viewButton(`Bijschrijvingen ${formatIban(account.iban)}`, own)}</td></tr>`;
  }).join('');
  const excluded = [...groupBy(A.rows.filter(row => row.amount > 0 && row.rule !== 10), row => row.rule).entries()].sort((first, second) => inflow(second[1]) - inflow(first[1]));
  return `${card(`${revenueLabel()} per rekening`, `${windowLabel()} · bijschrijvingen min alles wat geen ${revenueLabel().toLowerCase()} is`, table(['Rekening', 'num:Bijschrijvingen', 'num:− Eigen rekening', 'num:− Overig', `num:= ${revenueLabel()}`, 'num:Per maand', ''], rows))}
    ${card(`Wat niet als ${revenueLabel().toLowerCase()} telt`, 'Bijschrijvingen die door een eerdere regel zijn afgevangen', `<div class="excluded">${excluded.map(([rule, list]) => `<div class="excluded-row"><div><b>${ruleRef(Number(rule))}</b><span class="why">${list.length} bijschrijvingen · ${[...new Set(list.map(row => row.name ?? '(geen naam)'))].slice(0, 4).map(esc).join(', ')}</span></div><div class="decide"><b>${eur(inflow(list))}</b>${viewButton(ruleName(Number(rule)), list)}</div></div>`).join('') || '<div class="card-body">Geen.</div>'}</div>`)}`;
}
function entityTable(list, side, base) {
  const rows = list.map(entity => `<tr><td><b>${esc(entity.name ?? '(geen naam)')}</b><span class="muted mono">${esc(maskIban(entity.iban))}${isPaymentProcessor(entity) ? ' · betaaldienst (veel klanten)' : ''}</span></td><td class="num">${entity.count}</td><td class="num">${entity.activeMonths}</td><td>${sparkBars(entity.months, side === 'debtor' ? 'var(--primary)' : 'var(--chart-line)', entity.rows, entity.name ?? '(geen naam)')}</td><td class="num">${eur(side === 'debtor' ? entity.total : total(entity.months))}</td><td class="num">${pct(base ? (side === 'debtor' ? entity.total : total(entity.months)) / base : NaN)}</td><td>${entity.category ? esc(entity.category) : '<span class="muted">-</span>'}</td><td class="action">${viewButton(entity.name ?? '(geen naam)', entity.rows)}</td></tr>`).join('');
  return table(['Tegenpartij', 'num:Aantal', 'num:Maanden', 'Verloop', 'num:12 mnd', 'num:Aandeel', 'Categorie', ''], rows || '<tr><td colspan="8">Geen.</td></tr>');
}
RENDERERS.omzet = () => {
  const average = A.averages(A.revenue);
  const top5 = A.debtors.slice(0, 5);
  return `<div class="card"><div class="figures">
      <div class="figure"><b>${eur(A.revenue12)}</b><span>${revenueLabel().toLowerCase()} 12 maanden</span></div>
      <div class="figure"><b>${eur(average.m3)}</b><span>gem. per maand, laatste 3 mnd</span></div>
      <div class="figure"><b>${eur(average.m12)}</b><span>gem. per maand, 12 mnd</span></div>
      <div class="figure"><b>${pct(A.revenue12 ? sum(top5.map(entity => entity.total)) / A.revenue12 : NaN)}</b><span>aandeel grootste 5 tegenpartijen</span></div></div></div>
    ${card(`${revenueLabel()} per maand`, `${windowLabel()} · lijn = gemiddelde over 12 maanden`, `<div class="card-body scroll-x">${barChart([{ label: revenueLabel(), color: SERIES_COLORS.revenue, values: A.revenue }], { line: { label: 'Gemiddelde 12 mnd', color: 'var(--amber-icon)', values: A.MONTHS.map(() => round2(average.m12)) } })}</div>`, `<b>Herleiding:</b> som van ${ruleRef(10)} per maand.`)}
    ${card(isPrivate() ? 'Inkomsten per tegenpartij' : 'Debiteuren', `${A.debtors.length} tegenpartijen · per IBAN, anders per naam`, entityTable(A.debtors, 'debtor', A.revenue12),
      'Categorie = de Loanwise-categorie uit de data.')}
    ${accountRevenueCard()}`;
};

/* ---------- Kosten ---------- */
RENDERERS.kosten = () => {
  const lines = [...A.expenses, A.financing];
  const rows = lines.map(item => `<tr><td>${esc(item.label)}<span class="muted">${esc(item.how)}</span></td><td class="num">${item.rows.length}</td><td>${sparkBars(item.values.map(value => -value), 'var(--chart-line)', item.rows, item.label)}</td><td class="num">${eur(-total(item.values))}</td><td class="num">${eur(-total(item.values) / 12)}</td><td class="num">${pct(A.revenue12 ? -total(item.values) / A.revenue12 : NaN)}</td><td class="action">${viewButton(item.label, item.rows)}</td></tr>`).join('');
  return `${card(`${costLabel()} naast ${revenueLabel().toLowerCase()}`, windowLabel(), `<div class="card-body scroll-x">${barChart([{ label: revenueLabel(), color: SERIES_COLORS.revenue, values: A.revenue }, { label: costLabel(), color: SERIES_COLORS.costs, values: A.costs }])}</div>`, '', legend([[revenueLabel(), SERIES_COLORS.revenue], [costLabel(), SERIES_COLORS.costs]]))}
    ${card(`${costLabel()} per post`, `${windowLabel()} · aandeel = deel van de ${revenueLabel().toLowerCase()}`, table(['Post', 'num:Aantal', 'Verloop', 'num:12 mnd', 'num:Per maand', `num:% ${revenueLabel().toLowerCase()}`, ''], rows))}
    ${card(isPrivate() ? 'Uitgaven per tegenpartij' : 'Crediteuren', `${A.creditors.length} tegenpartijen · ${ruleRef(11)}`, entityTable(A.creditors, 'creditor', A.costs12))}`;
};

/* ---------- Transacties ---------- */
const TX = { month: '', category: '', text: '', quick: 'all', limit: 150 };
const QUICK = [['all', 'Alle', () => true], ['in', 'Bijschrijvingen', row => row.amount > 0], ['out', 'Afschrijvingen', row => row.amount < 0], ['internal', 'Intern', row => row.rule === 1], ['nameless', 'Zonder tegenpartij', row => !row.name]];
RENDERERS.transacties = () => {
  const [, , quick] = QUICK.find(([id]) => id === TX.quick) ?? QUICK[0];
  const text = TX.text.trim().toLowerCase();
  const list = A.rows.filter(row => quick(row) && (TX.month === '' || row.monthIndex === Number(TX.month)) && (TX.category === '' || categoryOf(row) === TX.category) && (!text || `${row.name ?? ''} ${row.description} ${row.counterAccount ?? ''}`.toLowerCase().includes(text)));
  const controls = `<div class="card-body tx-controls">
      <label>Maand <select class="inline-select" id="tx-month">${['', ...A.MONTHS.map((key, index) => String(index))].map(value => `<option value="${value}" ${TX.month === value ? 'selected' : ''}>${value === '' ? 'Alle maanden' : monthName(A.MONTHS[Number(value)])}</option>`).join('')}</select></label>
      <label>Categorie <select class="inline-select" id="tx-category"><option value="">Alle</option>${[...new Set(A.rows.map(categoryOf))].sort((first, second) => first.localeCompare(second, 'nl')).map(label => `<option value="${esc(label)}" ${TX.category === label ? 'selected' : ''}>${esc(label)}</option>`).join('')}</select></label>
      <label>Zoeken <input type="search" id="tx-text" value="${esc(TX.text)}" placeholder="Tegenpartij, omschrijving of IBAN"></label>
      <div class="filters">${QUICK.map(([id, label, filter]) => `<button type="button" class="filter" data-quick="${id}" aria-pressed="${TX.quick === id}">${label} <span class="muted">${A.rows.filter(filter).length}</span></button>`).join('')}</div></div>`;
  return card('Transacties', `${weergaveLabel()} · ${list.length} van ${A.rows.length} · in ${eurCents(inflow(list))} · uit ${eurCents(-outflow(list))}`,
    `${controls}${transactionTable(list, TX.limit, 'tab')}${list.length > TX.limit ? '<div class="card-body"><button type="button" class="btn-outline" data-more>Toon 300 meer</button></div>' : ''}`,
    'Categorie = de Loanwise-categorie uit de data; daaronder waar de transactie in de analyse telt. Klik op een kolomkop om te sorteren.');
};

/* ---------- Risico-indicatoren ---------- */
const MARK = { paid: ['●', 'betaald'], none: ['○', 'niet betaald'], reversal: ['↺', 'teruggeboekt'], other: ['◐', 'ander bedrag'] };
const patternCells = item => `<span class="pattern">${item.marks.map((mark, index) => { const [symbol, text] = MARK[mark]; return `<span class="mark-cell ${mark}" title="${shortMonth(A.MONTHS[6 + index])}: ${text}">${symbol}<small>${shortMonth(A.MONTHS[6 + index])}</small></span>`; }).join('')}</span>`;
/* Risico-indicatoren als checklijst per groep; succesvolle checks kun je verbergen */
let hideGoodChecks = false;
const CHECK_ICON = { good: ICON.good, info: ICON.info, warn: ICON.warn, bad: ICON.bad };
RENDERERS.risico = () => {
  const checks = MODEL.checks;
  const hits = MODEL.hits;
  const groups = RISK_GROUPS.map(group => [group, checks.filter(item => item.groep === group)]).filter(([, items]) => items.length);
  const row = item => {
    const button = item.rows.length ? `<button type="button" class="btn-view ${item.ernst === 'good' ? 'muted-view' : ''}" data-view="${VIEWS.push({ title: item.titel, rows: item.rows, sub: `${windowLabel()} · alle gedeelde rekeningen` }) - 1}">${ICON.eye}bekijken</button>` : '';
    return `<div class="check ${item.ernst}" title="${esc(`Regel: ${item.regel}`)}">${CHECK_ICON[item.ernst]}<div><b>${esc(item.titel)}</b><span>${esc(item.wat)}</span><small>Regel: ${esc(item.regel)}</small></div>${button}</div>`;
  };
  const body = groups.map(([group, items]) => {
    const shown = hideGoodChecks ? items.filter(item => item.ernst !== 'good') : items;
    const found = items.filter(item => item.ernst !== 'good').length;
    if (!shown.length) return `<div class="check-group"><h3>${esc(group)}<span class="chip good">alles in orde</span></h3></div>`;
    return `<div class="check-group"><h3>${esc(group)}${found ? `<span class="muted">${found} van ${items.length} gevonden</span>` : '<span class="chip good">alles in orde</span>'}</h3>${shown.map(row).join('')}</div>`;
  }).join('');
  const toggle = `<button type="button" class="link-button" data-toggle-checks>${hideGoodChecks ? 'Toon alles' : 'Verberg succesvolle checks'}</button>`;
  const obligations = A.obligations.map(item => `<tr><td><b>${esc(item.name)}</b><span class="muted">${esc(item.group)}${item.arrangement ? ' · betalingsregeling' : ''}${!item.active ? ' · gestopt' : ''}</span></td><td class="num">${eur(item.term)}</td><td>${patternCells(item)}</td><td>${item.missed ? `<span class="chip bad">${item.missed}× gemist</span>` : ''}</td><td class="action">${viewButton(item.name, item.rows)}</td></tr>`).join('');
  return `${card('Risico-indicatoren', `${checks.length} checks · ${hits.filter(item => item.ernst === 'bad').length} rood · ${hits.filter(item => item.ernst === 'warn').length} oranje · ${hits.filter(item => item.ernst === 'info').length} ter info · ${checks.length - hits.length} in orde`, `<div class="checks">${body}</div><div class="card-body check-toggle">${toggle}</div>`,
      `Rood = betaalachterstand of risicogedrag, oranje = let op, blauw = ter info. Loanwise oordeelt niet: de interpretatie en toelichting horen in je eigen beoordeling. Gokken, crypto, terugboekingen en incasso kijken naar alle gedeelde rekeningen, ook privé.`)}
    ${card('Vaste lasten', `Laatste 6 maanden (${shortMonth(A.MONTHS[6])} – ${monthName(A.MONTHS[11])}) · ● betaald ○ niet betaald ↺ teruggeboekt`, table(['Tegenpartij', 'num:Termijn', 'Patroon', '', ''], obligations || '<tr><td colspan="5">Geen terugkerende lasten gevonden.</td></tr>'),
      '<b>Herkenning:</b> zelfde tegenpartij, bedrag binnen ±2%, in ten minste 3 van de laatste 6 maanden. Een lege maand tussen betalingen of een terugboeking = gemiste termijn.')}`;
};

/* ---------- Belastingen: betaalt de klant omzetbelasting, loonheffing en inkomstenbelasting? ---------- */
const TAX_TONE = { good: ['good', 'In orde'], warn: ['warn', 'Let op'], info: ['', 'Ter info'] };
RENDERERS.belasting = () => {
  const overview = MODEL.tax;
  if (!overview) return '<div class="card"><div class="card-body">Geen rekeningen in de analyse.</div></div>';
  const { MONTHS, quarters, lines } = overview;
  const view = (title, rows) => rows.length ? VIEWS.push({ title, rows, sub: `${windowLabel()} · alle gedeelde rekeningen` }) - 1 : null;
  const money = (title, rows, paidValue, refundValue, missing) => {
    if (!paidValue && !refundValue) return missing ? '<span class="tax-missing" title="Geen betaling gezien">geen</span>' : '<span class="muted">·</span>';
    const index = view(title, rows);
    const text = `${paidValue ? eur(paidValue) : ''}${paidValue && refundValue ? '<br>' : ''}${refundValue ? `<span class="positive">+${eur(refundValue)}</span>` : ''}`;
    return index == null ? text : `<button type="button" class="cell-link" data-view="${index}">${text}</button>`;
  };
  /* kaartjes: de drie belastingen waar het om gaat */
  const focus = lines.filter(line => TAX_FOCUS.includes(line.type)).map(line => {
    const [tone, label] = TAX_TONE[line.status.tone];
    const special = line.special.length ? `<span class="tax-note">${ICON.warn} ${[...new Set(line.special.map(row => row.tax.previousYear && !['Naheffing', 'Betalingsregeling'].includes(row.tax.kind) ? `over ${row.tax.year}` : row.tax.kind.toLowerCase()))].join(', ')}</span>` : '';
    return `<div class="tax-card"><div class="tax-card-head"><b>${esc(line.label)}</b><span class="chip ${tone}">${label}</span></div>
      <div class="tax-card-value">${line.total ? eur(line.total) : '€ 0'}<small> betaald in 12 mnd</small></div>
      <div class="tax-card-sub">${esc(line.status.text)}${line.refunds ? ` · teruggaaf ${eur(line.refunds)}` : ''}</div>
      <div class="tax-card-sub">${line.last ? `Laatste betaling ${dateNl(line.last.date)} · ${eur(-line.last.amount)}` : 'Geen betaling op de gedeelde rekeningen'}${line.roles.length ? ` · ${line.roles.map(role => ({ zakelijk: 'zakelijke', prive: 'privé', gemengd: 'gemengde' })[role]).join(' en ')} rekening` : ''}</div>
      ${special}
      <div class="tax-quarters">${line.perQuarter.map(quarter => `<span class="tax-q ${quarter.paid || quarter.refund ? 'paid' : line.type === 'ob' && quarter.full && line.rows.length ? 'missing' : ''}" title="${quarter.label}${quarter.full ? '' : ' (deels in de periode)'}"><small>${quarter.label}</small>${quarter.paid ? eur(quarter.paid) : quarter.refund ? `+${eur(quarter.refund)}` : '–'}</span>`).join('')}</div>
      ${line.rows.length ? viewButton(line.label, line.rows, `${windowLabel()} · alle gedeelde rekeningen`) : ''}</div>`;
  }).join('');
  /* jaaroverzicht: maanden gegroepeerd per kwartaal, met kwartaaltotaal */
  const head1 = `<tr><th rowspan="2">Soort</th>${quarters.map((quarter, position) => `<th colspan="${quarter.months.length + 1}" class="q-head q${position % 2}">${quarter.label}${quarter.full ? '' : ' <span class="muted">(deels)</span>'}</th>`).join('')}<th rowspan="2" class="num">12 mnd</th></tr>`;
  const head2 = `<tr>${quarters.map((quarter, position) => `${quarter.months.map(index => `<th class="num q${position % 2}">${shortMonth(MONTHS[index])}</th>`).join('')}<th class="num q-total q${position % 2}">Totaal</th>`).join('')}</tr>`;
  const body = lines.map(line => `<tr><th scope="row"><b>${esc(line.label)}</b><span class="muted">${esc(line.status.text)}</span></th>${line.perQuarter.map((quarter, position) => `${quarter.months.map(index => `<td class="num q${position % 2}">${money(`${line.label} · ${monthName(MONTHS[index])}`, line.rows.filter(row => row.monthIndex === index), line.paid[index], line.refund[index], line.missingMonths.includes(index))}</td>`).join('')}<td class="num q-total q${position % 2}">${money(`${line.label} · ${quarter.label}`, quarter.rows, quarter.paid, quarter.refund, line.missingQuarters.includes(quarter))}</td>`).join('')}<td class="num total"><b>${eur(line.total)}</b>${line.refunds ? `<br><span class="positive">+${eur(line.refunds)}</span>` : ''}</td></tr>`).join('');
  const totals = MONTHS.map((key, index) => round2(sum(lines.map(line => line.paid[index]))));
  const foot = `<tr class="total-row"><th scope="row">Totaal betaald</th>${quarters.map((quarter, position) => `${quarter.months.map(index => `<td class="num q${position % 2}">${totals[index] ? eur(totals[index]) : '<span class="muted">·</span>'}</td>`).join('')}<td class="num q-total q${position % 2}"><b>${eur(sum(quarter.months.map(index => totals[index])))}</b></td>`).join('')}<td class="num total"><b>${eur(sum(totals))}</b></td></tr>`;
  /* per soort: wat voor betalingen het zijn */
  const kindRows = lines.filter(line => line.rows.length).map(line => `<tr><td><b>${esc(line.label)}</b><span class="muted">${esc(line.pattern)}</span></td><td>${line.kinds.map(kind => `<span class="chip ${['Naheffing', 'Betalingsregeling'].includes(kind.kind) ? 'warn' : kind.kind === 'Teruggaaf' ? 'good' : 'outline'}">${esc(kind.kind)} ${kind.count}×</span>`).join(' ')}</td><td class="num">${eur(line.total)}</td><td class="action">${viewButton(line.label, line.rows, `${windowLabel()} · alle gedeelde rekeningen`)}</td></tr>`).join('');
  return `<div class="tax-cards">${focus}</div>
    ${card('Belastingdienst over het jaar', `${windowLabel()} · per maand, kwartalen uitgelicht · alle gedeelde rekeningen (zakelijk en privé)`, `<div class="table-wrap month-wrap"><table class="lw-table month-table tax-table"><thead>${head1}${head2}</thead><tbody>${body}${foot}</tbody></table></div>`,
      `<b>Herleiding:</b> ${ruleRef(3)}, soort uit het betalingskenmerk of de omschrijving. Bedragen = betaald aan de Belastingdienst, <span class="positive">+</span> = teruggaaf. <span class="tax-missing">geen</span> = een kwartaal zonder btw-betaling, of een maand zonder termijn tussen twee betaalde maanden. Omzetbelasting wordt meestal betaald in de maand na het kwartaal, dus een betaling in januari hoort bij K4. Gemeente- en waterschapsbelastingen staan niet in dit overzicht.`)}
    ${card('Soorten betalingen', 'Aangifte, voorlopige aanslag, naheffing, betalingsregeling en teruggaaf', kindRows ? table(['Belasting', 'Soorten', 'num:Betaald 12 mnd', ''], kindRows) : '<div class="card-body">Geen betalingen aan de Belastingdienst gezien.</div>')}`;
};
