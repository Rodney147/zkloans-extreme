'use strict';
/* ---------- Opslag in de browser (IndexedDB), nooit naar een server ----------
   - dossiers: per dossier (vingerafdruk van rekeningen en transacties) de rekeningrollen, leden, besluiten en
     de afhandeling van risicomeldingen en eigen bevindingen plus de audittrail.
   - iban: besluiten per tegenpartij (IBAN), die ook in volgende dossiers gelden.
   Valt IndexedDB weg (privévenster, geblokkeerd), dan werkt alles in het geheugen en verdwijnt het bij herladen. */
const STORE = { db: null, available: false, error: null };
function openStore() {
  return new Promise(resolve => {
    try {
      const request = indexedDB.open('loanwise-zakelijk', 1);
      request.onupgradeneeded = () => { request.result.createObjectStore('dossiers'); request.result.createObjectStore('iban'); };
      request.onsuccess = () => { STORE.db = request.result; STORE.available = true; resolve(true); };
      request.onerror = () => { STORE.error = request.error?.message ?? 'onbekend'; resolve(false); };
    } catch (error) { STORE.error = error.message; resolve(false); }
  });
}
function storeGet(name, key) {
  return new Promise(resolve => {
    if (!STORE.db) return resolve(null);
    try { const request = STORE.db.transaction(name).objectStore(name).get(key); request.onsuccess = () => resolve(request.result ?? null); request.onerror = () => resolve(null); } catch { resolve(null); }
  });
}
function storeGetAll(name) {
  return new Promise(resolve => {
    if (!STORE.db) return resolve([]);
    try {
      const store = STORE.db.transaction(name).objectStore(name);
      const keys = store.getAllKeys(), values = store.getAll();
      values.onsuccess = () => resolve(values.result.map((value, index) => [keys.result?.[index], value]));
      values.onerror = () => resolve([]);
    } catch { resolve([]); }
  });
}
function storePut(name, key, value) {
  if (!STORE.db) return;
  try { STORE.db.transaction(name, 'readwrite').objectStore(name).put(value, key); } catch { /* opslag niet beschikbaar: alleen in het geheugen */ }
}

/* Vingerafdruk: rekeningen + eerste en laatste transactie + aantal */
function dossierKey() {
  const rows = DOSSIER.transactions;
  return [DOSSIER.accounts.map(account => account.iban).sort().join(','), rows.length, rows[0]?.id, rows.at(-1)?.id].join('|');
}

/* Audittrail: elke handmatige wijziging met tijdstip, oud → nieuw en toelichting */
function audit(what, from, to, note = '') {
  INPUT.audit.unshift({ at: new Date().toISOString(), what, from: from ?? null, to: to ?? null, note });
  if (INPUT.audit.length > 1000) INPUT.audit.length = 1000;
}

function saveState() {
  if (!DOSSIER || DOSSIER.source === 'test') return;
  storePut('dossiers', dossierKey(), {
    savedAt: new Date().toISOString(), label: DOSSIER.label,
    decisions: { ...decisions },
    accounts: Object.fromEntries(DOSSIER.accounts.map(account => [account.iban, { role: account.role, owner: account.owner, roleConfirmed: account.roleConfirmed, enabled: account.enabled }])),
    members: DOSSIER.members, legalForm: DOSSIER.legalForm,
    input: JSON.parse(JSON.stringify(INPUT)),
  });
}
/* Besluit per IBAN ook bewaren voor volgende dossiers (debiteur, crediteur, verbonden partij) */
function saveIbanDecision(key, value) {
  if (value == null) { try { STORE.db?.transaction('iban', 'readwrite').objectStore('iban').delete(key); } catch { /* geen opslag */ } return; }
  if (!key || key.includes('|naam:')) return;
  storePut('iban', key, { value, at: new Date().toISOString() });
}
async function restoreState() {
  if (!STORE.db) return { restored: false, global: 0 };
  const globalDecisions = await storeGetAll('iban');
  let global = 0;
  globalDecisions.forEach(([key, item]) => { if (key && item?.value) { decisions[key] = item.value; global += 1; } });
  const saved = await storeGet('dossiers', dossierKey());
  if (!saved) return { restored: false, global };
  Object.assign(decisions, saved.decisions ?? {});
  DOSSIER.accounts.forEach(account => Object.assign(account, saved.accounts?.[account.iban] ?? {}));
  if (saved.members?.length) DOSSIER.members = saved.members;
  if (saved.legalForm) DOSSIER.legalForm = saved.legalForm;
  Object.keys(INPUT).forEach(key => { if (saved.input?.[key] !== undefined) INPUT[key] = saved.input[key]; });
  return { restored: true, global, savedAt: saved.savedAt };
}
