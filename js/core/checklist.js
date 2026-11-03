'use strict';
/* ---------- Acceptatiechecklist (config ACCEPTATIE, handleiding acceptatiehandleiding-zakelijk.md) ----------
   Per check een automatisch voorstel met de feiten; de analist zet de status. Een norm die null is, levert nooit
   'voldoet' of 'voldoet niet' op, alleen 'niet beoordeeld' met de feiten. */
const CHECK_STATUS = { voldoet: 'Voldoet', voldoet_niet: 'Voldoet niet', info_nodig: 'Info nodig', niet_beoordeeld: 'Niet beoordeeld', nvt: 'N.v.t.' };
const NEEDS_NOTE = ['voldoet_niet', 'info_nodig', 'nvt'];

function checklist(Az, Ap, cap, riskList) {
  const legal = DOSSIER.legalForm;
  const company = DOSSIER.company ?? {};
  const members = DOSSIER.members ?? [];
  const accounts = DOSSIER.accounts;
  const byNorm = (key, ok, facts) => NORMEN[key] == null || (Array.isArray(NORMEN[key]) && !NORMEN[key].length && key !== 'uitgeslotenSbi')
    ? { voorstel: 'niet_beoordeeld', feiten: `${facts} · norm niet ingesteld` }
    : { voorstel: ok(NORMEN[key]) ? 'voldoet' : 'voldoet_niet', feiten: facts };
  const facts = (condition, good, bad, feiten) => ({ voorstel: condition ? good : bad, feiten });
  const risk = id => riskList.filter(item => item.id === id || item.id.startsWith(`${id}-`));
  const yearsActive = company.startDate ? (new Date(Az.days.at(-1)) - new Date(company.startDate)) / (365.25 * 864e5) : null;
  const lastBooking = DOSSIER.transactions.at(-1)?.date;
  const shared = DOSSIER.consents?.length ? DOSSIER.consents.map(consent => String(consent.dateRequested ?? '').slice(0, 10)).sort().at(-1) : accounts.map(account => account.sharedOn).filter(Boolean).sort().at(-1);
  const gap = lastBooking && shared ? Math.round((new Date(shared) - new Date(lastBooking)) / 864e5) : null;
  const memberAccounts = members.map(member => ({ member, accounts: accounts.filter(account => account.owner === member.id && account.role !== 'zakelijk') }));
  const lowShare = sum(Az.rows.filter(row => [10, 11].includes(row.rule) && row.confidence < CONFIDENCE.threshold).map(row => Math.abs(row.amount))) / Math.max(1, sum(Az.rows.map(row => Math.abs(row.amount))));
  const uncatShare = sum(Az.byRule(12).map(row => Math.abs(row.amount))) / Math.max(1, sum(Az.rows.map(row => Math.abs(row.amount))));
  const top = Az.debtors.find(entity => entity.decision !== 'no' && !isPaymentProcessor(entity));
  const topShare = top && Az.revenue12 ? top.total / Az.revenue12 : 0;
  const trend = change3v12Core(Az.revenue);
  const vat = Az.taxOf('ob');
  const negMonthMax = Math.max(0, ...Az.accountBalances.flatMap(item => item.negativeByMonth));
  const dgaSalary12 = sum(Az.dgaSalary);
  const openRisks = riskList.filter(item => item.state.status === 'open');
  const P = {
    A1: () => facts(!risk('rekening-niet-gedeeld').length, 'voldoet', 'info_nodig', risk('rekening-niet-gedeeld')[0]?.wat ?? 'Geen eigen rekening gevonden die niet is gedeeld.'),
    A2: () => members.length ? facts(memberAccounts.every(item => item.accounts.length), 'voldoet', 'info_nodig', memberAccounts.map(item => `${memberName(item.member)} (${item.member.role}): ${item.accounts.length ? item.accounts.map(account => `${account.role} ${account.iban.slice(-4)}`).join(', ') : 'geen privérekening gedeeld'}`).join(' · ')) : { voorstel: 'info_nodig', feiten: 'Geen leden bekend: eigenaar, DGA of vennoten invullen.' },
    A3: () => byNorm('maandenHistorie', norm => Az.dataMonths >= norm, `${Az.dataMonths} maanden met data (${monthName(Az.MONTHS[0])} – ${monthName(Az.MONTHS.at(-1))})`),
    A4: () => gap == null ? { voorstel: 'niet_beoordeeld', feiten: 'Deeldatum onbekend' } : byNorm('actualiteitDagen', norm => gap <= norm, `laatste boeking ${dateNl(lastBooking)}, gedeeld ${dateNl(shared)}: ${gap} dagen`),
    A5: () => facts(!risk('saldo').length, 'voldoet', 'voldoet_niet', risk('saldo')[0]?.wat ?? 'Elke rekening sluit aan op de cent.'),
    A6: () => facts(uncatShare <= SIGNAALGRENZEN.ongecategoriseerdAandeel && lowShare <= SIGNAALGRENZEN.lageZekerheidAandeel, 'voldoet', 'info_nodig', `ongecategoriseerd ${pctCore(uncatShare)} (≤ ${pctCore(SIGNAALGRENZEN.ongecategoriseerdAandeel)}) · lage zekerheid ${pctCore(lowShare)} (≤ ${pctCore(SIGNAALGRENZEN.lageZekerheidAandeel)})`),
    A7: () => DOSSIER.consents?.length ? facts(DOSSIER.consents.every(consent => /valid|active/i.test(consent.status ?? '')), 'voldoet', 'voldoet_niet', DOSSIER.consents.map(consent => `${consent.providerKey} ${consent.status}${consent.validUntil ? ` t/m ${dateNl(consent.validUntil)}` : ''}`).join(' · ')) : { voorstel: 'niet_beoordeeld', feiten: 'Geen consents in de data (Loanwise-formaat)' },
    A8: () => facts(accounts.every(account => account.roleConfirmed), 'voldoet', 'niet_beoordeeld', accounts.filter(account => !account.roleConfirmed).length ? `${accounts.filter(account => !account.roleConfirmed).length} rekening(en) nog niet bevestigd in de dossierkop` : 'Alle rollen bevestigd'),
    B1: () => company.name ? facts(accounts.some(account => account.role !== 'prive' && (String(account.name).toLowerCase().includes(String(company.name).toLowerCase()) || members.some(member => String(account.name).toLowerCase().includes(String(member.last_name ?? '').toLowerCase())))), 'voldoet', 'info_nodig', `KvK ${company.kvkNumber ?? '-'} · ${company.name} · rekeninghouders: ${[...new Set(accounts.map(account => account.name))].join(', ')}`) : { voorstel: 'info_nodig', feiten: 'Geen KvK-gegevens (companyInfo) in de data' },
    B2: () => ({ voorstel: legal ? 'voldoet' : 'info_nodig', feiten: `Rechtsvorm: ${legal ?? 'onbekend'}${company.legalForm ? ` (KvK: ${company.legalForm})` : ''}` }),
    B3: () => yearsActive == null ? { voorstel: 'info_nodig', feiten: 'Startdatum onbekend' } : byNorm('bestaansduurJaren', norm => yearsActive >= norm, `sinds ${dateNl(company.startDate)}: ${dec(yearsActive, 1)} jaar`),
    B4: () => company.industryCode ? { voorstel: NORMEN.uitgeslotenSbi.length ? (NORMEN.uitgeslotenSbi.some(code => String(company.industryCode).startsWith(code)) ? 'voldoet_niet' : 'voldoet') : 'niet_beoordeeld', feiten: `SBI ${company.industryCode} ${company.industryDescription ?? ''}${NORMEN.uitgeslotenSbi.length ? '' : ' · lijst uitgesloten branches niet ingesteld'}` } : { voorstel: 'info_nodig', feiten: 'SBI-code onbekend' },
    B5: () => { const staff = new Set(Az.byRule(8).filter(row => row.amount < 0).map(row => row.key)).size; const expected = company.numberOfEmployees; return expected == null ? { voorstel: 'niet_beoordeeld', feiten: `${staff} werknemers met loonbetalingen; aantal volgens KvK onbekend` } : facts(Math.abs(staff + (legal === 'bv' ? members.length : 0) - expected) <= 1, 'voldoet', 'info_nodig', `${staff} werknemers met loon${legal === 'bv' ? ` + ${members.length} DGA` : ''} · KvK: ${expected} werkzame personen`); },
    B6: () => { const open = Az.related.filter(item => item.status === 'Voorgesteld'); return facts(!open.length && members.length, 'voldoet', 'niet_beoordeeld', `${members.length} lid/leden (${members.map(member => `${memberName(member)}: ${member.role}`).join(', ') || '-'}) · ${open.length ? `nog te bevestigen: ${open.map(item => `${item.name} (${item.role})`).join(', ')}` : 'verbonden partijen beoordeeld'}`); },
    B7: () => { const draws = Az.memberDraws.filter(member => member.out); const shares = draws.map(member => member.out / Math.max(1, sum(draws.map(item => item.out)))); return { voorstel: 'info_nodig', feiten: draws.length ? `Opnamen: ${draws.map((member, index) => `${member.name} ${pctCore(shares[index])}`).join(' · ')} · winstverdeling uit vof-akte of opgave` : 'Geen opnamen per vennoot zichtbaar' }; },
    C1: () => { const leaks = Az.byRule(10).filter(row => /^(subsidy\.|income\.salary)/.test(row.e1?.category ?? '') || GEMENGD.privéInkomenNaam.test(row.name ?? '')); return facts(!leaks.length, 'voldoet', 'info_nodig', leaks.length ? `${leaks.length} bijschrijvingen in de omzet die op privé-inkomen lijken (${eur(inflow(leaks))})` : `Omzet ${eur(Az.revenue12)}; interne boekingen, verbonden partijen, financiering, teruggaaf en terugboekingen uitgesloten`); },
    C2: () => byNorm('omzetdalingMaximum', norm => !(trend < -norm), `3 mnd t.o.v. 12 mnd: ${Number.isFinite(trend) ? `${trend > 0 ? '+' : ''}${pctCore(trend)}` : '-'}`),
    C3: () => facts(sum(Az.freeCash) > 0, 'voldoet', 'voldoet_niet', `draagkracht 12 mnd ${eur(sum(Az.freeCash))} · operationeel ${eur(sum(Az.operating))}`),
    C4: () => byNorm('klantconcentratieMaximum', norm => topShare <= norm, top ? `${top.name ?? '(geen naam)'}: ${pctCore(topShare)} van de omzet` : 'geen debiteuren'),
    C5: () => INPUT.stated.revenue ? facts(Math.abs(Az.revenue12 / INPUT.stated.revenue - 1) <= SIGNAALGRENZEN.opgaveAfwijking, 'voldoet', 'info_nodig', `opgave ${eur(INPUT.stated.revenue)} · gemeten ${eur(Az.revenue12)} (${pctCore(Az.revenue12 / INPUT.stated.revenue - 1)})`) : { voorstel: 'niet_beoordeeld', feiten: 'Opgave omzet aanvrager niet ingevuld (Kredietcapaciteit)' },
    C6: () => vat.count ? facts(true, 'voldoet', 'info_nodig', `btw netto betaald ${eur(Az.vatNet12)} · verwacht bij 21% ${eur(sum(Az.vatExpected))} (alleen indicatie)`) : { voorstel: 'info_nodig', feiten: 'Geen btw-betalingen gevonden: KOR? Vraag aan de klant; bij KOR n.v.t.' },
    C7: () => { const review = reviewState(Az); return facts(!review.needed, 'voldoet', 'info_nodig', `DSCR slechtste ${dec(review.worst)} – beste ${dec(review.best)} · ${review.open.length} tegenpartijen te beoordelen`); },
    D1: () => ({ voorstel: (INPUT.extraObligations ?? []).length || Az.obligations.some(item => item.group === 'Leningen en leases') ? 'niet_beoordeeld' : 'info_nodig', feiten: `Herkend: ${Az.obligations.filter(item => item.group === 'Leningen en leases').map(item => `${item.name} ${eur(item.term)}/mnd`).join(', ') || 'geen'} · opgegeven: ${(cap.extras ?? []).map(item => `${item.name} ${eur(item.monthly)}${item.matchedWith ? ' (= herkend)' : ''}`).join(', ') || 'geen'}` }),
    D2: () => facts(!Az.obligations.some(item => item.missed), 'voldoet', 'voldoet_niet', Az.obligations.filter(item => item.missed).map(item => `${item.name}: ${item.missed}×`).join(', ') || 'Geen gemiste termijnen'),
    D3: () => facts(!Az.byRule(2).length, 'voldoet', 'info_nodig', `${Az.byRule(2).length} terugboekingen`),
    D4: () => facts(!Az.byRule(4).length && !(Ap?.byRule(4).length), 'voldoet', 'info_nodig', `zakelijk ${Az.byRule(4).length}×${Ap ? ` · privé ${Ap.byRule(4).length}×` : ''}`),
    D5: () => facts(!risk('belastingachterstand').length, 'voldoet', 'info_nodig', risk('belastingachterstand')[0]?.wat ?? 'Geen naheffing, regeling of achterstallige aangifte'),
    D6: () => byNorm('roodstandDagenPerMaand', norm => negMonthMax <= norm, `max ${negMonthMax} dagen negatief in een maand · totaal ${Az.negativeDays}`),
    D7: () => { const group = Az.related.filter(item => item.role === 'Groepsmaatschappij'); return group.length ? { voorstel: 'info_nodig', feiten: group.map(item => `${item.name}: in ${eur(item.in)}, uit ${eur(item.out)}${item.loan ? ' (lening)' : ''}`).join(' · ') } : { voorstel: 'voldoet', feiten: 'Geen groepsmaatschappij in de transacties' }; },
    E1a: () => ({ voorstel: dgaSalary12 ? 'niet_beoordeeld' : 'info_nodig', feiten: dgaSalary12 ? `Loon DGA ${eur(dgaSalary12)} per jaar (${eur(dgaSalary12 / 12)}/mnd) · toets gebruikelijk loon (actuele norm Belastingdienst)` : 'Geen loon DGA herkend' }),
    E1b: () => ({ voorstel: 'niet_beoordeeld', feiten: Az.memberDraws.map(member => `${member.name}: opnamen ${eur(member.out)}, stortingen ${eur(member.in)}`).join(' · ') || 'Geen opnamen zichtbaar' }),
    E2: () => ({ voorstel: 'niet_beoordeeld', feiten: `Naar leden buiten loon ${eur(outflow(Az.drawRows))}, van leden ${eur(inflow(Az.depositRows))}` }),
    E3: () => { const per = Az.capacityBase.perMember ?? []; return { voorstel: per.length && per.every(member => member.fixed.known) && NORMEN.leefgeldPerMaand != null ? 'niet_beoordeeld' : 'info_nodig', feiten: per.map(member => `${member.name}: ${eur(member.used)}/mnd (${member.basis}; opnamen ${eur(member.actual)}, vaste lasten ${member.fixed.known ? eur(member.fixed.monthly) : 'onbekend'})`).join(' · ') + (NORMEN.leefgeldPerMaand == null ? ' · leefgeld niet ingesteld' : '') }; },
    E3b: () => { const fixed = members.map(member => ({ member, fixed: privateFixedCosts(member.id) })); return { voorstel: 'niet_beoordeeld', feiten: fixed.map(({ member, fixed: item }) => `${memberName(member)}: vaste privélasten ${item.known ? `${eur(item.monthly)}/mnd` : 'onbekend'}`).join(' · ') + ` · loon DGA ${eur(dgaSalary12 / 12)}/mnd` }; },
    E4: () => facts(!risk('gokken').length, 'voldoet', 'info_nodig', [risk('gokken')[0]?.wat, risk('crypto')[0]?.wat].filter(Boolean).join(' · ') || 'Geen gokken of crypto'),
    E5: () => facts(!risk('herkomst').length && !risk('onverklaard').length, 'voldoet', 'info_nodig', [risk('herkomst')[0]?.wat, risk('onverklaard')[0]?.wat].filter(Boolean).join(' · ') || 'Geen onverklaarde grote ontvangsten'),
    E6: () => facts(!risk('vermenging').length, 'voldoet', 'info_nodig', risk('vermenging')[0]?.wat ?? 'Geen privébelasting van de bv-rekening'),
    E7: () => { const mixed = accounts.filter(account => account.role === 'gemengd'); return mixed.length ? { voorstel: 'niet_beoordeeld', feiten: `Gemengde rekening ${mixed.map(account => account.iban.slice(-4)).join(', ')}: privé apart gezet ${eur(sum(Az.related.filter(item => /^Privé-/.test(item.role)).map(item => item.in + item.out)))} · bevestig de scheiding` } : { voorstel: 'nvt', feiten: 'Geen gemengde rekening' }; },
    E8: () => facts(memberAccounts.every(item => item.accounts.length), 'voldoet', 'info_nodig', memberAccounts.map(item => `${memberName(item.member)}: ${item.accounts.length ? 'privé gedeeld' : 'privé ontbreekt'}`).join(' · ')),
    F0: () => ({ voorstel: 'niet_beoordeeld', feiten: `${legal}: ${Az.deductionLines.map(line => `${line.label} ${eur(sum(line.values) / 12)}/mnd`).join(' · ')}` }),
    F1: () => byNorm('dscrMinimum', norm => cap.dscrAfter >= norm, `DSCR ${Number.isFinite(cap.dscrAfter) ? dec(cap.dscrAfter) : '-'} (incl. nieuwe last ${eur(cap.newMonthly)}/mnd)`),
    F2: () => byNorm('dscrSlechtsteGeval', norm => cap.worst.dscr >= norm, `slechtste geval ${Number.isFinite(cap.worst.dscr) ? dec(cap.worst.dscr) : '-'}`),
    F3: () => ({ voorstel: cap.scenarios.negatief.room >= 0 ? 'voldoet' : 'info_nodig', feiten: `negatief scenario (omzet ${pctCore(cap.scenarios.negatief.omzet)}, variabele kosten mee${cap.scenarios.negatief.kosten ? `, extra kosten +${pctCore(cap.scenarios.negatief.kosten)}` : ''}): DSCR ${dec(cap.scenarios.negatief.dscr)}, ruimte ${eur(cap.scenarios.negatief.room)}/mnd · voorlopige percentages` }),
    F4: () => byNorm('ruimtePerMaand', norm => cap.room >= norm, `ruimte na nieuwe last ${eur(cap.room)}/mnd`),
    F5: () => INPUT.loan.months ? byNorm('looptijdMaandenMaximum', norm => INPUT.loan.months <= norm, `looptijd ${INPUT.loan.months} mnd${INPUT.loan.purposeMonths ? ` · levensduur doel ${INPUT.loan.purposeMonths} mnd` : ''}`) : { voorstel: 'niet_beoordeeld', feiten: 'Looptijd niet ingevuld' },
    G1: () => facts(!openRisks.length, 'voldoet', 'niet_beoordeeld', `${openRisks.length} van ${riskList.length} meldingen open`),
    G2: () => ({ voorstel: (INPUT.questions ?? []).every(question => question.answer || question.open) ? 'voldoet' : 'niet_beoordeeld', feiten: `${(INPUT.questions ?? []).length} vragen aan de klant` }),
    G3: () => { const notMet = Object.entries(INPUT.checklist).filter(([, value]) => value.status === 'voldoet_niet'); return facts(notMet.every(([, value]) => value.toelichting), 'voldoet', 'niet_beoordeeld', notMet.length ? `${notMet.length} × voldoet niet` : 'Geen afwijkingen'); },
    G4: () => facts(String(INPUT.conclusion ?? '').trim().length > 20, 'voldoet', 'niet_beoordeeld', INPUT.conclusion ? 'Conclusie ingevuld' : 'Nog geen conclusie'),
    G5: () => facts(String(INPUT.secondReviewer ?? '').trim(), 'voldoet', 'niet_beoordeeld', INPUT.secondReviewer ? `Akkoord: ${INPUT.secondReviewer}` : 'Nog niet door tweede beoordelaar gezien'),
  };
  return ACCEPTATIE.map(check => {
    const applies = !check.rechtsvorm || check.rechtsvorm.includes(legal);
    const auto = applies ? (P[check.id]?.() ?? { voorstel: 'niet_beoordeeld', feiten: '' }) : { voorstel: 'nvt', feiten: `Niet van toepassing bij ${legal}` };
    const own = INPUT.checklist[check.id];
    return { ...check, applies, ...auto, status: own?.status ?? null, toelichting: own?.toelichting ?? '', effective: own?.status ?? null };
  });
}
