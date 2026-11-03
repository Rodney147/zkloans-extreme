'use strict';
/* ---------- Kredietcapaciteit, risicomeldingen, acceptatiechecklist en conceptrapport ----------
   Deze tabbladen rekenen altijd op het dossier (zakelijke weergave + privé ernaast), los van de gekozen weergave. */
const fmtRatio = value => Number.isFinite(value) ? `${dec(value)}×` : 'geen schuld';
const normChip = (ok, key) => ok == null ? `<span class="chip" title="Norm ${key} staat in config/config.js op null">norm niet ingesteld</span>` : ok ? '<span class="chip good">voldoet aan norm</span>' : '<span class="chip bad">onder norm</span>';
const noBusiness = () => card('Geen zakelijke rekening', '', '<div class="card-body">Dit dossier heeft geen zakelijke of gemengde rekening die meetelt. Zet een rekening aan of wijzig de rol in de dossierkop.</div>');
const numberInput = (path, value, { step = 'any', suffix = '', placeholder = '', width = 9 } = {}) => `<span class="field"><input type="number" inputmode="decimal" step="${step}" data-input="${path}" value="${value ?? ''}" placeholder="${placeholder}" style="width:${width}ch">${suffix ? `<span class="muted">${suffix}</span>` : ''}</span>`;

