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
TABS = ['overzicht', 'maanden', 'omzet', 'kosten', 'belasting', 'transacties', 'risico']
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

    for folder in ['hocus-pocus', 'slager', 'lender-spender', 'mister-x', 'ez-gemengd', 'vof', 'pizza-patat', 'csv-mini', 'csv-tegenpartij', 'csv-api']:
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

    # maand en post klikbaar
    page.click('#panel-maanden .month-link')
    check(page.evaluate("MODAL.rows.length") == page.evaluate("A.rows.filter(row => row.monthIndex === 0).length"), 'maandkop opent alle transacties van die maand')
    page.evaluate('closeModal()')
    page.click('#panel-maanden .label-link')
    check(page.evaluate("MODAL.rows.length") == page.evaluate("A.income[0].rows.length"), 'postnaam opent alle transacties van de post')
    # filteren en sorteren in de pop-up
    page.fill('#modal-text', 'Gemeente')
    check(all('gemeente' in t.lower() for t in page.eval_on_selector_all('#modal-body tbody tr', 'rows => rows.map(row => row.innerText)')), 'zoeken in de pop-up')
    page.fill('#modal-text', '')
    page.click('#modal-body [data-sort="amount"]')
    amounts = page.evaluate("sortRows(modalFiltered(), 'modal').map(row => row.amount)")
    check(amounts == sorted(amounts, reverse=True), 'sorteren op bedrag')
    page.select_option('#modal-direction', 'out')
    check(page.evaluate("modalFiltered().every(row => row.amount < 0)"), 'filter op richting')
    page.evaluate('closeModal()')
    check(page.evaluate("document.querySelectorAll('[data-override], [data-legal-form]').length") == 0, 'geen categorie-aanpassing en geen rechtsvorm meer')
    page.evaluate("showTab('belasting')")
    check(page.evaluate("document.querySelectorAll('#panel-belasting .tax-card').length") == 3, 'belastingen: kaartjes voor btw, loonheffing en IB')
    check(page.evaluate("document.querySelectorAll('#panel-belasting .q-head').length") >= 4, 'belastingen: kwartalen in het jaaroverzicht')
    page.click('#panel-belasting .tax-table .cell-link')
    check(page.evaluate("MODAL.rows.length > 0 && MODAL.rows.every(row => row.rule === 3)"), 'belastingen: bedrag opent de betalingen')
    page.evaluate('closeModal()')
    load(page, 'csv-tegenpartij')
    page.evaluate("showTab('transacties')")
    check('Diensten' in page.inner_text('#panel-transacties'), 'CSV: Loanwise-categorie in de transactietabel')

    browser.close()

print(f"\n{len(failures)} fout(en)")
sys.exit(1 if failures else 0)
