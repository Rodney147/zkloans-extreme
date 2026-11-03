"""Testset "Project Pizza & Project Patat" in Enable Now-formaat (fictief, deterministisch).

Huishouden van mevrouw M. Milkshake en meneer K. Koekenbakker:
- Project Pizza (eenmanszaak M. Milkshake): groeiend, gezond, 4 medewerkers.
- Project Patat (eenmanszaak K. Koekenbakker): seizoensgebonden en dalend, 2 medewerkers,
  roodstand in de winter, betalingsregeling loonheffingen, naheffing btw, teruggeboekte lease, incasso.
- Privé: gezamenlijke rekening (koopwoning, twee kinderen, kinderopvang) en ieder een eigen rekening.

Gebruik: python3 tests/generators/pizza_patat.py  →  tests/fixtures/pizza-patat/*.json + README.md + expected.json
"""
import calendar
import datetime as dt
import json
import os
import random
import uuid

OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'fixtures', 'pizza-patat')
rng = random.Random(20261103)
MONTHS = [(2025, 11), (2025, 12)] + [(2026, m) for m in range(1, 11)]
SHARED = '2026-11-03'
TAX_OLD, TAX_NEW = 'NL86 INGB 0002 4455 88', 'NL04 RABO 0200 1122 44'
WEIGHTS = [10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2]


def kenmerk(body):
    value = 11 - sum(int(d) * w for d, w in zip(body, WEIGHTS)) % 11
    return f"{0 if value == 11 else 1 if value == 10 else value}{body}"


def tax_iban(date):
    return TAX_OLD if date < '2026-05-01' else TAX_NEW


def masked(bank, end, start='NL'):
    return f"{start} {bank} •••• ••{end}"


# ---------- rekeningen ----------
ACC = {
    'pizza': dict(id=str(uuid.UUID(int=rng.getrandbits(128))), iban=masked('RABO', '41', 'NL27'), holder='M. Milkshake h.o.d.n. Project Pizza', bank='rabobank', profile='corporate', opening=18500.00),
    'patat': dict(id=str(uuid.UUID(int=rng.getrandbits(128))), iban=masked('INGB', '72', 'NL63'), holder='K. Koekenbakker h.o.d.n. Project Patat', bank='ing', profile='corporate', opening=1800.00),
    'samen': dict(id=str(uuid.UUID(int=rng.getrandbits(128))), iban=masked('ABNA', '18', 'NL09'), holder='M. Milkshake en K. Koekenbakker', bank='abn-amro', profile='retail', opening=7200.00),
    'milk': dict(id=str(uuid.UUID(int=rng.getrandbits(128))), iban=masked('ABNA', '35', 'NL52'), holder='M. Milkshake', bank='abn-amro', profile='retail', opening=2100.00),
    'koek': dict(id=str(uuid.UUID(int=rng.getrandbits(128))), iban=masked('INGB', '06', 'NL78'), holder='K. Koekenbakker', bank='ing', profile='retail', opening=4400.00),
}
SAVINGS_MILK = masked('ABNA', '90', 'NL44')   # niet gedeeld

rows = []
truth = {'omzet': {'pizza': 0.0, 'patat': 0.0}, 'opname': {'pizza': 0.0, 'patat': 0.0}, 'lonen': {'pizza': 0.0, 'patat': 0.0}}


def add(acc, date, amount, name, counter, description, category, confidence=None, flags=None, time=None):
    confidence = confidence if confidence is not None else round(rng.uniform(0.86, 0.98), 2)
    hour = time or f"{rng.randint(6, 21):02d}:{rng.randint(0, 59):02d}:00"
    rows.append(dict(acc=acc, date=date, time=hour, amount=round(amount, 2), name=name, counter=counter, description=description, category=category, confidence=confidence, flags=flags or []))


def day(year, month, d):
    last = calendar.monthrange(year, month)[1]
    return f"{year}-{month:02d}-{min(d, last):02d}"


def days_in(year, month):
    return [dt.date(year, month, d) for d in range(1, calendar.monthrange(year, month)[1] + 1)]


# ---------- Project Pizza: groeiend, sterk in de winter ----------
PIZZA_STAFF = [('L. Bakker', masked('INGB', '12', 'NL31'), 2050), ('S. Yilmaz', masked('RABO', '88', 'NL70'), 1840), ('D. de Groot', masked('ABNA', '51', 'NL02'), 1280), ('R. Jansen', masked('BUNQ', '09', 'NL85'), 860)]
PATAT_STAFF = [('T. Visser', masked('INGB', '33', 'NL16'), 1690), ('N. Peters', masked('RABO', '27', 'NL59'), 1090)]
pizza_season = {11: 1.05, 12: 1.18, 1: 1.0, 2: 0.98, 3: 1.0, 4: 0.97, 5: 0.95, 6: 0.92, 7: 0.9, 8: 0.93, 9: 1.0, 10: 1.06}
patat_season = {11: 0.72, 12: 0.75, 1: 0.6, 2: 0.62, 3: 0.8, 4: 0.98, 5: 1.12, 6: 1.3, 7: 1.45, 8: 1.4, 9: 1.05, 10: 0.82}

