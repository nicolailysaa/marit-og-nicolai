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

  if (data.deltakelse !== undefined) {
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
```

3. Lagre (Ctrl+S).

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
