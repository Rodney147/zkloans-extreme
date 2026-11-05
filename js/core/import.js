'use strict';
/* ---------- Dataset laden: Loanwise-formaat en Enable Now-formaat, automatisch herkend ---------- */
const loadScript = url => new Promise((resolve, reject) => { const script = document.createElement('script'); script.src = url; script.onload = resolve; script.onerror = () => reject(new Error('Zip-lezer kon niet laden; laad de JSON-bestanden los.')); document.head.appendChild(script); });
async function readJsonTexts(files) {
  const texts = [];
  for (const file of files) {
    if (/\.zip$/i.test(file.name)) {
      if (!window.JSZip) await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js');
      const zip = await window.JSZip.loadAsync(file);
      for (const entry of Object.values(zip.files)) if (!entry.dir && /\.(json|csv)$/i.test(entry.name) && !entry.name.startsWith('__MACOSX')) texts.push([entry.name, await entry.async('string')]);
    } else texts.push([file.name, await file.text()]);
  }
  return texts;
}

/* Loanwise: POST /households (members, accounts) en PUT …/transactions (bedragen in centen) */
const LOANWISE_TYPES = ['banking_costs', 'cash_terminal', 'ideal', 'internal_transfer', 'miscellaneous', 'payment_terminal', 'reversal', 'savings', 'direct_debit', 'transfer', 'salary', 'unknown'];
function collectLoanwise(node, found, parentAccount = null) {
  if (Array.isArray(node)) { node.forEach(item => collectLoanwise(item, found, parentAccount)); return; }
  if (!node || typeof node !== 'object') return;
  if ('booking_date' in node && 'transaction_amount' in node) { found.loanwise.push({ ...node, account_number: node.account_number ?? parentAccount }); return; }
  if (Array.isArray(node.members)) found.members.push(...node.members);
  if (node.legal_form) found.legalForm = String(node.legal_form).toLowerCase();
  if (node.stated_revenue != null) found.stated = { revenue: Number(node.stated_revenue) / 100 };
  if (node.company && typeof node.company === 'object') found.company = node.company;
  if ('account_number' in node && !('booking_date' in node)) found.loanwiseAccounts.push(node);
  Object.entries(node).forEach(([key, value]) => { if (value && typeof value === 'object' && key !== 'members') collectLoanwise(value, found, node.account_number ?? parentAccount); });
}
/* Enable Now: /Accounts, /Transactions, /v2/consents en de analyse-job (los of met request/response_200) */
function collectEnableNow(parsed, found) {
  const body = parsed?.response_200 ?? parsed;
  if (!body || typeof body !== 'object') return false;
  if (body.analysis || body.generalInfo || body.clientProfile) { found.analyses.push({ profile: parsed?.request?.body?.profile ?? body.profile ?? null, analysis: body.analysis ?? body }); return true; }
  if (body.data && !Array.isArray(body.data) && body.data.providerKey) { found.consents.push(body.data); return true; }
  const list = Array.isArray(body) ? body : Array.isArray(body.data) ? body.data : Array.isArray(body.transactions) ? body.transactions : Array.isArray(body.accounts) ? body.accounts : null;
  if (!list?.length) return false;
  if ('bookDate' in list[0] && 'amount' in list[0]) { found.enableNow.push(...list); return true; }
  if ('iban' in list[0] && !('account_number' in list[0])) { found.enableNowAccounts.push(...list.map(account => ({ ...account, consentId: account.consentId ?? parsed?.request?.query?.ConsentId ?? null }))); return true; }
  if ('providerKey' in list[0]) { found.consents.push(...list); return true; }
  return false;
}

