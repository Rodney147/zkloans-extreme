'use strict';
/* ---------- Venster: 12 volle maanden tot de laatste maand met data ---------- */
function analysisWindow(rows) {
  const last = rows.at(-1).date;
  const lastDay = new Date(Date.UTC(Number(last.slice(0, 4)), Number(last.slice(5, 7)), 0)).getUTCDate();
  const end = Number(last.slice(8, 10)) >= lastDay - 3 ? last.slice(0, 7) : new Date(Date.UTC(Number(last.slice(0, 4)), Number(last.slice(5, 7)) - 2, 1)).toISOString().slice(0, 7);
  const [year, month] = end.split('-').map(Number);
  return Array.from({ length: 12 }, (_, index) => new Date(Date.UTC(year, month - 12 + index, 1)).toISOString().slice(0, 7));
}

/* ---------- Zekerheid per tegenpartij: vaste signalen, geen AI ---------- */
const CONFIDENCE = { base: 50, legal: 15, reference: 15, recurring: 10, known: 15, twoWay: -20, nameless: -20, spike: -15, investment: -10, e1Agree: 10, e1Disagree: -10, related: 40, cap: 95, threshold: 70, categoryThreshold: 80, criticalThreshold: 90 };
const CONFIDENCE_SIGNALS = [
  ['Basis', CONFIDENCE.base], ['Rechtsvorm in de naam (B.V., V.O.F., N.V.)', CONFIDENCE.legal], ['Factuur-, termijn- of bestelverwijzing in ≥ de helft van de omschrijvingen', CONFIDENCE.reference],
  ['Terugkerend: in ≥ 2 maanden', CONFIDENCE.recurring], ['Bekende leverancier (eerder bevestigd)', CONFIDENCE.known], ['E1 komt overeen (gem. ≥ 0,80)', CONFIDENCE.e1Agree],
  ['Zelfde IBAN ontvangt én betaalt', CONFIDENCE.twoWay], ['Geen naam', CONFIDENCE.nameless], ['Eén betaling > 25% van de maandomzet', CONFIDENCE.spike],
  ['Woorden als lening, storting, investering', CONFIDENCE.investment], ['E1 wijkt af van de eigen regel', CONFIDENCE.e1Disagree],
];
const RULE_RELIABILITY = { 1: 97, 2: 95, 3: 95, 4: 90, 5: 85, 6: 85, 7: 95, 8: 90, 9: 98, 12: 0 };
const CRITICAL_RULES = [3, 5, 6];
const counterpartyKey = row => row.counterAccount ?? `naam:${(row.name ?? '').toLowerCase() || '(geen naam)'}`;
const decisionKey = (side, key) => `${side}|${key}`;

function scoreCounterparty(entity, side, context) {
  const signals = [['Basis', CONFIDENCE.base]];
  const rows = entity.rows;
  if (!entity.name) signals.push(['Geen naam', CONFIDENCE.nameless]);
  if (entity.name && LEGAL_FORM_PATTERN.test(entity.name)) signals.push(['Rechtsvorm in de naam', CONFIDENCE.legal]);
  if (rows.filter(row => REFERENCE_PATTERN.test(row.description)).length >= rows.length / 2) signals.push(['Factuur- of termijnverwijzing', CONFIDENCE.reference]);
  if (new Set(rows.map(row => row.date.slice(0, 7))).size >= 2) signals.push([`Terugkerend in ${new Set(rows.map(row => row.date.slice(0, 7))).size} maanden`, CONFIDENCE.recurring]);
  if (side === 'creditor' && (DOSSIER.knownSuppliers ?? []).includes(entity.name)) signals.push(['Bekende leverancier', CONFIDENCE.known]);
  if (context.twoWay.has(entity.key)) signals.push(['IBAN ontvangt én betaalt', CONFIDENCE.twoWay]);
  if (side === 'debtor' && rows.some(row => row.amount > 0.25 * context.revenueByMonth[row.monthIndex])) signals.push(['Eén betaling > 25% van de maandomzet', CONFIDENCE.spike]);
  if (rows.some(row => INVESTMENT_PATTERN.test(row.description))) signals.push(['Omschrijving lijkt op lening of storting', CONFIDENCE.investment]);
  const e1Rows = rows.filter(row => row.e1);
  if (e1Rows.length) {
    const agree = e1Rows.filter(row => e1Agrees(row)).length / e1Rows.length;
    const confidence = sum(e1Rows.map(row => row.e1.confidence)) / e1Rows.length;
    if (agree < 0.5) signals.push([`E1 wijkt af (${e1Label(e1Rows[0].e1.category)})`, CONFIDENCE.e1Disagree]);
    else if (confidence >= 0.8) signals.push([`E1 komt overeen (gem. ${dec(confidence)})`, CONFIDENCE.e1Agree]);
  }
  const score = Math.max(0, Math.min(CONFIDENCE.cap, sum(signals.map(([, points]) => points))));
  return { score, signals };
}

