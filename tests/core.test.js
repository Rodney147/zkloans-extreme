'use strict';
/* Rekenregels en ijkpunten. Draaien: node --test tests/ */
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
  run(core, "overlay = 'zakelijk'; A = analyse(); globalThis.Az = A; globalThis.Ap = DOSSIER.accounts.some(account => account.role === 'prive') ? analyseFor('prive') : null; globalThis.RISKS = risks(Az, Ap);");
  return { core, Az: run(core, 'Az'), Ap: run(core, 'Ap'), risks: run(core, 'RISKS'), dossier: run(core, 'DOSSIER') };
}

/* ---------- Losse regels ---------- */
test('controlecijfer betalingskenmerk (voorbeelden Belastingdienst-formule)', () => {
  const core = createCore();
  ['3812345677060001', '3812345671600230', '9812345676400120', '2812345608000000'].forEach(reference => assert.equal(run(core, `isValidPaymentReference('${reference}')`), true, reference));
  assert.equal(run(core, "isValidPaymentReference('3812345677060002')"), false);
});
test('rechtsvorm normaliseren', () => {
  const core = createCore();
  [['Besloten Vennootschap', 'bv'], ['Eenmanszaak', 'eenmanszaak'], ['Vennootschap onder firma', 'vof'], ['V.O.F.', 'vof'], ['B.V.', 'bv']].forEach(([input, output]) => assert.equal(run(core, `normalizeLegalForm(${JSON.stringify(input)})`), output, input));
});
test('geen vaste acceptatienorm in de code: DSCR zonder norm geeft geen oordeel', () => {
  const core = createCore();
  assert.equal(run(core, 'dscrVerdict(0.5)'), 'info');
  assert.equal(run(core, 'dscrVerdict(1.3, 1.25)'), 'good');
  assert.equal(run(core, 'dscrVerdict(1.1, 1.25)'), 'bad');
  assert.equal(run(core, 'Object.values(NORMEN).filter(value => value !== null && !Array.isArray(value)).length'), 0, 'alle normen staan standaard op null');
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
  near(total(dossier.accounts.filter(account => account.role === 'zakelijk').map(account => account.startBalance)), want.startBalanceZakelijk, 0.01, 'startsaldo = E1');
  /* saldo-aansluiting per transactie */
  assert.equal(dossier.transactions.filter(row => Math.abs(row.balanceAfter - row.computedBalance) >= 0.01).length, 0);
  /* bv ↔ DGA is verbonden partij, niet intern; loon DGA en rekening-courant gescheiden */
  near(total(Az.dgaSalary), want.dgaSalary, 0.01, 'loon DGA');
  near(total(Az.ownerOut), want.rcOut, 0.01, 'rekening-courant uit');
  near(total(Az.ownerIn), want.rcIn, 0.01, 'rekening-courant in');
  near(total(Az.dgaSalary) + total(Az.ownerOut) - total(Az.ownerIn), want.e1InternalDifference, 0.01, 'verschil E1-intern');
  assert.equal(Az.rows.filter(row => row.rule === 1 && /Salaris DGA|rekening-courant/i.test(row.description)).length, 0, 'geen DGA-stromen als intern');
  /* omzet: lening holding, privé en teruggaaf eruit */
  near(Az.revenue12, want.revenue12, 0.01, 'omzet');
  assert.ok(Az.rows.filter(row => row.rule === 10 && /Klokkie Holding/.test(row.name ?? '')).length === 0, 'lening holding is geen omzet');
  assert.ok(Az.rows.filter(row => row.rule === 10 && row.amount === 2140).length === 0, 'btw-teruggaaf is geen omzet');
  /* managementfee = kosten in de kasstroom */
  near(total(Az.groupCosts), want.managementFee, 0.01, 'managementfee');
  near(Az.related.find(item => item.role === 'Groepsmaatschappij').in, want.holdingLoanIn, 0.01, 'lening holding');
  near(total(Az.informalDebtRows.map(row => -row.amount)), want.holdingRepayment, 0.01, 'aflossing holding in schuldendienst');
  /* gemeente: klant op zakelijk, belasting privé */
  near(total(Az.rows.filter(row => /Gemeente Eindhoven/.test(row.name ?? '') && row.rule === 10).map(row => row.amount)), want.gemeenteKlant, 0.01, 'gemeente klant');
  near(-total(Ap.rows.filter(row => /Gemeente Eindhoven/.test(row.name ?? '') && row.rule === 3).map(row => row.amount)), want.gemeenteBelastingPrive, 0.01, 'gemeente belasting privé');
  /* Belastingdienst: beide IBAN's en geldige kenmerken */
  const taxRows = [...Az.taxRows, ...Ap.taxRows].filter(row => /Belastingdienst/.test(row.name ?? ''));
  assert.equal(taxRows.filter(row => row.counterAccount === 'NL86INGB0002445588').length, want.taxAuthorityOldIban);
  assert.equal(taxRows.filter(row => row.counterAccount === 'NL04RABO0200112244').length, want.taxAuthorityNewIban);
  assert.ok(taxRows.filter(row => row.tax.reference).every(row => row.tax.valid), 'alle kenmerken geldig');
  near(Az.taxOf('ob').refunds, want.vatRefund, 0.01, 'btw-teruggaaf');
  /* terugboekingen en incasso buiten de omzet */
  near(total(Az.byRule(2).map(row => row.amount)), want.leaseReversals, 0.01, 'terugboekingen');
  near(-total(Az.byRule(4).map(row => row.amount)), want.debtCollection, 0.01, 'incasso');
  want.lenders.forEach(name => assert.ok(Az.obligations.some(item => item.name === name && item.group === 'Leningen en leases'), `verplichting ${name}`));
  assert.ok(!Az.obligations.some(item => /Adobe|Google/.test(item.name) && item.catchUp), 'abonnementen geen inhaalbetaling');
  assert.equal(new Set(Az.byRule(8).filter(row => row.amount < 0).map(row => row.key)).size, want.employeesWithSalary);
  const gambling = Ap.rows.filter(row => row.signal === 'gokken'), crypto = Ap.rows.filter(row => row.signal === 'crypto');
  assert.equal(gambling.length, want.gambling.count); near(-total(gambling.map(row => row.amount)), want.gambling.total);
  assert.equal(crypto.length, want.crypto.count); near(-total(crypto.map(row => row.amount)), want.crypto.total);
  /* buffer ING → Rabo en terug is intern */
  assert.ok(Az.rows.filter(row => Math.abs(row.amount) === 10000 && /buffer/i.test(row.description)).every(row => row.rule === 1), 'buffer intern');
  /* draagkracht en DSCR rekenen met dezelfde basis */
  near(total(Az.operating) - total(Az.freeCash), want.dgaSalary + (want.rcOut - want.rcIn), 0.05, 'aftrek bv = loon DGA + netto rekening-courant');
  assert.ok(Az.dscr < Az.dscrBefore, 'DSCR na aftrek lager dan operationeel');
  want.expectRisks.forEach(id => assert.ok(risks.some(item => item.id === id), `melding ${id}`));
  want.noRisks.forEach(id => assert.ok(!risks.some(item => item.id === id), `geen melding ${id}`));
  assert.ok(risks.every(item => item.wat && item.waarom && item.onderzoek && Number.isFinite(item.zekerheid) && item.type), 'elke melding is volledig');
});
test('Hocus Pocus: totalen per rekening sluiten aan op het geheel', async () => {
  const { core, Az } = await model('hocus-pocus');
  const accounts = run(core, "DOSSIER.accounts.filter(account => account.role === 'zakelijk').map(account => account.iban)");
  const perAccount = accounts.map(iban => total(Az.rows.filter(row => row.account === iban && row.rule === 10).map(row => row.amount)));
  near(total(perAccount), Az.revenue12, 0.01, 'omzet per rekening');
  const internal = Az.rows.filter(row => row.rule === 1);
  near(total(internal.map(row => row.amount)), 0, 0.01, 'interne boekingen tussen gedeelde zakelijke rekeningen sluiten');
});
test('Hocus Pocus: handmatige correctie werkt overal door', async () => {
  const { core } = await model('hocus-pocus');
  const before = run(core, "overlay = 'zakelijk'; A = analyse(); ({ revenue: A.revenue12, free: A.freeCash.reduce((s, v) => s + v, 0) })");
  const key = run(core, "A.debtors[0].key");
  core.__key = key;
  const after = run(core, "decisions[decisionKey('debtor', __key)] = 'no'; A = analyse(); ({ revenue: A.revenue12, free: A.freeCash.reduce((s, v) => s + v, 0) })");
  assert.ok(after.revenue < before.revenue - 100000, 'omzet daalt na "geen omzet"');
  assert.ok(after.free < before.free, 'draagkracht daalt mee');
});
test('Hocus Pocus: Samen bij een bv is een huishoudoverzicht', async () => {
  const { core } = await model('hocus-pocus');
  assert.equal(analyseView(core, 'samen').householdOnly, true);
  assert.equal(analyseView(core, 'zakelijk').householdOnly, false);
});

