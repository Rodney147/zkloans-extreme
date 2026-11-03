'use strict';
/* ---------- Opmaak ---------- */
const CURRENCY = new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const CURRENCY_CENTS = new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2 });
const sum = values => values.reduce((total, value) => total + value, 0);
const round2 = value => Math.round(value * 100) / 100;
const eur = value => CURRENCY.format(Math.round(value) || 0).replace('-', '−');
const eurCents = value => CURRENCY_CENTS.format(value || 0).replace('-', '−');
const k = value => `${value < 0 ? '−' : ''}€${(Math.abs(value) / 1000).toFixed(1).replace('.', ',')}k`;
const pct = (value, digits = 0) => Number.isFinite(value) ? `${(value * 100).toFixed(digits).replace('.', ',')}%` : '-';
const signedPct = value => Number.isFinite(value) ? `${value > 0 ? '+' : value < 0 ? '−' : ''}${Math.abs(value * 100).toFixed(0)}%` : '-';
const dec = (value, digits = 2) => Number.isFinite(value) ? value.toFixed(digits).replace('.', ',') : '-';
const esc = text => String(text ?? '').replace(/[&<>"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[character]);
const dateNl = date => String(date ?? '').slice(0, 10).split('-').reverse().join('-');
const normalizeIban = value => value ? String(value).replace(/\s/g, '').toUpperCase() : null;
const formatIban = iban => iban ? iban.replace(/(.{4})/g, '$1 ').trim() : '-';
const maskIban = iban => iban && /^[A-Z]{2}\d{2}[A-Z]{4}\d+$/.test(iban) ? `${iban.slice(0, 4)} ${iban.slice(4, 8)} •••• ••${iban.slice(-2)}` : (iban ?? '-');
const MONTH_NAMES = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];
const monthName = key => `${MONTH_NAMES[Number(key.slice(5, 7)) - 1]} ${key.slice(0, 4)}`;
const shortMonth = key => MONTH_NAMES[Number(key.slice(5, 7)) - 1];
const median = values => { const sorted = [...values].sort((first, second) => first - second); const middle = Math.floor(sorted.length / 2); return sorted.length ? (sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2) : 0; };
const groupBy = (rows, keyOf) => rows.reduce((map, row) => { const key = keyOf(row); if (!map.has(key)) map.set(key, []); map.get(key).push(row); return map; }, new Map());
const inflow = rows => sum(rows.filter(row => row.amount > 0).map(row => row.amount));
const outflow = rows => sum(rows.filter(row => row.amount < 0).map(row => -row.amount));

/* ---------- Banken ---------- */
const BANK_CODES = { RABO: 'Rabobank', INGB: 'ING', ABNA: 'ABN AMRO', KNAB: 'Knab', BUNQ: 'bunq', TRIO: 'Triodos', SNSB: 'SNS', ASNB: 'ASN Bank', RBRB: 'RegioBank', REVO: 'Revolut' };
const bankFromIban = iban => BANK_CODES[String(iban ?? '').slice(4, 8)] ?? null;
const bankFromKey = key => { const value = String(key ?? '').toLowerCase().replace(/[^a-z]/g, ''); return value ? Object.values(BANK_CODES).find(name => value.includes(name.toLowerCase().replace(/[^a-z]/g, ''))) ?? key : null; };
