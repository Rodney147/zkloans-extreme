'use strict';
/* Rekenregels en ijkpunten van het basismodel. Draaien: node --test tests/ */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createCore, run, loadFixture, analyseView } = require('./harness');

const expected = name => JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', name, 'expected.json'), 'utf8'));
const total = values => values.reduce((sum, value) => sum + value, 0);
const near = (actual, wanted, tolerance = 0.01, label = '') => assert.ok(Math.abs(actual - wanted) <= tolerance, `${label}: ${actual} ≠ ${wanted}`);
async function model(folder) {
  const core = createCore();
  await loadFixture(core, folder);
  run(core, "overlay = 'zakelijk'; A = analyse(); globalThis.Az = A; globalThis.Ap = DOSSIER.accounts.some(account => account.role === 'prive') ? analyseFor('prive') : null; globalThis.RISKS = risks(Az, Ap, '2026-11-04');");
  return { core, Az: run(core, 'Az'), Ap: run(core, 'Ap'), risks: run(core, 'RISKS'), dossier: run(core, 'DOSSIER') };
}
/* elke set: netto cashflow + niet in de cashflow = netto mutatie op de rekeningen */
const reconciles = A => near(total(A.net) + total(A.apart.map(item => total(item.values))), total(A.mutation), 0.01, 'controle-som cashflow');

/* ---------- Losse regels ---------- */
test('controlecijfer betalingskenmerk (voorbeelden Belastingdienst-formule)', () => {
  const core = createCore();
  ['3812345677060001', '3812345671600230', '9812345676400120', '2812345608000000'].forEach(reference => assert.equal(run(core, `isValidPaymentReference('${reference}')`), true, reference));
  assert.equal(run(core, "isValidPaymentReference('3812345677060002')"), false);
});
test('geen normen of oordeelsgrenzen in de configuratie', () => {
  const core = createCore();
  assert.equal(run(core, "typeof NORMEN"), 'undefined');
  assert.equal(run(core, 'JSON.stringify(DATAREGELS)'), JSON.stringify({ minimaleMaanden: 3, gewensteMaanden: 12, maximaleOuderdomDagen: 14 }));
});
test('categorieregels: spaar, contant, zonder tegenpartij', () => {
  const core = createCore();
  run(core, "DOSSIER = { accounts: [{ iban: 'NL01TEST0000000001', owner: 'onderneming', role: 'zakelijk', name: 'Test B.V.' }], members: [], company: { name: 'Test B.V.' } }; overlay = 'zakelijk';");
  const rule = (amount, name, description, extra = '') => run(core, `categorize({ account: 'NL01TEST0000000001', amount: ${amount}, name: ${JSON.stringify(name)}, description: ${JSON.stringify(description)}, counterAccount: null ${extra} }).rule`);
  assert.equal(rule(-500, null, 'Naar sparen'), 1, 'sparen in omschrijving = intern');
  assert.equal(rule(1200, 'Bedrijfsrestaurant Spaarne B.V.', 'Factuur 12'), 10, 'Spaarne is geen spaarrekening');
  assert.equal(rule(-200, null, 'Geldautomaat Utrecht'), 9, 'contant opgenomen');
  assert.equal(rule(300, null, 'Storting contant'), 10, 'contante storting = debiteur');
  assert.equal(rule(450, null, 'onbekend'), 10, 'bijschrijving zonder tegenpartij = debiteur');
  assert.equal(rule(-4500, 'Holding X B.V.', 'Managementfee mei'), 5, 'managementfee = groep op omschrijving');
  assert.equal(rule(20000, 'Holding X B.V.', 'Lening holding'), 6, 'lening ontvangen = financiering');
});