for index, (year, month) in enumerate(MONTHS):
    growth_pizza = 1 + 0.012 * index
    decline_patat = 1 - 0.012 * index
    # Pizza: dagelijkse pinafrekening (di-zo), Thuisbezorgd en Uber Eats wekelijks, catering
    for date in days_in(year, month):
        if date.weekday() == 0:
            continue
        settle = date + dt.timedelta(days=1)
        if (settle.year, settle.month) != (year, month):
            continue
        weekend = date.weekday() >= 4
        value = round(rng.uniform(470, 740) * (1.45 if weekend else 1) * pizza_season[month] * growth_pizza, 2)
        truth['omzet']['pizza'] += value
        add('pizza', settle.isoformat(), value, 'CCV Payment Services', masked('ABNA', '60', 'NL36'), f"CCV pinafrekening {date.isoformat()} terminal 4471", 'income.other', time='05:10:00')
    for week, d in enumerate([3, 10, 17, 24]):
        value = round(rng.uniform(2100, 2900) * pizza_season[month] * growth_pizza, 2)
        truth['omzet']['pizza'] += value
        add('pizza', day(year, month, d), value, 'Takeaway.com Payments B.V.', masked('INGB', '20', 'NL91'), f"Uitbetaling Thuisbezorgd periode {year}-{month:02d} wk{week + 1}", 'income.other')
        value = round(rng.uniform(750, 1150) * growth_pizza, 2)
        truth['omzet']['pizza'] += value
        add('pizza', day(year, month, d + 1), value, 'Uber Eats Netherlands B.V.', masked('INGB', '21', 'NL68'), f"Uber Eats payout {year}{month:02d}{d + 1:02d}", 'income.other')
    for n, (client, iban) in enumerate([('Bedrijfsrestaurant Spaarne B.V.', masked('RABO', '14', 'NL41')), ('Stichting Basisschool De Linde', masked('INGB', '47', 'NL06'))]):
        if rng.random() < 0.8:
            value = round(rng.uniform(650, 1900), 2)
            truth['omzet']['pizza'] += value
            add('pizza', day(year, month, 12 + n * 9), value, client, iban, f"Factuur PP-{year}{month:02d}-{n + 1:02d}", 'income.other')
    # Pizza: inkoop
    for d in [2, 6, 9, 13, 16, 20, 23, 27]:
        add('pizza', day(year, month, d), -round(rng.uniform(720, 1180) * pizza_season[month] * growth_pizza, 2), 'Sligro Food Group Nederland B.V.', masked('RABO', '02', 'NL52'), f"Factuur SL{rng.randint(4000000, 4999999)}", 'expense.other')
    for d in [5, 19]:
        add('pizza', day(year, month, d), -round(rng.uniform(900, 1450) * growth_pizza, 2), 'Hanos Groothandel B.V.', masked('INGB', '05', 'NL24'), f"Hanos factuur {rng.randint(800000, 899999)}", 'expense.other')
    for d in [8, 22]:
        add('pizza', day(year, month, d), -round(rng.uniform(380, 620), 2), 'Groente & Fruit Kennemerland', masked('RABO', '07', 'NL83'), 'Levering week', 'expense.other')
    for d in (3, 6, 10, 13, 17, 20, 24, 27):
        value = round(rng.uniform(90, 260) * growth_pizza, 2)
        truth['omzet']['pizza'] += value
        add('pizza', day(year, month, d), value, 'SumUp Payments Limited', 'IE91 SUMU •••• ••12', 'SumUp uitbetaling bezorging', 'income.other')
    for d, (supplier, low, high) in zip((3, 9, 14, 21, 24, 28, 12, 26, 17), [('Heineken Nederland Supply', 420, 780), ('Coca-Cola Europacific Partners', 260, 480), ('Heineken Nederland Supply', 420, 780), ('Coca-Cola Europacific Partners', 260, 480), ('Pizzadozen.nl', 310, 520), ('Shell Tankstation Schoterweg', 60, 140), ('Shell Tankstation Schoterweg', 60, 140), ('Shell Tankstation Schoterweg', 60, 140), ('Kaashandel Van der Veen', 380, 690)]):
        add('pizza', day(year, month, d), -round(rng.uniform(low, high), 2), supplier, masked('RABO', f'{rng.randint(10, 99)}', 'NL48'), f"Factuur {rng.randint(100000, 999999)}" if 'Shell' not in supplier else 'Betaalpas', 'expense.other' if 'Shell' not in supplier else 'expense.transport.fuel')
    for d in (4, 11, 18, 25):
        add('pizza', day(year, month, d), -round(rng.uniform(35, 160), 2), rng.choice(['Makro Haarlem', 'Albert Heijn 1561', 'Bol.com', 'Action']), masked('INGB', '95', 'NL66'), 'Betaalpas', 'expense.operations.office_supplies')
    # Pizza: personeel en loonheffing
    for name, iban, net in PIZZA_STAFF:
        value = round(net * (1.0 if month != 5 else 1.08), 2)  # vakantiegeld in mei
        truth['lonen']['pizza'] += value
        add('pizza', day(year, month, 25), -value, name, iban, f"Salaris {calendar.month_abbr[month].lower()} {year}" + (' incl. vakantiegeld' if month == 5 else ''), 'expense.salary', time='09:00:00')
    prev_y, prev_m = (year, month - 1) if month > 1 else (year - 1, 12)
    lh = round(rng.uniform(2150, 2450), 2)
    add('pizza', day(year, month, 28), -lh, 'Belastingdienst', tax_iban(day(year, month, 28)), f"Loonheffingen {calendar.month_name[prev_m].lower()} {prev_y} {kenmerk(f'7451288{3}6{str(prev_y)[-1]}00{prev_m:02d}0')}", 'tax.payroll')
    # Pizza: vaste lasten
    add('pizza', day(year, month, 1), -3250.00, 'Vastgoed Grote Markt B.V.', masked('ABNA', '44', 'NL19'), 'Huur bedrijfsruimte Grote Markt 12', 'office.rent', time='06:00:00')
    add('pizza', day(year, month, 7), -round(780 + 180 * (month in (12, 1, 2)), 2), 'Energiedirect Zakelijk B.V.', masked('INGB', '61', 'NL72'), 'Termijnbedrag energie', 'expense.operations.utilities')
    add('pizza', day(year, month, 15), -214.60, 'Interpolis Zakelijk', masked('RABO', '30', 'NL10'), 'Premie bedrijfsverzekeringen', 'insurance.liability')
    add('pizza', day(year, month, 4), -89.00, 'Lightspeed Netherlands B.V.', masked('INGB', '18', 'NL57'), 'Kassasysteem abonnement', 'expense.it')
    add('pizza', day(year, month, 10), -465.00, 'De Lage Landen Leasing N.V.', masked('RABO', '77', 'NL37'), 'Leasetermijn pizzaoven contract 55120', 'loan.equipment_lease')
    add('pizza', day(year, month, 1), -38.40, 'Rabobank', masked('RABO', '00', 'NL13'), 'Kosten Rabo BedrijfsPakket', 'expense.operations.bank_fees', time='03:00:00')
    add('pizza', day(year, month, 11), -round(rng.uniform(180, 420), 2), 'Meta Platforms Ireland', 'IE64 CITI •••• ••99', 'Advertenties', 'expense.marketing')
    # Pizza: btw per kwartaal (op tijd)
    if month in (1, 4, 7, 10):
        q = {1: 4, 4: 1, 7: 2, 10: 3}[month]
        qy = year - 1 if q == 4 else year
        add('pizza', day(year, month, 27), -round(rng.uniform(5200, 6400), 2), 'Belastingdienst', tax_iban(day(year, month, 27)), f"Omzetbelasting {q}e kw {qy} {kenmerk(f'7451288{3}1{str(qy)[-1]}00{q * 3:02d}0')}", 'tax.vat')
    # Pizza → privé Milkshake: vaste opname 2× per maand
    for d in (1, 15):
        truth['opname']['pizza'] += 3000
        add('pizza', day(year, month, d), -3000.00, 'M. Milkshake', ACC['milk']['iban'], 'Privé opname', 'internal.other', 0.99)
        add('milk', day(year, month, d), 3000.00, 'M. Milkshake h.o.d.n. Project Pizza', ACC['pizza']['iban'], 'Privé opname', 'internal.other', 0.99)

    # ---------- Project Patat: seizoen, dalend ----------
    for date in days_in(year, month):
        if date.weekday() in (0, 1) and month not in (6, 7, 8):
            continue
        settle = date + dt.timedelta(days=1)
        if (settle.year, settle.month) != (year, month):
            continue
        weekend = date.weekday() >= 4
        value = round(rng.uniform(470, 760) * (1.5 if weekend else 1) * patat_season[month] * decline_patat, 2)
        truth['omzet']['patat'] += value
        add('patat', settle.isoformat(), value, 'Worldline Netherlands', masked('ABNA', '62', 'NL58'), f"Worldline uitbetaling {date.isoformat()}", 'income.other', time='06:30:00')
    if month in (5, 6, 7, 8):
        value = round(rng.uniform(900, 1600), 2)
        truth['omzet']['patat'] += value
        add('patat', day(year, month, 18), value, 'Strandpaviljoen Zuid B.V.', masked('RABO', '43', 'NL22'), f"Factuur PT-{year}{month:02d}", 'income.other')
    for d in [3, 7, 10, 14, 17, 21, 24, 28]:
        add('patat', day(year, month, d), -round(rng.uniform(290, 470) * patat_season[month] * decline_patat, 2), 'Aviko Foodservice B.V.', masked('ABNA', '08', 'NL61'), f"Factuur AV{rng.randint(20000, 29999)}", 'expense.other')
    for d in [6, 20]:
        add('patat', day(year, month, d), -round(rng.uniform(420, 760) * patat_season[month], 2), 'Sligro Food Group Nederland B.V.', masked('RABO', '02', 'NL52'), f"Factuur SL{rng.randint(4000000, 4999999)}", 'expense.other')
    add('patat', day(year, month, 13), -round(rng.uniform(260, 380), 2), 'Frituurvet Direct B.V.', masked('INGB', '66', 'NL90'), 'Levering frituurolie', 'expense.other')
    for name, iban, net in PATAT_STAFF:
        value = round(net * (1.0 if month != 5 else 1.08), 2)
        truth['lonen']['patat'] += value
        add('patat', day(year, month, 26), -value, name, iban, f"Salaris {calendar.month_abbr[month].lower()} {year}" + (' incl. vakantiegeld' if month == 5 else ''), 'expense.salary', time='10:00:00')
    # loonheffing: dec–feb niet betaald, daarna betalingsregeling
    if month not in (12, 1, 2):
        add('patat', day(year, month, 28), -round(rng.uniform(880, 990), 2), 'Belastingdienst', tax_iban(day(year, month, 28)), f"Loonheffingen {calendar.month_name[prev_m].lower()} {prev_y} {kenmerk(f'6623904{1}6{str(prev_y)[-1]}00{prev_m:02d}0')}", 'tax.payroll')
    if month in (3, 4, 5, 6, 7, 8):
        add('patat', day(year, month, 15), -650.00, 'Belastingdienst', tax_iban(day(year, month, 15)), 'Betalingsregeling loonheffingen termijn', 'tax.payroll', 0.74, ['payment_arrangement'])
    add('patat', day(year, month, 1), -1950.00, 'Beheer Boulevard C.V.', masked('INGB', '13', 'NL45'), 'Huur unit Boulevard 7', 'office.rent', time='06:00:00')
    add('patat', day(year, month, 7), -round(880 + 320 * (month in (6, 7, 8)), 2), 'Vattenfall Zakelijk', masked('INGB', '50', 'NL26'), 'Termijnbedrag energie', 'expense.operations.utilities')
    add('patat', day(year, month, 15), -162.30, 'Nationale-Nederlanden Schadeverzekering', masked('INGB', '70', 'NL64'), 'Premie bedrijfsverzekeringen', 'insurance.liability')
    add('patat', day(year, month, 1), -27.50, 'ING', masked('INGB', '00', 'NL11'), 'Kosten Zakelijk Basis', 'expense.operations.bank_fees', time='03:00:00')
    # lease frituurinstallatie: februari teruggeboekt, maart dubbel
    if month == 3:
        add('patat', day(year, month, 10), -768.00, 'Equipment Lease Nederland B.V.', masked('ABNA', '81', 'NL33'), 'Leasetermijn frituurinstallatie incl. achterstand feb', 'loan.equipment_lease')
    else:
        add('patat', day(year, month, 10), -384.00, 'Equipment Lease Nederland B.V.', masked('ABNA', '81', 'NL33'), 'Leasetermijn frituurinstallatie', 'loan.equipment_lease')
    if month == 2:
        add('patat', day(year, month, 12), 384.00, 'Equipment Lease Nederland B.V.', masked('ABNA', '81', 'NL33'), 'Terugboeking incasso: onvoldoende saldo', 'loan.equipment_lease', 0.93, ['reversal_payment'])
    # btw: Q4 2025 te laat + naheffing, Q1–Q3 2026 op tijd
    if month == 3:
        add('patat', day(year, month, 18), -round(rng.uniform(1900, 2300), 2), 'Belastingdienst', tax_iban(day(year, month, 18)), f"Omzetbelasting 4e kw 2025 {kenmerk('662390411500120')}", 'tax.vat')
        add('patat', day(year, month, 29), -312.00, 'Belastingdienst', tax_iban(day(year, month, 29)), f"Naheffing omzetbelasting {kenmerk('662390415500120')}", 'tax.vat')
    if month in (4, 7, 10):
        q = {4: 1, 7: 2, 10: 3}[month]
        add('patat', day(year, month, 28), -round(rng.uniform(1700, 3400) * (1.6 if q == 2 else 1), 2), 'Belastingdienst', tax_iban(day(year, month, 28)), f"Omzetbelasting {q}e kw 2026 {kenmerk(f'66239041160{q * 3:02d}0')}"[:200], 'tax.vat')
    for d, (supplier, low, high) in zip((4, 11, 18, 25, 9, 23, 16), [('Coca-Cola Europacific Partners', 180, 420), ('Remia C.V.', 140, 260), ('Coca-Cola Europacific Partners', 180, 420), ('Remia C.V.', 140, 260), ('Van Geloven B.V.', 260, 520), ('Van Geloven B.V.', 260, 520), ('Verpakkingen Direct', 90, 210)]):
        add('patat', day(year, month, d), -round(rng.uniform(low, high) * patat_season[month], 2), supplier, masked('ABNA', f'{rng.randint(10, 99)}', 'NL14'), f"Factuur {rng.randint(100000, 999999)}", 'expense.other')
    for d in (5, 19):
        add('patat', day(year, month, d), -round(rng.uniform(25, 120), 2), rng.choice(['Makro Haarlem', 'Gamma', 'Action']), masked('INGB', '94', 'NL81'), 'Betaalpas', 'expense.operations.office_supplies')
    if month == 1:
        add('patat', day(year, month, 22), -248.75, 'Incassobureau Kennemerland B.V.', masked('RABO', '91', 'NL67'), 'Vordering 30441 Vattenfall inclusief kosten', 'loan.debt_collection')
    # Patat → privé Koekenbakker: wisselend, in de winter minder
    for d in (1, 16):
        value = 1300.00 if month in (4, 5, 6, 7, 8, 9) else 800.00
        truth['opname']['patat'] += value
        add('patat', day(year, month, d), -value, 'K. Koekenbakker', ACC['koek']['iban'], 'Opname privé', 'internal.other', 0.99)
        add('koek', day(year, month, d), value, 'K. Koekenbakker h.o.d.n. Project Patat', ACC['patat']['iban'], 'Opname privé', 'internal.other', 0.99)

    # ---------- privé: gezamenlijke rekening ----------
    add('milk', day(year, month, 2), -3600.00, 'M. Milkshake en K. Koekenbakker', ACC['samen']['iban'], 'Bijdrage huishouden', 'internal.other', 0.99)
    add('samen', day(year, month, 2), 3600.00, 'M. Milkshake', ACC['milk']['iban'], 'Bijdrage huishouden', 'internal.other', 0.99)
    contribution = 1500.00 if month in (4, 5, 6, 7, 8, 9) else 1000.00
    add('koek', day(year, month, 3), -contribution, 'M. Milkshake en K. Koekenbakker', ACC['samen']['iban'], 'Bijdrage huishouden', 'internal.other', 0.99)
    add('samen', day(year, month, 3), contribution, 'K. Koekenbakker', ACC['koek']['iban'], 'Bijdrage huishouden', 'internal.other', 0.99)
    add('samen', day(year, month, 1), -1642.18, 'Obvion N.V.', masked('RABO', '19', 'NL73'), 'Hypotheek leningdeel 1 en 2 Lindelaan 14', 'housing.mortgage', time='04:00:00')
    add('samen', day(year, month, 2), -51.20, 'Centraal Beheer', masked('ABNA', '23', 'NL87'), 'Woonverzekering opstal en inboedel', 'insurance.other' if False else 'insurance.liability')
    add('samen', day(year, month, 5), -224.00, 'Eneco', masked('INGB', '39', 'NL49'), 'Termijnbedrag stroom en gas', 'expense.essential.utilities.energy')
    add('samen', day(year, month, 6), -31.40, 'PWN Waterleidingbedrijf', masked('INGB', '42', 'NL95'), 'Termijn drinkwater', 'expense.essential.utilities.energy')
    if month in (2, 3, 4, 5, 6, 7, 8, 9, 10, 11):
        add('samen', day(year, month, 28), -142.60, 'Gemeente Haarlem', masked('BNGH', '04', 'NL31'), f"Termijn gemeentelijke belastingen {year}", 'expense.essential.municipal')
    add('samen', day(year, month, 1), -318.40, 'Zilveren Kruis Zorgverzekeringen', masked('INGB', '58', 'NL80'), 'Premie zorgverzekering gezin', 'insurance.health')
    add('samen', day(year, month, 4), -1468.00, 'Kinderopvang Hummeltjes B.V.', masked('RABO', '64', 'NL28'), 'Kinderopvang Sem en Lotte', 'expense.essential.childcare')
    add('samen', day(year, month, 20), 702.00, 'Dienst Toeslagen', masked('INGB', '85', 'NL86'), 'Kinderopvangtoeslag', 'subsidy.family')
    if month in (1, 4, 7, 10):
        add('samen', day(year, month, 1), 571.42, 'Sociale Verzekeringsbank', masked('INGB', '86', 'NL86'), 'Kinderbijslag 2 kinderen', 'subsidy.family')
    add('samen', day(year, month, 14), -67.50, 'Zwemschool De Waterrat', masked('RABO', '35', 'NL13'), 'Zwemles Lotte', 'expense.lifestyle.sports')
    if month in (9,):
        add('samen', day(year, month, 10), -95.00, 'Voetbalvereniging HFC', masked('INGB', '29', 'NL02'), 'Contributie Sem seizoen', 'expense.lifestyle.sports')
        add('samen', day(year, month, 12), -60.00, 'Stichting Basisschool De Linde', masked('INGB', '47', 'NL06'), 'Ouderbijdrage', 'expense.essential.other')
    for d in (1, 2, 4, 5, 7, 9, 11, 12, 14, 16, 18, 19, 21, 23, 25, 26, 28, 30):
        shop = rng.choice([('Albert Heijn 1561', masked('INGB', '96', 'NL20')), ('Jumbo Haarlem Zuid', masked('ABNA', '97', 'NL47')), ('Lidl Haarlem', masked('INGB', '98', 'NL50'))])
        add('samen', day(year, month, d), -round(rng.uniform(22, 105), 2), shop[0], shop[1], 'Betaalpas', 'expense.essential.groceries')
    for d in (8, 22):
        add('samen', day(year, month, d), -round(rng.uniform(55, 85), 2), 'Shell Schoterweg', masked('ABNA', '71', 'NL12'), 'Betaalpas', 'expense.transport.fuel')
    add('samen', day(year, month, 18), -round(rng.uniform(25, 70), 2), rng.choice(['Kruidvat', 'Action', 'HEMA']), masked('INGB', '73', 'NL40'), 'Betaalpas', 'expense.essential.personal_care')
    for d in (1, 3, 4, 6, 8, 9, 10, 12, 13, 15, 17, 18, 20, 22, 24, 25, 26, 27, 29, 31):
        shop = rng.choice([('Bakkerij Vlaar', 'Bakker', 'expense.essential.groceries'), ('Bol.com', 'Bestelling', 'expense.other'), ('HEMA', 'Betaalpas', 'expense.essential.other'), ('Apotheek Zuid', 'Betaalpas', 'expense.essential.personal_care'), ('Q-Park Haarlem', 'Parkeren', 'expense.transport.parking'), ('Kinderboerderij Eindenhout', 'Entree', 'expense.lifestyle.other'), ('Tikkie', 'Betaalverzoek', 'other.private_transfer'), ('Thuisbezorgd.nl', 'Bestelling', 'expense.lifestyle.restaurants_bars')])
        add('samen', day(year, month, d), -round(rng.uniform(5, 52), 2), shop[0], masked('INGB', f'{rng.randint(10, 99)}', 'NL77'), shop[1], shop[2])
    add('samen', day(year, month, 9), -98.75, 'ANWB Verzekeren', masked('ABNA', '74', 'NL52'), 'Autoverzekering', 'insurance.vehicle')
    add('samen', day(year, month, 24), -67.00, 'KPN B.V.', masked('ABNA', '75', 'NL81'), 'Internet en tv', 'expense.essential.telecom')
    add('samen', day(year, month, 17), -15.99, 'Netflix International B.V.', 'NL31 ADYB •••• ••76', 'Netflix', 'expense.lifestyle.streaming')
    if month in (12, 3, 6, 9):
        add('samen', day(year, month, 16), -132.00, 'Belastingdienst', tax_iban(day(year, month, 16)), 'Motorrijtuigenbelasting kwartaal', 'tax.other', 0.81)
    if month == 7:
        add('samen', day(year, month, 6), -2850.00, 'Sunweb Vakanties', masked('INGB', '77', 'NL19'), 'Restbetaling vakantie', 'expense.lifestyle.travel')
    if month == 12:
        add('samen', day(year, month, 19), -385.00, 'Intertoys', masked('INGB', '78', 'NL18'), 'Betaalpas', 'expense.other')

    # ---------- privé: M. Milkshake ----------
    add('milk', day(year, month, 21), -680.00, 'Belastingdienst', tax_iban(day(year, month, 21)), f"Voorlopige aanslag IB 2026 {kenmerk('745128837060001')}", 'tax.income')
    add('milk', day(year, month, 25), -800.00, 'M. Milkshake', SAVINGS_MILK, 'Naar spaarrekening', 'investment.savings', 0.97)
    add('milk', day(year, month, 6), -42.50, 'Basic-Fit Nederland', masked('INGB', '80', 'NL21'), 'Lidmaatschap', 'expense.lifestyle.sports')
    add('milk', day(year, month, 23), -24.00, 'Vodafone Libertel B.V.', masked('ABNA', '81', 'NL23'), 'Mobiel abonnement', 'expense.essential.telecom')
    for d in (11, 27):
        add('milk', day(year, month, d), -round(rng.uniform(35, 140), 2), rng.choice(['Zara Haarlem', 'Bijenkorf', 'Rituals']), masked('ABNA', '82', 'NL97'), 'Betaalpas', 'expense.essential.clothing')
    for d in (1, 2, 3, 5, 7, 8, 10, 11, 12, 13, 15, 16, 17, 19, 20, 22, 23, 24, 26, 28, 29):
        shop = rng.choice([('Starbucks Station', 'Betaalpas', 'expense.lifestyle.restaurants_bars'), ('Kapsalon Mooi', 'Betaalpas', 'expense.essential.personal_care'), ('Bol.com', 'Bestelling', 'expense.other'), ('Albert Heijn to go', 'Betaalpas', 'expense.essential.groceries'), ('NS Reizigers', 'OV-chipkaart', 'expense.transport.public_transport'), ('Pathé Haarlem', 'Bioscoop', 'expense.lifestyle.other')])
        add('milk', day(year, month, d), -round(rng.uniform(4, 55), 2), shop[0], masked('ABNA', f'{rng.randint(10, 99)}', 'NL38'), shop[1], shop[2])
    add('milk', day(year, month, 14), -round(rng.uniform(40, 95), 2), rng.choice(['Restaurant De Haven', 'Lunchroom Pip']), masked('RABO', '83', 'NL54'), 'Betaalpas', 'expense.lifestyle.restaurants_bars')

    # ---------- privé: K. Koekenbakker ----------
    add('koek', day(year, month, 21), -215.00, 'Belastingdienst', tax_iban(day(year, month, 21)), f"Voorlopige aanslag IB 2026 {kenmerk('662390417060001')}", 'tax.income')
    add('koek', day(year, month, 5), -284.60, 'Santander Consumer Finance', masked('ABNA', '84', 'NL15'), 'Termijn persoonlijke lening 7004112', 'loan.private')
    add('koek', day(year, month, 24), -round(rng.uniform(120, 460), 2), 'International Card Services', masked('ABNA', '85', 'NL57'), 'Afschrijving creditcard', 'loan.credit_card')
    for d in (1, 2, 4, 6, 7, 9, 11, 13, 14, 15, 18, 20, 22, 25, 27, 29, 30):
        shop = rng.choice([('Shell Boulevard', 'Betaalpas', 'expense.transport.fuel'), ('Snackbar De Hoek', 'Betaalpas', 'expense.lifestyle.restaurants_bars'), ('Jumbo Haarlem Zuid', 'Betaalpas', 'expense.essential.groceries'), ('Coolblue', 'Bestelling', 'expense.other'), ('Café De Zwaan', 'Betaalpas', 'expense.lifestyle.restaurants_bars'), ('Gamma', 'Betaalpas', 'expense.other')])
        add('koek', day(year, month, d), -round(rng.uniform(4, 38), 2), shop[0], masked('INGB', f'{rng.randint(10, 99)}', 'NL29'), shop[1], shop[2])
    add('koek', day(year, month, 23), -19.50, 'Lebara', masked('INGB', '86', 'NL68'), 'Mobiel', 'expense.essential.telecom')
    add('koek', day(year, month, 12), -round(rng.uniform(25, 70), 2), rng.choice(['Intersport', 'Primark']), masked('INGB', '87', 'NL72'), 'Betaalpas', 'expense.essential.clothing')
    if rng.random() < 0.5:
        add('koek', day(year, month, rng.randint(2, 27)), round(rng.uniform(8, 25), 2), rng.choice(['J. de Wit', 'P. Smit']), masked('INGB', '88', 'NL91'), 'Tikkie', 'other.private_transfer', 0.68, ['payment_request'])
    if month in (11, 2, 5, 8, 9, 10):
        add('koek', day(year, month, 19), -round(rng.uniform(15, 45), 2), 'Toto Sportweddenschappen', masked('INGB', '89', 'NL36'), 'iDEAL storting', 'gambling.other')

