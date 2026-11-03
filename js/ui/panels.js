'use strict';
/* ---------- Scorecard ---------- */
const tone = (value, good, warn, higherIsBetter = true) => !Number.isFinite(value) ? 'info' : higherIsBetter ? (value >= good ? 'good' : value >= warn ? 'warn' : 'bad') : (value <= good ? 'good' : value <= warn ? 'warn' : 'bad');
const isSoleTrader = () => /eenmanszaak|vof|v\.o\.f/.test(String(DOSSIER.legalForm).toLowerCase());
function scorecard() {
  const groups = [];
  const rule = id => A.byRule(id);
  const recent = rows => rows.filter(row => A.lastThree.includes(row.monthIndex));
  const plans = A.obligations.filter(item => item.arrangement);
  const missed = sum(A.obligations.map(item => item.missed));
  if (overlay !== 'prive') {
    const revenueChange = change3v12(A.revenue);
    const top = A.debtors[0];
    const topShare = top ? top.total / A.revenue12 : NaN;
    const band = bandwidth();
    const certainShare = band.revenue.max ? band.revenue.min / band.revenue.max : NaN;
    groups.push(['Omzet en klanten', [
      { name: 'Omzettrend', desc: 'Gemiddelde omzet per maand', basis: `3 mnd ${eur(last3(A.revenue) / 3)} · 12 mnd ${eur(A.revenue12 / 12)}`, value: signedPct(revenueChange), verdict: tone(revenueChange, -0.1, -0.25), button: viewButton('Omzet (regel 10)', rule(10)) },
      { name: 'Klantconcentratie', desc: `Grootste debiteur: ${top?.name ?? '-'}`, basis: `${eur(top?.total ?? 0)} van ${eur(A.revenue12)}`, value: pct(topShare), verdict: tone(topShare, 0.3, 0.5, false), button: top ? viewButton(top.name ?? '(geen naam)', top.rows) : '' },
      { name: 'Zekerheid omzet', desc: 'Deel van de omzet met zekerheid ≥ 70% of bevestigd', basis: `${eur(band.revenue.min)} zeker van ${eur(band.revenue.max)}`, value: pct(certainShare), verdict: tone(certainShare, 0.9, 0.75), button: goButton('controle') },
    ]]);
    const ownerNet12 = sum(A.ownerNet), result12 = sum(A.result);
    groups.push(['Kasstroom en schuld', [
      { name: overlay === 'zakelijk' && isSoleTrader() ? 'DSCR na privé-opnamen' : 'DSCR', desc: 'Kasstroom ÷ rente en aflossing', basis: overlay === 'zakelijk' && isSoleTrader() ? `${eur(sum(A.freeCash))} ÷ ${eur(sum(A.debtService))} · vóór opnamen ${dec(A.dscrBefore)}×` : `${eur(sum(A.freeCash))} ÷ ${eur(sum(A.debtService))}`, value: Number.isFinite(A.dscr) ? `${dec(A.dscr)}×` : 'geen schuld', verdict: Number.isFinite(A.dscr) ? dscrVerdict(A.dscr) : 'good', button: viewButton('Rente en aflossing', [...rule(6).filter(row => row.amount < 0), ...rule(5).filter(row => row.amount < 0 && /aflossing|lening/i.test(row.description) && row.role !== 'Eigenaar')]) },
      { name: 'Negatief saldo', desc: 'Dagen met een saldo onder nul', basis: `12 mnd ${A.negativeDays} dagen · laagste ${eur(Math.min(...A.balance))}`, value: pct(A.negativeDays / A.days.length), verdict: A.negativeDays === 0 ? 'good' : A.negativeDays / A.days.length < 0.1 ? 'warn' : 'bad', button: goButton('cashflow') },
      ...(overlay === 'zakelijk' && isSoleTrader() ? [{ name: 'Privé-opnamen', desc: 'Netto naar privé ÷ indicatief resultaat', basis: `${eur(ownerNet12)} ÷ ${eur(result12)}`, value: pct(result12 > 0 ? ownerNet12 / result12 : NaN), verdict: result12 <= 0 ? 'bad' : tone(ownerNet12 / result12, 0.8, 1, false), button: viewButton('Privé-opnamen en stortingen', rule(5).filter(row => ['Eigenaar'].includes(row.role))) }] : []),
    ]]);
    const vatRatio = sum(A.vatExpected) ? sum(A.vatPaid) / sum(A.vatExpected) : NaN;
    groups.push(['Belasting', [
      { name: 'Btw betaald vs. verwacht', desc: '(omzet − NL-inkoop) × 21/121', basis: `${eur(sum(A.vatPaid))} betaald · ${eur(sum(A.vatExpected))} verwacht`, value: pct(vatRatio), verdict: !Number.isFinite(vatRatio) ? 'info' : vatRatio >= 0.8 && vatRatio <= 1.2 ? 'good' : vatRatio >= 0.6 && vatRatio <= 1.4 ? 'warn' : 'bad', button: viewButton('Omzetbelasting', A.taxOf('ob').rows) },
      { name: 'Regelingen en naheffingen', desc: 'Gelijke termijnen zonder geldig kenmerk, of naheffing', basis: plans.filter(item => item.rule === 3).length ? plans.filter(item => item.rule === 3).map(item => `${eur(item.term)}/mnd`).join(', ') : 'niet gevonden', value: `${plans.filter(item => item.rule === 3).length + A.taxRows.filter(row => row.tax.kind === 'Naheffing').length}`, verdict: A.taxRows.some(row => row.tax.kind === 'Naheffing') ? 'bad' : plans.some(item => item.rule === 3) ? 'warn' : 'good', button: goButton('belasting') },
    ]]);
  }
  const reversals = rule(2), bailiffs = rule(4);
  groups.push(['Betaalgedrag', [
    { name: 'Terugboekingen', desc: 'Incasso’s die de bank terugboekte', basis: `3 mnd ${recent(reversals).length} · 12 mnd ${reversals.length}`, value: `${recent(reversals).length}`, verdict: recent(reversals).length === 0 ? (reversals.length ? 'warn' : 'good') : recent(reversals).length === 1 ? 'warn' : 'bad', button: viewButton('Terugboekingen (regel 2)', reversals) },
    { name: 'Deurwaarders en incasso', desc: 'Betalingen aan deurwaarders', basis: `3 mnd ${recent(bailiffs).length} · 12 mnd ${bailiffs.length} · ${eur(outflow(bailiffs))}`, value: `${bailiffs.length}`, verdict: bailiffs.length ? 'bad' : 'good', button: viewButton('Deurwaarders (regel 4)', bailiffs) },
    { name: 'Gemiste termijnen', desc: 'Vaste lasten, laatste 6 maanden', basis: `${A.obligations.filter(item => item.missed).map(item => item.name).join(', ') || 'geen'}`, value: `${missed}`, verdict: missed === 0 ? 'good' : missed <= 2 ? 'warn' : 'bad', button: goButton('verplichtingen') },
  ]]);
  if (overlay !== 'zakelijk') {
    const gambling = A.rows.filter(row => row.signal === 'gokken'), crypto = A.rows.filter(row => row.signal === 'crypto');
    const gamblingChange = change3v12(A.monthly(gambling, row => -row.amount));
    const fixedPrivate = sum(A.obligations.filter(item => item.rows.some(row => accountOf(row.account)?.role === 'prive')).map(item => item.term));
    const incomePrivate = (sum(A.ownerIn) + sum(A.series[10].in) + sum(A.series[8].in)) / 12;
    groups.push(['Privé (E1-profiel retail)', [
      { name: 'Gokken', desc: 'Casino, toto en loterijen', basis: `3 mnd ${eur(outflow(recent(gambling)))} · 12 mnd ${eur(outflow(gambling))}`, value: gambling.length ? signedPct(gamblingChange) : '0', verdict: gambling.length ? (outflow(recent(gambling)) / 3 >= 100 || gamblingChange > 0.25 ? 'bad' : 'warn') : 'good', button: viewButton('Gokken', gambling) },
      { name: 'Crypto', desc: 'Aankopen bij cryptobeurzen', basis: `12 mnd ${crypto.length}× · ${eur(outflow(crypto))}`, value: `${crypto.length}`, verdict: crypto.length ? 'warn' : 'good', button: viewButton('Crypto', crypto) },
      ...(overlay === 'prive' ? [{ name: 'Vaste lasten privé', desc: 'Terugkerende lasten ÷ inkomen per maand', basis: `${eur(fixedPrivate)} ÷ ${eur(incomePrivate)}`, value: pct(incomePrivate ? fixedPrivate / incomePrivate : NaN), verdict: tone(incomePrivate ? fixedPrivate / incomePrivate : NaN, 0.5, 0.7, false), button: goButton('verplichtingen') }] : []),
    ]]);
  }
  return groups;
}
function scorecardCard() {
  const groups = scorecard();
  const counts = { good: 0, warn: 0, bad: 0 };
  groups.forEach(([, items]) => items.forEach(item => { if (counts[item.verdict] != null) counts[item.verdict] += 1; }));
  return `<div class="card">
    <div class="card-head"><div><h2>Scorecard</h2><p class="sub">${weergaveLabel()} · basis: laatste 3 maanden (${window3Label()}) naast 12 maanden</p></div>${legend([[`${counts.good} goed`, 'var(--green)'], [`${counts.warn} matig`, 'var(--amber-icon)'], [`${counts.bad} slecht`, 'var(--red-icon)']])}</div>
    <div class="sc-head"><span></span><span>Indicator</span><span>Basis</span><span>Waarde</span><span>Oordeel</span><span></span></div>
    ${groups.map(([title, items]) => `<div class="sc-group"><div class="sc-group-title">${title}</div>${items.map(item => `<div class="sc-row">${ICON[item.verdict]}<div class="sc-name">${item.name}<span>${item.desc}</span></div><div class="sc-basis">${item.basis}</div><div class="sc-value">${item.value}</div><div>${chip(item.verdict)}</div>${item.button}</div>`).join('')}</div>`).join('')}
    <div class="source">Elke indicator volgt uit vaste regels op de transacties; <b>bekijken</b> toont de onderliggende transacties met controle-som. Grenzen: DSCR 1,25 / 1,0 · omzettrend −10% / −25% · concentratie 30% / 50% · btw 80–120%.</div>
  </div>`;
}
const tile = (label, value, unit, sub) => `<div class="tile"><span class="tile-label">${label}</span><span class="tile-value">${value}${unit ? `<small>${unit}</small>` : ''}</span><span class="tile-sub">${sub}</span></div>`;
function reviewStrip() {
  if (overlay === 'prive') return '';
  const state = reviewState();
  return `<div class="card review-strip ${state.needed ? 'amber' : 'green'}">${state.needed ? ICON.alert : ICON.good}
    <div><strong>${state.needed ? `Controle nodig: ${state.open.length} tegenpartijen, ${eur(state.band.revenue.uncertain + state.band.costs.uncertain)} onzeker` : 'Geen controle nodig'}</strong><span>${reviewSummaryText(state)}</span></div>
    ${goButton('controle', state.needed ? 'controleren' : 'bekijken')}</div>`;
}
function reviewSummaryText(state) {
  const show = value => Number.isFinite(value) ? `${dec(value)}× (${VERDICT_LABEL[dscrVerdict(value)]})` : 'geen schuld';
  return state.needed ? `Met alleen zekere omzet is de DSCR ${show(state.worst)}, met alle omzet ${show(state.best)}. De onzekerheid kan het oordeel laten omslaan.` : `Slechtste geval DSCR ${show(state.worst)}, beste geval ${show(state.best)}: de onzekerheid verandert het oordeel niet.`;
}
RENDERERS.overzicht = () => {
  const tiles = overlay === 'prive'
    ? [tile('Inkomsten 12 mnd', eur(sum(A.ownerIn) + sum(A.series[10].in) + sum(A.series[8].in)), '', `waarvan uit eigen onderneming <b>${eur(sum(A.ownerIn))}</b>`),
      tile('Uitgaven 12 mnd', eur(A.costs12), '', `per maand <b>${eur(A.costs12 / 12)}</b>`),
      tile('Saldo nu', eur(A.balance.at(-1)), '', `negatief op <b>${A.negativeDays}</b> dagen`),
      tile('Vaste lasten', eur(sum(A.obligations.map(item => item.term))), '/mnd', `${A.obligations.length} terugkerende posten`)]
    : [tile('Omzet 12 mnd', eur(A.revenue12), '', `gem. <b>${eur(A.revenue12 / 12)}</b>/mnd · 3 mnd <b>${eur(last3(A.revenue) / 3)}</b>/mnd`),
      tile('Kosten 12 mnd', eur(A.costs12), '', `crediteuren · ${pct(A.costs12 / A.revenue12)} van de omzet`),
      tile(overlay === 'zakelijk' && isSoleTrader() ? 'Vrije kasstroom na opnamen' : 'Kasstroom voor schuld', eur(sum(A.freeCash)), '', `rente + aflossing <b>${eur(sum(A.debtService))}</b> · DSCR <b>${Number.isFinite(A.dscr) ? `${dec(A.dscr)}×` : '-'}</b>`),
      tile('Saldo nu', eur(A.balance.at(-1)), '', `${A.visibleAccounts.length} rekening(en) · negatief op <b>${A.negativeDays}</b> dagen`)];
  const inSeries = overlay === 'prive' ? MONTHS_SUM([A.ownerIn, A.series[10].in, A.series[8].in]) : A.revenue;
  return `${reviewStrip()}
    <div class="card"><div class="tiles" style="border-top:0">${tiles.join('')}</div></div>
    ${scorecardCard()}
    ${card(overlay === 'prive' ? 'Inkomsten en uitgaven per maand' : 'Omzet en kosten per maand', `${windowLabel()} · lijn = ${overlay === 'prive' ? 'saldo inkomsten − uitgaven' : 'kasstroom voor schuld'}`,
      `<div class="card-body scroll-x">${barChart([{ label: overlay === 'prive' ? 'Inkomsten' : 'Omzet', color: SERIES_COLORS.revenue, values: inSeries }, { label: overlay === 'prive' ? 'Uitgaven' : 'Kosten', color: SERIES_COLORS.costs, values: A.netCosts }], { line: { label: overlay === 'prive' ? 'Saldo' : 'Kasstroom', color: 'var(--amber-icon)', values: overlay === 'prive' ? inSeries.map((value, index) => round2(value - A.netCosts[index])) : A.operating } })}</div>`,
      `<b>Herleiding:</b> ${overlay === 'prive' ? `inkomsten = ${ruleRef(10)} + ${ruleRef(8)} + ontvangsten van de eigen onderneming (${ruleRef(5)}); uitgaven = ${ruleRef(11)}.` : `omzet = ${ruleRef(10)}, kosten = ${ruleRef(11)} min retouren. Kasstroom = omzet − kosten − lonen − bankkosten − verwachte btw − loonheffing.`}`,
      legend([[overlay === 'prive' ? 'Inkomsten' : 'Omzet', SERIES_COLORS.revenue], [overlay === 'prive' ? 'Uitgaven' : 'Kosten', SERIES_COLORS.costs]]))}`;
};
const MONTHS_SUM = list => A.MONTHS.map((key, index) => round2(sum(list.map(values => values[index]))));