/* ---------- Analyse: alles volgt uit de transacties in de gekozen weergave ---------- */
const VAT_FACTOR = 21 / 121;
const INTEREST_SHARE = 0.15;
const RULE_ORDER = [10, 11, 8, 3, 6, 5, 7, 9, 4, 2, 1, 12];
function analyse() {
  const MONTHS = analysisWindow(DOSSIER.transactions);
  const monthIndexOf = date => MONTHS.indexOf(date.slice(0, 7));
  /* een gemengde rekening telt in de zakelijke weergave mee (privéposten worden per transactie apart gezet) */
  const visibleAccounts = DOSSIER.accounts.filter(account => account.enabled !== false && (overlay === 'samen' || account.role === overlay || (overlay === 'zakelijk' && account.role === 'gemengd')));
  const visible = new Set(visibleAccounts.map(account => account.iban));
  const rows = DOSSIER.transactions.filter(row => visible.has(row.account) && monthIndexOf(row.date) >= 0).map(row => {
    const result = categorize(row);
    const output = { ...row, ...result, monthIndex: monthIndexOf(row.date), key: counterpartyKey(row) };
    output.e1Agree = e1Agrees(output);
    output.signal = GAMBLING_PATTERN.test(row.name ?? '') || row.e1?.category?.startsWith('gambling') ? 'gokken' : CRYPTO_PATTERN.test(row.name ?? '') || row.e1?.category === 'investment.crypto' ? 'crypto' : null;
    return output;
  });
  const byRule = id => rows.filter(row => row.rule === id);
  const monthly = (list, value = row => row.amount) => MONTHS.map((key, index) => round2(sum(list.filter(row => row.monthIndex === index).map(value))));
  const series = {};
  RULES.forEach(rule => { series[rule.id] = { in: monthly(byRule(rule.id).filter(row => row.amount > 0)), out: monthly(byRule(rule.id).filter(row => row.amount < 0), row => -row.amount) }; });
  const revenue = series[10].in;
  const costs = MONTHS.map((key, index) => round2(series[11].out[index] - series[11].in[index]));

  /* tegenpartijen */
  const twoWay = new Set([...groupBy(byRule(10), row => row.key).keys()].filter(key => byRule(11).some(row => row.key === key && !row.refund)));
  const makeEntities = (list, side) => [...groupBy(list, row => row.key).entries()].map(([key, items]) => {
    const names = items.map(row => row.name).filter(Boolean);
    const entity = { key, side, name: names.length ? names.sort((first, second) => names.filter(name => name === second).length - names.filter(name => name === first).length)[0] : null, iban: items[0].counterAccount, rows: items };
    entity.total = round2(Math.abs(sum(items.map(row => row.amount))));
    entity.months = monthly(items, row => Math.abs(row.amount) * (side === 'creditor' && row.amount > 0 ? -1 : 1));
    entity.count = items.length;
    Object.assign(entity, scoreCounterparty(entity, side, { twoWay, revenueByMonth: revenue }));
    entity.decision = decisions[decisionKey(side, key)] ?? null;
    entity.business = items.some(row => accountOf(row.account)?.role === 'zakelijk');
    entity.effective = entity.decision === 'yes' ? 100 : entity.decision === 'no' ? 0 : entity.score;
    return entity;
  }).sort((first, second) => second.total - first.total);
  const debtors = makeEntities(byRule(10), 'debtor');
  const creditors = makeEntities(byRule(11), 'creditor');
  const scoreOf = row => { const list = row.rule === 10 ? debtors : creditors; return list.find(entity => entity.key === row.key)?.effective ?? 0; };
  rows.forEach(row => {
    if (row.rule === 10 || row.rule === 11) { row.confidence = scoreOf(row); return; }
    let base = RULE_RELIABILITY[row.rule];
    if (row.rule === 1 && row.how === 'gedeelde rekening') base = 99;
    if (row.rule === 3 && row.tax?.valid) base = 99;
    if (row.rule === 5) base = row.derived ? 99 : row.role === 'Familie' ? CONFIDENCE.related : row.role === 'Groepsmaatschappij' ? 70 : 85;
    if (row.rule === 5 && decisions[decisionKey('related', row.key)] === 'yes') base = 100;
    if (row.e1Agree === true && base < 99) base = Math.min(99, base + 5);
    if (row.e1Agree === false && row.rule !== 2) base = Math.max(0, base - 10);
    row.confidence = base;
  });
  /* debiteuren/crediteuren die als 'geen omzet/kosten' zijn beoordeeld */
  const excludedRevenue = monthly(byRule(10).filter(row => decisions[decisionKey('debtor', row.key)] === 'no'));
  const excludedCosts = monthly(byRule(11).filter(row => decisions[decisionKey('creditor', row.key)] === 'no'), row => -row.amount);
  const netCosts = MONTHS.map((key, index) => round2(costs[index] - excludedCosts[index]));
  const vatable = row => (!row.counterAccount || row.counterAccount.startsWith('NL')) && !/verzeker|premie|zorg/i.test(`${row.name} ${row.description}`) && decisions[decisionKey('creditor', row.key)] !== 'no';

  /* belastingen */
  const taxRows = byRule(3).sort((first, second) => second.date.localeCompare(first.date));
  const taxSummary = TAX_ORDER.map(type => {
    const list = taxRows.filter(row => row.tax.type === type);
    const paid = list.filter(row => row.amount < 0);
    return { type, count: list.length, current: -sum(paid.filter(row => !row.tax.previousYear).map(row => row.amount)), previous: -sum(paid.filter(row => row.tax.previousYear).map(row => row.amount)), refunds: sum(list.filter(row => row.amount > 0).map(row => row.amount)), rows: list, monthly: monthly(list, row => -row.amount) };
  }).filter(item => item.count);
  const taxOf = type => taxSummary.find(item => item.type === type) ?? { count: 0, current: 0, previous: 0, refunds: 0, monthly: MONTHS.map(() => 0), rows: [] };
  const vatBase = MONTHS.map((key, index) => revenue[index] - excludedRevenue[index] - sum(byRule(11).filter(row => row.monthIndex === index && vatable(row)).map(row => -row.amount)));
  const vatExpected = vatBase.map(value => round2(value * VAT_FACTOR));
  const vatPaid = taxOf('ob').monthly;

  /* betalingsregelingen en terugkerende verplichtingen (laatste 6 maanden) */
  const lastSix = [6, 7, 8, 9, 10, 11];
  const obligationCandidates = rows.filter(row => row.amount < 0 && [3, 4, 5, 6, 7, 11].includes(row.rule) && !(row.rule === 3 && row.tax?.kind === 'Aangifte') && !(row.rule === 5 && isOwnerRole(row.role)));
  const obligations = [...groupBy(obligationCandidates, row => `${row.key}|${row.rule}|${row.tax?.type ?? ''}`).values()].map(items => obligationOf(items, rows, lastSix)).filter(Boolean).sort((first, second) => second.term - first.term);

  /* verbonden partijen */
  const related = [...groupBy(byRule(5), row => `${row.key}|${row.role}`).values()].map(items => ({
    key: items[0].key, name: items[0].name ?? '(geen naam)', iban: items[0].counterAccount, role: items[0].role, memberId: items[0].memberId ?? null, how: items[0].how, derived: items[0].derived ?? null,
    in: inflow(items), out: outflow(items), count: items.length, rows: items, loan: items.some(row => /lening|aflossing/i.test(row.description)),
    status: items[0].derived ? 'Bevestigd (eigen rekening)' : /^Privé-/.test(items[0].role) ? 'Gemengde rekening' : decisions[decisionKey('related', items[0].key)] === 'yes' ? 'Bevestigd door analist' : decisions[decisionKey('related', items[0].key)] === 'no' ? 'Afgewezen' : 'Voorgesteld',
  })).sort((first, second) => (second.in + second.out) - (first.in + first.out));

  /* geld tussen onderneming en leden (alleen op rekeningen van de onderneming of gemengd) */
  const legal = DOSSIER.legalForm;
  const businessSide = row => { const account = accountOf(row.account); return !!account && (account.owner === 'onderneming' || account.role === 'gemengd'); };
  const memberFlows = byRule(5).filter(row => businessSide(row) && (isOwnerRole(row.role) || row.role === 'Privé-inkomen'));
  const isSalaryText = row => /salaris|\bloon\b|arbeidsbeloning/i.test(row.description);
  const dgaSalaryRows = legal === 'bv' ? memberFlows.filter(row => row.amount < 0 && isSalaryText(row)) : [];
  const drawRows = memberFlows.filter(row => row.amount < 0 && !dgaSalaryRows.includes(row));
  const depositRows = memberFlows.filter(row => row.amount > 0);
  const dgaSalary = monthly(dgaSalaryRows, row => -row.amount);
  const ownerOut = monthly(drawRows, row => -row.amount);
  const ownerIn = monthly(depositRows);
  const memberDraws = (DOSSIER.members ?? []).map(member => {
    const own = memberFlows.filter(row => row.memberId === member.id);
    return { id: member.id, name: memberName(member), role: member.role, out: outflow(own.filter(row => !dgaSalaryRows.includes(row))), in: inflow(own), salary: outflow(own.filter(row => dgaSalaryRows.includes(row))), rows: own };
  });

  /* groepsmaatschappij: managementvergoeding = kosten, lening/aflossing/dividend = financiering */
  const isFinancingText = row => /lening|aflossing|\brente\b|storting|agio|dividend|kapitaal/i.test(row.description);
  const groupRows = byRule(5).filter(row => row.role === 'Groepsmaatschappij');
  const groupCostRows = groupRows.filter(row => row.amount < 0 && !isFinancingText(row));
  const groupIncomeRows = groupRows.filter(row => row.amount > 0 && !isFinancingText(row));
  const groupCosts = monthly(groupCostRows, row => -row.amount);
  const groupIncome = monthly(groupIncomeRows);
  const informalDebtRows = byRule(5).filter(row => row.amount < 0 && /aflossing|lening/i.test(row.description) && !isOwnerRole(row.role));
  const informalDebt = monthly(informalDebtRows, row => -row.amount);

  /* saldo per dag (som van de rekeningen in de weergave) */
  const firstDay = `${MONTHS[0]}-01`;
  const lastDay = new Date(Date.UTC(Number(MONTHS[11].slice(0, 4)), Number(MONTHS[11].slice(5, 7)), 0)).toISOString().slice(0, 10);
  const days = [];
  for (let day = new Date(`${firstDay}T00:00:00Z`); day.toISOString().slice(0, 10) <= lastDay; day.setUTCDate(day.getUTCDate() + 1)) days.push(day.toISOString().slice(0, 10));
  const balanceFor = account => {
    const own = DOSSIER.transactions.filter(row => row.account === account.iban);
    let pointer = 0, balance = account.startBalance;
    return days.map(day => { while (pointer < own.length && own[pointer].date <= day) { balance = own[pointer].computedBalance ?? own[pointer].balanceAfter; pointer += 1; } return balance; });
  };
  const perAccount = visibleAccounts.map(balanceFor);
  const balance = days.map((day, index) => round2(sum(perAccount.map(list => list[index]))));
  const negativeDays = balance.filter(value => value < 0).length;
  const negativeDaysByMonth = MONTHS.map(key => days.filter((day, index) => day.startsWith(key) && balance[index] < 0).length);

  /* kerncijfers */
  const total = values => sum(values);
  const lastThree = [9, 10, 11];
  const avg = (values, indexes) => sum(indexes.map(index => values[index])) / indexes.length;
  const revenue12 = total(revenue) - total(excludedRevenue);
  const costs12 = total(netCosts);
  const wages12 = total(series[8].out);
  const bank12 = total(series[7].out);
  const lh12 = taxOf('lh').current + taxOf('lh').previous;
  const vatNet12 = taxOf('ob').current + taxOf('ob').previous - taxOf('ob').refunds;
  const debtService = MONTHS.map((key, index) => round2(series[6].out[index] + informalDebt[index]));
  /* belasting: werkelijk betaald (netto na teruggaaf). IB en Zvw zijn privébelasting: niet in de operationele kasstroom */
  const PRIVATE_TAX = ['ib', 'zvw'];
  const businessTax = MONTHS.map((key, index) => round2(sum(taxSummary.filter(item => !PRIVATE_TAX.includes(item.type)).map(item => item.monthly[index]))));
  const privateTaxOnBusiness = MONTHS.map((key, index) => round2(sum(taxSummary.filter(item => PRIVATE_TAX.includes(item.type)).map(item => sum(item.rows.filter(row => row.monthIndex === index && businessSide(row)).map(row => -row.amount))))));
  const operating = MONTHS.map((key, index) => round2(revenue[index] - excludedRevenue[index] - netCosts[index] - series[8].out[index] - series[7].out[index] - businessTax[index] - groupCosts[index] + groupIncome[index]));
  const capacityBase = carryingCapacity({ legal, operating, dgaSalary, ownerOut, ownerIn, memberDraws, privateTaxOnBusiness, months: MONTHS.length });
  const ownerNet = overlay === 'zakelijk' ? capacityBase.deduction : MONTHS.map(() => 0);
  const freeCash = MONTHS.map((key, index) => round2(operating[index] - (overlay === 'zakelijk' ? capacityBase.deduction[index] : 0)));
  const dscrBefore = total(debtService) ? total(operating) / total(debtService) : Infinity;
  const dscr = total(debtService) ? total(freeCash) / total(debtService) : Infinity;

  /* kasstroomopbouw: alleen werkelijk betaalde en ontvangen bedragen, geen winstcijfer */
  const cashLines = [
    { key: 'omzet', label: 'Omzet (ontvangen, incl. btw)', sign: 1, values: MONTHS.map((key, index) => round2(revenue[index] - excludedRevenue[index])), how: `regel 10, min als 'geen omzet' beoordeeld`, rows: byRule(10) },
    { key: 'kosten', label: 'Kosten (betaald, incl. btw)', sign: -1, values: netCosts, how: 'regel 11 min retouren', rows: byRule(11) },
    { key: 'lonen', label: 'Lonen personeel', sign: -1, values: series[8].out, how: 'regel 8', rows: byRule(8) },
    { key: 'bank', label: 'Bankkosten', sign: -1, values: series[7].out, how: 'regel 7', rows: byRule(7) },
    { key: 'belasting', label: 'Belastingen onderneming (btw, loonheffing, vpb, overig)', sign: -1, values: businessTax, how: 'regel 3, werkelijk betaald min teruggaaf; IB en Zvw niet', rows: taxRows.filter(row => !PRIVATE_TAX.includes(row.tax.type)) },
    ...(total(groupCosts) || total(groupIncome) ? [{ key: 'groep', label: 'Groepsmaatschappij (managementfee e.d.)', sign: -1, values: MONTHS.map((key, index) => round2(groupCosts[index] - groupIncome[index])), how: 'regel 5 groep, zonder lening, aflossing of dividend', rows: [...groupCostRows, ...groupIncomeRows] }] : []),
  ];
  const deductionLines = overlay !== 'zakelijk' ? [] : capacityBase.lines;

  return {
    MONTHS, rows, byRule, series, revenue, costs, excludedRevenue, debtors, creditors, twoWay, taxRows, taxSummary, taxOf, vatExpected, vatPaid, vatBase,
    obligations, related, ownerOut, ownerIn, informalDebt, informalDebtRows, days, balance, negativeDays, negativeDaysByMonth, visibleAccounts, lastThree, avg,
    netCosts, excludedCosts, cashLines, deductionLines, capacityBase, businessTax, privateTaxOnBusiness, groupCosts, groupIncome, groupCostRows, dgaSalary, dgaSalaryRows, drawRows, depositRows, memberDraws,
    ownerNet, freeCash, dscrBefore,
    revenue12, costs12, wages12, bank12, lh12, vatNet12, debtService, operating, dscr, monthly,
    dataMonths: MONTHS.filter(key => DOSSIER.transactions.some(row => row.date.startsWith(key))).length,
    householdOnly: overlay === 'samen' && legal === 'bv',
  };
}

