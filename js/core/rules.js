'use strict';
/* ---------- Categorieregels: eerste regel die past, bepaalt het kopje ---------- */
const RULES = [
  { id: 1, name: 'Intern', text: 'Tegenrekening is een gedeelde rekening van dezelfde eigenaar, of de naam is die van de rekeninghouder met een niet-gedeelde IBAN, of <code>transaction_type</code> is <code>internal_transfer</code>/<code>savings</code>, of “spaar”/“sparen” in naam of omschrijving.' },
  { id: 2, name: 'Terugboeking', text: '<code>transaction_type</code> <code>reversal</code>, omschrijving “terugboeking/storno”, of E1-flag <code>reversal_payment</code>.' },
  { id: 3, name: 'Belasting', text: `Tegenrekening Belastingdienst (${TAX_AUTHORITY_IBANS.map(formatIban).join(' tot 30-04-2026, daarna ')}) of naam gemeente/waterschap. Soort en jaar volgen uit het betalingskenmerk.` },
  { id: 4, name: 'Deurwaarder', text: 'Naam bevat deurwaarder, incassobureau of een bekende deurwaarderskantoornaam.' },
  { id: 5, name: 'Verbonden partij', text: 'Eigenaar of DGA (initiaal + achternaam van de aanvrager, of de gedeelde rekening van een andere eigenaar), of groep op omschrijving (managementfee, rekening-courant).' },
  { id: 6, name: 'Financiering', text: 'Naam of omschrijving bevat lease, lening, aflossing, krediet, financiering of hypotheek. Een bijschrijving is financiering ontvangen.' },
  { id: 7, name: 'Bankkosten', text: '<code>transaction_type</code> <code>banking_costs</code>, of de bank als tegenpartij met “kosten”/“pakket”.' },
  { id: 8, name: 'Lonen', text: '<code>transaction_type</code> <code>salary</code> of omschrijving salaris/loon.' },
  { id: 9, name: 'Contant', text: 'Afschrijving met <code>transaction_type</code> <code>cash_terminal</code> of geldautomaat/geldopname. Een contante storting is een debiteur.' },
  { id: 10, name: 'Debiteur', text: 'Overige bijschrijving: omzet (privé: inkomsten). Ook zonder tegenpartij, betaalverzoeken, contante stortingen en structurele bijschrijvingen bij een leverancier.' },
  { id: 11, name: 'Crediteur', text: 'Overige afschrijving, of een losse retour/creditnota van een leverancier: kosten (privé: uitgaven).' },
  { id: 12, name: 'Ongecategoriseerd', text: 'Bedrag 0.' },
];
const ruleName = id => overlay === 'prive' && id === 10 ? 'Inkomsten' : overlay === 'prive' && id === 11 ? 'Uitgaven' : RULES[id - 1].name;
const ruleRef = id => `<span class="rule-ref"><span class="rule-no">${id}</span>${ruleName(id)}</span>`;
const BAILIFF_PATTERN = /deurwaarder|incassobureau|incasso b\.?v|flanderijn|\bggn\b|legebeke|intrum|vesting finance/i;
const FINANCE_NAME_PATTERN = /lease|krediet|lening|financ|hypothe|obvion|creditcard|credit card|achteraf betalen|klarna|\bin3\b|riverty|\bduo\b/i;
const FINANCE_TEXT_PATTERN = /leasetermijn|aflossing|\blening|krediet|hypotheek|studieschuld/i;
const SAVINGS_PATTERN = /\b(spaar|sparen|spaarrekening|spaardeposito|spaargeld|spaarpot|bonusrente)\b|\bspaar[- ]?(rekening|deposito|geld|pot)/i;
const GROUP_TEXT_PATTERN = /management ?fee|managementvergoeding|rekening[- ]courant|\br\/c\b/i;
const REFUND_PATTERN = /retour|creditnota|terugbetaling|restitutie/i;
const GAMBLING_PATTERN = /casino|\btoto\b|unibet|bet365|jacks|lotto|loterij|kansino|betcity/i;
const CRYPTO_PATTERN = /bitvavo|coinbase|binance|kraken|bitonic/i;
const LEGAL_FORM_PATTERN = /\b(B\.?V\.?|V\.?O\.?F\.?|N\.?V\.?|C\.?V\.?|Holding|Stichting)\b/i;
const REFERENCE_PATTERN = /factuur|termijn|bestelling|order|nota|\b20\d{2}-\d{2,}/i;
const INVESTMENT_PATTERN = /lening|investering|kapitaal|storting|inleg|agio/i;
const escapeRegExp = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function memberProfile() {
  const members = DOSSIER.members ?? [];
  return members.map(member => ({ id: member.id, role: member.role ?? 'Eigenaar', label: memberName(member), initials: String(member.initials ?? '').replace(/\./g, '').toLowerCase(), surname: `${member.last_name_prefix ? `${member.last_name_prefix} ` : ''}${member.last_name ?? ''}`.trim().toLowerCase() })).filter(member => member.surname);
}
const memberById = id => memberProfile().find(member => member.id === id) ?? null;
/* Rollen binnen regel 5 die geld van of naar een lid (eigenaar, DGA, vennoot) betekenen */
const OWNER_ROLES = ['Eigenaar', 'DGA', 'Vennoot', 'Privé-uitgave'];
const isOwnerRole = role => OWNER_ROLES.includes(role);
function relatedRole(name) {
  if (!name) return null;
  const lower = name.toLowerCase();
  const company = String(DOSSIER.company?.name ?? '').toLowerCase();
  if (company && lower === company) return { role: 'Eigen onderneming', how: 'naam = bedrijfsnaam' };
  const members = memberProfile();
  /* eerst: is het een lid zelf (initiaal + achternaam)? Een partner die vennoot is, wordt zo vennoot en geen familie */
  for (const member of members) {
    const owner = new RegExp(`^${escapeRegExp(member.initials.charAt(0))}\\.?\\S*\\s*${escapeRegExp(member.surname)}$`, 'i');
    if (owner.test(name.trim())) return { role: member.role, memberId: member.id, how: `initiaal + achternaam van ${member.role.toLowerCase()} ${member.label}` };
  }
  return null;
}
const accountOf = iban => DOSSIER.accounts.find(account => account.iban === iban) ?? null;
const sharedHolderNames = () => new Set(DOSSIER.accounts.map(account => account.name.toLowerCase()).concat(DOSSIER.company?.name ? [DOSSIER.company.name.toLowerCase()] : []));