/* ---------- Controle ---------- */
const sideLabel = side => side === 'debtor' ? 'Debiteur' : 'Crediteur';
function automaticControls() {
  const checks = dossierChecks().filter(check => A.visibleAccounts.includes(check.account));
  const references = A.taxRows.filter(row => row.tax.reference && row.tax.valid !== null);
  const invalid = references.filter(row => !row.tax.valid);
  const oldIban = A.taxRows.filter(row => row.counterAccount === TAX_AUTHORITY_IBANS[0] && row.date >= TAX_IBAN_SWITCH);
  const uncategorized = A.byRule(12);
  const uncategorizedShare = sum(uncategorized.map(row => Math.abs(row.amount))) / Math.max(1, sum(A.rows.map(row => Math.abs(row.amount))));
  const e1Rows = A.rows.filter(row => row.e1);
  const disagree = e1Rows.filter(row => row.e1Agree === false);
  const received = receivedAnalysis();
  const generalOk = received ? Math.abs((received.generalInfo?.totalInflow ?? 0) - inflow(A.rows)) < 1 && Math.abs((received.generalInfo?.totalOutflow ?? 0) - outflow(A.rows)) < 1 : null;
  const unshared = [...new Set(A.byRule(1).filter(row => row.unshared && row.counterAccount).map(row => row.counterAccount))];
  const costShare = A.costs12 / A.revenue12;
  const vatRatio = sum(A.vatExpected) ? sum(A.vatPaid) / sum(A.vatExpected) : NaN;
  return [
    { name: 'Saldo sluit aan', note: 'laatste saldo na transactie = saldo van de rekening', norm: 'gelijk', value: checks.map(check => `${check.account.iban.slice(-4)} ${check.balanceOk ? '✓' : '✕'}`).join(' · '), status: checks.every(check => check.balanceOk) ? 'good' : 'bad' },
    { name: 'Beginsaldo + Σ = eindsaldo', note: 'per transactie doorgerekend', norm: '0 breuken', value: `${sum(checks.map(check => check.runningBreaks))} breuken`, status: checks.every(check => !check.runningBreaks) ? 'good' : 'bad', view: ['Alle transacties', A.rows] },
    { name: 'Σ in/uit = generalInfo', note: 'analyse-JSON van Enable Now', norm: 'gelijk', value: generalOk === null ? (overlay === 'samen' ? 'n.v.t. in Samen' : 'geen analyse-JSON') : generalOk ? `${eur(inflow(A.rows))} / ${eur(-outflow(A.rows))} ✓` : 'wijkt af', status: generalOk === null ? 'pending' : generalOk ? 'good' : 'bad' },
    { name: 'Controlecijfer betalingskenmerken', note: 'modulus 11 (OB, LH, IB, Zvw, Vpb)', norm: 'alle geldig', value: `${references.length - invalid.length} van ${references.length} geldig`, status: invalid.length ? 'warn' : references.length ? 'good' : 'pending', view: invalid.length ? ['Ongeldige kenmerken', invalid] : null },
    { name: 'Oude IBAN Belastingdienst', note: `na ${dateNl(TAX_IBAN_SWITCH)} nog naar ${formatIban(TAX_AUTHORITY_IBANS[0])}`, norm: '0', value: `${oldIban.length}`, status: oldIban.length ? 'warn' : 'good', view: oldIban.length ? ['Betalingen naar oude IBAN', oldIban] : null },
    { name: 'Ongecategoriseerd', note: 'regel 12, aandeel van alle bedragen', norm: '≤ 2%', value: `${uncategorized.length}× · ${pct(uncategorizedShare, 1)}`, status: uncategorizedShare <= 0.02 ? 'good' : 'warn', view: uncategorized.length ? ['Ongecategoriseerd (regel 12)', uncategorized] : null },
    { name: 'E1 wijkt af van eigen regel', note: 'Enable Now als tweede mening', norm: 'ter info', value: e1Rows.length ? `${disagree.length} van ${e1Rows.length} · ${eur(sum(disagree.map(row => Math.abs(row.amount))))}` : 'geen E1 in data', status: !e1Rows.length ? 'pending' : disagree.length ? 'warn' : 'good', view: disagree.length ? ['E1 wijkt af', disagree] : null },
    { name: 'Niet-gedeelde eigen rekening', note: 'tegenrekening op naam van de klant', norm: 'alles gedeeld', value: unshared.length ? unshared.map(maskIban).join(', ') : 'geen', status: unshared.length ? 'warn' : 'good', view: unshared.length ? ['Naar niet-gedeelde eigen rekening', A.byRule(1).filter(row => row.unshared)] : null },
    ...(overlay !== 'prive' ? [
      { name: 'Btw betaald vs. verwacht', note: '(omzet − NL-inkoop) × 21/121', norm: '80–120%', value: pct(vatRatio), status: !Number.isFinite(vatRatio) ? 'pending' : vatRatio >= 0.8 && vatRatio <= 1.2 ? 'good' : 'warn', go: 'belasting' },
      { name: 'Kostenquote', note: 'crediteuren ÷ omzet', norm: '15–60%', value: pct(costShare), status: costShare >= 0.15 && costShare <= 0.6 ? 'good' : 'warn', go: 'kosten' },
    ] : []),
  ];
}
const CONTROL_STATUS = { good: ['good', 'In orde'], warn: ['warn', 'Let op'], bad: ['bad', 'Alarm'], pending: ['', 'Wacht op data'] };
const entityChip = entity => entity.decision ? `<span class="chip ${entity.decision === 'yes' ? 'good' : ''}">${entity.decision === 'yes' ? 'Bevestigd' : entity.side === 'debtor' ? 'Geen omzet' : 'Geen kosten'}</span>` : `<span class="chip ${entity.score >= CONFIDENCE.categoryThreshold ? 'good' : entity.score >= CONFIDENCE.threshold ? 'warn' : 'bad'}" title="${esc(entity.signals.map(([text, points]) => `${points > 0 ? '+' : ''}${points} ${text}`).join(' · '))}">${entity.score}%</span>`;
RENDERERS.controle = () => {
  const state = reviewState();
  const decided = [...A.debtors, ...A.creditors].filter(entity => entity.decision);
  const openRows = state.open.map(entity => {
    const reasons = entity.signals.filter(([, points]) => points < 0).map(([text]) => text);
    if (!entity.signals.some(([text]) => text.startsWith('Factuur'))) reasons.push('geen factuurverwijzing');
    if (!entity.signals.some(([text]) => text.startsWith('Terugkerend'))) reasons.push('eenmalig');
    if (entity.rows.some(row => row.e1) && !entity.signals.some(([text]) => text.startsWith('E1'))) reasons.push(`E1-zekerheid ${dec(sum(entity.rows.map(row => row.e1?.confidence ?? 0)) / entity.rows.length)}`);
    return `<tr><td><b>${esc(entity.name ?? '(geen naam)')}</b><span class="muted">${sideLabel(entity.side)} · ${esc(maskIban(entity.iban))}</span></td><td>${entityChip(entity)}</td><td class="reasons">${reasons.join(' · ')}</td><td class="num">${eur(entity.total)}</td>
      <td class="action"><div class="decide"><button type="button" class="btn-decide yes" data-decide="yes" data-side="${entity.side}" data-key="${esc(entity.key)}">${entity.side === 'debtor' ? 'Is omzet' : 'Is kosten'}</button><button type="button" class="btn-decide" data-decide="no" data-side="${entity.side}" data-key="${esc(entity.key)}">${entity.side === 'debtor' ? 'Geen omzet' : 'Geen kosten'}</button>${viewButton(entity.name ?? '(geen naam)', entity.rows)}</div></td></tr>`;
  }).join('');
  const categories = categoryConfidence();
  const controls = automaticControls();
  const feedbackExample = decided.find(entity => entity.rows.some(row => row.e1)) ?? state.open.find(entity => entity.rows.some(row => row.e1));
  const feedbackRow = feedbackExample?.rows.find(row => row.e1);
  return `<div class="card review-strip ${state.needed ? 'amber' : 'green'}">${state.needed ? ICON.alert : ICON.good}<div><strong>${state.needed ? 'Controle nodig' : 'Geen controle nodig'}</strong><span>${reviewSummaryText(state)}${state.needed ? ' Beoordeel hieronder, grootste bedrag eerst; stop zodra deze melding groen wordt.' : ''}</span></div></div>
    <div class="card"><div class="figures">
      <div class="figure"><b>${eur(state.band.revenue.min)}</b><span>omzet zeker, 12 mnd</span></div>
      <div class="figure"><b class="amber">${eur(state.band.revenue.uncertain)}</b><span>omzet onzeker · ${pct(state.band.revenue.uncertain / state.band.revenue.max)}</span></div>
      <div class="figure"><b>${eur(state.band.costs.uncertain)}</b><span>kosten onzeker</span></div>
      <div class="figure"><b class="${dscrVerdict(state.worst) === 'bad' ? 'negative' : ''}">${dec(state.worst)}× – ${dec(state.best)}×</b><span>DSCR slechtste – beste geval</span></div></div>
      <div class="source"><b>Slechtste geval:</b> alleen zekere omzet en alle kosten. <b>Beste geval:</b> alle omzet en alleen zekere kosten. “Zeker” = ≥ ${CONFIDENCE.threshold}% of bevestigd. Alleen tegenpartijen op zakelijke rekeningen worden beoordeeld; een besluit geldt per IBAN.</div></div>
    ${card('Te beoordelen', state.open.length ? `${state.open.length} tegenpartijen onder ${CONFIDENCE.threshold}% · grootste bedrag eerst` : 'Alles is beoordeeld of zeker genoeg',
      `${state.open.length ? table(['Tegenpartij', 'Zekerheid', 'Waarom onzeker', 'num:12 mnd', ''], openRows) : ''}${decided.length ? table(['Beoordeeld', 'Besluit', 'num:12 mnd', ''], decided.map(entity => `<tr><td>${esc(entity.name ?? '(geen naam)')}<span class="muted">${sideLabel(entity.side)}</span></td><td>${entityChip(entity)}</td><td class="num">${eur(entity.total)}</td><td class="action"><button type="button" class="btn-outline" data-decide="reset" data-side="${entity.side}" data-key="${esc(entity.key)}">Herstel</button></td></tr>`).join('')) : ''}`,
      `Een besluit rekent de hele analyse direct opnieuw: omzet, btw-verwachting, resultaat, DSCR en scorecard.${hasE1() ? ` <b>Terugmelden aan Enable Now (concept):</b> een correctie kan als <code>POST /v2/categorization-feedback</code> terug, zodat E1 ervan leert.` : ''}`)}
    ${feedbackRow ? `<div class="card"><details class="how" style="margin:0;padding:14px 24px"><summary>Voorbeeld feedback-call voor ${esc(feedbackExample.name ?? 'deze tegenpartij')}</summary><pre class="json">${esc(JSON.stringify({ transactionId: feedbackRow.id, engine: 'e1', previousCategory: feedbackRow.e1.category, category: feedbackExample.decision === 'no' ? 'other.other' : feedbackExample.side === 'debtor' ? 'income.other' : 'expense.other', source: 'analyst', reason: 'Loanwise-controle' }, null, 2))}</pre></details></div>` : ''}
    ${card('Zekerheid per kopje', 'Gewogen naar bedrag · streep = drempel', `<div class="confidence-bars">${categories.map(category => `<button type="button" class="confidence-row" data-view="${VIEWS.push({ title: `${category.label} (regel ${category.id})`, rows: A.byRule(category.id) }) - 1}"><span class="name">${ruleRef(category.id)}</span><span class="bar"><span class="fill ${category.score >= category.threshold ? 'ok' : 'low'}" style="width:${category.score}%"></span><span class="mark" style="left:${category.threshold}%"></span></span><span class="value">${Math.round(category.score)}%</span><span class="chip ${category.score >= category.threshold ? 'good' : 'warn'}">${category.score >= category.threshold ? 'Boven' : 'Onder'} ${category.threshold}%</span></button>`).join('')}</div>`,
      `Drempel ${CONFIDENCE.categoryThreshold}%; ${CONFIDENCE.criticalThreshold}% voor belasting, financiering en verbonden partijen. Vaste regels krijgen hun betrouwbaarheid (bv. eigen rekening 99%, familie ${CONFIDENCE.related}%); E1 telt mee: +5 als E1 overeenkomt, −10 als E1 afwijkt.`)}
    ${card('Automatische controles', 'Draaien na elke analyse en na elke wijziging; alleen een afwijking vraagt aandacht', table(['Controle', 'Norm', 'Uitkomst', 'Status', ''], controls.map(control => `<tr><td><b>${control.name}</b><span class="muted">${control.note}</span></td><td><span class="muted">${control.norm}</span></td><td>${control.value}</td><td><span class="chip ${CONTROL_STATUS[control.status][0]}">${CONTROL_STATUS[control.status][1]}</span></td><td class="action">${control.view ? viewButton(control.view[0], control.view[1]) : control.go ? goButton(control.go) : ''}</td></tr>`).join('')))}
    ${card('Rekenregel zekerheid', `Voor debiteuren en crediteuren · maximaal ${CONFIDENCE.cap}%; bevestigd = 100%`, table(['Signaal', 'num:Punten'], CONFIDENCE_SIGNALS.map(([text, points]) => `<tr><td>${text}</td><td class="num ${points < 0 ? 'negative' : ''}">${text === 'Basis' ? points : `${points > 0 ? '+' : ''}${points}`}</td></tr>`).join('')),
      '<b>Bijstellen zonder AI:</b> per signaal telt Loanwise hoe vaak analisten corrigeren. Betrouwbaarheid van een signaal = 1 − correcties ÷ toepassingen; daarmee worden de punten periodiek bijgesteld. E1 is een tweede mening: Loanwise kan niet aannemen dat E1 hetzelfde indeelt als de eigen regels.')}`;
};