/* Eén verplichting: vaste tegenpartij, bedrag binnen 2%, ≥ 3 van de laatste 6 maanden */
function obligationOf(items, rows, lastSix) {
  const perMonth = lastSix.map(index => -sum(items.filter(row => row.monthIndex === index).map(row => row.amount)));
  const term = median(items.filter(row => row.monthIndex >= 6).map(row => -row.amount));
  if (!term) return null;
  const sample = items[0];
  /* inhaalbetaling alleen bij financiering, belasting en deurwaarder vanaf een minimumtermijn (abonnementen met meer licenties tellen niet) */
  const allowCatchUp = [3, 4, 6].includes(sample.rule) && term >= SIGNAALGRENZEN.inhaalMinimumTermijn;
  const reversals = rows.filter(row => row.rule === 2 && row.key === sample.key);
  const marks = lastSix.map((index, position) => {
    const value = perMonth[position];
    const reversed = reversals.some(row => row.monthIndex === index);
    if (!value) return reversed ? 'reversal' : 'none';
    const ratio = value / term;
    if (reversed && Math.abs(ratio - 1) <= 0.02) return 'reversal';
    if (Math.abs(ratio - 1) <= 0.02) return 'paid';
    if (allowCatchUp && Math.abs(ratio - Math.round(ratio)) <= 0.04 && Math.round(ratio) >= 2) return `${Math.round(ratio)}x`;
    return 'other';
  });
  const hits = marks.filter(mark => mark === 'paid' || /x$/.test(mark) || mark === 'reversal').length;
  if (hits < 3) return null;
  const first = marks.findIndex(mark => mark !== 'none');
  const last = marks.length - 1 - [...marks].reverse().findIndex(mark => mark !== 'none');
  const missed = marks.slice(first, last + 1).filter(mark => mark === 'none').length + marks.filter(mark => mark === 'reversal').length;
  const group = sample.rule === 6 ? 'Leningen en leases' : sample.rule === 3 ? 'Belastingen in termijnen' : sample.rule === 4 ? 'Deurwaarder' : sample.rule === 5 ? 'Privé en verbonden partijen' : 'Overige vaste lasten';
  const arrangement = items.some(row => row.e1?.flags.includes('payment_arrangement') || /regeling/i.test(row.description)) || (sample.rule === 3 && sample.tax?.type === 'onbekend');
  const confirmed = sample.rule === 6 || (sample.rule === 3 && sample.tax?.type !== 'onbekend') || items.some(row => row.e1 && /^loan\./.test(row.e1.category));
  return { key: sample.key, name: sample.name ?? '(geen naam)', rule: sample.rule, group, term: round2(term), marks, missed, catchUp: marks.filter(mark => /x$/.test(mark)).length, arrangement, active: marks[5] !== 'none' || marks[4] !== 'none', confirmed, confidence: confirmed ? (sample.rule === 6 ? 97 : 99) : 65, rows: items, tax: sample.tax ?? null, e1: sample.e1?.category ?? null };
}

