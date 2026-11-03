"""Rooktest van de gebruikersstromen in een echte browser (Playwright, Chromium).
Draaien: python3 tests/e2e_smoke.py   (pip install playwright && playwright install chromium)
Controleert: inladen per dataset, alle tabbladen zonder JavaScript-fouten, invoer kredietcapaciteit,
een besluit in Controle dat doorwerkt, en dat besluiten en invoer bewaard blijven na herladen."""
import glob
import os
import sys
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PAGE = 'file://' + os.path.join(ROOT, 'index.html')
TABS = ['overzicht', 'controle', 'resultaat', 'omzet', 'kosten', 'cashflow', 'categorieen', 'transacties', 'regels', 'tegenpartijen',
        'verbonden', 'verplichtingen', 'belasting', 'risico', 'signalen', 'capaciteit', 'acceptatie', 'rapport']
failures = []


def check(condition, message):
    print(('ok   ' if condition else 'FOUT ') + message)
    if not condition:
        failures.append(message)


def load(page, folder):
    files = sorted(f for f in glob.glob(os.path.join(ROOT, 'tests', 'fixtures', folder, '*.json')) if not f.endswith('expected.json'))
    page.evaluate('showBanner()')
    page.set_input_files('#load-input', files)
    page.wait_for_function('() => !document.getElementById("load-banner").hidden', timeout=15000)


with sync_playwright() as playwright:
    browser = playwright.chromium.launch()
    context = browser.new_context(viewport={'width': 1400, 'height': 1000})
    page = context.new_page()
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto(PAGE)
    page.wait_for_timeout(800)
    check(not errors, 'voorbeelddossier start zonder fouten')

    for folder in ['hocus-pocus', 'slager', 'lender-spender', 'mister-x', 'ez-gemengd', 'vof']:
        errors.clear()
        load(page, folder)
        for tab in TABS:
            page.evaluate(f"showTab('{tab}')")
        for view in ['prive', 'samen', 'zakelijk']:
            page.evaluate(f"(() => {{ const button = document.querySelector('[data-overlay={view}]'); if (!button.disabled) button.click(); }})()")
        check(not errors, f'{folder}: alle tabbladen en weergaven zonder fouten {errors[:1]}')

    # Kredietcapaciteit en doorwerking op Hocus Pocus
    load(page, 'hocus-pocus')
    page.evaluate("showTab('capaciteit')")
    for field, value in [('loan.amount', '100000'), ('loan.rate', '7'), ('loan.months', '60')]:
        page.fill(f'[data-input="{field}"]', value)
        page.dispatch_event(f'[data-input="{field}"]', 'change')
    text = page.inner_text('#panel-capaciteit')
    check('1.980' in text, 'nieuwe maandlast € 1.980 getoond')
    check('norm niet ingesteld' in text, 'zonder norm geen oordeel')
    dscr_before = page.evaluate('MODEL.cap.dscrAfter')
    page.evaluate("showTab('controle')")
    page.evaluate("decisions[decisionKey('debtor', A.debtors[0].key)] = 'no'; renderAll();")
    check(page.evaluate('MODEL.cap.dscrAfter') < dscr_before, 'besluit "geen omzet" verlaagt de DSCR in Kredietcapaciteit')
    page.evaluate("delete decisions[decisionKey('debtor', A.debtors[0].key)]; renderAll();")

    # Bewaren in de browser
    page.evaluate("showTab('acceptatie')")
    page.select_option('[data-check-status="A3"]', 'voldoet')
    page.wait_for_timeout(300)
    if page.evaluate('STORE.available'):
        page.reload()
        page.wait_for_timeout(800)
        load(page, 'hocus-pocus')
        page.wait_for_timeout(300)
        check(page.evaluate('INPUT.loan.amount') == 100000, 'invoer krediet hersteld na herladen')
        check(page.evaluate("INPUT.checklist.A3?.status") == 'voldoet', 'checklist hersteld na herladen')
        check(page.evaluate('INPUT.audit.length') > 0, 'audittrail bewaard')
    else:
        print('let op: IndexedDB niet beschikbaar in deze browsercontext; opslag niet getest')

    browser.close()

print(f"\n{len(failures)} fout(en)")
sys.exit(1 if failures else 0)