# ---------- volgorde, saldi en uitvoer in Enable Now-formaat ----------
rows.sort(key=lambda r: (r['date'], r['time'], r['acc']))
balances = {key: account['opening'] for key, account in ACC.items()}
transactions = []
for row in rows:
    balances[row['acc']] = round(balances[row['acc']] + row['amount'], 2)
    account = ACC[row['acc']]
    transactions.append({
        'id': str(uuid.UUID(int=rng.getrandbits(128))), 'accountId': account['id'], 'accountNumber': account['iban'],
        'description': row['description'], 'bookDate': row['date'], 'transactionDateTime': f"{row['date']}T{row['time']}Z",
        'amount': row['amount'], 'balanceAfterTransaction': balances[row['acc']], 'currency': 'EUR',
        'counterpartDescription': row['name'], 'counterpartAccountNumber': row['counter'],
        'normalized': {'description': row['description'].lower(), 'counterpartDescription': (row['name'] or '').lower().replace('.', '')},
        'category': {'e1': {'category': row['category'], 'confidence': row['confidence'], 'flags': row['flags'], 'model': {'version': 'e1-2026.10', 'profile': account['profile'], 'countryCode': 'nl'}}},
    })
os.makedirs(OUT, exist_ok=True)
for name in os.listdir(OUT):
    os.remove(os.path.join(OUT, name))


