"""Rooktest van de gebruikersstromen in een echte browser (Playwright, Chromium).
Draaien: python3 tests/e2e_smoke.py   (pip install playwright && playwright install chromium)
Controleert: inladen per dataset, alle tabbladen zonder JavaScript-fouten, een besluit in Controle dat
doorwerkt tot de DSCR, en dat besluiten en de afhandeling van meldingen bewaard blijven na herladen."""
import glob
import os
import sys
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PAGE = 'file://' + os.path.join(ROOT, 'index.html')
TABS = ['overzicht', 'controle', 'resultaat', 'omzet', 'kosten', 'cashflow', 'categorieen', 'transacties', 'maanden', 'regels', 'tegenpartijen',
        'verbonden', 'verplichtingen', 'belasting', 'risico', 'signalen']
failures = []


def check(condition, message):
    print(('ok   ' if condition else 'FOUT ') + message)
    if not condition:
        failures.append(message)


def load(page, folder):
    files = sorted(f for f in glob.glob(os.path.join(ROOT, 'tests', 'fixtures', folder, '*')) if f.endswith(('.json', '.csv')) and not f.endswith('expected.json'))
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

    for folder in ['hocus-pocus', 'slager', 'lender-spender', 'mister-x', 'ez-gemengd', 'vof', 'pizza-patat', 'csv-mini']:
        errors.clear()
        load(page, folder)
        for tab in TABS:
            page.evaluate(f"showTab('{tab}')")
        for view in ['prive', 'samen', 'zakelijk']:
            page.evaluate(f"(() => {{ const button = document.querySelector('[data-overlay={view}]'); if (!button.disabled) button.click(); }})()")
        check(not errors, f'{folder}: alle tabbladen en weergaven zonder fouten {errors[:1]}')

    # Kredietcapaciteit en doorwerking op Hocus Pocus
    load(page, 'hocus-pocus')
    dscr_before = page.evaluate('A.dscr')
    page.evaluate("showTab('controle')")
    page.evaluate("decisions[decisionKey('debtor', A.debtors[0].key)] = 'no'; renderAll();")
    check(page.evaluate('A.dscr') < dscr_before, 'besluit "geen omzet" verlaagt de DSCR')
    page.evaluate("delete decisions[decisionKey('debtor', A.debtors[0].key)]; renderAll();")
    check(page.evaluate("document.querySelectorAll('#panel-capaciteit, #panel-acceptatie, #panel-rapport').length") == 0, 'kredietcapaciteit, acceptatie en rapport verwijderd')

    # Bewaren in de browser
    page.evaluate("showTab('risico')")
    risk_id = page.evaluate('MODEL.risks[0].id')
    page.select_option(f'[data-risk-status="{risk_id}"]', 'beoordeeld')
    page.wait_for_timeout(300)
    if page.evaluate('STORE.available'):
        page.reload()
        page.wait_for_timeout(800)
        load(page, 'hocus-pocus')
        page.wait_for_timeout(300)
        check(page.evaluate(f"INPUT.risks['{risk_id}']?.status") == 'beoordeeld', 'afhandeling melding hersteld na herladen')
        check(page.evaluate('INPUT.audit.length') > 0, 'audittrail bewaard')
    else:
        print('let op: IndexedDB niet beschikbaar in deze browsercontext; opslag niet getest')

    browser.close()

print(f"\n{len(failures)} fout(en)")
sys.exit(1 if failures else 0)
