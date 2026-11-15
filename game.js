"use strict";

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const T = 40;
const W = 80;
const H = 80;
const RES = {
  GRASS: 0, TREE: 1, ROCK: 2, BUSH: 3, WATER: 4
};

const G = {
  state: "TITLE",
  time: 0,
  worldT: 0,
  tiles: new Uint8Array(W * H),
  egg: null, player: null, cam: { x: 0, y: 0, shx: 0, shy: 0, shake: 0 },
  trees: [], rocks: [], bushes: [],
  sticks: [], stickTimer: 0, stickTarget: 45,
  structures: [], wallMap: new Map(),
  enemies: [], particles: [], floats: [], fires: [],
  wood: 6, stone: 0, berries: 4,
  axeLevel: 1,
  clockS: 0.0, day: 1,
  cycleLen: 360,
  spawnT: 0,
  msgTimer: 0,
  buildIdx: -1,
  hoveredTile: null,
  timeScale: 1,
  ac: null, ambWind: null, ambNight: null,
  madeAxeSnd: false,
  startMsgDone: false,
  deathInfo: ""
};

const keys = {};
let mouse = { x: 0, y: 0 };

function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function h3(x, y) {
  let v = (x * 374761393 + y * 668265263) | 0;
  v = (v ^ (v >>> 13)) * 1274126177;
  return ((v ^ (v >>> 16)) >>> 0) / 4294967296;
}

const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const dist2 = (ax, ay, bx, by) => { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; };
const angDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

function tileAt(tx, ty) {
  if (tx < 0 || ty < 0 || tx >= W || ty >= H) return RES.WATER;
  return G.tiles[ty * W + tx];
}

function solidTile(tx, ty) {
  const t = tileAt(tx, ty);
  if (t === RES.TREE || t === RES.ROCK || t === RES.WATER) return true;
  return G.wallMap.has(ty * W + tx);
}

function blocked(cx, cy, r) {
  const x0 = Math.floor((cx - r) / T), x1 = Math.floor((cx + r) / T);
  const y0 = Math.floor((cy - r) / T), y1 = Math.floor((cy + r) / T);
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      if (solidTile(tx, ty)) return true;
    }
  }
  return false;
}

function resolveMove(cx, cy, r, dx, dy) {
  let nx = cx + dx;
  let hitX = false, hitY = false;
  for (const [ox, oy] of [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r], [r, r], [r, -r], [-r, r], [-r, -r]]) {
    if (worldBlocked(nx + ox, cy + oy)) { hitX = true; break; }
  }
  let ny = cy + dy;
  for (const [ox, oy] of [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r], [r, r], [r, -r], [-r, r], [-r, -r]]) {
    if (worldBlocked(nx + ox, ny + oy)) { hitY = true; break; }
  }
  return [hitX ? cx : nx, hitY ? cy : ny];
}

function worldBlocked(px, py) {
  if (px < 0 || py < 0 || px >= W * T || py >= H * T) return true;
  const tx = Math.floor(px / T), ty = Math.floor(py / T);
  return solidTile(tx, ty);
}

function genWorld(seed) {
  const rng = mulberry32(seed);
  for (let i = 0; i < W * H; i++) G.tiles[i] = RES.GRASS;

  const lakeCx = 10 + rng() * 6, lakeCy = 8 + rng() * 5;
  const lakeR = 5 + rng() * 3;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const d = Math.sqrt((x - lakeCx) ** 2 + (y - lakeCy) ** 2) + rng() * 1.6 - 0.8;
      if (d < lakeR && !inSpawn(x, y)) G.tiles[y * W + x] = RES.WATER;
    }
  }

  function inSpawn(x, y) {
    const sx = 9, sy = 10;
    return Math.abs(x - sx) < 4 && Math.abs(y - sy) < 4;
  }

  function scatter(ptype, pct, clumpMin, clumpMax) {
    const target = Math.floor(W * H * pct);
    let placed = 0, guard = 0;
    while (placed < target && guard++ < 4000) {
      const stx = (rng() * W) | 0, sty = (rng() * H) | 0;
      if (G.tiles[sty * W + stx] !== RES.GRASS || inSpawn(stx, sty)) continue;
      let cx = stx, cy = sty;
      const n = clumpMin + ((rng() * (clumpMax - clumpMin)) | 0);
      for (let i = 0; i < n; i++) {
        if (rng() < 0.5) cx += rng() < 0.5 ? -1 : 1;
        else cy += rng() < 0.5 ? -1 : 1;
        cx = cx < 0 ? 0 : cx >= W ? W - 1 : cx;
        cy = cy < 0 ? 0 : cy >= H ? H - 1 : cy;
        const idx = cy * W + cx;
        if (G.tiles[idx] === RES.GRASS && !inSpawn(cx, cy)) {
          G.tiles[idx] = ptype;
          placed++;
          if (placed >= target) break;
        }
      }
    }
  }

  scatter(RES.BUSH, 0.02, 3, 7);
  scatter(RES.ROCK, 0.07, 6, 16);
  scatter(RES.TREE, 0.15, 15, 45);

  G.trees = []; G.rocks = []; G.bushes = []; G.sticks = [];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const t = G.tiles[y * W + x];
      const px = x * T + T / 2, py = y * T + T / 2;
      if (t === RES.TREE) G.trees.push({ tx: x, ty: y, x: px, y: py, hp: 4, phase: (h3(x, y) * 6.28), scale: 0.85 + h3(x, y + 7) * 0.4 });
      else if (t === RES.ROCK) G.rocks.push({ tx: x, ty: y, x: px, y: py, hp: 6, phase: h3(x + 3, y) * 6.28 });
      else if (t === RES.BUSH) G.bushes.push({ tx: x, ty: y, x: px, y: py, hp: 1, regrow: true });
    }
  }

  for (let i = 0; i < 70; i++) {
    const tx = (rng() * W) | 0, ty = (rng() * H) | 0;
    if (G.tiles[ty * W + tx] !== RES.GRASS) continue;
    G.sticks.push({
      x: tx * T + T / 2 + (rng() - 0.5) * 18,
      y: ty * T + T / 2 + (rng() - 0.5) * 18,
      ph: rng() * 6.28
    });
  }

  G.egg = { x: 9 * T + T / 2, y: 10 * T + T / 2 };
}

function initGame() {
  genWorld((Date.now() % 100000) ^ (Math.random() * 100000));
  G.player = {
    x: G.egg.x, y: G.egg.y, r: 10,
    vx: 0, vy: 0,
    hp: 100, hunger: 100, thirst: 100, stamina: 100,
    facing: -Math.PI / 2,
    aim: 0,
    swingCd: 0, invuln: 0,
    stepDist: 0, anim: 0
  };
  G.cam.x = G.player.x; G.cam.y = G.player.y;
  G.structures = []; G.wallMap.clear(); G.fires = [];
  G.enemies = []; G.particles = []; G.floats = [];
  G.wood = 6; G.stone = 0; G.berries = 4; G.axeLevel = 1;
  G.clockS = 0.30 * G.cycleLen;
  G.day = 1;
  G.spawnT = 3;
  G.buildIdx = -1;
  G.time = 0;
  updateToolbar();
}

function timeOfDayRatio() {
  return (G.clockS % G.cycleLen) / G.cycleLen;
}

function hourOfDay() {
  const h = ((((timeOfDayRatio() - 0.7) % 1) + 1) % 1) * 24;
  return h;
}

function sunFactor() {
  const t = timeOfDayRatio();
  const s = Math.sin((t - 0.10) * Math.PI * 2 / 0.80);
  return clamp(s, 0, 1);
}

function nightFactor() {
  const t = timeOfDayRatio();
  const s = Math.sin((t - 0.10) * Math.PI * 2 / 0.80);
  return clamp(-s, 0, 1) * 0.6 + Math.max(0, Math.sin(t * Math.PI * 2 * 3)) * 0.0;
}

function drawSky(t, dt) {
  const sun = sunFactor();
  const night = nightFactor();
  const w = canvas.width / dpr, h = canvas.height / dpr;
  const cx = G.cam.x + w / 2, cy = G.cam.y + h / 2;
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, mix(rgbStr(12, 16, 26), rgbStr(255, 168, 92), sun * 0.4));
  g.addColorStop(1, mix(rgbStr(5, 7, 14), rgbStr(58, 118, 74), sun * 0.35));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

function rgbStr(r, g, b) { return "rgb(" + r + "," + g + "," + b + ")"; }
function mix(a, b, t) {
  const c1 = a.match(/\d+/g).map(Number);
  const c2 = b.match(/\d+/g).map(Number);
  return "rgb(" + Math.round(c1[0] + (c2[0] - c1[0]) * t) + "," +
    Math.round(c1[1] + (c2[1] - c1[1]) * t) + "," +
    Math.round(c1[2] + (c2[2] - c1[2]) * t) + ")";
}

function msg(s) {
  G.floatMsg = s;
  G.msgTimer = 3.5;
}

function addFloat(x, y, text, color, size) {
  G.floats.push({ x, y, text, color: color || "#fff", size: size || 13, life: 1.4, max: 1.4, vy: -34 });
}

function addP(pt) {
  if (G.particles.length > 520) G.particles.shift();
  G.particles.push(pt);
}