def write(name, payload):
    with open(os.path.join(OUT, name), 'w', encoding='utf-8') as handle:
        json.dump(payload, handle, ensure_ascii=False, indent=1)


consents = {'rabobank': 'c-rabo-pp-0001', 'ing': 'c-ing-pp-0002', 'abn-amro': 'c-abn-pp-0003'}
write('00-get-consents.json', {'request': {'method': 'GET', 'path': '/v2/consents'}, 'response_200': {'data': [{'id': cid, 'providerKey': key, 'status': 'VALID', 'dateRequested': f'{SHARED}T09:{10 + i}:00Z', 'validUntil': '2027-02-01T00:00:00Z'} for i, (key, cid) in enumerate(consents.items())]}})
for letter, (key, cid) in zip('abc', consents.items()):
    accounts = [a for a in ACC.values() if a['bank'] == key]
    write(f'02{letter}-get-accounts.json', {'request': {'method': 'GET', 'path': '/Accounts', 'query': {'ConsentId': cid}}, 'response_200': {'data': [{'id': a['id'], 'iban': a['iban'], 'providerAccountId': f"{key}-{a['id'][:8]}", 'accountHolder': a['holder'], 'bban': None, 'currency': 'EUR', 'accountBalance': {'currency': 'EUR', 'date': '2026-10-31T23:59:59Z', 'amount': balances[k]}} for k, a in ACC.items() if a in accounts]}})