/* ---------- Omzet / inkomsten ---------- */
function accountRevenueCard() {
  const accounts = A.visibleAccounts;
  const rows = accounts.map(account => {
    const own = A.rows.filter(row => row.account === account.iban && row.amount > 0);
    const revenue = own.filter(row => row.rule === 10 && decisions[decisionKey('debtor', row.key)] !== 'no');
    const internal = own.filter(row => row.rule === 1);
    const other = own.filter(row => ![1, 10].includes(row.rule) || decisions[decisionKey('debtor', row.key)] === 'no');
    return `<tr><td><span class="mono">${esc(formatIban(account.iban))}</span><span class="muted">${esc(account.bank ?? '')} · ${esc(account.name)}</span></td><td><span class="chip outline">${account.kind}</span></td>
      <td class="num">${eur(inflow(own))}</td><td class="num">${internal.length ? eur(-inflow(internal)) : '-'}</td><td class="num">${other.length ? eur(-inflow(other)) : '-'}</td><td class="num"><b>${eur(inflow(revenue))}</b></td><td class="num">${eur(inflow(revenue) / 12)}</td>
      <td class="action">${viewButton(`Bijschrijvingen ${formatIban(account.iban)}`, own)}</td></tr>`;
  }).join('');
  const excluded = A.rows.filter(row => row.amount > 0 && row.rule !== 10);
  const byExcludedRule = [...groupBy(excluded, row => row.rule).entries()].sort((first, second) => inflow(second[1]) - inflow(first[1]));
  return `${card('Omzet per rekening', `${windowLabel()} · bijschrijvingen min alles wat geen omzet is`,
    table(['Rekening', 'Soort', 'num:Bijschrijvingen', 'num:− Eigen rekening', 'num:− Overig (geen omzet)', 'num:= Omzet', 'num:Per maand', ''], rows),
    `<b>Herleiding:</b> per <code>account_number</code> telt alleen ${ruleRef(10)} als omzet. Overboekingen tussen eigen rekeningen (${ruleRef(1)}) tellen nooit, ook niet naar een niet-gedeelde spaarrekening. Zet bij Interne transacties <b>Inclusief</b> om ze in de cashflow te zien; de omzet verandert daar niet door.`)}
    ${card('Wat niet als omzet telt', 'Bijschrijvingen die door een eerdere regel zijn afgevangen', `<div class="excluded">${byExcludedRule.map(([rule, list]) => `<div class="excluded-row"><div><b>${ruleRef(Number(rule))}</b><span class="why">${list.length} bijschrijvingen · ${[...new Set(list.map(row => row.name ?? '(geen naam)'))].slice(0, 4).map(esc).join(', ')}</span></div><div class="decide"><b>${eur(inflow(list))}</b>${viewButton(ruleName(Number(rule)), list)}</div></div>`).join('') || '<div class="card-body">Geen.</div>'}</div>`)}`;
}
RENDERERS.omzet = () => {
  if (overlay === 'prive') {
    const income = A.rows.filter(row => row.amount > 0);
    const groups = [...groupBy(income, row => row.rule === 5 ? 'Uit eigen onderneming' : row.e1 ? e1Label(row.e1.category) : ruleName(row.rule)).entries()].sort((first, second) => inflow(second[1]) - inflow(first[1]));
    return card('Inkomsten privé', windowLabel(), table(['Soort', 'num:Aantal', 'num:12 mnd', 'num:Per maand', 'Verloop', ''], groups.map(([label, list]) => `<tr><td>${esc(label)}</td><td class="num">${list.length}</td><td class="num">${eur(inflow(list))}</td><td class="num">${eur(inflow(list) / 12)}</td><td>${sparkBars(A.monthly(list))}</td><td class="action">${viewButton(label, list)}</td></tr>`).join('')), 'Privé-opnamen uit de onderneming zijn hier inkomsten; in Samen vallen ze weg als interne overboeking.');
  }
  const debtorRows = A.debtors.map(entity => `<tr><td><b>${esc(entity.name ?? '(geen naam)')}</b><span class="muted mono">${esc(maskIban(entity.iban))}</span></td><td>${LEGAL_FORM_PATTERN.test(entity.name ?? '') ? 'Zakelijk' : entity.name ? 'Particulier' : '-'}</td><td class="num">${entity.count}</td><td>${sparkBars(entity.months, 'var(--primary)')}</td><td class="num">${eur(entity.total)}</td><td class="num">${pct(entity.total / A.revenue12)}</td><td>${entityChip(entity)}</td><td class="action">${viewButton(entity.name ?? '(geen naam)', entity.rows)}</td></tr>`).join('');
  const b2b = A.debtors.filter(entity => LEGAL_FORM_PATTERN.test(entity.name ?? ''));
  return `${card('Omzet per maand', `${windowLabel()} · 3 mnd vs 12 mnd: ${signedPct(change3v12(A.revenue))}`, `<div class="card-body scroll-x">${barChart([{ label: 'Omzet', color: SERIES_COLORS.revenue, values: A.revenue }])}</div>`, `<b>Herleiding:</b> som van ${ruleRef(10)} per maand. ${eur(A.revenue12)} over 12 maanden, waarvan ${pct(sum(b2b.map(entity => entity.total)) / A.revenue12)} van zakelijke klanten.`)}
    ${accountRevenueCard()}
    ${card('Debiteuren', `${A.debtors.length} tegenpartijen · per IBAN, anders per naam`, table(['Debiteur', 'Soort', 'num:Aantal', 'Verloop', 'num:12 mnd', 'num:Aandeel', 'Zekerheid', ''], debtorRows, `<tr><td colspan="4">Totaal</td><td class="num">${eur(sum(A.debtors.map(entity => entity.total)))}</td><td class="num">100%</td><td colspan="2"></td></tr>`), 'Zekerheid = rekenregel op vaste signalen (zie Controle). Wijs over de muis een percentage aan voor de signalen.')}`;
};