/* ---------- Kredietcapaciteit ---------- */
RENDERERS.capaciteit = () => {
  const model = MODEL;
  if (!model.Az) return noBusiness();
  const cap = model.cap;
  const loan = INPUT.loan;
  const form = `<div class="form-grid">
      <label>Aangevraagd bedrag ${numberInput('loan.amount', loan.amount, { step: 1000, suffix: '€', width: 11 })}</label>
      <label>Rente per jaar ${numberInput('loan.rate', loan.rate, { step: 0.1, suffix: '%', width: 6 })}</label>
      <label>Looptijd ${numberInput('loan.months', loan.months, { step: 1, suffix: 'mnd', width: 6 })}</label>
      <label>Aflossingsvorm <select data-input="loan.form" class="inline-select">${[['annuitair', 'Annuïtair'], ['lineair', 'Lineair'], ['aflossingsvrij', 'Aflossingsvrij']].map(([value, label]) => `<option value="${value}" ${loan.form === value ? 'selected' : ''}>${label}</option>`).join('')}</select></label>
      <label>Levensduur doel ${numberInput('loan.purposeMonths', loan.purposeMonths, { step: 1, suffix: 'mnd', width: 6 })}</label>
      <label>Opgave omzet aanvrager (12 mnd) ${numberInput('stated.revenue', INPUT.stated.revenue, { step: 1000, suffix: '€', width: 11 })}</label>
    </div>`;
  const tiles = `<div class="tiles" style="border-top:0">
      ${tile('Draagkracht', eur(cap.carrying), '/mnd', `operationeel ${eur(cap.operating)} − aftrek ${esc(DOSSIER.legalForm)} ${eur(cap.deduction)}`)}
      ${tile('Bestaande rente + aflossing', eur(cap.debtBefore), '/mnd', `uit transacties ${eur(cap.existingMonthly)}${cap.extraMonthly ? ` + opgegeven ${eur(cap.extraMonthly)}` : ''}`)}
      ${tile('Nieuwe maandlast', cap.loan ? eur(cap.newMonthly) : '-', cap.loan ? '/mnd' : '', cap.loan ? `${esc(loan.form)} · rente jaar 1 ${eur(cap.loan.interestYear1)}` : 'vul bedrag, rente en looptijd in')}
      ${tile('DSCR', fmtRatio(cap.dscrAfter), '', `vóór nieuwe financiering ${fmtRatio(cap.dscrBefore)} · ${normChip(cap.verdict.dscr, 'dscrMinimum')}`)}
      ${tile('Ruimte na nieuwe last', eur(cap.room), '/mnd', normChip(cap.verdict.room, 'ruimtePerMaand'))}
    </div>`;
  const extras = (INPUT.extraObligations ?? []).map((item, index) => `<tr><td>${esc(item.name)}</td><td class="num">${eur(item.monthly)}</td><td>${cap.extras[index]?.matchedWith ? `<span class="chip">al herkend: ${esc(cap.extras[index].matchedWith)}</span>` : '<span class="chip warn">telt extra mee</span>'}</td><td class="action"><button type="button" class="btn-outline" data-action="extra-remove" data-index="${index}">Verwijder</button></td></tr>`).join('');
  const scenarioRow = (key, item) => `<tr><td><b>${item.label}</b></td><td>${key === 'basis' ? '-' : numberInput(`scenario.${key}.omzet`, Math.round(item.omzet * 1000) / 10, { step: 1, suffix: '%', width: 6 })}</td><td>${key === 'basis' ? '-' : numberInput(`scenario.${key}.kosten`, Math.round(item.kosten * 1000) / 10, { step: 1, suffix: '%', width: 6 })}</td><td class="num">${eur(item.carrying)}</td><td class="num"><b>${fmtRatio(item.dscr)}</b></td><td class="num ${item.room < 0 ? 'negative' : ''}">${eur(item.room)}</td></tr>`;
  const corrections = cap.corrections.map(item => `<tr><td>${esc(item.label)}<span class="muted">${esc(item.how)}</span></td><td class="num ${item.monthly < 0 ? 'negative' : ''}">${eur(item.monthly)}</td></tr>`).join('');
  return `${card('Nieuwe financiering', 'Invoer analist · wordt bewaard in deze browser', form)}
    <div class="card">${tiles}</div>
    ${card('Scenario’s', '<b>Voorlopige percentages</b> (definitief volgt van Risk) · variabele kosten bewegen mee met de omzet; vaste lasten, lonen en financiering niet', table(['Scenario', 'Omzet', 'Extra kosten', 'num:Draagkracht/mnd', 'num:DSCR', 'num:Ruimte/mnd'], Object.entries(cap.scenarios).map(([key, item]) => scenarioRow(key, item)).join('')),
      `<b>Kostenstructuur</b> (uit de transacties): vaste crediteuren ${eur(cap.costStructure.fixedMonthly)}/mnd, variabel ${eur(cap.costStructure.variableMonthly)}/mnd = ${pct(cap.costStructure.variableShare)} van de omzet. ${cap.breakEven != null ? `<b>Break-even</b>: de DSCR wordt 1,0 bij een omzetverandering van ${signedPct(cap.breakEven)}.` : ''}<br><b>Bandbreedte</b> (zekerheid omzet en kosten): slechtste geval DSCR ${fmtRatio(cap.worst.dscr)} (${eur(cap.worst.carrying)}/mnd) ${normChip(cap.verdict.worst, 'dscrSlechtsteGeval')} · beste geval ${fmtRatio(cap.best.dscr)} (${eur(cap.best.carrying)}/mnd).`)}
    ${card('Opbouw draagkracht (correcties)', `Gemiddeld per maand over ${cap.months} maanden · DSCR = draagkracht ÷ (bestaande + nieuwe rente en aflossing)`, table(['Post', 'num:Per maand'], `${corrections}<tr class="total-row"><td><b>= Draagkracht</b></td><td class="num"><b>${eur(cap.carrying)}</b></td></tr>`),
      `Bestaande rente en aflossing komen uit ${ruleRef(6)} en leningen van verbonden partijen (${ruleRef(5)}). De verplichtingen tellen niet in de kasstroomopbouw, alleen in de noemer: geen dubbeltelling. Zie Kasstroomopbouw voor de maanden.`)}
    ${card('Overige opgegeven verplichtingen', 'Alleen als ze niet al in de transacties zijn herkend (koppelen in plaats van optellen)', `${extras ? table(['Omschrijving', 'num:Per maand', 'Status', ''], extras) : ''}<div class="card-body inline-form"><input type="text" id="extra-name" placeholder="Naam schuldeiser" aria-label="Naam schuldeiser"><input type="number" id="extra-monthly" placeholder="€ per maand" aria-label="Bedrag per maand" style="width:12ch"><button type="button" class="btn-outline" data-action="extra-add">Toevoegen</button></div>`)}`;
};

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

