'use strict';

/* ---------- Start: voorbeelddossier Mister X ---------- */
DOSSIER = buildSampleDossier();
finishBalances(DOSSIER.accounts, DOSSIER.transactions);
attachSampleAnalyses();
renderAll();