internal = [a['iban'] for a in ACC.values()]
for letter, profile in (('a', 'corporate'), ('b', 'retail')):
    ids = [a['id'] for a in ACC.values() if a['profile'] == profile]
    write(f'03{letter}-{profile}-categorization-job.json', {'request': {'method': 'POST', 'path': '/v2/categorization-jobs', 'body': {'engine': 'e1', 'profile': profile, 'countryCode': 'nl', 'accountIds': ids, 'metaData': {'internal_ibans': internal}}}, 'response_202': {'data': f'job-{profile}-pp'}})
for page in range(0, len(transactions), 100):
    number = page // 100 + 1
    write(f'04-get-transactions-page-{number:02d}.json', {'request': {'method': 'GET', 'path': '/Transactions', 'query': {'PageSize': 100, **({'PageToken': f'page-{number}'} if number > 1 else {})}}, 'response_200': {'data': transactions[page:page + 100], 'nextPageToken': f'page-{number + 1}' if page + 100 < len(transactions) else None}})


def bucket(name, items):
    return {'name': name, 'transactionCount': len(items), 'totalInflow': round(sum(t['amount'] for t in items if t['amount'] > 0), 2), 'totalOutflow': round(-sum(t['amount'] for t in items if t['amount'] < 0), 2), 'transactionIds': [t['id'] for t in items]}