/* ---------- Acceptatiechecklist ---------- */
const statusChip = value => `<span class="chip ${value === 'voldoet' ? 'good' : value === 'voldoet_niet' ? 'bad' : value === 'info_nodig' ? 'warn' : ''}">${CHECK_STATUS[value] ?? '-'}</span>`;
RENDERERS.acceptatie = () => {
  if (!MODEL.Az) return noBusiness();
  const checks = MODEL.checks;
  const groups = [...groupBy(checks, check => check.groep).entries()];
  const set = checks.filter(check => check.status);
  const missingNote = checks.filter(check => check.status && NEEDS_NOTE.includes(check.status) && !check.toelichting);
  const rows = items => items.map(check => `<tr class="${!check.applies ? 'off' : ''}">
    <td class="mono">${check.id}</td><td><b>${esc(check.titel)}</b><span class="muted">${esc(check.feiten)}</span></td>
    <td>${statusChip(check.voorstel)}</td>
    <td class="action"><select class="inline-select" data-check-status="${check.id}" aria-label="Status ${check.id}"><option value="">Status kiezen</option>${Object.entries(CHECK_STATUS).map(([value, label]) => `<option value="${value}" ${check.status === value ? 'selected' : ''}>${label}</option>`).join('')}</select>
      <input type="text" data-check-note="${check.id}" value="${esc(check.toelichting)}" placeholder="${check.status && NEEDS_NOTE.includes(check.status) ? 'Toelichting verplicht' : 'Toelichting'}" class="${check.status && NEEDS_NOTE.includes(check.status) && !check.toelichting ? 'required' : ''}" aria-label="Toelichting ${check.id}">
      ${check.status !== check.voorstel ? `<button type="button" class="btn-outline" data-action="check-accept" data-id="${check.id}" data-value="${check.voorstel}">Neem voorstel over</button>` : ''}</td></tr>`).join('');
  const questions = (INPUT.questions ?? []).map((question, index) => `<tr><td>${esc(question.text)}</td><td><input type="text" data-question-answer="${index}" value="${esc(question.answer ?? '')}" placeholder="Antwoord klant" aria-label="Antwoord"></td><td><label class="toggle"><input type="checkbox" data-question-open="${index}" ${question.open ? 'checked' : ''}><span>Bewust open</span></label></td><td class="action"><button type="button" class="btn-outline" data-action="question-remove" data-index="${index}">Verwijder</button></td></tr>`).join('');
  const suggestions = MODEL.risks.filter(item => item.state.status === 'open' && ['ontbreekt', 'classificatie', 'risico'].includes(item.type)).map(item => item.onderzoek).filter((text, index, list) => list.indexOf(text) === index && !(INPUT.questions ?? []).some(question => question.text === text));
  return `<div class="card review-strip ${missingNote.length || set.length < checks.filter(check => check.applies).length ? 'amber' : 'green'}">${missingNote.length || set.length < checks.filter(check => check.applies).length ? ICON.alert : ICON.good}<div><strong>${set.length} van ${checks.filter(check => check.applies).length} checks beoordeeld</strong><span>${missingNote.length ? `${missingNote.length} status(sen) zonder verplichte toelichting. ` : ''}Normen staan in <code>config/config.js</code> (NORMEN); waar een norm leeg is, doet Loanwise alleen een voorstel met de feiten. Er is geen eigen acceptatiebeleid ingebouwd.</span></div></div>
    ${groups.map(([title, items]) => card(title, '', table(['', 'Check en feiten', 'Voorstel', 'Status analist'], rows(items)))).join('')}
    ${card('Vragen aan de klant', `${(INPUT.questions ?? []).length} vragen`, `${questions ? table(['Vraag', 'Antwoord', 'Open', ''], questions) : ''}<div class="card-body inline-form"><input type="text" id="question-text" placeholder="Nieuwe vraag" aria-label="Nieuwe vraag" style="flex:1"><button type="button" class="btn-outline" data-action="question-add">Toevoegen</button></div>${suggestions.length ? `<div class="card-body suggestions"><span class="muted">Uit open meldingen:</span> ${suggestions.slice(0, 8).map(text => `<button type="button" class="btn-outline" data-action="question-suggest" data-text="${esc(text)}">+ ${esc(text)}</button>`).join(' ')}</div>` : ''}`)}
    ${card('Conclusie analist', 'Onderbouwde menselijke conclusie · Loanwise neemt geen kredietbesluit', `<div class="card-body"><textarea data-input-text="conclusion" rows="6" placeholder="Conclusie en motivering, inclusief afwijkingen van beleid" aria-label="Conclusie">${esc(INPUT.conclusion ?? '')}</textarea><label class="field-row">Tweede beoordelaar (vier ogen) <input type="text" data-input-text="secondReviewer" value="${esc(INPUT.secondReviewer ?? '')}" placeholder="Naam en datum" aria-label="Tweede beoordelaar"></label></div>`)}
    ${card('Audittrail', `${INPUT.audit.length} wijzigingen in dit dossier`, INPUT.audit.length ? table(['Tijdstip', 'Wijziging', 'Oud', 'Nieuw', 'Toelichting'], INPUT.audit.slice(0, 50).map(item => `<tr><td>${dateNl(item.at)} ${String(item.at).slice(11, 16)}</td><td>${esc(item.what)}</td><td>${esc(JSON.stringify(item.from))}</td><td>${esc(JSON.stringify(item.to))}</td><td>${esc(item.note)}</td></tr>`).join('')) : '<div class="card-body muted">Nog geen handmatige wijzigingen.</div>', 'Bewaard in deze browser (IndexedDB), samen met de besluiten per IBAN.')}`;
};

