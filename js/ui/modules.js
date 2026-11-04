'use strict';
/* ---------- Invoer van de beoordelaar: rekeningrol, rechtsvorm, categorie per tegenpartij, filters ---------- */
function changed(what, from, to, note) { audit(what, from, to, note); saveState(); renderAll(); }
document.addEventListener('change', event => {
  const target = event.target, data = target.dataset;
  if (data.override != null) {
    const key = decisionKey('cat', data.override);
    const before = decisions[key] ?? null;
    if (target.value) decisions[key] = target.value; else delete decisions[key];
    saveIbanDecision(key, decisions[key] ?? null);
    changed(`Categorie ${data.override}`, before, decisions[key] ?? null);
  } else if (data.accountRole || data.accountOwner) {
    const account = accountOf(data.accountRole ?? data.accountOwner);
    if (data.accountRole) { const before = account.role; account.role = target.value; if (target.value === 'zakelijk') account.owner = 'onderneming'; else if (account.owner === 'onderneming') account.owner = DOSSIER.members?.[0]?.id ?? 'onderneming'; account.roleConfirmed = true; changed(`Rol ${formatIban(account.iban)}`, before, account.role); }
    else { const before = account.owner; account.owner = target.value; account.roleConfirmed = true; changed(`Eigenaar ${formatIban(account.iban)}`, before, account.owner); }
  } else if (data.legalForm != null) {
    const before = DOSSIER.legalForm;
    DOSSIER.legalForm = target.value;
    (DOSSIER.members ?? []).forEach(member => { if (member.role === MEMBER_ROLE[before]) member.role = MEMBER_ROLE[target.value]; });
    changed('Rechtsvorm', before, target.value);
  } else if (['tx-month', 'tx-rule', 'tx-text'].includes(target.id)) {
    TX[{ 'tx-month': 'month', 'tx-rule': 'rule', 'tx-text': 'text' }[target.id]] = target.value;
    TX.limit = 150;
    renderAll();
  }
});
/* Maandoverzicht: tegenpartijen onder een post in- en uitklappen */
document.addEventListener('click', event => {
  const toggle = event.target.closest('[data-month-line]');
  if (!toggle) return;
  monthsOpen[toggle.dataset.monthLine] = !monthsOpen[toggle.dataset.monthLine];
  renderAll();
});

/* ---------- Thema (auto, licht, donker) en glas: per browser bewaard ---------- */
function applyLook() {
  const root = document.documentElement;
  const theme = root.dataset.theme ?? 'system';
  document.querySelectorAll('[data-theme-choice]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.themeChoice === theme)));
  document.getElementById('glass-toggle')?.setAttribute('aria-pressed', String(root.dataset.glass === 'on'));
}
document.addEventListener('click', event => {
  const root = document.documentElement;
  const choice = event.target.closest('[data-theme-choice]');
  if (choice) {
    const theme = choice.dataset.themeChoice;
    if (theme === 'system') delete root.dataset.theme; else root.dataset.theme = theme;
    try { localStorage.setItem('lw-theme', theme); } catch { /* geen opslag */ }
  } else if (event.target.closest('#glass-toggle')) {
    if (root.dataset.glass === 'on') delete root.dataset.glass; else root.dataset.glass = 'on';
    try { localStorage.setItem('lw-glass', root.dataset.glass ?? 'off'); } catch { /* geen opslag */ }
  } else return;
  applyLook();
});
applyLook();
