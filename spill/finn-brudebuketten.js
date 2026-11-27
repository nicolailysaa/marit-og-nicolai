(function () {
  "use strict";

  var ICONS = ["\u{1F48D}", "\u{1F382}", "\u{1F37E}", "\u{1F697}", "\u{1F490}", "\u{1F470}", "\u{1F935}", "\u{1F54A}\uFE0F"];
  var gridEl = document.getElementById("memory-grid");
  var movesEl = document.getElementById("moves-display");
  var timeEl = document.getElementById("time-display");
  var bestEl = document.getElementById("best-display");
  var best = parseInt(localStorage.getItem("bryllup_memory_rekord") || "0", 10);
  var board = window.Scoreboard
    ? Scoreboard.mount("finn-brudebuketten", document.getElementById("scoreboard"))
    : null;

  var first, lock, moves, matched, startTime, timer;

  function shuffle(a) {
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i];
      a[i] = a[j];
      a[j] = t;
    }
    return a;
  }

  function seconds() {
    return startTime ? Math.floor((Date.now() - startTime) / 1000) : 0;
  }

  function hud() {
    movesEl.textContent = "Fors\u00f8k: " + moves;
    timeEl.textContent = "Tid: " + seconds() + " s";
    bestEl.textContent = "Rekord: " + best;
  }

  function start() {
    clearInterval(timer);
    first = null;
    lock = false;
    moves = 0;
    matched = 0;
    startTime = 0;
    if (board) board.clear();
    gridEl.textContent = "";
    shuffle(ICONS.concat(ICONS)).forEach(function (icon) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "memory-card";
      b.setAttribute("aria-label", "Skjult kort");
      b.dataset.icon = icon;
      b.addEventListener("click", function () {
        flip(b);
      });
      gridEl.appendChild(b);
    });
    hud();
  }

  function show(b) {
    b.classList.add("open");
    b.textContent = b.dataset.icon;
    b.removeAttribute("aria-label");
  }

  function hide(b) {
    b.classList.remove("open");
    b.textContent = "";
    b.setAttribute("aria-label", "Skjult kort");
  }

  function flip(b) {
    if (lock || b === first || b.classList.contains("matched")) return;
    if (!startTime) {
      startTime = Date.now();
      timer = setInterval(hud, 500);
    }
    show(b);
    if (!first) {
      first = b;
      return;
    }
    moves++;
    var a = first;
    first = null;
    if (a.dataset.icon === b.dataset.icon) {
      a.classList.add("matched");
      b.classList.add("matched");
      matched++;
      if (matched === ICONS.length) finish();
    } else {
      lock = true;
      setTimeout(function () {
        hide(a);
        hide(b);
        lock = false;
      }, 800);
    }
    hud();
  }

  function finish() {
    clearInterval(timer);
    var score = Math.max(50, Math.round(1500 - seconds() * 10 - moves * 20));
    if (score > best) {
      best = score;
      localStorage.setItem("bryllup_memory_rekord", String(best));
    }
    hud();
    if (board) board.submit(score);
  }

  document.getElementById("restart-btn").addEventListener("click", start);
  start();
})();
