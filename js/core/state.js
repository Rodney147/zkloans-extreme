'use strict';
/* ---------- Toestand ---------- */
let DOSSIER = null;
let overlay = 'zakelijk';
const decisions = {};
let A = null;

/* Audittrail van aanpassingen door de beoordelaar (wordt bewaard in de browser, zie js/store.js) */
const INPUT = { audit: [] };
function resetDossierState() {
  Object.keys(decisions).forEach(key => delete decisions[key]);
  Object.keys(INPUT).forEach(key => delete INPUT[key]);
  Object.assign(INPUT, { audit: [] });
}
