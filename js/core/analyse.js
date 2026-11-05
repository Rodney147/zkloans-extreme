'use strict';
/* ---------- Venster: 12 volle maanden tot de laatste maand met data ---------- */
function analysisWindow(rows) {
  const last = rows.at(-1).date;
  const lastDay = new Date(Date.UTC(Number(last.slice(0, 4)), Number(last.slice(5, 7)), 0)).getUTCDate();
  const end = Number(last.slice(8, 10)) >= lastDay - 3 ? last.slice(0, 7) : new Date(Date.UTC(Number(last.slice(0, 4)), Number(last.slice(5, 7)) - 2, 1)).toISOString().slice(0, 7);
  const [year, month] = end.split('-').map(Number);
  return Array.from({ length: 12 }, (_, index) => new Date(Date.UTC(year, month - 12 + index, 1)).toISOString().slice(0, 7));
}

const counterpartyKey = row => row.counterAccount ?? `naam:${(row.name ?? '').toLowerCase() || '(geen naam)'}`;
const decisionKey = (side, key) => `${side}|${key}`;
const RULE_ORDER = [10, 11, 8, 3, 6, 5, 7, 9, 4, 2, 1, 12];
/* IB en Zvw zijn privébelasting: niet in de zakelijke cashflow, wel apart zichtbaar */
const PRIVATE_TAX = ['ib', 'zvw'];
/* Gemiddelde over de laatste n maanden van het venster */
const averageLast = (values, count) => sum(values.slice(-count)) / count;