function burst(x, y, color, n, sp, type, size) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * 6.28, s = sp * (0.4 + Math.random() * 0.9);
    addP({
      x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
      life: 0.5 + Math.random() * 0.7, max: 1.2,
      size: (size || 3) * (0.6 + Math.random() * 0.8),
      color, type: type || 0, tw: Math.random() * 6.28
    });
  }
}

function addShake(v) { G.cam.shake = Math.min(14, G.cam.shake + v); }

function updateTweaks(dt) {
  G.cam.shake *= Math.exp(-6 * dt);
  if (G.cam.shake < 0.05) G.cam.shake = 0;
  for (let i = G.floats.length - 1; i >= 0; i--) {
    const f = G.floats[i];
    f.life -= dt;
    f.y += f.vy * dt;
    f.vy *= Math.exp(-2 * dt);
    if (f.life <= 0) G.floats.splice(i, 1);
  }
  for (let i = G.particles.length - 1; i >= 0; i--) {
    const p = G.particles[i];
    p.life -= dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    if (p.type === 2) p.vy -= 40 * dt;
    else p.vy += 220 * dt;
    p.vx *= Math.exp(-1.6 * dt);
    if (p.life <= 0) G.particles.splice(i, 1);
  }
}

function updateDayNight(dt) {
  G.clockS += dt;
  const prev = timeOfDayRatio();
  G.worldT += dt;
  if (timeOfDayRatio() < prev) {
    G.day++;
    msg("Day " + G.day + " - the forest stirs");
  }
  const night = nightFactor();
  const sun = sunFactor();
  if (!G.startMsgDone) {
    G.startMsgDone = true;
    msg("Survive the night. Build a fire.");
  }
  if (night > 0.35 && G.msgTimer <= 0) {
    G.msgTimer = 4;
    msg("Night " + G.day + " - they are coming");
  }
  updateClockDom();
  updateAmbient(dt, night, sun);
}

function clockLabel() {
  const h = hourOfDay();
  const hh = Math.floor(h);
  const mm = Math.floor((h - hh) * 60);
  const period = hh < 12 ? "AM" : "PM";
  const h12 = hh % 12 === 0 ? 12 : hh % 12;
  const mmp = mm < 10 ? "0" + mm : mm;
  return h12 + ":" + mmp + " " + period;
}

const elClock = document.getElementById("clock");
const elDay = document.getElementById("dayLabel");
const elBars = { health: document.getElementById("bHealth"), hunger: document.getElementById("bHunger"), thirst: document.getElementById("bThirst"), stamina: document.getElementById("bStamina") };
const elInv = { wood: document.getElementById("iWood"), stone: document.getElementById("iStone"), berry: document.getElementById("iBerry") };

function updateClockDom() {
  elClock.textContent = clockLabel() + "  -  Day " + G.day;
}

function updateVitals() {
  const q = (id, v) => { elBars[id].style.width = clamp(v, 0, 100) + "%"; };
  q("health", G.player.hp);
  q("hunger", G.player.hunger);
  q("thirst", G.player.thirst);
  q("stamina", G.player.stamina);
}

function updateInvDom() {
  elInv.wood.textContent = G.wood;
  elInv.stone.textContent = G.stone;
  elInv.berry.textContent = G.berries;
}

function updatePlayer(dt) {
  const p = G.player;
  let mx = (keys["KeyA"] ? -1 : 0) + (keys["KeyD"] ? 1 : 0);
  let my = (keys["KeyW"] ? -1 : 0) + (keys["KeyS"] ? 1 : 0);
  let spd = 112;
  const sprint = keys["ShiftLeft"] || keys["ShiftRight"];
  if (sprint && p.stamina > 1 && (Math.abs(mx) + Math.abs(my)) > 0) {
    spd = 190;
    p.stamina = Math.max(0, p.stamina - 14 * dt);
  } else {
    p.stamina = Math.min(100, p.stamina + 7 * dt);
  }
  const moving = Math.abs(mx) + Math.abs(my) > 0;
  p.moving = moving;
  let nx = mx, ny = my;
  if (moving) { const ml = Math.hypot(mx, my); nx = mx / ml; ny = my / ml; }
  const damp = Math.exp(-10 * dt);
  p.vx = p.vx * damp + nx * spd * (1 - damp);
  p.vy = p.vy * damp + ny * spd * (1 - damp);
  if (!moving) { p.vx *= Math.exp(-7 * dt); p.vy *= Math.exp(-7 * dt); }

  const moved = resolveMove(p.x, p.y, p.r, p.vx * dt, p.vy * dt);
  p.x = moved[0]; p.y = moved[1];

  p.stepDist += Math.hypot(p.vx, p.vy) * dt;
  if (p.stepDist > 34 && moving) {
    p.stepDist = 0;
    sndFootstep();
  }

  p.swingCd = Math.max(0, p.swingCd - dt);
  p.invuln = Math.max(0, p.invuln - dt);

  p.facing = lerpAngle(p.facing, p.aim, Math.min(1, 14 * dt));

  p.hunger = Math.max(0, p.hunger - 0.20 * dt);
  p.thirst = Math.max(0, p.thirst - 0.28 * dt);
  if (p.hunger <= 0 || p.thirst <= 0) {
    p.hp = Math.max(0, p.hp - 2.4 * dt);
  } else if (p.hunger > 55 && p.thirst > 55) {
    p.hp = Math.min(100, p.hp + 0.5 * dt);
  }
  if (p.hp <= 0) { die(); return; }

  p.anim += dt * (moving ? 9 : 4);
}

function lerpAngle(a, b, t) {
  let d = angDiff(a, b);
  return a + d * t;
}

function eatBerries() {
  if (G.state !== "PLAY") return;
  const p = G.player;
  if (G.berries <= 0) {
    flashMsg("No berries!");
    return;
  }
  if (p.hunger >= 95) { flashMsg("Not hungry"); return; }
  G.berries--;
  p.hunger = Math.min(100, p.hunger + 28);
  p.hp = Math.min(100, p.hp + 5);
  sndEat();
  addFloat(p.x, p.y - 20, "+Hunger", "#a8d84a", 13);
  burst(p.x, p.y - 6, "#c8324a", 6, 30, 2);
  updateInvDom();
}

function drink() {
  if (G.state !== "PLAY") return;
  const p = G.player;
  if (p.thirst >= 95) { flashMsg("Not thirsty"); return; }
  let nearWater = false;
  for (let ty = -2; ty <= 2; ty++) {
    for (let tx = -2; tx <= 2; tx++) {
      if (tileAt(Math.floor(p.x / T) + tx, Math.floor(p.y / T) + ty) === RES.WATER) {
        if (dist2(p.x, p.y, (Math.floor(p.x / T) + tx) * T + T / 2, (Math.floor(p.y / T) + ty) * T + T / 2) < 75 * 75) nearWater = true;
      }
    }
  }
  if (!nearWater) { flashMsg("Find water to drink"); return; }
  p.thirst = Math.min(100, p.thirst + 45);
  sndDrink();
  addFloat(p.x, p.y - 20, "+Thirst", "#46b8ff", 13);
  burst(p.x, p.y - 4, "#46b8ff", 8, 26, 2);
}

function flashMsg(s) {
  G.msgTimer = Math.max(G.msgTimer, 1.6);
  G.floatMsg = s;
}

function die() {
  G.state = "DEAD";
  const mins = Math.floor(G.clockS / 60);
  const secs = Math.floor(G.clockS % 60);
  G.deathInfo = "You fell on Day " + G.day + " after surviving " + mins + "m " + secs + "s.";
  document.getElementById("deathInfo").textContent = G.deathInfo;
  document.getElementById("death").classList.remove("hidden");
  document.getElementById("hud").classList.add("hidden");
  document.getElementById("toolbar").classList.add("hidden");
  sndDeath();
}

