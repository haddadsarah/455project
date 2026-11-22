/* CipherBreak EDU — pixel-art world engine.
 * Low-resolution canvas (320×192, 16-px tiles) scaled up with crisp pixels.
 * Everything is drawn procedurally (no image files): tiles, walls, doors, machines,
 * the player, NOVA, lighting, particles and screen shake.
 */
(function () {
  "use strict";
  const W = (window.World = {});
  const T = (W.TILE = 16), COLS = (W.COLS = 20), ROWS = (W.ROWS = 12);
  W.VW = COLS * T; W.VH = ROWS * T;

  /* ---------------- Art direction: palettes per area ---------------- */
  const THEMES = {
    0: { name: "Main Lobby", accent: "#34e0ff", a2: "#a77bff", floorA: "#19213b", floorB: "#1c2542", seam: "#121830", wallTop: "#3c4c80", wallFace: "#232d55", wallDark: "#161d3a" },
    1: { name: "The Hex Gate", accent: "#2fe6c8", a2: "#34e0ff", floorA: "#14263a", floorB: "#172b41", seam: "#0e1b2c", wallTop: "#2f6070", wallFace: "#1b3a4a", wallDark: "#10242f" },
    2: { name: "The Key Vault", accent: "#b48cff", a2: "#ff7ad9", floorA: "#1d1a3b", floorB: "#221e44", seam: "#141130", wallTop: "#55468f", wallFace: "#2e2660", wallDark: "#1c1740" },
    3: { name: "The Round Reactor", accent: "#47f59a", a2: "#34e0ff", floorA: "#122a26", floorB: "#15302b", seam: "#0c1e1b", wallTop: "#2f6b56", wallFace: "#1a3f34", wallDark: "#0f2821" },
    4: { name: "The Final Decryption Chamber", accent: "#ffb547", a2: "#ff6b7d", floorA: "#271a2e", floorB: "#2c1d33", seam: "#1b1120", wallTop: "#7a4f5e", wallFace: "#432a3a", wallDark: "#2a1824" },
  };
  W.THEMES = THEMES;

  /* ---------------- Scenes (maps) ----------------
   * doors: on the top wall (y=0) or bottom wall (y=11), 2 tiles wide.
   * stations: interactive machines; id = puzzle id, "archive:<kind>" or "info".
   * decor: solid or flat decorations.                                          */
  const S = (W.SCENES = {
    0: {
      doors: [
        { x: 2, y: 0, to: 1, kind: "room", label: "1 · HEX GATE" },
        { x: 6, y: 0, to: 2, kind: "room", label: "2 · KEY VAULT" },
        { x: 12, y: 0, to: 3, kind: "room", label: "3 · REACTOR" },
        { x: 16, y: 0, to: 4, kind: "room", label: "4 · DECRYPTION" },
      ],
      stations: [{ id: "info", x: 8, y: 4, w: 4, h: 2, sprite: "holotable", label: "Mission briefing" }],
      decor: [
        { t: "rack", x: 1, y: 2 }, { t: "rack", x: 1, y: 3 }, { t: "rack", x: 18, y: 2 }, { t: "rack", x: 18, y: 3 },
        { t: "plant", x: 1, y: 9 }, { t: "plant", x: 18, y: 9 }, { t: "bench", x: 4, y: 8, w: 2 }, { t: "bench", x: 14, y: 8, w: 2 },
        { t: "crate", x: 1, y: 6 }, { t: "crate", x: 18, y: 6 }, { t: "lamp", x: 5, y: 3 }, { t: "lamp", x: 14, y: 3 },
      ],
      spawn: { x: 10, y: 9 },
    },
    1: {
      doors: [{ x: 9, y: 0, to: 2, kind: "gate", label: "HEX GATE" }, { x: 9, y: 11, to: 0, kind: "back", label: "LOBBY" }],
      stations: [
        { id: "r1_ascii", x: 2, y: 2, w: 2, h: 1, sprite: "terminal", label: "Access terminal" },
        { id: "r1_block", x: 2, y: 6, w: 2, h: 1, sprite: "scanner", label: "Block inspector" },
        { id: "r1_ip_bit", x: 16, y: 2, w: 2, h: 1, sprite: "patchbay", label: "IP patch panel" },
        { id: "r1_split", x: 16, y: 6, w: 2, h: 1, sprite: "splitter", label: "Block splitter" },
      ],
      decor: [{ t: "pillar", x: 6, y: 2 }, { t: "pillar", x: 13, y: 2 }, { t: "pillar", x: 6, y: 7 }, { t: "pillar", x: 13, y: 7 },
        { t: "plant", x: 1, y: 9 }, { t: "plant", x: 18, y: 9 }, { t: "runway", x: 9, y: 2, h: 8 }],
      spawn: { x: 10, y: 9 },
    },
    2: {
      doors: [{ x: 9, y: 0, to: 3, kind: "gate", label: "VAULT DOOR" }, { x: 9, y: 11, to: 0, kind: "back", label: "LOBBY" }],
      stations: [
        { id: "r2_parity", x: 2, y: 2, w: 2, h: 1, sprite: "reader", label: "Key reader" },
        { id: "r2_pc1_bit", x: 2, y: 5, w: 2, h: 1, sprite: "patchbay", label: "PC-1 module" },
        { id: "r2_split", x: 2, y: 8, w: 2, h: 1, sprite: "splitter", label: "Key splitter" },
        { id: "r2_shift", x: 8, y: 4, w: 4, h: 3, sprite: "rotors", label: "C/D rotor disks" },
        { id: "r2_pc2", x: 16, y: 2, w: 2, h: 1, sprite: "patchbay", label: "PC-2 module" },
        { id: "r2_cycle", x: 16, y: 5, w: 2, h: 2, sprite: "forge", label: "Key forge" },
        { id: "archive:keys", x: 16, y: 9, w: 2, h: 1, sprite: "archive", label: "Key archive" },
      ],
      decor: [{ t: "rack", x: 1, y: 3 }, { t: "rack", x: 18, y: 3 }, { t: "crate", x: 6, y: 9 }, { t: "crate", x: 13, y: 9 }],
      spawn: { x: 10, y: 9 },
    },
    3: {
      doors: [{ x: 9, y: 0, to: 4, kind: "gate", label: "BLAST DOOR" }, { x: 9, y: 11, to: 0, kind: "back", label: "LOBBY" }],
      stations: [
        { id: "r3_expand", x: 2, y: 2, w: 2, h: 1, sprite: "module", label: "E · Expansion" },
        { id: "r3_xor", x: 5, y: 2, w: 2, h: 1, sprite: "module", label: "⊕ · Key mixer" },
        { id: "r3_sbox", x: 13, y: 2, w: 2, h: 1, sprite: "module", label: "S · S-box bank" },
        { id: "r3_perm", x: 16, y: 2, w: 2, h: 1, sprite: "module", label: "P · Permutation" },
        { id: "r3_feistel", x: 16, y: 7, w: 2, h: 1, sprite: "module", label: "⇄ · Feistel mixer" },
        { id: "r3_swap", x: 8, y: 4, w: 4, h: 3, sprite: "reactor", label: "Reactor core" },
        { id: "r3_sbox_bonus", x: 2, y: 7, w: 2, h: 1, sprite: "module", label: "★ Bonus S-box" },
        { id: "archive:encrypt", x: 2, y: 9, w: 2, h: 1, sprite: "archive", label: "Round archive" },
      ],
      decor: [{ t: "pipe", x: 6, y: 9 }, { t: "pipe", x: 13, y: 9 }, { t: "plant", x: 18, y: 9 }],
      spawn: { x: 10, y: 9 },
    },
    4: {
      doors: [{ x: 9, y: 0, to: "escape", kind: "exit", label: "EXIT" }, { x: 9, y: 11, to: 0, kind: "back", label: "LOBBY" }],
      stations: [
        { id: "r4_order", x: 2, y: 2, w: 2, h: 1, sprite: "keyrack", label: "Key rack" },
        { id: "r4_round", x: 2, y: 6, w: 2, h: 2, sprite: "forge", label: "Decryption engine" },
        { id: "r4_code", x: 12, y: 1, w: 1, h: 1, sprite: "keypad", label: "Exit keypad" },
        { id: "r4_verdict", x: 15, y: 5, w: 2, h: 2, sprite: "novacore", label: "NOVA core" },
        { id: "archive:decrypt", x: 16, y: 9, w: 2, h: 1, sprite: "archive", label: "Decryption log" },
      ],
      decor: [{ t: "rack", x: 1, y: 9 }, { t: "plant", x: 7, y: 9 }, { t: "lamp", x: 6, y: 2 }, { t: "lamp", x: 13, y: 4 }],
      spawn: { x: 10, y: 9 },
    },
  });

  /* ---------------- State ---------------- */
  const st = (W.state = {
    scene: 0, player: { x: 160, y: 160, dir: "up", moving: false, frame: 0, step: 0 },
    nova: { x: 150, y: 150 }, keys: {}, path: null, pendingTarget: null,
    particles: [], shake: 0, fade: 0, fadeTarget: 0, time: 0, statusOf: () => "locked", doorState: () => "locked",
    doorAnim: {}, focus: null, paused: false, hintTarget: null, flash: 0, flashColor: "#fff",
  });

  let canvas, ctx, scale = 3;
  W.init = function (el) {
    canvas = el; ctx = canvas.getContext("2d");
    canvas.width = W.VW; canvas.height = W.VH;
    ctx.imageSmoothingEnabled = false;
    window.addEventListener("resize", W.fit); W.fit();
    window.addEventListener("keydown", (e) => { st.keys[e.key.toLowerCase()] = true; });
    window.addEventListener("keyup", (e) => { st.keys[e.key.toLowerCase()] = false; });
    window.addEventListener("blur", () => (st.keys = {}));
    canvas.addEventListener("click", onClick);
  };
  W.fit = function () {
    const wrap = canvas.parentElement, area = wrap.parentElement;
    const availW = area.clientWidth, availH = area.clientHeight;
    scale = Math.max(1, Math.min(availW / W.VW, availH / W.VH));
    if (scale >= 2) scale = Math.floor(scale * 2) / 2; // near-integer for crisp pixels
    wrap.style.width = W.VW * scale + "px"; wrap.style.height = W.VH * scale + "px";
    wrap.style.setProperty("--s", scale);
    if (W.onFit) W.onFit(scale);
  };
  W.scale = () => scale;

  /* ---------------- Collision grid ---------------- */
  function solidGrid(sceneId) {
    const sc = S[sceneId], g = [];
    for (let y = 0; y < ROWS; y++) { g.push([]); for (let x = 0; x < COLS; x++) g[y].push(x === 0 || y === 0 || x === COLS - 1 || y === ROWS - 1); }
    sc.doors.forEach((d) => { if (st.doorState(d) === "open") { g[d.y][d.x] = false; g[d.y][d.x + 1] = false; } });
    sc.stations.forEach((s) => { for (let y = s.y; y < s.y + s.h; y++) for (let x = s.x; x < s.x + s.w; x++) g[y][x] = true; });
    sc.decor.forEach((d) => { if (["rack", "plant", "crate", "pillar", "bench", "pipe"].includes(d.t)) for (let i = 0; i < (d.w || 1); i++) g[d.y][d.x + i] = true; });
    return g;
  }
  let grid = null;
  W.refreshGrid = () => (grid = solidGrid(st.scene));

  function blocked(px, py) {
    const tx = Math.floor(px / T), ty = Math.floor(py / T);
    if (tx < 0 || ty < 0 || tx >= COLS || ty >= ROWS) return true;
    return grid[ty][tx];
  }
  function canStand(x, y) { // feet box 10×5
    return !blocked(x - 5, y - 4) && !blocked(x + 4, y - 4) && !blocked(x - 5, y) && !blocked(x + 4, y);
  }

  /* ---------------- Scene control ---------------- */
  W.load = function (sceneId, from) {
    st.scene = sceneId; W.refreshGrid();
    const sc = S[sceneId];
    let sp = sc.spawn;
    if (sceneId === 0 && typeof from === "number") { const d = sc.doors.find((dd) => dd.to === from); if (d) sp = { x: d.x + 1, y: 1 }; }
    st.player.x = sp.x * T; st.player.y = sp.y * T + 10; st.player.dir = sceneId === 0 && typeof from === "number" ? "down" : "up";
    st.nova.x = st.player.x - 14; st.nova.y = st.player.y - 20;
    st.path = null; st.pendingTarget = null; st.particles = [];
  };

  /* ---------------- Input: click-to-walk with BFS ---------------- */
  function onClick(e) {
    if (st.paused) return;
    const r = canvas.getBoundingClientRect();
    const vx = ((e.clientX - r.left) / r.width) * W.VW, vy = ((e.clientY - r.top) / r.height) * W.VH;
    const tx = Math.floor(vx / T), ty = Math.floor(vy / T);
    const sc = S[st.scene];
    const station = sc.stations.find((s) => tx >= s.x && tx < s.x + s.w && ty >= s.y && ty < s.y + s.h);
    const door = sc.doors.find((d) => (tx === d.x || tx === d.x + 1) && ty === d.y);
    if (station) W.approach({ type: "station", s: station });
    else if (door) W.approach({ type: "door", d: door });
    else walk([tx, ty]);
  }
  function walk(goal, target = null) {
    if (!goal || st.paused) return;
    const start = [Math.floor(st.player.x / T), Math.floor((st.player.y - 2) / T)];
    const path = bfs(start, goal);
    if (path?.length) {
      st.path = path;
      st.pendingTarget = target;
      W.emit("walk");
    } else if (target && (path || W.near(target))) {
      W.emit("interact", target);
    }
  }
  W.approach = (target) => {
    const goal = target.type === "station" ? nearestFree(target.s) :
      [target.d.x + 1, target.d.y === 0 ? 1 : ROWS - 2];
    walk(goal, target);
  };
  W.walkFloor = (x, y) => walk([Math.min(COLS - 2, Math.max(1, Math.floor(x * COLS))),
    Math.min(ROWS - 2, Math.max(1, Math.floor(y * ROWS)))]);
  function nearestFree(s) {
    const cands = [];
    for (let x = s.x - 1; x <= s.x + s.w; x++) { cands.push([x, s.y + s.h]); cands.push([x, s.y - 1]); }
    for (let y = s.y; y < s.y + s.h; y++) { cands.push([s.x - 1, y]); cands.push([s.x + s.w, y]); }
    const px = st.player.x / T, py = st.player.y / T;
    return cands.filter(([x, y]) => grid[y] && grid[y][x] === false).sort((a, b) => Math.hypot(a[0] - px, a[1] - py) - Math.hypot(b[0] - px, b[1] - py))[0];
  }
  function bfs(start, goal) {
    const key = (x, y) => y * COLS + x, prev = new Map([[key(...start), null]]), q = [start];
    while (q.length) {
      const [x, y] = q.shift();
      if (x === goal[0] && y === goal[1]) {
        const out = []; let k = key(x, y);
        while (k !== null) { out.unshift([k % COLS, Math.floor(k / COLS)]); k = prev.get(k); }
        return out.slice(1);
      }
      [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dx, dy]) => {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS || grid[ny][nx] || prev.has(key(nx, ny))) return;
        prev.set(key(nx, ny), key(x, y)); q.push([nx, ny]);
      });
    }
    return null;
  }

  /* ---------------- Events ---------------- */
  const handlers = {};
  W.on = (ev, fn) => ((handlers[ev] = handlers[ev] || []).push(fn));
  W.emit = (ev, data) => (handlers[ev] || []).forEach((fn) => fn(data));

  /* Which interactable is the player standing next to? */
  W.near = function (target) {
    const p = st.player;
    if (target.type === "station") {
      const s = target.s;
      return p.x > s.x * T - 12 && p.x < (s.x + s.w) * T + 12 && p.y > s.y * T - 10 && p.y < (s.y + s.h) * T + 18;
    }
    return false;
  };
  function findFocus() {
    const sc = S[st.scene];
    let best = null, bd = 1e9;
    sc.stations.forEach((s) => {
      if (!W.near({ type: "station", s })) return;
      const d = Math.hypot(st.player.x - (s.x + s.w / 2) * T, st.player.y - (s.y + s.h / 2) * T);
      if (d < bd) { bd = d; best = s; }
    });
    return best;
  }

  /* ---------------- Update ---------------- */
  W.update = function (dt) {
    st.time += dt;
    const p = st.player;
    let dx = 0, dy = 0;
    if (!st.paused) {
      const k = st.keys;
      if (k.arrowleft || k.a) dx -= 1; if (k.arrowright || k.d) dx += 1;
      if (k.arrowup || k.w) dy -= 1; if (k.arrowdown || k.s) dy += 1;
      if (dx || dy) { st.path = null; st.pendingTarget = null; }
      else if (st.path && st.path.length) {
        const [tx, ty] = st.path[0], gx = tx * T + 8, gy = ty * T + 12;
        const ddx = gx - p.x, ddy = gy - p.y;
        if (Math.hypot(ddx, ddy) < 2) { st.path.shift(); if (!st.path.length) { st.path = null; arrive(); } }
        else { dx = Math.sign(ddx) * (Math.abs(ddx) > 1 ? 1 : 0); dy = Math.sign(ddy) * (Math.abs(ddy) > 1 ? 1 : 0); }
      }
    }
    const speed = 68 * dt;
    if (dx || dy) {
      const n = dx && dy ? Math.SQRT1_2 : 1;
      const nx = p.x + dx * speed * n, ny = p.y + dy * speed * n;
      if (canStand(nx, p.y)) p.x = nx;
      if (canStand(p.x, ny)) p.y = ny;
      p.dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : dy > 0 ? "down" : "up";
      p.step += dt * 9; p.moving = true;
      if (!st._moved) { st._moved = true; W.emit("firstmove"); }
    } else p.moving = false;
    // walking through an open door
    if (p.y < T + 6 || p.y > (ROWS - 1) * T + 2) {
      const d = S[st.scene].doors.find((dd) => p.x >= dd.x * T && p.x <= (dd.x + 2) * T && ((dd.y === 0 && p.y < T + 6) || (dd.y === ROWS - 1 && p.y > (ROWS - 1) * T + 2)));
      if (d && st.doorState(d) === "open" && !st.transitioning) W.emit("door", d);
    }
    // pushing against a locked door
    if (p.y < T + 12 && dy < 0) {
      const d = S[st.scene].doors.find((dd) => dd.y === 0 && p.x >= dd.x * T - 2 && p.x <= (dd.x + 2) * T + 2);
      if (d && st.doorState(d) !== "open" && st.time - (st._bump || -9) > 2.5) { st._bump = st.time; W.emit("lockeddoor", d); }
    }
    // NOVA follows
    const nvx = p.x + (p.dir === "left" ? 14 : -14), nvy = p.y - 22;
    st.nova.x += (nvx - st.nova.x) * Math.min(1, dt * 3); st.nova.y += (nvy - st.nova.y) * Math.min(1, dt * 3);
    // focus
    const f = findFocus();
    if (f !== st.focus) { st.focus = f; W.emit("focus", f); }
    // particles
    st.particles = st.particles.filter((q) => (q.life -= dt) > 0);
    st.particles.forEach((q) => { q.x += q.vx * dt; q.y += q.vy * dt; q.vy += (q.g || 0) * dt; });
    st.shake = Math.max(0, st.shake - dt * 18);
    st.fade += (st.fadeTarget - st.fade) * Math.min(1, dt * 6);
    st.flash = Math.max(0, st.flash - dt * 2.5);
    Object.keys(st.doorAnim).forEach((k) => { st.doorAnim[k] = Math.min(1, st.doorAnim[k] + dt * 0.8); });
  };
  function arrive() {
    const t = st.pendingTarget; st.pendingTarget = null;
    if (t) W.emit("interact", t);
  }

  /* ---------------- Effects ---------------- */
  W.burst = function (x, y, color, n, opts) {
    opts = opts || {};
    for (let i = 0; i < (n || 24); i++) {
      const a = Math.random() * Math.PI * 2, v = (opts.speed || 60) * (0.4 + Math.random());
      st.particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - (opts.up || 20), g: opts.g ?? 80, life: 0.6 + Math.random() * 0.7, color: Array.isArray(color) ? color[i % color.length] : color, size: Math.random() < 0.3 ? 2 : 1 });
    }
  };
  W.confetti = function () {
    const cols = ["#34e0ff", "#a77bff", "#47f59a", "#ffb547", "#ff7ad9"];
    for (let i = 0; i < 140; i++) st.particles.push({ x: Math.random() * W.VW, y: -Math.random() * 60, vx: (Math.random() - 0.5) * 30, vy: 30 + Math.random() * 50, g: 10, life: 4 + Math.random() * 2, color: cols[i % 5], size: 2 });
  };
  W.shake = (amt) => (st.shake = Math.max(st.shake, amt || 4));
  W.flash = (color) => { st.flash = 1; st.flashColor = color || "#fff"; };
  W.openDoor = (d) => (st.doorAnim[st.scene + ":" + d.x + ":" + d.y] = 0);
  W.stationCenter = (s) => [(s.x + s.w / 2) * T, (s.y + s.h / 2) * T];

  /* ================= RENDERING ================= */
  const px = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), w, h); };
  const hash = (x, y, s) => { let h = (x * 374761393 + y * 668265263 + (s || 0) * 2147483647) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
  const blink = (rate, off) => Math.sin(st.time * rate + (off || 0)) > 0;

  function drawFloor(th) {
    for (let y = 1; y < ROWS - 1; y++) for (let x = 1; x < COLS - 1; x++) {
      const X = x * T, Y = y * T;
      px(X, Y, T, T, (x + y) % 2 ? th.floorA : th.floorB);
      px(X, Y, T, 1, th.seam); px(X, Y, 1, T, th.seam);
      px(X + 2, Y + 2, 1, 1, "rgba(255,255,255,.06)"); px(X + 13, Y + 13, 1, 1, "rgba(0,0,0,.25)");
      const r = hash(x, y, st.scene);
      if (r < 0.06) { px(X + 4, Y + 5, 8, 6, "rgba(0,0,0,.18)"); for (let i = 0; i < 4; i++) px(X + 5, Y + 6 + i * 1.5, 6, 1, "rgba(255,255,255,.05)"); }
      else if (r < 0.1) { px(X + 3, Y + 8, 10, 1, "rgba(0,0,0,.25)"); px(X + 12, Y + 8, 1, 5, "rgba(0,0,0,.25)"); }
    }
    // glowing floor guide lines toward the top gate/doors
    ctx.globalAlpha = 0.18 + 0.06 * Math.sin(st.time * 2);
    if (st.scene !== 0) { px(9 * T + 7, T * 2, 2, T * 8, th.accent); px(10 * T + 7, T * 2, 2, T * 8, th.accent); }
    else { px(2 * T, 7 * T + 7, 16 * T, 2, th.accent); }
    ctx.globalAlpha = 1;
  }

  function drawWalls(th) {
    // top wall with a face, panels and neon strip
    for (let x = 0; x < COLS; x++) {
      const X = x * T;
      px(X, 0, T, 4, th.wallTop); px(X, 4, T, 12, th.wallFace);
      px(X, 4, T, 1, "rgba(255,255,255,.12)");
      if (x % 2 === 0) px(X, 5, 1, 11, th.wallDark);
      px(X, 11, T, 1, th.accent); ctx.globalAlpha = 0.3; px(X, 12, T, 1, th.accent); ctx.globalAlpha = 1;
      if (hash(x, 1, st.scene) < 0.25) { px(X + 4, 6, 6, 3, th.wallDark); px(X + 5, 7, 1, 1, blink(3, x) ? th.accent : "#334"); px(X + 7, 7, 1, 1, blink(2, x + 1) ? "#ff6b7d" : "#334"); }
    }
    // side walls and bottom
    for (let y = 1; y < ROWS; y++) {
      px(0, y * T, T, T, th.wallDark); px(T - 3, y * T, 3, T, th.wallTop); px(T - 1, y * T, 1, T, "rgba(255,255,255,.15)");
      px((COLS - 1) * T, y * T, T, T, th.wallDark); px((COLS - 1) * T, y * T, 3, T, th.wallTop); px((COLS - 1) * T, y * T, 1, T, "rgba(255,255,255,.15)");
    }
    for (let x = 0; x < COLS; x++) { px(x * T, (ROWS - 1) * T, T, T, th.wallDark); px(x * T, (ROWS - 1) * T, T, 3, th.wallTop); px(x * T, (ROWS - 1) * T, T, 1, "rgba(255,255,255,.15)"); }
  }

  function drawDoor(d, th) {
    const ds = st.doorState(d); // locked | available | open | completed
    const X = d.x * T, Y = d.y * T, w = 2 * T, big = d.kind === "gate" || d.kind === "exit";
    const anim = st.doorAnim[st.scene + ":" + d.x + ":" + d.y];
    const openAmt = ds === "open" ? (anim === undefined ? 1 : anim) : 0;
    const lightCol = ds === "locked" ? "#ff4d6a" : ds === "open" ? "#47f59a" : "#ffb547";
    if (d.y === 0) {
      px(X - 2, 0, w + 4, 16, "#0b0f1e"); // frame
      px(X - 2, 0, 2, 16, th.wallTop); px(X + w, 0, 2, 16, th.wallTop);
      px(X, 2, w, 14, "#04060d"); // dark opening
      const half = Math.round((w / 2) * (1 - openAmt));
      const panel = big ? (d.kind === "exit" ? "#6b4a2e" : "#3a4a70") : "#2b3760";
      px(X, 2, half, 14, panel); px(X + w - half, 2, half, 14, panel);
      if (half > 2) {
        px(X + half - 1, 2, 1, 14, "#0b0f1e"); px(X + w - half, 2, 1, 14, "#0b0f1e");
        for (let i = 0; i < 3; i++) { px(X + 2, 5 + i * 4, half - 4, 1, "rgba(255,255,255,.08)"); px(X + w - half + 2, 5 + i * 4, half - 4, 1, "rgba(255,255,255,.08)"); }
        if (big) { px(X + 2, 8, half - 3, 2, "#ffcc33"); px(X + w - half + 1, 8, half - 3, 2, "#ffcc33"); for (let i = 0; i < half - 3; i += 4) { px(X + 2 + i, 8, 2, 2, "#1a1a1a"); px(X + w - half + 1 + i, 8, 2, 2, "#1a1a1a"); } }
      }
      px(X + w / 2 - 2, -1 + 1, 4, 2, lightCol);
      if (ds === "locked" && half > 4) { px(X + w / 2 - 3, 9, 6, 5, "#ffcc33"); px(X + w / 2 - 2, 7, 4, 3, "#0000"); px(X + w / 2 - 2, 7, 1, 2, "#ffcc33"); px(X + w / 2 + 1, 7, 1, 2, "#ffcc33"); px(X + w / 2 - 2, 6, 4, 1, "#ffcc33"); px(X + w / 2 - 1, 11, 2, 2, "#3a2a00"); }
      if (st.hintTarget === "door:" + d.to) { const by = 22 + Math.sin(st.time * 5) * 2, bx = X + w / 2; px(bx - 1, by, 3, 6, "#ffb547"); px(bx - 3, by + 2, 7, 1, "#ffb547"); px(bx - 2, by + 1, 5, 1, "#ffb547"); px(bx, by - 1, 1, 1, "#ffb547"); }
      // warning stripes on the floor
      for (let i = 0; i < w; i += 4) px(X + i, 16, 2, 2, ds === "locked" ? "#5b2030" : "#5b4a20");
    } else {
      px(X, (ROWS - 1) * T, w, T, "#04060d"); px(X, (ROWS - 1) * T, w, 2, lightCol);
      ctx.globalAlpha = 0.4; px(X, (ROWS - 1) * T - 2, w, 2, lightCol); ctx.globalAlpha = 1;
    }
  }

  /* ----- Machines ----- */
  function ledColor(status) { return status === "solved" ? "#47f59a" : status === "available" ? (blink(6) ? "#ffb547" : "#7a5410") : "#ff4d6a"; }
  function screen(X, Y, w, h, color, status) {
    px(X, Y, w, h, "#050913");
    const on = status !== "locked";
    if (on) {
      ctx.globalAlpha = 0.85; px(X + 1, Y + 1, w - 2, h - 2, color); ctx.globalAlpha = 1;
      for (let i = 0; i < h - 2; i += 2) px(X + 1, Y + 1 + i, w - 2, 1, "rgba(0,0,0,.35)");
      const lines = Math.floor((h - 3) / 2);
      for (let i = 0; i < lines; i++) { const len = 2 + Math.floor(hash(i, Math.floor(st.time * 2), X) * (w - 5)); px(X + 2, Y + 2 + i * 2, len, 1, "rgba(255,255,255,.6)"); }
    } else { px(X + 1, Y + 1, w - 2, h - 2, "#1a1020"); px(X + 2, Y + 2, 3, 1, "#ff4d6a"); }
  }
  const SPRITES = {
    terminal(s, X, Y, w, h, th, stt) {
      px(X, Y + 6, w, h * T - 6, "#2a3352"); px(X, Y + 6, w, 2, "#46527c"); px(X + 1, Y + h * T - 2, w - 2, 2, "#141a30");
      px(X + 6, Y - 10, w - 12, 15, "#1a2036"); screen(X + 8, Y - 8, w - 16, 11, th.accent, stt);
      px(X + 4, Y + 9, w - 8, 3, "#151b2f"); for (let i = 0; i < w - 10; i += 3) px(X + 5 + i, Y + 10, 2, 1, "#5a6690");
    },
    scanner(s, X, Y, w, h, th, stt) {
      px(X, Y + 4, w, 12, "#2a3352"); px(X, Y + 4, w, 2, "#46527c");
      px(X + 3, Y - 6, w - 6, 11, "#151b2f"); screen(X + 4, Y - 5, w - 8, 8, th.a2, stt);
      const sy = Y - 5 + ((st.time * 10) % 8); if (stt !== "locked") { ctx.globalAlpha = 0.8; px(X + 4, sy, w - 8, 1, "#fff"); ctx.globalAlpha = 1; }
    },
    patchbay(s, X, Y, w, h, th, stt) {
      px(X, Y - 8, w, 24, "#232b48"); px(X, Y - 8, w, 2, "#3e4a76");
      for (let r = 0; r < 4; r++) for (let c = 0; c < 7; c++) px(X + 3 + c * 4, Y - 4 + r * 4, 2, 2, stt === "locked" ? "#3a2030" : (hash(c, r, Math.floor(st.time * 3)) < 0.5 ? th.accent : "#0d1326"));
      ctx.strokeStyle = th.a2; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(X + 4, Y + 12); ctx.quadraticCurveTo(X + w / 2, Y + 18, X + w - 4, Y + 10); ctx.stroke();
    },
    splitter(s, X, Y, w, h, th, stt) {
      px(X, Y - 4, w, 20, "#2a3352"); px(X, Y - 4, w, 2, "#46527c");
      screen(X + 3, Y - 1, w / 2 - 4, 8, th.accent, stt); screen(X + w / 2 + 1, Y - 1, w / 2 - 4, 8, th.a2, stt);
      px(X + w / 2 - 1, Y - 6, 2, 16, "#ffcc33");
    },
    reader(s, X, Y, w, h, th, stt) {
      px(X, Y - 2, w, 18, "#2a3352"); px(X, Y - 2, w, 2, "#46527c");
      px(X + 6, Y + 2, w - 12, 4, "#0b0f1e"); px(X + 8, Y, 8, 5, "#d9c47a"); px(X + 9, Y + 1, 3, 3, "#a07f2a");
      screen(X + 4, Y + 8, w - 8, 6, th.accent, stt);
    },
    archive(s, X, Y, w, h, th, stt) {
      px(X, Y - 10, w, 26, "#1b2140"); px(X, Y - 10, w, 2, "#3a4470");
      for (let r = 0; r < 5; r++) { px(X + 2, Y - 7 + r * 5, w - 4, 4, "#0c1022"); for (let c = 0; c < 6; c++) px(X + 4 + c * 4, Y - 6 + r * 5, 1, 1, stt === "locked" ? "#402030" : (blink(5 + c, r * 3 + c) ? th.accent : "#223")); }
    },
    keyrack(s, X, Y, w, h, th, stt) {
      px(X, Y - 10, w, 26, "#2b2140"); px(X, Y - 10, w, 2, "#4a3a70");
      for (let i = 0; i < 8; i++) { px(X + 2 + i * 3.6, Y - 6, 2, 9, stt === "locked" ? "#402030" : "#b48cff"); px(X + 2 + i * 3.6, Y + 5, 2, 7, "#ff7ad9"); }
    },
    keypad(s, X, Y, w, h, th, stt) {
      px(X + 2, Y, 12, 16, "#2a3352"); screen(X + 3, Y + 1, 10, 4, th.accent, stt);
      for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) px(X + 4 + c * 3, Y + 7 + r * 3, 2, 2, "#8a94b8");
    },
    forge(s, X, Y, w, h, th, stt) {
      px(X, Y, w, h * T, "#2a2448"); px(X, Y, w, 2, "#4c4280");
      px(X + 4, Y + 4, w - 8, h * T - 12, "#0b0a1c");
      const glow = stt === "locked" ? "#402030" : th.a2;
      for (let i = 0; i < 4; i++) { const yy = Y + 6 + ((st.time * 12 + i * 5) % (h * T - 16)); px(X + 6, yy, w - 12, 2, glow); }
      px(X + 2, Y + h * T - 6, w - 4, 4, "#151230");
    },
    module(s, X, Y, w, h, th, stt) {
      px(X + 2, Y - 10, w - 4, 26, "#1d3a33"); px(X + 2, Y - 10, w - 4, 2, "#357060");
      const c = stt === "solved" ? "#47f59a" : stt === "available" ? th.a2 : "#40202a";
      ctx.fillStyle = c; ctx.beginPath(); ctx.arc(X + w / 2, Y, 6, 0, Math.PI * 2); ctx.fill();
      px(X + w / 2 - 2, Y - 2, 2, 2, "rgba(255,255,255,.7)");
      px(X + 4, Y + 9, w - 8, 3, "#0b1a16");
    },
    novacore(s, X, Y, w, h, th, stt) {
      px(X + 4, Y + h * T - 8, w - 8, 8, "#3a2a3e"); px(X + 2, Y + h * T - 10, w - 4, 3, "#5b4560");
      const cy = Y + 10 + Math.sin(st.time * 2) * 2;
      ctx.fillStyle = "#34e0ff"; ctx.beginPath(); ctx.arc(X + w / 2, cy, 7, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#bff6ff"; ctx.beginPath(); ctx.arc(X + w / 2 - 2, cy - 2, 3, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "rgba(52,224,255,.5)"; ctx.beginPath(); ctx.ellipse(X + w / 2, cy, 12, 4, st.time, 0, Math.PI * 2); ctx.stroke();
    },
    holotable(s, X, Y, w, h, th) {
      px(X + 4, Y + 10, w - 8, h * T - 12, "#1c2444"); px(X + 2, Y + 8, w - 4, 4, "#3c4c80");
      ctx.globalAlpha = 0.5 + 0.2 * Math.sin(st.time * 3);
      // floating hologram of the DES pipeline: 16 little round blocks orbiting
      for (let i = 0; i < 16; i++) { const a = st.time * 0.8 + (i / 16) * Math.PI * 2; px(X + w / 2 + Math.cos(a) * 20, Y + 2 + Math.sin(a) * 6, 2, 2, i % 2 ? th.accent : th.a2); }
      px(X + w / 2 - 3, Y - 2, 6, 6, th.accent); ctx.globalAlpha = 1;
    },
    rotors(s, X, Y, w, h, th, stt) {
      px(X, Y + 2, w, h * T - 2, "#211b44"); px(X, Y + 2, w, 3, "#4c4280"); px(X + 2, Y + h * T - 4, w - 4, 4, "#151230");
      const spin = stt === "solved" ? st.time * 0.6 : stt === "available" ? st.time * 0.25 : 0;
      [[X + 16, "C"], [X + w - 16, "D"]].forEach(([cx, lab], j) => {
        const cy = Y + 22;
        ctx.fillStyle = "#0c0a22"; ctx.beginPath(); ctx.arc(cx, cy, 13, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = stt === "locked" ? "#40202a" : th.accent; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(cx, cy, 12, 0, Math.PI * 2); ctx.stroke();
        for (let i = 0; i < 28; i++) { const a = (i / 28) * Math.PI * 2 + spin * (j ? -1 : 1); px(cx + Math.cos(a) * 9, cy + Math.sin(a) * 9, 1, 1, hash(i, j) < 0.5 ? th.a2 : "#3a3570"); }
        px(cx - 1, cy - 1, 3, 3, th.accent);
      });
    },
    reactor(s, X, Y, w, h, th, stt) {
      const cx = X + w / 2, cy = Y + 22;
      px(X + 6, Y + h * T - 8, w - 12, 8, "#183a30"); px(X + 4, Y + h * T - 10, w - 8, 3, "#2f6b56");
      const power = st.reactorPower ?? 0;
      const g = ctx.createRadialGradient(cx, cy, 2, cx, cy, 20);
      g.addColorStop(0, power > 0.99 ? "#e8fff4" : "#9ab"); g.addColorStop(0.4, power > 0.99 ? "#47f59a" : `rgba(71,245,154,${0.2 + power * 0.6})`); g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, 20, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = th.accent; ctx.lineWidth = 1;
      for (let r = 0; r < 3; r++) { ctx.globalAlpha = 0.3 + power * 0.6; ctx.beginPath(); ctx.ellipse(cx, cy, 18 - r * 3, 6 + r * 2, st.time * (0.5 + power * 2) * (r % 2 ? -1 : 1) + r, 0, Math.PI * 2); ctx.stroke(); }
      ctx.globalAlpha = 1;
    },
  };

  function drawStation(s, th) {
    const status = st.statusOf(s.id);
    const X = s.x * T, Y = s.y * T, w = s.w * T, h = s.h;
    ctx.fillStyle = "rgba(0,0,0,.35)"; ctx.fillRect(X + 1, Y + h * T - 2, w - 2, 4); // shadow
    (SPRITES[s.sprite] || SPRITES.terminal)(s, X, Y, w, h, th, status);
    if (s.id !== "info") { // status LED
      px(X + w - 4, Y + h * T - 5, 3, 3, "#0b0f1e"); px(X + w - 3, Y + h * T - 4, 1, 1, ledColor(status));
    }
    const isNext = st.hintTarget === s.id;
    if (isNext) { // bobbing objective marker
      const by = Y - 18 + Math.sin(st.time * 5) * 2, bx = X + w / 2;
      px(bx - 3, by, 7, 7, "#ffb547"); px(bx - 1, by + 1, 3, 3, "#1b1200"); px(bx, by + 1, 1, 3, "#ffb547"); px(bx - 2, by + 8, 5, 1, "#ffb547"); px(bx - 1, by + 9, 3, 1, "#ffb547"); px(bx, by + 10, 1, 1, "#ffb547");
    } else if (status === "solved" && s.id !== "info") {
      const bx = X + w / 2, by = Y - 14;
      px(bx - 3, by + 2, 2, 2, "#47f59a"); px(bx - 1, by + 4, 2, 2, "#47f59a"); px(bx + 1, by + 2, 2, 2, "#47f59a"); px(bx + 3, by, 2, 2, "#47f59a");
    }
    if (st.focus === s) { ctx.strokeStyle = "rgba(255,255,255,.7)"; ctx.setLineDash([2, 2]); ctx.lineDashOffset = -st.time * 10; ctx.strokeRect(X - 1.5, Y - 10.5, w + 3, h * T + 13); ctx.setLineDash([]); }
  }

  function drawDecor(d, th) {
    const X = d.x * T, Y = d.y * T;
    if (d.t === "rack") { px(X + 1, Y - 6, 14, 22, "#141a30"); px(X + 1, Y - 6, 14, 2, "#2e3a66"); for (let r = 0; r < 5; r++) { px(X + 3, Y - 3 + r * 4, 10, 3, "#0a0e1c"); px(X + 4, Y - 2 + r * 4, 1, 1, blink(4 + r, X + r) ? th.accent : "#233"); px(X + 6, Y - 2 + r * 4, 1, 1, blink(7 + r, Y + r) ? "#47f59a" : "#233"); } }
    else if (d.t === "plant") { px(X + 4, Y + 9, 8, 7, "#5a3a2a"); px(X + 4, Y + 9, 8, 2, "#7a5040"); const g = ["#2f8f5a", "#3fbf72", "#2a6e48"]; [[2, 2], [6, -2], [9, 3], [4, 5], [8, 6], [1, 6], [11, 0]].forEach(([dx, dy], i) => px(X + dx, Y + dy, 4, 4, g[i % 3])); }
    else if (d.t === "crate") { px(X + 1, Y + 1, 14, 14, "#6b5636"); px(X + 1, Y + 1, 14, 2, "#8a7048"); px(X + 2, Y + 7, 12, 1, "#4a3a22"); px(X + 7, Y + 3, 1, 12, "#4a3a22"); }
    else if (d.t === "pillar") { px(X + 3, Y - 8, 10, 24, "#2c3a5a"); px(X + 3, Y - 8, 10, 2, "#4a5c8a"); px(X + 6, Y - 4, 4, 16, th.accent); ctx.globalAlpha = 0.25 + 0.15 * Math.sin(st.time * 2 + X); px(X + 1, Y - 6, 14, 20, th.accent); ctx.globalAlpha = 1; }
    else if (d.t === "bench") { const w = (d.w || 1) * T; px(X + 1, Y + 6, w - 2, 5, "#3a4670"); px(X + 1, Y + 6, w - 2, 1, "#56649a"); px(X + 2, Y + 11, 2, 4, "#1a2036"); px(X + w - 4, Y + 11, 2, 4, "#1a2036"); }
    else if (d.t === "lamp") { px(X + 7, Y + 4, 2, 12, "#2a3352"); px(X + 5, Y + 2, 6, 3, th.accent); }
    else if (d.t === "pipe") { px(X, Y + 4, 16, 8, "#2a4a40"); px(X, Y + 4, 16, 2, "#3f6a5c"); px(X + 6, Y + 2, 4, 12, "#1e362f"); }
  }

  /* ----- Characters ----- */
  function drawPlayer() {
    const p = st.player, X = Math.round(p.x), Y = Math.round(p.y);
    const f = p.moving ? Math.floor(p.step) % 2 : 0, bob = p.moving && f ? -1 : 0;
    ctx.fillStyle = "rgba(0,0,0,.35)"; ctx.beginPath(); ctx.ellipse(X, Y, 6, 2, 0, 0, Math.PI * 2); ctx.fill();
    const skin = "#f1c27d", hair = "#3b2a20", coat = "#e9eef8", coatS = "#b8c2dc", pants = "#2c3550", shoe = "#151a2b";
    // legs
    if (p.dir === "left" || p.dir === "right") { px(X - 3 + (f ? 2 : 0), Y - 5, 2, 5, pants); px(X + 1 - (f ? 2 : 0), Y - 5, 2, 5, pants); }
    else { px(X - 3, Y - 5 - (f ? 1 : 0), 2, 5, pants); px(X + 1, Y - 5 - (f ? 0 : 1), 2, 5, pants); }
    px(X - 3, Y - 1, 2, 1, shoe); px(X + 1, Y - 1, 2, 1, shoe);
    // coat
    px(X - 5, Y - 13 + bob, 10, 9, coat); px(X - 5, Y - 6 + bob, 10, 2, coatS);
    if (p.dir === "down") { px(X - 1, Y - 13 + bob, 2, 5, "#34e0ff"); px(X - 5, Y - 12 + bob, 1, 6, coatS); px(X + 4, Y - 12 + bob, 1, 6, coatS); px(X + 2, Y - 10 + bob, 2, 2, "#ff6b7d"); }
    if (p.dir === "up") px(X - 1, Y - 13 + bob, 2, 8, coatS);
    // arms
    const sw = p.moving ? (f ? 1 : -1) : 0;
    if (p.dir !== "left") px(X - 6, Y - 12 + bob + sw, 2, 6, coat);
    if (p.dir !== "right") px(X + 4, Y - 12 + bob - sw, 2, 6, coat);
    // head
    px(X - 4, Y - 20 + bob, 8, 7, skin);
    px(X - 4, Y - 21 + bob, 8, 3, hair);
    if (p.dir === "up") px(X - 4, Y - 20 + bob, 8, 6, hair);
    else if (p.dir === "down") { px(X - 2, Y - 17 + bob, 1, 2, "#1b1b2b"); px(X + 1, Y - 17 + bob, 1, 2, "#1b1b2b"); px(X - 4, Y - 19 + bob, 1, 3, hair); px(X + 3, Y - 19 + bob, 1, 3, hair); }
    else if (p.dir === "left") { px(X - 3, Y - 17 + bob, 1, 2, "#1b1b2b"); px(X + 1, Y - 20 + bob, 3, 5, hair); }
    else { px(X + 2, Y - 17 + bob, 1, 2, "#1b1b2b"); px(X - 4, Y - 20 + bob, 3, 5, hair); }
    // visor glasses glint
    if (p.dir === "down") { px(X - 3, Y - 17 + bob, 6, 1, "rgba(52,224,255,.6)"); }
  }

  function drawNova() {
    const n = st.nova, X = Math.round(n.x), Y = Math.round(n.y + Math.sin(st.time * 3) * 2);
    ctx.fillStyle = "rgba(0,0,0,.25)"; ctx.beginPath(); ctx.ellipse(X, Y + 22, 4, 1.5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#1a3a66"; ctx.beginPath(); ctx.arc(X, Y, 6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#34e0ff"; ctx.beginPath(); ctx.arc(X, Y, 5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#bff6ff"; ctx.beginPath(); ctx.arc(X - 2, Y - 2, 2, 0, Math.PI * 2); ctx.fill();
    const look = st.player.x > X ? 1 : -1;
    px(X - 3 + look, Y - 1, 6, 2, "#06203a"); px(X - 2 + look + (blink(0.7) ? 0 : 1), Y - 1, 2, 2, "#fff");
    px(X - 7, Y, 2, 1, "#8aa"); px(X + 5, Y, 2, 1, "#8aa");
    if (blink(9)) px(X - 1, Y + 6, 2, 2, "#34e0ff");
  }

  /* ----- Lighting ----- */
  function lighting(th) {
    ctx.fillStyle = "rgba(4,6,16,0.18)"; ctx.fillRect(0, 0, W.VW, W.VH);
    ctx.globalCompositeOperation = "lighter";
    const glow = (x, y, r, col, a) => { const g = ctx.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, col.replace(")", `,${a})`).replace("rgb(", "rgba(")); g.addColorStop(1, "rgba(0,0,0,0)"); ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2); };
    const rgb = (hex) => { const n = parseInt(hex.slice(1), 16); return `rgb(${n >> 16},${(n >> 8) & 255},${n & 255})`; };
    S[st.scene].stations.forEach((s) => {
      const stt = st.statusOf(s.id), [cx, cy] = W.stationCenter(s);
      const col = stt === "solved" ? "#47f59a" : stt === "available" ? th.accent : "#ff4d6a";
      glow(cx, cy - 6, s.sprite === "reactor" ? 50 + (st.reactorPower || 0) * 30 : 26, rgb(col), stt === "locked" ? 0.12 : 0.22);
    });
    S[st.scene].doors.forEach((d) => { const ds = st.doorState(d); glow(d.x * T + T, d.y === 0 ? 14 : W.VH - 8, 28, rgb(ds === "locked" ? "#ff4d6a" : ds === "open" ? "#47f59a" : "#ffb547"), 0.2); });
    S[st.scene].decor.forEach((d) => { if (d.t === "lamp" || d.t === "pillar") glow(d.x * T + 8, d.y * T + 2, 30, rgb(th.accent), 0.25); });
    glow(st.player.x, st.player.y - 8, 34, "rgb(180,220,255)", 0.12);
    glow(st.nova.x, st.nova.y, 22, "rgb(52,224,255)", 0.35);
    ctx.globalCompositeOperation = "source-over";
  }

  /* ----- Frame ----- */
  W.render = function () {
    const th = THEMES[st.scene];
    ctx.save();
    if (st.shake > 0) ctx.translate(Math.round((Math.random() - 0.5) * st.shake), Math.round((Math.random() - 0.5) * st.shake));
    ctx.fillStyle = "#03050c"; ctx.fillRect(-8, -8, W.VW + 16, W.VH + 16);
    drawFloor(th);
    // reactor conduits (room 3): light up as modules come online
    if (st.scene === 3) {
      const core = S[3].stations.find((s) => s.id === "r3_swap"), [cx, cy] = W.stationCenter(core);
      S[3].stations.filter((s) => s.sprite === "module").forEach((s) => {
        const [mx, my] = W.stationCenter(s), on = st.statusOf(s.id) === "solved";
        ctx.strokeStyle = on ? "#47f59a" : "#24403a"; ctx.lineWidth = 2; ctx.globalAlpha = on ? 0.6 + 0.3 * Math.sin(st.time * 6 + mx) : 0.8;
        ctx.beginPath(); ctx.moveTo(mx, my + 8); ctx.lineTo(mx, cy); ctx.lineTo(cx + Math.sign(mx - cx) * 20, cy); ctx.stroke(); ctx.globalAlpha = 1;
      });
    }
    drawWalls(th);
    S[st.scene].doors.forEach((d) => drawDoor(d, th));
    // y-sorted objects
    const objs = [];
    S[st.scene].decor.forEach((d) => objs.push({ y: d.y * T + 16, draw: () => drawDecor(d, th) }));
    S[st.scene].stations.forEach((s) => objs.push({ y: (s.y + s.h) * T, draw: () => drawStation(s, th) }));
    objs.push({ y: st.player.y, draw: drawPlayer });
    objs.sort((a, b) => a.y - b.y).forEach((o) => o.draw());
    drawNova();
    // click-path dots
    if (st.path) st.path.forEach(([x, y], i) => { if (i % 1 === 0) px(x * T + 7, y * T + 10, 2, 2, "rgba(255,255,255,.35)"); });
    lighting(th);
    st.particles.forEach((q) => { ctx.globalAlpha = Math.min(1, q.life * 2); px(q.x, q.y, q.size, q.size, q.color); });
    ctx.globalAlpha = 1;
    // scanlines + vignette for a CRT-lab feel
    ctx.fillStyle = "rgba(0,0,0,.08)"; for (let y = 0; y < W.VH; y += 2) ctx.fillRect(0, y, W.VW, 1);
    const v = ctx.createRadialGradient(W.VW / 2, W.VH / 2, W.VH * 0.4, W.VW / 2, W.VH / 2, W.VW * 0.7);
    v.addColorStop(0, "rgba(0,0,0,0)"); v.addColorStop(1, "rgba(0,0,0,.55)"); ctx.fillStyle = v; ctx.fillRect(0, 0, W.VW, W.VH);
    if (st.flash > 0) { ctx.globalAlpha = st.flash * 0.35; ctx.fillStyle = st.flashColor; ctx.fillRect(0, 0, W.VW, W.VH); ctx.globalAlpha = 1; }
    if (st.fade > 0.01) { ctx.globalAlpha = st.fade; ctx.fillStyle = "#000"; ctx.fillRect(-8, -8, W.VW + 16, W.VH + 16); ctx.globalAlpha = 1; }
    ctx.restore();
  };

  /* Title-screen backdrop: drifting binary rain over a silhouette of the lab. */
  const rain = Array.from({ length: 40 }, (_, i) => ({ x: i * 8, y: Math.random() * 192, v: 10 + Math.random() * 30 }));
  W.renderTitle = function (dt) {
    st.time += dt;
    ctx.fillStyle = "#03050c"; ctx.fillRect(0, 0, W.VW, W.VH);
    rain.forEach((r) => { r.y = (r.y + r.v * dt) % 220; for (let k = 0; k < 6; k++) { ctx.globalAlpha = 0.5 - k * 0.08; px(r.x, r.y - k * 6 - 10, 1, 4, k ? "#1c5a7a" : "#34e0ff"); } });
    ctx.globalAlpha = 1;
    // skyline of machines
    for (let x = 0; x < W.VW; x += 12) { const h = 20 + Math.floor(hash(x, 3) * 40); px(x, W.VH - h, 11, h, "#0b1228"); for (let k = 0; k < h - 6; k += 6) px(x + 3, W.VH - h + 4 + k, 1, 1, blink(3 + (x % 5), x + k) ? "#34e0ff" : "#1a2340"); }
    // floor grid
    ctx.strokeStyle = "rgba(167,123,255,.25)"; ctx.lineWidth = 1;
    for (let i = -10; i <= 30; i++) { ctx.beginPath(); ctx.moveTo(W.VW / 2 + i * 6, 150); ctx.lineTo(W.VW / 2 + i * 40, W.VH); ctx.stroke(); }
    for (let k = 0; k < 6; k++) { const y = 150 + ((k * 8 + st.time * 12) % 42); ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W.VW, y); ctx.stroke(); }
    ctx.fillStyle = "rgba(0,0,0,.1)"; for (let y = 0; y < W.VH; y += 2) ctx.fillRect(0, y, W.VW, 1);
    st.particles = st.particles.filter((q) => (q.life -= dt) > 0);
    st.particles.forEach((q) => { q.x += q.vx * dt; q.y += q.vy * dt; ctx.globalAlpha = Math.min(1, q.life); px(q.x, q.y, q.size, q.size, q.color); });
    ctx.globalAlpha = 1;
  };

  /* Virtual pixel → screen pixel for HTML overlays (labels, bubbles). */
  W.toScreen = (x, y) => [x * scale, y * scale];
})();
