// ---------------------------------------------------------------
// KONFIGURASJON: Lim inn URL-en fra Google Apps Script her
// ---------------------------------------------------------------
const APPS_SCRIPT_URL = "LIMEINN_DIN_APPS_SCRIPT_URL_HER";

async function submitToSheet(form, statusEl, successText) {
  const data = Object.fromEntries(new FormData(form).entries());
  statusEl.textContent = "Sender...";

  try {
    const res = await fetch(APPS_SCRIPT_URL, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    statusEl.textContent = successText;
    form.reset();
  } catch {
    statusEl.textContent = "Noe gikk galt. Prøv igjen.";
    statusEl.classList.add("error");
  }
}

function setupForm(formId, statusId, successText) {
  const form = document.getElementById(formId);
  const status = document.getElementById(statusId);
  if (!form || !status) return;

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    submitToSheet(form, status, successText);
  });
}

setupForm(
  "rsvp-form",
  "rsvp-status",
  "Takk for svaret! Vi har mottatt din RSVP."
);

setupForm(
  "contact-form",
  "contact-status",
  "Takk! Meldingen din er sendt."
);