function swing() {
  if (G.state !== "PLAY") return;
  const p = G.player;
  if (p.swingCd > 0) return;
  p.swingCd = 0.30;
  const range = 68;
  p.anim += 1.5;

  let hit = false;
  const hitAngle = p.aim;
  const check = (obj, hpNow) => {
    const d = Math.hypot(obj.x - p.x, obj.y - p.y);
    if (d < range + T * 0.4) {
      let da = angDiff(Math.atan2(obj.y - p.y, obj.x - p.x), hitAngle);
      if (Math.abs(da) < 1.15) {
        hit = true;
        return true;
      }
    }
    return false;
  };

  for (const b of G.bushes) {
    if (b.hp > 0 && check(b, b.hp)) {
      b.hp--;
      burst(b.x, b.y, "#a04c22", 4, 60, 0, 4);
      if (b.hp <= 0) {
        G.berries += 3;
        addFloat(b.x, b.y - 18, "+3 Berries", "#e85b75", 13);
        burst(b.x, b.y, "#c8324a", 14, 80, 2, 4);
        G.tiles[b.ty * W + b.tx] = RES.GRASS;
        sndPickup();
        updateInvDom();
      } else sndChop();
    }
  }
  for (const r of G.rocks) {
    if (r.hp > 0 && check(r, r.hp)) {
      r.hp -= G.axeLevel;
      burst(r.x, r.y, "#9aa3ad", 7, 90, 0, 3);
      sndThud();
      addShake(2);
      if (r.hp <= 0) {
        G.stone += 3;
        addFloat(r.x, r.y - 18, "+3 Stone", "#c3ccd6", 13);
        G.tiles[r.ty * W + r.tx] = RES.GRASS;
        burst(r.x, r.y, "#9aa3ad", 16, 120, 0, 4);
        sndThud();
        updateInvDom();
      }
    }
  }
  for (const t of G.trees) {
    if (t.hp > 0 && check(t, t.hp)) {
      t.hp -= G.axeLevel;
      burst(t.x + (Math.random() - 0.5) * 16, t.y + Math.random() * 18, "#5f9533", 8, 90, 1, 5);
      sndChop();
      addShake(2.5);
      if (t.hp <= 0) {
        G.wood += 2;
        addFloat(t.x, t.y - 22, "+2 Wood", "#d8a26a", 14);
        addP({ x: t.x, y: t.y, vx: 0, vy: -150, life: 0.7, max: 0.7, size: 12, color: "#8a5a2b", type: 3 });
        G.tiles[t.ty * W + t.tx] = RES.GRASS;
        burst(t.x, t.y, "#5f9533", 26, 150, 1, 5);
        burst(t.x, t.y, "#8a5a2b", 10, 110, 0, 4);
        addShake(5);
        sndTreeDown();
        updateInvDom();
      }
      break;
    }
  }

  let hitEnemy = false;
  for (const e of G.enemies) {
    if (e.dying) continue;
    const d = Math.hypot(e.x - p.x, e.y - p.y);
    if (d < range + e.r) {
      let da = angDiff(Math.atan2(e.y - p.y, e.x - p.x), hitAngle);
      if (Math.abs(da) < 1.15) {
        hitEnemy = true;
        e.hp--;
        e.knockx = Math.cos(hitAngle) * 130;
        e.knocky = Math.sin(hitAngle) * 130;
        burst(e.x, e.y, "#ff5959", 8, 90, 2, 3);
        if (e.hp <= 0) { e.dying = true; e.dieT = 0.6; }
        else sndHit();
      }
    }
  }
  if (hitEnemy) { addShake(3); }

  if (!hit && !hitEnemy) sndSwing();
}

function updateSticks(dt) {
  const p = G.player;
  for (let i = G.sticks.length - 1; i >= 0; i--) {
    const s = G.sticks[i];
    if (dist2(p.x, p.y, s.x, s.y) < 32 * 32) {
      G.sticks.splice(i, 1);
      G.wood += 1;
      addFloat(s.x, s.y - 14, "+1 Wood", "#d8a26a", 11);
      sndPickup();
      updateInvDom();
    }
  }
  G.stickTimer -= dt;
  if (G.stickTimer <= 0 && G.sticks.length < G.stickTarget) {
    G.stickTimer = 25;
    for (let tries = 0; tries < 60; tries++) {
      const tx = (Math.random() * W) | 0, ty = (Math.random() * H) | 0;
      if (G.tiles[ty * W + tx] === RES.GRASS) {
        G.sticks.push({
          x: tx * T + T / 2 + (Math.random() - 0.5) * 18,
          y: ty * T + T / 2 + (Math.random() - 0.5) * 18,
          ph: Math.random() * 6.28
        });
        break;
      }
    }
  }
}

function updateEnemies(dt) {
  const night = nightFactor();
  const dayk = 1 - night / 0.8;
  const p = G.player;

  if (night > 0.45) {
    G.spawnT -= dt;
    const cap = Math.min(3 + G.day, 13);
    if (G.spawnT <= 0 && G.enemies.length < cap) {
      G.spawnT = Math.max(2.5, 7 - G.day * 0.6);
      spawnEnemy();
    }
  }

  for (let i = G.enemies.length - 1; i >= 0; i--) {
    const e = G.enemies[i];
    if (e.dying) {
      e.dieT -= dt;
      e.vy += 200 * dt;
      e.x += e.knockx * dt;
      e.y += e.knocky * dt;
      e.knockx *= Math.exp(-4 * dt); e.knocky *= Math.exp(-4 * dt);
      if (e.dieT <= 0) {
        burst(e.x, e.y, "#2a2f3a", 12, 70, 1, 5);
        G.enemies.splice(i, 1);
      }
      continue;
    }

    e.phase += dt * 6;
    if (dayk > 0.55 && G.state === "PLAY") {
      e.alpha = Math.max(0, e.alpha - dt * 1.2);
      if (e.alpha <= 0) { G.enemies.splice(i, 1); continue; }
    } else {
      e.alpha = Math.min(1, e.alpha + dt * 2);
    }

    if (dayk < 0.65) {
      const d = Math.hypot(p.x - e.x, p.y - e.y);
      let tx = (p.x - e.x) / (d || 1);
      let ty = (p.y - e.y) / (d || 1);
      let spd = e.spd;
      for (const f of G.fires) {
        if (!f.lit) continue;
        const fd = Math.hypot(e.x - f.x, e.y - f.y);
        if (fd < f.avoidR) {
          const r = (f.avoidR - fd) / f.avoidR;
          tx += (e.x - f.x) / (fd || 1) * r * 2.2;
          ty += (e.y - f.y) / (fd || 1) * r * 2.2;
          spd *= 0.55;
        }
      }
      const tl = Math.hypot(tx, ty) || 1;
      tx /= tl; ty /= tl;
      const mv = resolveMove(e.x, e.y, e.r, tx * spd * dt, ty * spd * dt);
      const ox = mv[0], oy2 = mv[1];
      e.vx = lerp(e.vx, (ox - e.x) / dt, 0.2);
      e.vy = lerp(e.vy, (oy2 - e.y) / dt, 0.2);
      e.x = ox; e.y = oy2;

      if (dist2(e.x, e.y, p.x, p.y) < (e.r + p.r) * (e.r + p.r)) {
        e.attackT = (e.attackT || 0) - dt;
        if (e.attackT <= 0) {
          e.attackT = 1.0;
          if (p.invuln <= 0) {
            p.invuln = 0.7;
            p.hp = Math.max(0, p.hp - (7 + G.day * 2));
            addShake(2.5 + G.day * 0.3);
            sndHurt();
            burst(p.x, p.y, "#ff4040", 10, 110, 2, 4);
            updateVitals();
            if (p.hp <= 0) { die(); }
          }
        }
      }
    }
  }
}

function spawnEnemy() {
  const p = G.player;
  for (let tries = 0; tries < 40; tries++) {
    const a = Math.random() * 6.28;
    const d = 16 + Math.random() * 8;
    const x = clamp(p.x + Math.cos(a) * d * T, T, (W - 1) * T);
    const y = clamp(p.y + Math.sin(a) * d * T, T, (H - 1) * T);
    if (tileAt(Math.floor(x / T), Math.floor(y / T)) === RES.GRASS && !solidTile(Math.floor(x / T), Math.floor(y / T))) {
      G.enemies.push({
        x, y, r: 13, hp: 2, spd: 58 + Math.min(30, G.day * 2.5),
        phase: Math.random() * 6.28, alpha: 0,
        knockx: 0, knocky: 0, vx: 0, vy: 0, attackT: 0, dying: false, dieT: 0, born: 0
      });
      break;
    }
  }
}

function updateStructures(dt) {
  const p = G.player;
  let nearestFire = null, nd = Infinity;
  for (const f of G.fires) {
    if (f.lit && f.fuel !== Infinity) {
      f.fuel -= dt;
      if (f.fuel <= 0) {
        f.lit = false;
        addFloat(f.x, f.y - 26, "Fire out!", "#9a9a9a", 13);
        burst(f.x, f.y, "#555", 10, 40, 1, 6);
      }
    }
    const dd = dist2(p.x, p.y, f.x, f.y);
    if (dd < nd) { nd = dd; nearestFire = f; }
  }
  fireCrackleLevel = nd < Infinity ? Math.max(0, 1 - Math.sqrt(nd) / 480) : 0;
}

let fireCrackleLevel = 0;

function updateAmbient(dt, night, sun) {
  if (!G.ac) return;
  if (G.ambWind) {
    G.ambWind.gain.value = lerp(G.ambWind.gain.value, 0.05 + night * 0.05 + Math.sin(G.worldT * 0.5) * 0.03, dt * 0.5);
  }
  if (G.ambNight) {
    G.ambNight.gain.value = lerp(G.ambNight.gain.value, night * 0.06, dt);
  }
  if (fireCrackleLevel > 0.06 && Math.random() < fireCrackleLevel * 0.25) {
    sndCrackle();
  }
  birdTimer -= dt;
  if (birdTimer <= 0 && sun > 0.5) {
    birdTimer = 6 + Math.random() * 14;
    sndBird();
  }
}
let birdTimer = 8;

function updateBuildGhost() {
  const pt = screenToWorld(mouse.x, mouse.y);
  G.hoveredTile = { tx: Math.floor(pt.x / T), ty: Math.floor(pt.y / T) };
}

function canAfford(buildId) {
  if (buildId === "campfire") return G.wood >= 8;
  if (buildId === "wall") return G.wood >= 4;
  if (buildId === "torch") return G.wood >= 2;
  if (buildId === "axe") return G.wood >= 10 && G.stone >= 5;
  return false;
}

