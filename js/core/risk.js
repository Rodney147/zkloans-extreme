'use strict';
/* ---------- Risico-indicatoren: een lampje met de transacties erachter ----------
   Loanwise toont wat er is gezien; de beoordelaar interpreteert en licht toe in de eigen beoordeling.
   ernst: 'bad' (rood lampje) · 'warn' (oranje lampje) · 'info' (ter info).
   De vaste waarden hieronder zijn attentiewaarden om een lampje aan te zetten, geen beleid of oordeel. */
const LAMPJES = {
  omzetdaling: 0.10,            // gemiddelde laatste 3 mnd ≥ 10% onder het 12-maandsgemiddelde
  schommeling: 0.35,            // variatiecoëfficiënt van de maandomzet
  financieringsstijging: 0.20,  // financieringslasten laatste 3 mnd t.o.v. de 9 maanden ervoor
  uitschieter: 0.25,            // één post > 25% van de gemiddelde maandomzet
};
const INVESTMENT_TEXT = /machine|apparatuur|installatie|investering|auto\b|bus\b|inventaris|verbouwing/i;

/* Analyse in een vaste weergave zonder de huidige weergave te verstoren */
function analyseFor(view) {
  const previous = overlay;
  overlay = view;
  try { return analyse(); } finally { overlay = previous; }
}

