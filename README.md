# Stoplicht Dagboek

Web-app om bij te houden of je op groen, oranje of rood staat, met triggers, signalen en wat hielp. Met kalender, analyse, een automatisch signaleringsplan, een dagelijkse tip en pushmeldingen 3× per dag.

App: **https://jetzantvoord93.github.io/stoplicht/**

## Op je iPhone

1. Open de link in Safari.
2. Deel-icoon › **Zet op beginscherm**.
3. Open de app via het icoon en ga naar **Meer › Meldingen aanzetten**.
4. Kopieer de meldingscode en zet hem op een eigen regel in `meldingen/codes.txt` (of stuur hem naar Claude).

Je meldingen worden alleen op je telefoon bewaard (in de app zelf). Maak af en toe een back-up via **Meer › Back-up maken**.

## Hoe de meldingen werken

`.github/workflows/meldingen.yml` draait elk half uur en roept `scripts/send.mjs` aan. Het sleutelpaar voor Web Push maakt de workflow zelf één keer aan (`scripts/keys.mjs`) en bewaart het in de cache van GitHub Actions; alleen de publieke sleutel staat in `meldingen/vapid-public.txt`. Dat script kijkt welke herinneringstijden uit je meldingscode (Nederlandse tijd) in het afgelopen half uur vielen en stuurt dan een Web Push-bericht naar je iPhone. De ochtendmelding noemt de tip van de dag.

- Testmelding: verander `meldingen/codes.txt`, of kies **Actions › Meldingen › Run workflow**.
- Tijden wijzigen: pas ze aan in de app (Meer) en vervang de code in `meldingen/codes.txt`.
- Meerdere toestellen: één code per regel.
- Mislukt een run met "abonnement verlopen", zet dan meldingen opnieuw aan in de app en vervang de code.