function placeBlock(tx, ty) {
  if (G.state !== "PLAY") return;
  const p = G.player;
  const px = tx * T + T / 2, py = ty * T + T / 2;
  const d = Math.hypot(px - p.x, py - p.y);
  if (d > T * 4.2) { flashMsg("Too far"); return; }
  if (tx < 0 || ty < 0 || tx >= W || ty >= H) return;
  const t = G.tiles[ty * W + tx];
  if (t !== RES.GRASS) { flashMsg("Clear ground needed"); return; }
  if (solidTile(tx, ty)) { flashMsg("Blocked"); return; }
  for (const s of G.structures) {
    if (Math.floor(s.x / T) === tx && Math.floor(s.y / T) === ty) { flashMsg("Already occupied"); return; }
  }
  const b = G.buildIdx;
  if (b === 0) {
    if (G.wood < 8) { flashMsg("Need 8 wood"); return; }
    G.wood -= 8;
    G.fires.push({ x: px, y: py, lit: true, fuel: 200, phase: Math.random() * 6.28, avoidR: 260 });
    G.structures.push({ type: "campfire", x: px, y: py });
  } else if (b === 1) {
    if (G.wood < 4) { flashMsg("Need 4 wood"); return; }
    G.wood -= 4;
    G.structures.push({ type: "wall", x: px, y: py });
    G.wallMap.set(ty * W + tx, true);
  } else if (b === 2) {
    if (G.wood < 2) { flashMsg("Need 2 wood"); return; }
    G.wood -= 2;
    G.structures.push({ type: "torch", x: px, y: py });
    G.fires.push({ x: px, y: py, lit: true, fuel: Infinity, phase: Math.random() * 6.28, avoidR: 130 });
  } else if (b === 3) {
    if (G.wood < 10 || G.stone < 5) { flashMsg("Need 10 wood + 5 stone"); return; }
    G.wood -= 10; G.stone -= 5;
    G.axeLevel = 2;
    addFloat(p.x, p.y - 20, "Axe sharpened!", "#ffd23b", 14);
    setBuild(-1);
  }
  if (b !== 3) {
    sndPlace();
    burst(px, py, "#d8b98a", 10, 80, 0, 4);
  }
  updateInvDom();
}

function demolishAt(tx, ty) {
  const px = tx * T + T / 2, py = ty * T + T / 2;
  const p = G.player;
  if (Math.hypot(px - p.x, py - p.y) > T * 3.2) return;
  for (let i = G.structures.length - 1; i >= 0; i--) {
    const s = G.structures[i];
    if (Math.floor(s.x / T) === tx && Math.floor(s.y / T) === ty) {
      G.structures.splice(i, 1);
      if (s.type === "wall") {
        G.wallMap.delete(ty * W + tx);
        G.wood += 2;
        addFloat(px, py, "+2 Wood", "#d8a26a", 12);
      } else if (s.type === "campfire") {
        G.wood += 4;
        addFloat(px, py, "+4 Wood", "#d8a26a", 12);
      } else if (s.type === "torch") {
        G.wood += 1;
        addFloat(px, py, "+1 Wood", "#d8a26a", 12);
      }
      for (let j = G.fires.length - 1; j >= 0; j--) {
        if (Math.floor(G.fires[j].x / T) === tx && Math.floor(G.fires[j].y / T) === ty) G.fires.splice(j, 1);
      }
      sndPlace();
      burst(px, py, "#d8b98a", 10, 80, 0, 4);
      updateInvDom();
      return;
    }
  }
}

function refuelFire(tx, ty) {
  const px = tx * T + T / 2, py = ty * T + T / 2;
  const p = G.player;
  for (const f of G.fires) {
    if (Math.floor(f.x / T) === tx && Math.floor(f.y / T) === ty) {
      if (G.wood < 2) { flashMsg("Need 2 wood to refuel"); return; }
      G.wood -= 2;
      f.fuel = Math.min(f.fuel + 40, 500);
      f.lit = true;
      sndPlace();
      addFloat(f.x, f.y - 26, "Fire fed", "#ffb84d", 12);
      updateInvDom();
      return;
    }
  }
}

function screenToWorld(cx, cy) {
  const w = canvas.width / dpr, h = canvas.height / dpr;
  return { x: G.cam.x - w / 2 + cx, y: G.cam.y - h / 2 + cy };
}

function aimFromMouse() {
  const pt = screenToWorld(mouse.x, mouse.y);
  mouse.worldX = pt.x;
  mouse.worldY = pt.y;
  G.player.aim = Math.atan2(pt.y - G.player.y, pt.x - G.player.x);
}

function update(dt) {
  dt = Math.min(0.05, dt);
  G.time += dt;
  if (G.msgTimer > 0) G.msgTimer -= dt;

  if (G.state === "PLAY") {
    updatePlayer(dt);
    if (G.state !== "PLAY") return;
    updateDayNight(dt);
    updateStructures(dt);
    updateSticks(dt);
    updateEnemies(dt);
    aimFromMouse();
    updateBuildGhost();
  }
  updateTweaks(dt);
  if (G.state === "PLAY") updateVitals();
  updateCamera(dt);
  updateFpsAvg(dt);
}

function updateCamera(dt) {
  if (!G.player) return;
  const p = G.player;
  const k = 1 - Math.exp(-5 * dt);
  G.cam.x = lerp(G.cam.x, p.x, k);
  G.cam.y = lerp(G.cam.y, p.y, k);
}

let fpsAvg = 60, fpsT = 0;
function updateFpsAvg(dt) {
  fpsT += dt;
  if (fpsT > 1) {
    fpsAvg += (1 / dt - fpsAvg) * (1 - Math.exp(-2));
    fpsT = 0;
  }
}

function drawGround(vp) {
  const x0 = Math.max(0, Math.floor((vp.lx) / T)), x1 = Math.min(W - 1, Math.floor((vp.rx) / T));
  const y0 = Math.max(0, Math.floor((vp.ty) / T)), y1 = Math.min(H - 1, Math.floor((vp.by) / T));
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      const t = G.tiles[ty * W + tx];
      const h = h3(tx, ty);
      if (t === RES.WATER) {
        const a = 0.25 + 0.1 * Math.sin(G.worldT * 2 + tx * 0.8 + ty * 0.5);
        ctx.fillStyle = rgbStr(20 + a * 40, 74 + a * 60, 108 + a * 70);
      } else if (t === RES.GRASS) {
        const v = 30 + h * 20;
        ctx.fillStyle = sunTint(rgbStr(36 + v * 0.4, 74 + v, 34 + v * 0.35));
      } else if (t === RES.TREE) {
        const v = 26 + h * 16;
        ctx.fillStyle = sunTint(rgbStr(24 + v * 0.3, 58 + v, 30 + v * 0.25));
      } else if (t === RES.BUSH) {
        const v = 24 + h * 14;
        ctx.fillStyle = sunTint(rgbStr(26 + v * 0.3, 62 + v, 32 + v * 0.25));
      } else {
        ctx.fillStyle = sunTint(rgbStr(44 + h * 10, 48 + h * 10, 42 + h * 8));
      }
      ctx.fillRect(tx * T, ty * T, T, T);
    }
  }

  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      const t = G.tiles[ty * W + tx];
      const h = h3(tx, ty);
      if (t === RES.GRASS) {
        const sway = Math.sin(G.worldT * 1.5 + h * 50) * 1.5;
        if (h > 0.45) {
          const gx = tx * T + 8 + h * 24, gy = ty * T + 30;
          ctx.strokeStyle = sunTint("rgba(66,116,50,0.55)");
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(gx, gy);
          ctx.quadraticCurveTo(gx + sway, gy - 6, gx + sway * 1.7, gy - 11);
          ctx.stroke();
          if (h > 0.66) {
            ctx.beginPath();
            ctx.moveTo(gx + 3 + h * 4, gy);
            ctx.quadraticCurveTo(gx + 3 + h * 4 + sway, gy - 4, gx + 3 + h * 5 + sway, gy - 8);
            ctx.stroke();
          }
          if (h > 0.86) {
            ctx.beginPath();
            ctx.moveTo(gx - 4 + h * 2, gy - 1);
            ctx.quadraticCurveTo(gx - 4 + h * 2 + sway, gy - 7, gx - 5 + h * 2 + sway, gy - 13);
            ctx.stroke();
          }
        }
        if (h > 0.33 && h < 0.36) {
          flowerDot(tx * T + 12 + h * 16, ty * T + 24, "#ff6b81");
          flowerDot(tx * T + 17 + h * 16, ty * T + 22, "#ff8fa0");
        } else if (h > 0.58 && h < 0.60) {
          flowerDot(tx * T + 24 + h * 8, ty * T + 20, "#ffdf6b");
          flowerDot(tx * T + 29 + h * 8, ty * T + 25, "#fff3b0");
        } else if (h > 0.72 && h < 0.74) {
          flowerDot(tx * T + 10 + h * 12, ty * T + 30, "#e8e8ff");
        } else if (h > 0.90) {
          ctx.fillStyle = sunTint("rgba(140,150,160,0.5)");
          ctx.beginPath(); ctx.arc(tx * T + 28, ty * T + 26, 1.6 + h * 0.6, 0, 6.28); ctx.fill();
          ctx.beginPath(); ctx.arc(tx * T + 32, ty * T + 32, 1.2 + h * 0.5, 0, 6.28); ctx.fill();
        }
      } else if (t === RES.WATER && h > 0.4) {
        const wx = tx * T + h * 34, wy = ty * T + h * 34 + Math.sin(G.worldT * 1.8 + h * 40) * 2;
        ctx.strokeStyle = "rgba(255,255,255,0.10)";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(wx - 8, wy);
        ctx.lineTo(wx + 8, wy);
        ctx.stroke();
      }
    }
  }
}