function risks(Az, Ap, today = new Date().toISOString().slice(0, 10)) {
  const list = [];
  const add = item => list.push({ rows: [], ...item });
  const base = Az ?? Ap;
  if (!base) return list;

  /* data: periode en actualiteit */
  if (base.dataMonths < DATAREGELS.minimaleMaanden) add({ id: 'periode', titel: `Minder dan ${DATAREGELS.minimaleMaanden} maanden data`, ernst: 'bad', wat: `Transacties in ${base.dataMonths} maand(en).` });
  else if (base.dataMonths < DATAREGELS.gewensteMaanden) add({ id: 'periode', titel: `Minder dan ${DATAREGELS.gewensteMaanden} maanden data`, ernst: 'info', wat: `Transacties in ${base.dataMonths} van de 12 maanden. Gemiddelden over 12 maanden zijn dan minder zeggend.` });
  const lastBooking = DOSSIER.transactions.at(-1)?.date;
  const sharedOn = DOSSIER.accounts.map(account => account.sharedOn).filter(Boolean).sort().at(-1) ?? today;
  const age = lastBooking ? Math.round((Date.parse(sharedOn) - Date.parse(lastBooking)) / 86400000) : null;
  if (age != null && age > DATAREGELS.maximaleOuderdomDagen) add({ id: 'actualiteit', titel: 'Data niet actueel', ernst: 'warn', wat: `Laatste transactie ${dateNl(lastBooking)}, ${age} dagen vóór ${sharedOn === today ? 'vandaag' : `de deeldatum (${dateNl(sharedOn)})`}.` });

  if (Az) {
    const values = Az.revenue;
    const { m3, m12 } = Az.averages(values);
    if (m12 > 0 && m3 / m12 - 1 <= -LAMPJES.omzetdaling) add({ id: 'omzetdaling', titel: 'Dalende omzet', ernst: 'warn', wat: `Omzet laatste 3 maanden ${eur(m3)}/mnd tegen ${eur(m12)}/mnd over 12 maanden (${signedPct(m3 / m12 - 1)}).`, rows: Az.byRule(10) });
    const mean = sum(values) / values.length;
    const cv = mean > 0 ? Math.sqrt(sum(values.map(value => (value - mean) ** 2)) / values.length) / mean : NaN;
    if (Number.isFinite(cv) && cv > LAMPJES.schommeling) add({ id: 'schommeling', titel: 'Sterk schommelende omzet', ernst: 'info', wat: `Laagste maand ${eur(Math.min(...values))}, hoogste ${eur(Math.max(...values))}.`, rows: Az.byRule(10) });
    if (Az.net12 < 0) add({ id: 'negatieve-cashflow', titel: 'Negatieve cashflow', ernst: 'bad', wat: `Netto cashflow over 12 maanden ${eur(Az.net12)}; ${Az.net.filter(value => value < 0).length} van 12 maanden negatief.` });
    else if (Az.net.filter(value => value < 0).length >= 3) add({ id: 'negatieve-maanden', titel: 'Maanden met negatieve cashflow', ernst: 'info', wat: `${Az.net.filter(value => value < 0).length} van 12 maanden negatief: ${Az.MONTHS.filter((key, index) => Az.net[index] < 0).map(shortMonth).join(', ')}.` });
    Az.obligations.filter(item => item.missed).forEach(item => add({ id: `gemist-${item.key}`, titel: `Gemiste termijn: ${item.name}`, ernst: 'bad', wat: `${item.missed}× niet betaald of teruggeboekt in de laatste 6 maanden (termijn ${eur(item.term)}).`, rows: item.rows }));
    const early = sum(Az.financing.values.slice(0, 9)) / 9, late = averageLast(Az.financing.values, 3);
    if (early < 0 && late / early - 1 > LAMPJES.financieringsstijging) add({ id: 'financieringslasten', titel: 'Stijgende financieringslasten', ernst: 'warn', wat: `Laatste 3 maanden ${eur(-late)}/mnd tegen ${eur(-early)}/mnd daarvoor.`, rows: Az.financing.rows });
    const lateTax = Az.taxRows.filter(row => row.amount < 0 && (row.tax.kind === 'Naheffing' || row.tax.kind === 'Betalingsregeling' || (row.tax.previousYear && row.tax.kind === 'Aangifte')));
    const plans = Az.obligations.filter(item => item.rule === 3 && item.arrangement);
    if (lateTax.length || plans.length) add({ id: 'belastingachterstand', titel: 'Mogelijke belastingachterstand', ernst: 'bad', wat: [...new Set([...lateTax.map(row => `${taxLabel(row.tax)}${row.tax.kind === 'Aangifte' ? ` betaald op ${dateNl(row.date)}` : ''}`), ...plans.map(item => `betalingsregeling ${eur(item.term)}/mnd`)])].join(' · '), rows: [...lateTax, ...plans.flatMap(item => item.rows)] });
    const spikes = Az.rows.filter(row => [10, 11].includes(row.rule) && Math.abs(row.amount) > LAMPJES.uitschieter * Az.revenue12 / 12);
    /* mogelijke investering: eenmalige tegenpartij (hooguit 2 maanden) met een investeringswoord */
    const oneOff = new Set(Az.creditors.filter(entity => entity.activeMonths <= 2).map(entity => entity.key));
    const investments = Az.byRule(11).filter(row => oneOff.has(row.key) && INVESTMENT_TEXT.test(`${row.name ?? ''} ${row.description}`) && !spikes.includes(row));
    if (spikes.length || investments.length) add({ id: 'incidenteel', titel: 'Uitschieters en mogelijke investeringen', ernst: 'info', wat: `${spikes.length} post(en) groter dan ${pct(LAMPJES.uitschieter)} van de gemiddelde maandomzet${investments.length ? `, ${investments.length} mogelijke investering(en)` : ''}. Ze tellen mee in de cijfers.`, rows: [...spikes, ...investments] });
    const nameless = Az.byRule(10).filter(row => !row.name && Math.abs(row.amount) >= Az.revenue12 / 12 * 0.05);
    if (nameless.length) add({ id: 'onverklaard', titel: 'Grote bijschrijvingen zonder tegenpartij', ernst: 'warn', wat: `${nameless.length}× samen ${eur(inflow(nameless))}, geteld als omzet.`, rows: nameless });
    const unshared = [...new Set(Az.byRule(1).filter(row => row.unshared && row.counterAccount).map(row => row.counterAccount))];
    if (unshared.length) add({ id: 'rekening-niet-gedeeld', titel: 'Eigen rekening niet gedeeld', ernst: 'warn', wat: `${unshared.map(maskIban).join(', ')} staat op naam van de klant maar is niet gedeeld.`, rows: Az.byRule(1).filter(row => row.unshared) });
  }
  /* betaalgedrag en risicogedrag op alle gedeelde rekeningen (zakelijk en privé) */
  const all = [...(Az?.rows ?? []), ...(Ap?.rows ?? [])].filter((row, index, array) => array.findIndex(other => other.id === row.id) === index);
  const recent = rows => rows.filter(row => row.monthIndex >= 9).length;
  const reversals = all.filter(row => row.rule === 2);
  if (reversals.length) add({ id: 'terugboekingen', titel: 'Terugboekingen', ernst: recent(reversals) ? 'bad' : 'warn', wat: `${reversals.length}× teruggeboekt (${recent(reversals)}× in de laatste 3 maanden), ${eur(inflow(reversals))}.`, rows: reversals });
  const bailiffs = all.filter(row => row.rule === 4);
  if (bailiffs.length) add({ id: 'incasso', titel: 'Incassobureau of deurwaarder', ernst: 'bad', wat: `${bailiffs.length}× betaald, ${eur(outflow(bailiffs))}.`, rows: bailiffs });
  const gambling = all.filter(row => row.signal === 'gokken');
  if (gambling.length) add({ id: 'gokken', titel: 'Gokken', ernst: 'bad', wat: `${gambling.length}× naar een gokaanbieder, ${eur(outflow(gambling))} in 12 maanden; laatste 3 maanden ${eur(outflow(gambling.filter(row => row.monthIndex >= 9)))}.`, rows: gambling });
  const crypto = all.filter(row => row.signal === 'crypto');
  if (crypto.length) add({ id: 'crypto', titel: 'Crypto', ernst: 'warn', wat: `${crypto.length}× bij een cryptobeurs, ${eur(outflow(crypto))}.`, rows: crypto });
  const order = ['bad', 'warn', 'info'];
  return list.sort((first, second) => order.indexOf(first.ernst) - order.indexOf(second.ernst));
}
