'use strict';

(() => {
  const WIDTH = 1280;
  const HEIGHT = 720;
  const PLAYER_SIZE = 112;
  const ZOMBIE_SIZE = 96;
  const MAGAZINE_SIZE = 6;
  const STORAGE_KEY = 'zsa-high-score-v2';

  const canvas = document.getElementById('gameCanvas');
  const ctx = canvas.getContext('2d');
  const ui = {
    menu: document.getElementById('menuOverlay'),
    pause: document.getElementById('pauseOverlay'),
    gameOver: document.getElementById('gameOverOverlay'),
    start: document.getElementById('startButton'),
    resume: document.getElementById('resumeButton'),
    restart: document.getElementById('restartButton'),
    wave: document.getElementById('waveValue'),
    healthText: document.getElementById('healthText'),
    healthBar: document.getElementById('healthBar'),
    ammoText: document.getElementById('ammoText'),
    ammoPips: document.getElementById('ammoPips'),
    score: document.getElementById('scoreValue'),
    best: document.getElementById('bestScore'),
    kills: document.getElementById('killsValue'),
    finalWave: document.getElementById('finalWave'),
    finalScore: document.getElementById('finalScore')
  };

  const ASSETS = {
    grass: 'images/grass.png',
    bullet: 'images/bullet.png',
    crosshair: 'images/crosshair097.png',
    playerIdle: 'images/Top_Down_Survivor/Top_Down_Survivor/shotgun/idle/survivor-idle_shotgun_',
    playerMove: 'images/Top_Down_Survivor/Top_Down_Survivor/shotgun/move/survivor-move_shotgun_',
    playerShoot: 'images/Top_Down_Survivor/Top_Down_Survivor/shotgun/shoot/survivor-shoot_shotgun_',
    zombieMove: 'images/tds_zombie/export/Movement/skeleton-move_',
    zombieAttack: 'images/tds_zombie/export/Attack/skeleton-attack_'
  };

  function loadImage(src) {
    const image = new Image();
    image.src = src;
    return image;
  }
  function loadFrames(prefix, count) {
    return Array.from({ length: count }, (_, i) => loadImage(`${prefix}${i}.png`));
  }

  const images = {
    grass: loadImage(ASSETS.grass), bullet: loadImage(ASSETS.bullet), crosshair: loadImage(ASSETS.crosshair),
    playerIdle: loadFrames(ASSETS.playerIdle, 20),
    playerMove: loadFrames(ASSETS.playerMove, 20),
    playerShoot: loadFrames(ASSETS.playerShoot, 3),
    zombieMove: loadFrames(ASSETS.zombieMove, 16),
    zombieAttack: loadFrames(ASSETS.zombieAttack, 9)
  };

  let state = 'menu';
  let player;
  let bullets = [];
  let zombies = [];
  let particles = [];
  let keys = new Set();
  let pointer = { x: WIDTH / 2, y: HEIGHT / 2, down: false };
  let score = 0;
  let kills = 0;
  let wave = 1;
  let health = 100;
  let ammo = MAGAZINE_SIZE;
  let highscore = readHighscore();
  let spawnTimer = 0;
  let fireTimer = 0;
  let reloadTimer = 0;
  let invulnerabilityTimer = 0;
  let screenShake = 0;
  let lastTime = 0;
  let elapsed = 0;
  let shootFlash = 0;
  let reloadMessageTimer = 0;
  let moveFrame = 0;
  let idleFrame = 0;
  let shootFrame = 0;
  let animationTimer = 0;
  let gameStartedOnce = false;

  function readHighscore() {
    try { return Number(localStorage.getItem(STORAGE_KEY)) || 0; }
    catch (_) { return 0; }
  }
  function saveHighscore() {
    try { localStorage.setItem(STORAGE_KEY, String(highscore)); }
    catch (_) { /* Private browsing may block storage; the game still works. */ }
  }
  function setOverlay(which) {
    ui.menu.classList.toggle('hidden', which !== 'menu');
    ui.pause.classList.toggle('hidden', which !== 'pause');
    ui.gameOver.classList.toggle('hidden', which !== 'gameover');
  }
  function resetGame() {
    player = { x: WIDTH / 2, y: HEIGHT / 2, angle: 0, moving: false };
    bullets = [];
    zombies = [];
    particles = [];
    keys = new Set();
    pointer.down = false;
    score = 0; kills = 0; wave = 1; health = 100; ammo = MAGAZINE_SIZE;
    spawnTimer = 1.1; fireTimer = 0; reloadTimer = 0; invulnerabilityTimer = 0;
    screenShake = 0; elapsed = 0; shootFlash = 0; reloadMessageTimer = 0;
    moveFrame = 0; idleFrame = 0; shootFrame = 0; animationTimer = 0;
    state = 'playing';
    gameStartedOnce = true;
    setOverlay('none');
    updateHud();
  }
  function updateHud() {
    ui.wave.textContent = String(wave);
    ui.healthText.textContent = `${Math.ceil(health)}%`;
    ui.healthBar.style.width = `${Math.max(0, health)}%`;
    ui.healthBar.style.background = health <= 30 ? 'linear-gradient(90deg,#ff3f4d,#ff8064)' : '';
    ui.ammoText.textContent = reloadTimer > 0 ? 'LADER…' : `${ammo} / ${MAGAZINE_SIZE}`;
    ui.ammoPips.innerHTML = '';
    for (let i = 0; i < MAGAZINE_SIZE; i++) {
      const pip = document.createElement('span');
      pip.className = `ammo-pip${i >= ammo ? ' empty' : ''}`;
      ui.ammoPips.appendChild(pip);
    }
    ui.score.textContent = String(score).padStart(4, '0');
    ui.best.textContent = String(highscore);
    ui.kills.textContent = String(kills);
  }
  function random(min, max) { return Math.random() * (max - min) + min; }
  function spawnZombie() {
    const side = Math.floor(Math.random() * 4);
    let x, y;
    if (side === 0) { x = random(-40, WIDTH + 40); y = -ZOMBIE_SIZE; }
    else if (side === 1) { x = WIDTH + ZOMBIE_SIZE; y = random(-40, HEIGHT + 40); }
    else if (side === 2) { x = random(-40, WIDTH + 40); y = HEIGHT + ZOMBIE_SIZE; }
    else { x = -ZOMBIE_SIZE; y = random(-40, HEIGHT + 40); }
    const tough = wave >= 4 && Math.random() < Math.min(.12 + wave * .025, .4);
    zombies.push({
      x, y, angle: 0, speed: random(43, 65) + wave * 2.2, hp: tough ? 2 : 1,
      size: tough ? ZOMBIE_SIZE * 1.18 : ZOMBIE_SIZE, tough, anim: random(0, 15), attack: 0, hitFlash: 0, attackCooldown: 0
    });
  }
  function shoot() {
    if (state !== 'playing' || reloadTimer > 0 || fireTimer > 0) return;
    if (ammo <= 0) { startReload(); return; }
    ammo--;
    fireTimer = 0.42;
    shootFlash = 0.09;
    screenShake = Math.max(screenShake, 4);
    const spread = [-0.105, 0, 0.105];
    for (const spreadAngle of spread) {
      const a = player.angle + spreadAngle + random(-0.018, 0.018);
      const startX = player.x + Math.cos(a) * 32;
      const startY = player.y + Math.sin(a) * 32;
      bullets.push({ x: startX, y: startY, vx: Math.cos(a) * 720, vy: Math.sin(a) * 720, life: 1.25, angle: a, damage: 1 });
    }
    updateHud();
  }
  function startReload() {
    if (state !== 'playing' || reloadTimer > 0 || ammo === MAGAZINE_SIZE) return;
    reloadTimer = 1.25;
    reloadMessageTimer = 1.25;
    pointer.down = false;
  }
  function damagePlayer(amount) {
    if (invulnerabilityTimer > 0 || state !== 'playing') return;
    health = Math.max(0, health - amount);
    invulnerabilityTimer = 0.65;
    screenShake = 10;
    burst(player.x, player.y, '#ff6257', 12);
    updateHud();
    if (health <= 0) endGame();
  }
  function endGame() {
    state = 'gameover';
    pointer.down = false;
    if (score > highscore) { highscore = score; saveHighscore(); }
    ui.finalWave.textContent = String(wave);
    ui.finalScore.textContent = String(score);
    updateHud();
    setOverlay('gameover');
  }
  function burst(x, y, color, amount = 7) {
    for (let i = 0; i < amount; i++) {
      const a = random(0, Math.PI * 2), speed = random(35, 180);
      particles.push({ x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, life: random(.18, .48), maxLife: .48, color, size: random(2, 5) });
    }
  }
  function pointerPosition(event) {
    const rect = canvas.getBoundingClientRect();
    pointer.x = (event.clientX - rect.left) * WIDTH / rect.width;
    pointer.y = (event.clientY - rect.top) * HEIGHT / rect.height;
  }
  function update(dt) {
    if (state !== 'playing') return;
    elapsed += dt;
    fireTimer = Math.max(0, fireTimer - dt);
    invulnerabilityTimer = Math.max(0, invulnerabilityTimer - dt);
    screenShake = Math.max(0, screenShake - dt * 24);
    shootFlash = Math.max(0, shootFlash - dt);
    reloadMessageTimer = Math.max(0, reloadMessageTimer - dt);
    if (reloadTimer > 0) {
      reloadTimer -= dt;
      if (reloadTimer <= 0) { reloadTimer = 0; ammo = MAGAZINE_SIZE; updateHud(); }
    }

    const dx = (keys.has('d') || keys.has('arrowright') ? 1 : 0) - (keys.has('a') || keys.has('arrowleft') ? 1 : 0);
    const dy = (keys.has('s') || keys.has('arrowdown') ? 1 : 0) - (keys.has('w') || keys.has('arrowup') ? 1 : 0);
    player.moving = dx !== 0 || dy !== 0;
    if (player.moving) {
      const len = Math.hypot(dx, dy) || 1;
      player.x += dx / len * 255 * dt;
      player.y += dy / len * 255 * dt;
      player.x = Math.max(PLAYER_SIZE * .48, Math.min(WIDTH - PLAYER_SIZE * .48, player.x));
      player.y = Math.max(PLAYER_SIZE * .48, Math.min(HEIGHT - PLAYER_SIZE * .48, player.y));
      animationTimer += dt;
      if (animationTimer > .055) { moveFrame = (moveFrame + 1) % images.playerMove.length; animationTimer = 0; }
    } else {
      idleFrame = (idleFrame + dt * 8) % images.playerIdle.length;
    }
    player.angle = Math.atan2(pointer.y - player.y, pointer.x - player.x);
    if (pointer.down) shoot();
    if (keys.has('r')) { keys.delete('r'); startReload(); }

    spawnTimer -= dt;
    if (spawnTimer <= 0) {
      spawnZombie();
      const interval = Math.max(.36, 1.65 - (wave - 1) * .105);
      spawnTimer = random(interval * .7, interval * 1.25);
      if (zombies.length < 4 + wave * 2 && Math.random() < Math.min(.15 + wave * .025, .55)) spawnZombie();
    }
    const targetWave = 1 + Math.floor(kills / 10);
    if (targetWave > wave) { wave = targetWave; burst(player.x, player.y, '#b7f34a', 20); updateHud(); }

    for (let i = bullets.length - 1; i >= 0; i--) {
      const b = bullets[i];
      b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
      let hit = false;
      for (let j = zombies.length - 1; j >= 0; j--) {
        const z = zombies[j];
        if (Math.hypot(b.x - z.x, b.y - z.y) < z.size * .36) {
          z.hp -= b.damage; z.hitFlash = .12; burst(b.x, b.y, '#e5f5bd', 3); hit = true;
          if (z.hp <= 0) {
            burst(z.x, z.y, z.tough ? '#c6e66a' : '#86a76a', z.tough ? 15 : 9);
            zombies.splice(j, 1); kills++; score += z.tough ? 25 : 10; updateHud();
          }
          break;
        }
      }
      if (hit || b.life <= 0 || b.x < -30 || b.x > WIDTH + 30 || b.y < -30 || b.y > HEIGHT + 30) bullets.splice(i, 1);
    }

    for (const z of zombies) {
      const vx = player.x - z.x, vy = player.y - z.y;
      const distance = Math.hypot(vx, vy) || 1;
      z.angle = Math.atan2(vy, vx);
      z.anim += dt * (z.attack > 0 ? 10 : 8);
      z.hitFlash = Math.max(0, z.hitFlash - dt);
      z.attackCooldown = Math.max(0, z.attackCooldown - dt);
      if (distance > 55) { z.x += vx / distance * z.speed * dt; z.y += vy / distance * z.speed * dt; z.attack = 0; }
      else {
        z.attack += dt;
        if (z.attack > .6 && z.attackCooldown <= 0) { damagePlayer(z.tough ? 18 : 12); z.attackCooldown = .85; }
      }
    }
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i]; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= Math.pow(.08, dt); p.vy *= Math.pow(.08, dt); p.life -= dt;
      if (p.life <= 0) particles.splice(i, 1);
    }
  }

  function drawBackground() {
    if (images.grass.complete && images.grass.naturalWidth) {
      const tile = 320;
      for (let y = 0; y < HEIGHT; y += tile) {
        for (let x = 0; x < WIDTH; x += tile) ctx.drawImage(images.grass, x, y, tile, tile);
      }
    } else {
      ctx.fillStyle = '#29462b'; ctx.fillRect(0, 0, WIDTH, HEIGHT);
    }
    ctx.fillStyle = '#0a120b20'; ctx.fillRect(0, 0, WIDTH, HEIGHT);
    ctx.save(); ctx.strokeStyle = '#d4f4b009'; ctx.lineWidth = 1;
    for (let x = 0; x < WIDTH; x += 64) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, HEIGHT); ctx.stroke(); }
    for (let y = 0; y < HEIGHT; y += 64) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(WIDTH, y); ctx.stroke(); }
    ctx.restore();
  }
  function drawSprite(image, x, y, width, height, angle, flipY = false) {
    if (!image || !image.complete || !image.naturalWidth) return false;
    ctx.save(); ctx.translate(x, y); ctx.rotate(angle); if (flipY) ctx.scale(1, -1);
    ctx.drawImage(image, -width / 2, -height / 2, width, height); ctx.restore(); return true;
  }
  function drawPlayer() {
    if (!player) return;
    const frames = player.moving ? images.playerMove : images.playerIdle;
    const index = player.moving ? moveFrame : Math.floor(idleFrame) % frames.length;
    let sprite = frames[index];
    if (shootFlash > 0 && images.playerShoot.length) sprite = images.playerShoot[Math.min(2, Math.floor((.09 - shootFlash) / .03))];
    if (invulnerabilityTimer > 0 && Math.floor(invulnerabilityTimer * 18) % 2 === 0) ctx.globalAlpha = .48;
    drawSprite(sprite, player.x, player.y, PLAYER_SIZE * 1.35, PLAYER_SIZE, player.angle);
    ctx.globalAlpha = 1;
    if (shootFlash > 0) {
      const fx = player.x + Math.cos(player.angle) * 67, fy = player.y + Math.sin(player.angle) * 67;
      ctx.save(); ctx.translate(fx, fy); ctx.rotate(player.angle); ctx.fillStyle = '#fff4ac'; ctx.shadowColor = '#ffb24b'; ctx.shadowBlur = 24;
      ctx.beginPath(); ctx.moveTo(0, -7); ctx.lineTo(24, 0); ctx.lineTo(0, 7); ctx.lineTo(5, 0); ctx.closePath(); ctx.fill(); ctx.restore();
    }
  }
  function drawZombies() {
    for (const z of zombies) {
      const frames = z.attack > 0 ? images.zombieAttack : images.zombieMove;
      const image = frames[Math.floor(z.anim) % frames.length];
      if (z.hitFlash > 0) ctx.globalAlpha = .55;
      drawSprite(image, z.x, z.y, z.size * 1.05, z.size * 1.13, z.angle);
      ctx.globalAlpha = 1;
      if (z.tough) {
        ctx.fillStyle = '#121a12'; ctx.fillRect(z.x - 25, z.y - z.size * .65, 50, 5);
        ctx.fillStyle = '#c6e66a'; ctx.fillRect(z.x - 25, z.y - z.size * .65, 50 * Math.max(0, z.hp / 2), 5);
      }
    }
  }
  function drawBullets() {
    for (const b of bullets) {
      if (!drawSprite(images.bullet, b.x, b.y, 18, 5, b.angle)) {
        ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.angle); ctx.fillStyle = '#fff3ad'; ctx.fillRect(-8, -2, 16, 4); ctx.restore();
      }
    }
  }
  function drawParticles() {
    for (const p of particles) {
      ctx.globalAlpha = Math.max(0, p.life / p.maxLife); ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  function drawVignette() {
    const gradient = ctx.createRadialGradient(WIDTH / 2, HEIGHT / 2, 180, WIDTH / 2, HEIGHT / 2, 740);
    gradient.addColorStop(0, 'transparent'); gradient.addColorStop(1, '#050a06a8');
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, WIDTH, HEIGHT);
  }
  function drawCrosshair() {
    if (state !== 'playing') return;
    if (images.crosshair.complete && images.crosshair.naturalWidth) ctx.drawImage(images.crosshair, pointer.x - 17, pointer.y - 17, 34, 34);
    else {
      ctx.strokeStyle = '#c7ff69'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(pointer.x, pointer.y, 10, 0, Math.PI * 2); ctx.moveTo(pointer.x - 16, pointer.y); ctx.lineTo(pointer.x - 5, pointer.y); ctx.moveTo(pointer.x + 5, pointer.y); ctx.lineTo(pointer.x + 16, pointer.y); ctx.moveTo(pointer.x, pointer.y - 16); ctx.lineTo(pointer.x, pointer.y - 5); ctx.moveTo(pointer.x, pointer.y + 5); ctx.lineTo(pointer.x, pointer.y + 16); ctx.stroke();
    }
  }
  function drawCanvasMessage(text, y, color = '#e8f0e5') {
    ctx.save(); ctx.font = '800 18px Inter, sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = color; ctx.shadowColor = '#000'; ctx.shadowBlur = 8; ctx.fillText(text, WIDTH / 2, y); ctx.restore();
  }
  function render() {
    ctx.save();
    if (screenShake > 0) ctx.translate(random(-screenShake, screenShake), random(-screenShake, screenShake));
    drawBackground();
    drawZombies(); drawBullets(); drawParticles(); drawPlayer(); drawVignette(); drawCrosshair();
    if (state === 'playing' && reloadMessageTimer > 0) drawCanvasMessage('LADER OM…', HEIGHT - 36, '#d3ff8b');
    if (state === 'menu') drawCanvasMessage('TRYKK START FOR Å BEGYNNE', HEIGHT - 32, '#d3ff8b');
    ctx.restore();
  }
  function frame(timestamp) {
    const dt = Math.min((timestamp - (lastTime || timestamp)) / 1000, .033);
    lastTime = timestamp;
    update(dt);
    render();
    requestAnimationFrame(frame);
  }

  ui.start.addEventListener('click', resetGame);
  ui.restart.addEventListener('click', resetGame);
  ui.resume.addEventListener('click', () => { if (state === 'paused') state = 'playing'; setOverlay('none'); });
  canvas.addEventListener('pointermove', pointerPosition);
  canvas.addEventListener('pointerdown', event => {
    pointerPosition(event);
    if (event.button === 0 && state === 'playing') { pointer.down = true; shoot(); }
  });
  window.addEventListener('pointerup', event => { if (event.button === 0) pointer.down = false; });
  canvas.addEventListener('contextmenu', event => event.preventDefault());
  window.addEventListener('keydown', event => {
    const key = event.key.toLowerCase();
    if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(key)) event.preventDefault();
    if (key === 'escape') {
      if (state === 'playing') { state = 'paused'; pointer.down = false; setOverlay('pause'); }
      else if (state === 'paused') { state = 'playing'; setOverlay('none'); }
      return;
    }
    if (key === 'r' && state === 'playing' && !event.repeat) { startReload(); return; }
    if (state === 'playing') keys.add(key);
    if ((state === 'menu' || state === 'gameover') && key === 'enter') resetGame();
  });
  window.addEventListener('keyup', event => keys.delete(event.key.toLowerCase()));
  window.addEventListener('blur', () => { keys.clear(); pointer.down = false; if (state === 'playing') { state = 'paused'; setOverlay('pause'); } });
  document.addEventListener('visibilitychange', () => { if (document.hidden && state === 'playing') { state = 'paused'; pointer.down = false; setOverlay('pause'); } });

  ui.best.textContent = String(highscore);
  updateHud();
  setOverlay('menu');
  requestAnimationFrame(frame);
})();
