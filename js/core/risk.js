'use strict';
/* ---------- Risico-indicatoren: een checklijst met de transacties erachter ----------
   Elke check staat er altijd: 'good' = niets gevonden (in orde), anders 'info' (ter info), 'warn' (oranje) of 'bad' (rood).
   Loanwise toont wat er is gezien; de beoordelaar interpreteert en licht toe in de eigen beoordeling.
   De vaste waarden hieronder zijn attentiewaarden om een check aan te zetten, geen beleid of oordeel. */
const LAMPJES = {
  omzetdaling: 0.10,              // gemiddelde laatste 3 mnd ≥ 10% onder het 12-maandsgemiddelde
  schommeling: 0.35,              // variatiecoëfficiënt van de maandomzet
  financieringsstijging: 0.20,    // financieringslasten laatste 3 mnd t.o.v. de 9 maanden ervoor
  uitschieter: 0.25,              // één post > 25% van de gemiddelde maandomzet
  financieleVerplichting: 20,     // terugkerende betaling in ongecategoriseerd vanaf € 20 per termijn
  perTegenpartijPerMaand: 250,    // internationale en overige online/offline betalingen: gemiddeld per tegenpartij per maand
  betaalverzoekenPerMaand: 250,   // betaalverzoeken: gemiddeld per maand, betaald of ontvangen
  grootBedrag: 1000,              // eenmalige transactie vanaf € 1.000
  contantPerMaand: 500,           // contant opgenomen of gestort: gemiddeld per maand
  grooteOpname: 1000,             // één contante opname vanaf € 1.000
  hypotheekVariatie: 0.10,        // hypotheektermijnen wijken > 10% van elkaar af
  saldoDaling: 0.20,              // totaal saldo 3 maanden op rij lager en ≥ 20% gedaald
};
const RISK_GROUPS = ['Betaalgedrag en achterstanden', 'Leningen en verplichtingen', 'Belastingen', 'Risicogedrag', 'Bijzondere geldstromen', 'Omzet, cashflow en saldo', 'Data'];
const INVESTMENT_TEXT = /machine|apparatuur|installatie|investering|auto\b|bus\b|inventaris|verbouwing/i;
const BESLAG_TEXT = /beslag|derdenbeslag|loonbeslag|bankbeslag|beslaglegging|executori|gerechtsdeurwaarder/i;
const ACHTERSTAND_TEXT = /aanmaning|herinnering|achterstand|ingebrekestelling|incassokosten|wettelijke rente|laatste waarschuwing|dwangbevel|\bcjib\b|vervolgnota/i;
const WOON_TEXT = /\bhuur\b|huurpenning|hypothe|woning|\bvve\b|woonstichting|woningcorporatie|wooncorporatie|energie|eneco|vattenfall|essent|greenchoice|budget energie|waternet|vitens|brabant water|evides|dunea/i;
const WOON_SOURCE = ['rent', 'mortgage loans', 'consumer loans', 'energy', 'water'];
const MINILENING_TEXT = /ferratum|vivus|cashper|credit2go|creditfix|flitskrediet|minilening|snelle ?lening|kredietdirect|klarna|riverty|afterpay|\bin3\b|achteraf betalen|billink|spraypay|ideal in3/i;
const HYPOTHEEK_TEXT = /hypothe|obvion|florius|munt hypotheken|bijbouwe|argenta hypothe|venn hypothe/i;
const GAMING_TEXT = /\bsteam\b|playstation|\bxbox\b|nintendo|epic games|roblox|riot games|blizzard|battle\.net|\bea\.com\b|supercell/i;
const BETAALVERZOEK_TEXT = /tikkie|betaalverzoek|bunq\.me|paypal\.me/i;
const JURIDISCH_TEXT = /notaris|notariaat|notarissen|advocaat|advocaten|juridisch|rechtsbijstand|mediator|mediation/i;
const JURIDISCH_SOURCE = ['notary', 'legal services', 'notary and legal services'];
const OVERIGE_BETALINGEN = ['other online payments', 'other offline payments'];
/* particulier: initialen + (tussenvoegsel) + achternaam, bijv. "J. de Vries" of "P.J. Jansen" */
const PERSON_NAME = /^(?:[A-Z]\.\s?)+(?:(?:van|de|der|den|ten|ter|het|'t)\s)*[A-Z][a-zà-ÿ'-]+(?:-[A-Z][a-zà-ÿ'-]+)?$/;

/* Analyse in een vaste weergave zonder de huidige weergave te verstoren */
function analyseFor(view) {
  const previous = overlay;
  overlay = view;
  try { return analyse(); } finally { overlay = previous; }
}

function risks(Az, Ap, today = new Date().toISOString().slice(0, 10)) {
  const list = [];
  /* één check: altijd zichtbaar, 'good' als er niets is gevonden */
  const check = ({ hit, ernst, ok, rows = [], ...item }) => list.push({ ...item, ernst: hit ? ernst : 'good', wat: hit ? item.wat : ok, rows });
  const base = Az ?? Ap;
  if (!base) return list;
  const seen = new Set();
  const all = [...(Az?.rows ?? []), ...(Ap?.rows ?? [])].filter(row => !seen.has(row.id) && seen.add(row.id));
  const obligations = [...(Az?.obligations ?? []), ...(Ap?.obligations ?? [])];
  const text = row => `${row.name ?? ''} ${row.description}`;
  const recent = rows => rows.filter(row => row.monthIndex >= 9).length;
  const perMonth = value => value / 12;
  const names = rows => [...new Set(rows.map(row => row.name ?? '(geen naam)'))].slice(0, 4).join(', ') + (new Set(rows.map(row => row.name)).size > 4 ? ' …' : '');
  const G = RISK_GROUPS;

  /* ---------- Betaalgedrag en achterstanden ---------- */
  const reversals = all.filter(row => row.rule === 2);
  check({ id: 'terugboekingen', groep: G[0], titel: 'Terugboekingen', regel: 'Incasso’s die de bank heeft teruggeboekt (transaction_type reversal of storno), alle gedeelde rekeningen.', hit: reversals.length > 0, ernst: recent(reversals) ? 'bad' : 'warn', wat: `${reversals.length}× teruggeboekt (${recent(reversals)}× in de laatste 3 maanden), ${eur(inflow(reversals))}.`, ok: 'Geen terugboekingen gevonden.', rows: reversals });
  const beslag = all.filter(row => BESLAG_TEXT.test(text(row)));
  const bailiffs = all.filter(row => row.rule === 4 && !beslag.includes(row));
  check({ id: 'incasso', groep: G[0], titel: 'Incassobureaus', regel: 'Betalingen aan een incassobureau of deurwaarder (beheerde lijst).', hit: bailiffs.length > 0, ernst: 'bad', wat: `${bailiffs.length}× betaald aan ${names(bailiffs)}, ${eur(outflow(bailiffs))}.`, ok: 'Geen betalingen aan incassobureaus.', rows: bailiffs });
  check({ id: 'beslag', groep: G[0], titel: 'Beslagleggingen', regel: 'Omschrijving met beslag, loonbeslag, derdenbeslag of executoriale verkoop.', hit: beslag.length > 0, ernst: 'bad', wat: `${beslag.length}× ${eur(outflow(beslag) + inflow(beslag))}, ${names(beslag)}.`, ok: 'Geen beslaglegging gevonden.', rows: beslag });
  const isWoon = row => WOON_TEXT.test(text(row)) || WOON_SOURCE.includes(row.source?.category) || row.rule === 6;
  const missedWoon = obligations.filter(item => item.missed && (item.rule === 6 || item.rows.some(isWoon)));
  const missedOther = obligations.filter(item => item.missed && !missedWoon.includes(item) && item.rule !== 3);
  const lateText = all.filter(row => row.amount < 0 && ACHTERSTAND_TEXT.test(text(row)) && row.rule !== 3);
  const lateWoon = [...lateText.filter(isWoon), ...missedWoon.flatMap(item => item.rows)];
  const lateOther = [...lateText.filter(row => !isWoon(row)), ...missedOther.flatMap(item => item.rows)];
  check({ id: 'achterstand-wonen', groep: G[0], titel: 'Achterstanden woonlasten en leningen', regel: 'Gemiste of teruggeboekte termijn van huur, hypotheek, energie of een lening (3 van de laatste 6 maanden, ±2%), of een aanmaning of achterstand in de omschrijving.', hit: lateWoon.length > 0, ernst: 'bad', wat: [...missedWoon.map(item => `${item.name}: ${item.missed}× gemist (termijn ${eur(item.term)})`), ...(lateText.filter(isWoon).length ? [`${lateText.filter(isWoon).length}× aanmaning of achterstand`] : [])].join(' · '), ok: 'Woonlasten en leningen worden op tijd betaald.', rows: lateWoon });
  check({ id: 'achterstanden', groep: G[0], titel: 'Achterstanden algemeen', regel: 'Gemiste termijn van een andere vaste last, of aanmaning, herinnering, incassokosten, dwangbevel of CJIB in de omschrijving.', hit: lateOther.length > 0, ernst: 'warn', wat: [...missedOther.map(item => `${item.name}: ${item.missed}× gemist`), ...(lateText.filter(row => !isWoon(row)).length ? [`${lateText.filter(row => !isWoon(row)).length}× aanmaning of achterstand (${names(lateText.filter(row => !isWoon(row)))})`] : [])].join(' · '), ok: 'Geen achterstanden gevonden.', rows: lateOther });
  const arrangements = [...new Set([...obligations.filter(item => item.arrangement).flatMap(item => item.rows), ...all.filter(row => row.amount < 0 && /regeling|termijnbetaling|afbetaling/i.test(row.description))])];
  check({ id: 'betalingsregelingen', groep: G[0], titel: 'Mogelijke betalingsregelingen', regel: 'Betalingsregeling in de omschrijving, of gelijke termijnen zonder geldig betalingskenmerk aan de Belastingdienst.', hit: arrangements.length > 0, ernst: 'warn', wat: `${names(arrangements)}: ${arrangements.length}× samen ${eur(outflow(arrangements))}.`, ok: 'Geen betalingsregelingen gevonden.', rows: arrangements });

  /* ---------- Leningen en verplichtingen ---------- */
  const mini = all.filter(row => MINILENING_TEXT.test(text(row)));
  check({ id: 'minileningen', groep: G[1], titel: 'Minileningen', regel: 'Flitskrediet of achteraf betalen (o.a. Ferratum, Vivus, Cashper, Klarna, Riverty, in3).', hit: mini.length > 0, ernst: 'warn', wat: `${mini.length}× bij ${names(mini)}: ontvangen ${eur(inflow(mini))}, betaald ${eur(outflow(mini))}.`, ok: 'Geen minileningen of achteraf betalen gevonden.', rows: mini });
  const sourced = DOSSIER.transactions.some(row => row.source);
  const unclassified = obligations.filter(item => item.term >= LAMPJES.financieleVerplichting && item.rows.every(row => sourced ? row.source?.category === 'uncategorized' : row.rule === 11 && PERSON_NAME.test(row.name ?? '')));
  check({ id: 'financiele-verplichtingen', groep: G[1], titel: 'Mogelijke financiële verplichtingen', regel: `Terugkerende betaling (3 van 6 maanden, ±2%) vanaf ${eur(LAMPJES.financieleVerplichting)} in ongecategoriseerd${sourced ? '' : ' (zonder Loanwise-categorie: aan een particulier, bijv. een onderhandse lening)'}.`, hit: unclassified.length > 0, ernst: 'warn', wat: unclassified.map(item => `${item.name} ${eur(item.term)}/mnd`).join(' · '), ok: 'Geen onbekende terugkerende betalingen.', rows: unclassified.flatMap(item => item.rows) });
  if (Az) {
    const early = sum(Az.financing.values.slice(0, 9)) / 9, late = averageLast(Az.financing.values, 3);
    check({ id: 'financieringslasten', groep: G[1], titel: 'Stijgende financieringslasten', regel: `Rente en aflossing laatste 3 maanden meer dan ${pct(LAMPJES.financieringsstijging)} boven de 9 maanden ervoor.`, hit: early < 0 && late / early - 1 > LAMPJES.financieringsstijging, ernst: 'warn', wat: `Laatste 3 maanden ${eur(-late)}/mnd tegen ${eur(-early)}/mnd daarvoor.`, ok: 'Financieringslasten stabiel.', rows: Az.financing.rows });
  }
  const mortgage = all.filter(row => row.amount < 0 && (row.source?.category === 'mortgage loans' || HYPOTHEEK_TEXT.test(text(row))));
  const mortgageMonths = [...groupBy(mortgage, row => row.monthIndex).values()].map(rows => outflow(rows));
  const mortgageSpread = mortgageMonths.length >= 3 ? (Math.max(...mortgageMonths) - Math.min(...mortgageMonths)) / median(mortgageMonths) : 0;
  check({ id: 'hypotheek-wisselend', groep: G[1], titel: 'Wisselende hypotheekbetalingen', regel: `Hypotheektermijnen per maand wijken meer dan ${pct(LAMPJES.hypotheekVariatie)} van elkaar af.`, hit: mortgageSpread > LAMPJES.hypotheekVariatie, ernst: 'warn', wat: `Laagste maand ${eur(Math.min(...mortgageMonths, 0))}, hoogste ${eur(Math.max(...mortgageMonths, 0))}.`, ok: mortgage.length ? 'Hypotheek elke maand gelijk.' : 'Geen hypotheekbetalingen gezien.', rows: mortgage });
  const financed = all.filter(row => row.rule === 6 && row.amount > 0);
  check({ id: 'financiering-ontvangen', groep: G[1], titel: 'Mogelijke financiering van investering', regel: 'Bijschrijving van een lening, lease of krediet (financiering ontvangen).', hit: financed.length > 0, ernst: 'info', wat: `${financed.length}× ontvangen van ${names(financed)}, ${eur(inflow(financed))}.`, ok: 'Geen ontvangen financiering.', rows: financed });

  /* ---------- Belastingen ---------- */
  const overview = taxOverview(Az, Ap);
  const taxLine = type => overview.lines.find(item => item.type === type);
  const ob = taxLine('ob'), lh = taxLine('lh'), ib = taxLine('ib');
  const taxRows = overview.rows;
  const lateTax = taxRows.filter(row => row.amount < 0 && (['Naheffing', 'Betalingsregeling', 'Dwangbevel', 'Aanmaning'].includes(row.tax.kind) || row.tax.type === 'regeling' || (row.tax.previousYear && row.tax.kind === 'Aangifte')));
  check({ id: 'belastingachterstand', groep: G[2], titel: 'Mogelijke belastingachterstand', regel: 'Naheffing, betalingsregeling, dwangbevel, aanmaning, of een aangifte over een eerder jaar (kenmerkjaar vóór het betaaljaar).', hit: lateTax.length > 0, ernst: 'bad', wat: [...new Set(lateTax.map(row => `${taxLabel(row.tax)}${row.tax.kind === 'Aangifte' ? ` betaald op ${dateNl(row.date)}` : ''}`))].join(' · '), ok: 'Geen naheffing, regeling of achterstallige aangifte.', rows: lateTax });
  if (Az) check({ id: 'btw', groep: G[2], titel: 'Omzetbelasting betaald', regel: 'Per vol kalenderkwartaal een btw-betaling of teruggaaf; geen btw bij omzet kan KOR of vrijgestelde omzet zijn.', hit: (!ob.rows.length && Az.revenue12 > 0) || ob.missingQuarters.length > 0, ernst: 'warn', wat: !ob.rows.length ? `Geen omzetbelasting gezien bij ${eur(Az.revenue12)} omzet. Mogelijk KOR, vrijgestelde omzet of een niet-gedeelde rekening.` : `Geen betaling of teruggaaf in ${ob.missingQuarters.map(quarter => quarter.label).join(', ')}.`, ok: ob.status.text, rows: ob.rows });
  const wages = (Az?.byRule(8) ?? []).filter(row => row.amount < 0);
  check({ id: 'loonheffing', groep: G[2], titel: 'Loonheffing betaald', regel: 'Bij loonbetalingen elke maand loonheffing; geen maand overgeslagen tussen twee betaalde maanden.', hit: (wages.length > 0 && !lh.rows.length) || lh.missingMonths.length > 0, ernst: 'warn', wat: !lh.rows.length ? `Wel ${eur(outflow(wages))} lonen, geen loonheffing gezien.` : `Geen betaling in ${lh.missingMonths.map(index => monthName(overview.MONTHS[index])).join(', ')}.`, ok: lh.rows.length ? lh.status.text : 'Geen lonen en geen loonheffing.', rows: lh.rows.length ? lh.rows : wages });
  check({ id: 'inkomstenbelasting', groep: G[2], titel: 'Inkomstenbelasting betaald', regel: 'Voorlopige aanslag IB in maandtermijnen op een gedeelde rekening; geen termijn overgeslagen.', hit: !ib.rows.length || ib.missingMonths.length > 0, ernst: ib.rows.length ? 'warn' : 'info', wat: !ib.rows.length ? 'Geen IB gezien. Mogelijk via een niet-gedeelde rekening, of geen aanslag opgelegd.' : `Geen termijn in ${ib.missingMonths.map(index => monthName(overview.MONTHS[index])).join(', ')}.`, ok: ib.status.text, rows: ib.rows });

  /* ---------- Risicogedrag ---------- */
  const gambling = all.filter(row => row.signal === 'gokken');
  check({ id: 'gokken', groep: G[3], titel: 'Gokken', regel: 'Casino, toto, loterij, online gokken of Loanwise-categorie possible gambling.', hit: gambling.length > 0, ernst: 'bad', wat: `${gambling.length}× naar een gokaanbieder, ${eur(outflow(gambling))} in 12 maanden; laatste 3 maanden ${eur(outflow(gambling.filter(row => row.monthIndex >= 9)))}.`, ok: 'Geen gokken gevonden.', rows: gambling });
  const gaming = all.filter(row => row.amount < 0 && (row.source?.category === 'online gaming' || GAMING_TEXT.test(text(row))));
  check({ id: 'online-gaming', groep: G[3], titel: 'Online gaming', regel: 'Uitgaven aan games en in-game aankopen (Steam, PlayStation, Xbox, Nintendo, Roblox, Loanwise online gaming).', hit: gaming.length > 0, ernst: 'info', wat: `${gaming.length}× ${eur(outflow(gaming))} in 12 maanden.`, ok: 'Geen online gaming gevonden.', rows: gaming });
  const crypto = all.filter(row => row.signal === 'crypto');
  check({ id: 'crypto', groep: G[3], titel: 'Crypto', regel: 'Betalingen aan een cryptobeurs (Bitvavo, Coinbase, Binance, Kraken, Bitonic).', hit: crypto.length > 0, ernst: 'warn', wat: `${crypto.length}× bij een cryptobeurs, ${eur(outflow(crypto))}.`, ok: 'Geen crypto gevonden.', rows: crypto });

  /* ---------- Bijzondere geldstromen ---------- */
  const external = all.filter(row => row.rule !== 1);
  const counts = new Map(); external.forEach(row => counts.set(row.key, (counts.get(row.key) ?? 0) + 1));
  const large = external.filter(row => Math.abs(row.amount) >= LAMPJES.grootBedrag && counts.get(row.key) === 1);
  check({ id: 'grote-bedragen', groep: G[4], titel: 'Grote bedragen', regel: `Eenmalige transactie (tegenpartij één keer in 12 maanden) vanaf ${eur(LAMPJES.grootBedrag)}, zonder interne boekingen.`, hit: large.length > 0, ernst: 'warn', wat: `${large.length}× samen ${eur(sum(large.map(row => Math.abs(row.amount))))}: ${large.slice(0, 3).map(row => `${row.name ?? '(geen naam)'} ${eurCents(row.amount)}`).join(', ')}${large.length > 3 ? ' …' : ''}.`, ok: `Geen eenmalige transacties vanaf ${eur(LAMPJES.grootBedrag)}.`, rows: large });
  const overThreshold = rows => [...groupBy(rows, row => row.key).values()].filter(items => perMonth(outflow(items)) > LAMPJES.perTegenpartijPerMaand);
  const foreign = all.filter(row => row.amount < 0 && row.counterAccount && /^[A-Z]{2}\d{2}[A-Z0-9]{4}\d+$/.test(row.counterAccount) && !row.counterAccount.startsWith('NL'));
  const foreignHits = overThreshold(foreign);
  check({ id: 'internationaal', groep: G[4], titel: 'Internationale overboekingen', regel: `Betalingen naar een buitenlandse IBAN: gemiddeld per tegenpartij per maand meer dan ${eur(LAMPJES.perTegenpartijPerMaand)}.`, hit: foreignHits.length > 0, ernst: 'warn', wat: foreignHits.map(items => `${items[0].name ?? maskIban(items[0].counterAccount)} ${eur(perMonth(outflow(items)))}/mnd`).join(' · '), ok: foreign.length ? `${foreign.length} buitenlandse betalingen, geen tegenpartij boven ${eur(LAMPJES.perTegenpartijPerMaand)}/mnd.` : 'Geen betalingen naar het buitenland.', rows: foreignHits.flat() });
  if (sourced) {
    const other = all.filter(row => row.amount < 0 && OVERIGE_BETALINGEN.includes(row.source?.category));
    const otherHits = overThreshold(other);
    check({ id: 'overige-betalingen', groep: G[4], titel: 'Overige online en offline betalingen', regel: `Loanwise-categorie other online/offline payments: gemiddeld per tegenpartij per maand meer dan ${eur(LAMPJES.perTegenpartijPerMaand)}.`, hit: otherHits.length > 0, ernst: 'warn', wat: otherHits.map(items => `${items[0].name ?? '(geen naam)'} ${eur(perMonth(outflow(items)))}/mnd`).join(' · '), ok: 'Geen tegenpartij boven de drempel.', rows: otherHits.flat() });
  }
  const requests = all.filter(row => row.source?.category === 'payment requests' || BETAALVERZOEK_TEXT.test(text(row)));
  const requestIn = perMonth(inflow(requests)), requestOut = perMonth(outflow(requests));
  check({ id: 'betaalverzoeken', groep: G[4], titel: 'Betaalverzoeken', regel: `Tikkie en andere betaalverzoeken: gemiddeld per maand betaald of ontvangen meer dan ${eur(LAMPJES.betaalverzoekenPerMaand)}.`, hit: requestIn > LAMPJES.betaalverzoekenPerMaand || requestOut > LAMPJES.betaalverzoekenPerMaand, ernst: 'warn', wat: `Gemiddeld ${eur(requestOut)}/mnd betaald en ${eur(requestIn)}/mnd ontvangen.`, ok: requests.length ? `Gemiddeld ${eur(requestOut)}/mnd betaald en ${eur(requestIn)}/mnd ontvangen.` : 'Geen betaalverzoeken.', rows: requests });
  const cashOut = all.filter(row => row.rule === 9 && row.amount < 0);
  check({ id: 'contante-opnames', groep: G[4], titel: 'Contante opnames', regel: `Geldautomaat: gemiddeld per maand meer dan ${eur(LAMPJES.contantPerMaand)}.`, hit: perMonth(outflow(cashOut)) > LAMPJES.contantPerMaand, ernst: 'warn', wat: `Gemiddeld ${eur(perMonth(outflow(cashOut)))}/mnd opgenomen.`, ok: cashOut.length ? `Gemiddeld ${eur(perMonth(outflow(cashOut)))}/mnd opgenomen.` : 'Geen contante opnames.', rows: cashOut });
  const bigCash = cashOut.filter(row => -row.amount >= LAMPJES.grooteOpname);
  check({ id: 'grote-opnames', groep: G[4], titel: 'Grote opnames', regel: `Eén contante opname vanaf ${eur(LAMPJES.grooteOpname)}.`, hit: bigCash.length > 0, ernst: 'warn', wat: `${bigCash.length}× samen ${eur(outflow(bigCash))}.`, ok: `Geen opname vanaf ${eur(LAMPJES.grooteOpname)}.`, rows: bigCash });
  const cashIn = all.filter(row => row.amount > 0 && (row.how === 'contante storting' || row.type === 'cash_terminal' || /\bstorting\b|contant/i.test(row.description)) && !row.counterAccount);
  check({ id: 'contante-stortingen', groep: G[4], titel: 'Contante stortingen', regel: `Contant gestort: gemiddeld per maand meer dan ${eur(LAMPJES.contantPerMaand)}.`, hit: perMonth(inflow(cashIn)) > LAMPJES.contantPerMaand, ernst: 'warn', wat: `Gemiddeld ${eur(perMonth(inflow(cashIn)))}/mnd gestort, samen ${eur(inflow(cashIn))}.`, ok: cashIn.length ? `Gemiddeld ${eur(perMonth(inflow(cashIn)))}/mnd gestort.` : 'Geen contante stortingen.', rows: cashIn });
  const legal = all.filter(row => row.amount < 0 && (JURIDISCH_SOURCE.includes(row.source?.category) || JURIDISCH_TEXT.test(text(row))));
  check({ id: 'notaris-advocaat', groep: G[4], titel: 'Notaris en advocaatkosten', regel: 'Betalingen aan een notaris, advocaat, rechtsbijstand of mediator.', hit: legal.length > 0, ernst: 'info', wat: `${legal.length}× aan ${names(legal)}, ${eur(outflow(legal))}.`, ok: 'Geen notaris- of advocaatkosten.', rows: legal });
  if (Az) {
    const nameless = Az.byRule(10).filter(row => !row.name && Math.abs(row.amount) >= Az.revenue12 / 12 * 0.05);
    check({ id: 'onverklaard', groep: G[4], titel: 'Grote bijschrijvingen zonder tegenpartij', regel: 'Bijschrijving zonder naam vanaf 5% van de gemiddelde maandomzet; telt als omzet.', hit: nameless.length > 0, ernst: 'warn', wat: `${nameless.length}× samen ${eur(inflow(nameless))}, geteld als omzet.`, ok: 'Alle grote bijschrijvingen hebben een tegenpartij.', rows: nameless });
    const spikes = Az.rows.filter(row => [10, 11].includes(row.rule) && Math.abs(row.amount) > LAMPJES.uitschieter * Az.revenue12 / 12);
    /* mogelijke investering: eenmalige tegenpartij (hooguit 2 maanden) met een investeringswoord */
    const oneOff = new Set(Az.creditors.filter(entity => entity.activeMonths <= 2).map(entity => entity.key));
    const investments = Az.byRule(11).filter(row => oneOff.has(row.key) && INVESTMENT_TEXT.test(text(row)) && !spikes.includes(row));
    check({ id: 'incidenteel', groep: G[4], titel: 'Uitschieters en mogelijke investeringen', regel: `Omzet- of kostenpost groter dan ${pct(LAMPJES.uitschieter)} van de gemiddelde maandomzet, of een eenmalige tegenpartij met een investeringswoord. Telt mee in de cijfers.`, hit: spikes.length + investments.length > 0, ernst: 'info', wat: `${spikes.length} uitschieter(s)${investments.length ? `, ${investments.length} mogelijke investering(en)` : ''}.`, ok: 'Geen uitschieters.', rows: [...spikes, ...investments] });

    /* ---------- Omzet, cashflow en saldo ---------- */
    const values = Az.revenue;
    const { m3, m12 } = Az.averages(values);
    check({ id: 'omzetdaling', groep: G[5], titel: 'Dalende omzet', regel: `Gemiddelde omzet laatste 3 maanden ${pct(LAMPJES.omzetdaling)} of meer onder het 12-maandsgemiddelde.`, hit: m12 > 0 && m3 / m12 - 1 <= -LAMPJES.omzetdaling, ernst: 'warn', wat: `Laatste 3 maanden ${eur(m3)}/mnd tegen ${eur(m12)}/mnd over 12 maanden (${signedPct(m3 / m12 - 1)}).`, ok: `Laatste 3 maanden ${eur(m3)}/mnd tegen ${eur(m12)}/mnd (${signedPct(m12 ? m3 / m12 - 1 : NaN)}).`, rows: Az.byRule(10) });
    const mean = sum(values) / values.length;
    const cv = mean > 0 ? Math.sqrt(sum(values.map(value => (value - mean) ** 2)) / values.length) / mean : NaN;
    check({ id: 'schommeling', groep: G[5], titel: 'Sterk schommelende omzet', regel: `Variatiecoëfficiënt van de maandomzet boven ${dec(LAMPJES.schommeling)}.`, hit: Number.isFinite(cv) && cv > LAMPJES.schommeling, ernst: 'info', wat: `Laagste maand ${eur(Math.min(...values))}, hoogste ${eur(Math.max(...values))}.`, ok: 'Omzet per maand redelijk stabiel.', rows: Az.byRule(10) });
    const negativeMonths = Az.net.filter(value => value < 0).length;
    check({ id: 'negatieve-cashflow', groep: G[5], titel: 'Negatieve cashflow', regel: 'Netto cashflow over 12 maanden onder nul.', hit: Az.net12 < 0, ernst: 'bad', wat: `Netto cashflow over 12 maanden ${eur(Az.net12)}; ${negativeMonths} van 12 maanden negatief.`, ok: `Netto cashflow over 12 maanden ${eur(Az.net12)}.` });
    check({ id: 'negatieve-maanden', groep: G[5], titel: 'Maanden met negatieve cashflow', regel: 'Drie of meer maanden met een negatieve netto cashflow.', hit: Az.net12 >= 0 && negativeMonths >= 3, ernst: 'info', wat: `${negativeMonths} van 12 maanden negatief: ${Az.MONTHS.filter((key, index) => Az.net[index] < 0).map(shortMonth).join(', ')}.`, ok: `${negativeMonths} van 12 maanden negatief.` });
  }
  /* totaal saldo van alle gedeelde rekeningen: negatief in de laatste 3 maanden, of 3 maanden op rij gedaald */
  const totalBalance = base.days.map((day, index) => round2((Az?.balance[index] ?? 0) + (Ap?.balance[index] ?? 0)));
  const ends = base.MONTHS.map(key => totalBalance[base.days.findLastIndex(day => day.startsWith(key))]);
  const last3Days = totalBalance.slice(base.days.findIndex(day => day.startsWith(base.MONTHS[9])));
  const lowest = Math.min(...last3Days);
  const falling = ends[8] > 0 && ends[9] < ends[8] && ends[10] < ends[9] && ends[11] < ends[10] && (ends[8] - ends[11]) / ends[8] >= LAMPJES.saldoDaling;
  check({ id: 'saldo-trend', groep: G[5], titel: 'Neerwaartse trend bankrekeningsaldo', regel: `Totale banksaldo (alle gedeelde rekeningen) negatief in de laatste 3 maanden, of 3 maanden op rij gedaald met ${pct(LAMPJES.saldoDaling)} of meer.`, hit: lowest < 0 || falling, ernst: lowest < 0 ? 'bad' : 'warn', wat: lowest < 0 ? `Laagste totale saldo in de laatste 3 maanden ${eur(lowest)}.` : `Saldo einde maand ${eur(ends[8])} → ${eur(ends[11])} (${signedPct(ends[11] / ends[8] - 1)}).`, ok: `Saldo einde maand ${eur(ends[8])} → ${eur(ends[11])}, laagste ${eur(lowest)}.` });

  /* ---------- Data ---------- */
  check({ id: 'periode', groep: G[6], titel: 'Periode', regel: `Minstens ${DATAREGELS.minimaleMaanden} maanden data, liefst ${DATAREGELS.gewensteMaanden}.`, hit: base.dataMonths < DATAREGELS.gewensteMaanden, ernst: base.dataMonths < DATAREGELS.minimaleMaanden ? 'bad' : 'info', wat: `Transacties in ${base.dataMonths} van de 12 maanden.`, ok: `Transacties in alle ${base.dataMonths} maanden.` });
  const lastBooking = DOSSIER.transactions.at(-1)?.date;
  const sharedOn = DOSSIER.accounts.map(account => account.sharedOn).filter(Boolean).sort().at(-1) ?? today;
  const age = lastBooking ? Math.round((Date.parse(sharedOn) - Date.parse(lastBooking)) / 86400000) : null;
  check({ id: 'actualiteit', groep: G[6], titel: 'Actualiteit', regel: `Laatste transactie niet ouder dan ${DATAREGELS.maximaleOuderdomDagen} dagen voor de deeldatum.`, hit: age != null && age > DATAREGELS.maximaleOuderdomDagen, ernst: 'warn', wat: `Laatste transactie ${dateNl(lastBooking)}, ${age} dagen vóór ${sharedOn === today ? 'vandaag' : `de deeldatum (${dateNl(sharedOn)})`}.`, ok: `Laatste transactie ${dateNl(lastBooking)}.` });
  if (Az) {
    const unsharedRows = Az.byRule(1).filter(row => row.unshared && row.counterAccount);
    const unshared = [...new Set(unsharedRows.map(row => row.counterAccount))];
    check({ id: 'rekening-niet-gedeeld', groep: G[6], titel: 'Eigen rekening niet gedeeld', regel: 'Overboeking naar een IBAN op naam van de klant (of spaarrekening) die niet is gedeeld.', hit: unshared.length > 0, ernst: 'warn', wat: `${unshared.map(maskIban).join(', ')} staat op naam van de klant maar is niet gedeeld.`, ok: 'Alle eigen rekeningen zijn gedeeld.', rows: unsharedRows });
  }
  return list;
}
/* alleen de checks die iets vonden */
const riskHits = list => list.filter(item => item.ernst !== 'good');

/* ---------- Belastingdienst over het hele jaar, per kwartaal ----------
   Alle gedeelde rekeningen samen (zakelijk en privé), zodat ook IB en Zvw van een privérekening meetellen.
   Loanwise toont wat er betaald is en waar een betaling ontbreekt; of dat klopt (KOR, geen personeel, aanslag nog niet opgelegd) beoordeelt de beoordelaar. */
const TAX_FOCUS = ['ob', 'lh', 'ib'];
function taxOverview(Az, Ap) {
  const base = Az ?? Ap;
  if (!base) return null;
  const MONTHS = base.MONTHS;
  const seen = new Set();
  const rows = [...(Az?.taxRows ?? []), ...(Ap?.taxRows ?? [])].filter(row => !seen.has(row.id) && seen.add(row.id) && row.tax.type !== 'lokaal');
  /* kalenderkwartalen binnen het venster; een kwartaal aan de rand kan korter zijn */
  const quarters = [];
  MONTHS.forEach((key, index) => {
    const label = `K${Math.ceil(Number(key.slice(5, 7)) / 3)} ${key.slice(0, 4)}`;
    const last = quarters.at(-1);
    if (last?.label === label) last.months.push(index); else quarters.push({ label, months: [index] });
  });
  quarters.forEach(quarter => { quarter.full = quarter.months.length === 3; });
  const present = TAX_ORDER.filter(type => type !== 'lokaal' && rows.some(row => row.tax.type === type));
  const types = [...TAX_FOCUS, ...present.filter(type => !TAX_FOCUS.includes(type))];
  const hasWages = (Az?.byRule(8) ?? []).some(row => row.amount < 0);
  const lines = types.map(type => {
    const list = rows.filter(row => row.tax.type === type).sort((first, second) => first.date.localeCompare(second.date));
    const paidRows = list.filter(row => row.amount < 0), refundRows = list.filter(row => row.amount > 0);
    const paid = MONTHS.map((key, index) => round2(-sum(paidRows.filter(row => row.monthIndex === index).map(row => row.amount))));
    const refund = MONTHS.map((key, index) => round2(sum(refundRows.filter(row => row.monthIndex === index).map(row => row.amount))));
    const paidMonths = paid.map((value, index) => value > 0 ? index : -1).filter(index => index >= 0);
    /* ritme: omzetbelasting per kwartaal; loonheffing, IB, Zvw en Vpb per maand zodra er in ≥ 3 maanden betaald is; overige los */
    const cadence = type === 'ob' ? 'kwartaal' : ['lh', 'ib', 'zvw', 'vpb'].includes(type) && paidMonths.length >= 3 ? 'maand' : paidMonths.length ? 'los' : 'geen';
    const perQuarter = quarters.map(quarter => ({ ...quarter, paid: round2(sum(quarter.months.map(index => paid[index]))), refund: round2(sum(quarter.months.map(index => refund[index]))), rows: list.filter(row => quarter.months.includes(row.monthIndex)) }));
    const missingQuarters = type === 'ob' && paidRows.length ? perQuarter.filter(quarter => quarter.full && !quarter.paid && !quarter.refund) : [];
    const missingMonths = cadence === 'maand' ? MONTHS.map((key, index) => index).filter(index => index > paidMonths[0] && index < paidMonths.at(-1) && !paid[index]) : [];
    const kinds = [...groupBy(list, row => row.tax.kind).entries()].map(([kind, items]) => ({ kind, count: items.length, amount: round2(sum(items.map(row => row.amount))), rows: items }));
    const roles = [...new Set(list.map(row => accountOf(row.account)?.role).filter(Boolean))];
    const fullQuarters = perQuarter.filter(quarter => quarter.full);
    const status = !list.length ? { tone: type === 'lh' && !hasWages ? 'info' : 'warn', text: type === 'lh' && !hasWages ? 'Geen loonheffing en geen lonen gezien' : 'Geen betaling gezien' }
      : type === 'ob' ? { tone: missingQuarters.length ? 'warn' : 'good', text: `Betaald in ${fullQuarters.filter(quarter => quarter.paid || quarter.refund).length} van ${fullQuarters.length} volle kwartalen` }
      : cadence === 'maand' ? { tone: missingMonths.length ? 'warn' : 'good', text: `Betaald in ${paidMonths.length} van 12 maanden${missingMonths.length ? `, ${missingMonths.length} maand(en) overgeslagen` : ''}` }
      : { tone: 'info', text: `${paidRows.length}× betaald${refundRows.length ? `, ${refundRows.length}× teruggaaf` : ''}` };
    const special = list.filter(row => ['Naheffing', 'Betalingsregeling'].includes(row.tax.kind) || row.tax.previousYear);
    return { type, label: TAX_TYPES[type].label, pattern: TAX_TYPES[type].pattern, rows: list, paid, refund, perQuarter, cadence, paidMonths, missingQuarters, missingMonths, kinds, roles, status, special, total: round2(sum(paid)), refunds: round2(sum(refund)), last: paidRows.at(-1) ?? null };
  });
  return { MONTHS, quarters, lines, rows, hasWages };
}