/* ---------- Hocus Pocus B.V. (Enable Now, 2.132 transacties) ---------- */
test('Hocus Pocus: ijkpunten', async () => {
  const want = expected('hocus-pocus');
  const { Az, Ap, risks, dossier } = await model('hocus-pocus');
  assert.equal(dossier.legalForm, want.legalForm);
  assert.equal(dossier.transactions.length, want.transactions);
  const balance = role => total(dossier.accounts.filter(account => account.role === role).map(account => account.balance));
  near(balance('zakelijk'), want.endBalances.zakelijk, 0.01, 'eindsaldo zakelijk');
  near(balance('prive'), want.endBalances.prive, 0.01, 'eindsaldo privé');
  /* bv ↔ DGA is verbonden partij, niet intern en niet in de cashflow; loon DGA apart */
  near(-total(Az.dgaSalaryRows.map(row => row.amount)), want.dgaSalary, 0.01, 'loon DGA');
  near(-total(Az.drawRows.map(row => row.amount)), want.rcOut, 0.01, 'rekening-courant uit');
  near(total(Az.depositRows.map(row => row.amount)), want.rcIn, 0.01, 'rekening-courant in');
  assert.equal(Az.rows.filter(row => row.rule === 1 && /Salaris DGA|rekening-courant/i.test(row.description)).length, 0, 'geen DGA-stromen als intern');
  /* omzet: lening holding, privé en teruggaaf eruit; zonder tegenpartij erin */
  near(Az.revenue12, want.revenue12, 0.01, 'omzet');
  assert.equal(Az.rows.filter(row => row.rule === 10 && /Klokkie Holding/.test(row.name ?? '')).length, 0, 'lening holding is geen omzet');
  near(total(Az.byRule(6).filter(row => row.amount > 0).map(row => row.amount)), want.holdingLoanIn, 0.01, 'lening holding = financiering ontvangen');
  assert.equal(Az.rows.filter(row => row.rule === 10 && row.amount === 2140).length, 0, 'btw-teruggaaf is geen omzet');
  /* managementfee = kosten in de cashflow; aflossing holding in de financieringslasten */
  near(-total(Az.expenses.find(item => item.key === 'groep').values), want.managementFee, 0.01, 'managementfee');
  assert.ok(Az.financing.rows.some(row => /Aflossing lening holding/i.test(row.description)), 'aflossing holding in financieringslasten');
  /* gemeente: klant op zakelijk, belasting privé */
  near(total(Az.rows.filter(row => /Gemeente Eindhoven/.test(row.name ?? '') && row.rule === 10).map(row => row.amount)), want.gemeenteKlant, 0.01, 'gemeente klant');
  near(-total(Ap.rows.filter(row => /Gemeente Eindhoven/.test(row.name ?? '') && row.rule === 3).map(row => row.amount)), want.gemeenteBelastingPrive, 0.01, 'gemeente belasting privé');
  /* Belastingdienst: beide IBAN's en geldige kenmerken */
  const taxRows = [...Az.taxRows, ...Ap.taxRows].filter(row => /Belastingdienst/.test(row.name ?? ''));
  assert.equal(taxRows.filter(row => row.counterAccount === 'NL86INGB0002445588').length, want.taxAuthorityOldIban);
  assert.equal(taxRows.filter(row => row.counterAccount === 'NL04RABO0200112244').length, want.taxAuthorityNewIban);
  assert.ok(taxRows.filter(row => row.tax.reference).every(row => row.tax.valid), 'alle kenmerken geldig');
  near(Az.taxOf('ob').refunds, want.vatRefund, 0.01, 'btw-teruggaaf');
  near(total(Az.byRule(2).map(row => row.amount)), want.leaseReversals, 0.01, 'terugboekingen');
  near(-total(Az.byRule(4).map(row => row.amount)), want.debtCollection, 0.01, 'incasso');
  want.lenders.forEach(name => assert.ok(Az.obligations.some(item => item.name === name && item.group === 'Leningen en leases'), `vaste last ${name}`));
  assert.equal(new Set(Az.byRule(8).filter(row => row.amount < 0).map(row => row.key)).size, want.employeesWithSalary);
  const gambling = Ap.rows.filter(row => row.signal === 'gokken'), crypto = Ap.rows.filter(row => row.signal === 'crypto');
  assert.equal(gambling.length, want.gambling.count); near(-total(gambling.map(row => row.amount)), want.gambling.total);
  assert.equal(crypto.length, want.crypto.count); near(-total(crypto.map(row => row.amount)), want.crypto.total);
  assert.ok(Az.rows.filter(row => Math.abs(row.amount) === 10000 && /buffer/i.test(row.description)).every(row => row.rule === 1), 'buffer intern');
  /* cashflow: omzet − kosten = operationeel; − financieringslasten = netto */
  near(Az.operating12, Az.revenue12 - Az.costs12, 0.01, 'operationele cashflow');
  near(Az.net12, Az.operating12 - Az.financing12, 0.01, 'netto cashflow');
  reconciles(Az);
  const incidental = risks.find(item => item.id === 'incidenteel');
  assert.ok(incidental.rows.some(row => row.name === want.investment.name && row.amount === want.investment.amount), 'lichtinstallatie als mogelijke investering');
  want.expectRisks.forEach(id => assert.ok(risks.some(item => item.id === id), `lampje ${id}`));
  want.noRisks.forEach(id => assert.ok(!risks.some(item => item.id === id), `geen lampje ${id}`));
  assert.ok(risks.every(item => item.titel && item.wat && ['bad', 'warn', 'info'].includes(item.ernst)), 'elk lampje is volledig');
});
test('Hocus Pocus: omzet per rekening sluit aan op het geheel', async () => {
  const { core, Az } = await model('hocus-pocus');
  const accounts = run(core, "DOSSIER.accounts.filter(account => account.role === 'zakelijk').map(account => account.iban)");
  near(total(accounts.map(iban => total(Az.rows.filter(row => row.account === iban && row.rule === 10).map(row => row.amount)))), Az.revenue12, 0.01, 'omzet per rekening');
  near(total(Az.byRule(1).map(row => row.amount)), 0, 0.01, 'interne boekingen tussen gedeelde zakelijke rekeningen sluiten');
});
test('Hocus Pocus: aanpassing per tegenpartij werkt overal door', async () => {
  const { core } = await model('hocus-pocus');
  const before = run(core, "overlay = 'zakelijk'; A = analyse(); ({ revenue: A.revenue12, net: A.net12, key: A.debtors[0].key, amount: A.debtors[0].total })");
  core.__key = before.key;
  const after = run(core, "decisions[decisionKey('cat', __key)] = 'prive'; A = analyse(); ({ revenue: A.revenue12, net: A.net12, rules: [...new Set(A.rows.filter(row => row.key === __key).map(row => row.rule))], deposits: A.depositRows.filter(row => row.key === __key).length })");
  near(after.revenue, before.revenue - before.amount, 0.01, 'omzet daalt met die tegenpartij');
  assert.ok(after.net < before.net, 'netto cashflow daalt mee');
  assert.equal(JSON.stringify(after.rules), '[5]', 'alle transacties van de tegenpartij verplaatst');
  assert.ok(after.deposits > 0, 'telt als privéstorting, niet in de cashflow');
});
test('Hocus Pocus: Samen bij een bv is een huishoudoverzicht', async () => {
  const { core } = await model('hocus-pocus');
  assert.equal(analyseView(core, 'samen').householdOnly, true);
  assert.equal(analyseView(core, 'zakelijk').householdOnly, false);
});

