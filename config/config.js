'use strict';
/* ==========================================================================
   Configuratie Loanwise Zakelijk
   - NORMEN: acceptatienormen. Vastgesteld door Risk & Operations. Zolang een
     waarde null is, geeft Loanwise geen oordeel ("norm niet ingesteld"),
     alleen de feiten.
   - SIGNAALGRENZEN: wanneer een indicator oranje/rood kleurt. Geen beleid,
     alleen een attentiegrens; aanpasbaar zonder code te wijzigen.
   Een klassiek script (geen JSON) zodat de pagina ook via file:// werkt.
   ========================================================================== */
const NORMEN = {
  dscrMinimum: null,              // DSCR ≥ (oordeel in scorecard en controle)
  leefgeldPerMaand: null,         // leefgeld per huishouden (draagkracht eenmanszaak/vof)
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