/* ---------- Conceptrapport ---------- */
function reportData() {
  const { Az, Ap, cap, risks: riskList, checks } = MODEL;
  const company = DOSSIER.company ?? {};
  return { Az, Ap, cap, riskList, checks, company };
}
RENDERERS.rapport = () => {
  if (!MODEL.Az) return noBusiness();
  const { Az, cap, riskList, checks, company } = reportData();
  const missing = riskList.filter(item => item.type === 'ontbreekt');
  const keyRisks = riskList.filter(item => item.ernst !== 'info').slice(0, 10);
  const deviations = checks.filter(check => check.status === 'voldoet_niet' || riskList.some(item => item.type === 'beleid'));
  const months = Az.MONTHS;
  const section = (title, body) => `<section class="report-section"><h3>${title}</h3>${body}</section>`;
  const kv = items => `<dl class="kv">${items.map(([key, value]) => `<dt>${key}</dt><dd>${value}</dd>`).join('')}</dl>`;
  const monthTable = table(['Maand', 'num:Omzet', 'num:Kosten', 'num:Operationeel', 'num:Draagkracht', 'num:Rente + aflossing'], months.map((key, index) => `<tr><td>${monthName(key)}</td><td class="num">${eur(Az.revenue[index] - Az.excludedRevenue[index])}</td><td class="num">${eur(Az.netCosts[index])}</td><td class="num">${eur(Az.operating[index])}</td><td class="num">${eur(Az.freeCash[index])}</td><td class="num">${eur(Az.debtService[index])}</td></tr>`).join(''));
  return `<div class="card report-actions"><div class="card-body inline-form"><button type="button" class="btn-primary" data-action="print">PDF (afdrukken)</button><button type="button" class="btn-outline" data-action="excel">Excel</button><span class="muted">Concept · ${dateNl(new Date().toISOString())} · alle bedragen herleidbaar naar de transacties in Loanwise</span></div></div>
    <div class="card report" id="report"><div class="card-body">
      <h2>Conceptbeoordeling zakelijk krediet · ${esc(company.name ?? DOSSIER.label)}</h2>
      <p class="muted">Concept opgesteld met Loanwise Zakelijk. Loanwise neemt geen kredietbesluit; de conclusie is van de analist.</p>
      ${section('1. Onderneming', kv([['Naam', esc(company.name ?? DOSSIER.label)], ['KvK', esc(company.kvkNumber ?? '-')], ['Rechtsvorm', esc(DOSSIER.legalForm)], ['Branche', `${esc(company.industryCode ?? '-')} ${esc(company.industryDescription ?? '')}`], ['Sinds', company.startDate ? dateNl(company.startDate) : '-'], ['Werkzame personen', company.numberOfEmployees ?? '-'], ['Leden', (DOSSIER.members ?? []).map(member => `${esc(memberName(member))} (${esc(member.role)})`).join(', ') || '-']]))}
      ${section('2. Beschikbare en ontbrekende gegevens', `${kv([['Periode', `${monthName(months[0])} – ${monthName(months.at(-1))} (${Az.dataMonths} maanden met data)`], ['Rekeningen', DOSSIER.accounts.map(account => `${esc(formatIban(account.iban))} ${account.role}${account.enabled === false ? ' (uit)' : ''}`).join('<br>')], ['Bron', `${esc(DOSSIER.source)}${hasE1() ? ', met E1-categorie als tweede mening' : ''}`]])}${missing.length ? `<ul>${missing.map(item => `<li>${esc(item.titel)}: ${esc(item.wat)}</li>`).join('')}</ul>` : '<p>Geen ontbrekende gegevens gesignaleerd.</p>'}`)}
      ${section('3. Financiële ontwikkeling', kv([['Omzet 12 maanden', eur(Az.revenue12)], ['Omzet per maand (12 / 3 mnd)', `${eur(Az.revenue12 / 12)} / ${eur(sum(Az.lastThree.map(index => Az.revenue[index] - Az.excludedRevenue[index])) / 3)}`], ['Kosten 12 maanden', eur(Az.costs12)], ['Grootste klant', Az.debtors[0] ? `${esc(Az.debtors[0].name ?? '(geen naam)')} ${pct(Az.debtors[0].total / Az.revenue12)}` : '-']]))}
      ${section('4. Kasstroomanalyse', `${kv([['Operationele kasstroom 12 mnd', eur(sum(Az.operating))], [`Aftrek ${esc(DOSSIER.legalForm)}`, Az.deductionLines.map(line => `${esc(line.label)} ${eur(sum(line.values))}`).join('<br>')], ['Draagkracht 12 mnd', `<b>${eur(sum(Az.freeCash))}</b>`]])}${monthTable}<p class="muted">Bankkasstroom, geen winst of EBITDA. Belastingen werkelijk betaald.</p>`)}
      ${section('5. Bestaande financiële verplichtingen', Az.obligations.length ? table(['Tegenpartij', 'Soort', 'num:Termijn', 'Laatste 6 mnd', 'Zekerheid'], Az.obligations.map(item => `<tr><td>${esc(item.name)}</td><td>${esc(item.group)}${item.arrangement ? ' · regeling' : ''}</td><td class="num">${eur(item.term)}</td><td class="mono">${item.marks.map(mark => (MARK[mark] ?? [mark])[0]).join(' ')}</td><td>${item.confidence}%</td></tr>`).join('')) : '<p>Geen terugkerende verplichtingen gevonden.</p>')}
      ${section('6. Indicatieve kredietcapaciteit', kv([['Aangevraagd', INPUT.loan.amount ? `${eur(INPUT.loan.amount)} · ${dec(INPUT.loan.rate ?? 0, 1)}% · ${INPUT.loan.months ?? '-'} mnd · ${esc(INPUT.loan.form)}` : 'niet ingevuld'], ['Draagkracht per maand', eur(cap.carrying)], ['Rente + aflossing bestaand / nieuw', `${eur(cap.debtBefore)} / ${eur(cap.newMonthly)}`], ['DSCR', `${fmtRatio(cap.dscrAfter)} (slechtste ${fmtRatio(cap.worst.dscr)}, beste ${fmtRatio(cap.best.dscr)})`], ['Scenario’s', Object.values(cap.scenarios).map(item => `${item.label}: ${fmtRatio(item.dscr)}, ruimte ${eur(item.room)}`).join('<br>')], ['Norm', NORMEN.dscrMinimum == null ? 'niet ingesteld' : `DSCR ≥ ${dec(NORMEN.dscrMinimum)}`]]))}
      ${section('7. Belangrijkste risico’s', keyRisks.length ? `<ul>${keyRisks.map(item => `<li><b>${esc(item.titel)}</b> (${RISK_TYPES[item.type].toLowerCase()}, zekerheid ${item.zekerheid}%, ${RISK_STATUS[item.state.status].toLowerCase()}): ${esc(item.wat)}${item.state.toelichting ? ` <i>Analist: ${esc(item.state.toelichting)}</i>` : ''}</li>`).join('')}</ul>` : '<p>Geen.</p>')}
      ${section('8. Afwijkingen', deviations.length ? `<ul>${checks.filter(check => check.status === 'voldoet_niet').map(check => `<li>${check.id} ${esc(check.titel)}: ${esc(check.toelichting || check.feiten)}</li>`).join('')}${riskList.filter(item => item.type === 'beleid').map(item => `<li>${esc(item.titel)}: ${esc(item.wat)}</li>`).join('')}</ul>` : '<p>Geen afwijkingen vastgesteld.</p>')}
      ${section('9. Aanvullende vragen', (INPUT.questions ?? []).length ? `<ul>${INPUT.questions.map(question => `<li>${esc(question.text)}${question.answer ? ` → ${esc(question.answer)}` : question.open ? ' (bewust open)' : ' (open)'}</li>`).join('')}</ul>` : '<p>Geen vragen vastgelegd.</p>')}
      ${section('10. Acceptatiechecklist', table(['Check', 'Voorstel', 'Analist'], checks.filter(check => check.applies).map(check => `<tr><td>${check.id} ${esc(check.titel)}</td><td>${CHECK_STATUS[check.voorstel]}</td><td>${check.status ? CHECK_STATUS[check.status] : '-'}${check.toelichting ? ` · ${esc(check.toelichting)}` : ''}</td></tr>`).join('')))}
      ${section('11. Conclusie analist', `<p class="conclusion">${esc(INPUT.conclusion || '(nog niet ingevuld)').replace(/\n/g, '<br>')}</p><p class="muted">Vier ogen: ${esc(INPUT.secondReviewer || '-')}</p>`)}
    </div></div>`;
};