function fromLoanwise(row, index) {
  const cents = Number(row.transaction_amount?.amount ?? row.transaction_amount);
  return {
    id: String(row.external_id ?? `lw-${index}`), account: normalizeIban(row.account_number), date: String(row.booking_date).slice(0, 10), amount: round2(cents / 100),
    name: row.counter_party_name || null, counterAccount: normalizeIban(row.counter_party_account), description: String(row.remittance_information_unstructured ?? ''),
    type: LOANWISE_TYPES.includes(row.transaction_type) ? row.transaction_type : 'unknown', balanceAfter: null, e1: row.category?.e1 ? normalizeE1(row.category.e1) : null,
    source: loanwiseCategory(row.category),
  };
}
/* Loanwise-categorie: als tekst ("groceries") of als object ({ id, name }) */
const loanwiseCategory = value => {
  const name = typeof value === 'string' ? value : value && typeof value === 'object' && !value.e1 ? (value.name ?? value.code ?? value.key) : null;
  return name && String(name).trim() ? { system: 'Loanwise', category: String(name).trim().toLowerCase() } : null;
};
const normalizeE1 = e1 => ({ category: e1.category, confidence: Number(e1.confidence ?? 0), flags: e1.flags ?? [], profile: e1.model?.profile ?? e1.profile ?? null });
/* Enable Now kent geen transaction_type: afleiden met vaste regels uit E1-flags en categorie, met de bron erbij */
function deriveType(row) {
  const flags = row.category?.e1?.flags ?? [];
  const category = row.category?.e1?.category ?? '';
  if (flags.includes('reversal_payment') || /terugboeking|storno/i.test(row.description ?? '')) return ['reversal', flags.includes('reversal_payment') ? 'E1-flag reversal_payment' : 'omschrijving'];
  if (category === 'expense.operations.bank_fees') return ['banking_costs', 'E1-categorie bank_fees'];
  if (category.startsWith('cash.') || /geldautomaat|geldopname/i.test(row.description ?? '')) return ['cash_terminal', category.startsWith('cash.') ? 'E1-categorie cash' : 'omschrijving'];
  return [null, null];
}
function fromEnableNow(row) {
  const [type, typeSource] = deriveType(row);
  return {
    id: String(row.id), account: normalizeIban(row.accountNumber), accountId: row.accountId ?? null, date: String(row.bookDate).slice(0, 10), time: row.transactionDateTime ?? '', amount: round2(Number(row.amount)),
    name: row.counterpartDescription || null, counterAccount: normalizeIban(row.counterpartAccountNumber), description: String(row.description ?? ''),
    type, typeSource, balanceAfter: row.balanceAfterTransaction != null ? Number(row.balanceAfterTransaction) : null, e1: row.category?.e1 ? normalizeE1(row.category.e1) : null,
  };
}

/* Binnen één dag bepaalt het saldo na transactie de volgorde (tijdstempels van banken zijn niet altijd betrouwbaar) */
function orderBySaldo(accounts, rows) {
  accounts.forEach(account => {
    const own = rows.filter(row => row.account === account.iban);
    if (!own.length || own.some(row => row.balanceAfter == null)) return;
    let previous = round2((account.balance ?? own.at(-1).balanceAfter) - sum(own.map(row => row.amount)));
    const ordered = [];
    groupBy(own, row => row.date).forEach(day => {
      const left = [...day];
      while (left.length) {
        const index = Math.max(0, left.findIndex(row => Math.abs(round2(previous + row.amount) - row.balanceAfter) < 0.01));
        const [next] = left.splice(index, 1);
        ordered.push(next);
        previous = next.balanceAfter;
      }
    });
    ordered.forEach((row, index) => { row.order = index; });
  });
  rows.sort((first, second) => first.date.localeCompare(second.date) || first.account.localeCompare(second.account) || first.order - second.order);
}
function finishBalances(accounts, rows) {
  accounts.forEach(account => {
    const own = rows.filter(row => row.account === account.iban);
    const known = [...own].reverse().find(row => row.balanceAfter != null);
    if (account.balance == null) account.balance = known ? known.balanceAfter + sum(own.filter(row => row.date > known.date || (row.date === known.date && own.indexOf(row) > own.indexOf(known))).map(row => row.amount)) : null;
    account.reportedBalance = account.balance;
    account.startBalance = account.balance != null ? round2(account.balance - sum(own.map(row => row.amount))) : 0;
    let balance = account.startBalance;
    own.forEach(row => { balance = round2(balance + row.amount); row.computedBalance = balance; if (row.balanceAfter == null) row.balanceAfter = balance; });
  });
}