function flowerDot(x, y, color) {
  ctx.fillStyle = sunTint(color);
  for (let i = 0; i < 5; i++) {
    const a = i / 5 * 6.28;
    ctx.beginPath(); ctx.arc(x + Math.cos(a) * 2.2, y + Math.sin(a) * 2.2, 1.5, 0, 6.28); ctx.fill();
  }
  ctx.fillStyle = sunTint("#b5792a");
  ctx.beginPath(); ctx.arc(x, y, 1.2, 0, 6.28); ctx.fill();
}

function sunTint(col) {
  const sun = sunFactor();
  if (sun < 0.55) return col;
  return col;
}


// --- Emberwood pixel-art rendering helpers ---
function pixelBlock(x, y, w, h, color) {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), Math.max(1, Math.round(w)), Math.max(1, Math.round(h)));
}

function drawGroundTexture(vp) {
  const x0 = Math.max(0, Math.floor(vp.lx / T)), x1 = Math.min(W - 1, Math.floor(vp.rx / T));
  const y0 = Math.max(0, Math.floor(vp.ty / T)), y1 = Math.min(H - 1, Math.floor(vp.by / T));
  for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
    if (tileAt(tx, ty) !== RES.GRASS) continue;
    const h = h3(tx + 31, ty + 17), k = h3(tx + 8, ty + 49);
    const x = tx * T, y = ty * T;
    // Small clustered pixels give the ground a hand-painted, tiled texture.
    if (h > 0.12) pixelBlock(x + 5 + h * 17, y + 7 + k * 18, 3, 2, "rgba(115,132,82,0.22)");
    if (h > 0.34) pixelBlock(x + 23 + k * 9, y + 25 + h * 8, 4, 2, "rgba(18,37,31,0.22)");
    if (h > 0.57) {
      pixelBlock(x + 8 + k * 12, y + 30, 2, 4, "rgba(139,151,91,0.20)");
      pixelBlock(x + 29, y + 8 + h * 13, 2, 3, "rgba(139,151,91,0.16)");
    }
    if (k > 0.91) {
      pixelBlock(x + 13, y + 17, 3, 2, "rgba(194,143,126,0.32)");
      pixelBlock(x + 17, y + 19, 2, 2, "rgba(194,143,126,0.24)");
    }
  }
}

function drawSticks() {
  ctx.lineCap = "round";
  for (const s of G.sticks) {
    const sway = Math.sin(G.worldT * 2 + s.ph) * 0.8;
    ctx.strokeStyle = "#6b4a26";
    ctx.lineWidth = 2.4;
    ctx.beginPath(); ctx.moveTo(s.x - 6 + sway, s.y + 3); ctx.lineTo(s.x + 6 + sway, s.y - 2); ctx.stroke();
    ctx.lineWidth = 1.8;
    ctx.beginPath(); ctx.moveTo(s.x - 2 + sway, s.y - 4); ctx.lineTo(s.x + 4 + sway, s.y + 4); ctx.stroke();
  }
  ctx.lineWidth = 1;
}

function drawBushes() {
  for (const b of G.bushes) {
    if (b.hp <= 0) continue;
    const x = Math.round(b.x), y = Math.round(b.y), sway = Math.sin(G.worldT * 1.3 + h3(b.tx, b.ty) * 6.28) * 1.2;
    // Layered, irregular foliage clusters with dark pixel outlines.
    pixelBlock(x - 13 + sway, y + 1, 26, 10, "#182b29");
    pixelBlock(x - 10 + sway, y - 6, 20, 13, "#263b35");
    pixelBlock(x - 7 + sway, y - 10, 14, 8, "#344b3b");
    pixelBlock(x - 12 + sway, y - 3, 8, 7, "#405a43");
    pixelBlock(x + 3 + sway, y - 7, 8, 7, "#506346");
    pixelBlock(x - 7 + sway, y - 9, 4, 3, "#718052");
    pixelBlock(x + 4 + sway, y - 4, 3, 3, "#758653");
    for (let i = 0; i < 5; i++) {
      const px = x - 8 + i * 4 + (h3(b.tx, i) - 0.5) * 3;
      const py = y - 2 + (i % 2) * 4;
      pixelBlock(px, py, 3, 3, "#b64b70");
      pixelBlock(px, py, 1, 1, "#f39ab0");
    }
  }
}

function drawRocks() {
  for (const r of G.rocks) {
    if (r.hp <= 0) continue;
    const x = Math.round(r.x), y = Math.round(r.y);
    pixelBlock(x - 14, y + 5, 29, 10, "rgba(4,9,14,0.34)");
    pixelBlock(x - 12, y - 2, 24, 12, "#343d4a");
    pixelBlock(x - 9, y - 8, 18, 13, "#596574");
    pixelBlock(x - 5, y - 12, 11, 8, "#778493");
    pixelBlock(x - 7, y - 8, 7, 4, "#a0a8ad");
    pixelBlock(x + 5, y - 3, 5, 5, "#414d59");
    pixelBlock(x - 10, y + 1, 5, 3, "#89939b");
  }
}

function drawPlayer() {
  const p = G.player;
  ctx.save();
  ctx.translate(Math.round(p.x), Math.round(p.y));
  if (p.invuln > 0 && Math.floor(G.time * 20) % 2 === 0) ctx.globalAlpha = 0.5;
  const bob = p.moving ? Math.round(Math.sin(p.anim * 2) * 1.5) : 0;
  pixelBlock(-8, 7, 16, 5, "rgba(0,0,0,0.34)");
  ctx.rotate(p.facing);
  // Tiny readable adventurer sprite, built from crisp pixel clusters.
  pixelBlock(-5, -5 + bob, 10, 13, "#713f3c");
  pixelBlock(-6, -3 + bob, 12, 7, "#a94e45");
  pixelBlock(-5, -10 + bob, 10, 8, "#d7a06d");
  pixelBlock(-4, -12 + bob, 8, 4, "#54372e");
  pixelBlock(-5, -8 + bob, 3, 3, "#edc18b");
  pixelBlock(2, -8 + bob, 3, 3, "#edc18b");
  pixelBlock(-5, 7 + bob, 4, 4, "#302c39");
  pixelBlock(2, 7 + bob, 4, 4, "#302c39");
  pixelBlock(6, -1 + bob, 4, 8, "#d4b17a");
  pixelBlock(9, -3 + bob, 2, 8, "#8a623e");
  pixelBlock(10, -5 + bob, 5, 3, "#b9c0c1");
  ctx.globalAlpha = 1;
  ctx.restore();
}

function drawTrees() {
  for (const t of G.trees) {
    if (t.hp <= 0) continue;
    const x = Math.round(t.x), y = Math.round(t.y), sc = t.scale;
    const sway = Math.round(Math.sin(G.worldT * 0.8 + t.phase) * 1.2);
    const w = Math.round(25 * sc), h = Math.round(23 * sc);
    // Ground shadow and trunk remain visible beneath the canopy.
    ctx.fillStyle = "rgba(0,0,0,0.32)";
    ctx.beginPath(); ctx.ellipse(x + 3, y + 14, 13 * sc, 5 * sc, 0, 0, 6.28); ctx.fill();
    pixelBlock(x - 3, y - 1, 7, 17, "#49352e");
    pixelBlock(x - 1, y - 4, 4, 12, "#78513a");
    // Three overlapping foliage masses create the chunky canopy silhouette.
    pixelBlock(x - w, y - h + sway, w * 2, h * 1.35, "#182b31");
    pixelBlock(x - w + 3, y - h - 5 + sway, w * 1.65, h, "#263b43");
    pixelBlock(x - w + 7, y - h - 10 + sway, w * 1.1, h * 0.78, "#34494b");
    pixelBlock(x - w + 1, y - h + 2 + sway, w * 0.55, h * 0.58, "#40554b");
    pixelBlock(x + 2, y - h + 1 + sway, w * 0.62, h * 0.55, "#4b604c");
    pixelBlock(x - w + 7, y - h - 8 + sway, 7 * sc, 4 * sc, "#78805a");
    pixelBlock(x + 5, y - h + sway, 6 * sc, 4 * sc, "#687956");
    pixelBlock(x - w + 4, y - h + 9 + sway, 5 * sc, 3 * sc, "#52654e");
    // Scattered leaf highlights, deterministic so they don't flicker.
    for (let i = 0; i < 7; i++) {
      const q = h3(t.tx + i * 13, t.ty + 5);
      const lx = x - w + 4 + q * (w * 1.7);
      const ly = y - h + 2 + h3(t.tx + 2, t.ty + i * 7) * (h * 0.9);
      pixelBlock(lx, ly, 2 + q * 2, 2, q > 0.55 ? "#667653" : "#354b46");
    }
  }
}

