# zkloans-extreme · Loanwise Zakelijk

Werkplek voor zakelijke kredietbeoordeling op banktransacties, in Loanwise-huisstijl. Rekent volledig vanaf losse transacties met vaste regels (geen AI); de analist bevestigt en besluit. Loanwise neemt geen kredietbesluit.

## Openen

Statische site, geen build. Direct te hosten (Netlify) of lokaal: open `index.html` in de browser, of `npx serve .`.
Bestanden, besluiten en invoer blijven in de browser (IndexedDB); er gaat niets naar een server.

## Indeling

| Pad | Wat |
| --- | --- |
| `index.html`, `css/app.css` | Pagina en huisstijl |
| `config/config.js` | **NORMEN** (acceptatienormen, standaard `null` = geen oordeel), **SIGNAALGRENZEN** (attentiegrenzen), scenario's, E1-vergelijking, acceptatiechecklist |
| `js/core/` | Rekenkern zonder DOM: invoer (Enable Now en Loanwise), categorieregels, belasting, analyse, draagkracht per rechtsvorm, kredietcapaciteit, risicomeldingen, checklist |
| `js/store.js` | Opslag in de browser: rekeningrollen, leden, besluiten per IBAN (ook voor volgende dossiers), invoer en audittrail |
| `js/ui/` | Tabbladen en interactie |
| `tests/` | Testsets, verwachte uitkomsten en tests |

## Werkwijze in de app

1. **Dataset laden**: zip of JSON, Enable Now (`/Accounts`, `/Transactions`, analyse-job) of Loanwise (`members`, `accounts`, `transactions`, bedragen in centen).
2. **Dossierkop**: rechtsvorm, leden (eigenaar, DGA of vennoten) en per rekening rol (zakelijk, privé, gemengd) en eigenaar bevestigen.
3. Acht onderdelen: dossieroverzicht, financiële analyse (kasstroomopbouw, omzet, kosten, saldo), transacties en rekeningen, klanten en leveranciers, verplichtingen, risicoanalyse, kredietcapaciteit, acceptatie en rapport (PDF via afdrukken, Excel).

Leidende documenten (project Loanwise Zakelijk): `categorieregels-verbonden-partijen.md` en `acceptatiehandleiding-zakelijk.md`.

## Tests

```bash
node --test tests/core.test.js          # rekenregels, ijkpunten, regressie (geen dependencies)
python3 tests/e2e_smoke.py              # browser: alle tabbladen, invoer, doorwerking, opslag (Playwright)
node tests/generators/generate.js       # testsets eenmanszaak-gemengd en vof opnieuw genereren
```

| Set | Rechtsvorm | Bron |
| --- | --- | --- |
| `hocus-pocus` | bv, 3 zakelijk + 2 privé, 2.132 tx | Enable Now, met 20 ijkpunten in `expected.json` |
| `ez-gemengd` | eenmanszaak, gemengde rekening, KOR | Loanwise-formaat, gegenereerd met verwachte uitkomsten |
| `vof` | vof, twee vennoten (echtpaar) | Loanwise-formaat, gegenereerd met verwachte uitkomsten |
| `slager`, `lender-spender`, `mister-x` | uit ZK Loans Light | regressie (`tests/regression-baseline.json`) |

Alle data is fictief.