/* ---------- Kosten / uitgaven ---------- */
RENDERERS.kosten = () => {
  const outgoing = A.rows.filter(row => row.amount < 0 && (includeInternal || row.rule !== 1));
  const byRule = RULE_ORDER.map(id => [id, outgoing.filter(row => row.rule === id)]).filter(([, list]) => list.length);
  const totalOut = outflow(outgoing);
  const structure = table(['Kopje', 'num:Aantal', 'Verloop', 'num:12 mnd', 'num:Per maand', 'num:Aandeel', ''], byRule.map(([id, list]) => `<tr><td>${ruleRef(id)}</td><td class="num">${list.length}</td><td>${sparkBars(A.monthly(list, row => -row.amount))}</td><td class="num">${eur(outflow(list))}</td><td class="num">${eur(outflow(list) / 12)}</td><td class="num">${pct(outflow(list) / totalOut)}</td><td class="action">${viewButton(ruleName(id), list)}</td></tr>`).join(''), `<tr><td>Totaal afschrijvingen</td><td class="num">${outgoing.length}</td><td></td><td class="num">${eur(totalOut)}</td><td class="num">${eur(totalOut / 12)}</td><td class="num">100%</td><td></td></tr>`);
  const creditorRows = A.creditors.map(entity => `<tr><td><b>${esc(entity.name ?? '(geen naam)')}</b><span class="muted mono">${esc(maskIban(entity.iban))}</span></td><td>${entity.rows.find(row => row.e1) ? esc(e1Label(entity.rows.find(row => row.e1).e1.category)) : '-'}</td><td class="num">${entity.count}</td><td>${sparkBars(entity.months)}</td><td class="num">${eur(sum(entity.months))}</td><td>${entityChip(entity)}</td><td class="action">${viewButton(entity.name ?? '(geen naam)', entity.rows)}</td></tr>`).join('');
  return `${card(overlay === 'prive' ? 'Uitgaven per kopje' : 'Kostenstructuur', `${windowLabel()} · alle afschrijvingen${includeInternal ? ', inclusief interne' : ', exclusief interne'}`, structure, `<b>Herleiding:</b> afschrijvingen per regel. ${overlay === 'prive' ? '' : `Kosten in de analyse = ${ruleRef(11)} min retouren (${eur(A.costs12)}); lonen, belasting en financiering staan apart.`}`)}
    ${card(overlay === 'prive' ? 'Uitgaven per tegenpartij' : 'Crediteuren', `${A.creditors.length} tegenpartijen · ${ruleRef(11)}`, table(['Tegenpartij', 'E1-categorie', 'num:Aantal', 'Verloop', 'num:12 mnd', 'Zekerheid', ''], creditorRows))}`;
};