function drawStructures() {
  for (const s of G.structures) {
    if (s.type === "campfire") {
      const f = G.fires.find(ff => ff.x === s.x && ff.y === s.y);
      const lit = f && f.lit;
      ctx.fillStyle = "#555";
      for (let i = 0; i < 6; i++) {
        const a = i / 6 * 6.28 + 0.3;
        ctx.beginPath(); ctx.arc(s.x + Math.cos(a) * 11, s.y + Math.sin(a) * 9, 5, 0, 6.28); ctx.fill();
      }
      ctx.fillStyle = "#6d6d6d";
      ctx.beginPath(); ctx.arc(s.x, s.y + 1, 6, 0, 6.28); ctx.fill();
      if (lit) {
        const ph = f.phase + G.time * 11;
        const fl = 0.8 + Math.sin(ph) * 0.2 + Math.sin(ph * 1.7 + 2) * 0.12;
        ctx.fillStyle = "rgba(255,120,20,0.25)";
        ctx.beginPath(); ctx.arc(s.x, s.y - 6, 14 * fl, 0, 6.28); ctx.fill();
        ctx.fillStyle = "#ff7a1a";
        ctx.beginPath(); ctx.ellipse(s.x, s.y - 5, 6 * fl, 10 * fl, 0, 0, 6.28); ctx.fill();
        ctx.fillStyle = "#ffc35a";
        ctx.beginPath(); ctx.ellipse(s.x, s.y - 6, 3.4 * fl, 6 * fl, 0, 0, 6.28); ctx.fill();
        ctx.fillStyle = "#fff3c0";
        ctx.beginPath(); ctx.ellipse(s.x, s.y - 7, 1.6 * fl, 3 * fl, 0, 0, 6.28); ctx.fill();
        if (Math.random() < 0.3) {
          addP({ x: s.x + (Math.random() - 0.5) * 4, y: s.y - 14, vx: (Math.random() - 0.5) * 10, vy: -22 - Math.random() * 18, life: 1.1, max: 1.1, size: 5, color: "rgba(120,120,120,0.4)", type: 3 });
        }
        if (Math.random() < 0.15) {
          addP({ x: s.x + (Math.random() - 0.5) * 8, y: s.y - 4, vx: (Math.random() - 0.5) * 12, vy: -14 - Math.random() * 8, life: 0.5, max: 0.5, size: 1.6, color: "#ffd27a", type: 3 });
        }
      } else {
        ctx.fillStyle = "rgba(120,120,120,0.5)";
        ctx.beginPath(); ctx.arc(s.x, s.y - 5, 4, 0, 6.28); ctx.fill();
      }
    } else if (s.type === "wall") {
      ctx.fillStyle = "#3a2d1c";
      ctx.save();
      ctx.translate(s.x, s.y);
      const wob = Math.sin(G.worldT * 0.7 + s.x) * 0.01;
      ctx.rotate(wob * 0);
      ctx.fillRect(-20, -5, 40, 12);
      ctx.fillStyle = "#574528";
      for (let i = 0; i < 4; i++) {
        const sx = -16 + i * 10;
        ctx.fillRect(sx, -4, 8, 3);
        ctx.fillRect(sx, 2, 8, 3);
      }
      ctx.restore();
    } else if (s.type === "torch") {
      const f = G.fires.find(ff => ff.x === s.x && ff.y === s.y);
      const lit = f && f.lit;
      ctx.strokeStyle = "#5d3c1e";
      ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(s.x, s.y + 12); ctx.lineTo(s.x, s.y - 4); ctx.stroke();
      if (lit) {
        const ph = f.phase + G.time * 10;
        const fl = 0.85 + Math.sin(ph) * 0.18;
        ctx.fillStyle = "#ff8a1a";
        ctx.beginPath(); ctx.ellipse(s.x, s.y - 10, 3.4 * fl, 6 * fl, 0, 0, 6.28); ctx.fill();
        ctx.fillStyle = "#ffd27a";
        ctx.beginPath(); ctx.ellipse(s.x, s.y - 11, 1.8 * fl, 3.6 * fl, 0, 0, 6.28); ctx.fill();
        if (Math.random() < 0.2) {
          addP({ x: s.x, y: s.y - 16, vx: (Math.random() - 0.5) * 8, vy: -16, life: 0.5, max: 0.5, size: 1.6, color: "#ffd27a", type: 3 });
        }
      }
    }
  }
}

function drawEnemies() {
  for (const e of G.enemies) {
    const grow = e.born < 1 ? e.born : 1;
    if (e.dying) {
      ctx.globalAlpha = clamp(e.dieT / 0.6, 0, 1);
      ctx.fillStyle = "#3a3240";
      ctx.beginPath(); ctx.ellipse(e.x, e.y, e.r * 0.7, e.r * 0.4, 0, 0, 6.28); ctx.fill();
      ctx.globalAlpha = 1;
      continue;
    }
    if (e.alpha <= 0) continue;
    const p = G.player;
    const wob = Math.sin(e.phase) * 1.5;
    ctx.save();
    ctx.globalAlpha = e.alpha * grow;
    ctx.fillStyle = "#1c1e24";
    ctx.beginPath(); ctx.ellipse(e.x, e.y + 3, e.r * 1.1, e.r * 0.5, 0, 0, 6.28); ctx.fill();

    ctx.fillStyle = "rgba(23,24,30,0.95)";
    ctx.beginPath();
    ctx.ellipse(e.x, e.y - e.r * 0.1 + wob, e.r, e.r * 0.88, Math.sin(e.phase * 0.5) * 0.15, 0, 6.28);
    ctx.fill();

    const d = Math.atan2(p.y - e.y, p.x - e.x);
    const ex = e.x + Math.cos(d) * e.r * 0.42;
    const ey = e.y - e.r * 0.1 + wob + Math.sin(d) * e.r * 0.3;
    const gl = 0.75 + Math.sin(e.phase * 3) * 0.25;
    ctx.fillStyle = "#ff3b2f";
    ctx.globalAlpha = e.alpha * gl;
    ctx.beginPath(); ctx.arc(ex - 4, ey, 2.6, 0, 6.28); ctx.fill();
    ctx.beginPath(); ctx.arc(ex + 4, ey, 2.6, 0, 6.28); ctx.fill();
    ctx.fillStyle = "#ffd0a0";
    ctx.beginPath(); ctx.arc(ex - 4, ey, 1.1, 0, 6.28); ctx.fill();
    ctx.beginPath(); ctx.arc(ex + 4, ey, 1.1, 0, 6.28); ctx.fill();

    ctx.globalAlpha = Math.max(0, e.alpha * 0.6) * Math.max(0, Math.sin(e.phase * 3));
    ctx.strokeStyle = "#ff5a3a";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(ex - 4, ey + 5);
    ctx.lineTo(ex - 4 + Math.cos(d) * 4, ey + 5 + Math.sin(d) * 4);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.restore();

    if (e.born < 1) e.born += 0.05;
    const pd = dist2(e.x, e.y, p.x, p.y);
    if (e.alpha > 0.05) {
      ctx.fillStyle = "rgba(40,34,45," + (0.05 + Math.sin(e.phase * 2) * 0.03) + ")";
      ctx.beginPath(); ctx.arc(e.x - 40 + Math.sin(e.phase) * 4, e.y + 24, 14, 0, 6.28); ctx.fill();
      ctx.beginPath(); ctx.arc(e.x + 46 + Math.cos(e.phase * 0.7) * 5, e.y - 10, 11, 0, 6.28); ctx.fill();
    }
  }
}

function drawGhost() {
  if (G.buildIdx < 0 || G.buildIdx === 3 || G.state !== "PLAY") return;
  const ht = G.hoveredTile;
  if (!ht) return;
  const px = ht.tx * T + T / 2, py = ht.ty * T + T / 2;
  let ok = false;
  {
    const t = G.tiles[ht.ty * W + ht.tx];
    const d = Math.hypot(px - G.player.x, py - G.player.y);
    ok = t === RES.GRASS && !solidTile(ht.tx, ht.ty) && d < T * 4.2 && ht.tx >= 0 && ht.ty >= 0 && ht.tx < W && ht.ty < H && canAffordBuild(G.buildIdx);
  }
  ctx.globalAlpha = 0.6;
  ctx.strokeStyle = ok ? "#a4ff6a" : "#ff5a5a";
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 4]);
  ctx.strokeRect(px - T / 2 + 2, py - T / 2 + 2, T - 4, T - 4);
  ctx.setLineDash([]);
  ctx.fillStyle = ok ? "rgba(120,255,120,0.12)" : "rgba(255,80,80,0.12)";
  ctx.fillRect(px - T / 2 + 2, py - T / 2 + 2, T - 4, T - 4);
  ctx.globalAlpha = 1;
}

function drawParticles() {
  for (const p of G.particles) {
    const a = clamp(p.life / p.max, 0, 1);
    ctx.globalAlpha = a;
    ctx.fillStyle = p.color;
    if (p.type === 1) {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.tw + p.life * 4);
      ctx.fillRect(-p.size / 2, -p.size / 3, p.size, p.size * 0.7);
      ctx.restore();
    } else if (p.type === 3) {
      ctx.fillStyle = "rgba(120,120,120," + a * 0.35 + ")";
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, 6.28); ctx.fill();
    } else {
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (0.5 + a * 0.5), 0, 6.28); ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
}

function drawFloats() {
  ctx.font = "600 12px 'Segoe UI', sans-serif";
  ctx.textAlign = "center";
  for (const f of G.floats) {
    const a = clamp(f.life / f.max, 0, 1);
    ctx.globalAlpha = a;
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.font = "600 " + (f.size + 1) + "px 'Segoe UI', sans-serif";
    ctx.fillText(f.text, f.x + 1, f.y + 1);
    ctx.fillStyle = f.color;
    ctx.fillText(f.text, f.x, f.y);
  }
  ctx.globalAlpha = 1;
}