/* ---------- Eenmanszaak met gemengde rekening ---------- */
test('Eenmanszaak gemengd: privé uit omzet en kosten', async () => {
  const want = expected('ez-gemengd');
  const { Az, risks, dossier } = await model('ez-gemengd');
  assert.equal(dossier.legalForm, want.legalForm);
  Object.entries(want.accountRole).forEach(([iban, role]) => assert.equal(dossier.accounts.find(account => account.iban === iban).role, role, 'rol voorgesteld'));
  near(Az.revenue12, want.revenue12, 0.01, 'omzet = alleen facturen');
  near(total(Az.depositRows.filter(row => row.role === 'Privé-inkomen').map(row => row.amount)), want.privateIncome12, 0.01, 'kinderbijslag en toeslag privé');
  near(-total(Az.drawRows.filter(row => row.role === 'Privé-uitgave').map(row => row.amount)), want.privateSpend12, 0.01, 'hypotheek en boodschappen privé');
  assert.ok(!Az.byRule(6).some(row => /Hypotheek/.test(row.name ?? '')), 'privéhypotheek geen zakelijke financiering');
  assert.equal(Az.taxOf('ob').count, want.vatPayments);
  assert.equal(Az.taxRows.filter(row => row.tax.reference && row.tax.valid === false).length, want.invalidReferences);
  assert.equal(Az.byRule(4).length, want.bailiffPayments);
  assert.equal(Az.obligations.find(item => item.name === want.lease.name).missed, want.lease.missed, 'gemiste leasetermijn');
  reconciles(Az);
  want.expectRisks.forEach(id => assert.ok(risks.some(item => item.id === id), `lampje ${id}`));
  assert.ok(risks.some(item => item.id === `gemist-${Az.obligations.find(entry => entry.name === want.lease.name).key}`), 'lampje gemiste termijn');
});

