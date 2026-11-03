'use strict';
/* ==========================================================================
   Configuratie Loanwise Zakelijk
   - NORMEN: acceptatienormen. Vastgesteld door Risk & Operations. Zolang een
     waarde null is, geeft Loanwise geen oordeel ("norm niet ingesteld"),
     alleen de feiten.
   - SIGNAALGRENZEN: wanneer een indicator oranje/rood kleurt. Geen beleid,
     alleen een attentiegrens; aanpasbaar zonder code te wijzigen.
   - ACCEPTATIE: de checklist uit acceptatiehandleiding-zakelijk.md.
   Een klassiek script (geen JSON) zodat de pagina ook via file:// werkt.
   ========================================================================== */
const NORMEN = {
  dscrMinimum: null,              // F1: DSCR basis ≥
  dscrSlechtsteGeval: null,       // F2: DSCR slechtste geval ≥
  ruimtePerMaand: null,           // F4: ruimte na nieuwe last, € per maand ≥
  maandenHistorie: null,          // A3: aaneengesloten maanden ≥
  actualiteitDagen: null,         // A4: gat tussen laatste boekdatum en delen ≤
  bestaansduurJaren: null,        // B3: jaren sinds startdatum ≥
  omzetdalingMaximum: null,       // C2: daling 3 mnd t.o.v. 12 mnd, als fractie (0,25 = 25%) ≤
  klantconcentratieMaximum: null, // C4: aandeel grootste klant ≤
  roodstandDagenPerMaand: null,   // D6
  looptijdMaandenMaximum: null,   // F5
  leefgeldPerMaand: null,         // E3: leefgeld per huishouden (eenmanszaak/vof)
  uitgeslotenSbi: [],             // B4: uitgesloten SBI-codes (begin van de code)
};

const SIGNAALGRENZEN = {
  omzettrend: { warn: -0.10, bad: -0.25 },          // 3 mnd t.o.v. 12 mnd
  klantconcentratie: { warn: 0.30, bad: 0.50 },     // aandeel grootste debiteur
  zekerheidOmzet: { warn: 0.90, bad: 0.75 },        // deel zekere omzet
  btwBetaaldVsVerwacht: { goodMin: 0.8, goodMax: 1.2, warnMin: 0.6, warnMax: 1.4 },
  kostenquote: { min: 0.15, max: 0.60 },
  ongecategoriseerdAandeel: 0.05,                   // categorieregels: ≤ 5%
  lageZekerheidAandeel: 0.10,                       // categorieregels: ≤ 10%
  opgaveAfwijking: 0.20,                            // opgave aanvrager ±20%
  privéOpnamenVsKasstroom: { warn: 0.8, bad: 1.0 },
  gokkenPerMaand: 100,
  gokkenStijging: 0.25,
  vasteLastenPrivé: { warn: 0.5, bad: 0.7 },
  negatiefSaldoAandeel: 0.10,
  rondBedrag: 10000,
  uitschieterMaandomzet: 0.25,
  inhaalMinimumTermijn: 100,
  volatiliteitOmzet: 0.35,                          // variatiecoëfficiënt maandomzet
  financieringslastenStijging: 0.20,                // laatste 3 mnd t.o.v. eerdere 9 mnd
  e1AfwijkingAandeel: 0.10,                         // aandeel bedrag waarop E1 afwijkt                        // inhaalbetaling alleen bij termijnen ≥ € 100 (abonnementen met licenties vallen af)
};

/* Betaaldienstverleners bundelen betalingen van veel klanten (pin, iDEAL, bezorgbetalingen): geen klantconcentratie.
   Platforms als Thuisbezorgd en Uber Eats tellen wel mee: dat is een echte afhankelijkheid van één kanaal. */
const BETAALDIENSTEN = /\b(ccv|worldline|sumup|adyen|mollie|stripe|paypal|buckaroo|pay\.nl|multisafepay|ingenico|payvision|myPOS|zettle|viva wallet)\b/i;
const isPaymentProcessor = entity => BETAALDIENSTEN.test(entity?.name ?? '');

/* Scenario's bovenop de basis. VOORLOPIG: de definitieve percentages volgen (Risk).
   omzet = verandering omzet; variabele kosten (inkoop, directe kosten) bewegen evenredig mee.
   kosten = extra verandering van alle kosten (bijv. prijsstijging), bovenop het meebewegen. */
