(function () {
  "use strict";

  var canvas = document.getElementById("game");
  var ctx = canvas.getContext("2d");
  var W = canvas.width;
  var H = canvas.height;
  var BASE_Y = H - 40;
  var LAYER_H = 28;
  var START_W = 180;
  var COLORS = ["#f6d5dc", "#fff3d6", "#d9e8f5", "#e6dcf5", "#d8efd9"];

  var scoreEl = document.getElementById("score-display");
  var bestEl = document.getElementById("best-display");
  var best = parseInt(localStorage.getItem("bryllup_kake_rekord") || "0", 10);
  var board = window.Scoreboard
    ? Scoreboard.mount("kakestabelen", document.getElementById("scoreboard"))
    : null;

  var layers, cur, falling, state, cameraY, targetCam, debris, last;

  function reset() {
    layers = [{ x: (W - START_W) / 2, w: START_W }];
    cur = null;
    falling = null;
    debris = [];
    cameraY = 0;
    targetCam = 0;
    state = "ready";
    spawn();
    update_hud();
    if (board) board.clear();
  }

  function update_hud() {
    var n = layers.length - 1;
    scoreEl.textContent = "Lag: " + n;
    bestEl.textContent = "Rekord: " + best;
  }

  function spawn() {
    var top = layers[layers.length - 1];
    var n = layers.length;
    cur = {
      w: top.w,
      x: 0,
      dir: n % 2 ? 1 : -1,
      speed: 140 + Math.min(n, 30) * 9,
    };
    cur.x = cur.dir === 1 ? -cur.w : W;
    state = "swing";
  }

  function layerY(i) {
    return BASE_Y - (i + 1) * LAYER_H;
  }

  function drop() {
    if (state === "over") {
      reset();
      return;
    }
    if (state !== "swing") return;
    var top = layers[layers.length - 1];
    var left = Math.max(cur.x, top.x);
    var right = Math.min(cur.x + cur.w, top.x + top.w);
    var overlap = right - left;
    var perfect = Math.abs(cur.x - top.x) < 4;
    if (overlap <= 0) {
      debris.push({ x: cur.x, y: layerY(layers.length), w: cur.w, vy: 0, i: layers.length });
      endGame();
      return;
    }
    if (perfect) {
      left = top.x;
      overlap = top.w;
    } else if (cur.x < top.x) {
      debris.push({ x: cur.x, y: layerY(layers.length), w: top.x - cur.x, vy: 0, i: layers.length });
    } else if (cur.x + cur.w > top.x + top.w) {
      debris.push({ x: top.x + top.w, y: layerY(layers.length), w: cur.x + cur.w - (top.x + top.w), vy: 0, i: layers.length });
    }
    layers.push({ x: left, w: overlap });
    var above = layerY(layers.length - 1);
    targetCam = Math.max(0, 200 - above);
    update_hud();
    if (overlap < 6) {
      endGame();
      return;
    }
    spawn();
  }

  function endGame() {
    state = "over";
    cur = null;
    var n = layers.length - 1;
    if (n > best) {
      best = n;
      localStorage.setItem("bryllup_kake_rekord", String(best));
    }
    update_hud();
    if (board) board.submit(n);
  }

  function step(dt) {
    if (state === "swing" && cur) {
      cur.x += cur.dir * cur.speed * dt;
      if (cur.x + cur.w > W) {
        cur.x = W - cur.w;
        cur.dir = -1;
      } else if (cur.x < 0) {
        cur.x = 0;
        cur.dir = 1;
      }
    }
    debris.forEach(function (d) {
      d.vy += 900 * dt;
      d.y += d.vy * dt;
    });
    debris = debris.filter(function (d) {
      return d.y < BASE_Y + 400;
    });
    cameraY += (targetCam - cameraY) * Math.min(1, dt * 5);
  }

  function block(x, y, w, i) {
    ctx.fillStyle = COLORS[i % COLORS.length];
    ctx.fillRect(x, y, w, LAYER_H - 2);
    ctx.strokeStyle = "#b08a94";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x, y, w, LAYER_H - 2);
    ctx.fillStyle = "#fff";
    ctx.fillRect(x, y, w, 6);
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "#f0ebe3";
    ctx.fillRect(0, 0, W, H);
    ctx.save();
    ctx.translate(0, cameraY);
    ctx.fillStyle = "#d9c9b6";
    ctx.fillRect(0, BASE_Y, W, 40 + 400);
    layers.forEach(function (l, i) {
      block(l.x, layerY(i), l.w, i);
    });
    debris.forEach(function (d) {
      block(d.x, d.y, d.w, d.i);
    });
    if (cur) block(cur.x, layerY(layers.length - 1) - LAYER_H, cur.w, layers.length);
    if (state === "over") {
      var t = layers[layers.length - 1];
      ctx.font = "26px serif";
      ctx.textAlign = "center";
      ctx.fillStyle = "#000";
      ctx.fillText("\u{1F470}\u{1F935}", t.x + t.w / 2, layerY(layers.length - 1) - 4);
    }
    ctx.restore();

    ctx.textAlign = "center";
    ctx.fillStyle = "#333";
    if (state === "over") {
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      ctx.fillRect(40, 20, W - 80, 80);
      ctx.fillStyle = "#333";
      ctx.font = "bold 22px sans-serif";
      ctx.fillText("Kaken falt! " + (layers.length - 1) + " lag", W / 2, 55);
      ctx.font = "14px sans-serif";
      ctx.fillText("Trykk for \u00e5 pr\u00f8ve igjen", W / 2, 80);
    }
  }

  function loop(ts) {
    var dt = last ? Math.min(0.05, (ts - last) / 1000) : 0;
    last = ts;
    step(dt);
    draw();
    requestAnimationFrame(loop);
  }

  canvas.addEventListener("pointerdown", function (e) {
    e.preventDefault();
    drop();
  });
  document.addEventListener("keydown", function (e) {
    if (e.code === "Space") {
      e.preventDefault();
      if (!e.repeat) drop();
    }
  });

  reset();
  requestAnimationFrame(loop);
})();