/* ---------- Eenmanszaak met gemengde rekening ---------- */
test('Eenmanszaak gemengd: privé uit omzet en kosten, draagkracht zonder dubbeltelling', async () => {
  const want = expected('ez-gemengd');
  const { Az, risks, dossier } = await model('ez-gemengd');
  assert.equal(dossier.legalForm, want.legalForm);
  Object.entries(want.accountRole).forEach(([iban, role]) => assert.equal(dossier.accounts.find(account => account.iban === iban).role, role, 'rol voorgesteld'));
  near(Az.revenue12, want.revenue12, 0.01, 'omzet = alleen facturen');
  near(total(Az.depositRows.filter(row => row.role === 'Privé-inkomen').map(row => row.amount)), want.privateIncome12, 0.01, 'kinderbijslag en toeslag privé');
  near(-total(Az.drawRows.filter(row => row.role === 'Privé-uitgave').map(row => row.amount)), want.privateSpend12, 0.01, 'hypotheek en boodschappen privé');
  assert.ok(!Az.byRule(6).some(row => /Hypotheek/.test(row.name ?? '')), 'privéhypotheek geen zakelijke financiering');
  want.familyRelated.forEach(name => assert.equal(Az.related.find(item => item.name === name)?.role, 'Familie', name));
  assert.equal(Az.taxOf('ob').count, want.vatPayments);
  assert.equal(Az.taxRows.filter(row => row.tax.reference && row.tax.valid === false).length, want.invalidReferences);
  assert.equal(Az.byRule(4).length, want.bailiffPayments);
  const lease = Az.obligations.find(item => item.name === want.lease.name);
  assert.equal(lease.missed, want.lease.missed); assert.equal(lease.catchUp, want.lease.catchUp);
  /* draagkracht: opname = privé-uitgaven − privé-inkomen; IB één keer */
  const member = Az.capacityBase.perMember[0];
  near(member.actual * 12, want.privateSpend12 - want.privateIncome12, 0.05, 'werkelijke netto opname');
  const ib = total(Az.privateTaxOnBusiness);
  near(total(Az.operating) - total(Az.freeCash), member.used * 12 + ib, 0.1, 'aftrek = opname + IB, niet dubbel');
  want.expectRisks.forEach(id => assert.ok(risks.some(item => item.id === id), `melding ${id}`));
  want.noRisks.forEach(id => assert.ok(!risks.some(item => item.id === id), `geen melding ${id}`));
});