/* ---------- Analyse: alles volgt uit de transacties in de gekozen weergave ---------- */
function analyse() {
  const MONTHS = analysisWindow(DOSSIER.transactions);
  const monthIndexOf = date => MONTHS.indexOf(date.slice(0, 7));
  /* een gemengde rekening telt in de zakelijke weergave mee (privéposten worden per transactie apart gezet) */
  const visibleAccounts = DOSSIER.accounts.filter(account => account.enabled !== false && (overlay === 'samen' || account.role === overlay || (overlay === 'zakelijk' && account.role === 'gemengd')));
  const visible = new Set(visibleAccounts.map(account => account.iban));
  const rows = DOSSIER.transactions.filter(row => visible.has(row.account) && monthIndexOf(row.date) >= 0).map(row => {
    const output = { ...row, ...categorize(row), monthIndex: monthIndexOf(row.date), key: counterpartyKey(row) };
    output.signal = GAMBLING_PATTERN.test(row.name ?? '') || row.e1?.category?.startsWith('gambling') || row.source?.category === 'possible gambling' ? 'gokken' : CRYPTO_PATTERN.test(row.name ?? '') || row.e1?.category === 'investment.crypto' ? 'crypto' : null;
    return output;
  });
  /* regel 10: een structurele bijschrijving bij een leverancier (≥ 3 van 6 maanden, ±2%) is geen losse retour maar een debiteur */
  [...groupBy(rows.filter(row => row.rule === 11 && row.refund && !row.source), row => row.key).values()].forEach(list => {
    const term = median(list.map(row => row.amount));
    const hitMonths = new Set(list.filter(row => Math.abs(row.amount / term - 1) <= 0.02 && row.monthIndex >= 6).map(row => row.monthIndex));
    if (hitMonths.size >= 3) list.forEach(row => { row.rule = 10; row.refund = false; row.how = 'structurele bijschrijving bij een leverancier'; });
  });
  const byRule = id => rows.filter(row => row.rule === id);
  const monthly = (list, value = row => row.amount) => MONTHS.map((key, index) => round2(sum(list.filter(row => row.monthIndex === index).map(value))));
  const out = list => list.filter(row => row.amount < 0);
  const into = list => list.filter(row => row.amount > 0);

  /* tegenpartijen (per IBAN, anders per naam) */
  const twoWay = new Set([...groupBy(byRule(10), row => row.key).keys()].filter(key => byRule(11).some(row => row.key === key && !row.refund)));
  const makeEntities = (list, side) => [...groupBy(list, row => row.key).entries()].map(([key, items]) => {
    const names = items.map(row => row.name).filter(Boolean);
    const name = names.length ? names.sort((first, second) => names.filter(item => item === second).length - names.filter(item => item === first).length)[0] : null;
    const total = round2(Math.abs(sum(items.map(row => row.amount))));
    return { key, side, name, iban: items[0].counterAccount, rows: items, total, count: items.length, months: monthly(items, row => Math.abs(row.amount) * (side === 'creditor' && row.amount > 0 ? -1 : 1)), activeMonths: new Set(items.map(row => row.monthIndex)).size, category: items[0].source ? sourceLabel(items[0].source) : null };
  }).sort((first, second) => second.total - first.total);
  const debtors = makeEntities(byRule(10), 'debtor');
  const creditors = makeEntities(byRule(11), 'creditor');

  /* belastingen */
  const taxRows = byRule(3).sort((first, second) => second.date.localeCompare(first.date));
  const taxSummary = TAX_ORDER.map(type => {
    const list = taxRows.filter(row => row.tax.type === type);
    const paid = out(list);
    return { type, count: list.length, current: -sum(paid.filter(row => !row.tax.previousYear).map(row => row.amount)), previous: -sum(paid.filter(row => row.tax.previousYear).map(row => row.amount)), refunds: inflow(list), rows: list, monthly: monthly(list, row => -row.amount) };
  }).filter(item => item.count);
  const taxOf = type => taxSummary.find(item => item.type === type) ?? { count: 0, current: 0, previous: 0, refunds: 0, monthly: MONTHS.map(() => 0), rows: [] };

  /* vaste lasten: zelfde tegenpartij, bedrag binnen 2%, ≥ 3 van de laatste 6 maanden */
  const lastSix = [6, 7, 8, 9, 10, 11];
  const obligationCandidates = out(rows).filter(row => [3, 4, 5, 6, 7, 11].includes(row.rule) && !(row.rule === 3 && row.tax?.kind === 'Aangifte') && !(row.rule === 5 && isOwnerRole(row.role)));
  const obligations = [...groupBy(obligationCandidates, row => `${row.key}|${row.rule}|${row.tax?.type ?? ''}`).values()].map(items => obligationOf(items, rows, lastSix)).filter(Boolean).sort((first, second) => second.term - first.term);

  /* verbonden partijen */
  const related = [...groupBy(byRule(5), row => `${row.key}|${row.role}`).values()].map(items => ({
    key: items[0].key, name: items[0].name ?? '(geen naam)', iban: items[0].counterAccount, role: items[0].role, how: items[0].how, in: inflow(items), out: outflow(items), count: items.length, rows: items,
  })).sort((first, second) => (second.in + second.out) - (first.in + first.out));

  /* geld tussen onderneming en eigenaar (alleen op rekeningen van de onderneming of gemengd): uitgefilterd, niet gemeten */
  const legal = DOSSIER.legalForm;
  const businessSide = row => { const account = accountOf(row.account); return !!account && (account.owner === 'onderneming' || account.role === 'gemengd'); };
  const memberFlows = byRule(5).filter(row => businessSide(row) && (isOwnerRole(row.role) || row.role === 'Privé-inkomen'));
  const isSalaryText = row => /salaris|\bloon\b|arbeidsbeloning/i.test(row.description);
  const dgaSalaryRows = legal === 'bv' ? out(memberFlows).filter(isSalaryText) : [];
  const drawRows = out(memberFlows).filter(row => !dgaSalaryRows.includes(row));
  const depositRows = into(memberFlows);
  const groupRows = byRule(5).filter(row => row.role === 'Groepsmaatschappij' && /management ?fee|managementvergoeding/i.test(row.description));

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
  const monthEnd = MONTHS.map(key => { const index = days.findLastIndex(day => day.startsWith(key)); return index >= 0 ? balance[index] : 0; });
  const accountBalances = visibleAccounts.map((account, index) => ({ account, negativeDays: perAccount[index].filter(value => value < 0).length, lowest: Math.min(...perAccount[index]) }));

  /* ---------- Cashflow: omzet − kosten = operationeel; − financieringslasten = bestedingsvermogen ---------- */
  const line = (key, label, list, sign, how, splitBy = null) => {
    /* waarden met teken zoals op de bank: ontvangsten positief, betalingen negatief */
    const values = monthly(list);
    const split = splitBy ? [...groupBy(list, splitBy).entries()].map(([name, items]) => ({ label: name, rows: items, values: monthly(items) })).sort((first, second) => Math.abs(sum(second.values)) - Math.abs(sum(first.values))) : null;
    return { key, label, rows: list, values, sign, how, split };
  };
  /* posten uitsplitsen: naar Loanwise-categorie als de data die heeft, anders naar tegenpartij */
  const counterpartyName = DOSSIER.transactions.some(row => row.source) ? row => row.source ? sourceLabel(row.source) : 'Zonder Loanwise-categorie' : row => row.name ?? '(geen naam)';
  const businessTaxRows = taxRows.filter(row => !PRIVATE_TAX.includes(row.tax.type));
  const income = [line('omzet', overlay === 'prive' ? 'Inkomsten' : 'Omzet', byRule(10), 1, 'regel 10', counterpartyName)];
  const expenses = [
    line('kosten', overlay === 'prive' ? 'Uitgaven' : 'Kosten (crediteuren)', byRule(11), -1, 'regel 11, min losse retouren', counterpartyName),
    line('lonen', 'Lonen personeel', out(byRule(8)), -1, 'regel 8'),
    line('bank', 'Bankkosten', byRule(7), -1, 'regel 7'),
    line('belasting', overlay === 'prive' ? 'Belastingen' : 'Belastingen onderneming', overlay === 'prive' ? taxRows : businessTaxRows, -1, overlay === 'prive' ? 'regel 3' : 'regel 3, werkelijk betaald min teruggaaf; IB en Zvw apart', row => TAX_TYPES[row.tax.type].label),
    line('groep', 'Managementfee groepsmaatschappij', groupRows, -1, 'regel 5, omschrijving managementfee', counterpartyName),
  ].filter(item => item.rows.length || item.key === 'kosten');
  const financing = line('financiering', 'Financieringslasten en achterstand', [...out(byRule(6)), ...byRule(4)], -1, 'regel 6 (afschrijvingen) en regel 4', counterpartyName);
  const addValues = list => MONTHS.map((key, index) => round2(sum(list.map(item => item.values[index]))));
  const revenue = income[0].values;
  const costs = MONTHS.map((key, index) => -addValues(expenses)[index]);
  const operating = addValues([...income, ...expenses]);
  const net = addValues([...income, ...expenses, financing]);

  /* alles wat niet in de cashflow telt, apart zichtbaar (samen met de cashflow = netto mutatie op de rekeningen) */
  const inCashflow = new Set([...income, ...expenses, financing].flatMap(item => item.rows));
  const apartLabel = row => {
    if (row.rule === 1) return row.amount > 0 ? 'Van eigen rekening (intern)' : 'Naar eigen rekening (intern)';
    if (dgaSalaryRows.includes(row)) return 'Loon DGA';
    if (row.rule === 5 && row.role === 'Privé-inkomen') return 'Privé-inkomsten (gemengde rekening)';
    if (row.rule === 5 && row.role === 'Privé-uitgave') return 'Privé-uitgaven (gemengde rekening)';
    if (row.rule === 5 && memberFlows.includes(row)) return row.amount < 0 ? 'Privé-opnamen' : 'Privéstortingen';
    if (row.rule === 5 && row.role === 'Groepsmaatschappij') return 'Rekening-courant groepsmaatschappij';
    if (row.rule === 5) return row.amount > 0 ? `Van ${row.role === 'Eigen onderneming' ? 'eigen onderneming' : row.role.toLowerCase()}` : `Naar ${row.role === 'Eigen onderneming' ? 'eigen onderneming' : row.role.toLowerCase()}`;
    if (row.rule === 3) return 'Inkomstenbelasting en Zvw (privébelasting)';
    if (row.rule === 6) return 'Financiering ontvangen';
    if (row.rule === 8) return 'Loon ontvangen';
    if (row.rule === 9) return 'Contant opgenomen';
    if (row.rule === 2) return 'Terugboekingen';
    return 'Ongecategoriseerd';
  };
  const apart = [...groupBy(rows.filter(row => !inCashflow.has(row)), apartLabel).entries()].map(([label, items]) => ({ key: `apart-${label}`, label, rows: items, values: monthly(items), sign: 1, how: 'niet in de cashflow' })).sort((first, second) => Math.abs(sum(second.values)) - Math.abs(sum(first.values)));
  const mutation = monthly(rows);

  const revenue12 = sum(revenue);
  const costs12 = sum(costs);
  return {
    MONTHS, rows, byRule, monthly, revenue, costs, operating, net, income, expenses, financing, apart, mutation,
    debtors, creditors, twoWay, taxRows, taxSummary, taxOf, obligations, related,
    dgaSalaryRows, drawRows, depositRows, groupRows,
    days, balance, monthEnd, accountBalances, visibleAccounts,
    revenue12, costs12, net12: sum(net), operating12: sum(operating), financing12: -sum(financing.values),
    averages: values => ({ m3: averageLast(values, 3), m6: averageLast(values, 6), m12: averageLast(values, 12) }),
    lastThree: [9, 10, 11],
    dataMonths: MONTHS.filter(key => DOSSIER.transactions.some(row => row.date.startsWith(key))).length,
    householdOnly: overlay === 'samen' && legal === 'bv',
  };
}

