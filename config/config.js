'use strict';
/* ==========================================================================
   Configuratie Loanwise Zakelijk (basismodel)
   Loanwise toont cijfers en risico-indicatoren; de beoordelaar interpreteert.
   Er staan hier geen normen of oordeelsgrenzen, alleen gegevensregels.
   Een klassiek script (geen JSON) zodat de pagina ook via file:// werkt.
   ========================================================================== */
const DATAREGELS = {
  minimaleMaanden: 3,        // periode: minstens 3 maanden, liefst 12
  gewensteMaanden: 12,
  maximaleOuderdomDagen: 14, // laatste transactie niet ouder dan 14 dagen
};

/* Betaaldienstverleners bundelen betalingen van veel klanten (pin, iDEAL): bij de klanten apart gemarkeerd. */
const BETAALDIENSTEN = /\b(ccv|worldline|sumup|adyen|mollie|stripe|paypal|buckaroo|pay\.nl|multisafepay|ingenico|payvision|myPOS|zettle|viva wallet)\b/i;
const isPaymentProcessor = entity => BETAALDIENSTEN.test(entity?.name ?? '');

/* Privé-achtige posten op een gemengde rekening (eenmanszaak zonder aparte rekening) */
const GEMENGD = {
  privéInkomenNaam: /sociale verzekeringsbank|\bsvb\b|toeslagen|uwv|kinderbijslag|kindgebonden|zorgtoeslag|huurtoeslag/i,
  privéInkomenE1: /^(subsidy\.|income\.salary|income\.pension|income\.benefits)/,
  privéUitgaveE1: /^(expense\.essential\.|expense\.lifestyle\.|housing\.|insurance\.health|gambling\.|investment\.crypto|alimony\.)/,
  privéUitgaveNaam: /albert heijn|jumbo|lidl|aldi|plus supermarkt|kinderopvang|hypothe|zorgverzeker|casino/i,
};
