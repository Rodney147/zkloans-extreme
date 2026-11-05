'use strict';
/* ---------- Belastingdienst: rekeningen, betalingskenmerk, soort en jaar ---------- */
const TAX_AUTHORITY_IBANS = ['NL86INGB0002445588', 'NL04RABO0200112244'];
const TAX_IBAN_SWITCH = '2026-05-01';
const LOCAL_TAX_PATTERN = /gemeente|waterschap|belastingsamenwerking|gblt|bsgw/i;
const TAX_MIDDEL = { '0': 'Naheffing loonheffing', '1': 'Aangifte omzetbelasting', '5': 'Naheffing omzetbelasting', '6': 'Aangifte loonheffing' };
const TAX_TYPES = {
  ob: { label: 'Omzetbelasting (btw)', recognition: 'kenmerk pos. 10 = 1 (aangifte) of 5 (naheffing)', pattern: 'Per kwartaal, uiterlijk de laatste dag van de maand na het kwartaal. Teruggaaf als de voorbelasting hoger is.' },
  lh: { label: 'Loonheffingen', recognition: 'kenmerk pos. 10 = 6 (aangifte) of 0 (naheffing)', pattern: 'Per maand, uiterlijk de laatste dag van de volgende maand.' },
  ib: { label: 'Inkomstenbelasting', recognition: 'kenmerk pos. 10–11 = 70 of 73', pattern: 'Voorlopige aanslag in gelijke maandtermijnen; definitieve aanslag of teruggaaf achteraf.' },
  zvw: { label: 'Bijdrage Zvw (inkomensafhankelijk)', recognition: 'kenmerk pos. 10–11 = 75 en pos. 16 = 4 of 5', pattern: 'Voorlopige aanslag in gelijke maandtermijnen, naast de inkomstenbelasting.' },
  vpb: { label: 'Vennootschapsbelasting', recognition: 'kenmerk pos. 10–11 = 74, 80–84 of 92–96', pattern: 'Voorlopige aanslag in termijnen; alleen bij een bv.' },
  mrb: { label: 'Motorrijtuigenbelasting', recognition: 'omschrijving motorrijtuigenbelasting', pattern: 'Per kwartaal of maand, privé of zakelijk voertuig.' },
  hsb: { label: 'Houderschapsbelasting / MOA', recognition: 'kenmerk pos. 10–11 = 76, 78, 87 of 88', pattern: 'Per tijdvak, voor voertuigen op naam van het bedrijf.' },
  bpm: { label: 'BPM', recognition: 'omschrijving bpm of belasting personenauto', pattern: 'Eenmalig bij registratie van een voertuig.' },
  erf: { label: 'Erf- of schenkbelasting', recognition: 'omschrijving erfbelasting of schenkbelasting', pattern: 'Eenmalige aanslag.' },
  dividend: { label: 'Dividendbelasting', recognition: 'omschrijving dividendbelasting', pattern: 'Bij een dividenduitkering van de bv.' },
  toeslag: { label: 'Toeslagen (terugbetaling)', recognition: 'Dienst Toeslagen of omschrijving toeslag', pattern: 'Terugvordering van een te hoog voorschot, vaak in termijnen.' },
  regeling: { label: 'Betalingsregeling Belastingdienst', recognition: 'omschrijving betalingsregeling zonder soort', pattern: 'Gelijke maandtermijnen voor een achterstand; de soort staat niet in de omschrijving.' },
  lokaal: { label: 'Gemeente- en waterschapsbelastingen', recognition: 'tegenpartij gemeente, waterschap of belastingsamenwerking', pattern: 'Jaarlijkse aanslag, vaak in 8 tot 10 termijnen.' },
  onbekend: { label: 'Belastingdienst, soort onbekend', recognition: 'geen kenmerk, geen herkenbare omschrijving en geen Loanwise-categorie', pattern: 'Niet te bepalen uit de transactie.' },
};
const TAX_ORDER = ['ob', 'lh', 'ib', 'zvw', 'vpb', 'mrb', 'hsb', 'bpm', 'erf', 'dividend', 'toeslag', 'regeling', 'lokaal', 'onbekend'];
/* soort uit de omschrijving (en de Loanwise-categorie): zo veel mogelijk herkennen, pas 'onbekend' als niets past */
const TAX_TEXT = [
  ['ob', /omzetbelasting|omzetbel\b|\bbtw\b|\bob\b\s*\d|\bvat\b/i],
  ['lh', /loonheffing|loonbelasting|loonbel\b|\blh\b\s*\d|premies? (?:volksverzekering|werknemersverzekering)/i],
  ['zvw', /\bzvw\b|zorgverzekeringswet|inkomensafhankelijke bijdrage/i],
  ['ib', /inkomstenbelasting|\bib\b|\bib\/|\binkomstenbel/i],
  ['vpb', /vennootschapsbelasting|\bvpb\b|vennootschapsbel/i],
  ['mrb', /motorrijtuigen|\bmrb\b|wegenbelasting/i],
  ['bpm', /\bbpm\b|belasting (?:van )?personenauto/i],
  ['erf', /erfbelasting|schenkbelasting|successierecht/i],
  ['dividend', /dividendbelasting/i],
  ['toeslag', /toeslag|dienst toeslagen|terugvordering/i],
];
const TAX_FROM_SOURCE = { 'road taxes': 'mrb', 'income taxes': 'ib', 'municipal taxes': 'lokaal' };
const ASSESSMENT_KIND = { '0': 'Voorlopige aanslag', '6': 'Definitieve aanslag' };
const PAYMENT_REFERENCE_WEIGHTS = [10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2];
function paymentReferenceCheckDigit(body) {
  const value = 11 - sum([...body].map((digit, index) => Number(digit) * PAYMENT_REFERENCE_WEIGHTS[index])) % 11;
  return value === 11 ? 0 : value === 10 ? 1 : value;
}
const isValidPaymentReference = reference => /^\d{16}$/.test(reference) && paymentReferenceCheckDigit(reference.slice(1)) === Number(reference.charAt(0));
const withCheckDigit = body => `${paymentReferenceCheckDigit(body)}${body}`;
function decodePaymentReference(text) {
  const match = String(text ?? '').match(/(?<!\d)(\d{4}\s?\d{4}\s?\d{4}\s?\d{4})(?!\d)/);
  if (!match) return null;
  const reference = match[1].replace(/\s/g, '');
  return { reference, middelCode: reference.charAt(9), valid: isValidPaymentReference(reference) };
}
const resolveTaxYear = (digit, date) => { const year = Number(date.slice(0, 4)); return year - ((((year - digit) % 10) + 10) % 10); };
function classifyTax(row) {
  const bookingYear = Number(row.date.slice(0, 4));
  const text = row.description;
  const textYear = text.match(/\b(20\d{2})\b/);
  const bookingMonth = Number(row.date.slice(5, 7));
  const finish = result => ({ period: null, valid: null, ...result, previousYear: result.year !== null && result.year < bookingYear && !(result.kind === 'Aangifte' && bookingMonth <= 2 && result.year === bookingYear - 1) });
  if (LOCAL_TAX_PATTERN.test(row.name ?? '') || row.source?.category === 'municipal taxes') return finish({ type: 'lokaal', kind: /termijn/i.test(text) ? 'Aanslag in termijnen' : 'Aanslag', year: textYear ? Number(textYear[1]) : null, reference: null });
  const decoded = decodePaymentReference(text);
  const textType = () => {
    const searchable = `${text} ${row.name ?? ''}`;
    return TAX_TEXT.find(([, pattern]) => pattern.test(searchable))?.[0] ?? TAX_FROM_SOURCE[row.source?.category] ?? (/dienst toeslagen/i.test(row.name ?? '') ? 'toeslag' : null);
  };
  const textKind = type => /dwangbevel/i.test(text) ? 'Dwangbevel' : /aanmaning|herinnering/i.test(text) ? 'Aanmaning' : /regeling/i.test(text) || row.e1?.flags.includes('payment_arrangement') ? 'Betalingsregeling' : /naheffing/i.test(text) ? 'Naheffing' : /voorlopige aanslag/i.test(text) ? 'Voorlopige aanslag' : /definitieve aanslag/i.test(text) ? 'Definitieve aanslag' : type === 'ob' || type === 'lh' ? 'Aangifte' : type === 'toeslag' ? 'Terugbetaling' : 'Aanslag';
  if (row.amount > 0 && !decoded) {
    const type = textType() ?? 'onbekend';
    return finish({ type, kind: type === 'toeslag' ? 'Toeslag ontvangen' : 'Teruggaaf', year: textYear ? Number(textYear[1]) : null, reference: null, fromText: type !== 'onbekend' });
  }
  if (!decoded) {
    /* geen kenmerk: soort uit de omschrijving of de Loanwise-categorie; een regeling zonder soort heeft een eigen regel */
    const found = textType();
    const kind = textKind(found);
    const type = found ?? (kind === 'Betalingsregeling' ? 'regeling' : 'onbekend');
    return finish({ type, kind: type === 'onbekend' ? 'Geen betalingskenmerk' : kind, year: textYear ? Number(textYear[1]) : null, reference: null, fromText: type !== 'onbekend' });
  }
  const { reference, valid } = decoded;
  const twoDigit = reference.slice(9, 11);
  const number = Number(twoDigit);
  const assessment = digit => row.amount > 0 ? 'Teruggaaf' : ASSESSMENT_KIND[digit] ?? `Aanslag (soortcode ${digit})`;
  const yearAt = position => resolveTaxYear(Number(reference.charAt(position)), row.date);
  if (['70', '73'].includes(twoDigit)) return finish({ type: 'ib', kind: assessment(reference.charAt(12)), year: yearAt(11), reference, valid });
  if (twoDigit === '75' && ['4', '5'].includes(reference.charAt(15))) return finish({ type: 'zvw', kind: assessment(reference.charAt(12)), year: yearAt(11), reference, valid });
  if (twoDigit === '74' || (number >= 80 && number <= 84) || (number >= 92 && number <= 96)) return finish({ type: 'vpb', kind: assessment(reference.charAt(8)), year: yearAt(7), reference, valid });
  if (['76', '78', '87', '88'].includes(twoDigit)) return finish({ type: 'hsb', kind: ['76', '88'].includes(twoDigit) ? 'Naheffing' : 'Aangifte', year: yearAt(11), reference, valid: null });
  const middel = reference.charAt(9);
  if (['0', '1', '5', '6'].includes(middel)) return finish({ type: ['1', '5'].includes(middel) ? 'ob' : 'lh', kind: row.amount > 0 ? 'Teruggaaf' : ['0', '5'].includes(middel) ? 'Naheffing' : 'Aangifte', year: yearAt(10), period: reference.slice(13, 15), reference, valid });
  /* kenmerk wel aanwezig, maar middel niet te herleiden: dan alsnog de omschrijving proberen */
  const found = textType();
  return finish({ type: found ?? 'onbekend', kind: found ? textKind(found) : 'Kenmerk niet herleidbaar', year: textYear ? Number(textYear[1]) : null, reference, valid, fromText: !!found });
}
const taxLabel = tax => `${TAX_TYPES[tax.type].label} · ${tax.kind}${tax.year ? ` ${tax.year}` : ''}`;
