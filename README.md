# marit-og-nicolai
Bryllupsside for Marit og Nicolai sitt bryllup

## Kjøre siden lokalt

Siden er ren HTML/CSS/JS uten byggesteg. Du kan åpne `index.html` direkte i nettleseren, men en lokal server gir samme oppførsel som på nett.

Med Python (fra prosjektmappen):

```
python -m http.server 8000
```

Åpne deretter http://localhost:8000. Stopp serveren med `Ctrl+C`.

Alternativt: installer VS Code-utvidelsen "Live Server" og velg "Go Live" på `index.html`.

Skjemaene på `svar.html` sender data til Google Apps Script og virker først når `APPS_SCRIPT_URL` i `script.js` er satt (se `OPPSETT_GOOGLE_SHEETS.md`).
