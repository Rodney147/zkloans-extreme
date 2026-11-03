# Voorbeeldset Enable Now – Hocus Pocus B.V. en Hansie Klokkie (fictief)

Besloten vennootschap met drie zakelijke rekeningen en een DGA met twee privérekeningen. Er zijn geen spaarrekeningen, wel veel geld heen en terug tussen de eigen rekeningen.

| Rekening | IBAN | Houder | Bank | E1-profiel | Rol |
| --- | --- | --- | --- | --- | --- |
| Zakelijk | NL31 INGB •••• ••47 | Hocus Pocus B.V. | ING | corporate | hoofdrekening: klanten, leveranciers, lonen, belasting |
| Zakelijk | NL62 RABO •••• ••19 | Hocus Pocus B.V. | Rabobank | corporate | ontvangstrekening, afgeroomd naar ING; bedrijfslening |
| Zakelijk | NL08 BUNQ •••• ••73 | Hocus Pocus B.V. | bunq | corporate | kaartrekening, aangevuld vanuit ING |
| Privé | NL57 ABNA •••• ••26 | Hansie Klokkie | ABN AMRO | retail | salaris DGA, hypotheek, vaste lasten |
| Privé | NL94 INGB •••• ••58 | H. Klokkie | ING | retail | huishoudrekening |

Periode nov 2025 – okt 2026, gedeeld op 03-11-2026 (4 consents: ING, Rabobank, bunq, ABN AMRO).

## Bestanden
- 00 consents · 01 token · 02a–02d accounts per consent
- 03a/03b categorisatiejob: corporate (3 rekeningen) en retail (2 rekeningen)
- 04 transacties pagina 01–22 (100 per pagina)
- 05a/05b analyse per profiel; 05a met `companyInfo`
- `internal_ibans` bevat alle 5 rekeningen

## Geld heen en terug
- Rabobank → ING: afromen ontvangstrekening (wekelijks, op saldo)
- ING ↔ bunq: kaartrekening aanvullen en restant terug
- ING → ABN AMRO: salaris DGA (maandelijks)
- ABN AMRO → ING (huishoudgeld) en ING privé → ABN AMRO (af en toe terug)
- Rekening-courant DGA: € 15.000 privé → zakelijk (mrt), € 20.000 zakelijk → privé (sep)
- Buffer € 10.000 ING → Rabobank (mei) en terug (jul)

## Te verwachten hits
Zakelijk: wisselende omzet (dip jan–apr, sterk okt), managementfee en lening Klokkie Holding B.V. (groepsmaatschappij), btw per kwartaal plus naheffing en teruggaaf, loonheffingen per maand, voorlopige aanslag Vpb, betalingsregeling loonheffingen (mrt–aug), 2 terugboekingen lease, incassobureau, posten met lage zekerheid.
Privé: voorlopige aanslag IB, gokken (oplopend), crypto, ronde schenking € 10.000, kinderopvang en kinderbijslag.
