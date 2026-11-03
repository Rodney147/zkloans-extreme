'use strict';
/* ---------- Toestand ---------- */
let DOSSIER = null;
let overlay = 'zakelijk';
let includeInternal = false;
const decisions = {};
let A = null;

/* Invoer van de analist die bij het dossier hoort (wordt bewaard in de browser, zie js/store.js) */
const INPUT = { risks: {}, manualRisks: [], audit: [] };
function resetDossierState() {
  Object.keys(decisions).forEach(key => delete decisions[key]);
  Object.keys(INPUT).forEach(key => delete INPUT[key]);
  Object.assign(INPUT, { risks: {}, manualRisks: [], audit: [] });
}