const SCENARIO_STANDAARD = {
  negatief: { omzet: -0.15, kosten: 0 },
  stress: { omzet: -0.25, kosten: 0.05 },
  positief: { omzet: 0.10, kosten: 0 },
};

/* E1 → Loanwise-regel (alleen vergelijking; E1 bepaalt nooit de categorie) */
const E1_NAAR_REGEL = [
  [/^(internal|investment\.savings)/, 1], [/^tax\.|essential\.municipal/, 3], [/^loan\.debt_collection$/, 4],
  [/^(other\.private_transfer|loan\.private)/, 5], [/^loan\.|mortgage/, 6], [/bank_fees|essential\.financial/, 7], [/salary/, 8], [/^cash\./, 9],
  [/^(income|subsidy)\./, 10], [/^(expense|office|insurance|housing|alimony|gambling|investment)\./, 11], [/^other\.other$/, 12],
];

/* Privé-achtige posten op een gemengde rekening (eenmanszaak zonder aparte rekening) */
const GEMENGD = {
  privéInkomenNaam: /sociale verzekeringsbank|\bsvb\b|toeslagen|uwv|kinderbijslag|kindgebonden|zorgtoeslag|huurtoeslag/i,
  privéInkomenE1: /^(subsidy\.|income\.salary|income\.pension|income\.benefits)/,
  privéUitgaveE1: /^(expense\.essential\.|expense\.lifestyle\.|housing\.|insurance\.health|gambling\.|investment\.crypto|alimony\.)/,
  privéUitgaveNaam: /albert heijn|jumbo|lidl|aldi|plus supermarkt|kinderopvang|hypothe|zorgverzeker|casino/i,
};

/* ---------- Acceptatiechecklist (acceptatiehandleiding-zakelijk.md) ----------
   rechtsvorm: voor welke vormen de check geldt (leeg = alle). bron: de functie in js/core/checklist.js die het voorstel maakt. */