/* ---------- Resultaat (indicatief, kasbasis) ---------- */
RENDERERS.resultaat = () => {
  const windows = [['Laatste maand', [11]], ['3 maanden', [9, 10, 11]], ['6 maanden', [6, 7, 8, 9, 10, 11]], ['12 maanden', A.MONTHS.map((key, index) => index)]];
  const valueIn = (values, indexes) => sum(indexes.map(index => values[index]));
  const rows = A.resultLines.map(line => `<tr><td>${line.sign < 0 ? '− ' : ''}${line.label}<span class="muted">${line.how}</span></td>${windows.map(([, indexes]) => `<td class="num">${eur(valueIn(line.values, indexes))}</td>`).join('')}</tr>`).join('');
  return `${card('Indicatief fiscaal resultaat', 'Kasbasis: betaald en ontvangen in de maand · geen afschrijvingen, voorraad of overlopende posten', table(['Post', ...windows.map(([label]) => `num:${label}`)], rows, `<tr><td>= Resultaat</td>${windows.map(([, indexes]) => `<td class="num">${eur(valueIn(A.result, indexes))}</td>`).join('')}</tr><tr><td>Per maand</td>${windows.map(([, indexes]) => `<td class="num">${eur(valueIn(A.result, indexes) / indexes.length)}</td>`).join('')}</tr>`),
      `Inkomstenbelasting, Zvw en privé-opnamen zijn geen kosten van de onderneming en tellen niet mee. ${overlay === 'zakelijk' && isSoleTrader() ? `Privé-opnamen 12 mnd: <b>${eur(sum(A.ownerNet))}</b> (${pct(sum(A.ownerNet) / Math.max(1, sum(A.result)))} van het resultaat).` : ''}`)}
    ${card('Resultaat per maand', windowLabel(), `<div class="card-body scroll-x">${barChart([{ label: 'Resultaat', color: SERIES_COLORS.revenue, values: A.result }], { line: overlay === 'zakelijk' && isSoleTrader() ? { label: 'Privé-opnamen', color: 'var(--amber-icon)', values: A.ownerNet } : null })}</div>`, '', overlay === 'zakelijk' && isSoleTrader() ? legend([['Resultaat', SERIES_COLORS.revenue], ['Privé-opnamen', 'var(--amber-icon)']]) : '')}`;
};

/* ---------- Cashflow ---------- */
RENDERERS.cashflow = () => {
  const rows = A.rows.filter(row => includeInternal || row.rule !== 1);
  const groupRow = (label, list, sign) => `<tr><td>${label}</td>${[0, 1, 2].map(offset => `<td class="num">${eur(sign * sum(list.filter(row => row.monthIndex === 9 + offset).map(row => Math.abs(row.amount))))}</td>`).join('')}<td class="num">${eur(sign * sum(list.map(row => Math.abs(row.amount))))}</td><td class="action">${viewButton(label, list)}</td></tr>`;
  const ins = rows.filter(row => row.amount > 0), outs = rows.filter(row => row.amount < 0);
  const lines = [
    ...RULE_ORDER.map(id => [id, ins.filter(row => row.rule === id)]).filter(([, list]) => list.length).map(([id, list]) => groupRow(`In · ${ruleName(id)}`, list, 1)),
    ...RULE_ORDER.map(id => [id, outs.filter(row => row.rule === id)]).filter(([, list]) => list.length).map(([id, list]) => groupRow(`Uit · ${ruleName(id)}`, list, -1)),
  ].join('');
  const net = list => sum(list.map(row => row.amount));
  return `${card('Saldo per dag', `${weergaveLabel()} · som van ${A.visibleAccounts.length} rekening(en)`, `<div class="card-body scroll-x">${balanceChart()}</div>`, `<b>Herleiding:</b> saldo na transactie (<code>balanceAfterTransaction</code>, anders doorgerekend vanaf het rekeningsaldo). Laagste saldo ${eur(Math.min(...A.balance))}; ${A.negativeDays} dagen onder nul.`)}
    ${card('Kasstroom per kopje', `Laatste 3 maanden en 12 maanden · interne transacties ${includeInternal ? 'inclusief' : 'exclusief'}`, table(['Kopje', ...A.lastThree.map(index => `num:${shortMonth(A.MONTHS[index])}`), 'num:12 mnd', ''], lines, `<tr><td>Netto</td>${A.lastThree.map(index => `<td class="num">${eur(net(rows.filter(row => row.monthIndex === index)))}</td>`).join('')}<td class="num">${eur(net(rows))}</td><td></td></tr>`))}`;
};

