'use strict';
/* Deterministische testsets in Loanwise-formaat (bedragen in centen), met vooraf vastgelegde verwachte uitkomsten.
   De verwachte waarden volgen uit hoe de set is opgebouwd (de "waarheid" van de generator), niet uit de rekenkern.
   Gebruik: node tests/generators/generate.js  → schrijft tests/fixtures/ez-gemengd en tests/fixtures/vof */
const fs = require('node:fs');
const path = require('node:path');

const WEIGHTS = [10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2];
const checkDigit = body => { const value = 11 - [...body].reduce((total, digit, index) => total + Number(digit) * WEIGHTS[index], 0) % 11; return value === 11 ? 0 : value === 10 ? 1 : value; };
const kenmerk = body => `${checkDigit(body)}${body}`;
const TAX_NEW = 'NL04RABO0200112244';
const MONTHS = ['2025-11', '2025-12', '2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10'];

function seeded(seed) { return () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; }; }
const cents = euro => Math.round(euro * 100);
const day = (month, value) => `${month}-${String(value).padStart(2, '0')}`;

function builder(seed) {
  const random = seeded(seed);
  const rows = [];
  let counter = 0;
  const add = (account, date, euro, name, counterAccount, description, type = 'transfer') => rows.push({ account, row: { external_id: `t${++counter}`, booking_date: date, transaction_amount: { amount: cents(euro), currency: 'EUR' }, remittance_information_unstructured: description, counter_party_name: name, counter_party_account: counterAccount, transaction_type: type } });
  const amount = (base, spread) => Math.round((base + (random() - 0.5) * 2 * spread) * 100) / 100;
  return { rows, add, amount, random };
}
function writeSet(folder, dataset, expected) {
  const dir = path.join(__dirname, '..', 'fixtures', folder);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'dataset.json'), JSON.stringify(dataset, null, 1));
  fs.writeFileSync(path.join(dir, 'expected.json'), JSON.stringify(expected, null, 2));
}
function accountsWithBalances(accounts, rows, opening) {
  return accounts.map(account => {
    const own = rows.filter(item => item.account === account.account_number).sort((first, second) => first.row.booking_date.localeCompare(second.row.booking_date));
    const end = opening[account.account_number] + own.reduce((total, item) => total + item.row.transaction_amount.amount, 0);
    return { ...account, account_balance: end, transactions: own.map(item => item.row) };
  });
}