function categorize(row) {
  const name = row.name ?? '';
  const text = `${name} ${row.description}`;
  const own = accountOf(row.account);
  const counter = row.counterAccount ? accountOf(row.counterAccount) : null;
  if (counter) {
    /* intern alleen tussen rekeningen van dezelfde eigenaar; anders verbonden partij (bv ↔ DGA, vof ↔ vennoot, vennoot ↔ vennoot) */
    const sameOwner = counter.owner === own.owner;
    const otherRole = () => {
      if (own.owner === 'onderneming') { const member = memberById(counter.owner); return { role: member?.role ?? 'Eigenaar', memberId: counter.owner }; }
      if (counter.owner === 'onderneming') return { role: 'Eigen onderneming', memberId: own.owner };
      return { role: 'Ander lid', memberId: own.owner, otherMember: counter.owner };
    };
    if (counter.enabled === false) return sameOwner ? { rule: 1, how: 'gedeelde rekening, niet meegenomen', derived: 'own_off' } : { rule: 5, ...otherRole(), how: 'gedeelde rekening van een ander lid, niet meegenomen', derived: 'own_off' };
    if (!sameOwner && overlay !== 'samen') return { rule: 5, ...otherRole(), how: 'gedeelde rekening van een andere eigenaar', derived: 'owner_transfer' };
    return { rule: 1, how: sameOwner ? 'gedeelde rekening, zelfde eigenaar' : 'gedeelde rekening (weergave Samen)' };
  }
  /* aanpassing van de beoordelaar per tegenpartij (IBAN, anders naam): geldt voor al zijn transacties */
  const override = decisions[decisionKey('cat', counterpartyKey(row))];
  if (override && OVERRIDES[override]) return { ...OVERRIDES[override](row, own), how: 'aangepast door beoordelaar', override };
  if (['internal_transfer', 'savings'].includes(row.type) || (name && sharedHolderNames().has(name.toLowerCase()) && row.counterAccount)) return { rule: 1, how: row.type ? `transaction_type ${row.type}` : 'eigen naam, IBAN niet gedeeld', unshared: true };
  if (SAVINGS_PATTERN.test(name) || SAVINGS_PATTERN.test(row.description) || row.e1?.category === 'investment.savings') return { rule: 1, how: 'spaarrekening of sparen', unshared: true };
  if (row.type === 'reversal' || /terugboeking|storno|gestorneerd/i.test(row.description) || row.e1?.flags.includes('reversal_payment')) return { rule: 2 };
  const localTax = LOCAL_TAX_PATTERN.test(name) && (row.amount < 0 || /belasting|aanslag|heffing|teruggaaf/i.test(row.description)) && !REFERENCE_PATTERN.test(row.description.replace(/termijn/i, ''));
  if (TAX_AUTHORITY_IBANS.includes(row.counterAccount) || /belastingdienst/i.test(name) || localTax) return { rule: 3, tax: classifyTax(row) };
  if (BAILIFF_PATTERN.test(name)) return { rule: 4 };
  const related = relatedRole(name);
  if (related) return { rule: 5, ...related };
  if (GROUP_TEXT_PATTERN.test(row.description)) return { rule: 5, role: 'Groepsmaatschappij', how: 'omschrijving managementfee of rekening-courant' };
  /* gemengde rekening (vóór financiering, zodat een privéhypotheek geen zakelijke schuld wordt): privé-inkomen en huishoudelijke uitgaven zijn geen omzet of kosten */
  if (own.role === 'gemengd') {
    if (row.amount > 0 && (GEMENGD.privéInkomenNaam.test(name) || GEMENGD.privéInkomenE1.test(row.e1?.category ?? ''))) return { rule: 5, role: 'Privé-inkomen', memberId: own.owner, how: 'gemengde rekening: uitkering, toeslag of loon' };
    if (row.amount < 0 && (GEMENGD.privéUitgaveNaam.test(name) || GEMENGD.privéUitgaveE1.test(row.e1?.category ?? ''))) return { rule: 5, role: 'Privé-uitgave', memberId: own.owner, how: 'gemengde rekening: huishoudelijke uitgave' };
  }
  if (FINANCE_NAME_PATTERN.test(name) || FINANCE_TEXT_PATTERN.test(row.description)) return { rule: 6, how: row.amount > 0 ? 'financiering ontvangen' : null };
  if (row.type === 'banking_costs' || (/^(rabobank|ing|abn amro|knab|bunq|triodos|sns|asn)/i.test(name) && /kosten|pakket/i.test(row.description))) return { rule: 7 };
  if (row.type === 'salary' || /\bsalaris|\bloon\b|loonbetaling/i.test(row.description)) return { rule: 8 };
  if (row.amount < 0 && (row.type === 'cash_terminal' || /geldautomaat|geldopname|contant/i.test(text))) return { rule: 9 };
  if (!row.amount) return { rule: 12 };
  if (row.amount > 0 && (row.type === 'cash_terminal' || /storting|contant/i.test(text)) && !name) return { rule: 10, how: 'contante storting' };
  if (row.amount > 0 && !name && !row.counterAccount) return { rule: 10, how: 'zonder tegenpartij' };
  if (row.amount > 0 && (REFUND_PATTERN.test(row.description) || row.e1?.flags.includes('refund'))) return { rule: 11, refund: true };
  return { rule: row.amount > 0 ? 10 : 11 };
}