/* ---------- Belasting (altijd 12 maanden) ---------- */
let taxListFilter = 'special';
const TAX_LIST_FILTERS = [['special', 'Opvallend'], ['previous', 'Eerdere jaren'], ['refund', 'Teruggaven'], ['all', 'Alle']];
RENDERERS.belasting = () => {
  const summaryRows = A.taxSummary.filter(item => overlay === 'prive' || item.type !== 'ob' || item.count).map(item => `<tr><td><b>${TAX_TYPES[item.type].label}</b><span class="muted">${TAX_TYPES[item.type].recognition}</span></td><td class="num">${item.count}</td><td class="num">${eur(item.current)}</td><td class="num">${item.previous ? eur(item.previous) : '-'}</td><td class="num">${item.refunds ? eur(item.refunds) : '-'}</td><td>${sparkBars(item.monthly)}</td><td class="action">${viewButton(TAX_TYPES[item.type].label, item.rows)}</td></tr>`).join('');
  const quarters = [0, 1, 2, 3].map(quarter => { const indexes = [quarter * 3, quarter * 3 + 1, quarter * 3 + 2]; return { label: `${shortMonth(A.MONTHS[indexes[0]])} – ${monthName(A.MONTHS[indexes[2]])}`, base: sum(indexes.map(index => A.vatBase[index])), expected: sum(indexes.map(index => A.vatExpected[index])), paid: sum(indexes.map(index => A.vatPaid[index])), indexes }; });
  const matches = row => taxListFilter === 'all' || (taxListFilter === 'previous' && row.tax.previousYear) || (taxListFilter === 'refund' && row.amount > 0) || (taxListFilter === 'special' && (row.tax.previousYear || row.amount > 0 || ['Naheffing', 'Betalingsregeling', 'Geen betalingskenmerk', 'Kenmerk niet herleidbaar'].includes(row.tax.kind) || row.tax.valid === false));
  const listed = A.taxRows.filter(matches);
  const plans = A.obligations.filter(item => item.rule === 3);
  return `${card('Belastingen per soort', `${windowLabel()} · soort en jaar uit het betalingskenmerk`, table(['Soort', 'num:Aantal', 'num:Lopend jaar', 'num:Eerdere jaren', 'num:Teruggaaf', 'Verloop', ''], summaryRows || '<tr><td colspan="7">Geen belastingbetalingen in deze weergave.</td></tr>', `<tr><td>Totaal</td><td class="num">${A.taxRows.length}</td><td class="num">${eur(sum(A.taxSummary.map(item => item.current)))}</td><td class="num">${eur(sum(A.taxSummary.map(item => item.previous)))}</td><td class="num">${eur(sum(A.taxSummary.map(item => item.refunds)))}</td><td colspan="2"></td></tr>`),
      `<b>Herleiding:</b> ${ruleRef(3)}. “Eerder jaar” = het belastingjaar in het kenmerk ligt vóór het boekjaar (een aangifte over december in jan/feb telt als regulier). ${overlay === 'zakelijk' && isSoleTrader() ? 'Inkomstenbelasting en Zvw van een eenmanszaak worden vaak privé betaald: kijk in Privé of Samen.' : ''}`)}
    ${overlay !== 'prive' ? card('Omzetbelasting: verwacht en betaald', 'Per kwartaal van het venster · verwacht = (omzet − NL-inkoop) × 21/121', table(['Kwartaal', 'num:Grondslag', 'num:Verwacht', 'num:Betaald in kwartaal', 'num:Verschil', ''], quarters.map(quarter => `<tr><td>${quarter.label}</td><td class="num">${eur(quarter.base)}</td><td class="num">${eur(quarter.expected)}</td><td class="num">${eur(quarter.paid)}</td><td class="num ${quarter.paid < quarter.expected * 0.8 ? 'negative' : ''}">${eur(quarter.paid - quarter.expected)}</td><td class="action">${viewButton(`Btw ${quarter.label}`, A.taxOf('ob').rows.filter(row => quarter.indexes.includes(row.monthIndex)))}</td></tr>`).join(''), `<tr><td>12 mnd</td><td class="num">${eur(sum(A.vatBase))}</td><td class="num">${eur(sum(A.vatExpected))}</td><td class="num">${eur(sum(A.vatPaid))}</td><td class="num">${eur(sum(A.vatPaid) - sum(A.vatExpected))}</td><td></td></tr>`), 'Betaling volgt een kwartaal later; vergelijk daarom vooral de 12-maandstotalen. Verzekeringen en buitenlandse leveranciers tellen niet als btw-aftrek.') : ''}
    ${card('Regelingen en termijnen', plans.length ? `${plans.length} reeksen gelijke bedragen` : 'Geen terugkerende belastingbedragen', plans.length ? table(['Tegenpartij', 'Herkend als', 'num:Termijn', 'Laatste 6 mnd', ''], plans.map(item => `<tr><td>${esc(item.name)}</td><td>${item.arrangement ? '<span class="chip warn">Betalingsregeling</span>' : `<span class="chip">${esc(item.tax ? `${TAX_TYPES[item.tax.type].label} · ${item.tax.kind}` : 'Termijnen')}</span>`}</td><td class="num">${eur(item.term)}</td><td>${patternCells(item)}</td><td class="action">${viewButton(item.name, item.rows)}</td></tr>`).join('')) : '', 'Gelijke maandbedragen (±2%) aan de Belastingdienst zonder geldig kenmerk, of met E1-flag <code>payment_arrangement</code>, wijzen op een betalingsregeling.')}
    ${card('Belastingbetalingen', `${listed.length} van ${A.taxRows.length}`, `<div class="card-body"><div class="filters">${TAX_LIST_FILTERS.map(([id, label]) => `<button type="button" class="filter" data-taxfilter="${id}" aria-pressed="${taxListFilter === id}">${label}</button>`).join('')}</div></div>${transactionTable(listed)}`)}`;
};

/* ---------- Verplichtingen ---------- */
const MARK = { paid: ['●', 'betaald'], none: ['○', 'niet betaald'], reversal: ['↺', 'teruggeboekt'], other: ['◐', 'ander bedrag'] };
const patternCells = item => `<span class="pattern">${item.marks.map((mark, index) => { const [symbol, text] = MARK[mark] ?? [mark.replace('x', '×'), 'inhaalbetaling']; return `<span class="mark-cell ${mark}" title="${shortMonth(A.MONTHS[6 + index])}: ${text}">${symbol}<small>${shortMonth(A.MONTHS[6 + index])}</small></span>`; }).join('')}</span>`;
RENDERERS.verplichtingen = () => {
  const groups = ['Leningen en leases', 'Belastingen in termijnen', 'Privé en verbonden partijen', 'Deurwaarder', 'Overige vaste lasten'];
  const active = A.obligations.filter(item => item.active);
  const body = groups.map(group => {
    const list = A.obligations.filter(item => item.group === group);
    if (!list.length) return '';
    return `<tr class="group"><td colspan="6">${group} · ${eur(sum(list.filter(item => item.active).map(item => item.term)))}/mnd</td></tr>${list.map(item => `<tr class="item"><td><b>${esc(item.name)}</b><span class="muted">${ruleRef(item.rule)}${item.e1 ? ` · E1 ${esc(e1Label(item.e1))}` : ''}</span></td>
      <td>${item.arrangement ? '<span class="chip warn">Betalingsregeling</span>' : item.confirmed ? '<span class="chip good">Verplichting</span>' : '<span class="chip">Mogelijk</span>'}${item.missed ? ` <span class="chip bad">${item.missed}× gemist</span>` : ''}${item.catchUp ? ` <span class="chip warn">inhaal</span>` : ''}${!item.active ? ' <span class="chip">gestopt</span>' : ''}</td>
      <td class="num">${eur(item.term)}</td><td>${patternCells(item)}</td><td class="num">${eur(item.term * 12)}</td><td class="action">${viewButton(item.name, item.rows)}</td></tr>`).join('')}`;
  }).join('');
  return `<div class="card"><div class="figures">
      <div class="figure"><b>${eur(sum(active.map(item => item.term)))}</b><span>vaste lasten per maand</span></div>
      <div class="figure"><b>${eur(sum(active.filter(item => item.group === 'Leningen en leases').map(item => item.term)))}</b><span>leningen en leases per maand</span></div>
      <div class="figure"><b class="${A.obligations.some(item => item.arrangement) ? 'amber' : ''}">${A.obligations.filter(item => item.arrangement).length}</b><span>betalingsregelingen</span></div>
      <div class="figure"><b class="${sum(A.obligations.map(item => item.missed)) ? 'negative' : ''}">${sum(A.obligations.map(item => item.missed))}</b><span>gemiste of teruggeboekte termijnen</span></div></div></div>
    ${card('Terugkerende verplichtingen', `Laatste 6 maanden (${shortMonth(A.MONTHS[6])} – ${monthName(A.MONTHS[11])}) · ● betaald ○ niet betaald ↺ teruggeboekt 2× inhaal`, table(['Tegenpartij', 'Status', 'num:Termijn', 'Patroon', 'num:Per jaar', ''], body || '<tr><td colspan="6">Geen terugkerende bedragen gevonden.</td></tr>'),
      '<b>Herkenning:</b> zelfde tegenpartij, bedrag binnen ±2% van de mediaan, in ten minste 3 van de laatste 6 maanden. 2× of 3× het bedrag in één maand = inhaalbetaling; een lege maand tussen betalingen of een terugboeking = gemiste termijn. “Verplichting” = financiering, belasting of E1 <code>loan.*</code>; de rest is “mogelijk”.')}`;
};

