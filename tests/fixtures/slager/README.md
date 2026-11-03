# Voorbeeldset Enable Now – Slager Maatwerk Interieur (fictief)

Fictief dossier: Slager Maatwerk Interieur (eenmanszaak), 2 rekeningen, nov 2024 – okt 2025, 460 transacties.
Elk bestand bevat het verzoek en het antwoord zoals de Enable Now-API ze levert, in de volgorde van ophalen.

| Bestand | Call |
| --- | --- |
| 00-get-consents.json | GET /v2/consents (Rabobank, gedeeld op 03-11-2025) |
| 01-token.json | POST /connect/token |
| 02-get-accounts.json | GET /Accounts |
| 03-categorization-job.json | POST /v2/categorization-jobs + GET /v2/categorization-jobs/{id} |
| 04-get-transactions-page-1..5.json | GET /Transactions, 100 per pagina, via PageToken |
| 05-analysis-job.json | POST /analysis-jobs + GET /analysis-jobs/{id} (E1, corporate) |

Aannames (niet in de documentatie): responsvelden van /connect/token, jobstatus "COMPLETED", consentstatus "ACTIVE", modelversie "e1-2026.10".
Alle IBAN's zijn gemaskeerd en fictief. De bucketsommen in 05 sluiten aan op de transacties in 04.