const ACCEPTATIE = [
  { id: 'A1', groep: 'A. Dossier en data', titel: 'Alle zakelijke rekeningen gedeeld' },
  { id: 'A2', groep: 'A. Dossier en data', titel: 'Privérekeningen van elk lid gedeeld' },
  { id: 'A3', groep: 'A. Dossier en data', titel: 'Periode aaneengesloten', norm: 'maandenHistorie' },
  { id: 'A4', groep: 'A. Dossier en data', titel: 'Actualiteit', norm: 'actualiteitDagen' },
  { id: 'A5', groep: 'A. Dossier en data', titel: 'Saldo-aansluiting per rekening' },
  { id: 'A6', groep: 'A. Dossier en data', titel: 'Ongecategoriseerd en lage zekerheid' },
  { id: 'A7', groep: 'A. Dossier en data', titel: 'Consents geldig' },
  { id: 'A8', groep: 'A. Dossier en data', titel: 'Rekeningrollen bevestigd' },
  { id: 'B1', groep: 'B. Onderneming', titel: 'KvK-gegevens passen bij rekeninghouder' },
  { id: 'B2', groep: 'B. Onderneming', titel: 'Rechtsvorm vastgelegd' },
  { id: 'B3', groep: 'B. Onderneming', titel: 'Bestaansduur', norm: 'bestaansduurJaren' },
  { id: 'B4', groep: 'B. Onderneming', titel: 'Branche niet uitgesloten', norm: 'uitgeslotenSbi' },
  { id: 'B5', groep: 'B. Onderneming', titel: 'Personeel past bij loonbetalingen' },
  { id: 'B6', groep: 'B. Onderneming', titel: 'Leden en groep bevestigd' },
  { id: 'B7', groep: 'B. Onderneming', titel: 'Winstverdeling bekend', rechtsvorm: ['vof'] },
  { id: 'C1', groep: 'C. Omzet en kasstroom', titel: 'Omzet zuiver' },
  { id: 'C2', groep: 'C. Omzet en kasstroom', titel: 'Omzetontwikkeling', norm: 'omzetdalingMaximum' },
  { id: 'C3', groep: 'C. Omzet en kasstroom', titel: 'Structurele kasstroom positief' },
  { id: 'C4', groep: 'C. Omzet en kasstroom', titel: 'Klantconcentratie', norm: 'klantconcentratieMaximum' },
  { id: 'C5', groep: 'C. Omzet en kasstroom', titel: 'Opgave klant tegenover gemeten omzet' },
  { id: 'C6', groep: 'C. Omzet en kasstroom', titel: 'Btw tegenover omzet' },
  { id: 'C7', groep: 'C. Omzet en kasstroom', titel: 'Bandbreedte: oordeel slaat niet om' },
  { id: 'D1', groep: 'D. Verplichtingen en betaalgedrag', titel: 'Bestaande financieringen compleet' },
  { id: 'D2', groep: 'D. Verplichtingen en betaalgedrag', titel: 'Geen gemiste termijnen' },
  { id: 'D3', groep: 'D. Verplichtingen en betaalgedrag', titel: 'Geen terugboekingen' },
  { id: 'D4', groep: 'D. Verplichtingen en betaalgedrag', titel: 'Geen incasso of deurwaarder' },
  { id: 'D5', groep: 'D. Verplichtingen en betaalgedrag', titel: 'Geen belastingachterstand' },
  { id: 'D6', groep: 'D. Verplichtingen en betaalgedrag', titel: 'Roodstand', norm: 'roodstandDagenPerMaand' },
  { id: 'D7', groep: 'D. Verplichtingen en betaalgedrag', titel: 'Groepsverplichtingen in beeld', rechtsvorm: ['bv', 'holding'] },
  { id: 'E1a', groep: 'E. Privé', titel: 'Loon DGA', rechtsvorm: ['bv'] },
  { id: 'E1b', groep: 'E. Privé', titel: 'Privé-opnamen', rechtsvorm: ['eenmanszaak', 'vof'] },
  { id: 'E2', groep: 'E. Privé', titel: 'Rekening-courant', rechtsvorm: ['bv', 'vof'] },
  { id: 'E3', groep: 'E. Privé', titel: 'Benodigde privé-opname', rechtsvorm: ['eenmanszaak', 'vof'], norm: 'leefgeldPerMaand' },
  { id: 'E3b', groep: 'E. Privé', titel: 'Privélasten DGA', rechtsvorm: ['bv'] },
  { id: 'E4', groep: 'E. Privé', titel: 'Risicogedrag (gokken, crypto)' },
  { id: 'E5', groep: 'E. Privé', titel: 'Onverklaarde instroom' },
  { id: 'E6', groep: 'E. Privé', titel: 'Vermenging zakelijk en privé', rechtsvorm: ['bv'] },
  { id: 'E7', groep: 'E. Privé', titel: 'Gemengde rekening gescheiden', rechtsvorm: ['eenmanszaak'] },
  { id: 'E8', groep: 'E. Privé', titel: 'Hoofdelijkheid: alle vennoten in beeld', rechtsvorm: ['vof'] },
  { id: 'F0', groep: 'F. Kredietcapaciteit', titel: 'Draagkracht volgens rechtsvorm' },
  { id: 'F1', groep: 'F. Kredietcapaciteit', titel: 'DSCR basis', norm: 'dscrMinimum' },
  { id: 'F2', groep: 'F. Kredietcapaciteit', titel: 'DSCR slechtste geval', norm: 'dscrSlechtsteGeval' },
  { id: 'F3', groep: 'F. Kredietcapaciteit', titel: 'Negatief scenario' },
  { id: 'F4', groep: 'F. Kredietcapaciteit', titel: 'Ruimte na nieuwe last', norm: 'ruimtePerMaand' },
  { id: 'F5', groep: 'F. Kredietcapaciteit', titel: 'Looptijd', norm: 'looptijdMaandenMaximum' },
  { id: 'G1', groep: 'G. Afronding', titel: 'Alle risicomeldingen afgehandeld' },
  { id: 'G2', groep: 'G. Afronding', titel: 'Vragen aan klant beantwoord of bewust open' },
  { id: 'G3', groep: 'G. Afronding', titel: 'Afwijkingen van beleid gemotiveerd' },
  { id: 'G4', groep: 'G. Afronding', titel: 'Conclusie analist geschreven' },
  { id: 'G5', groep: 'G. Afronding', titel: 'Vier ogen' },
];
