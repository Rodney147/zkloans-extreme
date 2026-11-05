# zkloans-extreme · Loanwise Zakelijk

Analyse van banktransacties voor zakelijk krediet, in Loanwise-huisstijl. Loanwise rekent alles vanaf de losse transacties met vaste regels (geen AI) en **toont**: omzet, kosten, cashflow en risico-indicatoren. De **beoordelaar interpreteert** en besluit. Er zitten geen normen, scores of DSCR in.

## Kernprincipes

1. **Loanwise toont, de beoordelaar oordeelt.** Geen normen of oordeelsgrenzen; lampjes laten zien wat er in de transacties staat.
2. **Maandoverzicht is het hart.** 12 maanden als kolommen. Omzet − kosten = operationele cashflow; − financieringslasten = netto cashflow (bestedingsvermogen). Wat niet in de cashflow telt (intern, privé-opnamen, loon DGA, IB/Zvw, ontvangen financiering) staat apart; samen sluit het op de netto mutatie van de rekeningen.
3. **Omzet zuiver.** Eigen rekeningen, privé/DGA, leningen, teruggaaf en terugboekingen tellen niet als omzet.
4. **Alles klikt door naar transacties.** Een maand, een post of een cel opent de transacties; in de pop-up kun je zoeken, filteren op categorie en richting, en sorteren op elke kolom.
5. **Risico-indicatoren als lampje met bewijs**: gemiste termijnen, terugboekingen, incasso/deurwaarder, belastingachterstand, gokken/crypto (ook privé), dalende omzet, negatieve cashflow, niet-gedeelde rekeningen, uitschieters, data-actualiteit.
6. **Vaste regels, geen AI.** Categorieregels 1–12 in `js/core/rules.js`.

## Data inladen

Zip, JSON of CSV, los of samen:

- **Loanwise-CSV, databaseexport zonder kopregel**: 19 kolommen (met `counter_party_name`) of 18 kolommen (oudere export). De eigen IBAN komt uit het externe id; een lege tegenpartijnaam wordt uit de omschrijving gehaald.
- **CSV met kopregel volgens de Loanwise-API** (`POST /households`, `POST …/accounts`, `PUT …/transactions`): `account_name`, `account_number`, `bic`, `booking_date`, `transaction_amount.amount` (centen) of `amount` (euro), `remittance_information_unstructured`, `counter_party_name`, `counter_party_account`, `transaction_type`, `external_id`, `category`, optioneel `member_initials` en `member_last_name`. Komma of puntkomma.
- **Loanwise-JSON** en **Enable Now** (zip of losse bestanden).

**Categorisatie:** de Loanwise-categorie uit de data is leidend (`LOANWISE_NAAR_REGEL` in `config/config.js` bepaalt waar die in het maandoverzicht telt). Alleen een gedeelde eigen rekening als tegenrekening gaat voor, zodat zaak ↔ privé geen interne boeking wordt. `uncategorized` en data zonder categorie vallen terug op de vaste regels. Categorieën zijn niet aan te passen in de app.

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

Overzicht · Maandoverzicht · Omzet · Kosten · Belastingen · Transacties · Risico-indicatoren.

**Belastingen:** omzetbelasting, loonheffing en inkomstenbelasting over 12 maanden, per maand met de kalenderkwartalen uitgelicht (zakelijke én privérekeningen). Een kwartaal zonder btw-betaling of een overgeslagen termijn wordt gemarkeerd en geeft een lampje.

**Thema:** Auto (volgt het systeem), Licht of Donker, plus een optionele glaslaag (doorschijnende kaarten). De keuze blijft per browser bewaard.

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
| `csv-mini`, `csv-tegenpartij`, `csv-api` | Loanwise-CSV (18 en 19 kolommen, en met API-kopregel) | synthetisch; echte exports horen niet in de repo |
| `slager`, `lender-spender`, `mister-x` | uit ZK Loans Light | regressie (`tests/regression-baseline.json`) |

Leidend document (project Loanwise Zakelijk): `categorieregels-verbonden-partijen.md`. Alle data is fictief.
