"""Rooktest van de gebruikersstromen in een echte browser (Playwright, Chromium).
Draaien: python3 tests/e2e_smoke.py   (pip install playwright && playwright install chromium)
Controleert: inladen per dataset, alle tabbladen en weergaven zonder JavaScript-fouten, doorklikken van een
cel in het maandoverzicht, een categorie-aanpassing per tegenpartij die overal doorwerkt, en dat die
aanpassing bewaard blijft na herladen."""
import glob
import os
import sys
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PAGE = 'file://' + os.path.join(ROOT, 'index.html')
TABS = ['overzicht', 'maanden', 'omzet', 'kosten', 'transacties', 'risico']
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

    for folder in ['hocus-pocus', 'slager', 'lender-spender', 'mister-x', 'ez-gemengd', 'vof', 'pizza-patat']:
        errors.clear()
        load(page, folder)
        for view in ['zakelijk', 'prive', 'samen']:
            page.evaluate(f"(() => {{ const button = document.querySelector('[data-overlay={view}]'); if (!button.disabled) button.click(); }})()")
            for tab in TABS:
                page.evaluate(f"showTab('{tab}')")
        page.evaluate("document.querySelector('[data-overlay=zakelijk]').click()")
        check(not errors, f'{folder}: alle tabbladen en weergaven zonder fouten {errors[:1]}')

    load(page, 'hocus-pocus')
    page.evaluate("showTab('maanden')")
    page.click('#panel-maanden .cell-link')
    check(page.is_visible('#modal') and page.evaluate("document.querySelectorAll('#modal-body tbody tr').length") > 0, 'cel in maandoverzicht opent de transacties')
    page.evaluate('closeModal()')
    page.click('[data-month-line="kosten"]')
    check(page.evaluate("document.querySelectorAll('#panel-maanden tr.sub').length") > 0, 'kosten uitklappen naar tegenpartijen')

    # categorie per tegenpartij: grootste debiteur naar privé
    revenue_before = page.evaluate('A.revenue12')
    key = page.evaluate('A.debtors[0].key')
    page.evaluate("showTab('omzet')")
    page.select_option(f'#panel-omzet [data-override="{key}"]', 'prive')
    page.wait_for_timeout(300)
    check(page.evaluate('A.revenue12') < revenue_before, 'aanpassing "privé" verlaagt de omzet')
    check(page.evaluate(f"A.rows.filter(row => row.key === '{key}').every(row => row.rule === 5)"), 'aanpassing geldt voor alle transacties van die tegenpartij')
    if page.evaluate('STORE.available'):
        page.reload()
        page.wait_for_timeout(800)
        load(page, 'hocus-pocus')
        page.wait_for_timeout(300)
        check(page.evaluate(f"decisions[decisionKey('cat', '{key}')]") == 'prive', 'aanpassing hersteld na herladen')
        page.evaluate(f"delete decisions[decisionKey('cat', '{key}')]; saveIbanDecision(decisionKey('cat', '{key}'), null); saveState(); renderAll();")
    else:
        print('let op: IndexedDB niet beschikbaar in deze browsercontext; opslag niet getest')

    browser.close()

print(f"\n{len(failures)} fout(en)")
sys.exit(1 if failures else 0)
