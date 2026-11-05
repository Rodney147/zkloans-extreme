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
  taxLamps(Az, Ap).forEach(add);
  const order = ['bad', 'warn', 'info'];
  return list.sort((first, second) => order.indexOf(first.ernst) - order.indexOf(second.ernst));
}

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
/* lampjes over het betalen van omzetbelasting, loonheffing en inkomstenbelasting */
function taxLamps(Az, Ap) {
  const overview = taxOverview(Az, Ap);
  if (!overview) return [];
  const lamps = [];
  const line = type => overview.lines.find(item => item.type === type);
  const ob = line('ob'), lh = line('lh'), ib = line('ib');
  if (Az && !ob.rows.length && Az.revenue12 > 0) lamps.push({ id: 'btw-ontbreekt', titel: 'Geen omzetbelasting betaald gezien', ernst: 'warn', wat: `Wel ${eur(Az.revenue12)} omzet in 12 maanden. Mogelijk KOR, vrijgestelde omzet of betaling via een niet-gedeelde rekening.`, rows: [] });
  if (ob.missingQuarters.length) lamps.push({ id: 'btw-kwartaal', titel: 'Omzetbelasting: kwartaal zonder betaling', ernst: 'warn', wat: `Geen betaling of teruggaaf in ${ob.missingQuarters.map(quarter => quarter.label).join(', ')}.`, rows: ob.rows });
  if (overview.hasWages && !lh.rows.length) lamps.push({ id: 'lh-ontbreekt', titel: 'Lonen betaald, geen loonheffing gezien', ernst: 'warn', wat: `Wel ${eur(outflow(Az.byRule(8)))} aan lonen in 12 maanden.`, rows: Az.byRule(8) });
  if (lh.missingMonths.length) lamps.push({ id: 'lh-maand', titel: 'Loonheffing: maand overgeslagen', ernst: 'warn', wat: `Geen betaling in ${lh.missingMonths.map(index => monthName(overview.MONTHS[index])).join(', ')}.`, rows: lh.rows });
  if (!ib.rows.length) lamps.push({ id: 'ib-ontbreekt', titel: 'Geen inkomstenbelasting gezien', ernst: 'info', wat: 'Geen voorlopige of definitieve aanslag IB op de gedeelde rekeningen. Mogelijk betaald via een niet-gedeelde rekening, of geen aanslag opgelegd.', rows: [] });
  if (ib.missingMonths.length) lamps.push({ id: 'ib-maand', titel: 'Inkomstenbelasting: termijn overgeslagen', ernst: 'warn', wat: `Geen termijn in ${ib.missingMonths.map(index => monthName(overview.MONTHS[index])).join(', ')}.`, rows: ib.rows });
  return lamps;
}