function drawFireflies(dt) {
  const night = nightFactor();
  if (night < 0.4) return;
  for (const f of G.fires) {
    if (!f.lit) continue;
    if (Math.random() < 0.10) {
      const r = 30 + Math.random() * 60;
      const a = Math.random() * 6.28;
      addP({
        x: f.x + Math.cos(a) * r, y: f.y + Math.sin(a) * r * 0.7,
        vx: (Math.random() - 0.5) * 30, vy: (Math.random() - 0.5) * 20,
        life: 2.5, max: 2.5, size: 1.8, color: "#ffe27a", type: 4
      });
    }
  }
  for (const p of G.particles) {
    if (p.type === 4) {
      p.tw += 0.2;
      p.x += Math.sin(p.tw) * 0.6;
      p.y += Math.cos(p.tw * 0.7) * 0.4;
    }
  }
}

function drawLighting(vp) {
  const w = Math.ceil(canvas.width), h = Math.ceil(canvas.height);
  let off = G.lightCanvas;
  if (!off || off.width !== w || off.height !== h) {
    off = document.createElement("canvas");
    off.width = w; off.height = h;
    G.lightCanvas = off;
  }
  const o = off.getContext("2d");
  const night = sunFactor();
  o.globalCompositeOperation = "source-over";
  o.clearRect(0, 0, w, h);
  const dark = 0.88 * (1 - night) + 0.10;
  o.fillStyle = "rgba(8,7,25," + dark.toFixed(3) + ")";
  o.fillRect(0, 0, w, h);

  o.globalCompositeOperation = "destination-out";
  const leftPx = (G.cam.x - vp.w / 2) * dpr, topPx = (G.cam.y - vp.h / 2) * dpr;
  const add = (wx, wy, r, a) => {
    const sx = wx * dpr - leftPx, sy = wy * dpr - topPx;
    const g = o.createRadialGradient(sx, sy, r * dpr * 0.1, sx, sy, r * dpr);
    g.addColorStop(0, "rgba(255,255,255," + a + ")");
    g.addColorStop(1, "rgba(255,255,255,0)");
    o.fillStyle = g;
    o.beginPath(); o.arc(sx, sy, r * dpr, 0, 6.28); o.fill();
  };

  const p = G.player;
  add(p.x, p.y, 165, 0.85);
  add(p.x, p.y, 300, 0.42);
  add(p.x, p.y, 60, 0.6);

  for (const f of G.fires) {
    if (!f.lit) continue;
    const flick = 0.9 + Math.sin(G.time * 11 + f.phase) * 0.1 + Math.sin(G.time * 23 + f.phase * 2) * 0.05;
    const r = (f.avoidR === 130 ? 165 : 300) * flick;
    const ly = f.y - (f.avoidR === 130 ? 10 : 0);
    add(f.x, ly, r, 0.92);
    add(f.x, ly, r * 0.4, 0.65);
  }
  o.globalCompositeOperation = "source-over";
  ctx.drawImage(off, 0, 0);
}

function drawStars(vp) {
  const night = nightFactor();
  if (night < 0.1) return;
  ctx.globalAlpha = night * 0.8;
  const w = vp.w, h = vp.h;
  for (let i = 0; i < 90; i++) {
    const sx = (h3(i, 3) * w), sy = (h3(i, 9) * h * 0.7);
    const tw = Math.sin(G.time * 1.5 + i * 2.3) * 0.5 + 0.5;
    ctx.fillStyle = "rgba(255,255,255," + (0.3 + tw * 0.7) + ")";
    const s = 1 + tw;
    ctx.fillRect(sx, sy, s, s);
  }
  ctx.globalAlpha = 1;
}

