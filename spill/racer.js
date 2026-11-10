(function () {
  "use strict";

  // ===================================================================
  // Kjerne: veg, fysikk, fartskontroll, poeng (ingen DOM – kan kjøres i Node)
  // ===================================================================

  var T = {
    SEG: 200, // lengde på ett vegsegment (verdensenheter)
    ROAD_W: 2000, // halv vegbredde
    LANES: 4,
    CAM_H: 1000,
    FOV: 100,
    DRAW: 200, // antall segmenter som tegnes framover
    RUMBLE: 3,
    MAX_SPEED: 160, // km/h
    UNITS_PER_KMH: 75, // 160 km/h = 60 segmenter i sekundet
    ACCEL: 60, // km/h per sekund (avtar mot toppfart)
    BRAKE: 100,
    OFFROAD_DECEL: 90,
    OFFROAD_LIMIT: 50,
    STEER: 2.4,
    CENTRIFUGAL: 0.2,
    X_MAX: 2.2,
    CAR_W: 0.26, // bilbredde i halve vegbredder
    CAR_LEN: 300,
    LIMIT: 80, // fartsgrense ved fartskontroll
    PAR_TIME: 80, // sekunder
    OVERTAKE_POINTS: 50,
    TRAFFIC: 40,
    EXTRA_SEGS: 300, // flat veg etter mål
  };
  T.CAM_DEPTH = 1 / Math.tan(((T.FOV / 2) * Math.PI) / 180);
  T.PLAYER_Z = T.CAM_H * T.CAM_DEPTH;

  // [lengde i segmenter, sving, høydeendring i segmenter]
  var LAYOUT = [
    [60, 0, 0], [90, 2, 0], [100, 0, 20], [40, 0, 0], [140, -3, 0],
    [90, 3, 0], [90, -3, 0], [110, 4, -25], [80, 0, 0], [100, 0, 0],
    [100, 0, 15], [100, 0, -15], [150, 0, 0], [110, -4, 0], [120, 3, 20],
    [120, 0, -20], [100, -2, 0], [100, 4, 0], [100, -4, 0], [100, 0, 25],
    [100, 0, -25], [200, 0, 0], [120, 3, 0], [120, -3, 0], [140, 2, 30],
    [120, 0, -30], [100, -4, 0], [100, 2, 0], [200, 0, 0],
  ];

  var WARN_AHEAD = 170; // segmenter før kamera: "FARTSKONTROLL"-skilt
  var LIMIT_AHEAD = [120, 40]; // segmenter før kamera: 80-skilt
  var LANE_X = [-0.75, -0.25, 0.25, 0.75];
  var LANE_SPEED = [92, 82, 70, 58]; // venstre felt er raskest
  var TYPICAL_SEG_PER_SEC = 48;

  function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
  }

  function mulberry32(a) {
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function easeIn(a, b, p) {
    return a + (b - a) * p * p;
  }

  function easeInOut(a, b, p) {
    return a + (b - a) * (0.5 - Math.cos(p * Math.PI) / 2);
  }

  function buildRoad() {
    var segs = [];
    var rnd = mulberry32(2027);

    function lastY() {
      return segs.length ? segs[segs.length - 1].y2 : 0;
    }

    function addSeg(curve, y2) {
      var i = segs.length;
      segs.push({
        index: i,
        curve: curve,
        y1: lastY(),
        y2: y2,
        dark: Math.floor(i / T.RUMBLE) % 2 === 1,
        zone: 0,
        sprites: [],
        features: [],
      });
    }

    function addRoad(len, curve, h) {
      var enter = Math.round(len * 0.25);
      var leave = enter;
      var hold = len - enter - leave;
      var startY = lastY();
      var endY = startY + h * T.SEG;
      var n;
      for (n = 0; n < enter; n++) addSeg(easeIn(0, curve, n / enter), easeInOut(startY, endY, n / len));
      for (n = 0; n < hold; n++) addSeg(curve, easeInOut(startY, endY, (enter + n) / len));
      for (n = 0; n < leave; n++) addSeg(easeInOut(curve, 0, n / leave), easeInOut(startY, endY, (enter + hold + n) / len));
    }

    LAYOUT.forEach(function (s) {
      addRoad(s[0], s[1], s[2]);
    });
    var N = segs.length;
    for (var e = 0; e < T.EXTRA_SEGS; e++) addSeg(0, lastY());

    // soner: by, skog, jordbruk/kyst
    var DENSITY = [0.12, 0.26, 0.1];
    var KINDS = [
      ["birch", "house", "bush", "birch"],
      ["pine", "pine", "pine", "pine", "rock", "bush"],
      ["bale", "bush", "birch", "house", "bale"],
    ];
    var i, side, kind, s;
    for (i = 0; i < segs.length; i++) {
      s = segs[i];
      s.zone = i < 500 ? 0 : i < 2000 ? 1 : 2;
      if (i < 4) continue;
      if (s.zone === 0 && i % 10 === 0 && i > 30) {
        s.sprites.push({ kind: "lamp", offset: -1.5, size: 1, v: 0 });
        s.sprites.push({ kind: "lamp", offset: 1.5, size: 1, v: 0 });
      }
      for (side = -1; side <= 1; side += 2) {
        if (side < 0 && i < 30) continue;
        if (rnd() >= DENSITY[s.zone]) continue;
        kind = KINDS[s.zone][Math.floor(rnd() * KINDS[s.zone].length)];
        var off = kind === "house" ? 3.6 + rnd() * 4 : 2.7 + rnd() * 6;
        s.sprites.push({ kind: kind, offset: side * off, size: 0.8 + rnd() * 0.5, v: rnd() });
      }
    }

    var cams = [Math.round(N / 3), Math.round((2 * N) / 3)];
    cams.forEach(function (c) {
      segs[c].features.push({ kind: "gantry", offset: 0, size: 1, v: 0 });
      segs[c - WARN_AHEAD].features.push({ kind: "warn", offset: -1.45, size: 1, v: 0 });
      segs[c - WARN_AHEAD].features.push({ kind: "warn", offset: 1.45, size: 1, v: 0 });
      LIMIT_AHEAD.forEach(function (a) {
        segs[c - a].features.push({ kind: "limit", offset: -1.45, size: 1, v: 0 });
        segs[c - a].features.push({ kind: "limit", offset: 1.45, size: 1, v: 0 });
      });
    });
    segs[10].features.push({ kind: "church", offset: -3.8, size: 1, v: 0 });
    segs[N].features.push({ kind: "finish", offset: 0, size: 1, v: 0 });

    return {
      segments: segs,
      length: N,
      finishZ: N * T.SEG,
      cameras: cams.map(function (c) {
        return { seg: c, z: c * T.SEG };
      }),
    };
  }

  function segAt(road, z) {
    var i = Math.floor(z / T.SEG);
    return road.segments[clamp(i, 0, road.segments.length - 1)];
  }

  function makeCars(seed, length) {
    var rnd = mulberry32(seed);
    var cars = [];
    for (var k = 0; k < T.TRAFFIC; k++) {
      var lane = Math.floor(rnd() * 4);
      var speed = LANE_SPEED[lane] + (rnd() * 10 - 5);
      // startposisjon slik at en typisk fartsfull kjører (~48 seg/s) møter bilen jevnt utover ruta
      var meet = 100 + ((length - 200) * (k + rnd() * 0.8)) / T.TRAFFIC;
      var carSegPerSec = (speed * T.UNITS_PER_KMH) / T.SEG;
      var seg = Math.max(40 + k, meet * (1 - carSegPerSec / TYPICAL_SEG_PER_SEC));
      cars.push({
        z: seg * T.SEG,
        x: LANE_X[lane],
        speed: speed,
        color: Math.floor(rnd() * 7),
        passed: false,
      });
    }
    return cars;
  }

  function newRun(road, seed) {
    return {
      pos: T.PLAYER_Z,
      x: 0,
      speed: 0,
      time: 0,
      overtakes: 0,
      bumps: 0,
      bumpCd: 0,
      camIndex: 0,
      camSpeeds: [],
      status: "running", // running | caught | finished
      finishTime: null,
      score: null,
      cars: makeCars(seed === undefined ? 1 : seed, road.length),
    };
  }

  // Avrundet km/h – samme tall som spilleren ser i speedometeret
  function cameraCheck(speedKmh) {
    return Math.round(speedKmh) > T.LIMIT;
  }

  function computeScore(elapsedSeconds, overtakes) {
    var timeBonus = Math.max(0, Math.round((T.PAR_TIME - elapsedSeconds) * 100));
    return timeBonus + overtakes * T.OVERTAKE_POINTS;
  }

  function scoreFor(run) {
    return run.status === "finished" ? computeScore(run.finishTime, run.overtakes) : null;
  }

  // input: { steer: -1..1, gas: bool, brake: bool }
  function step(run, road, input, dt) {
    var events = [];
    if (run.status !== "running") return events;

    var seg = segAt(road, run.pos);
    var sp = run.speed;
    var pct = sp / T.MAX_SPEED;
    var gas = input.gas && !input.brake;
    if (gas) sp += T.ACCEL * (1 - 0.75 * pct * pct) * dt;
    else sp -= (3 + 0.03 * sp) * dt;
    if (input.brake) sp -= T.BRAKE * dt;
    if (Math.abs(run.x) > 1 && sp > T.OFFROAD_LIMIT) sp = Math.max(T.OFFROAD_LIMIT, sp - T.OFFROAD_DECEL * dt);
    sp = clamp(sp, 0, T.MAX_SPEED);

    var p2 = sp / T.MAX_SPEED;
    var dx = dt * T.STEER * p2;
    run.x += dx * (input.steer || 0);
    run.x -= dx * p2 * seg.curve * T.CENTRIFUGAL;
    run.x = clamp(run.x, -T.X_MAX, T.X_MAX);

    var prev = run.pos;
    run.pos += sp * T.UNITS_PER_KMH * dt;
    run.speed = sp;
    run.time += dt;
    run.bumpCd = Math.max(0, run.bumpCd - dt);

    for (var i = 0; i < run.cars.length; i++) {
      var car = run.cars[i];
      var prevDist = car.z - prev;
      car.z += car.speed * T.UNITS_PER_KMH * dt;
      if (car.passed) continue;
      var dist = car.z - run.pos;
      if (prevDist >= 0 && dist < T.CAR_LEN && Math.abs(car.x - run.x) < T.CAR_W * 0.92) {
        // trafikk gir bare støt og tapt fart
        run.pos = car.z - T.CAR_LEN;
        run.speed = Math.min(run.speed, car.speed * 0.6);
        if (run.bumpCd <= 0) {
          run.bumpCd = 0.6;
          run.bumps++;
          events.push({ type: "bump" });
        }
      } else if (car.z < run.pos) {
        car.passed = true;
        run.overtakes++;
        events.push({ type: "overtake", points: T.OVERTAKE_POINTS });
      }
    }

    while (run.camIndex < road.cameras.length && run.pos >= road.cameras[run.camIndex].z) {
      var spd = Math.round(run.speed);
      var caught = cameraCheck(run.speed);
      run.camSpeeds.push(spd);
      events.push({ type: "camera", caught: caught, speed: spd, index: run.camIndex });
      run.camIndex++;
      if (caught) {
        run.status = "caught";
        run.score = null;
        return events;
      }
    }

    if (run.pos >= road.finishZ) {
      run.status = "finished";
      run.finishTime = run.time;
      run.score = computeScore(run.time, run.overtakes);
      events.push({ type: "finish", score: run.score, time: run.time });
    }
    return events;
  }

  // Bilen ruller ut etter mål
  function coast(run, road, dt) {
    if (run.status !== "finished") return;
    run.speed = Math.max(0, run.speed - 70 * dt);
    run.pos = Math.min(run.pos + run.speed * T.UNITS_PER_KMH * dt, (road.segments.length - T.DRAW - 2) * T.SEG);
    run.x *= Math.max(0, 1 - 2 * dt);
    for (var i = 0; i < run.cars.length; i++) run.cars[i].z += run.cars[i].speed * T.UNITS_PER_KMH * dt;
  }

  var core = {
    T: T,
    LAYOUT: LAYOUT,
    WARN_AHEAD: WARN_AHEAD,
    mulberry32: mulberry32,
    buildRoad: buildRoad,
    segAt: segAt,
    makeCars: makeCars,
    newRun: newRun,
    step: step,
    coast: coast,
    cameraCheck: cameraCheck,
    computeScore: computeScore,
    scoreFor: scoreFor,
  };

  if (typeof document === "undefined") {
    if (typeof module !== "undefined") module.exports = core;
    return;
  }

  // ===================================================================
  // Spill: input, tegning, tilstand
  // ===================================================================

  var FAIL_TEXT = "Å NEI! Du ble tatt i fartskontroll og Nicolai mistet lappen! Nå kommer de seg ikke til Solastranden!";
  var FONT = "'Roboto Serif', Georgia, serif";
  var SAVE_KEY = "racer_highscore";
  var FOG = "#d8ecf2";
  var GRASS = [["#86b86f", "#79ab64"], ["#6f9d5f", "#639354"], ["#a9bf6a", "#9ab35c"]];
  var CAR_STYLES = [
    { body: "#c0392b" }, { body: "#2f6fa8" }, { body: "#e0b341" }, { body: "#3a3a3a" },
    { body: "#6b8e5a" }, { body: "#8a4f9e" }, { body: "#cfd3d6" },
  ];
  var HOUSES = [["#a8402f", "#ece5d3"], ["#d6ae4b", "#f3eee0"], ["#e9e5d8", "#8a8f98"]];

  var canvas = document.getElementById("game");
  var ctx = canvas.getContext("2d");
  var W, H, UI, narrow;

  function applySize() {
    var avail = canvas.parentNode.clientWidth;
    var nw = avail < 600;
    if (W && nw === narrow) return;
    narrow = nw;
    canvas.width = narrow ? 440 : 760;
    canvas.height = narrow ? 330 : 428;
    W = canvas.width;
    H = canvas.height;
    UI = narrow ? 0.8 : 1;
  }
  applySize();
  window.addEventListener("resize", applySize);

  var $ = function (id) {
    return document.getElementById(id);
  };
  var speedEl = $("speed-display");
  var timeEl = $("time-display");
  var passEl = $("pass-display");
  var bestEl = $("best-display");
  var failBox = $("fail-box");
  var failMsg = $("fail-msg");
  var winBox = $("win-box");
  var winMsg = $("win-msg");

  var board = window.Scoreboard ? window.Scoreboard.mount("racer", $("scoreboard")) : null;

  var road = buildRoad();
  var run = newRun(road, 1);
  var mode = "ready"; // ready | running | caught | finished
  var modeT = 0;
  var clock = 0;
  var best = loadBest();
  var bg = { a: 0, b: 0, c: 0 };
  var pops = [];
  var flash = { t: 0, kind: "", speed: 0 };
  var shakeT = 0;
  var lastResult = null;
  var domCache = {};

  failMsg.textContent = FAIL_TEXT;

  function loadBest() {
    try {
      return parseInt(localStorage.getItem(SAVE_KEY), 10) || 0;
    } catch (e) {
      return 0;
    }
  }

  function saveBest() {
    try {
      localStorage.setItem(SAVE_KEY, String(best));
    } catch (e) {
      // lagring er en bekvemmelighet – spillet virker uten
    }
  }

  function fmtTime(s) {
    return s.toFixed(1).replace(".", ",");
  }

  function setText(el, key, text) {
    if (domCache[key] === text) return;
    domCache[key] = text;
    el.textContent = text;
  }

  // ---- Input ----

  var KEYMAP = {
    ArrowLeft: "left", KeyA: "left", ArrowRight: "right", KeyD: "right",
    ArrowUp: "gas", KeyW: "gas", Space: "gas", ArrowDown: "brake", KeyS: "brake",
  };
  var keysDown = {};
  var touch = { left: false, right: false, gas: false, brake: false };

  function readInput() {
    var d = { left: touch.left, right: touch.right, gas: touch.gas, brake: touch.brake };
    for (var code in keysDown) if (keysDown[code]) d[KEYMAP[code]] = true;
    return { steer: (d.right ? 1 : 0) - (d.left ? 1 : 0), gas: d.gas, brake: d.brake };
  }

  function tryStart() {
    if (mode === "running") return;
    if (mode !== "ready" && modeT < 0.6) return;
    startRun();
  }

  document.addEventListener("keydown", function (e) {
    var tag = e.target && e.target.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
    var action = e.code === "Space" || e.code === "Enter";
    if (action && tag === "BUTTON") return;
    if (KEYMAP[e.code]) {
      e.preventDefault();
      keysDown[e.code] = true;
    }
    if (action) {
      e.preventDefault();
      if (!e.repeat) tryStart();
    }
  });
  document.addEventListener("keyup", function (e) {
    delete keysDown[e.code];
  });
  window.addEventListener("blur", function () {
    keysDown = {};
    touch.left = touch.right = touch.gas = touch.brake = false;
  });

  canvas.addEventListener("click", tryStart);
  $("retry-btn").addEventListener("click", startRun);
  $("again-btn").addEventListener("click", startRun);

  Array.prototype.forEach.call(document.querySelectorAll("[data-ctrl]"), function (btn) {
    var key = btn.getAttribute("data-ctrl");
    function down(e) {
      e.preventDefault();
      if (btn.setPointerCapture) {
        try {
          btn.setPointerCapture(e.pointerId);
        } catch (err) {
          // ugyldig peker – ignorer
        }
      }
      touch[key] = true;
      btn.classList.add("active");
      tryStart();
    }
    function up() {
      touch[key] = false;
      btn.classList.remove("active");
    }
    btn.addEventListener("pointerdown", down);
    btn.addEventListener("pointerup", up);
    btn.addEventListener("pointercancel", up);
    btn.addEventListener("lostpointercapture", up);
    btn.addEventListener("contextmenu", function (e) {
      e.preventDefault();
    });
  });

  // ---- Tilstand ----

  function startRun() {
    if (board) board.clear();
    run = newRun(road, Math.floor(Math.random() * 1e9));
    mode = "running";
    modeT = 0;
    pops = [];
    flash.t = 0;
    shakeT = 0;
    lastResult = null;
    failBox.hidden = true;
    winBox.hidden = true;
  }

  function pop(text, color) {
    pops.push({ text: text, color: color || "#fff", t: 1.4 });
    if (pops.length > 3) pops.shift();
  }

  function handleEvents(events) {
    events.forEach(function (ev) {
      if (ev.type === "overtake") {
        pop("Forbi! +" + ev.points, "#ffe9a8");
      } else if (ev.type === "bump") {
        shakeT = 0.35;
        pop("Au! Du traff en bil", "#ff9a8c");
      } else if (ev.type === "camera") {
        flash.t = 1.1;
        flash.kind = ev.caught ? "caught" : "safe";
        flash.speed = ev.speed;
        if (ev.caught) {
          mode = "caught";
          modeT = 0;
          failBox.hidden = false;
        }
      } else if (ev.type === "finish") {
        mode = "finished";
        modeT = 0;
        var record = ev.score > best;
        if (record) {
          best = ev.score;
          saveBest();
        }
        lastResult = { time: ev.time, overtakes: run.overtakes, score: ev.score, record: record };
        winMsg.textContent =
          "Fremme ved Solastranden Gård! Tid: " + fmtTime(ev.time) + " s · Forbikjørt: " + run.overtakes +
          " · Poeng: " + ev.score + (record ? " · Ny rekord!" : "");
        winBox.hidden = false;
        if (board) board.submit(ev.score);
      }
    });
  }

  // ---- Tegnehjelpere ----

  function lerp(a, b, p) {
    return a + (b - a) * p;
  }

  function poly(x1, y1, x2, y2, x3, y3, x4, y4, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.lineTo(x3, y3);
    ctx.lineTo(x4, y4);
    ctx.closePath();
    ctx.fill();
  }

  function rrect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function circle(x, y, r, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, Math.max(0, r), 0, Math.PI * 2);
    ctx.fill();
  }

  function tri(x1, y1, x2, y2, x3, y3, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.lineTo(x3, y3);
    ctx.closePath();
    ctx.fill();
  }

  function text(str, x, y, size, color, weight) {
    ctx.font = (weight || "bold") + " " + Math.round(size) + "px " + FONT;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = color;
    ctx.fillText(str, x, y);
  }

  function outlined(str, x, y, size, color, align) {
    ctx.font = "bold " + Math.round(size) + "px " + FONT;
    ctx.textAlign = align || "center";
    ctx.textBaseline = "middle";
    ctx.lineJoin = "round";
    ctx.lineWidth = Math.max(2, size / 5);
    ctx.strokeStyle = "rgba(20,30,20,0.85)";
    ctx.strokeText(str, x, y);
    ctx.fillStyle = color;
    ctx.fillText(str, x, y);
  }

  function wrap(str, maxW, size) {
    ctx.font = "bold " + Math.round(size) + "px " + FONT;
    var words = str.split(" ");
    var lines = [];
    var cur = "";
    words.forEach(function (w) {
      var test = cur ? cur + " " + w : w;
      if (ctx.measureText(test).width > maxW && cur) {
        lines.push(cur);
        cur = w;
      } else cur = test;
    });
    if (cur) lines.push(cur);
    return lines;
  }

  // ---- Bakgrunn ----

  function ridge(off, period, baseY, amp, color, k) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, baseY + 2);
    for (var x = 0; x <= W + 8; x += 8) {
      var a = (2 * Math.PI * (x + off)) / period;
      var s = 0.55 * Math.sin(a * k[0]) + 0.3 * Math.sin(a * k[1] + 1.3) + 0.15 * Math.sin(a * k[2] + 2.1);
      ctx.lineTo(x, baseY - amp * (0.55 + 0.45 * s));
    }
    ctx.lineTo(W + 8, baseY + 2);
    ctx.closePath();
    ctx.fill();
  }

  var CLOUDS = [[80, 0.16, 1], [300, 0.1, 0.8], [520, 0.2, 1.2], [700, 0.12, 0.9]];

  function drawBackground(zone) {
    var hy = H / 2;
    var g = ctx.createLinearGradient(0, 0, 0, hy);
    g.addColorStop(0, "#6ec3e8");
    g.addColorStop(1, "#d9f0f5");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, hy + 2);

    var span = W + 300;
    var sx = (((W * 0.72 - bg.a * 0.6) % span) + span) % span - 150;
    circle(sx, hy * 0.35, 26 * UI, "rgba(255,244,190,0.95)");
    CLOUDS.forEach(function (c) {
      var cx = ((((c[0] * W) / 760 - bg.a * 0.6) % span) + span) % span - 150;
      var cy = hy * c[1] * 2.2 + 8;
      var r = 20 * UI * c[2];
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      ctx.beginPath();
      ctx.ellipse(cx, cy, r * 2.2, r * 0.8, 0, 0, Math.PI * 2);
      ctx.ellipse(cx - r, cy + r * 0.2, r * 1.4, r * 0.7, 0, 0, Math.PI * 2);
      ctx.ellipse(cx + r * 1.1, cy + r * 0.25, r * 1.3, r * 0.6, 0, 0, Math.PI * 2);
      ctx.fill();
    });

    ridge(bg.a, W * 3, hy, 90 * UI, "#9db7c4", [2, 5, 9]);
    ridge(bg.b, W * 2, hy, 46 * UI, "#7fa07b", [3, 7, 13]);
    ridge(bg.c, W * 1.5, hy, 22 * UI, "#5f8a5a", [4, 9, 17]);
    ctx.fillStyle = GRASS[zone][1];
    ctx.fillRect(0, hy, W, H - hy);
  }

  // ---- Sprites ----

  function drawPine(x, y, u, s) {
    var w = 1500 * s * u;
    var h = 4600 * s * u;
    ctx.fillStyle = "#5a3f2c";
    ctx.fillRect(x - w * 0.06, y - h * 0.16, w * 0.12, h * 0.16);
    for (var i = 0; i < 3; i++) {
      var by = y - h * (0.1 + i * 0.26);
      var bw = w * (1 - i * 0.24);
      tri(x - bw / 2, by, x + bw / 2, by, x, by - h * 0.42, i % 2 ? "#2f5a35" : "#376b3d");
    }
  }

  function drawBirch(x, y, u, s) {
    var h = 3600 * s * u;
    var w = 1700 * s * u;
    ctx.fillStyle = "#ece8de";
    ctx.fillRect(x - w * 0.04, y - h * 0.6, w * 0.08, h * 0.6);
    ctx.fillStyle = "#6e6a62";
    ctx.fillRect(x - w * 0.04, y - h * 0.4, w * 0.08, Math.max(1, h * 0.02));
    ctx.fillStyle = "#8fbf70";
    ctx.beginPath();
    ctx.ellipse(x, y - h * 0.72, w * 0.5, h * 0.3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#a6cf86";
    ctx.beginPath();
    ctx.ellipse(x - w * 0.12, y - h * 0.8, w * 0.28, h * 0.17, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawHouse(x, y, u, s, v) {
    var pal = HOUSES[Math.floor(v * HOUSES.length) % HOUSES.length];
    var w = 2800 * s * u;
    var h = 1800 * s * u;
    ctx.fillStyle = pal[0];
    ctx.fillRect(x - w / 2, y - h, w, h);
    tri(x - w * 0.58, y - h, x + w * 0.58, y - h, x, y - h - h * 0.55, "#3f3b3c");
    ctx.fillStyle = "#2f3a44";
    ctx.fillRect(x - w * 0.34, y - h * 0.7, w * 0.2, h * 0.3);
    ctx.fillRect(x + w * 0.14, y - h * 0.7, w * 0.2, h * 0.3);
    ctx.fillStyle = pal[1];
    ctx.fillRect(x - w * 0.06, y - h * 0.5, w * 0.12, h * 0.5);
    ctx.fillRect(x - w / 2, y - h, w * 0.04, h);
    ctx.fillRect(x + w / 2 - w * 0.04, y - h, w * 0.04, h);
  }

  function drawRock(x, y, u, s) {
    ctx.fillStyle = "#8a8d90";
    ctx.beginPath();
    ctx.ellipse(x, y - 200 * s * u, 380 * s * u, 220 * s * u, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#a5a8aa";
    ctx.beginPath();
    ctx.ellipse(x - 90 * s * u, y - 260 * s * u, 190 * s * u, 110 * s * u, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawBush(x, y, u, s) {
    var r = 300 * s * u;
    circle(x - r * 0.7, y - r * 0.8, r * 0.8, "#4f8a47");
    circle(x + r * 0.7, y - r * 0.8, r * 0.8, "#4f8a47");
    circle(x, y - r * 1.1, r, "#5c9a52");
  }

  function drawBale(x, y, u, s) {
    var r = 300 * s * u;
    circle(x, y - r, r, "#d9c06a");
    ctx.strokeStyle = "#b89a45";
    ctx.lineWidth = Math.max(1, r * 0.1);
    ctx.beginPath();
    ctx.arc(x, y - r, r * 0.65, 0, Math.PI * 2);
    ctx.arc(x, y - r, r * 0.3, 0, Math.PI * 2);
    ctx.stroke();
  }

  function drawLamp(x, y, u, dir) {
    var h = 2200 * u;
    ctx.fillStyle = "#4a4f55";
    ctx.fillRect(x - 30 * u, y - h, 60 * u, h);
    ctx.fillRect(Math.min(x, x + dir * 500 * u), y - h, 500 * u, 70 * u);
    ctx.fillStyle = "#f6e9a8";
    ctx.fillRect(x + dir * 500 * u - 140 * u, y - h + 40 * u, 280 * u, 90 * u);
  }

  function drawChurch(x, y, u) {
    ctx.fillStyle = "#f1ece0";
    ctx.fillRect(x - 1500 * u, y - 2200 * u, 3000 * u, 2200 * u);
    tri(x - 1650 * u, y - 2200 * u, x + 1650 * u, y - 2200 * u, x, y - 3500 * u, "#5b4a45");
    ctx.fillStyle = "#e6e0d0";
    ctx.fillRect(x - 1500 * u, y - 4600 * u, 900 * u, 4600 * u);
    tri(x - 1650 * u, y - 4600 * u, x - 450 * u, y - 4600 * u, x - 1050 * u, y - 6800 * u, "#5b4a45");
    ctx.fillStyle = "#e6e0d0";
    ctx.fillRect(x - 1080 * u, y - 7500 * u, 60 * u, 700 * u);
    ctx.fillRect(x - 1200 * u, y - 7250 * u, 300 * u, 60 * u);
    ctx.fillStyle = "#6b4b36";
    rrect(x + 200 * u, y - 1100 * u, 500 * u, 1100 * u, 250 * u);
    ctx.fill();
    ctx.fillStyle = "#47617a";
    ctx.fillRect(x + 900 * u, y - 1700 * u, 260 * u, 700 * u);
    ctx.fillRect(x - 300 * u, y - 1700 * u, 260 * u, 700 * u);
    if (300 * u > 6) text("Hetlandskirken", x + 100 * u, y - 2000 * u, 260 * u, "#3d5e3a");
  }

  function drawWarn(x, y, u) {
    ctx.fillStyle = "#6c7075";
    ctx.fillRect(x - 60 * u, y - 1900 * u, 120 * u, 1900 * u);
    var bw = 1800 * u;
    var bh = 1300 * u;
    var bx = x - bw / 2;
    var by = y - 1100 * u - bh;
    ctx.fillStyle = "#111";
    rrect(bx - 50 * u, by - 50 * u, bw + 100 * u, bh + 100 * u, 120 * u);
    ctx.fill();
    ctx.fillStyle = "#f6d02f";
    rrect(bx, by, bw, bh, 90 * u);
    ctx.fill();
    ctx.fillStyle = "#111";
    ctx.fillRect(x - 330 * u, by + 130 * u, 520 * u, 330 * u);
    ctx.fillRect(x + 200 * u, by + 210 * u, 150 * u, 170 * u);
    circle(x - 70 * u, by + 295 * u, 110 * u, "#f6d02f");
    circle(x - 70 * u, by + 295 * u, 60 * u, "#c0392b");
    if (300 * u > 6) {
      text("FARTS-", x, by + 700 * u, 300 * u, "#111");
      text("KONTROLL", x, by + 1030 * u, 300 * u, "#111");
    }
  }

  function drawLimit(x, y, u) {
    ctx.fillStyle = "#6c7075";
    ctx.fillRect(x - 55 * u, y - 1700 * u, 110 * u, 1700 * u);
    var cy = y - 1700 * u - 650 * u;
    circle(x, cy, 650 * u, "#d12b2b");
    circle(x, cy, 480 * u, "#fff");
    if (700 * u > 6) text("80", x, cy + 20 * u, 700 * u, "#111");
  }

  function drawGantry(x, y, u) {
    var half = 1.45 * T.ROAD_W * u;
    var h = 2800 * u;
    ctx.fillStyle = "#5d6268";
    ctx.fillRect(x - half - 80 * u, y - h, 160 * u, h);
    ctx.fillRect(x + half - 80 * u, y - h, 160 * u, h);
    ctx.fillStyle = "#1f4e8c";
    ctx.fillRect(x - half - 120 * u, y - h - 700 * u, half * 2 + 240 * u, 700 * u);
    ctx.fillStyle = "#fff";
    ctx.fillRect(x - half - 120 * u, y - h - 700 * u, half * 2 + 240 * u, 40 * u);
    ctx.fillRect(x - half - 120 * u, y - h - 40 * u, half * 2 + 240 * u, 40 * u);
    if (420 * u > 6) text("FARTSKONTROLL", x, y - h - 350 * u, 420 * u, "#fff");
    ctx.fillStyle = "#2c2f33";
    ctx.fillRect(x - 450 * u, y - h, 900 * u, 620 * u);
    circle(x, y - h + 320 * u, 200 * u, "#111");
    circle(x, y - h + 320 * u, 110 * u, flash.t > 0 && flash.kind ? "#fff" : "#c0392b");
    circle(x + half - 500 * u, y - h - 350 * u, 280 * u, "#fff");
    circle(x + half - 500 * u, y - h - 350 * u, 220 * u, "#d12b2b");
    circle(x + half - 500 * u, y - h - 350 * u, 160 * u, "#fff");
    if (330 * u > 6) text("80", x + half - 500 * u, y - h - 340 * u, 330 * u, "#111");
  }

  function drawFinish(x, y, u) {
    var half = 1.6 * T.ROAD_W * u;
    var h = 3600 * u;
    ctx.fillStyle = "#e9e2d0";
    ctx.fillRect(x - half - 100 * u, y - h, 200 * u, h);
    ctx.fillRect(x + half - 100 * u, y - h, 200 * u, h);
    var bh = 1100 * u;
    ctx.fillStyle = "#3d5e3a";
    ctx.fillRect(x - half - 100 * u, y - h - bh, half * 2 + 200 * u, bh);
    ctx.strokeStyle = "#efe8dd";
    ctx.lineWidth = Math.max(1, 50 * u);
    ctx.strokeRect(x - half - 100 * u, y - h - bh, half * 2 + 200 * u, bh);
    var n = 16;
    var cw = (half * 2 + 200 * u) / n;
    for (var i = 0; i < n; i++) {
      ctx.fillStyle = i % 2 ? "#111" : "#fff";
      ctx.fillRect(x - half - 100 * u + i * cw, y - h - bh - 220 * u, cw, 220 * u);
    }
    if (520 * u > 6) text("Solastranden Gård", x, y - h - bh / 2, 520 * u, "#efe8dd");
  }

  function drawThing(o, x, y, u, clip, alpha) {
    var clipped = clip < y;
    ctx.save();
    if (clipped) {
      ctx.beginPath();
      ctx.rect(0, 0, W, Math.max(0, clip));
      ctx.clip();
    }
    ctx.globalAlpha = alpha;
    switch (o.kind) {
      case "pine": drawPine(x, y, u, o.size); break;
      case "birch": drawBirch(x, y, u, o.size); break;
      case "house": drawHouse(x, y, u, o.size, o.v); break;
      case "rock": drawRock(x, y, u, o.size); break;
      case "bush": drawBush(x, y, u, o.size); break;
      case "bale": drawBale(x, y, u, o.size); break;
      case "lamp": drawLamp(x, y, u, o.offset < 0 ? 1 : -1); break;
      case "church": drawChurch(x, y, u); break;
      case "warn": drawWarn(x, y, u); break;
      case "limit": drawLimit(x, y, u); break;
      case "gantry": drawGantry(x, y, u); break;
      case "finish": drawFinish(x, y, u); break;
    }
    ctx.restore();
  }

  // ---- Biler ----

  function heart(x, y, s, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x, y + s * 0.35);
    ctx.bezierCurveTo(x - s, y - s * 0.2, x - s * 0.5, y - s * 0.9, x, y - s * 0.35);
    ctx.bezierCurveTo(x + s * 0.5, y - s * 0.9, x + s, y - s * 0.2, x, y + s * 0.35);
    ctx.fill();
  }

  function drawCar(x, y, w, st, wedding, t, spd) {
    var h = w * 0.7;
    var l = x - w / 2;
    ctx.fillStyle = "rgba(0,0,0,0.28)";
    ctx.beginPath();
    ctx.ellipse(x, y, w * 0.52, h * 0.09, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#1b1b1b";
    ctx.fillRect(l + w * 0.04, y - h * 0.3, w * 0.17, h * 0.3);
    ctx.fillRect(l + w * 0.79, y - h * 0.3, w * 0.17, h * 0.3);
    ctx.fillStyle = st.body;
    rrect(l, y - h * 0.62, w, h * 0.46, w * 0.06);
    ctx.fill();
    poly(l + w * 0.12, y - h * 0.6, l + w * 0.24, y - h, l + w * 0.76, y - h, l + w * 0.88, y - h * 0.6, st.roof || st.body);
    poly(l + w * 0.2, y - h * 0.64, l + w * 0.28, y - h * 0.94, l + w * 0.72, y - h * 0.94, l + w * 0.8, y - h * 0.64, "#2c3a46");
    ctx.fillStyle = "#3a3a3a";
    ctx.fillRect(l + w * 0.02, y - h * 0.2, w * 0.96, h * 0.09);
    ctx.fillStyle = "#e23b3b";
    ctx.fillRect(l + w * 0.05, y - h * 0.5, w * 0.2, h * 0.11);
    ctx.fillRect(l + w * 0.75, y - h * 0.5, w * 0.2, h * 0.11);
    ctx.fillStyle = "#f4f4ee";
    ctx.fillRect(x - w * 0.12, y - h * 0.42, w * 0.24, h * 0.12);
    if (!wedding) return;

    // bånd og sløyfe på bagasjelokket
    ctx.fillStyle = "#f3a6bd";
    ctx.fillRect(l, y - h * 0.62, w, h * 0.05);
    circle(x - w * 0.05, y - h * 0.62, w * 0.04, "#e8789a");
    circle(x + w * 0.05, y - h * 0.62, w * 0.04, "#e8789a");
    // «Just Married»-skilt i bakruta
    ctx.fillStyle = "#fffdf6";
    rrect(x - w * 0.34, y - h * 0.9, w * 0.68, h * 0.24, w * 0.02);
    ctx.fill();
    if (w * 0.065 >= 6) text("JUST MARRIED", x, y - h * 0.78, w * 0.065, "#b3303f");
    heart(l + w * 0.31, y - h * 0.5, w * 0.045, "#e8789a");
    heart(l + w * 0.69, y - h * 0.5, w * 0.045, "#e8789a");
    // blikkbokser på slep
    for (var i = 0; i < 3; i++) {
      var bx = x + (i - 1) * w * 0.22 + Math.sin(t * 9 + i * 2) * w * 0.04 * (0.3 + spd);
      var by = y + w * 0.05 + (i % 2) * w * 0.05 + Math.abs(Math.sin(t * 13 + i)) * w * 0.03 * spd;
      ctx.strokeStyle = "#555";
      ctx.lineWidth = Math.max(1, w * 0.008);
      ctx.beginPath();
      ctx.moveTo(x + (i - 1) * w * 0.18, y - h * 0.15);
      ctx.lineTo(bx, by);
      ctx.stroke();
      ctx.fillStyle = "#c9ced3";
      ctx.fillRect(bx - w * 0.035, by, w * 0.07, w * 0.09);
      ctx.fillStyle = "#8d949b";
      ctx.fillRect(bx - w * 0.035, by + w * 0.03, w * 0.07, w * 0.015);
    }
  }

  // ---- Hoveddtegning ----

  function render() {
    var camZ = run.pos - T.PLAYER_Z;
    var baseIdx = Math.floor(camZ / T.SEG);
    var base = road.segments[baseIdx];
    var basePct = (camZ % T.SEG) / T.SEG;
    var playerSeg = segAt(road, run.pos);
    var playerPct = (run.pos % T.SEG) / T.SEG;
    var camY = lerp(playerSeg.y1, playerSeg.y2, playerPct) + T.CAM_H;
    var camX = run.x * T.ROAD_W;
    var zone = road.segments[Math.min(road.segments.length - 1, baseIdx + 100)].zone;

    ctx.save();
    if (shakeT > 0) ctx.translate((Math.random() - 0.5) * 8 * UI, (Math.random() - 0.5) * 6 * UI);
    drawBackground(zone);

    var proj = [];
    var maxy = H;
    var xo = 0;
    var dxo = -(base.curve * basePct);
    var n, seg, p;

    for (n = 0; n < T.DRAW; n++) {
      seg = road.segments[baseIdx + n];
      if (!seg) break;
      var cz1 = seg.index * T.SEG - camZ;
      var cz2 = cz1 + T.SEG;
      p = { seg: seg, clip: maxy, ok: cz1 > T.CAM_DEPTH };
      proj[n] = p;
      if (p.ok) {
        p.sc1 = T.CAM_DEPTH / cz1;
        p.sc2 = T.CAM_DEPTH / cz2;
        p.x1 = Math.round(W / 2 + p.sc1 * (xo - camX) * (W / 2));
        p.y1 = Math.round(H / 2 - p.sc1 * (seg.y1 - camY) * (H / 2));
        p.w1 = Math.round(p.sc1 * T.ROAD_W * (W / 2));
        p.x2 = Math.round(W / 2 + p.sc2 * (xo + dxo - camX) * (W / 2));
        p.y2 = Math.round(H / 2 - p.sc2 * (seg.y2 - camY) * (H / 2));
        p.w2 = Math.round(p.sc2 * T.ROAD_W * (W / 2));
        var vis = 1 / Math.exp((n / T.DRAW) * (n / T.DRAW) * 5);
        p.vis = vis;
      }
      xo += dxo;
      dxo += seg.curve;
      if (!p.ok || p.y2 >= p.y1 || p.y2 >= maxy) continue;
      drawSegment(seg, p, n);
      maxy = p.y1;
    }

    // biler per segment
    var buckets = [];
    var ci;
    for (ci = 0; ci < run.cars.length; ci++) {
      var car = run.cars[ci];
      var cn = Math.floor(car.z / T.SEG) - baseIdx;
      if (cn >= 0 && cn < T.DRAW) (buckets[cn] = buckets[cn] || []).push(car);
    }

    for (n = T.DRAW - 1; n >= 0; n--) {
      p = proj[n];
      if (!p || !p.ok) continue;
      var list = buckets[n];
      if (list) {
        for (ci = 0; ci < list.length; ci++) {
          var c = list[ci];
          var pc = (c.z % T.SEG) / T.SEG;
          var sc = lerp(p.sc1, p.sc2, pc);
          var cx = lerp(p.x1, p.x2, pc) + sc * c.x * T.ROAD_W * (W / 2);
          var cy = lerp(p.y1, p.y2, pc);
          var cw = T.CAR_W * T.ROAD_W * sc * (W / 2);
          if (cw < 2) continue;
          ctx.save();
          if (p.clip < cy) {
            ctx.beginPath();
            ctx.rect(0, 0, W, Math.max(0, p.clip));
            ctx.clip();
          }
          ctx.globalAlpha = p.vis;
          drawCar(cx, cy, cw, CAR_STYLES[c.color], false, 0, 0);
          ctx.restore();
        }
      }
      var u = p.sc1 * (W / 2);
      var things = p.seg.sprites.concat(p.seg.features);
      for (var k = 0; k < things.length; k++) {
        var o = things[k];
        if (u * 1500 < 1.5) continue;
        drawThing(o, p.x1 + u * o.offset * T.ROAD_W, p.y1, u, p.clip, p.vis);
      }
    }

    // spillerbilen
    var pw = T.CAR_W * T.ROAD_W * (T.CAM_DEPTH / T.PLAYER_Z) * (W / 2);
    var spd = run.speed / T.MAX_SPEED;
    var bounce = (mode === "running" && spd > 0 ? 1.5 * Math.random() * spd * (H / 480) : 0) * (Math.random() < 0.5 ? -1 : 1);
    drawCar(W / 2, H - 38 * UI + bounce, pw, { body: "#f7f1e3", roof: "#efe6d2" }, true, clock, spd);
    ctx.restore();

    drawFlashAndHud();
    drawOverlay();
  }

  function drawSegment(seg, p, n) {
    var g = GRASS[seg.zone][seg.dark ? 1 : 0];
    var r1 = p.w1 / Math.max(6, 2 * T.LANES);
    var r2 = p.w2 / Math.max(6, 2 * T.LANES);
    ctx.fillStyle = g;
    ctx.fillRect(0, p.y2, W, p.y1 - p.y2);
    var rc = seg.dark ? "#c8453a" : "#f4efe4";
    poly(p.x1 - p.w1 - r1, p.y1, p.x1 - p.w1, p.y1, p.x2 - p.w2, p.y2, p.x2 - p.w2 - r2, p.y2, rc);
    poly(p.x1 + p.w1 + r1, p.y1, p.x1 + p.w1, p.y1, p.x2 + p.w2, p.y2, p.x2 + p.w2 + r2, p.y2, rc);
    poly(p.x1 - p.w1, p.y1, p.x1 + p.w1, p.y1, p.x2 + p.w2, p.y2, p.x2 - p.w2, p.y2, seg.dark ? "#686a6f" : "#6f7176");
    if (seg.index >= road.length - 1 && seg.index <= road.length) {
      for (var c = 0; c < 8; c++) {
        var f0 = -1 + c * 0.25;
        var f1 = f0 + 0.25;
        poly(p.x1 + p.w1 * f0, p.y1, p.x1 + p.w1 * f1, p.y1, p.x2 + p.w2 * f1, p.y2, p.x2 + p.w2 * f0, p.y2, (c + seg.index) % 2 ? "#111" : "#fff");
      }
    } else if (!seg.dark) {
      var lw1 = p.w1 / 32;
      var lw2 = p.w2 / 32;
      var lanew1 = (p.w1 * 2) / T.LANES;
      var lanew2 = (p.w2 * 2) / T.LANES;
      var lx1 = p.x1 - p.w1 + lanew1;
      var lx2 = p.x2 - p.w2 + lanew2;
      for (var l = 1; l < T.LANES; l++, lx1 += lanew1, lx2 += lanew2) {
        poly(lx1 - lw1 / 2, p.y1, lx1 + lw1 / 2, p.y1, lx2 + lw2 / 2, p.y2, lx2 - lw2 / 2, p.y2, "#f4efe4");
      }
    }
    var fog = 1 - p.vis;
    if (fog > 0.02) {
      ctx.globalAlpha = fog;
      ctx.fillStyle = FOG;
      ctx.fillRect(0, p.y2, W, p.y1 - p.y2);
      ctx.globalAlpha = 1;
    }
  }

  // ---- HUD og overlegg ----

  function drawGauge() {
    var r = 46 * UI;
    var cx = W - r - 12 * UI;
    var cy = H - r - 10 * UI;
    var a0 = Math.PI * (150 / 180);
    var sweep = Math.PI * (240 / 180);
    function ang(v) {
      return a0 + (sweep * v) / T.MAX_SPEED;
    }
    circle(cx, cy, r, "rgba(22,34,22,0.78)");
    ctx.lineWidth = 5 * UI;
    ctx.strokeStyle = "#8fc98a";
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.82, ang(0), ang(T.LIMIT));
    ctx.stroke();
    ctx.strokeStyle = "#e07a5f";
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.82, ang(T.LIMIT), ang(T.MAX_SPEED));
    ctx.stroke();
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 1.5 * UI;
    for (var v = 0; v <= T.MAX_SPEED; v += 20) {
      var a = ang(v);
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * r * 0.68, cy + Math.sin(a) * r * 0.68);
      ctx.lineTo(cx + Math.cos(a) * r * 0.74, cy + Math.sin(a) * r * 0.74);
      ctx.stroke();
    }
    [0, 80, 160].forEach(function (lv) {
      var a = ang(lv);
      text(String(lv), cx + Math.cos(a) * r * 0.55, cy + Math.sin(a) * r * 0.55, 9 * UI, "#fff", "normal");
    });
    var na = ang(clamp(run.speed, 0, T.MAX_SPEED));
    ctx.strokeStyle = "#ff5a4d";
    ctx.lineWidth = 2.5 * UI;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(na) * r * 0.76, cy + Math.sin(na) * r * 0.76);
    ctx.stroke();
    ctx.lineCap = "butt";
    circle(cx, cy, 4 * UI, "#fff");
    text(String(Math.round(run.speed)), cx, cy + r * 0.42, 17 * UI, "#fff");
    text("km/h", cx, cy + r * 0.68, 9 * UI, "#cfe0cc", "normal");
  }

  function drawProgress() {
    var x0 = 14 * UI;
    var x1 = W - 14 * UI;
    var y = 14 * UI;
    var hh = 7 * UI;
    var fin = road.finishZ - T.PLAYER_Z;
    var p = clamp((run.pos - T.PLAYER_Z) / fin, 0, 1);
    ctx.fillStyle = "rgba(22,34,22,0.65)";
    rrect(x0, y, x1 - x0, hh, hh / 2);
    ctx.fill();
    ctx.fillStyle = "#a8c4a6";
    rrect(x0, y, Math.max(hh, (x1 - x0) * p), hh, hh / 2);
    ctx.fill();
    road.cameras.forEach(function (c) {
      ctx.fillStyle = "#f6d02f";
      ctx.fillRect(x0 + ((x1 - x0) * (c.z - T.PLAYER_Z)) / fin - 1, y - 2 * UI, 3 * UI, hh + 4 * UI);
    });
    heart(x0 + (x1 - x0) * p, y + hh / 2, 8 * UI, "#ff7fa0");
    outlined("Hetlandskirken", x0, y + 17 * UI, 10.5 * UI, "#fff", "left");
    outlined("Solastranden Gård", x1, y + 17 * UI, 10.5 * UI, "#fff", "right");
  }

  function drawFlashAndHud() {
    if (flash.t > 0) {
      var a = Math.min(1, flash.t / 1.1);
      ctx.fillStyle = flash.kind === "caught" ? "rgba(255,255,255," + (0.8 * a * a) + ")" : "rgba(255,255,255," + 0.45 * a * a + ")";
      ctx.fillRect(0, 0, W, H);
      if (flash.kind === "safe") outlined("Fartskontroll passert! " + flash.speed + " km/h", W / 2, H * 0.32, 22 * UI, "#c9f2b8");
    }
    drawProgress();
    drawGauge();
    var nxt = road.cameras[run.camIndex];
    if (mode === "running" && nxt) {
      var d = (nxt.z - run.pos) / T.SEG;
      if (d > 0 && d < 450) {
        var over = Math.round(run.speed) > T.LIMIT;
        var blink = Math.floor(clock * 4) % 2 === 0;
        var danger = over && d < 220;
        var label = danger ? "BREMS! Fartskontroll – maks 80 km/h" : "Fartskontroll foran – maks 80 km/h";
        var by = 50 * UI;
        ctx.fillStyle = danger && blink ? "rgba(200,40,40,0.92)" : "rgba(246,208,47,0.92)";
        rrect(W / 2 - 150 * UI, by - 12 * UI, 300 * UI, 24 * UI, 6 * UI);
        ctx.fill();
        text(label, W / 2, by, 12.5 * UI, danger && blink ? "#fff" : "#111");
      }
    }
    pops.forEach(function (pp, i) {
      ctx.globalAlpha = Math.min(1, pp.t);
      outlined(pp.text, W / 2, H * 0.42 + i * 24 * UI, 18 * UI, pp.color);
      ctx.globalAlpha = 1;
    });
  }

  function panel(color) {
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, W, H);
  }

  function drawOverlay() {
    var cy = H * 0.5;
    if (mode === "ready") {
      panel("rgba(22,40,22,0.5)");
      outlined("Fri fart!", W / 2, cy - 70 * UI, 46 * UI, "#fff");
      outlined("Fra Hetlandskirken til Solastranden Gård", W / 2, cy - 22 * UI, 16 * UI, "#efe8dd");
      outlined("Fartskontroll: maks 80 km/h", W / 2, cy + 8 * UI, 16 * UI, "#ffe28a");
      outlined("Trykk, klikk eller mellomrom for å starte", W / 2, cy + 52 * UI, 15 * UI, "#fff");
    } else if (mode === "caught") {
      panel("rgba(90,12,12," + clamp(modeT, 0, 0.6) * 0.95 + ")");
      if (modeT < 0.2) return;
      var size = 25 * UI;
      var lines = wrap(FAIL_TEXT, W * 0.84, size);
      var y0 = cy - ((lines.length - 1) * size * 1.3) / 2 - 22 * UI;
      lines.forEach(function (ln, i) {
        outlined(ln, W / 2, y0 + i * size * 1.3, size, "#fff");
      });
      outlined("Prøv igjen: trykk på spillet eller mellomrom", W / 2, y0 + lines.length * size * 1.3 + 14 * UI, 15 * UI, "#ffd9d2");
    } else if (mode === "finished" && modeT > 0.9 && lastResult) {
      panel("rgba(22,50,22,0.55)");
      outlined("Fremme ved Solastranden Gård!", W / 2, cy - 68 * UI, 26 * UI, "#fff");
      outlined("Tid: " + fmtTime(lastResult.time) + " s   ·   Forbikjørt: " + lastResult.overtakes, W / 2, cy - 22 * UI, 17 * UI, "#efe8dd");
      outlined("Poeng: " + lastResult.score, W / 2, cy + 14 * UI, 30 * UI, "#ffe28a");
      if (lastResult.record) outlined("Ny rekord!", W / 2, cy + 48 * UI, 18 * UI, "#c9f2b8");
      outlined("Trykk for å kjøre igjen", W / 2, cy + 80 * UI, 15 * UI, "#fff");
    }
  }

  function updateDom() {
    setText(speedEl, "s", "Fart: " + Math.round(run.speed) + " km/h");
    setText(timeEl, "t", "Tid: " + fmtTime(run.time) + " s");
    setText(passEl, "p", "Forbikjørt: " + run.overtakes);
    setText(bestEl, "b", "Rekord: " + best);
  }

  // ---- Løkke ----

  var last = performance.now();

  function loop(now) {
    var dt = Math.min(0.033, (now - last) / 1000);
    last = now;
    clock += dt;
    modeT += dt;
    if (mode === "running") handleEvents(core.step(run, road, readInput(), dt));
    else if (mode === "finished") core.coast(run, road, dt);

    if (mode === "running" || mode === "finished") {
      var pct = run.speed / T.MAX_SPEED;
      var curve = core.segAt(road, run.pos).curve;
      bg.a += curve * pct * dt * 6;
      bg.b += curve * pct * dt * 14;
      bg.c += curve * pct * dt * 30;
    }
    flash.t = Math.max(0, flash.t - dt);
    shakeT = Math.max(0, shakeT - dt);
    pops = pops.filter(function (pp) {
      pp.t -= dt;
      return pp.t > 0;
    });

    render();
    updateDom();
    requestAnimationFrame(loop);
  }

  requestAnimationFrame(loop);
})();
