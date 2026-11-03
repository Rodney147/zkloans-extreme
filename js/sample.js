'use strict';
/* ---------- Voorbeelddossier Mister X (fictief, gegenereerd) ----------
   Eenmanszaak met een zakelijke rekening (Rabobank) en een privérekening (ING), allebei gedeeld op 02-11-2026.
   Elke transactie heeft de velden die Loanwise ontvangt plus het E1-object dat Enable Now teruggeeft. */
function buildSampleDossier() {
  let seed = 20261102;
  const random = () => { seed = seed + 0x6D2B79F5 | 0; let value = Math.imul(seed ^ seed >>> 15, 1 | seed); value = value + Math.imul(value ^ value >>> 7, 61 | value) ^ value; return ((value ^ value >>> 14) >>> 0) / 4294967296; };
  const between = (low, high) => low + (high - low) * random();
  const pick = list => list[Math.floor(random() * list.length)];
  const months = Array.from({ length: 12 }, (_, index) => { const date = new Date(Date.UTC(2025, 10 + index, 1)); return date.toISOString().slice(0, 7); });
  const BUSINESS = 'NL52RABO0312845517', PRIVATE = 'NL73INGB0006618254', SAVINGS = 'NL18RABO0312845908';
  const ibanFor = name => { const hash = [...name].reduce((total, character) => (total * 31 + character.charCodeAt(0)) % 999983, 11); return `NL${String(hash % 89 + 10)}${['INGB', 'RABO', 'ABNA', 'KNAB', 'BUNQ', 'TRIO'][hash % 6]}0${String(hash * 7919 % 1e9).padStart(9, '0')}`; };
  const rows = [];
  let sequence = 0;
  function add(month, day, account, amount, name, description, type, e1Category, confidence, flags = [], counterAccount) {
    const [year, monthNumber] = months[month].split('-').map(Number);
    const date = `${months[month]}-${String(Math.min(day, new Date(year, monthNumber, 0).getDate())).padStart(2, '0')}`;
    sequence += 1;
    rows.push({
      id: `mx-${String(sequence).padStart(4, '0')}`, account, date, amount: round2(amount), name, description, type,
      counterAccount: counterAccount === undefined ? (name ? ibanFor(name) : null) : counterAccount,
      balanceAfter: null,
      e1: { category: e1Category, confidence: round2(Math.min(0.99, confidence)), flags, profile: account === PRIVATE ? 'retail' : 'corporate' },
    });
  }
  const year = month => months[month].slice(0, 4);
  const factor = [0.9, 0.75, 0.7, 0.85, 1.0, 1.05, 1.1, 1.05, 0.95, 1.0, 1.1, 1.0];
  const CUSTOMERS = [
    ['Keukenhuis Twente B.V.', 2100, 3, 'Factuur'], ['Bouwbedrijf Ter Horst B.V.', 3200, 3, 'Factuur'], ['Woonwinkel Lindeboom B.V.', 1500, 2, 'Factuur'],
    ['Kozijnen Oost V.O.F.', 1800, 2, 'Termijn'], ['P. de Graaf', 950, 1, 'Montage keuken'], ['H. Smeenk eo L. Smeenk', 1250, 1, 'Aanbetaling'],
    ['Installatiebedrijf Wolters B.V.', 2600, 1, 'Factuur'], ['T. Brink', 700, 1, 'Factuur'],
  ];
  const customerPool = CUSTOMERS.flatMap(customer => Array(customer[2]).fill(customer));
  const SUPPLIERS = [['Bouwmaat Hengelo B.V.', 650], ['Technische Unie B.V.', 480], ['Würth Nederland B.V.', 210], ['Gamma Zakelijk', 180], ['Hornbach Bouwmarkt', 240]];
  const GROCERIES = ['Albert Heijn 1432', 'Jumbo Enschede', 'Lidl Enschede'];
  const RESTAURANTS = ['Café De Pijp', 'Pizzeria Napoli', 'Thuisbezorgd.nl'];
  const ob = (quarter, yearDigit) => withCheckDigit(`48120335${'1'}${yearDigit}00${String(quarter * 3 + 18).padStart(2, '0')}0`);
  const ib = (yearDigit, kind) => withCheckDigit(`48120335${'70'}${yearDigit}${kind}001`);
  const zvw = yearDigit => withCheckDigit(`48120335${'75'}${yearDigit}0004`);
  const taxIban = month => `${months[month]}-01` >= TAX_IBAN_SWITCH ? TAX_AUTHORITY_IBANS[1] : TAX_AUTHORITY_IBANS[0];

  months.forEach((key, month) => {
    const label = shortMonth(key);
    for (let index = 0; index < 5 + Math.floor(random() * 3); index += 1) {
      const [name, base, , kind] = pick(customerPool);
      const description = ['Factuur', 'Termijn'].includes(kind) ? `${kind} ${year(month)}-${String(40 + month * 9 + index).padStart(3, '0')}` : kind;
      add(month, 2 + Math.floor(random() * 26), BUSINESS, base * factor[month] * between(0.7, 1.3), name, description, 'transfer', 'income.other', /B\.V\.|V\.O\.F\./.test(name) ? between(0.88, 0.97) : between(0.74, 0.86));
    }
    for (let index = 0; index < 4 + Math.floor(random() * 2); index += 1) {
      const [name, base] = pick(SUPPLIERS);
      add(month, 3 + Math.floor(random() * 25), BUSINESS, -base * factor[month] * between(0.6, 1.4), name, `Factuur ${8800 + month * 11 + index}`, /Gamma|Hornbach/.test(name) ? 'payment_terminal' : 'transfer', 'expense.other', between(0.8, 0.93));
    }
    add(month, 1, BUSINESS, -18.75, 'Rabobank', `Kosten Rabo BedrijfsPakket ${label}`, 'banking_costs', 'expense.operations.bank_fees', 0.99, [], null);
    if (month !== 4) add(month, 3, BUSINESS, -548.3, 'Bedrijfswagen Lease B.V.', `Leasetermijn Ford Transit ${label} contract 2207`, 'direct_debit', 'loan.vehicle_lease', 0.96);
    add(month, 5, BUSINESS, -86.4, 'Zakelijk Verzekerd B.V.', 'Premie AVB polis 61-20931', 'direct_debit', 'insurance.liability', 0.91);
    add(month, 8, BUSINESS, -62.5, 'KPN Zakelijk', 'Zakelijk abonnement', 'direct_debit', 'expense.operations.telecom', 0.95);
    add(month, 12, BUSINESS, -19.95, 'Moneybird B.V.', 'Abonnement boekhouding', 'direct_debit', 'expense.it', 0.9);
    add(month, 28, BUSINESS, -410, 'Rabobank', 'Aflossing en rente lening 30.88.112', 'direct_debit', 'loan.bank', 0.95, [], null);
    for (let index = 0; index < 1 + Math.floor(random() * 2); index += 1) add(month, 4 + Math.floor(random() * 24), BUSINESS, -between(70, 110), 'Shell Hengelo', 'Betaalautomaat', 'payment_terminal', 'expense.transport.fuel', 0.93);
    add(month, 25, BUSINESS, -5000, 'M. X', `Prive ${label}`, 'internal_transfer', 'internal.other', 1, [], PRIVATE);
    add(month, 25, PRIVATE, 5000, 'Mister X Montage', `Prive ${label}`, 'internal_transfer', 'internal.other', 1, [], BUSINESS);
    if ([1, 4, 7, 10].includes(month)) add(month, 15, BUSINESS, -450, 'Administratiekantoor Mulder', 'Factuur administratie kwartaal', 'transfer', 'expense.accounting', 0.89);
    if (month >= 3 && month <= 11 && month !== 10) add(month, 2, BUSINESS, -500, 'J. X', 'Aflossing lening', 'transfer', 'other.private_transfer', 0.58);
    if (month >= 5) add(month, 24, BUSINESS, -350, 'Belastingdienst', 'Betalingsregeling 1084 1123 0457', 'transfer', 'tax.other', 0.78, ['payment_arrangement'], taxIban(month));

    /* privé */
    add(month, 1, PRIVATE, -1385, 'Obvion N.V.', 'Hypotheek leningdeel 1 en 2', 'direct_debit', 'housing.mortgage', 0.97);
    add(month, 2, PRIVATE, -3.95, 'ING', 'Kosten OranjePakket', 'banking_costs', 'expense.essential.financial', 0.99, [], null);
    add(month, 4, PRIVATE, -165, 'Vattenfall', 'Termijnbedrag energie', 'direct_debit', 'expense.essential.utilities.energy', 0.96);
    add(month, 6, PRIVATE, -312.6, 'Menzis', 'Premie zorgverzekering gezin', 'direct_debit', 'insurance.health', 0.97);
    add(month, 7, PRIVATE, -45, 'Odido', 'Abonnement', 'direct_debit', 'expense.essential.telecom', 0.95);
    add(month, 9, PRIVATE, -13.99, 'Netflix', 'Abonnement', 'direct_debit', 'expense.lifestyle.streaming', 0.98);
    add(month, 10, PRIVATE, -29.99, 'Basic-Fit', 'Lidmaatschap', 'direct_debit', 'expense.lifestyle.sports', 0.96);
    add(month, 14, PRIVATE, -640, 'Kinderopvang Humankind', `Opvang ${label}`, 'direct_debit', 'expense.essential.childcare', 0.94);
    add(month, 16, PRIVATE, -74.1, 'Centraal Beheer', 'Premie autoverzekering', 'direct_debit', 'insurance.vehicle', 0.95);
    for (let index = 0; index < 12; index += 1) add(month, 1 + Math.floor(random() * 28), PRIVATE, -between(18, 140), pick(GROCERIES), 'Betaalautomaat', 'payment_terminal', 'expense.essential.groceries', 0.96);
    for (let index = 0; index < 3; index += 1) add(month, 1 + Math.floor(random() * 28), PRIVATE, -between(22, 95), pick(RESTAURANTS), 'Betaalautomaat', 'payment_terminal', 'expense.lifestyle.restaurants_bars', 0.9);
    for (let index = 0; index < 2; index += 1) add(month, 1 + Math.floor(random() * 28), PRIVATE, -between(55, 90), 'Tango Enschede', 'Betaalautomaat', 'payment_terminal', 'expense.transport.fuel', 0.93);
    add(month, 1 + Math.floor(random() * 28), PRIVATE, -between(35, 160), pick(['Zalando', 'H&M', 'Bol.com']), 'iDEAL betaling', 'ideal', 'expense.essential.clothing', 0.82);
    if (month >= 3) {
      add(month, 21, PRIVATE, -640, 'Belastingdienst', `Voorlopige aanslag IB 2026 ${ib(6, 0)}`, 'transfer', 'tax.income', 0.95, [], taxIban(month));
      add(month, 21, PRIVATE, -180, 'Belastingdienst', `Voorlopige aanslag Zvw 2026 ${zvw(6)}`, 'transfer', 'tax.social', 0.93, [], taxIban(month));
    }
    if (month >= 4) add(month, 27, PRIVATE, -96.4, 'Gemeente Enschede', 'Aanslag gemeentelijke belastingen 2026 termijn', 'direct_debit', 'expense.essential.municipal', 0.92);
    if ([0, 3, 6, 9].includes(month)) add(month, 20, PRIVATE, -58.2, 'Vitens', 'Waterrekening kwartaal', 'direct_debit', 'expense.essential.utilities.energy', 0.9);
    if ([1, 4, 7, 10].includes(month)) add(month, 3, PRIVATE, 291.62, 'SVB', 'Kinderbijslag kwartaal', 'transfer', 'subsidy.family', 0.97);
  });
  /* zakelijk: losse gebeurtenissen */
  add(8, 18, BUSINESS, 14500, 'Projectbureau Veldkamp B.V.', 'Factuur 2026-118 renovatie appartementen', 'transfer', 'income.other', 0.66);
  add(5, 17, BUSINESS, 2350, null, 'Overboeking', 'transfer', 'income.other', 0.44, [], null);
  add(2, 12, BUSINESS, 10000, 'J. X', 'Lening', 'transfer', 'income.other', 0.62);
  add(5, 9, BUSINESS, 850, 'R. X', 'Montage badkamer', 'transfer', 'income.other', 0.71);
  add(7, 14, BUSINESS, 126.4, 'Technische Unie B.V.', 'Retour bestelling 77120', 'transfer', 'expense.other', 0.84, ['refund']);
  add(6, 11, BUSINESS, -2900, 'Kozijnen Oost V.O.F.', 'Factuur onderaanneming 2026-31', 'transfer', 'expense.other', 0.8);
  add(9, 11, BUSINESS, -1950, 'Kozijnen Oost V.O.F.', 'Factuur onderaanneming 2026-44', 'transfer', 'expense.other', 0.8);
  [[0, 'NOV'], [3, 'FEB'], [6, 'MEI']].forEach(([month]) => add(month, 27, BUSINESS, -1500, 'Mister X Montage', 'Naar spaarrekening', 'savings', 'investment.savings', 0.97, [], SAVINGS));
  add(1, 22, BUSINESS, -6000, 'M. X', 'Prive extra december', 'internal_transfer', 'internal.other', 1, [], PRIVATE);
  add(1, 22, PRIVATE, 6000, 'Mister X Montage', 'Prive extra december', 'internal_transfer', 'internal.other', 1, [], BUSINESS);
  add(8, 20, BUSINESS, -5100, 'M. X', 'Prive vakantie', 'internal_transfer', 'internal.other', 1, [], PRIVATE);
  add(8, 20, PRIVATE, 5100, 'Mister X Montage', 'Prive vakantie', 'internal_transfer', 'internal.other', 1, [], BUSINESS);
  add(2, 29, BUSINESS, -4200, 'Belastingdienst', `Omzetbelasting Q4 2025 ${ob(4, 5)}`, 'transfer', 'tax.vat', 0.97, [], taxIban(2));
  add(5, 29, BUSINESS, -4650, 'Belastingdienst', `Omzetbelasting Q1 2026 ${ob(1, 6)}`, 'transfer', 'tax.vat', 0.97, [], taxIban(5));
  add(8, 30, BUSINESS, -5100, 'Belastingdienst', `Omzetbelasting Q2 2026 ${ob(2, 6)}`, 'transfer', 'tax.vat', 0.97, [], taxIban(8));
  add(11, 29, BUSINESS, -4400, 'Belastingdienst', `Omzetbelasting Q3 2026 ${ob(3, 6)}`, 'transfer', 'tax.vat', 0.97, [], taxIban(11));
  add(4, 5, BUSINESS, 548.3, 'Bedrijfswagen Lease B.V.', 'Terugboeking incasso: onvoldoende saldo', 'reversal', 'loan.vehicle_lease', 0.93, ['reversal_payment']);
  add(4, 3, BUSINESS, -548.3, 'Bedrijfswagen Lease B.V.', 'Leasetermijn Ford Transit mrt contract 2207', 'direct_debit', 'loan.vehicle_lease', 0.96);
  add(4, 19, BUSINESS, -548.3, 'Bedrijfswagen Lease B.V.', 'Leasetermijn Ford Transit mrt contract 2207 (herhaald)', 'direct_debit', 'loan.vehicle_lease', 0.95);
  add(10, 6, BUSINESS, 548.3, 'Bedrijfswagen Lease B.V.', 'Terugboeking incasso: onvoldoende saldo', 'reversal', 'loan.vehicle_lease', 0.93, ['reversal_payment']);
  add(3, 14, BUSINESS, -200, 'Geldautomaat Hengelo', 'Geldopname', 'cash_terminal', 'cash.other', 0.98, [], null);
  add(9, 9, BUSINESS, -200, 'Geldautomaat Hengelo', 'Geldopname', 'cash_terminal', 'cash.other', 0.98, [], null);
  /* privé: losse gebeurtenissen */
  add(4, 24, PRIVATE, -1240, 'Belastingdienst', `Definitieve aanslag IB 2024 ${ib(4, 6)}`, 'transfer', 'tax.income', 0.95, [], taxIban(4));
  add(7, 12, PRIVATE, 212, 'Belastingdienst', `Teruggaaf ${zvw(4)} Zvw 2024`, 'transfer', 'tax.social', 0.9, ['refund'], taxIban(7));
  [[2, 60], [5, 75], [7, 120], [8, 150], [9, 180], [9, 250], [10, 200], [11, 260]].forEach(([month, amount], index) => add(month, 5 + index * 3, PRIVATE, -amount, 'Holland Casino Online', 'iDEAL storting', 'ideal', 'gambling.other', 0.97));
  [[3, 25], [6, 25], [9, 40], [11, 40]].forEach(([month, amount]) => add(month, 13, PRIVATE, -amount, 'TOTO', 'iDEAL storting', 'ideal', 'gambling.lottery', 0.95));
  [9, 10, 11].forEach(month => add(month, 18, PRIVATE, -186, 'Gerechtsdeurwaarders Van Dam', 'Dossier 26-4471 termijn', 'transfer', 'loan.debt_collection', 0.94));
  [[4, 250], [8, 250]].forEach(([month, amount]) => add(month, 8, PRIVATE, -amount, 'Bitvavo', 'Aankoop crypto', 'ideal', 'investment.crypto', 0.96));
  [[1, 50], [3, 100], [6, 50], [8, 100], [10, 50], [11, 50]].forEach(([month, amount]) => add(month, 11, PRIVATE, -amount, 'Geldautomaat Enschede', 'Geldopname', 'cash_terminal', 'cash.other', 0.98, [], null));

  rows.sort((first, second) => first.date.localeCompare(second.date) || first.id.localeCompare(second.id));
  const accounts = [
    { iban: BUSINESS, name: 'Mister X Montage', bank: 'Rabobank', role: 'zakelijk', kind: 'Betaalrekening', sharedOn: '2026-11-02', startBalance: 7350, enabled: true },
    { iban: PRIVATE, name: 'M. X', bank: 'ING', role: 'prive', kind: 'Betaalrekening', sharedOn: '2026-11-02', startBalance: 1850, enabled: true },
  ];
  accounts.forEach(account => {
    let balance = account.startBalance;
    rows.filter(row => row.account === account.iban).forEach(row => { balance = round2(balance + row.amount); row.balanceAfter = balance; });
    account.balance = balance;
  });
  return {
    source: 'voorbeeld', label: 'Mister X (voorbeeld)', files: 0,
    legalForm: 'eenmanszaak',
    members: [{ initials: 'M.', last_name_prefix: '', last_name: 'X' }],
    company: { kvkNumber: '81234567', name: 'Mister X Montage', address: 'Twekkelerweg 88, Enschede', industryCode: '43320', industryDescription: 'Bouwkundige installatie (montage keukens en kozijnen)', legalForm: 'Eenmanszaak', numberOfEmployees: 1, startDate: '2019-04-01' },
    accounts, transactions: rows, analyses: null, knownSuppliers: ['Technische Unie B.V.', 'Bouwmaat Hengelo B.V.'],
  };
}
