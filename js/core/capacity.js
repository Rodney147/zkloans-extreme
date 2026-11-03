'use strict';
/* ---------- Kredietcapaciteit: nieuwe financiering, DSCR, bandbreedte en scenario's ----------
   Draagkracht = operationele kasstroom − aftrek per rechtsvorm (zie carryingCapacity in analyse.js).
   DSCR = draagkracht ÷ (bestaande rente + aflossing + nieuwe maandlast). Bestaande lasten komen uit de
   transacties (regel 6 en leningen van verbonden partijen); extra opgegeven verplichtingen worden alleen
   opgeteld als ze niet al herkend zijn (koppelen in plaats van optellen). */

/* Maandlast van een nieuwe financiering */
function loanPayment({ amount, rate, months, form }) {
  if (!(amount > 0) || !(months > 0) || rate == null || rate < 0) return null;
  const monthlyRate = rate / 100 / 12;
  if (form === 'aflossingsvrij') return { first: round2(amount * monthlyRate), average: round2(amount * monthlyRate), interestYear1: round2(amount * monthlyRate * 12) };
  if (form === 'lineair') {
    const principal = amount / months;
    const first = principal + amount * monthlyRate;
    const firstYear = sum(Array.from({ length: Math.min(12, months) }, (_, index) => principal + (amount - principal * index) * monthlyRate));
    return { first: round2(first), average: round2(firstYear / Math.min(12, months)), interestYear1: round2(firstYear - principal * Math.min(12, months)) };
  }
  const payment = monthlyRate === 0 ? amount / months : amount * monthlyRate / (1 - (1 + monthlyRate) ** -months);
  let balance = amount, interest = 0;
  for (let index = 0; index < Math.min(12, months); index += 1) { const part = balance * monthlyRate; interest += part; balance -= payment - part; }
  return { first: round2(payment), average: round2(payment), interestYear1: round2(interest) };
}

/* Extra opgegeven verplichtingen: alleen meetellen als ze niet al in de transacties zijn herkend */
function extraObligations(A, list) {
  return (list ?? []).map(item => {
    const match = A.obligations.find(obligation => obligation.group === 'Leningen en leases' && (String(obligation.name).toLowerCase().includes(String(item.name ?? '').toLowerCase().trim()) || Math.abs(obligation.term - item.monthly) <= Math.max(1, item.monthly * 0.02)));
    return { ...item, matchedWith: match?.name ?? null, counted: match ? 0 : Number(item.monthly) || 0 };
  });
}

function capacity(A, input = INPUT) {
  const months = A.MONTHS.length;
  const existingMonthly = sum(A.debtService) / months;
  const extras = extraObligations(A, input.extraObligations);
  const extraMonthly = sum(extras.map(item => item.counted));
  const loan = loanPayment(input.loan ?? {});
  const newMonthly = loan?.first ?? 0;
  const carrying = sum(A.freeCash) / months;
  const operating = sum(A.operating) / months;
  const debtBefore = existingMonthly + extraMonthly;
  const debtAfter = debtBefore + newMonthly;
  const ratio = (value, debt) => debt > 0 ? value / debt : Infinity;
  /* bandbreedte: minder zekere omzet = minder ontvangen btw; minder zekere kosten = minder betaalde btw (≈ 85% NL-inkoop) */
  const band = bandwidth(A);
  const worstCarrying = carrying - band.revenue.uncertain * (1 - VAT_FACTOR) / months;
  const bestCarrying = carrying + band.costs.uncertain * (1 - VAT_FACTOR * 0.85) / months;
  /* scenario's: omzet en kosten met een percentage; btw beweegt mee, lonen en vaste lasten niet */
  const revenueMonthly = A.revenue12 / months, costsMonthly = A.costs12 / months;
  const scenario = ({ omzet, kosten }) => {
    const value = carrying + revenueMonthly * (omzet ?? 0) * (1 - VAT_FACTOR) - costsMonthly * (kosten ?? 0) * (1 - VAT_FACTOR * 0.85);
    return { carrying: round2(value), dscr: ratio(value, debtAfter), room: round2(value - debtAfter) };
  };
  const scenarios = {
    basis: { label: 'Basis', omzet: 0, kosten: 0, ...scenario({ omzet: 0, kosten: 0 }) },
    negatief: { label: 'Negatief', ...input.scenario.negatief, ...scenario(input.scenario.negatief) },
    positief: { label: 'Positief', ...input.scenario.positief, ...scenario(input.scenario.positief) },
  };
  return {
    loan, input: input.loan, months,
    operating: round2(operating), carrying: round2(carrying), deduction: round2(operating - carrying),
    existingMonthly: round2(existingMonthly), extras, extraMonthly: round2(extraMonthly), newMonthly: round2(newMonthly), debtBefore: round2(debtBefore), debtAfter: round2(debtAfter),
    dscrBefore: ratio(carrying, debtBefore), dscrAfter: ratio(carrying, debtAfter), room: round2(carrying - debtAfter),
    worst: { carrying: round2(worstCarrying), dscr: ratio(worstCarrying, debtAfter) }, best: { carrying: round2(bestCarrying), dscr: ratio(bestCarrying, debtAfter) },
    scenarios,
    verdict: {
      dscr: NORMEN.dscrMinimum == null ? null : ratio(carrying, debtAfter) >= NORMEN.dscrMinimum,
      worst: NORMEN.dscrSlechtsteGeval == null ? null : ratio(worstCarrying, debtAfter) >= NORMEN.dscrSlechtsteGeval,
      room: NORMEN.ruimtePerMaand == null ? null : carrying - debtAfter >= NORMEN.ruimtePerMaand,
    },
    corrections: [
      ...A.cashLines.map(line => ({ label: line.label, monthly: round2(line.sign * sum(line.values) / months), how: line.how })),
      ...A.deductionLines.map(line => ({ label: line.label, monthly: round2(line.sign * sum(line.values) / months), how: line.how })),
    ],
  };
}
