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

/* Loanwise-categorie → kopje in de analyse. De Loanwise-categorie uit de CSV is leidend; alleen een gedeelde eigen
   rekening als tegenrekening gaat voor (bv ↔ DGA is geen interne boeking). Niet genoemd = op richting: bij = 10, af = 11.
   'uncategorized' (en een transactie zonder categorie) valt terug op de vaste regels. */
const LOANWISE_NAAR_REGEL = {
  'checking accounts': 1, 'savings': 1,
  'other taxes': 3, 'municipal taxes': 3, 'road taxes': 3, 'income taxes': 3,
  'debt collection': 4,
  'possible related bank accounts': 5, 'disability benefits': 5, 'housing benefits': 5, 'health insurance benefits': 5, 'child benefits': 5, 'benefits': 5,
  'consumer loans': 6, 'mortgage loans': 6,
  'bank fees': 7,
  'salary': 8,
  'cash withdrawals': 9,
  'possible income': 10,
};
