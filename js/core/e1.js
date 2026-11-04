'use strict';
/* ---------- E1-taxonomie (Enable Now), alleen labels ---------- */
const E1_GROUPS = [
  ['income', 'Inkomsten'], ['expense', 'Kosten en uitgaven'], ['housing', 'Wonen'], ['office', 'Bedrijfspand'], ['loan', 'Leningen, leases en incasso'], ['alimony', 'Alimentatie'],
  ['insurance', 'Verzekeringen'], ['tax', 'Belastingen'], ['subsidy', 'Subsidies en uitkeringen'], ['cash', 'Contant'], ['investment', 'Beleggingen en sparen'], ['gambling', 'Gokken'],
  ['internal', 'Interne overboekingen'], ['other', 'Overig en niet te categoriseren'],
];
const E1_GROUP_LABEL = Object.fromEntries(E1_GROUPS);
const E1_LABEL = {
  'income.other': 'Klantbetalingen en overige omzet', 'income.salary': 'Salaris', 'income.interest': 'Rente-inkomsten', 'income.rent': 'Huurinkomsten',
  'expense.other': 'Overige bedrijfskosten (o.a. inkoop)', 'expense.salary': 'Salarissen', 'expense.accounting': 'Accountant en administratie', 'expense.marketing': 'Marketing', 'expense.it': 'IT en software',
  'expense.operations.bank_fees': 'Bankkosten', 'expense.operations.office_supplies': 'Kantoorartikelen', 'expense.representation': 'Representatie', 'expense.transport.public_transport': 'Openbaar vervoer', 'expense.transport.parking': 'Parkeren', 'expense.transport.vehicle': 'Voertuigkosten', 'expense.essential.personal_care': 'Persoonlijke verzorging', 'expense.essential.other': 'Overige vaste uitgaven', 'expense.lifestyle.travel': 'Reizen', 'insurance.health': 'Zorgverzekering', 'loan.credit_card': 'Creditcard', 'tax.corporate': 'Vennootschapsbelasting', 'expense.operations.telecom': 'Telefoon en internet', 'expense.operations.utilities': 'Energie bedrijfspand', 'expense.transport.fuel': 'Brandstof en laden',
  'expense.essential.groceries': 'Boodschappen', 'expense.essential.utilities.energy': 'Energie', 'expense.essential.telecom': 'Telefoon en internet', 'expense.essential.childcare': 'Kinderopvang',
  'expense.essential.clothing': 'Kleding', 'expense.essential.municipal': 'Gemeentelijke heffingen', 'expense.essential.financial': 'Bankkosten privé',
  'expense.lifestyle.restaurants_bars': 'Restaurants en cafés', 'expense.lifestyle.streaming': 'Streaming', 'expense.lifestyle.sports': 'Sport',
  'housing.mortgage': 'Hypotheek woning', 'housing.rent': 'Huur woning', 'office.rent': 'Huur bedrijfsruimte',
  'loan.bank': 'Banklening', 'loan.vehicle_lease': 'Lease bedrijfsvoertuig', 'loan.equipment_lease': 'Lease bedrijfsmiddelen', 'loan.private': 'Lening tussen particulieren', 'loan.debt_collection': 'Deurwaarder en incasso',
  'insurance.liability': 'Aansprakelijkheid', 'insurance.vehicle': 'Voertuigverzekering', 'insurance.health': 'Zorgverzekering',
  'tax.vat': 'Omzetbelasting (btw)', 'tax.income': 'Inkomstenbelasting', 'tax.payroll': 'Loonheffing', 'tax.social': 'Sociale premies', 'tax.other': 'Overige belastingen',
  'subsidy.health': 'Zorgtoeslag', 'subsidy.family': 'Kinderbijslag en kindregelingen', 'cash.other': 'Contante transacties', 'investment.savings': 'Sparen en deposito', 'investment.crypto': 'Crypto',
  'gambling.other': 'Gokken', 'gambling.lottery': 'Loterijen', 'internal.other': 'Tussen eigen rekeningen', 'other.private_transfer': 'Overboekingen tussen particulieren', 'other.other': 'Niet betrouwbaar te categoriseren',
};
const e1Label = key => E1_LABEL[key] ?? key;
const e1Group = key => String(key ?? '').split('.')[0];
const E1_FLAG_LABEL = { reversal_payment: 'Terugboeking', refund: 'Terugbetaling', payment_arrangement: 'Betalingsregeling', payment_request: 'Betaalverzoek' };
/* ---------- E1-buckets (zoals de analyse-job van Enable Now), berekend uit de transacties ---------- */
const e1Key = row => row.e1?.category ?? '';
const LEASES = ['loan.debt_collection', 'loan.vehicle_lease', 'loan.equipment_lease'];
const startsWithE1 = prefix => row => e1Key(row).startsWith(prefix);
const isE1 = (...keys) => row => keys.includes(e1Key(row));
const CLIENT_CORPORATE = [
  { name: 'Taxes', nl: 'Belastingen', rule: 'tax.*', test: startsWithE1('tax.'), tone: 'warn' },
  { name: 'Loans', nl: 'Leningen', rule: 'loan.* behalve incasso en leases', test: row => e1Key(row).startsWith('loan.') && !LEASES.includes(e1Key(row)), tone: 'warn' },
  { name: 'Debt collection', nl: 'Deurwaarders en incasso', rule: 'loan.debt_collection', test: isE1('loan.debt_collection'), tone: 'bad' },
  { name: 'Vehicle Lease', nl: 'Lease bedrijfsvoertuigen', rule: 'loan.vehicle_lease', test: isE1('loan.vehicle_lease'), tone: 'warn' },
  { name: 'Equipment Lease', nl: 'Lease bedrijfsmiddelen', rule: 'loan.equipment_lease', test: isE1('loan.equipment_lease'), tone: 'warn' },
  { name: 'Internal transactions', nl: 'Interne overboekingen', rule: 'internal.other', test: isE1('internal.other'), tone: 'info' },
  { name: 'Gambling', nl: 'Gokken', rule: 'gambling.*', test: startsWithE1('gambling.'), tone: 'bad' },
  { name: 'Crypto', nl: 'Crypto', rule: 'investment.crypto', test: isE1('investment.crypto'), tone: 'warn' },
];
const CLIENT_RETAIL = [
  { name: 'Internal transactions', nl: 'Interne overboekingen', rule: 'internal.other', test: isE1('internal.other'), tone: 'info' },
  { name: 'Car', nl: 'Auto', rule: 'tax.vehicle, transport.vehicle/fuel/parking, insurance.vehicle', test: isE1('tax.vehicle', 'expense.transport.vehicle', 'expense.transport.fuel', 'expense.transport.parking', 'insurance.vehicle'), tone: 'info' },
  { name: 'Child', nl: 'Kinderen', rule: 'essential.childcare, subsidy.family', test: isE1('expense.essential.childcare', 'subsidy.family'), tone: 'info' },
  { name: 'Divorced', nl: 'Alimentatie', rule: 'alimony.*', test: startsWithE1('alimony.'), tone: 'warn' },
  { name: 'Pension', nl: 'Pensioen', rule: 'income.pension.*', test: startsWithE1('income.pension.'), tone: 'info' },
  { name: 'Unemployed', nl: 'Werkloosheid', rule: 'subsidy.unemployment', test: isE1('subsidy.unemployment'), tone: 'warn' },
  { name: 'Loans', nl: 'Leningen', rule: 'loan.* behalve incasso', test: row => e1Key(row).startsWith('loan.') && e1Key(row) !== 'loan.debt_collection', tone: 'warn' },
  { name: 'Debt collection', nl: 'Deurwaarders en incasso', rule: 'loan.debt_collection', test: isE1('loan.debt_collection'), tone: 'bad' },
  { name: 'Salary', nl: 'Salaris', rule: 'income.salary', test: isE1('income.salary'), tone: 'info' },
  { name: 'Housing', nl: 'Wonen', rule: 'housing.*', test: startsWithE1('housing.'), tone: 'info' },
  { name: 'Other benefits', nl: 'Overige uitkeringen', rule: 'subsidy.* behalve WW en gezin', test: row => e1Key(row).startsWith('subsidy.') && !['subsidy.unemployment', 'subsidy.family', 'subsidy.family.income'].includes(e1Key(row)), tone: 'info' },
  { name: 'Fines', nl: 'Boetes', rule: 'other.fines', test: isE1('other.fines'), tone: 'warn' },
  { name: 'Gambling', nl: 'Gokken', rule: 'gambling.*', test: startsWithE1('gambling.'), tone: 'bad' },
  { name: 'Crypto', nl: 'Crypto', rule: 'investment.crypto', test: isE1('investment.crypto'), tone: 'warn' },
];
const BUCKETS_COMMON = {
  flaggedTransactions: [
    { name: 'Reversal payments', nl: 'Terugboekingen door de bank', rule: 'flag reversal_payment', test: row => !!row.e1?.flags.includes('reversal_payment'), tone: 'bad' },
    { name: 'Refunds', nl: 'Terugbetalingen', rule: 'flag refund', test: row => !!row.e1?.flags.includes('refund'), tone: 'info' },
    { name: 'Payment arrangements', nl: 'Betalingsregelingen', rule: 'flag payment_arrangement', test: row => !!row.e1?.flags.includes('payment_arrangement'), tone: 'warn' },
  ],
  lowConfidenceTransactions: [
    { name: 'Confidence <50%', nl: 'E1-zekerheid onder 50%', rule: 'confidence < 0,50', test: row => !!row.e1 && row.e1.confidence < 0.5, tone: 'warn' },
    { name: '50% <= Confidence <60%', nl: 'E1-zekerheid 50–60%', rule: '0,50 ≤ confidence < 0,60', test: row => !!row.e1 && row.e1.confidence >= 0.5 && row.e1.confidence < 0.6, tone: 'warn' },
  ],
  otherHighlightedTransactions: [
    { name: 'Round number', nl: 'Ronde bedragen', rule: '|bedrag| ≥ 10.000 en veelvoud van 10.000', test: row => Math.abs(row.amount) >= 10000 && Math.abs(row.amount) % 10000 === 0, tone: 'warn' },
  ],
};
const PROFILE_OF = { zakelijk: 'corporate', prive: 'retail' };
function bucketsFor(view) {
  const client = view === 'zakelijk' ? CLIENT_CORPORATE : view === 'prive' ? CLIENT_RETAIL : [...CLIENT_CORPORATE, ...CLIENT_RETAIL.filter(entry => !CLIENT_CORPORATE.some(other => other.name === entry.name))];
  return { clientProfile: client, ...BUCKETS_COMMON };
}
const profileEntry = (name, rows) => ({ name, transactionCount: rows.length, totalInflow: round2(inflow(rows)), totalOutflow: round2(outflow(rows)), transactionIds: rows.map(row => row.id) });
function computeE1Analysis(rows, view, accounts) {
  const buckets = bucketsFor(view);
  const output = { generalInfo: { accounts: accounts.map(account => ({ iban: account.iban, accountName: account.name })), totalInflow: round2(inflow(rows)), totalOutflow: round2(outflow(rows)), transactionCount: rows.length } };
  Object.entries(buckets).forEach(([section, entries]) => { output[section] = entries.map(entry => profileEntry(entry.name, rows.filter(entry.test))); });
  return output;
}
const receivedAnalysis = () => {
  if (overlay === 'samen' || !DOSSIER.analyses) return null;
  const analysis = DOSSIER.analyses[PROFILE_OF[overlay]];
  if (!analysis) return null;
  return (analysis.generalInfo?.accounts ?? []).some(item => accountOf(normalizeIban(item.iban))?.enabled === false) ? null : analysis;
};
const hasE1 = () => DOSSIER.transactions.some(row => row.e1);
const hasSource = () => DOSSIER.transactions.some(row => row.source);