/* Vaste privélasten per lid: terugkerende afschrijvingen op zijn of haar privérekeningen (≥ 4 van de laatste 6 maanden, ±2%), zonder overboekingen tussen eigen rekeningen */
function privateFixedCosts(memberId) {
  const accounts = DOSSIER.accounts.filter(account => account.owner === memberId && account.role === 'prive' && account.enabled !== false);
  if (!accounts.length) return { known: false, monthly: 0, items: [] };
  const ibans = new Set(accounts.map(account => account.iban));
  const months = analysisWindow(DOSSIER.transactions).slice(6);
  /* zonder overboekingen naar eigen rekeningen en naar andere leden (bijv. bijdrage aan de partner-vennoot) */
  const rows = DOSSIER.transactions.filter(row => ibans.has(row.account) && row.amount < 0 && months.includes(row.date.slice(0, 7)) && !(row.counterAccount && accountOf(row.counterAccount)) && !relatedRole(row.name)?.memberId);
  const items = [...groupBy(rows, row => counterpartyKey(row)).values()].map(list => {
    const term = median(list.map(row => -row.amount));
    const hitMonths = new Set(list.filter(row => Math.abs(-row.amount / term - 1) <= 0.02).map(row => row.date.slice(0, 7)));
    return hitMonths.size >= 4 ? { name: list[0].name ?? '(geen naam)', term: round2(term), rows: list } : null;
  }).filter(Boolean).sort((first, second) => second.term - first.term);
  return { known: true, monthly: round2(sum(items.map(item => item.term))), items };
}