function drawVignette(vp) {
  const w = vp.w, h = vp.h;
  let g = ctx.createRadialGradient(w / 2, h / 2, h * 0.35, w / 2, h / 2, h * 0.85);
  g.addColorStop(0, "rgba(0,0,0,0)");
  g.addColorStop(1, "rgba(0,0,0,0.42)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

function drawFog(vp) {
  const fog = G.fogPts || (G.fogPts = []);
  if (fog.length === 0) {
    for (let i = 0; i < 7; i++) fog.push({ x: Math.random() * vp.w, y: Math.random() * vp.h, s: 90 + Math.random() * 140, a: 0.05 + Math.random() * 0.05, v: 6 + Math.random() * 10 });
  }
  for (const f of fog) {
    f.x += f.v * 0.016;
    if (f.x > vp.w + f.s) f.x = -f.s;
    const g = ctx.createRadialGradient(f.x, f.y, 10, f.x, f.y, f.s);
    g.addColorStop(0, "rgba(200,215,225," + f.a + ")");
    g.addColorStop(1, "rgba(200,215,225,0)");
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(f.x, f.y, f.s, 0, 6.28); ctx.fill();
  }
}

function drawMsg() {
  if (G.msgTimer <= 0 || !G.floatMsg) return;
  const a = clamp(G.msgTimer / 3.5, 0, 1) * (G.msgTimer < 0.7 ? G.msgTimer / 0.7 : 1);
  ctx.globalAlpha = a;
  ctx.font = "600 20px 'Segoe UI', sans-serif";
  ctx.textAlign = "center";
  const w = canvas.width / dpr, h = canvas.height / dpr;
  ctx.fillStyle = "rgba(0,0,0,0.65)";
  const m = ctx.measureText(G.floatMsg);
  const bw = m.width + 40;
  ctx.fillRect(w / 2 - bw / 2, h * 0.16, bw, 34);
  ctx.fillStyle = "#ffd9a0";
  ctx.fillText(G.floatMsg, w / 2, h * 0.16 + 24);
  ctx.globalAlpha = 1;
}

function render() {
  const dpr2 = window.devicePixelRatio || 1;
  const w = canvas.width / dpr2, h = canvas.height / dpr2;
  const shake = G.cam.shake;
  G.cam.shx = shake ? (Math.random() - 0.5) * shake * 2 : 0;
  G.cam.shy = shake ? (Math.random() - 0.5) * shake * 2 : 0;

  const vp = {
    lx: G.cam.x - w / 2, rx: G.cam.x + w / 2,
    ty: G.cam.y - h / 2, by: G.cam.y + h / 2,
    w, h
  };

  ctx.save();
  ctx.setTransform(dpr2, 0, 0, dpr2, 0, 0);

  if (G.state === "TITLE") {
    drawSkyTitle(w, h);
  } else {
    drawSky({}, 0);
    ctx.translate(-vp.lx + G.cam.shx, -vp.ty + G.cam.shy);
    drawGround(vp);
    drawGroundTexture(vp);
    drawRocks();
    drawBushes();
    drawSticks();
    drawStructures();
    drawEnemies();
    drawPlayer();
    drawTrees();
    drawGhost();
    drawFireflies(0);
    drawParticles();
    drawFloats();
    ctx.setTransform(dpr2, 0, 0, dpr2, 0, 0);
    drawLighting(vp);
    drawStars(vp);
    drawFog(vp);
    drawVignette(vp);
    drawMsg();
  }
  ctx.restore();
}

function drawSkyTitle(w, h) {
  const t = G.time;
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, "#0a0e18");
  g.addColorStop(0.5, "#12232b");
  g.addColorStop(1, "#0a0e18");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  drawStars({ w, h });
  for (let i = 0; i < 26; i++) {
    const x = (h3(i, 3)) * w;
    const y = h * 0.5 + Math.sin(h3(i, 7) * 40) * 40;
    const sway = Math.sin(t * 1.1 + i) * 2;
    ctx.fillStyle = "#123c1c";
    ctx.beginPath(); ctx.arc(x - 30 + sway, y + 10, 26, 0, 6.28); ctx.fill();
    ctx.strokeStyle = "#1a2f14";
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(x, y + 18); ctx.lineTo(x, y + 44); ctx.stroke();
    ctx.fillStyle = "#1c5a26";
    ctx.beginPath(); ctx.arc(x + 34 + sway, y + 26, 18, 0, 6.28); ctx.fill();
  }
  if (Math.random() < 0.5) {
    addP({ x: Math.random() * w, y: -8, vx: (Math.random() - 0.5) * 26, vy: 20 + Math.random() * 20, life: 2, max: 2, size: 4, color: "#2f6a2c", type: 1 });
  }
  for (const p of G.particles) {
    const a = clamp(p.life / p.max, 0, 1);
    ctx.globalAlpha = a;
    ctx.fillStyle = p.color;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.tw + p.life * 4);
    ctx.fillRect(-p.size / 2, -p.size / 3, p.size, p.size * 0.7);
    ctx.restore();
  }
  ctx.globalAlpha = 1;
  const f = 0.5 + Math.sin(t * 2) * 0.12;
  const glow = ctx.createRadialGradient(w / 2, h * 0.42, 30, w / 2, h * 0.42, 260 * f);
  glow.addColorStop(0, "rgba(255,140,40,0.16)");
  glow.addColorStop(1, "rgba(255,140,40,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, h);
}

function loop(ts) {
  if (!G._lastT) G._lastT = ts;
  let dt = (ts - G._lastT) / 1000;
  G._lastT = ts;
  update(dt);
  render();
  requestAnimationFrame(loop);
}

function startGame() {
  initGame();
  G.state = "PLAY";
  document.getElementById("title").classList.add("hidden");
  document.getElementById("hud").classList.remove("hidden");
  document.getElementById("toolbar").classList.remove("hidden");
  if (!G.ac) initAudio();
  updateInvDom();
  updateVitals();
  updateToolbar();
  G.msgTimer = 3.6;
  G.floatMsg = "Gather. Build. Survive the night.";
}

function restart() {
  document.getElementById("death").classList.add("hidden");
  startGame();
}

const BUILD_DEFS = [
  { id: "campfire", cost: 8, costTxt: "8 WOOD" },
  { id: "wall", cost: 4, costTxt: "4 WOOD" },
  { id: "torch", cost: 2, costTxt: "2 WOOD" },
  { id: "axe", cost: [10, 5], costTxt: "10W + 5S" }
];

function updateToolbar() {
  const slots = document.querySelectorAll(".slot");
  slots.forEach((s, i) => {
    const can = canAfford(BUILD_DEFS[i].id);
    s.classList.toggle("disabled", !can);
    s.classList.toggle("selected", G.buildIdx === i);
  });
}

function setBuild(i) {
  if (G.buildIdx === i) G.buildIdx = -1;
  else G.buildIdx = i;
  updateToolbar();
}

function canAffordBuild(i) {
  return canAfford(BUILD_DEFS[i] ? BUILD_DEFS[i].id : "campfire");
}

function handleAxeClick() {
  if (G.wood >= 10 && G.stone >= 5) {
    G.wood -= 10; G.stone -= 5;
    G.axeLevel = 2;
    addFloat(G.player.x, G.player.y - 20, "Axe sharpened!", "#ffd23b", 14);
    sndPickup();
    updateInvDom();
    updateToolbar();
  } else {
    flashMsg("Need 10 wood + 5 stone");
  }
}

function onCanvasClick(ev) {
  if (G.state === "TITLE") { startGame(); return; }
  if (G.state === "DEAD") return;
  initAudio();
  if (G.buildIdx >= 0) {
    if (G.buildIdx === 3) { handleAxeClick(); return; }
    const tp = screenToWorld(mouse.x, mouse.y);
    placeBlock(Math.floor(tp.x / T), Math.floor(tp.y / T));
    updateToolbar();
    return;
  }
  const pt = screenToWorld(mouse.x, mouse.y);
  const wx = pt.x, wy = pt.y;
  const tx = Math.floor(wx / T), ty = Math.floor(wy / T);
  const onFireAt = () => {
    for (const f of G.fires) {
      if (Math.floor(f.x / T) === tx && Math.floor(f.y / T) === ty) return true;
    }
    return false;
  };
  if (onFireAt() && Math.hypot(wx - G.player.x, wy - G.player.y) < T * 3) { refuelFire(tx, ty); return; }
  swing();
}

function onCanvasRmb(ev) {
  if (G.state !== "PLAY") return;
  ev.preventDefault();
  if (G.buildIdx >= 0) { setBuild(-1); return; }
  const pt = screenToWorld(mouse.x, mouse.y);
  const wx = pt.x, wy = pt.y;
  demolishAt(Math.floor(wx / T), Math.floor(wy / T));
}

function onKeyDown(ev) {
  keys[ev.code] = true;
  if (ev.code === "Space") ev.preventDefault();
  if (G.state === "PLAY") {
    if (["1", "2", "3", "4"].includes(ev.key) && !isNaN(ev.key)) {
      setBuild(parseInt(ev.key) - 1);
    } else if (ev.code === "KeyE") {
      eatBerries();
    } else if (ev.code === "KeyQ") {
      drink();
    } else if (ev.code === "Escape") {
      setBuild(-1);
    }
  }
}

document.addEventListener("keydown", onKeyDown);
document.addEventListener("keyup", e => { keys[e.code] = false; });

document.getElementById("startBtn").addEventListener("click", startGame);
document.getElementById("restartBtn").addEventListener("click", restart);
document.querySelectorAll(".slot").forEach((s, i) => {
  s.addEventListener("click", () => {
    if (G.state !== "PLAY") return;
    if (BUILD_DEFS[i].id === "axe") { handleAxeClick(); return; }
    if (canAfford(BUILD_DEFS[i].id)) setBuild(i);
    else flashMsg("Need " + BUILD_DEFS[i].costTxt);
  });
});

function resize() {
  dpr = window.devicePixelRatio || 1;
  canvas.width = Math.floor(window.innerWidth * dpr);
  canvas.height = Math.floor(window.innerHeight * dpr);
  canvas.style.width = window.innerWidth + "px";
  canvas.style.height = window.innerHeight + "px";
}
let dpr = 1;
window.addEventListener("resize", resize);
resize();

canvas.addEventListener("mousemove", ev => {
  mouse.x = ev.clientX;
  mouse.y = ev.clientY;
});
canvas.addEventListener("mousedown", ev => {
  mouse.x = ev.clientX;
  mouse.y = ev.clientY;
  if (ev.button === 2) onCanvasRmb(ev);
  else onCanvasClick(ev);
});
canvas.addEventListener("contextmenu", ev => ev.preventDefault());

function initAudio() {
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    G.ac = new AC();
    const master = G.ac.createGain();
    master.gain.value = 0.5;
    master.connect(G.ac.destination);
    G.master = master;

    const nb = G.ac.createBuffer(1, G.ac.sampleRate * 2, G.ac.sampleRate);
    const ch = nb.getChannelData(0);
    for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1;
    G.noiseBuf = nb;

    const wind = G.ac.createBufferSource();
    wind.buffer = nb;
    wind.loop = true;
    const wf = G.ac.createBiquadFilter();
    wf.type = "bandpass";
    wf.frequency.value = 260;
    wf.Q.value = 0.4;
    const wg = G.ac.createGain();
    wg.gain.value = 0.06;
    wind.connect(wf).connect(wg).connect(master);
    wind.start();
    G.ambWind = wg;

    const occ = G.ac.createOscillator();
    occ.type = "sine";
    occ.frequency.value = 46;
    const og = G.ac.createGain();
    og.gain.value = 0.02;
    occ.connect(og).connect(master);
    occ.start();
    G.ambNight = og;
  } catch (e) { }
}

function noiseShot(dur, filt, Q, gain, decay) {
  if (!G.ac) return;
  const src = G.ac.createBufferSource();
  src.buffer = G.noiseBuf;
  src.loop = true;
  const f = G.ac.createBiquadFilter();
  f.type = filt || "bandpass";
  f.frequency.value = 800;
  f.Q.value = Q || 1;
  const g = G.ac.createGain();
  g.gain.setValueAtTime(gain || 0.1, G.ac.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, G.ac.currentTime + dur);
  src.connect(f).connect(g).connect(G.master);
  src.start();
  src.stop(G.ac.currentTime + dur + 0.02);
}

function tone(f0, f1, dur, type, gain) {
  if (!G.ac) return;
  const o = G.ac.createOscillator();
  o.type = type || "sine";
  const t0 = G.ac.currentTime;
  o.frequency.setValueAtTime(f0, t0);
  o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t0 + dur);
  const g = G.ac.createGain();
  g.gain.setValueAtTime(gain || 0.12, t0);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  o.connect(g).connect(G.master);
  o.start();
  o.stop(t0 + dur + 0.02);
}

function sndChop() { noiseShot(0.09, "lowpass", 0.6, 0.28); tone(130, 70, 0.1, "triangle", 0.16); }
function sndThud() { tone(90, 50, 0.14, "sine", 0.3); }
function sndSwing() { noiseShot(0.07, "highpass", 1, 0.05); }
function sndPlace() { tone(150, 90, 0.12, "triangle", 0.2); noiseShot(0.08, "bandpass", 2, 0.08, 800); }
function sndPickup() { tone(700, 900, 0.07, "sine", 0.09); setTimeout(() => tone(900, 1200, 0.07, "sine", 0.07), 60); }
function sndEat() { for (let i = 0; i < 4; i++) setTimeout(() => { tone(200 + Math.random() * 200, 150, 0.05, "square", 0.05); noiseShot(0.04, "highpass", 1, 0.03); }, i * 60); }
function sndDrink() { noiseShot(0.35, "bandpass", 4, 0.05, 600); }
function sndHurt() { tone(240, 70, 0.25, "sawtooth", 0.2); noiseShot(0.12, "lowpass", 1, 0.12); }
function sndHit() { noiseShot(0.08, "bandpass", 3, 0.12, 1400); }
function sndTreeDown() { tone(120, 30, 0.6, "triangle", 0.22); noiseShot(0.5, "lowpass", 1, 0.12, 300); }
function sndFootstep() { noiseShot(0.035, "highpass", 2, 0.022); }
function sndCrackle() { noiseShot(0.06, "highpass", 1, 0.025 + fireCrackleLevel * 0.025); }
function sndBird() { for (let i = 0; i < 5; i++) setTimeout(() => tone(1400 + Math.random() * 900, 1500 + Math.random() * 600, 0.09, "sine", 0.035), i * 110); }
function sndDeath() { tone(200, 30, 1.4, "sawtooth", 0.2); noiseShot(1.2, "lowpass", 1, 0.1, 200); }

requestAnimationFrame(loop);