/* Keuzes van de beoordelaar per tegenpartij */
const OVERRIDES = {
  handel: row => ({ rule: row.amount > 0 ? 10 : 11 }),
  prive: (row, own) => ({ rule: 5, role: row.amount > 0 ? 'Privé-inkomen' : 'Privé-uitgave', memberId: own.owner === 'onderneming' ? (DOSSIER.members?.[0]?.id ?? null) : own.owner }),
  financiering: () => ({ rule: 6 }),
  intern: () => ({ rule: 1, unshared: true }),
};
const OVERRIDE_LABELS = [['', 'Automatisch'], ['handel', 'Omzet / kosten'], ['prive', 'Privé'], ['financiering', 'Financiering'], ['intern', 'Eigen rekening']];

/* E1 als extra signaal: welke E1-categorieën passen bij welke eigen regel */
const E1_COMPATIBLE = {
  1: key => /^(internal|investment\.savings)/.test(key), 2: () => true, 3: key => /^tax\.|essential\.municipal/.test(key), 4: key => key === 'loan.debt_collection',
  5: key => /^(internal|other\.private_transfer|loan\.private|other\.other)/.test(key), 6: key => /^loan\.|mortgage/.test(key), 7: key => /bank_fees|essential\.financial/.test(key),
  8: key => /salary/.test(key), 9: key => key.startsWith('cash.'), 10: key => /^(income|subsidy)\./.test(key),
  11: key => /^(expense|office|insurance|housing|alimony|gambling|investment)\./.test(key) && key !== 'investment.savings', 12: key => key === 'other.other',
};
const e1Agrees = row => row.e1 ? E1_COMPATIBLE[row.rule](row.e1.category) : null;