async function readDataset(files) {
  const found = { loanwise: [], loanwiseAccounts: [], members: [], legalForm: null, company: null, enableNow: [], enableNowAccounts: [], consents: [], analyses: [] };
  const texts = await readJsonTexts(files);
  found.csv = [];
  texts.forEach(([name, text]) => {
    if (/\.csv$/i.test(name) || !/^\s*[[{]/.test(text)) { found.csv.push(...collectCsv(name, text)); return; }
    let parsed;
    try { parsed = JSON.parse(text); } catch (error) { throw new Error(`${name} is geen geldige JSON.`); }
    if (!collectEnableNow(parsed, found)) collectLoanwise(parsed, found);
  });
  const format = found.enableNow.length ? 'Enable Now' : found.loanwise.length ? 'Loanwise' : found.csv.length ? 'CSV' : null;
  if (!format) throw new Error('Geen transacties gevonden. Laad een Loanwise-CSV, PUT …/transactions (Loanwise-JSON) of GET /Transactions (Enable Now), los of in een zip.');
  let rows, accounts;
  if (format === 'Enable Now') {
    rows = [...new Map(found.enableNow.map(row => [row.id, fromEnableNow(row)])).values()];
    const consentOf = id => found.consents.find(consent => consent.id === id) ?? (found.consents.length === 1 ? found.consents[0] : null);
    accounts = found.enableNowAccounts.length
      ? [...new Map(found.enableNowAccounts.map(account => [account.id ?? account.iban, account])).values()].map(account => {
          const consent = consentOf(account.consentId);
          return { iban: normalizeIban(account.iban), accountId: account.id ?? null, name: account.accountHolder ?? account.accountName ?? account.iban, bank: bankFromKey(consent?.providerKey) ?? bankFromIban(normalizeIban(account.iban)), sharedOn: consent?.dateRequested ? String(consent.dateRequested).slice(0, 10) : null, balance: account.accountBalance?.amount ?? account.balance ?? null };
        })
      : [];
    rows.forEach(row => { const match = accounts.find(account => account.accountId && account.accountId === row.accountId); if (match) row.account = match.iban; });
  } else if (format === 'CSV') {
    ({ rows, accounts } = fromCsv(found.csv));
    found.members.push(...csvMembers(found.csv));
  } else {
    rows = found.loanwise.map(fromLoanwise);
    accounts = [...new Map(found.loanwiseAccounts.map(account => [normalizeIban(account.account_number), account])).values()].map(account => ({
      iban: normalizeIban(account.account_number), name: account.account_name ?? account.account_number, bank: bankFromIban(normalizeIban(account.account_number)) ?? account.bic ?? null, sharedOn: account.shared_on ?? null,
      balance: account.account_balance != null ? Number(account.account_balance?.amount ?? account.account_balance) / 100 : null, role: account.role ?? null,
    }));
  }
  const withoutAccount = rows.filter(row => !row.account);
  if (withoutAccount.length) throw new Error(`${withoutAccount.length} transacties hebben geen rekeningnummer (account_number of accountNumber).`);
  rows.forEach(row => { if (!accounts.some(account => account.iban === row.account)) accounts.push({ iban: row.account, name: row.account, bank: bankFromIban(row.account), sharedOn: null, balance: null }); });
  /* volgorde zoals de bank boekt: datum, dan tijdstip; zonder tijdstip de volgorde in het bestand */
  rows.forEach((row, index) => { row.order = index; });
  rows.sort((first, second) => first.date.localeCompare(second.date) || String(first.time ?? '').localeCompare(String(second.time ?? '')) || (format === 'Enable Now' ? second.order - first.order : first.order - second.order));
  found.analyses.forEach(entry => { entry.profile = entry.profile ?? (entry.analysis.companyInfo ? 'corporate' : 'retail'); });
  const analyses = Object.fromEntries(found.analyses.map(entry => [entry.profile, entry.analysis]));
  const company = found.company ?? analyses.corporate?.companyInfo ?? null;
  const legalForm = normalizeLegalForm(found.legalForm ?? company?.legalForm ?? (found.loanwise.length ? null : null)) ?? 'eenmanszaak';
  const memberNames = found.members.map(member => memberName(member).toLowerCase());
  accounts.forEach(account => {
    const profiles = rows.filter(row => row.account === account.iban && row.e1?.profile).map(row => row.e1.profile);
    const sourced = rows.filter(row => row.account === account.iban && row.source);
    /* rol voorstellen: E1-profiel, anders het aandeel privéposten in de Loanwise-categorieën (≥ 20% = privé) */
    const retail = profiles.length ? profiles.filter(profile => profile === 'retail').length / profiles.length > 0.5 : sourced.length ? sourced.filter(row => SOURCE_PRIVATE.has(row.source.category)).length / sourced.length >= 0.2 : false;
    const isMember = memberNames.includes(String(account.name).toLowerCase()) || /\bh\.?o\.?d\.?n\b/i.test(account.name);
    account.role = ['zakelijk', 'prive', 'gemengd'].includes(account.role) ? account.role : (retail || (!profiles.length && !sourced.length && isMember) ? 'prive' : 'zakelijk');
    account.kind = /spaar|deposito/i.test(account.name) ? 'Spaarrekening' : 'Betaalrekening';
    account.enabled = true;
    account.roleConfirmed = false;
  });
  /* leden: uit members (Loanwise), anders afgeleid uit de namen op privérekeningen; dubbelen samenvoegen */
  /* een gezamenlijke rekening ("M. Milkshake en K. Koekenbakker") levert beide personen op */
  const personNames = name => String(name).split(/\s+(?:en|eo|e\/o|&)\s+|\s*\/\s*/i).map(part => part.trim()).filter(Boolean);
  const rawMembers = found.members.length ? found.members : accounts.filter(account => account.role === 'prive' && !account.nameUnknown).flatMap(account => personNames(account.name)).map(name => name.match(/^([A-Z])\S*\.?\s+(.+)$/)).filter(Boolean).map(match => ({ initials: `${match[1]}.`, last_name: match[2], derived: true }));
  /* eenmanszaak/vof zonder members en zonder privérekening: eigenaar afleiden uit "initiaal + achternaam" van een tegenpartij waarvan de achternaam in de bedrijfsnaam staat */
  if (!rawMembers.length && ['eenmanszaak', 'vof'].includes(legalForm) && company?.name) {
    const companyWords = String(company.name).toLowerCase().split(/[^a-zà-ÿ]+/);
    const candidates = [...new Set(rows.map(row => row.name).filter(name => /^[A-Z]\.\s?[A-Za-zÀ-ÿ'-]+$/.test(name ?? '')))];
    candidates.forEach(name => { const [, initial, surname] = name.match(/^([A-Z])\.\s?(.+)$/); if (companyWords.includes(surname.toLowerCase())) rawMembers.push({ initials: `${initial}.`, last_name: surname, derived: true, derivedHow: 'achternaam in bedrijfsnaam' }); });
  }
  /* privérekening(en) zonder bekende eigenaar: plaatshouder, zodat geld tussen zaak en privé geen interne boeking wordt */
  if (!rawMembers.length && accounts.some(account => account.role !== 'zakelijk')) rawMembers.push({ initials: '', last_name: 'Aanvrager', derived: true, placeholder: true });
  const members = dedupeMembers(rawMembers, legalForm);
  suggestMixedAccounts(accounts, rows, legalForm, members);
  assignOwners(accounts, members);
  orderBySaldo(accounts, rows);
  finishBalances(accounts, rows);
  return {
    source: format, label: company?.name ?? accounts.find(account => account.role === 'zakelijk' && !account.nameUnknown)?.name ?? 'Ingeladen dossier', files: texts.length,
    legalForm, members, company, accounts, transactions: rows, analyses: Object.keys(analyses).length ? analyses : null, knownSuppliers: [],
    consents: found.consents, stated: found.stated ?? null,
  };
}

/* ---------- Rechtsvorm, leden en eigenaar per rekening ---------- */
function normalizeLegalForm(value) {
  if (!value) return null;
  const text = String(value).toLowerCase().replace(/\./g, '');
  if (/eenmanszaak|zzp/.test(text)) return 'eenmanszaak';
  if (/vennootschap onder firma|\bvof\b/.test(text)) return 'vof';
  if (/maatschap/.test(text)) return 'vof';
  if (/besloten vennootschap|\bbv\b/.test(text)) return 'bv';
  if (/naamloze vennootschap|\bnv\b/.test(text)) return 'bv';
  if (/holding/.test(text)) return 'bv';
  return text;
}
const memberName = member => `${member.initials ?? ''} ${member.last_name_prefix ? `${member.last_name_prefix} ` : ''}${member.last_name ?? ''}`.trim();
const MEMBER_ROLE = { bv: 'DGA', eenmanszaak: 'Eigenaar', vof: 'Vennoot' };
function dedupeMembers(list, legalForm) {
  const seen = new Map();
  list.forEach(member => {
    const key = `${String(member.initials ?? '').replace(/\./g, '').charAt(0).toLowerCase()}|${String(member.last_name ?? '').toLowerCase()}|${String(member.last_name_prefix ?? '').toLowerCase()}`;
    if (!seen.has(key)) seen.set(key, { ...member });
  });
  return [...seen.values()].map((member, index) => ({ ...member, id: member.id ?? `m${index + 1}`, role: member.role ?? MEMBER_ROLE[legalForm] ?? 'Eigenaar' }));
}
/* Wie is eigenaar van een rekening: zakelijk = de onderneming; privé of gemengd = het lid wiens naam erop staat */
function ownerForName(name, members) {
  const lower = String(name ?? '').toLowerCase();
  const match = members.find(member => {
    const surname = `${member.last_name_prefix ? `${member.last_name_prefix} ` : ''}${member.last_name ?? ''}`.toLowerCase();
    return surname && lower.includes(surname) && (lower.startsWith(String(member.initials ?? '').charAt(0).toLowerCase()) || lower.includes(` ${String(member.initials ?? '').charAt(0).toLowerCase()}`));
  });
  return match?.id ?? null;
}
function assignOwners(accounts, members) {
  accounts.forEach(account => {
    if (account.owner) return;
    account.owner = account.role === 'zakelijk' ? 'onderneming' : ownerForName(account.name, members) ?? members[0]?.id ?? 'onderneming';
    /* gezamenlijke rekening: alle leden op de naam zijn mede-eigenaar (één huishouden) */
    const coOwners = String(account.name).split(/\s+(?:en|eo|e\/o|&)\s+|\s*\/\s*/i).map(part => ownerForName(part, members)).filter(Boolean);
    if (account.role !== 'zakelijk' && new Set(coOwners).size > 1) account.coOwners = [...new Set(coOwners)];
  });
}
/* Eenmanszaak met één rekening op eigen naam met zowel klanten als huishouden: voorstel "gemengd" */
function suggestMixedAccounts(accounts, rows, legalForm, members) {
  if (legalForm !== 'eenmanszaak') return;
  accounts.forEach(account => {
    if (account.role === 'gemengd') return;
    const own = rows.filter(row => row.account === account.iban);
    const privateRows = own.filter(row => (row.amount < 0 && (GEMENGD.privéUitgaveNaam.test(row.name ?? '') || GEMENGD.privéUitgaveE1.test(row.e1?.category ?? ''))) || (row.amount > 0 && GEMENGD.privéInkomenNaam.test(row.name ?? '')));
    const invoices = own.filter(row => row.amount > 0 && /factuur|nota|\b20\d{2}-\d{2,}/i.test(row.description));
    const onOwnName = ownerForName(account.name, members) || /h\.?o\.?d\.?n/i.test(account.name);
    const outgoing = own.filter(row => row.amount < 0).length;
    if (onOwnName && privateRows.length >= 6 && invoices.length >= 6 && privateRows.length / Math.max(1, outgoing) >= 0.15) { account.role = 'gemengd'; account.roleSuggested = 'gemengd: klanten én huishouden op één rekening'; }
  });
}

/* ---------- Loanwise-CSV ----------
   1. Databaseexport zonder kopregel, herkend op het aantal kolommen:
      - 19 kolommen: id, rekening-id, boekdatum, in/out, transaction_type, bedrag (euro), valuta, saldo na, counter_party_account,
        soort tegenpartij, counter_party_name, remittance_information_unstructured, -, categorie-id, categorie, -, -, extern id (met eigen IBAN), aangemaakt.
      - 18 kolommen (oudere export): zonder counter_party_name vóór de omschrijving; die staat dan ná de omschrijving.
   2. CSV met kopregel, kolommen op naam volgens de Loanwise-API (POST /households, POST …/accounts, PUT …/transactions):
      account_name, account_number, bic, account_balance, booking_date, transaction_amount.amount (centen) of amount (euro),
      currency, remittance_information_unstructured, counter_party_name, counter_party_account, transaction_type, external_id, category,
      en optioneel members: member_initials, member_last_name. Komma of puntkomma; Nederlandse bedragnotatie mag. */
const CSV_LAYOUTS = {
  19: ['id', 'account_id', 'booking_date', 'direction', 'transaction_type', 'amount', 'currency', 'balance_after', 'counter_party_account', 'counter_party_kind', 'counter_party_name', 'description', 'unused', 'category_id', 'category', 'merchant_id', 'counter_party_id', 'external_id', 'created_at'],
  18: ['id', 'account_id', 'booking_date', 'direction', 'transaction_type', 'amount', 'currency', 'balance_after', 'counter_party_account', 'counter_party_kind', 'description', 'counter_party_name', 'category_id', 'category', 'merchant_id', 'counter_party_id', 'external_id', 'created_at'],
};
const CSV_ALIASES = {
  remittance_information_unstructured: 'description', omschrijving: 'description',
  'transaction_amount.amount': 'amount_cents', transaction_amount_amount: 'amount_cents', amount_cents: 'amount_cents',
  transaction_amount: 'amount', amount_eur: 'amount', bedrag: 'amount',
  'transaction_amount.currency': 'currency', balance_after_transaction: 'balance_after', balance: 'balance_after',
  category_name: 'category', 'category.name': 'category', categorie: 'category',
  iban: 'account_number', rekening: 'account_number', 'account_balance.amount': 'account_balance', counterparty_name: 'counter_party_name', counterparty_account: 'counter_party_account',
  'counter_party.name': 'counter_party_name', 'counter_party.account': 'counter_party_account', 'members.initials': 'member_initials', 'members.last_name': 'member_last_name',
};
function parseCsv(text) {
  const first = text.split('\n', 1)[0];
  const delimiter = (first.match(/;/g) ?? []).length > (first.match(/,/g) ?? []).length ? ';' : (first.match(/\t/g) ?? []).length > (first.match(/,/g) ?? []).length ? '\t' : ',';
  const rows = []; let row = [], field = '', quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) { if (char === '"') { if (text[index + 1] === '"') { field += '"'; index += 1; } else quoted = false; } else field += char; continue; }
    if (char === '"') quoted = true;
    else if (char === delimiter) { row.push(field); field = ''; }
    else if (char === '\n' || char === '\r') { if (char === '\r' && text[index + 1] === '\n') index += 1; row.push(field); field = ''; if (row.some(value => value !== '')) rows.push(row); row = []; }
    else field += char;
  }
  if (field !== '' || row.length) { row.push(field); if (row.some(value => value !== '')) rows.push(row); }
  return rows;
}
function collectCsv(name, text) {
  const table = parseCsv(text.replace(/^﻿/, ''));
  if (!table.length) return [];
  const header = table[0].map(cell => cell.trim().toLowerCase());
  const named = ['booking_date', 'amount', 'transaction_amount', 'transaction_amount.amount', 'remittance_information_unstructured'].some(key => header.includes(key));
  let columns;
  if (named) columns = header.map(cell => CSV_ALIASES[cell] ?? cell);
  else {
    const width = Math.max(...table.slice(0, 20).map(cells => cells.length));
    columns = CSV_LAYOUTS[width] ?? (width > 19 ? CSV_LAYOUTS[19] : null);
    if (!columns) throw new Error(`${name}: onbekende CSV-indeling (${width} kolommen, geen kopregel). Verwacht een Loanwise-export (18 of 19 kolommen) of een kopregel met booking_date en transaction_amount.`);
  }
  return (named ? table.slice(1) : table).map(cells => Object.fromEntries(columns.map((column, index) => [column, (cells[index] ?? '').trim()])));
}
const parseAmount = value => { const text = String(value ?? '').trim().replace(/^€\s*/, ''); if (!text) return null; const normal = /,\d{1,4}$/.test(text) && !/\.\d{1,4}$/.test(text) ? text.replace(/\./g, '').replace(',', '.') : text.replace(/,/g, ''); const number = Number(normal); return Number.isFinite(number) ? number : null; };
/* Naam van de tegenpartij uit de omschrijving als de kolom leeg is: ING ("Naam: … Omschrijving:"), pinbetalingen (voor "Pasvolgnr" of ">") */
function nameFromDescription(description, type) {
  const text = String(description ?? '');
  const ing = text.match(/Naam:\s*(.+?)\s+(?:Omschrijving|IBAN|Kenmerk|Datum\/Tijd):/i);
  if (ing) return { name: ing[1].replace(/\s+via\s+.+$/i, '').trim(), how: 'omschrijving (Naam:)' };
  if (type === 'payment_terminal' || type === 'cash_terminal' || /Pasvolgnr|MCC:\d{4}/.test(text)) {
    const card = text.split(/\s*>|\s+Pasvolgnr/)[0].replace(/\s+NLD$|\s+DEU$|\s+BEL$/i, '').replace(/^(CCV|BCK|SumUp|ZTL|PAY)\s*\*\s*/i, '').trim();
    if (card && card.length <= 40) return { name: card, how: 'omschrijving (pinbetaling)' };
  }
  return { name: null, how: null };
}
const ownIbanFrom = value => String(value ?? '').match(/(?:^|[.\s|])([A-Z]{2}\d{2}[A-Z]{4}\d{6,})(?:[.\s|]|$)/)?.[1] ?? null;
function fromCsv(records) {
  const accountOfId = new Map();
  records.forEach(record => { const iban = normalizeIban(record.account_number) ?? ownIbanFrom(record.external_id); if (iban && record.account_id) accountOfId.set(record.account_id, iban); });
  const seen = new Set();
  const rows = records.filter(record => record.booking_date && !(record.id && seen.has(record.id)) && (seen.add(record.id), true)).map((record, index) => {
    const account = normalizeIban(record.account_number) ?? accountOfId.get(record.account_id) ?? ownIbanFrom(record.external_id) ?? (record.account_id ? `REKENING-${record.account_id}` : null);
    let amount = record.amount_cents !== undefined && record.amount_cents !== '' ? (parseAmount(record.amount_cents) ?? 0) / 100 : parseAmount(record.amount);
    if (amount != null && record.direction === 'out' && amount > 0) amount = -amount;
    const type = LOANWISE_TYPES.includes(record.transaction_type) ? record.transaction_type : 'unknown';
    const parsed = record.counter_party_name ? { name: record.counter_party_name, how: null } : nameFromDescription(record.description, type);
    return {
      id: String(record.id || record.external_id || `csv-${index}`), account, date: String(record.booking_date).slice(0, 10), amount: round2(amount ?? 0),
      name: parsed.name, nameSource: parsed.how, counterAccount: normalizeIban(record.counter_party_account), description: String(record.description ?? '').replace(/\s{2,}/g, ' ').trim(),
      type, balanceAfter: parseAmount(record.balance_after), e1: null, source: loanwiseCategory(record.category),
    };
  });
  /* rekeningen: naam uit account_name, anders uit wat andere eigen rekeningen over deze IBAN zeggen; eindsaldo uit account_balance of de keten van saldi */
  const ibans = [...new Set(rows.map(row => row.account))];
  const accounts = ibans.map(iban => {
    const own = records.find(record => (normalizeIban(record.account_number) ?? accountOfId.get(record.account_id)) === iban && record.account_name);
    const named = rows.filter(row => row.counterAccount === iban && row.account !== iban && row.name);
    const counts = new Map(); named.forEach(row => counts.set(row.name, (counts.get(row.name) ?? 0) + 1));
    const holder = own?.account_name ?? [...counts.entries()].sort((first, second) => second[1] - first[1])[0]?.[0] ?? null;
    const reported = records.find(record => (normalizeIban(record.account_number) ?? accountOfId.get(record.account_id)) === iban && record.account_balance)?.account_balance;
    const withBalance = rows.filter(row => row.account === iban && row.balanceAfter != null);
    let balance = reported != null ? parseAmount(reported) : null;
    if (balance == null && withBalance.length) {
      /* op de laatste boekdag de transactie waarvan het saldo niet het beginsaldo van een andere is (de export staat niet in boekvolgorde) */
      const lastDay = withBalance.reduce((max, row) => row.date > max ? row.date : max, withBalance[0].date);
      const dayRows = withBalance.filter(row => row.date === lastDay);
      const before = new Set(dayRows.map(row => round2(row.balanceAfter - row.amount)));
      balance = round2((dayRows.find(row => !before.has(round2(row.balanceAfter))) ?? dayRows.at(-1)).balanceAfter);
    }
    return { iban, name: holder ?? `Rekening ${bankFromIban(iban) ?? ''} ${iban.slice(-4)}`.replace(/\s+/g, ' '), nameUnknown: !holder, bank: bankFromIban(iban) ?? own?.bic ?? null, sharedOn: null, balance };
  });
  return { rows, accounts };
}
/* leden uit een CSV met kopregel (member_initials, member_last_name), zoals members bij POST /households */
const csvMembers = records => [...new Map(records.filter(record => record.member_last_name).map(record => [`${record.member_initials}|${record.member_last_name}`, { initials: record.member_initials, last_name: record.member_last_name }])).values()];

/* ---------- Loanwise-categorieën: Nederlandse naam en privé-aard ---------- */
const SOURCE_LABEL = { 'uncategorized': 'Ongecategoriseerd', 'other online payments': 'Overige online betalingen', 'checking accounts': 'Eigen of bekende rekeningen', 'other offline payments': 'Overige betalingen', 'groceries': 'Boodschappen', 'shopping': 'Winkelen', 'services': 'Diensten', 'bank fees': 'Bankkosten', 'online shopping': 'Online winkelen', 'food & drinks': 'Eten en drinken', 'payment requests': 'Betaalverzoeken', 'fuel': 'Brandstof', 'other taxes': 'Overige belastingen', 'telecom': 'Telefoon en internet', 'health insurance': 'Zorgverzekering', 'possible income': 'Mogelijk inkomen', 'property & casualty insurance': 'Schadeverzekeringen', 'renovation': 'Verbouwing', 'road taxes': 'Motorrijtuigenbelasting', 'other insurance': 'Overige verzekeringen', 'paypal': 'PayPal', 'possible related bank accounts': 'Mogelijk verbonden rekeningen', 'food delivery services': 'Maaltijdbezorging', 'personal care': 'Persoonlijke verzorging', 'rent': 'Huur', 'water': 'Water', 'funeral insurance': 'Uitvaartverzekering', 'consumer loans': 'Consumptief krediet', 'disability benefits': 'Arbeidsongeschiktheidsuitkering', 'municipal taxes': 'Gemeentelijke belastingen', 'alimony': 'Alimentatie', 'energy': 'Energie', 'online gaming': 'Online gaming', 'parking': 'Parkeren', 'medical': 'Medisch', 'possible gambling': 'Mogelijk gokken', 'entertainment': 'Uitgaan en ontspanning', 'mortgage loans': 'Hypotheek', 'vacation': 'Vakantie', 'health insurance benefits': 'Vergoeding zorgverzekeraar', 'housing benefits': 'Huurtoeslag', 'other mobility': 'Overige mobiliteit', 'other clubs and associations': 'Verenigingen', 'salary': 'Salaris', 'benefits': 'Uitkeringen', 'child benefits': 'Kinderbijslag', 'income taxes': 'Inkomstenbelasting', 'savings': 'Sparen', 'cash withdrawals': 'Geldopname', 'debt collection': 'Incasso en deurwaarder' };
const SOURCE_PRIVATE = new Set(['groceries', 'health insurance', 'personal care', 'alimony', 'mortgage loans', 'water', 'energy', 'municipal taxes', 'funeral insurance', 'disability benefits', 'housing benefits', 'health insurance benefits', 'vacation', 'entertainment', 'payment requests', 'food delivery services', 'medical', 'possible gambling', 'online gaming', 'rent', 'child benefits', 'benefits']);
const sourceLabel = source => source ? (SOURCE_LABEL[source.category] ?? source.category.charAt(0).toUpperCase() + source.category.slice(1)) : null;
const hasSource = () => DOSSIER.transactions.some(row => row.source);