for letter, profile in (('a', 'corporate'), ('b', 'retail')):
    accs = [a for a in ACC.values() if a['profile'] == profile]
    ids = {a['id'] for a in accs}
    own = [t for t in transactions if t['accountId'] in ids]
    cat = lambda prefix: [t for t in own if t['category']['e1']['category'].startswith(prefix)]
    flag = lambda f: [t for t in own if f in t['category']['e1']['flags']]
    analysis = {
        'generalInfo': {'startDate': '2025-11-01', 'endDate': '2026-10-31', 'startBalance': round(sum(a['opening'] for a in accs), 2), 'endBalance': round(sum(balances[k] for k, a in ACC.items() if a in accs), 2), 'accounts': [{'iban': a['iban'], 'accountName': a['holder'], 'accountId': a['id']} for a in accs], 'totalInflow': round(sum(t['amount'] for t in own if t['amount'] > 0), 2), 'totalOutflow': round(-sum(t['amount'] for t in own if t['amount'] < 0), 2)},
        'clientProfile': [bucket('Taxes', cat('tax.')), bucket('Loans', [t for t in cat('loan.') if t['category']['e1']['category'] not in ('loan.debt_collection', 'loan.vehicle_lease', 'loan.equipment_lease')]), bucket('Debt collection', cat('loan.debt_collection')), bucket('Equipment Lease', cat('loan.equipment_lease')), bucket('Internal transactions', cat('internal.')), bucket('Gambling', cat('gambling.')), bucket('Crypto', cat('investment.crypto'))],
        'flaggedTransactions': [bucket('Reversal payments', flag('reversal_payment')), bucket('Refunds', flag('refund')), bucket('Payment arrangements', flag('payment_arrangement'))],
        'lowConfidenceTransactions': [bucket('Confidence <50%', [t for t in own if t['category']['e1']['confidence'] < 0.5]), bucket('50% <= Confidence <60%', [t for t in own if 0.5 <= t['category']['e1']['confidence'] < 0.6])],
        'otherHighlightedTransactions': [bucket('Round number', [t for t in own if abs(t['amount']) >= 10000 and abs(t['amount']) % 10000 == 0])],
        'creditQualityMetrics': [],
    }
    write(f'05{letter}-{profile}-analysis-job.json', {'request': {'method': 'POST', 'path': '/analysis-jobs', 'body': {'reference': f'Dossier Milkshake-Koekenbakker {profile}', 'engine': 'e1', 'profile': profile, 'countryCode': 'nl', 'input': {'accountIds': [a['id'] for a in accs]}, 'metaData': {'internal_ibans': internal}, 'dateFrom': '2025-11-01T00:00:00Z', 'dateTo': '2026-10-31T23:59:59Z'}}, 'response_200': {'id': f'analysis-{profile}-pp', 'status': 'COMPLETED', 'engine': 'e1', 'profile': profile, 'analysis': analysis}})

