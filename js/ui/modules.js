'use strict';
/* ---------- Risicomeldingen en invoer in de dossierkop ----------
   Risicomeldingen rekenen op het dossier (zakelijke weergave + privé ernaast), los van de gekozen weergave. */
/* ---------- Risicomeldingen ---------- */
const RISK_STATUS = { open: 'Open', beoordeeld: 'Beoordeeld', afgehandeld: 'Afgehandeld' };
RENDERERS.risico = () => {
  const list = MODEL.risks;
  const order = ['bad', 'warn', 'info'];
  const sorted = [...list].sort((first, second) => order.indexOf(first.ernst) - order.indexOf(second.ernst));
  const counts = Object.keys(RISK_TYPES).map(type => [type, list.filter(item => item.type === type).length]);
  const rows = sorted.map(item => `<tr class="${item.state.status !== 'open' ? 'done' : ''}">
    <td>${ICON[item.ernst] ?? ICON.info}</td>
    <td><b>${esc(item.titel)}</b><span class="chip outline">${RISK_TYPES[item.type]}</span><span class="muted">${esc(item.wat)}</span></td>
    <td class="reasons"><b>Waarom:</b> ${esc(item.waarom)}<br><b>Onderzoeken:</b> ${esc(item.onderzoek)}<br><span class="muted">Bron: ${esc(item.berekening)}</span></td>
    <td>${confidenceChip(item.zekerheid)}</td>
    <td>${item.rows.length ? viewButton(item.titel, item.rows) : ''}</td>
    <td class="action"><select class="inline-select" data-risk-status="${esc(item.id)}" aria-label="Status">${Object.entries(RISK_STATUS).map(([value, label]) => `<option value="${value}" ${item.state.status === value ? 'selected' : ''}>${label}</option>`).join('')}</select><input type="text" data-risk-note="${esc(item.id)}" value="${esc(item.state.toelichting)}" placeholder="Toelichting" aria-label="Toelichting"></td></tr>`).join('');
  return `${card('Risicomeldingen', `${list.filter(item => item.state.status === 'open').length} open van ${list.length} · ${counts.filter(([, count]) => count).map(([type, count]) => `${RISK_TYPES[type].toLowerCase()} ${count}`).join(' · ')}`,
      list.length ? table(['', 'Wat is gesignaleerd', 'Waarom en wat onderzoeken', 'Zekerheid', 'Bron', 'Afhandeling'], rows) : '<div class="card-body">Geen meldingen.</div>',
      'Elke melding volgt uit vaste regels op de transacties (bron + bekijken). Een melding op een classificatie onder de drempel staat als <b>onzekere classificatie</b> en is nooit een harde conclusie. Signaalgrenzen in <code>config/config.js</code>; beleidsafwijkingen alleen als Risk een norm heeft ingesteld.')}
    ${card('Eigen bevinding toevoegen', 'Handmatige bevinding van de analist', `<div class="card-body inline-form"><input type="text" id="manual-title" placeholder="Bevinding" aria-label="Bevinding" style="flex:1"><select id="manual-type" class="inline-select" aria-label="Soort">${Object.entries(RISK_TYPES).map(([value, label]) => `<option value="${value}">${label}</option>`).join('')}</select><button type="button" class="btn-outline" data-action="manual-add">Toevoegen</button></div>`)}`;
};


/* ---------- Invoer en afhandeling ---------- */
function changed(what, from, to, note) { audit(what, from, to, note); saveState(); renderAll(); }
document.addEventListener('change', event => {
  const target = event.target, data = target.dataset;
  if (data.riskStatus || data.riskNote) {
    const id = data.riskStatus ?? data.riskNote;
    const state = INPUT.risks[id] ?? { status: 'open', toelichting: '' };
    const before = { ...state };
    if (data.riskStatus) state.status = target.value; else state.toelichting = target.value;
    INPUT.risks[id] = state;
    changed(`Melding ${id}`, before.status, state.status, state.toelichting);
  } else if (data.accountRole || data.accountOwner || data.accountConfirm) {
    const account = accountOf(data.accountRole ?? data.accountOwner ?? data.accountConfirm);
    if (data.accountRole) { const before = account.role; account.role = target.value; if (target.value === 'zakelijk') account.owner = 'onderneming'; else if (account.owner === 'onderneming') account.owner = DOSSIER.members?.[0]?.id ?? 'onderneming'; account.roleConfirmed = true; changed(`Rol ${formatIban(account.iban)}`, before, account.role); }
    else if (data.accountOwner) { const before = account.owner; account.owner = target.value; account.roleConfirmed = true; changed(`Eigenaar ${formatIban(account.iban)}`, before, account.owner); }
    else { account.roleConfirmed = target.checked; changed(`Rol bevestigd ${formatIban(account.iban)}`, !target.checked, target.checked); }
  } else if (data.legalForm != null) {
    const before = DOSSIER.legalForm;
    DOSSIER.legalForm = target.value;
    (DOSSIER.members ?? []).forEach(member => { if (member.role === MEMBER_ROLE[before]) member.role = MEMBER_ROLE[target.value]; });
    changed('Rechtsvorm', before, target.value);
  }
});
document.addEventListener('click', event => {
  const target = event.target.closest('[data-action], [data-member-remove]');
  if (!target) return;
  const data = target.dataset;
  if (data.memberRemove) { const member = DOSSIER.members.find(item => item.id === data.memberRemove); DOSSIER.members = DOSSIER.members.filter(item => item !== member); DOSSIER.accounts.forEach(account => { if (account.owner === member.id) account.owner = 'onderneming'; }); return changed('Lid verwijderd', memberName(member), null); }
  if (data.action === 'member-add') {
    const initials = document.getElementById('member-initials').value.trim(), surname = document.getElementById('member-surname').value.trim();
    if (!initials || !surname) return showBanner('bad', 'Lid niet toegevoegd', 'Vul initialen en achternaam in.');
    const member = { id: `m${Date.now().toString(36)}`, initials: initials.endsWith('.') ? initials : `${initials}.`, last_name: surname, role: document.getElementById('member-role').value, manual: true };
    DOSSIER.members = [...(DOSSIER.members ?? []), member];
    return changed('Lid toegevoegd', null, `${memberName(member)} (${member.role})`);
  }
  if (data.action === 'manual-add') {
    const titel = document.getElementById('manual-title').value.trim();
    if (!titel) return;
    INPUT.manualRisks = [...(INPUT.manualRisks ?? []), { id: `handmatig-${Date.now().toString(36)}`, titel, type: document.getElementById('manual-type').value, wat: titel, waarom: 'Bevinding van de analist.', onderzoek: '-' }];
    return changed('Bevinding toegevoegd', null, titel);
  }
});
