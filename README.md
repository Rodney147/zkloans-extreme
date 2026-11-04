# zkloans-extreme · Loanwise Zakelijk

Analyse van banktransacties voor zakelijk krediet, in Loanwise-huisstijl. Loanwise rekent alles vanaf de losse transacties met vaste regels (geen AI) en **toont**: omzet, kosten, cashflow en risico-indicatoren. De **beoordelaar interpreteert** en besluit. Er zitten geen normen, scores of DSCR in.

## Kernprincipes

1. **Loanwise toont, de beoordelaar oordeelt.** Geen normen of oordeelsgrenzen; lampjes laten zien wat er in de transacties staat.
2. **Maandoverzicht is het hart.** 12 maanden als kolommen. Omzet − kosten = operationele cashflow; − financieringslasten = netto cashflow (bestedingsvermogen). Wat niet in de cashflow telt (intern, privé-opnamen, loon DGA, IB/Zvw, ontvangen financiering) staat apart; samen sluit het op de netto mutatie van de rekeningen.
3. **Omzet zuiver.** Eigen rekeningen, privé/DGA, leningen, teruggaaf en terugboekingen tellen niet als omzet.
4. **Alles klikt door naar transacties.** Elke cel opent de transacties van die maand. Een aangepaste categorie per tegenpartij werkt overal door en blijft bewaard.
5. **Risico-indicatoren als lampje met bewijs**: gemiste termijnen, terugboekingen, incasso/deurwaarder, belastingachterstand, gokken/crypto (ook privé), dalende omzet, negatieve cashflow, niet-gedeelde rekeningen, uitschieters, data-actualiteit.
6. **Vaste regels, geen AI.** Categorieregels 1–12 in `js/core/rules.js`.

## Openen

Statische site, geen build. Direct te hosten (Netlify) of lokaal: open `index.html` in de browser, of `npx serve .`.
Bestanden en aanpassingen blijven in de browser (IndexedDB); er gaat niets naar een server.

## Indeling

| Pad | Wat |
| --- | --- |
| `index.html`, `css/app.css` | Pagina en huisstijl |
| `config/config.js` | Gegevensregels (periode ≥ 3 maanden, liefst 12; data niet ouder dan 14 dagen), betaaldiensten, gemengde rekening |
| `js/core/` | Rekenkern zonder DOM: invoer (Enable Now en Loanwise), categorieregels, belasting, cashflow, risico-indicatoren |
| `js/store.js` | Opslag in de browser: rekeningrollen, aanpassingen per tegenpartij (ook voor volgende dossiers), audittrail |
| `js/ui/` | Tabbladen en interactie |
| `tests/` | Testsets, verwachte uitkomsten en tests |

## Tabbladen

Overzicht · Maandoverzicht · Omzet · Kosten · Transacties · Risico-indicatoren.

## Tests

```bash
node --test tests/core.test.js          # rekenregels, ijkpunten, controle-som, regressie (geen dependencies)
python3 tests/e2e_smoke.py              # browser: alle tabbladen, doorklikken, aanpassing per tegenpartij, opslag (Playwright)
```

| Set | Rechtsvorm | Bron |
| --- | --- | --- |
| `hocus-pocus` | bv, 3 zakelijk + 2 privé, 2.132 tx | Enable Now, ijkpunten in `expected.json` |
| `ez-gemengd` | eenmanszaak, gemengde rekening | Loanwise-formaat, gegenereerd |
| `vof` | vof, twee vennoten | Loanwise-formaat, gegenereerd |
| `pizza-patat` | twee eenmanszaken, gezamenlijk huishouden | Enable Now, gegenereerd (`tests/generators/pizza_patat.py`) |
| `slager`, `lender-spender`, `mister-x` | uit ZK Loans Light | regressie (`tests/regression-baseline.json`) |

Leidend document (project Loanwise Zakelijk): `categorieregels-verbonden-partijen.md`. Alle data is fictief.