/* Eén vaste last: zelfde tegenpartij, bedrag binnen 2%, ≥ 3 van de laatste 6 maanden. Lege maand ertussen of terugboeking = gemiste termijn */
function obligationOf(items, rows, lastSix) {
  const perMonth = lastSix.map(index => -sum(items.filter(row => row.monthIndex === index).map(row => row.amount)));
  const term = median(items.filter(row => row.monthIndex >= 6).map(row => -row.amount));
  if (!term) return null;
  const sample = items[0];
  const reversals = rows.filter(row => row.rule === 2 && row.key === sample.key);
  const marks = lastSix.map((index, position) => {
    const value = perMonth[position];
    const reversed = reversals.some(row => row.monthIndex === index);
    if (!value) return reversed ? 'reversal' : 'none';
    if (Math.abs(value / term - 1) <= 0.02) return reversed ? 'reversal' : 'paid';
    return 'other';
  });
  if (marks.filter(mark => mark === 'paid' || mark === 'reversal').length < 3) return null;
  const first = marks.findIndex(mark => mark !== 'none');
  const last = marks.length - 1 - [...marks].reverse().findIndex(mark => mark !== 'none');
  const missed = marks.slice(first, last + 1).filter(mark => mark === 'none').length + marks.filter(mark => mark === 'reversal').length;
  const group = sample.rule === 6 ? 'Leningen en leases' : sample.rule === 3 ? 'Belastingen in termijnen' : sample.rule === 4 ? 'Deurwaarder' : 'Overige vaste lasten';
  const arrangement = items.some(row => row.e1?.flags.includes('payment_arrangement') || /regeling/i.test(row.description)) || (sample.rule === 3 && ['onbekend', 'regeling'].includes(sample.tax?.type));
  return { key: sample.key, name: sample.name ?? '(geen naam)', rule: sample.rule, group, term: round2(term), marks, missed, arrangement, active: marks[5] !== 'none' || marks[4] !== 'none', rows: items, tax: sample.tax ?? null };
}