/* Draagkracht per rechtsvorm (categorieregels: "Draagkracht per rechtsvorm"): nooit privélasten én opnamen allebei aftrekken */
function carryingCapacity({ legal, operating, dgaSalary, ownerOut, ownerIn, memberDraws, privateTaxOnBusiness, months }) {
  const zero = operating.map(() => 0);
  if (legal === 'bv') {
    const rcNet12 = Math.max(0, sum(ownerOut) - sum(ownerIn));
    const rcMonthly = operating.map(() => round2(rcNet12 / months));
    const deduction = operating.map((value, index) => round2(dgaSalary[index] + rcMonthly[index]));
    return { legal, deduction, lines: [
      { key: 'dga', label: 'Loon DGA', sign: -1, values: dgaSalary, how: 'regel 5 naar DGA met salaris/loon in de omschrijving' },
      { key: 'rc', label: 'Rekening-courant DGA (netto opname, gemiddeld)', sign: -1, values: rcMonthly, how: `netto naar DGA buiten loon: ${eur(rcNet12)} over 12 mnd; stortingen tellen niet als kasstroom` },
    ], perMember: [], notes: [] };
  }
  /* eenmanszaak en vof: per lid het hoogste van werkelijke netto opnamen óf vaste privélasten + leefgeld */
  const leefgeld = NORMEN.leefgeldPerMaand;
  const notes = [];
  const perMember = (memberDraws.length ? memberDraws : [{ id: null, name: 'Eigenaar', out: 0, in: 0 }]).map(member => {
    const actual = Math.max(0, member.out - member.in) / months;
    const fixed = member.id ? privateFixedCosts(member.id) : { known: false, monthly: 0, items: [] };
    const needed = fixed.known ? fixed.monthly + (leefgeld ?? 0) : null;
    const used = Math.max(actual, needed ?? 0);
    if (!fixed.known) notes.push(`${member.name}: geen privérekening gedeeld; vaste privélasten onbekend, alleen werkelijke opnamen (${eur(actual)}/mnd) gebruikt.`);
    if (fixed.known && leefgeld == null) notes.push(`${member.name}: leefgeld niet ingesteld (norm Risk); alleen vaste privélasten ${eur(fixed.monthly)}/mnd meegenomen.`);
    return { ...member, actual: round2(actual), fixed, needed: needed == null ? null : round2(needed), used: round2(used), basis: used === actual ? 'werkelijke opnamen' : 'privélasten + leefgeld' };
  });
  const perMonth = round2(sum(perMember.map(member => member.used)));
  if (!sum(ownerOut) && !perMember.some(member => member.fixed.known)) notes.push('Geen privé-opnamen zichtbaar en geen privérekening: de draagkracht is te hoog als de eigenaar uit een niet-gedeelde rekening leeft. Privérekening opvragen.');
  return { legal, deduction: operating.map((value, index) => round2(perMonth + privateTaxOnBusiness[index])), perMember, notes, lines: [
    { key: 'ibzvw', label: 'IB en Zvw van de zakelijke rekening', sign: -1, values: privateTaxOnBusiness, how: 'privébelasting, één keer meegenomen' },
    { key: 'opname', label: 'Benodigde privé-opname', sign: -1, values: operating.map(() => perMonth), how: perMember.map(member => `${member.name}: ${eur(member.used)}/mnd (${member.basis})`).join(' · ') },
  ] };
}