/* ---------- Vof met twee vennoten ---------- */
test('Vof: opnamen en stortingen apart, geen omzet of kosten', async () => {
  const want = expected('vof');
  const { Az, dossier } = await model('vof');
  assert.equal(dossier.legalForm, want.legalForm);
  near(Az.revenue12, want.revenue12, 0.01, 'omzet');
  near(-total(Az.drawRows.map(row => row.amount)), total(Object.values(want.draws)), 0.01, 'opnamen vennoten');
  near(total(Az.depositRows.map(row => row.amount)), total(Object.values(want.deposits)), 0.01, 'stortingen vennoten');
  assert.ok(!Az.rows.some(row => [10, 11].includes(row.rule) && /de Vries/.test(row.name ?? '')), 'betalingen met vennoten zijn geen omzet of kosten');
  reconciles(Az);
});

/* ---------- Twee eenmanszaken in één huishouden ---------- */
test('Pizza & Patat: omzet per zaak en lampjes', async () => {
  const want = expected('pizza-patat');
  const { core, Az, risks, dossier } = await model('pizza-patat');
  assert.equal(dossier.transactions.length, want.transactions);
  Object.entries(want.endBalances).forEach(([iban, balance]) => near(dossier.accounts.find(account => account.iban === iban.replace(/\s/g, '')).balance, balance, 0.01, `eindsaldo ${iban}`));
  near(Az.revenue12, want.revenue12['Project Pizza'] + want.revenue12['Project Patat'], 0.01, 'omzet beide zaken');
  near(-total(Az.drawRows.map(row => row.amount)), total(Object.values(want.ownerDraws12)), 0.01, 'opnamen beide eigenaars');
  want.expectRisks.forEach(id => assert.ok(risks.some(item => item.id === id), `lampje ${id}`));
  reconciles(Az);
  const perBusiness = iban => { core.__iban = iban; return run(core, "DOSSIER.accounts.forEach(account => { if (account.role !== 'prive') account.enabled = account.iban === __iban; }); (() => { const result = analyse(); DOSSIER.accounts.forEach(account => { account.enabled = true; }); return result.revenue12; })()"); };
  near(perBusiness('NL27RABO••••••41'), want.revenue12['Project Pizza'], 0.01, 'omzet Pizza');
  near(perBusiness('NL63INGB••••••72'), want.revenue12['Project Patat'], 0.01, 'omzet Patat');
});

/* ---------- Regressie: de drie sets uit ZK Loans ---------- */
const baseline = JSON.parse(fs.readFileSync(path.join(__dirname, 'regression-baseline.json'), 'utf8'));
for (const folder of Object.keys(baseline)) {
  test(`Regressie ${folder}`, async () => {
    const { Az } = await model(folder);
    const want = baseline[folder];
    near(Az.revenue12, want.revenue12, 0.01, 'omzet');
    near(Az.costs12, want.costs12, 0.01, 'kosten');
    near(Az.financing12, want.financing12, 0.01, 'financieringslasten');
    near(Az.net12, want.net12, 0.01, 'netto cashflow');
    assert.equal(Az.rows.length, want.rows);
    reconciles(Az);
  });
}
