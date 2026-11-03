'use strict';
/* ---------- Dataset laden: Loanwise-formaat en Enable Now-formaat, automatisch herkend ---------- */
const loadScript = url => new Promise((resolve, reject) => { const script = document.createElement('script'); script.src = url; script.onload = resolve; script.onerror = () => reject(new Error('Zip-lezer kon niet laden; laad de JSON-bestanden los.')); document.head.appendChild(script); });
async function readJsonTexts(files) {
  const texts = [];
  for (const file of files) {
    if (/\.zip$/i.test(file.name)) {
      if (!window.JSZip) await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js');
      const zip = await window.JSZip.loadAsync(file);
      for (const entry of Object.values(zip.files)) if (!entry.dir && /\.json$/i.test(entry.name) && !entry.name.startsWith('__MACOSX')) texts.push([entry.name, await entry.async('string')]);
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
  };
}
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
  texts.forEach(([name, text]) => {
    let parsed;
    try { parsed = JSON.parse(text); } catch (error) { throw new Error(`${name} is geen geldige JSON.`); }
    if (!collectEnableNow(parsed, found)) collectLoanwise(parsed, found);
  });
  const format = found.enableNow.length ? 'Enable Now' : found.loanwise.length ? 'Loanwise' : null;
  if (!format) throw new Error('Geen transacties gevonden. Laad PUT …/transactions (Loanwise) of GET /Transactions (Enable Now), los of in een zip.');
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
    const retail = profiles.length && profiles.filter(profile => profile === 'retail').length / profiles.length > 0.5;
    const isMember = memberNames.includes(String(account.name).toLowerCase()) || /\bh\.?o\.?d\.?n\b/i.test(account.name);
    account.role = ['zakelijk', 'prive', 'gemengd'].includes(account.role) ? account.role : (retail || (!profiles.length && isMember) ? 'prive' : 'zakelijk');
    account.kind = /spaar|deposito/i.test(account.name) ? 'Spaarrekening' : 'Betaalrekening';
    account.enabled = true;
    account.roleConfirmed = false;
  });
  /* leden: uit members (Loanwise), anders afgeleid uit de namen op privérekeningen; dubbelen samenvoegen */
  /* een gezamenlijke rekening ("M. Milkshake en K. Koekenbakker") levert beide personen op */
  const personNames = name => String(name).split(/\s+(?:en|eo|e\/o|&)\s+|\s*\/\s*/i).map(part => part.trim()).filter(Boolean);
  const rawMembers = found.members.length ? found.members : accounts.filter(account => account.role === 'prive').flatMap(account => personNames(account.name)).map(name => name.match(/^([A-Z])\S*\.?\s+(.+)$/)).filter(Boolean).map(match => ({ initials: `${match[1]}.`, last_name: match[2], derived: true }));
  /* eenmanszaak/vof zonder members en zonder privérekening: eigenaar afleiden uit "initiaal + achternaam" van een tegenpartij waarvan de achternaam in de bedrijfsnaam staat */
  if (!rawMembers.length && ['eenmanszaak', 'vof'].includes(legalForm) && company?.name) {
    const companyWords = String(company.name).toLowerCase().split(/[^a-zà-ÿ]+/);
    const candidates = [...new Set(rows.map(row => row.name).filter(name => /^[A-Z]\.\s?[A-Za-zÀ-ÿ'-]+$/.test(name ?? '')))];
    candidates.forEach(name => { const [, initial, surname] = name.match(/^([A-Z])\.\s?(.+)$/); if (companyWords.includes(surname.toLowerCase())) rawMembers.push({ initials: `${initial}.`, last_name: surname, derived: true, derivedHow: 'achternaam in bedrijfsnaam' }); });
  }
  const members = dedupeMembers(rawMembers, legalForm);
  suggestMixedAccounts(accounts, rows, legalForm, members);
  assignOwners(accounts, members);
  orderBySaldo(accounts, rows);
  finishBalances(accounts, rows);
  return {
    source: format, label: company?.name ?? accounts.find(account => account.role === 'zakelijk')?.name ?? 'Ingeladen dossier', files: texts.length,
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