/* ---------- Set 2: eenmanszaak met gemengde rekening, KOR ---------- */
function eenmanszaak() {
  const { rows, add, amount } = builder(424242);
  const MIX = 'NL91TEST0000000101', SAVINGS = 'NL91TEST0000000102', PARTNER = 'NL91TEST0000000103';
  const truth = { revenue: 0, privateIncome: 0, privateSpend: 0, invoices: 0 };
  const customers = [['Bouwbedrijf Hendriks B.V.', 'NL20ABNA0000000201'], ['Woonstichting Oost', 'NL20RABO0000000202'], ['K. Pieters', 'NL20INGB0000000203']];
  MONTHS.forEach((month, index) => {
    customers.forEach(([name, iban], position) => { const value = amount(520, 120); truth.revenue += value; truth.invoices += 1; add(MIX, `${month}-${String(5 + position * 7).padStart(2, '0')}`, value, name, iban, `Factuur JK-${month}-${position + 1}`); });
    add(MIX, `${month}-03`, -950, 'Hypotheekbank Noord N.V.', 'NL20SNSB0000000301', 'Hypotheek woning', 'direct_debit'); truth.privateSpend += 950;
    [8, 15, 22, 28].forEach(dayOfMonth => { const value = amount(95, 25); truth.privateSpend += value; add(MIX, day(month, dayOfMonth), -value, 'Albert Heijn 1234', 'NL20INGB0000000302', 'Betaalpas', 'payment_terminal'); });
    if (index % 3 === 0) { add(MIX, `${month}-10`, 310, 'Sociale Verzekeringsbank', 'NL20INGB0000000303', 'Kinderbijslag'); truth.privateIncome += 310; }
    add(MIX, `${month}-20`, 120, 'Dienst Toeslagen', 'NL20INGB0000000304', 'Zorgtoeslag'); truth.privateIncome += 120;
    if (month !== '2026-07') add(MIX, `${month}-12`, month === '2026-08' ? -620 : -310, 'Bus Lease B.V.', 'NL20ABNA0000000305', month === '2026-08' ? 'Leasetermijn incl. achterstand' : 'Leasetermijn', 'direct_debit');
    add(MIX, `${month}-14`, -300, 'Bouwmaat B.V.', 'NL20ABNA0000000306', `Bestelling ${4000 + index}`);
    add(MIX, `${month}-18`, -400, 'M. Jansen-de Boer', PARTNER, 'Huishoudgeld');
    add(MIX, `${month}-25`, -50, 'J. Jansen', SAVINGS, 'Naar spaarrekening', 'savings');
    if (index >= 1) add(MIX, `${month}-21`, -85, 'Belastingdienst', TAX_NEW, `Voorlopige aanslag IB 2026 ${kenmerk('812345687060002')}`);
    if (index >= 4) add(MIX, `${month}-26`, -200, 'P. Jansen', 'NL20INGB0000000307', 'Aflossing lening');
  });
  add(MIX, '2026-03-02', 2000, 'P. Jansen', 'NL20INGB0000000307', 'Lening');
  const valid = kenmerk('812345687060003');
  const invalid = `${valid.slice(0, 15)}${(Number(valid.at(-1)) + 1) % 10}`;
  add(MIX, '2026-04-21', -60, 'Belastingdienst', TAX_NEW, `Motorrijtuigenbelasting ${invalid}`);
  add(MIX, '2026-09-17', -145, 'Incassobureau Noord B.V.', 'NL20ABNA0000000308', 'Vordering 8812');
  const accounts = accountsWithBalances([{ account_number: MIX, account_name: 'J. Jansen h.o.d.n. Jansen Klusbedrijf', bic: 'TESTNL2A' }], rows, { [MIX]: 900000 });
  writeSet('ez-gemengd', { legal_form: 'eenmanszaak', company: { name: 'Jansen Klusbedrijf', kvkNumber: '90000001', legalForm: 'Eenmanszaak', numberOfEmployees: 1, startDate: '2019-01-01' }, members: [{ initials: 'J.', last_name: 'Jansen' }], accounts }, {
    legalForm: 'eenmanszaak', accountRole: { [MIX]: 'gemengd' },
    revenue12: Math.round(truth.revenue * 100) / 100, invoices: truth.invoices,
    privateIncome12: Math.round(truth.privateIncome * 100) / 100,
    privateSpend12: Math.round(truth.privateSpend * 100) / 100,
    familyRelated: ['P. Jansen', 'M. Jansen-de Boer'],
    vatPayments: 0, invalidReferences: 1, bailiffPayments: 1,
    lease: { name: 'Bus Lease B.V.', missed: 1, catchUp: 1 },
    unsharedOwnAccount: SAVINGS,
    expectRisks: ['rekening-niet-gedeeld', 'incasso'], noRisks: ['vermenging'],
    checklistProposal: { C6: 'info_nodig', E6: 'nvt', E7: 'niet_beoordeeld', B7: 'nvt' },
  });
}

