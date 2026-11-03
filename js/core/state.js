'use strict';
/* ---------- Toestand ---------- */
let DOSSIER = null;
let overlay = 'zakelijk';
let includeInternal = false;
const decisions = {};
let A = null;

/* Invoer van de analist die bij het dossier hoort (wordt bewaard in de browser, zie js/store.js) */
const INPUT = { loan: { amount: null, rate: null, months: null, form: 'annuitair', purposeMonths: null }, scenario: JSON.parse(JSON.stringify(SCENARIO_STANDAARD)), extraObligations: [], stated: { revenue: null }, risks: {}, checklist: {}, questions: [], conclusion: '', secondReviewer: '', audit: [] };
function resetDossierState() {
  Object.keys(decisions).forEach(key => delete decisions[key]);
  const fresh = { loan: { amount: null, rate: null, months: null, form: 'annuitair', purposeMonths: null }, scenario: JSON.parse(JSON.stringify(SCENARIO_STANDAARD)), extraObligations: [], stated: { revenue: DOSSIER?.stated?.revenue ?? null }, risks: {}, checklist: {}, questions: [], conclusion: '', secondReviewer: '', audit: [] };
  Object.keys(INPUT).forEach(key => delete INPUT[key]);
  Object.assign(INPUT, fresh);
}