/* Excel-export: SheetJS van cdnjs; lukt dat niet, dan CSV per blad */
async function exportExcel() {
  const { Az, cap, riskList, checks } = reportData();
  const sheets = {
    Samenvatting: [['Onderdeel', 'Waarde'], ['Dossier', DOSSIER.company?.name ?? DOSSIER.label], ['Rechtsvorm', DOSSIER.legalForm], ['Omzet 12 mnd', round2(Az.revenue12)], ['Operationele kasstroom 12 mnd', round2(sum(Az.operating))], ['Draagkracht 12 mnd', round2(sum(Az.freeCash))], ['Rente + aflossing bestaand /mnd', cap.debtBefore], ['Nieuwe maandlast', cap.newMonthly], ['DSCR', Number.isFinite(cap.dscrAfter) ? round2(cap.dscrAfter) : ''], ['Ruimte /mnd', cap.room], ['Conclusie', INPUT.conclusion ?? '']],
    Kasstroom: [['Post', ...Az.MONTHS], ...Az.cashLines.map(line => [line.label, ...line.values.map(value => line.sign * value)]), ['Operationele kasstroom', ...Az.operating], ...Az.deductionLines.map(line => [line.label, ...line.values.map(value => line.sign * value)]), ['Draagkracht', ...Az.freeCash], ['Rente + aflossing', ...Az.debtService]],
    Verplichtingen: [['Tegenpartij', 'Soort', 'Termijn', 'Gemist', 'Regeling', 'Zekerheid'], ...Az.obligations.map(item => [item.name, item.group, item.term, item.missed, item.arrangement ? 'ja' : '', item.confidence])],
    Risicos: [['Titel', 'Soort', 'Ernst', 'Wat', 'Onderzoeken', 'Zekerheid', 'Status', 'Toelichting'], ...riskList.map(item => [item.titel, RISK_TYPES[item.type], item.ernst, item.wat, item.onderzoek, item.zekerheid, item.state.status, item.state.toelichting])],
    Checklist: [['Id', 'Check', 'Voorstel', 'Feiten', 'Status analist', 'Toelichting'], ...checks.map(check => [check.id, check.titel, CHECK_STATUS[check.voorstel], check.feiten, check.status ? CHECK_STATUS[check.status] : '', check.toelichting])],
    Transacties: [['Datum', 'Rekening', 'Tegenpartij', 'Tegenrekening', 'Omschrijving', 'Bedrag', 'Regel', 'Kopje', 'Zekerheid', 'E1'], ...Az.rows.map(row => [row.date, row.account, row.name ?? '', row.counterAccount ?? '', row.description, row.amount, row.rule, RULES[row.rule - 1].name, row.confidence, row.e1?.category ?? ''])],
  };
  const name = `loanwise-${String(DOSSIER.company?.name ?? DOSSIER.label).replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`;
  try {
    if (!window.XLSX) await loadScript('https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js');
    const book = window.XLSX.utils.book_new();
    Object.entries(sheets).forEach(([title, rows]) => window.XLSX.utils.book_append_sheet(book, window.XLSX.utils.aoa_to_sheet(rows), title));
    window.XLSX.writeFile(book, `${name}.xlsx`);
  } catch {
    const csv = Object.entries(sheets).map(([title, rows]) => `${title}\n${rows.map(row => row.map(cell => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(';')).join('\n')}`).join('\n\n');
    const link = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([`﻿${csv}`], { type: 'text/csv' })), download: `${name}.csv` });
    link.click();
    showBanner('bad', 'Excel-lezer niet geladen', 'Geëxporteerd als CSV (puntkomma, opent in Excel).');
  }
}