/* ---------- Set 3: vof met twee vennoten (echtpaar), ongelijke opnamen ---------- */
function vof() {
  const { rows, add, amount } = builder(777);
  const BIZ = 'NL91TEST0000000201', PRIV_A = 'NL91TEST0000000202', PRIV_S = 'NL91TEST0000000203';
  const truth = { revenue: 0, drawA: 0, drawS: 0, depositA: 0, depositS: 0, fixedA: 0 };
  MONTHS.forEach((month, index) => {
    for (let dayOfMonth = 2; dayOfMonth <= 27; dayOfMonth += 5) { const value = amount(1800, 300); truth.revenue += value; add(BIZ, day(month, dayOfMonth), value, 'Worldline Pinbetalingen', 'NL20ABNA0000000401', `Pin-afrekening ${day(month, dayOfMonth)}`, 'payment_terminal'); }
    { const value = amount(2400, 200); truth.revenue += value; add(BIZ, `${month}-15`, value, 'Hotel Centraal B.V.', 'NL20ABNA0000000402', `Factuur BDV-${month}`); }
    add(BIZ, `${month}-04`, -amount(4200, 300), 'Meelfabriek Noord B.V.', 'NL20ABNA0000000403', `Factuur ${7000 + index}`);
    add(BIZ, `${month}-01`, -1800, 'Vastgoed Centrum B.V.', 'NL20ABNA0000000404', 'Huur winkel');
    add(BIZ, `${month}-28`, -3000, 'A. de Vries', PRIV_A, 'Arbeidsbeloning'); truth.drawA += 3000;
    add(BIZ, `${month}-28`, -2000, 'S. de Vries', PRIV_S, 'Arbeidsbeloning'); truth.drawS += 2000;
    add(BIZ, `${month}-21`, -260, 'Belastingdienst', TAX_NEW, `Voorlopige aanslag IB 2026 ${kenmerk('812345697060001')}`);
    if (index % 3 === 2) add(BIZ, `${month}-28`, -amount(3100, 200), 'Belastingdienst', TAX_NEW, `Omzetbelasting ${kenmerk(`81234569160${String(10 + index).padStart(2, '0')}20`)}`);
    add(PRIV_A, `${month}-02`, -1400, 'Hypotheekbank Zuid N.V.', 'NL20SNSB0000000405', 'Hypotheek', 'direct_debit'); truth.fixedA += 1400;
    add(PRIV_A, `${month}-03`, -280, 'Zorgverzekeraar Zuid', 'NL20INGB0000000406', 'Premie zorgverzekering', 'direct_debit'); truth.fixedA += 280;
    add(PRIV_A, `${month}-05`, -180, 'Energie Direct B.V.', 'NL20INGB0000000407', 'Termijn energie', 'direct_debit'); truth.fixedA += 180;
    [9, 16, 23].forEach(dayOfMonth => add(PRIV_A, day(month, dayOfMonth), -amount(110, 30), 'Jumbo Centrum', 'NL20INGB0000000408', 'Betaalpas', 'payment_terminal'));
    add(PRIV_A, `${month}-29`, -250, 'S. de Vries', PRIV_S, 'Bijdrage huishouden');
  });
  add(PRIV_A, '2026-04-06', -5000, 'Bakkerij De Vries V.O.F.', BIZ, 'Privéstorting'); add(BIZ, '2026-04-06', 5000, 'A. de Vries', PRIV_A, 'Privéstorting'); truth.depositA += 5000;
  add(BIZ, '2026-02-10', 10000, 'S. de Vries', PRIV_S, 'Kapitaalstorting'); truth.depositS += 10000;
  const accounts = accountsWithBalances([
    { account_number: BIZ, account_name: 'Bakkerij De Vries V.O.F.', bic: 'TESTNL2A', role: 'zakelijk' },
    { account_number: PRIV_A, account_name: 'A. de Vries', bic: 'TESTNL2A', role: 'prive' },
  ], rows, { [BIZ]: 1500000, [PRIV_A]: 400000 });
  writeSet('vof', { legal_form: 'vof', company: { name: 'Bakkerij De Vries V.O.F.', kvkNumber: '90000002', legalForm: 'Vennootschap onder firma', numberOfEmployees: 2, startDate: '2015-05-01' }, members: [{ initials: 'A.', last_name: 'de Vries' }, { initials: 'S.', last_name: 'de Vries' }], accounts }, {
    legalForm: 'vof',
    revenue12: Math.round(truth.revenue * 100) / 100,
    draws: { 'A. de Vries': truth.drawA, 'S. de Vries': truth.drawS },
    deposits: { 'A. de Vries': truth.depositA, 'S. de Vries': truth.depositS },
    fixedPrivateA: truth.fixedA / 12,
    partnerIsVennoot: 'S. de Vries',
    missingPrivateFor: 'S. de Vries',
    noRisks: ['vermenging'],
    checklistProposal: { B7: 'info_nodig', E8: 'info_nodig', E1a: 'nvt', E6: 'nvt' },
  });
}

eenmanszaak();
vof();
console.log('Testsets geschreven: tests/fixtures/ez-gemengd, tests/fixtures/vof');