/* ---------- Verbonden partijen ---------- */
const TREATMENT = {
  eenmanszaak: { Eigenaar: 'Privé-opname of storting: geen omzet en geen kosten. Telt wel mee in de vrije kasstroom na opnamen.', 'Eigen onderneming': 'Inkomen van de ondernemer (privé-opname). In Samen valt dit weg als interne overboeking.', Familie: 'Geen omzet tot bevestigd. Lening van familie = informele schuld; aflossing telt in de DSCR.', Groepsmaatschappij: 'Niet van toepassing bij een eenmanszaak; controleren.' },
  bv: { Eigenaar: 'Salaris DGA, dividend of rekening-courant: geen omzet. Salaris = loonkosten; rekening-courant = schuld of vordering.', 'Eigen onderneming': 'Inkomen DGA.', Familie: 'Geen omzet tot bevestigd.', Groepsmaatschappij: 'Holding/werkmaatschappij: managementfee of rekening-courant; niet als externe omzet, wel als intercompany.' },
};
RENDERERS.verbonden = () => {
  const treatment = TREATMENT[/bv|b\.v|vennootschap/.test(String(DOSSIER.legalForm)) ? 'bv' : 'eenmanszaak'];
  const rows = A.related.map(item => `<tr><td><b>${esc(item.name)}</b><span class="muted mono">${esc(maskIban(item.iban))}</span></td><td><span class="chip outline">${esc(item.role)}</span><span class="muted">${esc(item.how ?? '')}${item.derived === 'own_off' ? ' · rekening niet meegenomen' : ''}</span></td>
    <td class="num">${item.in ? eur(item.in) : '-'}</td><td class="num">${item.out ? eur(-item.out) : '-'}</td><td class="treatment">${treatment[item.role] ?? ''}${item.loan ? ' <b>Bevat lening/aflossing.</b>' : ''}</td>
    <td>${item.status === 'Voorgesteld' ? `<div class="decide"><button type="button" class="btn-decide yes" data-decide="yes" data-side="related" data-key="${esc(item.key)}">Bevestig</button></div>` : `<span class="chip ${item.status.startsWith('Bevestigd') ? 'good' : ''}">${item.status}</span>`}</td><td class="action">${viewButton(item.name, item.rows)}</td></tr>`).join('');
  return `${card('Verbonden partijen', `${weergaveLabel()} · rechtsvorm ${esc(DOSSIER.legalForm)} · leden: ${memberProfile().map(member => `${member.initials.toUpperCase()}. ${member.surname.replace(/\b\w/g, letter => letter.toUpperCase())}`).join(', ') || 'geen'}${(DOSSIER.members ?? []).some(member => member.derived) ? ' (afgeleid van de privérekening)' : ''}`, table(['Partij', 'Relatie', 'num:Ontvangen', 'num:Betaald', 'Behandeling', 'Status', ''], rows || '<tr><td colspan="7">Geen verbonden partijen gevonden.</td></tr>'),
    `<b>Herkenning (${ruleRef(5)}, vóór lonen en debiteuren):</b> eigenaar = initiaal + achternaam uit <code>members</code> of de gedeelde rekening met de andere rol; familie = zelfde achternaam (zekerheid ${CONFIDENCE.related}% tot bevestigd); groep = achternaam + rechtsvorm. In Samen worden overboekingen tussen zakelijk en privé intern (${ruleRef(1)}).`)}`;
};

/* ---------- Signalen: E1-buckets naast de eigen regels ---------- */
function SIGNAL_STATUS() {
  if (!A) return null;
  const bad = A.byRule(4).length || A.rows.some(row => row.signal === 'gokken') || A.byRule(2).some(row => A.lastThree.includes(row.monthIndex));
  return bad ? 'bad' : A.byRule(2).length || A.obligations.some(item => item.arrangement) ? 'warn' : 'good';
}
RENDERERS.signalen = () => {
  const own = [
    ['Terugboekingen', ruleRef(2), A.byRule(2)], ['Deurwaarders en incasso', ruleRef(4), A.byRule(4)], ['Betalingsregelingen', 'gelijke termijnen of flag', A.obligations.filter(item => item.arrangement).flatMap(item => item.rows)],
    ['Gokken', 'naam casino/toto/loterij of E1 gambling.*', A.rows.filter(row => row.signal === 'gokken')], ['Crypto', 'naam cryptobeurs of E1 investment.crypto', A.rows.filter(row => row.signal === 'crypto')],
    ['Ronde bedragen ≥ € 10.000', 'veelvoud van 10.000', A.rows.filter(row => Math.abs(row.amount) >= 10000 && Math.abs(row.amount) % 10000 === 0)], ['Contant', ruleRef(9), A.byRule(9)],
  ];
  const ownTable = table(['Signaal', 'Herkend via', 'num:3 mnd', 'num:12 mnd', 'num:Bedrag 12 mnd', ''], own.map(([label, how, list]) => `<tr><td><b>${label}</b></td><td><span class="muted">${how}</span></td><td class="num">${list.filter(row => A.lastThree.includes(row.monthIndex)).length}</td><td class="num">${list.length}</td><td class="num">${eur(sum(list.map(row => Math.abs(row.amount))))}</td><td class="action">${list.length ? viewButton(label, list) : ''}</td></tr>`).join(''));
  if (!hasE1()) return card('Signalen (eigen regels)', windowLabel(), ownTable, 'Geen E1-categorieën in de data: de Enable Now-buckets zijn niet beschikbaar.');
  const buckets = bucketsFor(overlay);
  const received = receivedAnalysis();
  const raw = A.rows;
  const section = (title, key) => {
    const rows = buckets[key].map(entry => {
      const list = raw.filter(entry.test);
      const fromAnalysis = received?.[key]?.find(item => item.name === entry.name);
      const same = fromAnalysis ? fromAnalysis.transactionCount === list.length && Math.abs(fromAnalysis.totalInflow - inflow(list)) < 1 && Math.abs(fromAnalysis.totalOutflow - outflow(list)) < 1 : null;
      return `<tr><td>${list.length ? ICON[entry.tone === 'info' ? 'info' : entry.tone] : ICON.good}</td><td><b>${entry.nl}</b><span class="muted">${entry.name} · <code>${entry.rule}</code></span></td><td class="num">${list.length}</td><td class="num">${eur(inflow(list))}</td><td class="num">${eur(-outflow(list))}</td>${received ? `<td>${same === null ? '-' : same ? '<span class="check-ok">✓</span>' : '<b class="negative">✕</b>'}</td>` : ''}<td class="action">${list.length ? viewButton(entry.nl, list) : ''}</td></tr>`;
    }).join('');
    return card(title, `<code>${key}</code>`, table(['', 'Bucket', 'num:Aantal', 'num:In', 'num:Uit', ...(received ? ['Enable Now'] : []), ''], rows));
  };
  return `${card('Signalen (eigen regels)', `${weergaveLabel()} · ${windowLabel()}`, ownTable, 'Deze signalen werken ook zonder E1. De buckets hieronder volgen de analyse-job van Enable Now en gebruiken de ruwe E1-categorie.')}
    ${section(overlay === 'prive' ? 'Klantprofiel (retail)' : overlay === 'samen' ? 'Klantprofiel (corporate + retail)' : 'Klantprofiel (corporate)', 'clientProfile')}
    <div class="grid-2">${section('Gemarkeerde transacties', 'flaggedTransactions')}${section('Lage E1-zekerheid', 'lowConfidenceTransactions')}</div>
    ${section('Overig opvallend', 'otherHighlightedTransactions')}
    ${card('Kredietkwaliteit (creditQualityMetrics)', 'Nog niet gevuld', '<div class="card-body muted">Enable Now levert dit blok in de analyse-job nog leeg op. Zodra het gevuld is, toont Loanwise het hier naast de eigen scorecard, zonder het oordeel over te nemen.</div>',
      received ? 'Kolom <b>Enable Now</b>: ✓ = aantal en bedragen gelijk aan de ontvangen analyse-JSON voor dit profiel.' : overlay === 'samen' ? 'In Samen is er geen ontvangen analyse om mee te vergelijken (Enable Now analyseert per profiel).' : 'Geen analyse-JSON ingeladen voor dit profiel, of een rekening uit die analyse staat uit.')}`;
};

/* ---------- Categorieën: eigen kopjes en E1-groepen ---------- */
RENDERERS.categorieen = () => {
  const ownRows = RULES.map(rule => { const list = A.byRule(rule.id); const weight = sum(list.map(row => Math.abs(row.amount))); return `<tr><td>${ruleRef(rule.id)}</td><td class="num">${list.length}</td><td class="num">${eur(inflow(list))}</td><td class="num">${eur(-outflow(list))}</td><td>${list.length ? confidenceChip(sum(list.map(row => Math.abs(row.amount) * row.confidence)) / weight) : ''}</td><td>${sparkBars(A.monthly(list, row => Math.abs(row.amount)))}</td><td class="action">${list.length ? viewButton(ruleName(rule.id), list) : '<span class="muted">niet gevonden</span>'}</td></tr>`; }).join('');
  const ownCard = card('Loanwise-kopjes (regels 1–12)', `${weergaveLabel()} · ${A.rows.length} transacties · eerste regel die past`, table(['Kopje', 'num:Aantal', 'num:In', 'num:Uit', 'Zekerheid', 'Verloop', ''], ownRows));
  if (!hasE1()) return ownCard;
  const derivedLabel = row => row.derived === 'owner_transfer' ? 'Overboeking zakelijk ↔ privé (afgeleid)' : row.derived === 'own_off' ? 'Naar of van uitgezette eigen rekening (afgeleid)' : null;
  const keyOf = row => row.derived ? `derived.${row.derived}` : row.e1?.category ?? 'geen';
  const present = groupBy(A.rows.filter(row => row.e1), keyOf);
  const groupRows = [['derived', 'Tussen eigen rekeningen (afgeleid)'], ...E1_GROUPS].map(([group, label]) => {
    const keys = [...present.keys()].filter(key => e1Group(key) === group).sort((first, second) => sum(present.get(second).map(row => Math.abs(row.amount))) - sum(present.get(first).map(row => Math.abs(row.amount))));
    if (!keys.length) return '';
    return `<tr class="group"><td colspan="7">${label}</td></tr>${keys.map(key => { const list = present.get(key); const agree = list.filter(row => row.e1Agree !== false).length / list.length; return `<tr class="item"><td>${esc(derivedLabel(list[0]) ?? e1Label(key))}<span class="muted"><code>${esc(key)}</code></span></td><td class="num">${list.length}</td><td class="num">${eur(inflow(list))}</td><td class="num">${eur(-outflow(list))}</td><td class="num">${dec(sum(list.map(row => row.e1.confidence)) / list.length)}</td><td class="num ${agree < 1 ? 'amber-text' : ''}">${pct(agree)}</td><td class="action">${viewButton(derivedLabel(list[0]) ?? e1Label(key), list)}</td></tr>`; }).join('')}`;
  }).join('');
  const missing = E1_GROUPS.filter(([group]) => ![...present.keys()].some(key => e1Group(key) === group)).map(([, label]) => label);
  return `${ownCard}
    ${card('E1-categorieën (Enable Now)', 'Ruwe E1-categorie per transactie; afgeleid = Loanwise ziet een overboeking tussen gedeelde rekeningen', table(['Categorie', 'num:Aantal', 'num:In', 'num:Uit', 'num:Gem. E1', 'num:Eens met regel', ''], groupRows),
      `<b>Niet gevonden:</b> ${missing.join(', ') || 'alle groepen komen voor'}. “Eens met regel” = deel van de transacties waarvan de E1-categorie past bij het Loanwise-kopje; bij afwijking zakt de zekerheid en volgt een melding in Controle.`)}`;
};