/* ---------- Bandbreedte: oordeel met alleen zekere omzet versus alle omzet ---------- */
/* Oordeel alleen met een door Risk ingestelde norm; zonder norm: 'info' (geen oordeel) */
const dscrVerdict = (value, norm = NORMEN.dscrMinimum) => norm == null || !Number.isFinite(value) ? 'info' : value >= norm ? 'good' : 'bad';
function bandwidth(an = A) {
  const certain = entity => entity.effective >= CONFIDENCE.threshold;
  const counted = entity => entity.decision !== 'no';
  const revenueAll = sum(an.debtors.filter(counted).map(entity => entity.total));
  const revenueCertain = sum(an.debtors.filter(entity => counted(entity) && certain(entity)).map(entity => entity.total));
  const costsAll = sum(an.creditors.filter(counted).map(entity => sum(entity.months)));
  const costsCertain = sum(an.creditors.filter(entity => counted(entity) && certain(entity)).map(entity => sum(entity.months)));
  const debt = sum(an.debtService);
  const operating = sum(an.freeCash);
  /* minder omzet = ook minder verschuldigde btw; minder kosten = ook minder aftrekbare btw (≈ 85% NL-inkoop) */
  const worst = debt ? (operating - (revenueAll - revenueCertain) * (1 - VAT_FACTOR)) / debt : Infinity;
  const best = debt ? (operating + (costsAll - costsCertain) * (1 - VAT_FACTOR * 0.85)) / debt : Infinity;
  return { revenue: { min: revenueCertain, max: revenueAll, uncertain: revenueAll - revenueCertain }, costs: { min: costsCertain, max: costsAll, uncertain: costsAll - costsCertain }, worst, best };
}
function reviewState(an = A) {
  const band = bandwidth(an);
  const open = [...an.debtors, ...an.creditors].filter(entity => entity.business && entity.score < CONFIDENCE.threshold && !entity.decision).sort((first, second) => second.total - first.total);
  const uncertainShare = band.revenue.max ? (band.revenue.uncertain + band.costs.uncertain) / band.revenue.max : 0;
  /* met norm: controle als het oordeel omslaat; zonder norm: als het onzekere volume boven de signaalgrens ligt */
  const needed = open.length > 0 && (NORMEN.dscrMinimum != null ? dscrVerdict(band.worst) !== dscrVerdict(band.best) : uncertainShare > SIGNAALGRENZEN.lageZekerheidAandeel);
  return { band, worst: band.worst, best: band.best, open, needed, uncertainShare };
}
function categoryConfidence() {
  return RULE_ORDER.filter(id => id !== 12).map(id => {
    const list = A.byRule(id);
    const weight = sum(list.map(row => Math.abs(row.amount)));
    const score = weight ? sum(list.map(row => Math.abs(row.amount) * row.confidence)) / weight : null;
    return { id, label: ruleName(id), score, threshold: CRITICAL_RULES.includes(id) ? CONFIDENCE.criticalThreshold : CONFIDENCE.categoryThreshold, count: list.length, amount: weight };
  }).filter(item => item.count);
}
