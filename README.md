# zkloans-extreme

Ontwerpvoorstel **Loanwise Zakelijk**: analyse van banktransacties voor zakelijke kredieten, in Loanwise-huisstijl.

- Eén bestand: `index.html` (geen build nodig, direct te hosten, bv. via Netlify).
- Rekent volledig vanaf losse transacties met vaste regels (12 categorieregels, geen AI).
- Weergave Zakelijk / Privé / Samen, gedeelde rekeningen aan/uit.
- **Dataset laden**: JSON of zip in Loanwise-formaat (`PUT …/transactions`) of Enable Now-formaat (`GET /Transactions`, `/Accounts`, analyse-job); automatisch herkend. Bestanden worden alleen in de browser verwerkt.
- E1-categorie (Enable Now) telt alleen als extra signaal naast de eigen regels.
- Voorbeelddossier: Mister X (fictief, gegenereerd).