/* ---------- Tegenpartijen: top 5 per richting ---------- */
RENDERERS.tegenpartijen = () => {
  const candidates = A.rows.filter(row => row.rule !== 1);
  const top = direction => [...groupBy(candidates.filter(row => direction > 0 ? row.amount > 0 : row.amount < 0), row => row.key).values()].map(list => ({ name: list.find(row => row.name)?.name ?? '(geen naam)', iban: list[0].counterAccount, list, total: Math.abs(sum(list.map(row => row.amount))), months: new Set(list.map(row => row.monthIndex)).size, rule: list[0].rule })).sort((first, second) => second.total - first.total);
  const block = (title, direction) => {
    const list = top(direction);
    const all = sum(list.map(item => item.total));
    const five = list.slice(0, 5);
    return card(title, `Top 5 van ${list.length} · samen ${pct(sum(five.map(item => item.total)) / all)} van ${eur(all)}`, `<div class="hbars">${five.map((item, index) => `<div class="hrow"><span class="name">${esc(item.name)}</span><span class="track"><span class="fill ${index === 0 ? 'accent' : ''}" style="width:${item.total / five[0].total * 100}%"></span></span><span class="num">${k(item.total)}</span><span class="share-pct">${pct(item.total / all)}</span></div>`).join('')}</div>${table(['Tegenpartij', 'Kopje', 'num:Aantal', 'num:Maanden', 'num:12 mnd', ''], five.map(item => `<tr><td>${esc(item.name)}<span class="muted mono">${esc(maskIban(item.iban))}</span></td><td>${ruleRef(item.rule)}</td><td class="num">${item.list.length}</td><td class="num">${item.months}</td><td class="num">${eur(item.total)}</td><td class="action">${viewButton(item.name, item.list)}</td></tr>`).join(''))}`);
  };
  return `<div class="grid-2">${block('Grootste ontvangsten', 1)}${block('Grootste betalingen', -1)}</div>
    <p class="footer-note">Zonder interne overboekingen. Een tegenpartij is één IBAN; zonder IBAN de naam. Vergelijkbaar met <code>topCounterparties</code> in de analyse-job.</p>`;
};

/* ---------- Transacties ---------- */
let transactionFilter = 'all';
let transactionLimit = 100;
const TRANSACTION_FILTERS = [
  ['all', 'Alle', () => true], ['low', 'Zekerheid < 70%', row => row.confidence < CONFIDENCE.threshold], ['e1', 'E1 wijkt af', row => row.e1Agree === false],
  ['flag', 'E1-flag', row => row.e1?.flags.length], ['round', 'Rond ≥ € 10.000', row => Math.abs(row.amount) >= 10000 && Math.abs(row.amount) % 10000 === 0],
  ['internal', 'Intern', row => row.rule === 1], ['uncat', 'Ongecategoriseerd', row => row.rule === 12],
];
const toLoanwiseFormat = row => ({ booking_date: row.date, transaction_amount: { currency: 'EUR', amount: Math.round(row.amount * 100) }, remittance_information_unstructured: row.description, external_id: row.id, transaction_type: row.type ?? 'unknown', counter_party_name: row.name, counter_party_account: row.counterAccount });
const toEnableNowFormat = row => ({ id: row.id, accountNumber: row.account, description: row.description, bookDate: row.date, amount: row.amount, balanceAfterTransaction: row.balanceAfter, currency: 'EUR', counterpartDescription: row.name, counterpartAccountNumber: row.counterAccount, category: row.e1 ? { e1: { category: row.e1.category, confidence: row.e1.confidence, flags: row.e1.flags, model: { profile: row.e1.profile } } } : undefined });
RENDERERS.transacties = () => {
  const [, , test] = TRANSACTION_FILTERS.find(([id]) => id === transactionFilter) ?? TRANSACTION_FILTERS[0];
  const list = A.rows.filter(test);
  const sample = A.rows.find(row => row.e1?.flags.length) ?? A.rows[0];
  return `${card('Transacties', `${weergaveLabel()} · ${list.length} van ${A.rows.length} · Σ ${eurCents(sum(list.map(row => row.amount)))}`, `<div class="card-body"><div class="filters">${TRANSACTION_FILTERS.map(([id, label, filter]) => `<button type="button" class="filter" data-filter="${id}" aria-pressed="${transactionFilter === id}">${label} <span class="muted">${A.rows.filter(filter).length}</span></button>`).join('')}</div></div>${transactionTable(list, transactionLimit)}${list.length > transactionLimit ? `<div class="card-body"><button type="button" class="btn-outline" data-more>Toon 200 meer</button></div>` : ''}`)}
    ${sample ? card('Voorbeeldrecord in beide formaten', `${esc(sample.name ?? '(geen naam)')} · ${dateNl(sample.date)}`, `<div class="grid-2 card-body"><div><b>Loanwise</b> <span class="muted">PUT …/transactions · bedrag in centen</span><pre class="json">${esc(JSON.stringify(toLoanwiseFormat(sample), null, 2))}</pre></div><div><b>Enable Now</b> <span class="muted">GET /Transactions · met category.e1</span><pre class="json">${esc(JSON.stringify(toEnableNowFormat(sample), null, 2))}</pre></div></div>`, 'Dataset laden herkent beide vormen automatisch, los of als zip. Ontbreekt <code>category.e1</code>, dan rekent Loanwise alleen met de eigen regels.') : ''}`;
};

/* ---------- Regels ---------- */
RENDERERS.regels = () => `${card('Categorieregels', 'Eerste regel die past, bepaalt het kopje · geen AI', `<div class="rules">${RULES.map(rule => `<div class="rule"><span class="rule-no">${rule.id}</span><span class="name">${ruleName(rule.id)}</span><span class="text">${rule.text}</span></div>`).join('')}</div>`,
  'Weergave Zakelijk of Privé: een overboeking tussen de zakelijke en de privérekening wordt regel 5 (eigenaar). In Samen is die overboeking regel 1 en valt weg. E1 (Enable Now) is een tweede mening: bij overeenkomst +5/+10 zekerheid, bij afwijking −10 en een melding.')}
  ${card('Wat Loanwise per transactie gebruikt', 'Velden in beide invoerformaten', table(['Gegeven', 'Loanwise', 'Enable Now'], [
    ['Datum', 'booking_date', 'bookDate'], ['Bedrag', 'transaction_amount.amount (centen)', 'amount (euro)'], ['Omschrijving', 'remittance_information_unstructured', 'description'], ['Tegenpartij', 'counter_party_name', 'counterpartDescription'],
    ['Tegenrekening', 'counter_party_account', 'counterpartAccountNumber'], ['Soort', 'transaction_type', '-'], ['Saldo na transactie', '- (doorgerekend)', 'balanceAfterTransaction'], ['Categorie', '-', 'category.e1 {category, confidence, flags}'],
    ['Rekening', 'account_number, account_name, account_balance', '/Accounts: iban, accountHolder, accountBalance'], ['Klant', 'members (initials, last_name)', 'companyInfo (kvkNumber, legalForm, SBI)'], ['Bank en deeldatum', 'BIC', '/v2/consents: providerKey, dateRequested'],
  ].map(([label, loanwise, enableNow]) => `<tr><td>${label}</td><td><code>${loanwise}</code></td><td><code>${enableNow}</code></td></tr>`).join('')))}`;
