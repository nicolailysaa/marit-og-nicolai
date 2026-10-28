(function () {
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");

  const W = canvas.width;
  const H = canvas.height;
  const GROUND_Y = H - 40;
  const GRAVITY = 0.6;
  const JUMP_FORCE = -12;
  const BASE_SPEED = 5;
  const WIN_SCORE = 600;
  const MIN_COLLECTIBLE_GAP = 120;

  const TUXEDO_PARTS = [
    { key: "jakke", label: "\uD83D\uDC54", color: "#2c3e2d" },
    { key: "sloeyfe", label: "\uD83C\uDF80", color: "#8b3a3a" },
    { key: "sko", label: "\uD83D\uDC5E", color: "#3a2a1a" },
    { key: "vest", label: "\uD83E\uDDEC", color: "#5c5c5c" },
  ];

  let state = "idle";
  let score = 0;
  let bonusScore = 0;
  let highScore = parseInt(localStorage.getItem("bryllup_highscore") || "0");
  let speed = BASE_SPEED;
  let frameCount = 0;
  let obstacles = [];
  let collectibles = [];
  let collectedParts = new Set();
  let churchX = W - 50;
  let reachedChurch = false;
  let lastObstacleSpawnX = 0;

  const player = {
    x: 60,
    y: GROUND_Y,
    w: 30,
    h: 50,
    vy: 0,
    onGround: true,
  };

  function reset() {
    score = 0;
    bonusScore = 0;
    speed = BASE_SPEED;
    frameCount = 0;
    obstacles = [];
    collectibles = [];
    collectedParts = new Set();
    churchX = W - 50;
    reachedChurch = false;
    lastObstacleSpawnX = 0;
    player.x = 60;
    player.y = GROUND_Y;
    player.vy = 0;
    player.onGround = true;
    updateHUD();
    updateInventory();
  }

  function totalScore() {
    return score + bonusScore;
  }

  function jump() {
    if (player.onGround) {
      player.vy = JUMP_FORCE;
      player.onGround = false;
    }
  }

  function handleInput() {
    if (state === "idle" || state === "gameover") {
      reset();
      state = "running";
      requestAnimationFrame(loop);
      return;
    }
    if (state === "won") {
      // continue running after reaching the church
      state = "running";
      obstacles = [];
      collectibles = [];
      player.x = 60;
      requestAnimationFrame(loop);
      return;
    }
    if (state === "running") {
      jump();
    }
  }

  document.addEventListener("keydown", function (e) {
    if (e.code === "Space" || e.code === "ArrowUp") {
      e.preventDefault();
      handleInput();
    }
    if (e.code === "KeyR" && state === "won") {
      reset();
      state = "running";
      requestAnimationFrame(loop);
    }
  });
  canvas.addEventListener("click", handleInput);
  canvas.addEventListener("touchstart", function (e) {
    e.preventDefault();
    handleInput();
  });

  function nearestObstacleDistance(xPos) {
    var minDist = Infinity;
    for (var i = 0; i < obstacles.length; i++) {
      var dist = Math.abs(obstacles[i].x - xPos);
      if (dist < minDist) minDist = dist;
    }
    return minDist;
  }

  function spawnObstacle() {
    const type = Math.random() < 0.5 ? "car" : "house";
    let w, h;
    if (type === "car") {
      w = 55 + Math.random() * 20;
      h = 28 + Math.random() * 8;
    } else {
      w = 40 + Math.random() * 15;
      h = 50 + Math.random() * 20;
    }
    obstacles.push({ x: W + 10, y: GROUND_Y, w: w, h: h, type: type });
    lastObstacleSpawnX = W + 10;
  }

  function spawnCollectible() {
    const available = TUXEDO_PARTS.filter((p) => !collectedParts.has(p.key));
    if (available.length === 0) return;

    // place midway between obstacles
    var spawnX = W + 10;
    if (nearestObstacleDistance(spawnX) < MIN_COLLECTIBLE_GAP) return;

    const part = available[Math.floor(Math.random() * available.length)];
    collectibles.push({
      x: spawnX,
      y: GROUND_Y - 60 - Math.random() * 40,
      w: 22,
      h: 22,
      part: part,
    });
  }

  function updateHUD() {
    document.getElementById("score-display").textContent =
      "Poeng: " + totalScore();
    document.getElementById("highscore-display").textContent =
      "Rekord: " + highScore;
  }

  function updateInventory() {
    document.querySelectorAll(".tuxedo-item").forEach(function (el) {
      if (collectedParts.has(el.dataset.part)) {
        el.classList.add("collected");
      } else {
        el.classList.remove("collected");
      }
    });
  }

  function collides(a, bx, by, bw, bh) {
    return (
      a.x < bx + bw &&
      a.x + a.w > bx &&
      a.y - a.h < by &&
      a.y > by - bh
    );
  }

  function drawGround() {
    ctx.fillStyle = "#c9bfab";
    ctx.fillRect(0, GROUND_Y, W, H - GROUND_Y);
    ctx.strokeStyle = "#b0a68e";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, GROUND_Y);
    ctx.lineTo(W, GROUND_Y);
    ctx.stroke();

    ctx.setLineDash([12, 8]);
    ctx.strokeStyle = "#e0d8c8";
    ctx.beginPath();
    ctx.moveTo(0, GROUND_Y + 20);
    ctx.lineTo(W, GROUND_Y + 20);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  function drawPlayer() {
    var px = player.x;
    var py = player.y;
    var moving = state === "running" || state === "approaching";
    var legOffset = moving ? Math.sin(frameCount * 0.3) * 5 : 0;

    ctx.fillStyle = "#3a3a5c";
    ctx.fillRect(px + 6, py - 18, 7, 18 + legOffset);
    ctx.fillRect(px + 17, py - 18, 7, 18 - legOffset);

    ctx.fillStyle = collectedParts.has("jakke") ? "#2c3e2d" : "#6a8e6e";
    ctx.fillRect(px + 3, py - 38, 24, 22);

    if (collectedParts.has("vest")) {
      ctx.fillStyle = "#8a8a8a";
      ctx.fillRect(px + 10, py - 36, 10, 18);
    }

    if (collectedParts.has("sloeyfe")) {
      ctx.fillStyle = "#8b3a3a";
      ctx.beginPath();
      ctx.moveTo(px + 15, py - 37);
      ctx.lineTo(px + 11, py - 40);
      ctx.lineTo(px + 11, py - 34);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(px + 15, py - 37);
      ctx.lineTo(px + 19, py - 40);
      ctx.lineTo(px + 19, py - 34);
      ctx.fill();
    }

    ctx.fillStyle = "#f0c8a0";
    ctx.beginPath();
    ctx.arc(px + 15, py - 44, 9, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#c45a2c";
    ctx.beginPath();
    ctx.arc(px + 15, py - 48, 8, Math.PI, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "#333";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(px + 9, py - 46, 5, 4);
    ctx.strokeRect(px + 16, py - 46, 5, 4);
    ctx.beginPath();
    ctx.moveTo(px + 14, py - 44);
    ctx.lineTo(px + 16, py - 44);
    ctx.stroke();

    ctx.fillStyle = collectedParts.has("sko") ? "#1a1a1a" : "#888";
    ctx.fillRect(px + 4, py - 1 + legOffset, 10, 4);
    ctx.fillRect(px + 16, py - 1 - legOffset, 10, 4);
  }

  function drawObstacle(ob) {
    if (ob.type === "car") {
      ctx.fillStyle = "#6688aa";
      var carY = ob.y - ob.h;
      ctx.beginPath();
      ctx.roundRect(ob.x, carY, ob.w, ob.h, 4);
      ctx.fill();
      ctx.fillStyle = "#557799";
      ctx.beginPath();
      ctx.roundRect(ob.x + ob.w * 0.2, carY - ob.h * 0.45, ob.w * 0.6, ob.h * 0.5, 3);
      ctx.fill();
      ctx.fillStyle = "#aaccee";
      ctx.fillRect(ob.x + ob.w * 0.25, carY - ob.h * 0.35, ob.w * 0.2, ob.h * 0.3);
      ctx.fillRect(ob.x + ob.w * 0.52, carY - ob.h * 0.35, ob.w * 0.2, ob.h * 0.3);
      ctx.fillStyle = "#222";
      ctx.beginPath();
      ctx.arc(ob.x + ob.w * 0.22, ob.y, 5, 0, Math.PI * 2);
      ctx.arc(ob.x + ob.w * 0.78, ob.y, 5, 0, Math.PI * 2);
      ctx.fill();
    } else {
      var houseY = ob.y - ob.h;
      ctx.fillStyle = "#c4956a";
      ctx.fillRect(ob.x, houseY + ob.h * 0.3, ob.w, ob.h * 0.7);
      ctx.fillStyle = "#8b4533";
      ctx.beginPath();
      ctx.moveTo(ob.x - 4, houseY + ob.h * 0.3);
      ctx.lineTo(ob.x + ob.w / 2, houseY);
      ctx.lineTo(ob.x + ob.w + 4, houseY + ob.h * 0.3);
      ctx.fill();
      ctx.fillStyle = "#5a3320";
      ctx.fillRect(ob.x + ob.w * 0.35, ob.y - ob.h * 0.28, ob.w * 0.3, ob.h * 0.28);
      ctx.fillStyle = "#ffeebb";
      ctx.fillRect(ob.x + ob.w * 0.15, houseY + ob.h * 0.4, ob.w * 0.2, ob.h * 0.15);
    }
  }

  function drawCollectible(c) {
    var bob = Math.sin(frameCount * 0.08 + c.x) * 4;
    var cy = c.y - c.h / 2 + bob;
    ctx.save();
    ctx.shadowColor = "#c5a46d";
    ctx.shadowBlur = 10;
    ctx.fillStyle = c.part.color;
    ctx.beginPath();
    ctx.arc(c.x + c.w / 2, cy, c.w / 2 + 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.font = "16px serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(c.part.label, c.x + c.w / 2, cy);
  }

  function drawChurch(cx) {
    var big = state === "approaching" || state === "won";
    var opacity = big ? 1.0 : 0.12;
    var scale = big ? 2.2 : 1.0;

    ctx.save();
    ctx.translate(cx + 12, GROUND_Y);
    ctx.scale(scale, scale);
    ctx.translate(-12, 0);

    ctx.fillStyle = "rgba(44, 62, 45, " + opacity + ")";
    ctx.fillRect(0, -35, 24, 35);
    ctx.beginPath();
    ctx.moveTo(-2, -35);
    ctx.lineTo(12, -52);
    ctx.lineTo(26, -35);
    ctx.fill();
    ctx.fillRect(10, -60, 4, 12);
    ctx.fillRect(7, -55, 10, 3);

    if (scale > 1.5) {
      ctx.fillStyle = "rgba(255, 238, 187, " + opacity + ")";
      ctx.fillRect(4, -25, 7, 10);
      ctx.fillRect(13, -25, 7, 10);
      ctx.fillStyle = "rgba(90, 51, 32, " + opacity + ")";
      ctx.fillRect(8, -15, 8, 15);
    }

    ctx.restore();
  }

  function drawProgressBar() {
    var barW = 150;
    var barH = 8;
    var barX = W / 2 - barW / 2;
    var barY = 12;
    var progress = Math.min(totalScore() / WIN_SCORE, 1);

    ctx.fillStyle = "#e0d8c8";
    ctx.beginPath();
    ctx.roundRect(barX, barY, barW, barH, 4);
    ctx.fill();

    ctx.fillStyle = "#3d5e3a";
    ctx.beginPath();
    ctx.roundRect(barX, barY, barW * progress, barH, 4);
    ctx.fill();

    ctx.font = "10px 'Roboto Serif', Georgia, serif";
    ctx.fillStyle = "#5a6e5b";
    ctx.textAlign = "center";
    if (reachedChurch) {
      ctx.fillText("Kirken n\u00E5dd! L\u00F8per videre...", W / 2, barY + barH + 12);
    } else {
      ctx.fillText("Kirken: " + Math.floor(progress * 100) + "%", W / 2, barY + barH + 12);
    }
  }

  function drawStartScreen() {
    ctx.clearRect(0, 0, W, H);
    drawGround();
    drawChurch(W - 50);
    player.y = GROUND_Y;
    drawPlayer();

    ctx.fillStyle = "rgba(253, 251, 248, 0.85)";
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = "#2c3e2d";
    ctx.font = "bold 22px 'Roboto Serif', Georgia, serif";
    ctx.textAlign = "center";
    ctx.fillText("Hjelp Nicolai!", W / 2, H / 2 - 20);
    ctx.font = "15px 'Roboto Serif', Georgia, serif";
    ctx.fillStyle = "#5a6e5b";
    ctx.fillText("Trykk for \u00E5 starte", W / 2, H / 2 + 12);
  }

  function drawGameOver() {
    ctx.fillStyle = "rgba(253, 251, 248, 0.82)";
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = "#2c3e2d";
    ctx.font = "bold 22px 'Roboto Serif', Georgia, serif";
    ctx.textAlign = "center";
    ctx.fillText("Nicolai rakk det ikke!", W / 2, H / 2 - 30);

    ctx.font = "16px 'Roboto Serif', Georgia, serif";
    ctx.fillStyle = "#5a6e5b";
    ctx.fillText("Poeng: " + totalScore(), W / 2, H / 2 + 4);

    var parts = collectedParts.size;
    if (parts > 0) {
      ctx.fillText(parts + " av 4 dressdeler funnet", W / 2, H / 2 + 28);
    } else {
      ctx.fillText("Ingen dressdeler funnet!", W / 2, H / 2 + 28);
    }

    ctx.font = "14px 'Roboto Serif', Georgia, serif";
    ctx.fillText("Trykk for \u00E5 pr\u00F8ve igjen", W / 2, H / 2 + 56);
  }

  function drawWinScreen() {
    ctx.fillStyle = "rgba(253, 251, 248, 0.85)";
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = "#2c3e2d";
    ctx.font = "bold 24px 'Roboto Serif', Georgia, serif";
    ctx.textAlign = "center";

    if (collectedParts.size === 4) {
      ctx.fillText("Nicolai rakk kirken \u2013 i full dress!", W / 2, H / 2 - 45);
    } else if (collectedParts.size > 0) {
      ctx.fillText("Nicolai rakk kirken!", W / 2, H / 2 - 45);
    } else {
      ctx.fillText("Nicolai rakk kirken \u2013 i pysjamas!", W / 2, H / 2 - 45);
    }

    ctx.font = "16px 'Roboto Serif', Georgia, serif";
    ctx.fillStyle = "#5a6e5b";
    ctx.fillText("Poeng: " + totalScore(), W / 2, H / 2 - 12);

    var parts = collectedParts.size;
    ctx.fillText(parts + " av 4 dressdeler", W / 2, H / 2 + 10);

    if (parts === 4) {
      ctx.fillStyle = "#3d5e3a";
      ctx.font = "bold 14px 'Roboto Serif', Georgia, serif";
      ctx.fillText("\u2605 Perfekt! Bonus +100 poeng! \u2605", W / 2, H / 2 + 36);
    }

    ctx.font = "15px 'Roboto Serif', Georgia, serif";
    ctx.fillStyle = "#2c3e2d";
    ctx.fillText("Trykk for \u00E5 l\u00F8pe videre!", W / 2, H / 2 + 64);

    ctx.font = "12px 'Roboto Serif', Georgia, serif";
    ctx.fillStyle = "#5a6e5b";
    ctx.fillText("(R for \u00E5 starte p\u00E5 nytt)", W / 2, H / 2 + 84);
  }

  var approachFrames = 0;

  function approachLoop() {
    if (state !== "approaching") return;

    ctx.clearRect(0, 0, W, H);
    frameCount++;
    approachFrames++;

    drawGround();

    var targetX = churchX - 10;
    if (player.x < targetX) {
      player.x += 2;
    }

    drawChurch(churchX);
    drawPlayer();
    drawProgressBar();
    updateHUD();

    if (approachFrames > 60) {
      state = "won";
      reachedChurch = true;
      if (collectedParts.size === 4) {
        bonusScore += 100;
      }
      var final = totalScore();
      if (final > highScore) {
        highScore = final;
        localStorage.setItem("bryllup_highscore", String(highScore));
      }
      updateHUD();
      drawWinScreen();
      return;
    }

    requestAnimationFrame(approachLoop);
  }

  function loop() {
    if (state !== "running") return;

    ctx.clearRect(0, 0, W, H);
    frameCount++;

    speed = BASE_SPEED + Math.floor(frameCount / 500) * 0.5;
    score = Math.floor(frameCount / 6);

    // check win condition (only first time)
    if (!reachedChurch && totalScore() >= WIN_SCORE) {
      state = "approaching";
      approachFrames = 0;
      obstacles = [];
      collectibles = [];
      requestAnimationFrame(approachLoop);
      return;
    }

    // physics
    player.vy += GRAVITY;
    player.y += player.vy;
    if (player.y >= GROUND_Y) {
      player.y = GROUND_Y;
      player.vy = 0;
      player.onGround = true;
    }

    // spawn obstacles
    if (frameCount % Math.max(60, 100 - Math.floor(frameCount / 200)) === 0) {
      spawnObstacle();
    }

    // spawn tuxedo parts -- between obstacles with safe spacing
    if (frameCount % 180 === 90 && collectedParts.size < 4) {
      if (Math.random() < 0.4) {
        spawnCollectible();
      }
    }

    // move obstacles
    for (var i = obstacles.length - 1; i >= 0; i--) {
      obstacles[i].x -= speed;
      if (obstacles[i].x + obstacles[i].w < 0) {
        obstacles.splice(i, 1);
      }
    }

    // move collectibles
    for (var j = collectibles.length - 1; j >= 0; j--) {
      collectibles[j].x -= speed;
      if (collectibles[j].x + collectibles[j].w < 0) {
        collectibles.splice(j, 1);
      }
    }

    // collision: obstacles
    for (var k = 0; k < obstacles.length; k++) {
      var ob = obstacles[k];
      if (collides(player, ob.x, ob.y, ob.w, ob.h)) {
        state = "gameover";
        var final = totalScore();
        if (final > highScore) {
          highScore = final;
          localStorage.setItem("bryllup_highscore", String(highScore));
        }
        updateHUD();
        drawGround();
        drawChurch(churchX);
        for (var di = 0; di < obstacles.length; di++) drawObstacle(obstacles[di]);
        for (var dj = 0; dj < collectibles.length; dj++) drawCollectible(collectibles[dj]);
        drawPlayer();
        drawGameOver();
        return;
      }
    }

    // collision: collectibles
    for (var m = collectibles.length - 1; m >= 0; m--) {
      var c = collectibles[m];
      if (collides(player, c.x, c.y, c.w, c.h)) {
        collectedParts.add(c.part.key);
        bonusScore += 50;
        collectibles.splice(m, 1);
        updateInventory();
      }
    }

    // draw
    drawGround();
    drawChurch(churchX);
    for (var oi = 0; oi < obstacles.length; oi++) drawObstacle(obstacles[oi]);
    for (var ci = 0; ci < collectibles.length; ci++) drawCollectible(collectibles[ci]);
    drawPlayer();
    drawProgressBar();
    updateHUD();

    requestAnimationFrame(loop);
  }

  // init
  updateHUD();
  drawStartScreen();
})();
