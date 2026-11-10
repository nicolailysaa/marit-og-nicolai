// Felles poengtavle for bryllupsspillene. Krever at ../script.js (APPS_SCRIPT_URL) er lastet først.
(function () {
  "use strict";

  var GAMES = [
    { key: "nicolai", name: "Forsovet", unit: "poeng" },
    { key: "bukett", name: "Kast buketten!", unit: "m" },
    { key: "racer", name: "Fri fart!", unit: "poeng" },
  ];
  var POINTS = [25, 20, 17, 15, 12, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1];
  var NAME_KEY = "bryllup_spillernavn";
  var BEST_KEY = "bryllup_innsendt_";
  var MAX_NAME = 20;
  var CACHE_MS = 15000;

  var cache = null;
  var cacheTime = 0;

  function configured() {
    return (
      typeof APPS_SCRIPT_URL === "string" && APPS_SCRIPT_URL.indexOf("LIMEINN") === -1
    );
  }

  function gameInfo(key) {
    for (var i = 0; i < GAMES.length; i++) if (GAMES[i].key === key) return GAMES[i];
    return null;
  }

  function cleanName(s) {
    return String(s || "").replace(/\s+/g, " ").trim().slice(0, MAX_NAME);
  }

  function nameKey(s) {
    return cleanName(s).toLowerCase();
  }

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  function fetchScores(force) {
    if (!configured()) return Promise.reject(new Error("not-configured"));
    if (!force && cache && Date.now() - cacheTime < CACHE_MS) return Promise.resolve(cache);
    return fetch(APPS_SCRIPT_URL + "?action=scores")
      .then(function (r) {
        return r.json();
      })
      .then(function (data) {
        cache = data;
        cacheTime = Date.now();
        return data;
      });
  }

  // Beste score per navn (uavhengig av store/små bokstaver), sortert synkende.
  function bestPerName(rows) {
    var map = {};
    (rows || []).forEach(function (r) {
      var navn = cleanName(r.navn);
      var score = Number(r.score);
      if (!navn || !isFinite(score)) return;
      var k = nameKey(navn);
      if (!map[k] || score > map[k].score) map[k] = { navn: navn, score: score };
    });
    return Object.keys(map)
      .map(function (k) {
        return map[k];
      })
      .sort(function (a, b) {
        return b.score - a.score;
      });
  }

  // Lik score gir lik plassering og like mange poeng.
  function rank(list) {
    var prev = null;
    var prevPlace = 0;
    return list.map(function (r, i) {
      var place = prev !== null && r.score === prev ? prevPlace : i + 1;
      prev = r.score;
      prevPlace = place;
      return { navn: r.navn, score: r.score, place: place, points: POINTS[place - 1] || 0 };
    });
  }

  function overall(data) {
    var totals = {};
    GAMES.forEach(function (g) {
      rank(bestPerName(data[g.key])).forEach(function (r) {
        var k = nameKey(r.navn);
        if (!totals[k]) totals[k] = { navn: r.navn, total: 0, perGame: {} };
        totals[k].total += r.points;
        totals[k].perGame[g.key] = r.points;
      });
    });
    return Object.keys(totals)
      .map(function (k) {
        return totals[k];
      })
      .sort(function (a, b) {
        return b.total - a.total || a.navn.localeCompare(b.navn);
      });
  }

  function formatScore(score, unit) {
    return Math.round(score).toLocaleString("nb-NO") + " " + unit;
  }

  function message(text) {
    return el("p", "board-empty", text);
  }

  function renderGameBoard(game, target) {
    var info = gameInfo(game);
    target.textContent = "";
    target.appendChild(el("h3", "board-title", "Poengtavle \u2013 " + info.name));
    if (!configured()) {
      target.appendChild(message("Poengtavlen er ikke satt opp enn\u00e5."));
      return Promise.resolve();
    }
    target.appendChild(message("Laster\u2026"));
    return fetchScores(false)
      .then(function (data) {
        var rows = rank(bestPerName(data[game])).slice(0, 10);
        target.textContent = "";
        target.appendChild(el("h3", "board-title", "Poengtavle \u2013 " + info.name));
        if (!rows.length) {
          target.appendChild(message("Ingen har satt rekord enn\u00e5. Bli den f\u00f8rste!"));
          return;
        }
        var table = el("table", "board-table");
        rows.forEach(function (r) {
          var tr = el("tr");
          tr.appendChild(el("td", "board-place", r.place + "."));
          tr.appendChild(el("td", "board-name", r.navn));
          tr.appendChild(el("td", "board-score", formatScore(r.score, info.unit)));
          tr.appendChild(el("td", "board-pts", r.points + " p"));
          table.appendChild(tr);
        });
        target.appendChild(table);
      })
      .catch(function () {
        target.textContent = "";
        target.appendChild(el("h3", "board-title", "Poengtavle \u2013 " + info.name));
        target.appendChild(message("Kunne ikke hente poengtavlen."));
      });
  }

  function renderOverall(target) {
    target.textContent = "";
    target.appendChild(el("h2", null, "Sammenlagt"));
    target.appendChild(
      el(
        "p",
        null,
        "Det beste resultatet i hvert spill gir poeng: 25, 20, 17, 15, 12, 10, og s\u00e5 ett poeng ned til 1. Sammenlagtvinneren f\u00e5r en premie p\u00e5 bryllupsdagen!"
      )
    );
    if (!configured()) {
      target.appendChild(message("Poengtavlen er ikke satt opp enn\u00e5."));
      return Promise.resolve();
    }
    return fetchScores(true)
      .then(function (data) {
        var rows = overall(data).slice(0, 20);
        if (!rows.length) {
          target.appendChild(message("Ingen resultater enn\u00e5."));
          return;
        }
        var table = el("table", "board-table board-overall");
        var head = el("tr");
        ["", "Navn"]
          .concat(
            GAMES.map(function (g) {
              return g.name;
            })
          )
          .concat(["Totalt"])
          .forEach(function (h) {
            head.appendChild(el("th", null, h));
          });
        table.appendChild(head);
        rows.forEach(function (r, i) {
          var tr = el("tr");
          tr.appendChild(el("td", "board-place", i + 1 + "."));
          tr.appendChild(el("td", "board-name", r.navn));
          GAMES.forEach(function (g) {
            tr.appendChild(el("td", "board-pts", String(r.perGame[g.key] || 0)));
          });
          tr.appendChild(el("td", "board-total", r.total + " p"));
          table.appendChild(tr);
        });
        target.appendChild(table);
      })
      .catch(function () {
        target.appendChild(message("Kunne ikke hente poengtavlen."));
      });
  }

  function submitScore(game, navn, score) {
    return fetch(APPS_SCRIPT_URL, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ spill: game, navn: navn, score: score }),
    });
  }

  function mount(game, target) {
    var info = gameInfo(game);
    var promptBox = el("div", "score-prompt-area");
    var boardBox = el("div", "board");
    target.textContent = "";
    target.appendChild(promptBox);
    target.appendChild(boardBox);
    renderGameBoard(game, boardBox);

    function best() {
      return parseFloat(localStorage.getItem(BEST_KEY + game) || "0");
    }

    function clear() {
      promptBox.textContent = "";
    }

    function submit(score) {
      score = Math.round(Number(score));
      clear();
      if (!isFinite(score) || score <= 0 || score <= best()) return;

      var box = el("div", "score-prompt");
      box.appendChild(el("p", "score-prompt-result", "Du fikk " + formatScore(score, info.unit) + "!"));
      box.appendChild(
        el(
          "p",
          null,
          "Skriv inn navnet ditt for \u00e5 havne p\u00e5 highscore-listen! Sammenlagtvinneren f\u00e5r en premie p\u00e5 bryllupsdagen!"
        )
      );

      var form = el("form", "score-form");
      var input = el("input");
      input.type = "text";
      input.name = "navn";
      input.maxLength = MAX_NAME;
      input.required = true;
      input.placeholder = "Navn";
      input.autocomplete = "name";
      input.value = localStorage.getItem(NAME_KEY) || "";
      var btn = el("button", "button", "Send inn");
      btn.type = "submit";
      form.appendChild(input);
      form.appendChild(btn);
      box.appendChild(form);
      box.appendChild(
        el(
          "p",
          "game-hint",
          "Bruk samme navn i alle spillene for \u00e5 v\u00e6re med i kampen om sammenlagtseieren."
        )
      );
      var status = el("p", "status");
      status.setAttribute("aria-live", "polite");
      box.appendChild(status);
      promptBox.appendChild(box);

      if (!configured()) {
        btn.disabled = true;
        status.textContent = "Poengtavlen er ikke satt opp enn\u00e5, s\u00e5 resultatet kan ikke sendes inn.";
        return;
      }

      form.addEventListener("submit", function (e) {
        e.preventDefault();
        var navn = cleanName(input.value);
        if (!navn) return;
        btn.disabled = true;
        status.classList.remove("error");
        status.textContent = "Sender\u2026";
        submitScore(game, navn, score)
          .then(function () {
            localStorage.setItem(NAME_KEY, navn);
            localStorage.setItem(BEST_KEY + game, String(score));
            status.textContent = "Registrert! Takk, " + navn + ".";
            form.hidden = true;
            setTimeout(function () {
              fetchScores(true).then(function () {
                renderGameBoard(game, boardBox);
              }, function () {});
            }, 1500);
          })
          .catch(function () {
            btn.disabled = false;
            status.classList.add("error");
            status.textContent = "Noe gikk galt. Pr\u00f8v igjen.";
          });
      });
    }

    return { submit: submit, clear: clear };
  }

  window.Scoreboard = {
    GAMES: GAMES,
    POINTS: POINTS,
    mount: mount,
    renderOverall: renderOverall,
    // Rene funksjoner, eksponert for testing
    _bestPerName: bestPerName,
    _rank: rank,
    _overall: overall,
  };
})();