/* ---------- Invoer en afhandeling ---------- */
const setPath = (object, path, value) => { const keys = path.split('.'); const last = keys.pop(); const target = keys.reduce((node, key) => node[key], object); const before = target[last]; target[last] = value; return before; };
const readNumber = (input, path) => { if (input.value === '') return null; const value = Number(input.value); return /^scenario\./.test(path) ? value / 100 : value; };
function changed(what, from, to, note) { audit(what, from, to, note); saveState(); renderAll(); }
function withFocusKept(callback) {
  const active = document.activeElement;
  const selector = active?.dataset && Object.keys(active.dataset).length ? `[data-${Object.keys(active.dataset)[0].replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`)}="${CSS.escape(Object.values(active.dataset)[0])}"]` : null;
  callback();
  if (selector) document.querySelector(selector)?.focus();
}
document.addEventListener('change', event => {
  const target = event.target, data = target.dataset;
  if (data.input) {
    const value = target.tagName === 'SELECT' ? target.value : readNumber(target, data.input);
    withFocusKept(() => { const before = setPath(INPUT, data.input, value); changed(`Invoer ${data.input}`, before, value); });
  } else if (data.inputText) { const before = INPUT[data.inputText]; INPUT[data.inputText] = target.value; changed(`Invoer ${data.inputText}`, before ? '(tekst)' : null, '(tekst)'); }
  else if (data.riskStatus || data.riskNote) {
    const id = data.riskStatus ?? data.riskNote;
    const state = INPUT.risks[id] ?? { status: 'open', toelichting: '' };
    const before = { ...state };
    if (data.riskStatus) state.status = target.value; else state.toelichting = target.value;
    INPUT.risks[id] = state;
    changed(`Melding ${id}`, before.status, state.status, state.toelichting);
  } else if (data.checkStatus || data.checkNote) {
    const id = data.checkStatus ?? data.checkNote;
    const state = INPUT.checklist[id] ?? { status: null, toelichting: '' };
    const before = state.status;
    if (data.checkStatus) state.status = target.value || null; else state.toelichting = target.value;
    INPUT.checklist[id] = state;
    changed(`Check ${id}`, before, state.status, state.toelichting);
  } else if (data.questionAnswer != null) { INPUT.questions[Number(data.questionAnswer)].answer = target.value; changed('Antwoord klant', null, target.value); }
  else if (data.questionOpen != null) { INPUT.questions[Number(data.questionOpen)].open = target.checked; changed('Vraag bewust open', !target.checked, target.checked); }
  else if (data.accountRole || data.accountOwner || data.accountConfirm) {
    const account = accountOf(data.accountRole ?? data.accountOwner ?? data.accountConfirm);
    if (data.accountRole) { const before = account.role; account.role = target.value; if (target.value === 'zakelijk') account.owner = 'onderneming'; else if (account.owner === 'onderneming') account.owner = DOSSIER.members?.[0]?.id ?? 'onderneming'; account.roleConfirmed = true; changed(`Rol ${formatIban(account.iban)}`, before, account.role); }
    else if (data.accountOwner) { const before = account.owner; account.owner = target.value; account.roleConfirmed = true; changed(`Eigenaar ${formatIban(account.iban)}`, before, account.owner); }
    else { account.roleConfirmed = target.checked; changed(`Rol bevestigd ${formatIban(account.iban)}`, !target.checked, target.checked); }
  } else if (target.dataset.legalForm != null) {
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
  switch (data.action) {
    case 'member-add': {
      const initials = document.getElementById('member-initials').value.trim(), surname = document.getElementById('member-surname').value.trim();
      if (!initials || !surname) return showBanner('bad', 'Lid niet toegevoegd', 'Vul initialen en achternaam in.');
      const member = { id: `m${Date.now().toString(36)}`, initials: initials.endsWith('.') ? initials : `${initials}.`, last_name: surname, role: document.getElementById('member-role').value, manual: true };
      DOSSIER.members = [...(DOSSIER.members ?? []), member];
      return changed('Lid toegevoegd', null, `${memberName(member)} (${member.role})`);
    }
    case 'extra-add': {
      const name = document.getElementById('extra-name').value.trim(), monthly = Number(document.getElementById('extra-monthly').value);
      if (!name || !(monthly > 0)) return showBanner('bad', 'Verplichting niet toegevoegd', 'Vul een naam en een bedrag per maand in.');
      INPUT.extraObligations.push({ name, monthly });
      return changed('Verplichting opgegeven', null, `${name} ${monthly}`);
    }
    case 'extra-remove': { const [item] = INPUT.extraObligations.splice(Number(data.index), 1); return changed('Verplichting verwijderd', item?.name, null); }
    case 'manual-add': {
      const titel = document.getElementById('manual-title').value.trim();
      if (!titel) return;
      INPUT.manualRisks = [...(INPUT.manualRisks ?? []), { id: `handmatig-${Date.now().toString(36)}`, titel, type: document.getElementById('manual-type').value, wat: titel, waarom: 'Bevinding van de analist.', onderzoek: '-' }];
      return changed('Bevinding toegevoegd', null, titel);
    }
    case 'question-add': case 'question-suggest': {
      const text = data.action === 'question-suggest' ? data.text : document.getElementById('question-text').value.trim();
      if (!text) return;
      INPUT.questions.push({ text, answer: '', open: false });
      return changed('Vraag toegevoegd', null, text);
    }
    case 'question-remove': { const [item] = INPUT.questions.splice(Number(data.index), 1); return changed('Vraag verwijderd', item?.text, null); }
    case 'check-accept': { const state = INPUT.checklist[data.id] ?? { status: null, toelichting: '' }; const before = state.status; state.status = data.value; INPUT.checklist[data.id] = state; return changed(`Check ${data.id}`, before, data.value, 'voorstel overgenomen'); }
    case 'print': document.body.classList.add('print-report'); window.print(); setTimeout(() => document.body.classList.remove('print-report'), 500); return;
    case 'excel': exportExcel(); return;
    default:
  }
});
window.addEventListener('afterprint', () => document.body.classList.remove('print-report'));
