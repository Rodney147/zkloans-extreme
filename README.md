# zkloans-extreme · Loanwise Zakelijk

Werkplek voor zakelijke kredietbeoordeling op banktransacties, in Loanwise-huisstijl. Rekent volledig vanaf losse transacties met vaste regels (geen AI); de analist bevestigt en besluit. Loanwise neemt geen kredietbesluit.

## Openen

Statische site, geen build. Direct te hosten (Netlify) of lokaal: open `index.html` in de browser, of `npx serve .`.
Bestanden, besluiten en invoer blijven in de browser (IndexedDB); er gaat niets naar een server.

## Indeling

| Pad | Wat |
| --- | --- |
| `index.html`, `css/app.css` | Pagina en huisstijl |
| `config/config.js` | **NORMEN** (DSCR en leefgeld, standaard `null` = geen oordeel), **SIGNAALGRENZEN** (attentiegrenzen), betaaldienstverleners, E1-vergelijking |
| `js/core/` | Rekenkern zonder DOM: invoer (Enable Now en Loanwise), categorieregels, belasting, analyse, draagkracht per rechtsvorm, risicomeldingen |
| `js/store.js` | Opslag in de browser: rekeningrollen, leden, besluiten per IBAN (ook voor volgende dossiers), afhandeling van meldingen en audittrail |
| `js/ui/` | Tabbladen en interactie |
| `tests/` | Testsets, verwachte uitkomsten en tests |

## Werkwijze in de app

1. **Dataset laden**: zip, JSON of CSV. Enable Now (`/Accounts`, `/Transactions`, analyse-job), Loanwise-JSON (`members`, `accounts`, `transactions`, bedragen in centen) of Loanwise-CSV (databaseexport met of zonder kopregel; zie `js/core/import.js` voor de kolomvolgorde). Bij de CSV komt de naam van de tegenpartij uit de omschrijving waar dat kan (ING "Naam:", pinbetalingen) en de rekeninghouder uit wat de andere eigen rekeningen over die IBAN zeggen.
2. **Dossierkop**: rechtsvorm, leden (eigenaar, DGA of vennoten) en per rekening rol (zakelijk, privé, gemengd) en eigenaar bevestigen.
3. Zes onderdelen: dossieroverzicht, financiële analyse (kasstroomopbouw, omzet, kosten, saldo), transacties en rekeningen (met maandoverzicht), klanten en leveranciers, verplichtingen, risicoanalyse.

Leidend document (project Loanwise Zakelijk): `categorieregels-verbonden-partijen.md`.

## Tests

```bash
node --test tests/core.test.js          # rekenregels, ijkpunten, regressie (geen dependencies)
python3 tests/e2e_smoke.py              # browser: alle tabbladen, doorwerking, opslag (Playwright)
node tests/generators/generate.js       # testsets eenmanszaak-gemengd en vof opnieuw genereren
```

| Set | Rechtsvorm | Bron |
| --- | --- | --- |
| `hocus-pocus` | bv, 3 zakelijk + 2 privé, 2.132 tx | Enable Now, met 20 ijkpunten in `expected.json` |
| `ez-gemengd` | eenmanszaak, gemengde rekening, KOR | Loanwise-formaat, gegenereerd met verwachte uitkomsten |
| `vof` | vof, twee vennoten (echtpaar) | Loanwise-formaat, gegenereerd met verwachte uitkomsten |
| `pizza-patat` | twee eenmanszaken, gezamenlijk huishouden, 2.993 tx | Enable Now, gegenereerd (`tests/generators/pizza_patat.py`) |
| `csv-mini` | Loanwise-CSV zonder kopregel, 3 rekeningen, 157 tx | synthetisch; echte exports horen niet in de repo |
| `slager`, `lender-spender`, `mister-x` | uit ZK Loans Light | regressie (`tests/regression-baseline.json`) |

Alle data is fictief.
