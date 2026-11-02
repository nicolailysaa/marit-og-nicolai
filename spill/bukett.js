(function () {
  "use strict";

  // ===================================================================
  // Kjerne: tuning, oppgraderinger, fysikk (ingen DOM – kan kjøres i Node)
  // ===================================================================

  var T = {
    GRAVITY: 20, // m/s²
    GOAL: 3000, // meter til bryllupsreisen
    PRICE_GROWTH: 1.7,
    DT: 1 / 120, // fast fysikk-steg
    ROLL_DECEL: 12, // m/s² når buketten ruller/sklir
    BOUNCE_MIN_VY: 4, // under dette slutter den å sprette
    STOP_SPEED: 0.5,
    MILESTONE_BONUS: 0.5, // kr per meter, første gang en milepæl nås
    MIN_ANGLE: 15,
    MAX_ANGLE: 75,
    WARP_SPEED: 35, // over denne farten (m/s) går tiden fortere
    WARP_MAX: 3.5, // så lange kast ikke drar ut
  };

  var HONEYMOON = "Bryllupsreisen";

  var MILESTONES = [
    { m: 20, name: "Kirkebenkene", icon: "⛪" },
    { m: 60, name: "Kirkedøra", icon: "🚪" },
    { m: 150, name: "Maskinhuset", icon: "🏠" },
    { m: 350, name: "Solastranden", icon: "🏖️" },
    { m: 700, name: "Sola flyplass", icon: "✈️" },
    { m: 1200, name: "Stavanger sentrum", icon: "🏙️" },
    { m: 2000, name: "Preikestolen", icon: "⛰️" },
    { m: T.GOAL, name: HONEYMOON, icon: "🌴" },
  ];

  var UPGRADES = [
    { key: "arm", icon: "💪", name: "Armtrening", desc: "Kraftigere kast.", max: 8, base: 10 },
    { key: "stage", icon: "👠", name: "Høye hæler", desc: "Marit står høyere når hun kaster.", max: 4, base: 15 },
    { key: "light", icon: "🌸", name: "Lettere bukett", desc: "Tørkede blomster gir mindre luftmotstand.", max: 6, base: 25 },
    { key: "gifts", icon: "🎁", name: "Gavebordet", desc: "Flere kroner per meter.", max: 5, base: 35 },
    { key: "bounce", icon: "🪀", name: "Gummistilker", desc: "Buketten spretter lenger når den lander.", max: 5, base: 30 },
    { key: "ribbon", icon: "🎀", name: "Silkebånd", desc: "Buketten glir og faller saktere.", max: 6, base: 45 },
    { key: "guard", icon: "💐", name: "Brudepikevakt", desc: "Gjestene fanger buketten sjeldnere.", max: 3, base: 50 },
    { key: "cork", icon: "🍾", name: "Champagnekork", desc: "Trykk i lufta for et rakettskudd. +1 kork per nivå.", max: 4, base: 70 },
    { key: "confetti", icon: "🎊", name: "Konfettikanon", desc: "Skyter buketten opp igjen når den treffer bakken.", max: 3, base: 160 },
  ];

  function defaultLevels() {
    var lv = {};
    UPGRADES.forEach(function (u) {
      lv[u.key] = 0;
    });
    return lv;
  }

  function price(u, level) {
    return Math.round(u.base * Math.pow(T.PRICE_GROWTH, level));
  }

  function stats(lv) {
    var speed = 14 * Math.pow(1.26, lv.arm);
    return {
      speed: speed,
      height: 2.4 + 1.5 * lv.stage,
      stageHeight: 1.5 * lv.stage,
      drag: 0.12 * Math.pow(0.75, lv.light),
      glide: 0.06 * lv.ribbon,
      bounce: 0.3 + 0.08 * lv.bounce,
      friction: 0.6 + 0.05 * lv.bounce,
      corks: lv.cork,
      corkPower: 15 + 0.2 * speed,
      confetti: lv.confetti,
      catchChance: 0.75 * (1 - 0.28 * lv.guard),
      krPerM: 1 + 0.4 * lv.gifts,
    };
  }

  // power: 0..1, angle: grader
  function launch(s, power, angle) {
    var v = s.speed * (0.45 + 0.55 * power);
    var a = (angle * Math.PI) / 180;
    return {
      x: 0.4,
      y: s.height,
      vx: v * Math.cos(a),
      vy: v * Math.sin(a),
      corks: s.corks,
      confetti: s.confetti,
      rolling: false,
      done: false,
      bounces: 0,
      event: null,
    };
  }

  function useCork(b, s) {
    if (b.corks <= 0 || b.rolling || b.done) return false;
    b.corks--;
    b.vx += s.corkPower;
    b.vy = Math.max(b.vy, 0) + s.corkPower * 0.4;
    return true;
  }

  // onGround(b) kan håndtere bakketreff selv (f.eks. en hatt) og returnere true
  function step(b, s, dt, onGround) {
    if (b.rolling) {
      b.vx = Math.max(0, b.vx - T.ROLL_DECEL * dt);
      b.x += b.vx * dt;
      if (b.vx <= T.STOP_SPEED) {
        b.vx = 0;
        b.done = true;
      }
      return;
    }
    var g = T.GRAVITY * (b.vy < 0 ? 1 - s.glide : 1);
    b.vy -= g * dt;
    var d = Math.exp(-s.drag * dt);
    b.vx *= d;
    b.vy *= d;
    b.x += b.vx * dt;
    b.y += b.vy * dt;

    if (b.y <= 0 && b.vy < 0) {
      b.y = 0;
      if (onGround && onGround(b)) return;
      if (b.confetti > 0 && -b.vy > T.BOUNCE_MIN_VY * 2) {
        b.confetti--;
        b.vy = Math.max(22, -b.vy * 0.9);
        b.vx += 8;
        b.event = "confetti";
        return;
      }
      if (-b.vy > T.BOUNCE_MIN_VY) {
        b.vy = -b.vy * s.bounce;
        b.vx *= s.friction;
        b.bounces++;
      } else {
        b.vy = 0;
        b.rolling = true;
      }
    }
  }

  function earnings(dist, prevBest, s) {
    var bonus = 0;
    var reached = [];
    MILESTONES.forEach(function (ms) {
      if (dist >= ms.m && prevBest < ms.m) {
        bonus += Math.round(ms.m * T.MILESTONE_BONUS);
        reached.push(ms);
      }
    });
    return { base: Math.floor(dist * s.krPerM), bonus: bonus, reached: reached };
  }

  var core = {
    T: T,
    UPGRADES: UPGRADES,
    MILESTONES: MILESTONES,
    defaultLevels: defaultLevels,
    price: price,
    stats: stats,
    launch: launch,
    useCork: useCork,
    step: step,
    earnings: earnings,
  };

  if (typeof document === "undefined") {
    if (typeof module !== "undefined") module.exports = core;
    return;
  }

  // ===================================================================
  // Spill: tilstand, input, tegning
  // ===================================================================

  var canvas = document.getElementById("game");
  // smalere intern oppløsning på mobil, så teksten forblir lesbar
  var narrow = canvas.clientWidth < 600;
  if (narrow) {
    canvas.width = 440;
    canvas.height = 330;
  }
  var ctx = canvas.getContext("2d");
  var W = canvas.width;
  var H = canvas.height;
  var GROUND_Y = H - 40;
  var PPM_MAX = 24; // piksler per meter i nærbilde
  var PPM_MIN = 1.2;
  var MARIT_SX = narrow ? 115 : 150; // Marits skjermposisjon før kastet
  var FONT = "'Roboto Serif', Georgia, serif";
  var SAVE_KEY = "bukett_save";

  var GUEST_NAMES = [
    "Tante Gro",
    "Kusine Ida",
    "Bestevenninna",
    "Onkel Per",
    "Brudepiken",
    "Naboen",
    "Forloveren",
    "Sjefen",
    "Lille Emma",
    "Bestemor",
  ];
  var GUEST_COLORS = ["#c97b84", "#7b9bc9", "#d9a55b", "#8fae7e", "#a184b8", "#d98c6a"];

  var ZONES = [
    { from: -Infinity, ground: "#c9bfab", line: "#b0a68e", deco: "pew" },
    { from: 60, ground: "#b8c4a2", line: "#9fb088", deco: "tree" },
    { from: 350, ground: "#e8dcb8", line: "#d4c59c", deco: "parasol" },
    { from: 700, ground: "#a5a49c", line: "#888780", deco: "runway" },
    { from: 1200, ground: "#bdb4a8", line: "#a0968a", deco: "city" },
    { from: 2000, ground: "#a9b896", line: "#8ea07a", deco: "mountain" },
    { from: T.GOAL, ground: "#efe0bd", line: "#d9c79a", deco: "palm" },
  ];

  // ---- Lagring ----

  function loadSave() {
    var s = null;
    try {
      s = JSON.parse(localStorage.getItem(SAVE_KEY));
    } catch (e) {
      s = null;
    }
    var lv = defaultLevels();
    if (s && s.lv) {
      UPGRADES.forEach(function (u) {
        lv[u.key] = Math.min(u.max, Math.max(0, parseInt(s.lv[u.key], 10) || 0));
      });
    }
    return {
      kr: (s && s.kr) || 0,
      best: (s && s.best) || 0,
      throws: (s && s.throws) || 0,
      won: !!(s && s.won),
      lv: lv,
    };
  }

  function persist() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(save));
    } catch (e) {
      // lagring er en bekvemmelighet – spillet virker uten
    }
  }

  var save = loadSave();

  // ---- Tilstand ----

  var state = "ready"; // ready | power | angle | windup | flying | landed | won
  var stateT = 0; // sekunder i nåværende tilstand
  var time = 0;
  var power = 0;
  var angle = 45;
  var s = stats(save.lv);
  var b = null; // buketten
  var result = null; // oppsummering av siste kast
  var objects = [];
  var nextSpawn = 0;
  var particles = [];
  var floaters = [];
  var accumulator = 0;
  var passedThisThrow = {};
  var cam = { x: -MARIT_SX / PPM_MAX, y: 0, ppm: PPM_MAX };

  function setState(next) {
    state = next;
    stateT = 0;
    renderShop();
  }

  function resetCamera() {
    cam.ppm = PPM_MAX;
    cam.x = -MARIT_SX / PPM_MAX;
    cam.y = 0;
  }

  function startThrow() {
    s = stats(save.lv);
    b = launch(s, power, angle);
    b.rot = 0;
    objects = [];
    particles = [];
    floaters = [];
    nextSpawn = 10;
    passedThisThrow = {};
    accumulator = 0;
    setState("flying");
  }

  function finishThrow(caughtBy) {
    var dist = Math.max(0, Math.floor(b.x));
    var prevBest = save.best;
    var e = earnings(dist, prevBest, s);
    var total = e.base + e.bonus;
    save.kr += total;
    save.throws++;
    var record = dist > prevBest;
    if (record) save.best = dist;
    var justWon = !save.won && dist >= T.GOAL;
    if (justWon) save.won = true;
    persist();
    result = {
      dist: dist,
      earned: total,
      base: e.base,
      bonus: e.bonus,
      reached: e.reached,
      record: record && prevBest > 0,
      caughtBy: caughtBy,
    };
    updateHUD();
    setState(justWon ? "won" : "landed");
  }

  // ---- Input ----

  function handleInput() {
    if (state === "ready") {
      setState("power");
    } else if (state === "power") {
      setState("angle");
    } else if (state === "angle") {
      setState("windup");
    } else if (state === "flying") {
      if (useCork(b, s)) {
        burst(b.x, b.y, ["#f5e6b3", "#e8c96a", "#fff"], 18, -1);
        floatText("🍾 Pang!", b.x, b.y);
      }
    } else if ((state === "landed" && stateT > 0.5) || (state === "won" && stateT > 1)) {
      b = null;
      objects = [];
      particles = [];
      floaters = [];
      resetCamera();
      setState("ready");
    }
  }

  document.addEventListener("keydown", function (e) {
    if (e.code !== "Space" && e.code !== "ArrowUp") return;
    if (e.target && e.target.tagName === "BUTTON") return;
    e.preventDefault();
    if (!e.repeat) handleInput();
  });
  canvas.addEventListener("click", handleInput);
  canvas.addEventListener("touchstart", function (e) {
    e.preventDefault();
    handleInput();
  });

  // ---- Hjelpefunksjoner ----

  function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
  }

  function hash(i) {
    var x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
    return x - Math.floor(x);
  }

  // trekantbølge 0..1..0 med gitt periode
  function tri(t, period) {
    var p = (t / period) % 1;
    return p < 0.5 ? p * 2 : 2 - p * 2;
  }

  function sx(xm) {
    return (xm - cam.x) * cam.ppm;
  }

  function sy(ym) {
    return GROUND_Y - (ym - cam.y) * cam.ppm;
  }

  // visuell skala for figurer – krymper med zoom, men ikke helt
  function vscale() {
    return Math.max(cam.ppm / PPM_MAX, 0.5);
  }

  function zoneAt(x) {
    var z = ZONES[0];
    for (var i = 0; i < ZONES.length; i++) if (x >= ZONES[i].from) z = ZONES[i];
    return z;
  }

  function floatText(text, x, y) {
    floaters.push({ text: text, x: x, y: y, t: 0 });
  }

  function burst(x, y, colors, n, dir) {
    for (var i = 0; i < n; i++) {
      particles.push({
        x: x,
        y: y,
        vx: (Math.random() * 10 + 4) * dir + (Math.random() - 0.5) * 6,
        vy: (Math.random() - 0.3) * 12,
        life: 0.6 + Math.random() * 0.6,
        color: colors[i % colors.length],
      });
    }
  }

  function updateHUD() {
    document.getElementById("kr-display").textContent = "Kroner: " + save.kr + " kr";
    document.getElementById("best-display").textContent = "Rekord: " + save.best + " m";
  }

  // ---- Hindringer og bonuser ----

  function spawnAhead() {
    var viewEnd = cam.x + W / cam.ppm + 10;
    while (nextSpawn < viewEnd) {
      var x = nextSpawn;
      var r = Math.random();
      if (r < 0.4) {
        objects.push({
          type: "guest",
          x: x,
          name: GUEST_NAMES[Math.floor(Math.random() * GUEST_NAMES.length)],
          color: GUEST_COLORS[Math.floor(Math.random() * GUEST_COLORS.length)],
          hair: Math.random() < 0.5 ? "#6b4a2e" : "#c9a05a",
          jumpT: -1,
          done: false,
        });
      } else if (r < 0.6) {
        objects.push({ type: "hat", x: x, done: false });
      } else {
        var top = Math.max(8, b.y * 1.3 + 6);
        objects.push({
          type: r < 0.8 ? "dove" : "balloon",
          x: x,
          y: 3 + Math.random() * top,
          done: false,
        });
      }
      nextSpawn += (14 + x * 0.05) * (0.6 + Math.random() * 0.8);
    }
    for (var i = objects.length - 1; i >= 0; i--) {
      if (sx(objects[i].x) < -80) objects.splice(i, 1);
    }
  }

  function hatAt(bq) {
    var half = (16 * vscale()) / cam.ppm;
    for (var i = 0; i < objects.length; i++) {
      var o = objects[i];
      if (o.type === "hat" && !o.done && Math.abs(o.x - bq.x) < half) {
        o.done = true;
        bq.vy = Math.max(-bq.vy, 14) + 4;
        bq.vx *= 1.05;
        floatText("🎩 Sprett!", bq.x, 2);
        return true;
      }
    }
    return false;
  }

  function checkObjects() {
    var k = vscale();
    for (var i = 0; i < objects.length; i++) {
      var o = objects[i];
      if (o.done) continue;
      var dx = b.x - o.x;

      if (o.type === "guest") {
        if (o.jumpT < 0 && dx > -(120 * k) / cam.ppm && dx < 0 && b.y < 25) o.jumpT = 0;
        var reach = ((52 + guestJump(o) * 26) * k) / cam.ppm;
        if (Math.abs(dx) < (12 * k) / cam.ppm && b.y < reach) {
          o.done = true;
          if (Math.random() < s.catchChance) {
            o.caught = true;
            b.vx = 0;
            b.vy = 0;
            b.x = o.x;
            b.y = reach * 0.9;
            return o.name;
          }
          b.vy = Math.abs(b.vy) * 0.5 + 6;
          floatText("Nesten! " + o.name + " bommet", o.x, reach + 1);
        }
      } else if (o.type === "dove" || o.type === "balloon") {
        var r = (16 * k) / cam.ppm;
        if (dx * dx + (b.y - o.y) * (b.y - o.y) < r * r) {
          o.done = true;
          if (o.type === "dove") {
            b.vx += 20;
            b.vy += 4;
            floatText("🕊️ Duen tok den med!", o.x, o.y);
          } else {
            b.vy = Math.max(b.vy, 0) + 22;
            floatText("🎈 Opp, opp!", o.x, o.y);
            burst(o.x, o.y, ["#e8a0a8", "#fff"], 10, 1);
          }
        }
      }
    }
    return null;
  }

  function guestJump(o) {
    if (o.jumpT < 0 || o.jumpT > 1) return 0;
    return Math.sin(o.jumpT * Math.PI);
  }

  // ---- Oppdatering ----

  function update(dt) {
    time += dt;
    stateT += dt;

    if (state === "power") power = tri(stateT, 1.3);
    if (state === "angle") angle = T.MIN_ANGLE + (T.MAX_ANGLE - T.MIN_ANGLE) * tri(stateT, 1.6);
    if (state === "windup" && stateT > 0.35) startThrow();

    if (state === "flying") {
      var warp = clamp(Math.hypot(b.vx, b.vy) / T.WARP_SPEED, 1, T.WARP_MAX);
      accumulator += dt * warp;
      while (accumulator >= T.DT && state === "flying") {
        accumulator -= T.DT;
        step(b, s, T.DT, hatAt);
        if (b.event === "confetti") {
          burst(b.x, 0.5, ["#c97b84", "#7b9bc9", "#d9a55b", "#8fae7e", "#fff"], 24, 1);
          floatText("🎊 Konfetti!", b.x, 2);
          b.event = null;
        }
        var caught = checkObjects();
        MILESTONES.forEach(function (ms) {
          if (b.x >= ms.m && !passedThisThrow[ms.m]) {
            passedThisThrow[ms.m] = true;
            if (save.best < ms.m) floatText(ms.icon + " " + ms.name + "!", ms.m, b.y + 2);
          }
        });
        if (caught) finishThrow(caught);
        else if (b.done) finishThrow(null);
      }
      if (b) b.rot = (b.rot || 0) + (b.rolling ? b.vx * 0.15 : 0.25 * Math.sign(b.vx)) * dt * 10;

      var speed = Math.hypot(b.vx, b.vy);
      // zoom ut med fart og høyde, så bakken alltid er i bildet
      var target = Math.min((PPM_MAX * 22) / Math.max(22, speed), (GROUND_Y * 0.7) / (b.y + 3));
      target = clamp(target, PPM_MIN, PPM_MAX);
      cam.ppm += (target - cam.ppm) * Math.min(1, dt * 2);
      cam.x = Math.max(-MARIT_SX / cam.ppm, b.x - (W * 0.35) / cam.ppm);
      cam.y = Math.max(0, b.y - (GROUND_Y * 0.5) / cam.ppm);
      spawnAhead();
    }

    objects.forEach(function (o) {
      if (o.type === "guest" && o.jumpT >= 0 && o.jumpT <= 1) o.jumpT += dt / 0.6;
    });
    for (var i = particles.length - 1; i >= 0; i--) {
      var p = particles[i];
      p.vy -= 15 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
      if (p.life <= 0) particles.splice(i, 1);
    }
    for (var j = floaters.length - 1; j >= 0; j--) {
      floaters[j].t += dt;
      if (floaters[j].t > 1.6) floaters.splice(j, 1);
    }
  }

  // ---- Tegning: bakgrunn ----

  function drawSky() {
    var alt = clamp(cam.y / 150, 0, 1);
    var g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, alt > 0 ? mix("#f0ebe3", "#d8e4ec", alt) : "#f0ebe3");
    g.addColorStop(1, "#f0ebe3");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // skyer med parallakse
    var px = 0.5;
    var cellW = 70;
    var cellH = 35;
    var x0 = Math.floor((cam.x * px) / cellW) - 1;
    var x1 = x0 + Math.ceil(W / cam.ppm / cellW) + 3;
    var y0 = Math.max(1, Math.floor(cam.y / cellH));
    var y1 = y0 + Math.ceil(GROUND_Y / cam.ppm / cellH) + 2;
    ctx.fillStyle = "rgba(255, 255, 255, 0.75)";
    for (var cx = x0; cx <= x1; cx++) {
      for (var cy = y0; cy <= y1; cy++) {
        var h = hash(cx * 31 + cy * 17);
        if (h > 0.35) continue;
        var wx = cx * cellW + h * cellW;
        var wy = cy * cellH + hash(cx + cy * 7) * cellH;
        var X = (wx - cam.x * px) * cam.ppm;
        var Y = sy(wy);
        var r = 14 + h * 30;
        ctx.beginPath();
        ctx.ellipse(X, Y, r * 1.6, r * 0.55, 0, 0, Math.PI * 2);
        ctx.ellipse(X + r * 0.6, Y - r * 0.3, r * 0.8, r * 0.5, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // fjerne åser
    var hy = sy(0);
    if (hy < H + 60) {
      ctx.fillStyle = "rgba(168, 196, 166, 0.35)";
      ctx.beginPath();
      ctx.moveTo(0, hy);
      for (var x = 0; x <= W; x += 10) {
        var wxh = x / cam.ppm + cam.x * 0.2;
        ctx.lineTo(x, hy - (18 + Math.sin(wxh * 0.05) * 12 + Math.sin(wxh * 0.13) * 6) * vscale() * 2);
      }
      ctx.lineTo(W, hy);
      ctx.fill();
    }
  }

  function mix(a, c, t) {
    var pa = parseInt(a.slice(1), 16);
    var pc = parseInt(c.slice(1), 16);
    var r = Math.round(((pa >> 16) & 255) * (1 - t) + ((pc >> 16) & 255) * t);
    var g = Math.round(((pa >> 8) & 255) * (1 - t) + ((pc >> 8) & 255) * t);
    var bl = Math.round((pa & 255) * (1 - t) + (pc & 255) * t);
    return "rgb(" + r + "," + g + "," + bl + ")";
  }

  function drawGround() {
    var gy = sy(0);
    if (gy > H) return;
    var left = cam.x;
    var right = cam.x + W / cam.ppm;
    for (var i = 0; i < ZONES.length; i++) {
      var z = ZONES[i];
      var to = i + 1 < ZONES.length ? ZONES[i + 1].from : Infinity;
      if (to < left || z.from > right) continue;
      var a = Math.max(0, sx(Math.max(z.from, left - 1)));
      var e = Math.min(W, sx(Math.min(to, right + 1)));
      if (z.deco === "parasol") {
        ctx.fillStyle = "#b9d3dc";
        ctx.fillRect(a, gy - 10 * vscale(), e - a, 10 * vscale());
      }
      ctx.fillStyle = z.ground;
      ctx.fillRect(a, gy, e - a, H - gy);
      ctx.strokeStyle = z.line;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(a, gy);
      ctx.lineTo(e, gy);
      ctx.stroke();
    }
    // stiplet linje som i Nicolai-spillet
    ctx.setLineDash([12, 8]);
    ctx.lineDashOffset = (cam.x * cam.ppm) % 20;
    ctx.strokeStyle = "rgba(255, 255, 255, 0.5)";
    ctx.beginPath();
    ctx.moveTo(0, gy + 20);
    ctx.lineTo(W, gy + 20);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.lineDashOffset = 0;
  }

  function drawDeco() {
    var gy = sy(0);
    if (gy - 200 > H) return;
    var k = vscale();
    var spacing = 9;
    var i0 = Math.floor(cam.x / spacing) - 2;
    var i1 = Math.ceil((cam.x + W / cam.ppm) / spacing) + 2;
    for (var i = i0; i <= i1; i++) {
      var wx = i * spacing;
      var h = hash(i);
      var z = zoneAt(wx);
      var x = sx(wx);
      ctx.save();
      ctx.translate(x, gy);
      ctx.scale(k, k);
      if (z.deco === "pew") {
        if (wx > 2 && wx < 20) drawPew();
        if (Math.abs(wx - 54) < 0.1) drawChurchDoor();
      } else if (z.deco === "tree" && h < 0.55) {
        drawTree(h);
      } else if (z.deco === "parasol" && h < 0.4) {
        drawParasol(h);
      } else if (z.deco === "runway") {
        ctx.fillStyle = "rgba(255,255,255,0.8)";
        ctx.fillRect(-12, 8, 24, 3);
      } else if (z.deco === "city" && h < 0.75) {
        drawBuilding(h);
      } else if (z.deco === "mountain" && h < 0.18) {
        drawMountain(h);
      } else if (z.deco === "mountain" && h < 0.5) {
        drawTree(h);
      } else if (z.deco === "palm" && h < 0.45) {
        drawPalm(h);
      }
      ctx.restore();
    }
  }

  function drawPew() {
    ctx.fillStyle = "#8b6a4a";
    ctx.fillRect(-14, -12, 28, 4);
    ctx.fillRect(10, -24, 4, 24);
    ctx.fillRect(-12, -8, 3, 8);
    ctx.fillRect(6, -8, 3, 8);
  }

  function drawChurchDoor() {
    ctx.fillStyle = "#e7dfd0";
    ctx.fillRect(-26, -110, 52, 110);
    ctx.fillStyle = "#5a3320";
    ctx.beginPath();
    ctx.moveTo(-16, 0);
    ctx.lineTo(-16, -60);
    ctx.arc(0, -60, 16, Math.PI, 0);
    ctx.lineTo(16, 0);
    ctx.fill();
  }

  function drawTree(h) {
    ctx.fillStyle = "#7a5a3a";
    ctx.fillRect(-3, -22, 6, 22);
    ctx.fillStyle = h < 0.3 ? "#5c7a58" : "#6f8f69";
    ctx.beginPath();
    ctx.arc(0, -32 - h * 16, 14 + h * 10, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawParasol(h) {
    ctx.strokeStyle = "#8b6a4a";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, -34);
    ctx.stroke();
    ctx.fillStyle = h < 0.2 ? "#c97b84" : "#7b9bc9";
    ctx.beginPath();
    ctx.arc(0, -34, 18, Math.PI, 0);
    ctx.fill();
  }

  function drawBuilding(h) {
    var bw = 26 + h * 16;
    var bh = 40 + h * 70;
    ctx.fillStyle = h < 0.3 ? "#cfc5b6" : h < 0.55 ? "#e4dccd" : "#b9aa98";
    ctx.fillRect(-bw / 2, -bh, bw, bh);
    ctx.fillStyle = "#fff4d6";
    for (var y = -bh + 8; y < -10; y += 14) {
      ctx.fillRect(-bw / 2 + 5, y, 5, 6);
      ctx.fillRect(bw / 2 - 10, y, 5, 6);
    }
  }

  function drawMountain(h) {
    ctx.fillStyle = "#8a9a84";
    ctx.beginPath();
    ctx.moveTo(-90, 0);
    ctx.lineTo(-10, -120 - h * 200);
    ctx.lineTo(40, -90 - h * 160);
    ctx.lineTo(100, 0);
    ctx.fill();
  }

  function drawPalm(h) {
    ctx.strokeStyle = "#8b6a4a";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(6 + h * 10, -24, 2, -48);
    ctx.stroke();
    ctx.fillStyle = "#5c7a58";
    for (var i = 0; i < 5; i++) {
      var a = Math.PI + (i * Math.PI) / 4;
      ctx.beginPath();
      ctx.ellipse(2 + Math.cos(a) * 12, -48 + Math.sin(a) * 6, 14, 4, a, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawMilestones() {
    var gy = sy(0);
    var k = vscale();
    MILESTONES.forEach(function (ms) {
      var x = sx(ms.m);
      if (x < -120 || x > W + 120) return;
      var reached = save.best >= ms.m;
      ctx.save();
      ctx.translate(x, gy);
      ctx.scale(k, k);
      ctx.fillStyle = "#7a5a3a";
      ctx.fillRect(-2, -46, 4, 46);
      ctx.fillStyle = reached ? "#3d5e3a" : "#fefcf9";
      ctx.strokeStyle = "#3d5e3a";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(-52, -78, 104, 34, 6);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = reached ? "#fff" : "#2c3e2d";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = "500 11px " + FONT;
      ctx.fillText(ms.icon + " " + ms.name, 0, -66);
      ctx.font = "10px " + FONT;
      ctx.fillText(ms.m + " m", 0, -52);
      ctx.restore();
    });
  }

  // ---- Tegning: figurer ----

  function drawMarit() {
    var x = sx(0);
    if (x < -80) return;
    var k = vscale();
    var stageH = s.stageHeight;
    var feetY = sy(stageH);

    if (stageH > 0) {
      ctx.fillStyle = "#b08a64";
      ctx.fillRect(x - 22 * k, feetY, 44 * k, sy(0) - feetY);
      ctx.fillStyle = "#c9a57d";
      ctx.fillRect(x - 24 * k, feetY, 48 * k, 4 * k);
    }

    ctx.save();
    ctx.translate(x, feetY);
    ctx.scale(k, k);

    // slør (bak)
    ctx.fillStyle = "rgba(255, 255, 255, 0.7)";
    ctx.beginPath();
    ctx.moveTo(4, -62);
    ctx.quadraticCurveTo(22, -40, 16, -22);
    ctx.lineTo(4, -30);
    ctx.fill();

    // kjole
    ctx.fillStyle = "#fffdf8";
    ctx.strokeStyle = "#d6ccbc";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-7, -34);
    ctx.lineTo(7, -34);
    ctx.lineTo(16, 0);
    ctx.lineTo(-17, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillRect(-7, -50, 14, 17);
    ctx.strokeRect(-7, -50, 14, 17);
    ctx.fillStyle = "#e8dcc6";
    ctx.fillRect(-7, -36, 14, 3);

    // hode og hår (ser mot venstre)
    ctx.fillStyle = "#f0c8a0";
    ctx.beginPath();
    ctx.arc(-1, -57, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#9a6b45";
    ctx.beginPath();
    ctx.arc(0, -60, 8, Math.PI * 0.95, Math.PI * 2.1);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(7, -61, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#333";
    ctx.fillRect(-6, -58, 2, 2);

    // armer
    var a;
    if (state === "windup") {
      var t = clamp(stateT / 0.35, 0, 1);
      a = 200 - 140 * (1 - Math.pow(1 - t, 2));
    } else if (state === "flying" || state === "landed" || state === "won") {
      a = 60;
    } else {
      a = 200 + Math.sin(time * 3) * 4;
    }
    var rad = (a * Math.PI) / 180;
    var hx = Math.cos(rad) * 18;
    var hy = -47 - Math.sin(rad) * 18;
    ctx.strokeStyle = "#f0c8a0";
    ctx.lineWidth = 4;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(0, -47);
    ctx.lineTo(hx, hy);
    ctx.stroke();
    ctx.lineCap = "butt";

    if (!b) drawBouquetShape(hx, hy, rad - Math.PI / 2, 1);
    ctx.restore();
  }

  function drawBouquetShape(x, y, rot, scale) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.scale(scale, scale);
    ctx.strokeStyle = "#5c7a58";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-2, 0);
    ctx.lineTo(-1, 10);
    ctx.moveTo(2, 0);
    ctx.lineTo(1, 10);
    ctx.stroke();
    ctx.fillStyle = "#e8dcc6";
    ctx.fillRect(-3, 3, 6, 3);
    var flowers = [
      [-5, -3, "#fff"],
      [4, -4, "#f4c2c2"],
      [0, -8, "#e8a0a8"],
      [-3, -11, "#fde9d9"],
      [5, -10, "#fff"],
    ];
    ctx.fillStyle = "#8fae7e";
    ctx.beginPath();
    ctx.arc(0, -6, 8, 0, Math.PI * 2);
    ctx.fill();
    flowers.forEach(function (f) {
      ctx.fillStyle = f[2];
      ctx.beginPath();
      ctx.arc(f[0], f[1], 3.6, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.restore();
  }

  function drawBouquet() {
    if (!b) return;
    // fanget bukett tegnes i hendene til gjesten
    if (result && result.caughtBy && (state === "landed" || state === "won")) return;
    var k = Math.max(vscale(), 0.7);
    drawBouquetShape(sx(b.x), sy(b.y) - 6 * k, b.rot || 0, k * 1.2);
  }

  function drawGuest(o) {
    var k = vscale();
    var jump = guestJump(o) * 26;
    var x = sx(o.x);
    var y = sy(0) - jump * k;
    var armsUp = o.jumpT >= 0;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(k, k);
    ctx.fillStyle = "#3a3a5c";
    ctx.fillRect(-5, -16, 4, 16);
    ctx.fillRect(1, -16, 4, 16);
    ctx.fillStyle = o.color;
    ctx.beginPath();
    ctx.moveTo(-6, -36);
    ctx.lineTo(6, -36);
    ctx.lineTo(10, -14);
    ctx.lineTo(-10, -14);
    ctx.fill();
    ctx.strokeStyle = "#f0c8a0";
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.beginPath();
    if (armsUp) {
      ctx.moveTo(-5, -34);
      ctx.lineTo(-9, -50);
      ctx.moveTo(5, -34);
      ctx.lineTo(9, -50);
    } else {
      ctx.moveTo(-5, -34);
      ctx.lineTo(-8, -22);
      ctx.moveTo(5, -34);
      ctx.lineTo(8, -22);
    }
    ctx.stroke();
    ctx.lineCap = "butt";
    ctx.fillStyle = "#f0c8a0";
    ctx.beginPath();
    ctx.arc(0, -42, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = o.hair;
    ctx.beginPath();
    ctx.arc(0, -45, 7, Math.PI, Math.PI * 2);
    ctx.fill();
    if (o.caught) drawBouquetShape(0, -54, 0, 1);
    ctx.restore();

    if (o.jumpT >= 0 && !o.done && cam.ppm > 8) {
      ctx.font = "10px " + FONT;
      ctx.fillStyle = "#5a6e5b";
      ctx.textAlign = "center";
      ctx.fillText(o.name, x, y - 60 * k);
    }
  }

  function drawObjects() {
    var k = vscale();
    objects.forEach(function (o) {
      var x = sx(o.x);
      if (x < -60 || x > W + 60) return;
      if (o.type === "guest") {
        drawGuest(o);
        return;
      }
      ctx.save();
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = Math.round(24 * k) + "px serif";
      if (o.done) ctx.globalAlpha = 0.35;
      if (o.type === "hat") {
        ctx.fillText("🎩", x, sy(0) - 10 * k);
      } else {
        var bob = Math.sin(time * 4 + o.x) * 3;
        if (o.type === "balloon") {
          ctx.strokeStyle = "#999";
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(x, sy(o.y) + 12 * k + bob);
          ctx.lineTo(x, sy(o.y) + 30 * k + bob);
          ctx.stroke();
        }
        ctx.fillText(o.type === "dove" ? "🕊️" : "🎈", x, sy(o.y) + bob);
      }
      ctx.restore();
    });
  }

  function drawParticles() {
    particles.forEach(function (p) {
      ctx.globalAlpha = clamp(p.life, 0, 1);
      ctx.fillStyle = p.color;
      ctx.fillRect(sx(p.x) - 2, sy(p.y) - 2, 4, 4);
    });
    ctx.globalAlpha = 1;
  }

  function drawFloaters() {
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "600 14px " + FONT;
    floaters.forEach(function (f) {
      var half = ctx.measureText(f.text).width / 2 + 10;
      var x = clamp(sx(f.x), half, W - half);
      var y = clamp(sy(f.y) - 30 - f.t * 30, 50, H - 20);
      ctx.globalAlpha = clamp(1.6 - f.t, 0, 1);
      ctx.fillStyle = "#fefcf9";
      ctx.fillText(f.text, x + 1, y + 1);
      ctx.fillStyle = "#2c3e2d";
      ctx.fillText(f.text, x, y);
    });
    ctx.globalAlpha = 1;
  }

  // ---- Tegning: sikte og HUD ----

  function drawAim() {
    if (state !== "power" && state !== "angle") return;
    var mx = sx(0) - 70;
    var top = 40;
    var h = GROUND_Y - 60;
    ctx.fillStyle = "#e0d8c8";
    ctx.beginPath();
    ctx.roundRect(mx, top, 14, h, 7);
    ctx.fill();
    var g = ctx.createLinearGradient(0, top + h, 0, top);
    g.addColorStop(0, "#a8c4a6");
    g.addColorStop(1, "#3d5e3a");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.roundRect(mx, top + h * (1 - power), 14, h * power, 7);
    ctx.fill();
    ctx.font = "500 11px " + FONT;
    ctx.fillStyle = "#5a6e5b";
    ctx.textAlign = "center";
    ctx.fillText("Kraft", mx + 7, top - 10);

    if (state === "angle") {
      var ox = sx(0.4);
      var oy = sy(s.height) - 10;
      var rad = (angle * Math.PI) / 180;
      ctx.strokeStyle = "rgba(61, 94, 58, 0.25)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(ox, oy, 80, -(T.MAX_ANGLE * Math.PI) / 180, -(T.MIN_ANGLE * Math.PI) / 180);
      ctx.stroke();
      var ex = ox + Math.cos(rad) * 80;
      var ey = oy - Math.sin(rad) * 80;
      ctx.strokeStyle = "#3d5e3a";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(ox, oy);
      ctx.lineTo(ex, ey);
      ctx.stroke();
      ctx.fillStyle = "#3d5e3a";
      ctx.beginPath();
      ctx.moveTo(ex + Math.cos(rad) * 8, ey - Math.sin(rad) * 8);
      ctx.lineTo(ex + Math.cos(rad + 2.3) * 8, ey - Math.sin(rad + 2.3) * 8);
      ctx.lineTo(ex + Math.cos(rad - 2.3) * 8, ey - Math.sin(rad - 2.3) * 8);
      ctx.fill();
      ctx.font = "11px " + FONT;
      ctx.fillStyle = "#5a6e5b";
      ctx.fillText(Math.round(angle) + "°", ex + Math.cos(rad) * 22, ey - Math.sin(rad) * 22);
    }
  }

  function drawProgressBar() {
    var barW = 180;
    var barH = 8;
    var barX = W / 2 - barW / 2;
    var barY = 12;
    var current = b ? Math.max(b.x, save.best) : save.best;
    var progress = Math.min(current / T.GOAL, 1);

    ctx.fillStyle = "#e0d8c8";
    ctx.beginPath();
    ctx.roundRect(barX, barY, barW, barH, 4);
    ctx.fill();
    ctx.fillStyle = "#3d5e3a";
    ctx.beginPath();
    ctx.roundRect(barX, barY, Math.max(barH, barW * progress), barH, 4);
    ctx.fill();
    // milepælsmerker
    ctx.fillStyle = "#fefcf9";
    MILESTONES.forEach(function (ms) {
      if (ms.m < T.GOAL) ctx.fillRect(barX + (barW * ms.m) / T.GOAL, barY + 1, 1, barH - 2);
    });

    ctx.font = "10px " + FONT;
    ctx.fillStyle = "#5a6e5b";
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    var next = null;
    for (var i = 0; i < MILESTONES.length; i++) {
      if (current < MILESTONES[i].m) {
        next = MILESTONES[i];
        break;
      }
    }
    var label = next ? "Neste: " + next.icon + " " + next.name + " (" + next.m + " m)" : HONEYMOON + " nådd! Sett ny rekord";
    ctx.fillText(label, W / 2, barY + barH + 13);
  }

  function drawFlightHUD() {
    if (!b || state === "ready") return;
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = "#2c3e2d";
    ctx.font = "600 22px " + FONT;
    ctx.fillText(Math.max(0, Math.floor(b.x)) + " m", 16, 32);
    if (b.y > 12) {
      ctx.font = "11px " + FONT;
      ctx.fillStyle = "#5a6e5b";
      ctx.fillText("↑ " + Math.floor(b.y) + " m høyde", 16, 48);
    }
    ctx.textAlign = "right";
    ctx.font = "14px serif";
    var items = "";
    for (var i = 0; i < b.corks; i++) items += "🍾";
    for (var j = 0; j < b.confetti; j++) items += "🎊";
    if (items) ctx.fillText(items, W - 14, 30);
    if (b.corks > 0 && state === "flying") {
      ctx.font = "10px " + FONT;
      ctx.fillStyle = "#5a6e5b";
      ctx.fillText("Trykk for champagnekork!", W - 14, 46);
    }
  }

  function panel(lines) {
    ctx.fillStyle = "rgba(253, 251, 248, 0.86)";
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    var total = lines.reduce(function (sum, l) {
      return sum + l.gap;
    }, 0);
    var y = H / 2 - total / 2 + 10;
    lines.forEach(function (l) {
      ctx.font = l.font;
      ctx.fillStyle = l.color || "#5a6e5b";
      ctx.fillText(l.text, W / 2, y);
      y += l.gap;
    });
  }

  function drawOverlay() {
    if (state === "ready") {
      if (save.throws === 0) {
        panel([
          { text: "Kast buketten!", font: "bold 24px " + FONT, color: "#2c3e2d", gap: 32 },
          { text: "Stopp kraftmåleren, så vinkelen.", font: "14px " + FONT, gap: 20 },
          { text: "Tjen kroner og kjøp oppgraderinger.", font: "14px " + FONT, gap: 20 },
          { text: "Pass deg for gjester som vil fange den!", font: "14px " + FONT, gap: 34 },
          { text: "Trykk for å starte", font: "600 15px " + FONT, color: "#3d5e3a", gap: 0 },
        ]);
      } else {
        ctx.textAlign = "center";
        ctx.font = "600 15px " + FONT;
        ctx.fillStyle = "#3d5e3a";
        ctx.fillText("Trykk for å kaste", W / 2, 62);
      }
      return;
    }
    if (state === "power" || state === "angle") {
      ctx.textAlign = "center";
      ctx.font = "13px " + FONT;
      ctx.fillStyle = "#5a6e5b";
      ctx.fillText(state === "power" ? "Trykk for å velge kraft" : "Trykk for å velge vinkel", W / 2, 62);
      return;
    }
    if (state === "landed" && result) {
      var lines = [
        { text: result.dist + " meter!", font: "bold 26px " + FONT, color: "#2c3e2d", gap: 30 },
      ];
      if (result.caughtBy) lines.push({ text: result.caughtBy + " fanget buketten! 💐", font: "15px " + FONT, gap: 24 });
      if (result.record) lines.push({ text: "★ Ny rekord! ★", font: "bold 14px " + FONT, color: "#3d5e3a", gap: 22 });
      lines.push({ text: "+" + result.base + " kr", font: "600 16px " + FONT, color: "#3d5e3a", gap: 22 });
      result.reached.forEach(function (ms) {
        lines.push({
          text: ms.icon + " " + ms.name + " nådd: +" + Math.round(ms.m * T.MILESTONE_BONUS) + " kr",
          font: "13px " + FONT,
          gap: 19,
        });
      });
      lines.push({ text: "Trykk for å kaste igjen", font: "13px " + FONT, gap: 0 });
      lines[lines.length - 2].gap += 10;
      panel(lines);
      return;
    }
    if (state === "won" && result) {
      panel([
        { text: "🌴 Buketten nådde frem! 🌴", font: "bold 22px " + FONT, color: "#2c3e2d", gap: 26 },
        { text: "Helt til " + HONEYMOON.toLowerCase() + "!", font: "600 15px " + FONT, color: "#3d5e3a", gap: 26 },
        { text: result.dist + " meter på kast nr. " + save.throws, font: "16px " + FONT, gap: 22 },
        { text: "+" + result.earned + " kr", font: "600 16px " + FONT, color: "#3d5e3a", gap: 30 },
        { text: "Gratulerer! Kast videre for ny rekord.", font: "14px " + FONT, gap: 22 },
        { text: "Trykk for å fortsette", font: "600 14px " + FONT, color: "#3d5e3a", gap: 0 },
      ]);
    }
  }

  function render() {
    drawSky();
    drawGround();
    drawDeco();
    drawMilestones();
    drawMarit();
    drawObjects();
    drawBouquet();
    drawParticles();
    drawFloaters();
    drawAim();
    drawProgressBar();
    drawFlightHUD();
    drawOverlay();
  }

  // ---- Butikk (HTML under canvas) ----

  var shopGrid = document.getElementById("shop-grid");
  var shopMoney = document.getElementById("shop-money");
  var resetBtn = document.getElementById("reset-btn");
  var resetTimer = null;

  function shopOpen() {
    return state === "ready" || state === "landed" || state === "won";
  }

  function renderShop() {
    shopMoney.textContent = save.kr + " kr";
    shopGrid.innerHTML = "";
    UPGRADES.forEach(function (u) {
      var lvl = save.lv[u.key];
      var maxed = lvl >= u.max;
      var cost = price(u, lvl);
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "upgrade" + (maxed ? " maxed" : "");
      btn.disabled = maxed || save.kr < cost || !shopOpen();
      var dots = "";
      for (var i = 0; i < u.max; i++) dots += i < lvl ? "●" : "○";
      btn.innerHTML =
        '<span class="upgrade-icon">' + u.icon + "</span>" +
        '<span class="upgrade-name">' + u.name + "</span>" +
        '<span class="upgrade-desc">' + u.desc + "</span>" +
        '<span class="upgrade-meta"><span class="upgrade-dots">' + dots + "</span>" +
        '<span class="upgrade-price">' + (maxed ? "Maks" : cost + " kr") + "</span></span>";
      btn.addEventListener("click", function () {
        buy(u);
      });
      shopGrid.appendChild(btn);
    });
  }

  function buy(u) {
    var lvl = save.lv[u.key];
    var cost = price(u, lvl);
    if (!shopOpen() || lvl >= u.max || save.kr < cost) return;
    save.kr -= cost;
    save.lv[u.key] = lvl + 1;
    s = stats(save.lv);
    persist();
    updateHUD();
    renderShop();
  }

  resetBtn.addEventListener("click", function () {
    if (!resetBtn.classList.contains("danger")) {
      resetBtn.classList.add("danger");
      resetBtn.textContent = "Sikker? Trykk igjen";
      resetTimer = setTimeout(function () {
        resetBtn.classList.remove("danger");
        resetBtn.textContent = "Start på nytt";
      }, 3000);
      return;
    }
    clearTimeout(resetTimer);
    resetBtn.classList.remove("danger");
    resetBtn.textContent = "Start på nytt";
    try {
      localStorage.removeItem(SAVE_KEY);
    } catch (e) {
      // ignorer
    }
    save = loadSave();
    s = stats(save.lv);
    b = null;
    result = null;
    objects = [];
    resetCamera();
    updateHUD();
    setState("ready");
  });

  // ---- Hovedløkke ----

  var last = null;
  function loop(ts) {
    var dt = last === null ? 0 : Math.min(0.05, (ts - last) / 1000);
    last = ts;
    update(dt);
    render();
    requestAnimationFrame(loop);
  }

  updateHUD();
  renderShop();
  requestAnimationFrame(loop);
})();