per_account = {k: sum(1 for r in rows if r['acc'] == k) for k in ACC}
expected = {
    '_bron': 'Waarheid van de generator (niet uit de rekenkern).',
    'transactions': len(transactions), 'perAccount': {ACC[k]['iban']: n for k, n in per_account.items()},
    'endBalances': {ACC[k]['iban']: balances[k] for k in ACC},
    'revenue12': {'Project Pizza': round(truth['omzet']['pizza'], 2), 'Project Patat': round(truth['omzet']['patat'], 2)},
    'ownerDraws12': {'M. Milkshake (Pizza)': truth['opname']['pizza'], 'K. Koekenbakker (Patat)': truth['opname']['patat']},
    'netSalaries12': {'Project Pizza': round(truth['lonen']['pizza'], 2), 'Project Patat': round(truth['lonen']['patat'], 2)},
    'members': ['M. Milkshake', 'K. Koekenbakker'],
    'expectRisks': ['belastingachterstand', 'terugboekingen', 'incasso', 'gokken', 'roodstand', 'rekening-niet-gedeeld'],
}
write('expected.json', expected)
months_negative = {}
bal = ACC['patat']['opening']
for r in rows:
    if r['acc'] == 'patat':
        bal += r['amount']
        if bal < 0:
            months_negative[r['date'][:7]] = min(months_negative.get(r['date'][:7], 0), round(bal, 2))