/* ---------- Vof met twee vennoten ---------- */
test('Vof: opnamen per vennoot, partner is vennoot, hoofdelijkheid', async () => {
  const want = expected('vof');
  const { Az, risks, dossier } = await model('vof');
  assert.equal(dossier.legalForm, want.legalForm);
  near(Az.revenue12, want.revenue12, 0.01, 'omzet');
  Object.entries(want.draws).forEach(([name, value]) => near(Az.memberDraws.find(member => member.name === name).out, value, 0.01, `opnamen ${name}`));
  Object.entries(want.deposits).forEach(([name, value]) => near(Az.memberDraws.find(member => member.name === name).in, value, 0.01, `stortingen ${name}`));
  assert.ok(Az.related.some(item => item.name === want.partnerIsVennoot && item.role === 'Vennoot'), 'partner herkend als vennoot');
  assert.ok(!Az.related.some(item => item.name === want.partnerIsVennoot && item.role === 'Familie'), 'partner niet als familie');
  const perMember = Az.capacityBase.perMember;
  near(perMember.find(member => member.name === 'A. de Vries').fixed.monthly, want.fixedPrivateA, 0.01, 'vaste privélasten A');
  assert.equal(perMember.find(member => member.name === want.missingPrivateFor).fixed.known, false);
  assert.ok(risks.some(item => item.id.startsWith('draagkracht-') && item.wat.includes(want.missingPrivateFor)), 'melding privérekening vennoot');
  want.noRisks.forEach(id => assert.ok(!risks.some(item => item.id === id), `geen melding ${id}`));
  /* betalingen tussen vennoten zijn geen omzet of kosten */
  assert.ok(!Az.rows.some(row => [10, 11].includes(row.rule) && /de Vries/.test(row.name ?? '')));
});

