# Oppsett: Google Sheets for RSVP-svar

## 1. Opprett et Google Sheet

1. Gå til [sheets.google.com](https://sheets.google.com) og opprett et nytt regneark.
2. Gi det navn, f.eks. "Bryllup RSVP 2027".
3. I **rad 1** (overskrifter), skriv inn:

   | A | B | C | D | E | F | G |
   |---|---|---|---|---|---|---|
   | Tidspunkt | Navn | E-post | Deltakelse | Antall | Matpreferanser | Hilsen |

4. Opprett et nytt ark (fane) kalt **Meldinger** med overskrifter:

   | A | B | C |
   |---|---|---|
   | Tidspunkt | Navn | Melding |

## 2. Legg til Apps Script

1. I regnearket, klikk **Utvidelser → Apps Script**.
2. Slett innholdet og lim inn følgende:

```javascript
function doPost(e) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet();
  var data = JSON.parse(e.postData.contents);

  if (data.spill !== undefined) {
    saveScore(sheet, data);
  } else if (data.deltakelse !== undefined) {
    var rsvp = sheet.getSheetByName("Ark1") || sheet.getSheets()[0];
    rsvp.appendRow([
      new Date(),
      data.navn || "",
      data.epost || "",
      data.deltakelse || "",
      data.antall || "",
      data.matpreferanser || "",
      data.hilsen || ""
    ]);
  } else if (data.melding !== undefined) {
    var meldinger = sheet.getSheetByName("Meldinger");
    if (!meldinger) {
      meldinger = sheet.insertSheet("Meldinger");
      meldinger.appendRow(["Tidspunkt", "Navn", "Melding"]);
    }
    meldinger.appendRow([
      new Date(),
      data.navn || "",
      data.melding || ""
    ]);
  }

  return ContentService
    .createTextOutput(JSON.stringify({ status: "ok" }))
    .setMimeType(ContentService.MimeType.JSON);
}

var SPILL = ["nicolai", "bukett", "racer"];

function saveScore(sheet, data) {
  var spill = String(data.spill);
  var score = Math.round(Number(data.score));
  var navn = String(data.navn || "").replace(/\s+/g, " ").trim().slice(0, 20);
  if (SPILL.indexOf(spill) === -1 || !navn || !isFinite(score) || score <= 0 || score > 1000000) return;
  if (/^[=+\-@]/.test(navn)) navn = "'" + navn; // hindrer formler i arket

  var poeng = sheet.getSheetByName("Poeng");
  if (!poeng) {
    poeng = sheet.insertSheet("Poeng");
    poeng.appendRow(["Tidspunkt", "Spill", "Navn", "Score"]);
  }
  poeng.appendRow([new Date(), spill, navn, score]);
}

// Returnerer beste score per navn for hvert spill: { nicolai: [{navn, score}], ... }
function doGet(e) {
  var result = { nicolai: [], bukett: [], racer: [] };
  var poeng = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Poeng");
  if (poeng && poeng.getLastRow() > 1) {
    var rows = poeng.getRange(2, 2, poeng.getLastRow() - 1, 3).getValues();
    var best = {};
    rows.forEach(function (r) {
      var spill = r[0];
      var navn = String(r[1]).replace(/^'/, "");
      var score = Number(r[2]);
      if (!result[spill] || !navn || !isFinite(score)) return;
      var key = spill + "|" + navn.toLowerCase();
      if (!best[key] || score > best[key].score) best[key] = { spill: spill, navn: navn, score: score };
    });
    Object.keys(best).forEach(function (k) {
      result[best[k].spill].push({ navn: best[k].navn, score: best[k].score });
    });
  }
  return ContentService
    .createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}
```

3. Lagre (Ctrl+S).

Arket **Poeng** (tidspunkt, spill, navn, score) opprettes automatisk ved første innsendte score og brukes av poengtavlen i spillene. Det kan ikke beskyttes mot juks siden alt skjer i nettleseren, så sjekk gjerne arket for urealistiske tall før premieutdelingen.

Har du allerede publisert en nettapp, må du oppdatere den etter å ha limt inn ny kode: **Distribuer → Administrer distribusjoner → rediger (blyant) → Versjon: Ny versjon → Distribuer**. URL-en forblir den samme.

## 3. Publiser som webapp

1. Klikk **Distribuer → Ny distribusjon**.
2. Velg type: **Nettapp**.
3. Sett:
   - **Kjør som:** Meg selv
   - **Hvem har tilgang:** Alle
4. Klikk **Distribuer** og godkjenn tillatelsene.
5. Kopier **URL-en** du får.

## 4. Lim inn URL-en i nettsiden

Åpne `script.js` og erstatt:

```
const APPS_SCRIPT_URL = "LIMEINN_DIN_APPS_SCRIPT_URL_HER";
```

med den faktiske URL-en fra steg 3, f.eks.:

```
const APPS_SCRIPT_URL = "https://script.google.com/macros/s/ABC.../exec";
```

Ferdig! Alle RSVP-svar og meldinger havner nå automatisk i Google Sheet-regnearket.