readme = f"""# Testset Project Pizza & Project Patat (fictief)

Huishouden van **M. Milkshake** en **K. Koekenbakker** met twee kinderen (Sem en Lotte) en een koopwoning in Haarlem. Ieder heeft een eenmanszaak met personeel. Gedeeld op {SHARED}, periode nov 2025 – okt 2026, **{len(transactions)} transacties** in Enable Now-formaat (00 consents · 02 accounts · 03 categorisatiejobs · 04 transacties per 100 · 05 analyse corporate en retail).

| Rekening | Houder | Bank | Profiel | Transacties | Eindsaldo |
| --- | --- | --- | --- | --- | --- |
""" + '\n'.join(f"| {a['iban']} | {a['holder']} | {a['bank']} | {a['profile']} | {per_account[k]} | € {balances[k]:,.2f} |".replace(',', 'X').replace('.', ',').replace('X', '.') for k, a in ACC.items()) + f"""

Spaarrekening {SAVINGS_MILK} (M. Milkshake) is **niet gedeeld**.

## Project Pizza (M. Milkshake) — de sterke zaak
- Omzet 12 mnd € {truth['omzet']['pizza']:,.0f}: pin (CCV, di–zo), Thuisbezorgd en Uber Eats wekelijks, catering op factuur; licht groeiend, sterkste maand december.
- 4 medewerkers (vakantiegeld in mei), loonheffing maandelijks en btw per kwartaal op tijd met geldig kenmerk.
- Vaste lasten: huur € 3.250, energie, verzekering, kassasysteem, lease pizzaoven.
- Opname privé 2× € 2.600 per maand.

## Project Patat (K. Koekenbakker) — de zwakke zaak
- Omzet 12 mnd € {truth['omzet']['patat']:,.0f}: snackbar aan de boulevard, sterk seizoen (zomer ruim 2× winter) en 1,8% daling per maand.
- 2 medewerkers. Loonheffing dec–feb niet betaald, daarna **betalingsregeling** mrt–aug (6 × € 650).
- Btw 4e kw 2025 **te laat** (maart) plus **naheffing**; Q1–Q3 2026 betaald.
- Lease frituurinstallatie in februari **teruggeboekt** (onvoldoende saldo), in maart dubbel betaald.
- **Incassobureau** in januari (energieleverancier).
- Roodstand: {', '.join(f'{m} (laagste € {v:,.0f})' for m, v in sorted(months_negative.items())) or 'geen'}.
- Opname privé 2× € 900 (winter) tot 2× € 1.400 (zomer).

## Privé
- **Gezamenlijk** (ABN AMRO): hypotheek Obvion € 1.642, woonverzekering, energie, water, gemeentelijke belastingen (termijnen), zorgverzekering gezin, kinderopvang € 1.468 met kinderopvangtoeslag € 702, kinderbijslag per kwartaal, zwemles, voetbal, boodschappen, auto, vakantie in juli, motorrijtuigenbelasting.
- **M. Milkshake**: inkomsten uit Pizza, bijdrage huishouden € 3.300, voorlopige aanslag IB € 680, sparen € 800/mnd naar niet-gedeelde rekening, sport, kleding.
- **K. Koekenbakker**: inkomsten uit Patat, bijdrage huishouden € 1.100–1.700, voorlopige aanslag IB € 215, **persoonlijke lening** Santander € 284,60, creditcard, Tikkies, af en toe **Toto** (gokken).

## Te verwachten in Loanwise
- Leden afgeleid: M. Milkshake en K. Koekenbakker (rol Eigenaar); de gezamenlijke rekening op beider naam = één huishouden.
- Opnamen per eigenaar via regel 5 (Pizza → Milkshake, Patat → Koekenbakker); bijdragen aan de gezamenlijke rekening zijn verkeer tussen leden.
- Draagkracht: per huishouden het hoogste van de opnamen samen of de vaste privélasten samen (één keer, niet per persoon).
- Klantconcentratie: pinafrekeningen (CCV, Worldline, SumUp) tellen niet als één klant; Thuisbezorgd en Uber Eats wel (kanaalafhankelijkheid).
- Signalen: roodstand op de rekening van Patat (per rekening gemeten), belastingachterstand (Patat), terugboeking, incasso, gokken.
- **Per zaak bekijken**: twee eenmanszaken in één dossier rekent Loanwise als één geheel. Zet de andere zakelijke rekening uit (vinkje *Mee*) om Pizza of Patat apart te zien.

Bucketsommen in 05 sluiten aan op de transacties in 04; saldo na transactie sluit aan op het eindsaldo in 02.
"""
with open(os.path.join(OUT, 'README.md'), 'w', encoding='utf-8') as handle:
    handle.write(readme)
print(len(transactions), per_account, {k: round(v, 2) for k, v in balances.items()}, months_negative)