/* ---------- Twee eenmanszaken in één huishouden (Project Pizza en Project Patat) ---------- */
test('Pizza & Patat: opnamen per eigenaar, huishouden één keer, roodstand per rekening', async () => {
  const want = expected('pizza-patat');
  const { core, Az, risks, dossier } = await model('pizza-patat');
  assert.equal(dossier.transactions.length, want.transactions);
  Object.entries(want.endBalances).forEach(([iban, balance]) => near(dossier.accounts.find(account => account.iban === iban.replace(/\s/g, '')).balance, balance, 0.01, `eindsaldo ${iban}`));
  near(Az.revenue12, want.revenue12['Project Pizza'] + want.revenue12['Project Patat'], 0.01, 'omzet beide zaken');
  assert.equal(JSON.stringify(dossier.accounts.filter(account => account.role !== 'prive').map(account => [account.role, account.owner])), JSON.stringify([['zakelijk', 'onderneming'], ['zakelijk', 'onderneming']]), 'beide zaken zakelijk, niet gemengd');
  near(Az.memberDraws.find(member => member.name === 'M. Milkshake').out, want.ownerDraws12['M. Milkshake (Pizza)'], 0.01, 'opnamen Milkshake');
  near(Az.memberDraws.find(member => member.name === 'K. Koekenbakker').out, want.ownerDraws12['K. Koekenbakker (Patat)'], 0.01, 'opnamen Koekenbakker');
  const households = Az.capacityBase.households;
  assert.equal(households.length, 1, 'één huishouden');
  near(households[0].used * 12, (want.ownerDraws12['M. Milkshake (Pizza)'] + want.ownerDraws12['K. Koekenbakker (Patat)']), 1, 'aftrek = opnamen samen, niet dubbel');
  assert.ok(!risks.some(item => item.id === 'concentratie' && /CCV|Worldline|SumUp/.test(item.wat)), 'pinafrekening is geen klantconcentratie');
  assert.ok(risks.find(item => item.id === 'roodstand')?.wat.includes('Project Patat'), 'roodstand op de rekening van Patat');
  want.expectRisks.filter(id => id !== 'rekening-niet-gedeeld' && id !== 'roodstand').forEach(id => assert.ok(risks.some(item => item.id === id), `melding ${id}`));
  /* per zaak: Pizza sterker dan Patat */
  const perBusiness = iban => { core.__iban = iban; return run(core, "DOSSIER.accounts.forEach(account => { if (account.role !== 'prive') account.enabled = account.iban === __iban; }); (() => { const result = analyse(); DOSSIER.accounts.forEach(account => { account.enabled = true; }); return { revenue: result.revenue12, operating: result.operating.reduce((s, v) => s + v, 0) }; })()"); };
  const pizza = perBusiness('NL27RABO••••••41'), patat = perBusiness('NL63INGB••••••72');
  near(pizza.revenue, want.revenue12['Project Pizza'], 0.01, 'omzet Pizza');
  near(patat.revenue, want.revenue12['Project Patat'], 0.01, 'omzet Patat');
  assert.ok(pizza.operating / pizza.revenue > patat.operating / patat.revenue, 'Pizza houdt per euro omzet meer over');
});

/* ---------- Regressie: de drie sets uit ZK Loans laden en geven stabiele uitkomsten ---------- */
const baseline = JSON.parse(fs.readFileSync(path.join(__dirname, 'regression-baseline.json'), 'utf8'));
for (const folder of Object.keys(baseline)) {
  test(`Regressie ${folder}`, async () => {
    const { Az } = await model(folder);
    const want = baseline[folder];
    near(Az.revenue12, want.revenue12, 0.01, 'omzet');
    near(total(Az.operating), want.operating, 0.01, 'operationele kasstroom');
    near(total(Az.freeCash), want.freeCash, 0.01, 'draagkracht');
    near(total(Az.debtService), want.debtService, 0.01, 'rente en aflossing');
    assert.equal(Az.rows.length, want.rows);
  });
}
