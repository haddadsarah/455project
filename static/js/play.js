/* CipherBreak EDU — The 16-Round Escape: game controller.
 * Title screen → intro → explorable rooms. Walk to machines and use them; the server
 * owns every rule, answer and score. This file connects the world, the machines,
 * NOVA, the HUD, the inventory and the menus.
 */
(function () {
  "use strict";
  const B = window.CB_BOOT, W = window.World, esc = CB.esc;
  const API = `/api/attempt/${B.attemptId}`;
  const $ = (s, el) => (el || document).querySelector(s);
  const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));
  const sleep = (ms) => new Promise((r) => setTimeout(r, CB.reducedMotion() ? Math.min(ms, 60) : ms));
  const tutDone = new Set(B.tutorialsDone);
  const ARCHIVES = { keys: "r2_cycle", encrypt: "r3_swap", decrypt: "r4_round" };
  let S = null, P = null, machine = null, answer = {}, room = 0, inv = null, mode = "title";
  const ui = { machineOpen: false, dialog: null };

  /* ---------------- API ---------------- */
  async function call(url, body) {
    try { return await CB.api(url, body); }
    catch (e) { bubble("⚠ Couldn't reach the server: " + e.message + " — your last saved progress is safe."); throw e; }
  }
  async function loadState() {
    S = await CB.api(API + "/state/");
    S.tutorials_done.forEach((t) => tutDone.add(t));
    drawHud(); return S;
  }
  const puzzleInfo = (id) => { for (const r of S.rooms) { const p = r.puzzles.find((x) => x.id === id); if (p) return { r, p }; } return null; };

  /* ---------------- World status hooks ---------------- */
  W.state.statusOf = (id) => {
    if (id === "info") return "available";
    if (id.startsWith("archive:")) { const i = puzzleInfo(ARCHIVES[id.slice(8)]); return (i && i.p.solved) || B.mode === "demo" ? "solved" : "locked"; }
    const i = puzzleInfo(id); if (!i) return "locked";
    return i.p.solved ? "solved" : i.p.available ? "available" : "locked";
  };
  W.state.doorState = (d) => {
    if (!S) return "locked";
    if (d.kind === "back") return "open";
    if (W.state.scene === 0) return S.rooms[d.to - 1].status === "locked" ? "locked" : "open";
    const r = S.rooms[W.state.scene - 1];
    return r.status === "completed" ? "open" : "locked";
  };
  function updateHint() {
    const st = W.state;
    if (st.forcedHint) { st.hintTarget = st.forcedHint; return; }
    if (room === 0) { const r = S.rooms.find((x) => x.status === "available"); st.hintTarget = r ? "door:" + r.n : null; return; }
    const r = S.rooms[room - 1];
    if (r.status === "completed") { st.hintTarget = "door:" + (room < 4 ? room + 1 : "escape"); return; }
    const next = r.puzzles.find((p) => p.available && !p.solved && !p.optional);
    st.hintTarget = room === 1 && !S.attempt.access_card && B.mode !== "demo" ? "card" : next ? next.id : null;
  }
  window.Game = { reactorPower: (p) => (W.state.reactorPower = p) };

  const stationPositions = {
    info: [50,64], r1_ascii: [72,48], r1_block: [76,67], r1_ip_bit: [28,42], r1_split: [25,64],
    r2_parity: [15,37], r2_pc1_bit: [26,58], r2_split: [20,78], r2_shift: [53,48],
    r2_pc2: [79,37], r2_cycle: [78,58], "archive:keys": [81,79],
    r3_expand: [14,39], r3_xor: [29,34], r3_sbox: [67,34], r3_perm: [84,42],
    r3_feistel: [77,62], r3_swap: [52,58], r3_sbox_bonus: [23,60], "archive:encrypt": [24,81],
    r4_order: [22,44], r4_round: [28,65], r4_code: [68,43], r4_verdict: [82,63], "archive:decrypt": [75,79],
  };
  let pendingCard = false;
  const scenic = $("#cinematic-room");
  const scenicObjects = $("#cinematic-objects");
  function drawScenery() {
    const scene = W.SCENES[room];
    const target = W.state.hintTarget;
    const make = (label, icon, pos, status, active, attrs) =>
      `<button type="button" class="room-hotspot ${status} ${active ? "target" : ""}" ${attrs} style="--x:${pos[0]}%;--y:${pos[1]}%"><span class="signal" aria-hidden="true">${icon}</span><span class="label">${esc(label)}</span></button>`;
    let html = "";
    scene.stations.forEach((station, index) => {
      html += make(station.label, "▦", stationPositions[station.id],
        W.state.statusOf(station.id), station.id === target, `data-station-index="${index}"`);
    });
    scene.doors.forEach((door, index) => {
      const status = W.state.doorState(door);
      const pos = room === 0 ? [17 + index * 22,40] : door.kind === "back" ? [11,89] : [53,30];
      const label = door.kind === "back" ? "Return to lobby" : door.label;
      html += make(label, status === "open" ? "⇥" : "◇", pos,
        status === "open" ? "solved" : "locked", "door:" + door.to === target, `data-door-index="${index}"`);
    });
    if (room === 1 && !S.attempt.access_card && B.mode !== "demo") html += make("Access card", "▱", [35,82], "available", true, "data-card");
    const focus = scenicObjects.contains(document.activeElement) ? document.activeElement.textContent : null;
    scenicObjects.innerHTML = html;
    if (focus) [...scenicObjects.children].find((node) => node.textContent === focus)?.focus({preventScroll:true});
  }
  scenic.addEventListener("click", async (event) => {
    if (mode !== "play" || W.state.paused || ui.machineOpen || ui.dialog || W.state.transitioning) return;
    const scene = W.SCENES[room];
    const hotspot = event.target.closest(".room-hotspot");
    if (hotspot?.hasAttribute("data-card")) {
      if (pendingCard) return;
      pendingCard = true;
      try {
        await call(API + "/collect/", {});
        S.attempt.access_card = true;
        drawHud();
        CB.sound("open");
        bubble("Access card collected. Find it in your inventory.");
        await showInventory();
      } catch (error) {
        bubble(error.message);
      } finally { pendingCard = false; }
      return;
    }
    if (hotspot?.dataset.stationIndex !== undefined) {
      const station = scene.stations[Number(hotspot.dataset.stationIndex)];
      W.approach({type:"station", s:station});
    } else if (hotspot?.dataset.doorIndex !== undefined) {
      const door = scene.doors[Number(hotspot.dataset.doorIndex)];
      W.approach({type:"door", d:door});
    } else {
      const rect = scenic.getBoundingClientRect();
      W.walkFloor((event.clientX-rect.left)/rect.width, (event.clientY-rect.top)/rect.height);
    }
  });

  /* ---------------- HUD ---------------- */
  function drawHud() {
    const a = S.attempt;
    $("#hud-room").textContent = room ? `ROOM ${room} · ${S.rooms[room - 1].name.toUpperCase()}` : "MAIN LOBBY";
    $("#hud-score").textContent = a.score;
    $("#hud-pct").textContent = a.percent + "%"; $("#hud-bar").style.width = a.percent + "%";
    $("#hud-rooms").innerHTML = S.rooms.map((r) => `<span class="rlock ${r.status}" title="Room ${r.n}: ${esc(r.name)} — ${r.status}">${r.status === "completed" ? "✓" : r.status === "locked" ? "🔒" : r.n}</span>`).join("");
    $("#game").dataset.room = room;
    let obj = "Explore the lobby.";
    if (room === 0) { const r = S.rooms.find((x) => x.status === "available"); obj = a.status === "completed" ? "You escaped! Explore freely or open the menu." : r ? `Enter Room ${r.n}: ${r.name}` : "All rooms cleared."; }
    else {
      const r = S.rooms[room - 1], next = r.puzzles.find((p) => p.available && !p.solved && !p.optional);
      obj = room === 1 && !a.access_card && B.mode !== "demo" ? "Pick up the access card" : r.status === "completed" ? (room < 4 ? `Gate open → Room ${room + 1}` : "The exit is open. Walk out!") : next ? `${next.title} (${r.solved}/${r.required})` : "Explore the room";
    }
    $("#hud-obj").textContent = obj;
    updateHint(); drawLabels(); drawScenery();
  }
  let timerStart = Date.now();
  setInterval(() => {
    if (!S || !S.attempt.timed) return;
    const secs = S.attempt.active_seconds + Math.floor((Date.now() - timerStart) / 1000);
    $("#hud-timer-wrap").classList.remove("hidden");
    $("#hud-timer").textContent = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;
  }, 1000);

  function drawLabels() {
    const sc = W.SCENES[room];
    $("#labels").innerHTML = sc.doors.filter((d) => d.y === 0).map((d) => {
      const ds = W.state.doorState(d);
      return `<span class="dlabel ${ds}" style="left:calc(var(--s) * ${(d.x + 1) * 16}px);top:calc(var(--s) * 19px)">${ds === "locked" ? "🔒 " : ""}${esc(d.label)}</span>`;
    }).join("");
  }

  /* ---------------- NOVA speech bubble + dialogue box ---------------- */
  let bubbleTimer = null;
  function bubble(text, ms) {
    const el = $("#nova-say"); el.classList.remove("hidden"); el.querySelector("span").textContent = text;
    clearTimeout(bubbleTimer); bubbleTimer = setTimeout(() => el.classList.add("hidden"), ms || Math.max(3500, text.length * 55));
  }
  function placeBubble() {
    const el = $("#nova-say"); if (el.classList.contains("hidden")) return;
    const s = W.scale(), n = W.state.nova;
    const left = Math.min(Math.max(n.x * s, 140), W.VW * s - 140);
    el.style.left = left + "px"; el.style.top = Math.max(8, (n.y - 10) * s) + "px";
  }
  /* Typewriter dialogue: returns a promise resolved when the player finishes reading. */
  function say(lines) {
    lines = [].concat(lines);
    return new Promise((resolve) => {
      const box = $("#dialog"), text = $("#dialog-text");
      let k = 0, typing = null, full = false;
      W.state.paused = true; box.classList.remove("hidden"); ui.dialog = { next };
      function show() {
        clearInterval(typing); full = false; const t = lines[k];
        if (CB.reducedMotion()) { text.innerHTML = t; full = true; return; }
        let j = 0; text.textContent = "";
        const plain = t.replace(/<[^>]+>/g, "");
        typing = setInterval(() => { j += 2; text.textContent = plain.slice(0, j); if (j % 6 === 0) CB.sound("type"); if (j >= plain.length) { clearInterval(typing); text.innerHTML = t; full = true; } }, 18);
      }
      function next() {
        if (!full) { clearInterval(typing); text.innerHTML = lines[k]; full = true; return; }
        k++; if (k >= lines.length) return done(); show();
      }
      function done() {
        clearInterval(typing); box.classList.add("hidden"); ui.dialog = null;
        if (!ui.machineOpen) W.state.paused = false;
        $("#dialog-next").onclick = $("#dialog-skip").onclick = null; resolve();
      }
      $("#dialog-next").onclick = next; $("#dialog-skip").onclick = done;
      show(); setTimeout(() => $("#dialog-next").focus(), 30);
    });
  }
  let bannerTimer = null;
  function banner(html, ms, cls) {
    const el = $("#banner"); el.className = "banner " + (cls || ""); el.innerHTML = html;
    clearTimeout(bannerTimer); if (ms !== 0) bannerTimer = setTimeout(() => el.classList.add("hidden"), ms || 2600);
  }

  /* ---------------- Interaction prompt ---------------- */
  W.on("focus", (s) => {
    const el = $("#prompt");
    if (!s || mode !== "play") { el.classList.add("hidden"); return; }
    const stt = W.state.statusOf(s.id);
    el.classList.remove("hidden");
    el.innerHTML = `<kbd>E</kbd> ${esc(s.label)} <span class="st ${stt}">${stt === "solved" ? (s.id.startsWith("archive") ? "OPEN" : "✓ DONE") : stt === "locked" ? "🔒 LOCKED" : s.id === "info" ? "" : "● READY"}</span>`;
    el.onclick = () => interact({ type: "station", s });
  });
  W.on("interact", (t) => interact(t));
  W.on("door", (d) => throughDoor(d));
  W.on("lockeddoor", (d) => {
    CB.sound("deny"); W.shake(2);
    if (room === 0) { const r = S.rooms[d.to - 1]; bubble(`Room ${r.n} is sealed. ${r.locked_reason}`); }
    else bubble(room === 4 ? "The exit stays sealed until the exit code and my final question are answered." : `This gate opens when every machine in ${S.rooms[room - 1].name} is solved.`);
  });

  function interact(t) {
    if (mode !== "play" || ui.machineOpen || ui.dialog || W.state.transitioning) return;
    if (t.type === "door") {
      if (W.state.doorState(t.d) === "open") return throughDoor(t.d);
      return W.emit("lockeddoor", t.d);
    }
    const s = t.s, stt = W.state.statusOf(s.id);
    if (s.id === "info") return briefing();
    if (s.id === "r1_ascii" && !S.attempt.access_card && B.mode !== "demo") {
      if (document.querySelector("#game").classList.contains("floor-plan")) {
        document.querySelector("#b-view").click();
      }
      return bubble("Pick up the access card below the terminal before decoding it.");
    }
    if (s.id.startsWith("archive:")) {
      if (stt === "locked") { CB.sound("deny"); return bubble(`The archive unlocks after “${puzzleInfo(ARCHIVES[s.id.slice(8)]).p.title}”.`); }
      return openArchive(s.id.slice(8));
    }
    if (stt === "locked") {
      CB.sound("deny"); W.shake(2);
      const r = S.rooms[room - 1], next = r.puzzles.find((p) => p.available && !p.solved && !p.optional);
      return bubble(s.id === "r3_sbox_bonus" ? "The bonus S-box closed once you started the P module." : `Offline. Power it up by finishing “${next ? next.title : "the earlier machines"}” first.`);
    }
    openPuzzle(s.id);
  }

  /* ---------------- Doors and room transitions ---------------- */
  async function throughDoor(d) {
    if (W.state.transitioning) return;
    if (d.to === "escape") return escapeSequence();
    await goRoom(d.to, room);
  }
  async function goRoom(n, from) {
    const st = W.state; st.transitioning = true; st.paused = true;
    $("#game").classList.add("cinematic-transition");
    CB.sound("door"); st.fadeTarget = 1; await sleep(320);
    try { await call(API + "/room/", { room: n }); }
    catch (e) { st.fadeTarget = 0; st.transitioning = false; st.paused = false; $("#game").classList.remove("cinematic-transition"); return; }
    room = n; W.load(n, from); st.reactorPower = n === 3 ? reactorLevel() : 0;
    drawHud(); st.fadeTarget = 0; await sleep(250);
    st.transitioning = false; st.paused = false; $("#game").classList.remove("cinematic-transition");
    if (n && !tutDone.has("room" + n)) await roomIntro(n);
    else if (n) bubble(n === 4 && S.rooms[3].status === "completed" ? "The exit is open. Walk through the top door!" : ROOM_HELLO[n]);
  }
  function reactorLevel() {
    const r = S.rooms[2]; if (r.puzzles.find((p) => p.id === "r3_swap").solved) return 1;
    return r.puzzles.filter((p) => p.solved && !p.optional).length / 7;
  }
  const ROOM_HELLO = { 1: "Back in the Hex Gate. Follow the amber marker.", 2: "The Key Vault hums. Follow the marker to the next machine.", 3: "The reactor needs its modules. Follow the marker.", 4: "The Decryption Chamber. Follow the marker." };
  const ROOM_INTRO = {
    1: ["<b>Room 1 · The Hex Gate.</b> This gate opens only for a correct 64-bit DES block.",
      "DES always works on blocks of exactly <b>64 bits</b>, written as <b>16 hex digits</b>. One hex digit = 4 bits; one ASCII character = 8 bits.",
      "Four machines: the access terminal (text → hex), the block inspector, the IP patch panel, and the block splitter. Follow the amber marker!"],
    2: ["<b>Room 2 · The Key Vault.</b> This machine turns ONE 64-bit key into SIXTEEN 48-bit round keys.",
      "Only 56 key bits matter. <b>PC-1</b> drops the 8 parity bits and rearranges the rest into two halves, <b>C</b> and <b>D</b>.",
      "Each round, C and D rotate left by 1 or 2 places, then <b>PC-2</b> picks 48 bits to make that round's key."],
    3: ["<b>Room 3 · The Round Reactor.</b> It runs the DES round function F. It's offline — let's repair it module by module.",
      "One round: <b>E</b> expands R from 32 to 48 bits, <b>⊕</b> mixes in the round key, eight <b>S-boxes</b> squeeze 48 bits back to 32, and <b>P</b> scatters them.",
      "Then the <b>Feistel update</b>: new L = old R, new R = old L ⊕ F. Repair every module, then ignite the core for all 16 rounds."],
    4: ["<b>Room 4 · The Final Decryption Chamber.</b> The exit is sealed with DES ciphertext.",
      "Good news: DES decryption is the <b>same algorithm</b>. The only change: round keys run in <b>reverse</b>, K16 first and K1 last.",
      "Load the keys, run a decryption round, read the exit code from the plaintext — then I have one last question for you."],
  };
  async function roomIntro(n) {
    await say(ROOM_INTRO[n]);
    tutDone.add("room" + n); CB.api(`/api/tutorial/room${n}/`, {}).catch(() => {});
    bubble("Follow the amber marker ▼");
  }

  /* ---------------- Machines ---------------- */
  async function openPuzzle(pid) {
    try { P = await call(`${API}/puzzle/${pid}/`); } catch (e) { return; }
    showMachine();
  }
  function showMachine() {
    const back = $("#machine-back"), body = $("#mc-body");
    ui.machineOpen = true; W.state.paused = true; CB.sound("open");
    answer = {}; P.fields.forEach((f) => (answer[f.name] = ""));
    const M = { set: (k, v) => { answer[k] = String(v); updateEngage(); }, mode: B.mode };
    machine = Machines.build(P, M);
    const r = S.rooms[room - 1] || S.rooms.find((x) => x.puzzles.some((p) => p.id === P.id));
    const idx = r.puzzles.findIndex((p) => p.id === P.id);
    $("#machine").dataset.room = r.n;
    $("#mc-kicker").textContent = `ROOM ${r.n} · ${P.puzzle_optional || r.puzzles[idx].optional ? "BONUS" : `MACHINE ${idx + 1}`} · ${P.objective || ""}`;
    $("#mc-title").textContent = P.title;
    $("#mc-task").textContent = P.task;
    $("#mc-nova").textContent = P.nova || "";
    $("#mc-cost").textContent = `Up to 100 pts · −10 per wrong answer${S.attempt.hint_cost ? " · hints −10/−20/−30" : " · hints free (Guided)"}`;
    body.innerHTML = machine.html; body.scrollTop = 0;
    $("#mc-feedback").className = "mc-feedback"; $("#mc-feedback").innerHTML = "";
    $("#mc-hints").innerHTML = P.progress && P.progress.hint_level ? hintsHtml(P.hints, P.progress) : "";
    $("#mc-stamp").classList.add("hidden");
    $("#machine").classList.remove("solved", "shake");
    back.classList.remove("hidden");
    if (machine.bind) machine.bind(body);
    if (P.solved) solvedState(null);
    else { $("#mc-engage").textContent = "⚡ ENGAGE"; $("#mc-engage").onclick = engage; $("#mc-foot").classList.remove("done"); updateEngage(); }
    $("#mc-close").focus();
    if (!P.solved && B.mode === "guided" && !tutDone.has("p_" + P.id) && TUTORIALS[P.id]) setTimeout(() => puzzleTutorial(P.id), 250);
  }
  function updateEngage() {
    if (!P || P.solved) return;
    const ready = P.fields.every((f) => answer[f.name] !== "");
    $("#mc-engage").classList.toggle("ready", ready);
  }
  function closeMachine() {
    if (CB.tutorialActive && CB.tutorialActive()) return;
    $("#machine-back").classList.add("hidden"); ui.machineOpen = false; W.state.paused = false;
    const solvedNow = P && P._justSolved; const res = P && P._res;
    if (solvedNow) celebrateStation(P.id, res);
    P = null; machine = null; drawHud();
    $("#world").focus();
  }
  async function engage() {
    const missing = P.fields.filter((f) => answer[f.name] === "");
    if (missing.length) {
      CB.sound("deny");
      return feedback("info", `Set every control first: ${missing.map((f) => esc(f.label)).join(" · ")}`);
    }
    const btn = $("#mc-engage"); btn.disabled = true;
    let res;
    try { res = await call(`${API}/puzzle/${P.id}/submit/`, { answer }); }
    catch (e) { feedback("bad", esc(e.message)); btn.disabled = false; return; }
    btn.disabled = false;
    if (res.format_error) return feedback("info", "ℹ " + esc(res.feedback) + " <span class='tiny'>(Format problems never cost points.)</span>");
    if (!res.correct) {
      CB.sound("bad"); const m = $("#machine"); m.classList.remove("shake"); void m.offsetWidth; m.classList.add("shake");
      feedback("bad", `✗ ${esc(res.feedback)}${res.progress ? ` <span class="tiny">(wrong answers here: ${res.progress.wrong} · −10 each)</span>` : ""}<br><span class="tiny">Stuck? Press 💡 HINT for a guided explanation.</span>`);
      if (machine.wrong) machine.wrong($("#mc-body"), res);
      return;
    }
    CB.sound("good");
    P.solved = true; P.reveal = res.reveal; P.success = res.success; P.answer = res.answer; P._justSolved = !res.already_solved; P._res = res;
    if (machine.solved) machine.solved($("#mc-body"), res);
    (res.achievements || []).forEach((a, i) => setTimeout(() => { CB.sound("badge"); CB.toast(`<span class="ic">${a.icon}</span><b>ACHIEVEMENT · ${esc(a.name)}</b><br><span class="small">${esc(a.condition)}</span>`, 6500); }, 900 + i * 700));
    await loadState();
    solvedState(res);
    refreshInventory(true);
  }
  function solvedState(res) {
    const m = $("#machine"); m.classList.add("solved");
    const st = $("#mc-stamp"); st.classList.remove("hidden");
    if (!res) st.textContent = "SOLVED";
    else st.textContent = "ACCESS GRANTED";
    const bd = res && res.breakdown;
    feedback("good", `✓ ${esc(P.success || (res && res.success) || "Solved")}` +
      (bd ? `<div class="score-line">+${bd.points} pts <span class="tiny">(${bd.base} − ${bd.wrong_penalty} wrong − ${bd.hint_penalty} hints)</span>${res.room_bonus ? ` · ROOM BONUS +${res.room_bonus}` : ""}</div>` : P.progress ? `<div class="score-line">${P.progress.points} pts earned</div>` : "") +
      `<div class="reveal" id="mc-reveal">${revealHtml(P.reveal)}</div>`);
    if (P.id === "r4_round" && P.reveal && P.reveal.trace) CB.renderTrace($("#dec-trace"), Object.assign({ mode: "decrypt" }, P.reveal.trace));
    $("#mc-foot").classList.add("done");
    const btn = $("#mc-engage"); btn.textContent = "CONTINUE ▶"; btn.classList.add("ready"); btn.onclick = closeMachine;
    setTimeout(() => btn.focus(), 50);
  }
  function feedback(kind, html) { const f = $("#mc-feedback"); f.className = "mc-feedback show " + kind; f.innerHTML = html; f.scrollIntoView({ block: "nearest" }); }

  function revealHtml(rv) {
    if (!rv) return "";
    const v = (label, x) => x && x.hex ? `<p><b>${label}</b> <span class="mono">${x.hex}</span> ${CB.copyBtn(x.hex)}<br><span class="mono tiny">${CB.group(x.bin, x.bits === 48 ? 6 : x.bits === 56 || x.bits === 28 ? 7 : 4)}</span></p>` : "";
    switch (P.id) {
      case "r1_ascii": return `<p><b>Your 64-bit block</b> <span class="hexline">${rv.hex}</span></p>`;
      case "r1_block": return `<div class="bytes small">${rv.bytes.map((b) => `<div class="byte"><b>${b.hex}</b><span class="bn">${b.bin}</span></div>`).join("")}</div>`;
      case "r1_ip_bit": return v("Block after IP", rv.ip) + `<p class="tiny">Output ${rv.mapping.out} ← input ${rv.mapping.src}</p>`;
      case "r1_split": return `<p class="hexline"><span class="l">L0 = ${rv.l0.hex}</span> <span class="r">R0 = ${rv.r0.hex}</span></p>`;
      case "r2_parity": return `<p>Parity positions ${rv.parity_positions.join(", ")} hold <span class="mono">${rv.parity_bits}</span>. PC-1 drops them.</p>`;
      case "r2_pc1_bit": return v("PC-1 output (56 bits)", rv.pc1);
      case "r2_split": return v("C0", rv.c0) + v("D0", rv.d0);
      case "r2_shift": return v("C after rotation", rv.c) + v("D after rotation", rv.d);
      case "r2_pc2": return v(`Round key K${rv.round}`, rv.subkey);
      case "r2_cycle": return `<p>All 16 round keys forged:</p><div class="keycarts small">${rv.subkeys.map((k, i) => `<span class="kcart"><b>K${i + 1}</b><small>${k}</small></span>`).join("")}</div>`;
      case "r3_expand": return v("E(R) — 48 bits", rv.expanded);
      case "r3_xor": return v("E(R) ⊕ K — 48 bits", rv.xor);
      case "r3_sbox": case "r3_sbox_bonus": return CB.sboxCards([rv.sbox]);
      case "r3_perm": return v("F(R, K) = P(S-output)", rv.p_output);
      case "r3_feistel": return `<p class="hexline"><span class="l">L = ${rv.l.hex}</span> <span class="r">R = ${rv.r.hex}</span></p>`;
      case "r3_swap": return v("Pre-output R16‖L16", rv.preoutput) + `<p><b>Ciphertext after IP⁻¹</b> <span class="hexline">${rv.output.hex}</span> ${CB.copyBtn(rv.output.hex)}</p>`;
      case "r4_order": return `<p class="mono">${rv.order.map((k) => "K" + k).join(" → ")}</p>`;
      case "r4_round": return `<p>All 16 decryption rounds:</p><div id="dec-trace"></div>`;
      case "r4_code": return v("Recovered plaintext", rv.plain) + `<p>Exit code <b class="hexline">${esc(P.answer ? P.answer.code : "")}</b></p>`;
      case "r4_verdict": return `<p>DES: historically important and great for learning — but its 56-bit key makes it unsafe for real data today. Use AES-GCM or ChaCha20-Poly1305.</p>`;
    }
    return "";
  }

  /* After closing a freshly solved machine: sparks at the station, maybe open the gate. */
  async function celebrateStation(pid, res) {
    const s = W.SCENES[room] && W.SCENES[room].stations.find((x) => x.id === pid);
    if (s) { const [x, y] = W.stationCenter(s); W.burst(x, y - 6, ["#47f59a", "#ffffff", "#34e0ff"], 40, { speed: 70 }); }
    if (!CB.reducedMotion()) {
      W.shake(3);
      scenic.animate([{filter:"brightness(1.23)"}, {filter:"brightness(1)"}], {duration:520});
    }
    if (room === 3) W.state.reactorPower = reactorLevel();
    if (pid === "r3_swap") { W.flash("#47f59a"); W.burst(160, 90, ["#47f59a", "#e8fff4"], 80, { speed: 110 }); }
    if (res && res.room_completed) await roomCleared(res);
    else {
      const r = S.rooms[room - 1], next = r && r.puzzles.find((p) => p.available && !p.solved && !p.optional);
      if (next) bubble(`Nice! Next: ${next.title}. Follow the marker.`);
    }
    if (res && res.escaped) bubble("The exit door is open! Walk through it.");
  }
  const SUMMARY = {
    1: "You turned ASCII into a 64-bit hex block, read its bytes, applied IP, and split it into L0 and R0.",
    2: "You saw why only 56 key bits count, applied PC-1, split C0/D0, rotated the halves, and used PC-2 to forge all 16 round keys.",
    3: "You ran a whole round: E expansion, XOR with the key, S-box lookups, P, and the Feistel update — then all 16 rounds and the final swap.",
    4: "You decrypted with the same keys in reverse order, recovered the plaintext, and explained why DES is obsolete.",
  };
  async function roomCleared(res) {
    const r = S.rooms[room - 1];
    const gate = W.SCENES[room].doors.find((d) => d.y === 0);
    W.state.paused = true;
    banner(`<b>ROOM CLEARED</b><span>${esc(r.name)} · +${res.room_bonus} BONUS · ${r.score} PTS</span>`, 3200, "big");
    CB.sound("unlock"); await sleep(500);
    W.openDoor(gate); CB.sound("door"); W.shake(7);
    W.burst((gate.x + 1) * 16, 18, ["#ffb547", "#47f59a", "#ffffff"], 70, { speed: 90 });
    await sleep(1400);
    W.state.paused = false;
    await say([`<b>Learning check.</b> ${SUMMARY[room]}`, room < 4 ? `The gate to <b>${esc(S.rooms[room].name)}</b> is open. Walk through the top door when you're ready.` : "The exit door is open. Walk through it to escape!"]);
    drawHud();
  }

  /* ---------------- Hints ---------------- */
  function hintsHtml(hints, progress) {
    if (!hints || !hints.length) return "";
    const names = ["HINT 1 · CONCEPT", "HINT 2 · SIMILAR EXAMPLE", "HINT 3 · WALKTHROUGH"];
    return hints.map((h, k) => `<div class="hint"><b>${names[k]}</b><p>${esc(h)}</p></div>`).join("") +
      (progress && progress.hint_penalty ? `<p class="tiny muted">Hint penalty on this machine: −${progress.hint_penalty}</p>` : "");
  }
  async function requestHint() {
    if (!ui.machineOpen) { bubble(room ? "Walk up to a glowing machine and press E. Hints live inside each machine (💡)." : "Pick a door with a green light. Room 1 is first!"); return; }
    if (P.solved) return feedback("info", "Already solved. Use ? HOW IT WORKS or the Notebook to review.");
    const lvl = (P.progress && P.progress.hint_level) || 0;
    if (lvl >= 3) return feedback("info", "You've seen all three hints. Follow the walkthrough step by step, or replay HOW IT WORKS.");
    if (S.attempt.hint_cost && !confirm(`Hint ${lvl + 1} costs ${[10, 20, 30][lvl]} points on this machine (Challenge mode). Show it?`)) return;
    let res; try { res = await call(`${API}/puzzle/${P.id}/hint/`, {}); } catch (e) { return; }
    P.progress = P.progress || {}; P.progress.hint_level = res.level; P.progress.hint_penalty = (P.progress.hint_penalty || 0) + res.penalty;
    $("#mc-hints").innerHTML = hintsHtml(res.hints, P.progress);
    const last = $$("#mc-hints .hint").pop(); if (last) { last.classList.add("new"); last.scrollIntoView({ block: "nearest", behavior: "smooth" }); }
    CB.sound("scan");
  }

  /* ---------------- Inventory ---------------- */
  const ICONS = { card: "🪪", chip: "🔲", halves: "✂️", key: "🔑", chips: "🗝️", tape: "📼", lock: "🔒", star: "⭐" };
  const icon = (it) => ICONS[it.icon] || "📦";
  async function refreshInventory(announce) {
    let data; try { data = await CB.api(API + "/inventory/"); } catch (e) { return; }
    const old = inv ? new Set(inv.map((i) => i.id)) : null;
    inv = data.items;
    if (announce && old) {
      const fresh = inv.filter((i) => !old.has(i.id));
      fresh.forEach((it, k) => setTimeout(() => {
        CB.sound("pickup"); banner(`<span class="ico">${icon(it)}</span><b>ITEM ACQUIRED</b><span>${esc(it.name)}</span>`, 2600, "item");
        $("#inv-dot").classList.remove("hidden");
      }, 600 + k * 1800));
    }
  }
  async function showInventory() {
    await refreshInventory(false); $("#inv-dot").classList.add("hidden");
    const m = CB.modal("🎒 Inventory", `<p class="tiny muted">Everything you've recovered so far. Values are real DES results from your adventure; copy any of them.</p>
      <div class="inv-grid">${inv.map((it) => `<div class="inv-item"><div class="inv-ico">${icon(it)}</div><div><b>${esc(it.name)}</b><p class="tiny">${esc(it.desc)}</p>
        ${it.values.map(([l, x]) => `<div class="inv-val"><small>${esc(l)}</small><span class="mono">${esc(x)}</span>${CB.copyBtn(x)}</div>`).join("")}</div></div>`).join("")}</div>`);
    m.el.classList.add("game-modal");
  }

  /* ---------------- Archives, briefing, map, notebook, menu ---------------- */
  async function openArchive(kind) {
    let d; try { d = await call(`${API}/archive/${kind}/`); } catch (e) { return; }
    CB.sound("scan");
    const title = { keys: "🗄 Key archive — key expansion, round by round", encrypt: "🗄 Round archive — your block's 16 encryption rounds", decrypt: "🗄 Decryption log — 16 rounds with K16 → K1" }[kind];
    const m = CB.modal(title, `<div id="arch"></div>`); m.el.classList.add("game-modal", "wide");
    if (d.schedule) CB.renderKeySchedule($("#arch", m.el), d.schedule);
    else CB.renderTrace($("#arch", m.el), Object.assign({ mode: kind === "decrypt" ? "decrypt" : "encrypt" }, d.trace));
  }
  let briefingResolve = null;
  function briefing() {
    CB.sound("scan");
    const steps = ["64-bit block", "IP", "L0 | R0", "16 × round F", "swap", "IP⁻¹", "ciphertext"];
    const m = CB.modal("🛰 Mission briefing", `<p>The lab's exits are locked by <b>DES</b>, the Data Encryption Standard (1977). Learn how it works, machine by machine, to escape.</p>
      <div class="pipeline">${steps.map((s, i) => `<span class="pipe-step" style="--i:${i}">${s}</span>`).join("<i>→</i>")}</div>
      <div class="brief-rooms">${S.rooms.map((r) => `<div class="brief-room ${r.status}"><b>ROOM ${r.n}</b><span>${esc(r.name)}</span><small>${r.status === "completed" ? "✓ cleared" : r.status === "locked" ? "🔒 locked" : "● open"}</small></div>`).join("")}</div>
      <h3>Controls</h3><ul class="tiny"><li><kbd>WASD</kbd>/<kbd>arrows</kbd> or click/tap the floor to walk · <kbd>E</kbd>/<kbd>Enter</kbd> use a machine</li>
      <li><kbd>H</kbd> hint · <kbd>I</kbd> items · <kbd>M</kbd> map · <kbd>N</kbd> notebook · <kbd>Esc</kbd> menu</li>
      <li>The map also lets you open every machine without walking (keyboard and screen-reader friendly).</li></ul>
      <p class="disclaimer tiny">Educational simulator: DES's 56-bit key can be brute-forced. Never use DES to protect real data.</p>`, { onClose: () => { if (briefingResolve) { const r = briefingResolve; briefingResolve = null; r(); } } });
    m.el.classList.add("game-modal");
  }
  function showMap() {
    const m = CB.modal("🗺 Facility map", `<div class="map-grid">${S.rooms.map((r) => `<div class="map-room ${r.status}">
      <div class="mr-head"><b>ROOM ${r.n}</b><span>${esc(r.name)}</span><em>${r.status === "completed" ? "✓ CLEARED" : r.status === "locked" ? "🔒 LOCKED" : "● OPEN"}</em></div>
      <ol>${r.puzzles.map((p) => `<li class="${p.solved ? "ok" : p.available ? "av" : "lk"}">${p.solved ? "✓" : p.available ? "●" : "🔒"} ${esc(p.title)}${p.optional ? " ★" : ""}
        ${p.available || p.solved ? `<button type="button" class="pxbtn tiny ghost" data-use="${p.id}" data-room="${r.n}">USE</button>` : ""}</li>`).join("")}</ol>
      <p class="tiny">${r.solved}/${r.required} solved · ${r.score} pts · ${r.badge_earned ? "🏅" : "○"} ${esc(r.badge)}</p>
      ${r.status !== "locked" ? `<button type="button" class="pxbtn small" data-go="${r.n}">GO TO ROOM</button>` : `<p class="tiny muted">${esc(r.locked_reason)}</p>`}</div>`).join("")}</div>
      <h3>Achievements</h3><div class="ach-grid">${S.achievements.map((a) => `<div class="ach ${a.earned || S.user_achievements.includes(a.code) ? "on" : ""}"><span>${a.icon}</span><b>${esc(a.name)}</b><small>${esc(a.condition)}</small></div>`).join("")}</div>`);
    m.el.classList.add("game-modal", "wide");
    $$("[data-go]", m.el).forEach((b) => b.addEventListener("click", () => { m.close(); if (+b.dataset.go !== room) goRoom(+b.dataset.go, room); }));
    $$("[data-use]", m.el).forEach((b) => b.addEventListener("click", async () => {
      m.close(); const n = +b.dataset.room;
      if (n !== room) await goRoom(n, room);
      openPuzzle(b.dataset.use);
    }));
  }
  function showNotebook() {
    const page = P && P.concepts ? P.concepts[0] : "";
    const m = CB.modal("📓 Learning notebook", `<iframe src="${B.notebookUrl}?embed=1&page=${page}" title="Learning notebook"></iframe>`); m.el.classList.add("game-modal", "wide");
  }
  function howTo() {
    const m = CB.modal("❓ How to play", `<ol class="howto">
      <li><b>Explore.</b> Walk with <kbd>WASD</kbd>/<kbd>arrows</kbd>, or click/tap where you want to go. NOVA follows you.</li>
      <li><b>Use machines.</b> Walk up to a glowing machine and press <kbd>E</kbd> (or click it). Amber marker ▼ = your next machine. Green light = solved, red = locked.</li>
      <li><b>Operate them.</b> Turn dials, flip bit switches, patch cables, rotate disks, drag key cartridges — then press <b>⚡ ENGAGE</b>.</li>
      <li><b>Learn first.</b> Each room starts with a briefing, and each machine has a short interactive “How it works” lesson with a practice question.</li>
      <li><b>Score.</b> Up to 100 points per machine, −10 per wrong answer, hints −10/−20/−30 in Challenge mode (free in Guided). Room bonus +50. Format slips are free.</li>
      <li><b>Escape.</b> Clearing a room opens its gate. Clear all four and walk out the exit. Progress saves after every action.</li></ol>
      <div class="btnrow"><button type="button" class="pxbtn" id="ht-onb">↻ Replay the controls tutorial</button></div>`);
    m.el.classList.add("game-modal");
    $("#ht-onb", m.el).onclick = () => { m.close(); onboarding(true); };
  }
  async function openExplorer() {
    if (B.mode === "challenge" && S.attempt.status === "active" && S.attempt.independent) {
      if (!confirm("The DES Explorer shows complete DES calculations, which could reveal answers.\n\nIf you open it now, this attempt will be recorded as practice (not an independent challenge result). Continue?")) return;
      try { await call(API + "/flag/", {}); } catch (e) { /* continue */ }
      await loadState();
    }
    window.open(B.labUrl + (B.mode === "challenge" ? "?confirm=1" : ""), "_blank", "noopener");
  }
  function pauseMenu() {
    W.state.paused = true;
    const m = CB.modal("⏸ Paused", `<div class="pause-menu">
      <button type="button" class="pxbtn go" data-close>▶ RESUME</button>
      <button type="button" class="pxbtn" data-a="how">❓ HOW TO PLAY</button>
      <button type="button" class="pxbtn" data-a="map">🗺 MAP &amp; ACHIEVEMENTS</button>
      <button type="button" class="pxbtn" data-a="inv">🎒 INVENTORY</button>
      <button type="button" class="pxbtn" data-a="notes">📓 NOTEBOOK</button>
      <button type="button" class="pxbtn" data-a="lab">🔬 DES EXPLORER</button>
      <button type="button" class="pxbtn" data-a="settings">⚙ SETTINGS</button>
      <button type="button" class="pxbtn ghost" data-a="title">⟲ TITLE SCREEN</button>
      <button type="button" class="pxbtn ghost" data-a="restart">↻ NEW ADVENTURE</button>
      <a class="pxbtn ghost" href="${B.dashboardUrl}">⟵ SAVE &amp; QUIT TO DASHBOARD</a></div>
      <p class="tiny muted">${esc(S.attempt.label)} · progress is saved automatically.</p>`, { onClose: () => { if (!ui.machineOpen && !ui.dialog) W.state.paused = false; } });
    m.el.classList.add("game-modal", "narrow");
    $$("[data-a]", m.el).forEach((b) => b.addEventListener("click", () => {
      const a = b.dataset.a; m.close();
      ({ how: howTo, map: showMap, inv: showInventory, notes: showNotebook, lab: openExplorer, settings: CB.settingsDialog, title: showTitle,
        restart: () => { if (S.attempt.status !== "active" || confirm("Start a new adventure with new values? This unfinished attempt will be closed (results stay in your history).")) $("#restart-form").submit(); } })[a]();
    }));
  }

  /* ---------------- Tutorials (teach before the challenge) ---------------- */
  const T = (target, title, text, extra) => Object.assign({ target, title, text }, extra || {});
  const ENGAGE = T("#mc-engage", "Engage", "When every control is set, press ENGAGE. A wrong answer costs 10 points but always tells you what to check. 💡 HINT teaches the method.");
  const TUTORIALS = {
    r1_ascii: [
      T("#m-letters", "The access code", "These 8 characters are the message. Each ASCII character is stored in one byte = 8 bits."),
      T("#m-char0", "Scan a letter", "Every character has an ASCII number.", { action: "Click the first letter plate.", done: "See its decimal value, 8 bits and two nibbles." }),
      T("#m-scan", "Bits → hex", "Split the 8 bits into two groups of 4. Each group of 4 bits is ONE hex digit (0–F)."),
      T("#m-scan", "Practice", "Try a different letter first.", { practice: { question: "'A' = 65 = 0100 0001. In hex?", answer: ["41", "0X41"], placeholder: "2 hex digits", bad: "0100 → 4, 0001 → 1." } }),
      T("#m-hx-0", "Hex dials", "Each letter gets two hex dials. Click a dial and type 0–9 / A–F (focus jumps to the next dial), or use ▲▼ and the mouse wheel."),
      ENGAGE,
    ],
    r1_block: [
      T("#m-bytes", "Bytes of the block", "The block is 8 bytes. Each byte = 2 hex digits = 8 bits."),
      T("#m-bytes", "Practice", "Count the bits.", { practice: { question: "16 hex digits × 4 bits = ? bits", answer: "64" } }),
      T("#m-hb", "Dark byte", "Flip these 8 switches to that byte's bits. Convert each hex digit to 4 bits."),
      T("#m-choice", "Question lever", "Pull the lever with the correct statement."), ENGAGE,
    ],
    r1_ip_bit: [
      T("#m-src", "Input block", "These are the 64 bits of your block, numbered 1–64 (one byte per row)."),
      T("#m-ptable", "IP wiring", "Cell k of IP says which INPUT bit lands at OUTPUT position k.", { action: "Click any cell of the IP table.", done: "Its source bit lights up in the block." }),
      T("#m-ptable", "Practice", "IP begins 58, 50, 42, …", { practice: { question: "Which input bit goes to output position 2?", answer: "50", bad: "Read the 2nd entry of the table." } }),
      T("#m-socket", "Patch it", "Read the number in YOUR target cell, click that bit in the block to patch the cable, then set the value it carries. IP moves bits; values never change."), ENGAGE,
    ],
    r1_split: [
      T("#m-cutter", "Aim the laser", "DES cuts the IP output into two equal halves.", { action: "Click a gap between two digits.", done: "The halves appear in the trays." }),
      T("#m-trayL", "Practice", "", { practice: { question: "Block 0011223344556677: what is R0?", answer: "44556677" } }), ENGAGE,
    ],
    r2_parity: [
      T("#m-keybits", "The original key", "The key has 64 bits, but DES uses only 56 effective bits."),
      T("#m-keybits", "Parity bits", "The LAST bit of every byte is a parity bit for error checking. It adds no security. Click lamps to tag the parity bits."),
      T("#m-eff", "Practice", "", { practice: { question: "64 bits − 8 parity bits = ? effective bits", answer: "56" } }), ENGAGE,
    ],
    r2_pc1_bit: [
      T("#m-ptable", "PC-1", "Before the rounds, the key becomes 16 round keys. Step 1 is PC-1: it selects 56 bits and rearranges them.", { action: "Click any PC-1 cell.", done: "That key bit is highlighted." }),
      T("#m-ptable", "Practice", "PC-1 starts 57, 49, 41, …", { practice: { question: "Which key bit goes to PC-1 output position 2?", answer: "49" } }),
      T("#m-socket", "Patch it", "Patch the key bit for YOUR position and set its value."), ENGAGE,
    ],
    r2_split: [
      T("#m-cutter", "56 bits", "The PC-1 output (56 bits = 14 hex digits) splits into C0 and D0."),
      T("#m-cutter", "Practice", "", { practice: { question: "28 bits = how many hex digits?", answer: "7" } }), ENGAGE,
    ],
    r2_shift: [
      T("#m-sched", "Rotation schedule", "Each round rotates C and D left by 1 or 2. Your round is highlighted."),
      T("#m-rot-c", "Rotate a disk", "Let's do one left rotation.", { action: "Press “Rotate C left” once.", done: "The leading bit moved to the end — a circular shift!" }),
      T("#m-cwrap", "Watch the wrap", "The amber lamp started as bit 1. A left rotation moves every bit one place; bit 1 wraps to the end. Reset if you overshoot."),
      T("#m-rotors", "Practice", "", { practice: { question: "Rotate 1011000 left by 1:", answer: "0110001" } }),
      T("#m-rotors", "Your turn", "Rotate BOTH disks by your round's shift amount."), ENGAGE,
    ],
    r2_pc2: [
      T("#m-src", "C‖D", "The rotated halves are joined back into 56 bits."),
      T("#m-ptable", "PC-2", "PC-2 picks 48 of the 56 bits — 48 because the right half is expanded to 48 bits before it meets the key.", { action: "Click a PC-2 cell." }),
      T("#m-ptable", "Practice", "", { practice: { question: "PC-2 starts 14, 17, 11. Key bit 3 comes from C‖D bit…", answer: "11" } }), ENGAGE,
    ],
    r2_cycle: [
      T("#m-run", "The forge", "Now let the machine forge all 16 round keys.", { action: "Pull the lever." }),
      T("#m-kslots", "Inspect", "Click any key slot to open the inspector for that round: C, D, the shift, C‖D and the 48-bit subkey."), ENGAGE,
    ],
    r3_expand: [
      T("#m-rbits", "The right half", "F works on the 32-bit right half of the current round."),
      T("#m-esock", "Expansion E", "E has 48 sockets. The edge bits of each 4-bit group are copied twice.", { action: "Click a live (non-glowing) socket." }),
      T("#m-esock", "Practice", "E begins 32, 1, 2, 3, 4, 5", { practice: { question: "E output bit 1 is R bit…", answer: "32" } }), ENGAGE,
    ],
    r3_xor: [
      T("#m-gates", "XOR", "XOR gives 1 when the two bits DIFFER.", { practice: { question: "1 ⊕ 1 = ?", answer: "0" } }),
      T("#m-gates", "Practice", "", { practice: { question: "110010 ⊕ 011011 = ?", answer: "101001", bad: "Column by column: 1/0→1, 1/1→0…" } }),
      T("#m-gates .out", "Wire it", "Click each output lamp to set 0 or 1. A correct circuit lights up.", { action: "Click the first output lamp." }), ENGAGE,
    ],
    r3_sbox: [
      T("#m-sin", "6 bits in", "Purple = row bits (first and last). Teal = column bits (middle four)."),
      T("#m-sin", "Practice: row", "Example input 011011", { practice: { question: "Row = bits 0 and 1 → decimal?", answer: "1" } }),
      T("#m-sin", "Practice: column", "Example input 011011", { practice: { question: "Column = 1101 → decimal?", answer: "13" } }),
      T("#m-sgrid", "Look it up", "Now select YOUR row and column.", { action: "Click a cell or a header." }),
      T("#m-sbits", "Convert", "Write the cell value in 4 bits (5 → 0101)."), ENGAGE,
    ],
    r3_perm: [
      T("#m-src", "S-box output", "The eight 4-bit S-box outputs form 32 bits."),
      T("#m-ptable", "Permutation P", "P scatters them.", { action: "Click a P cell." }),
      T("#m-ptable", "Practice", "", { practice: { question: "P begins 16, 7, 20. Output bit 2 comes from S-output bit…", answer: "7" } }), ENGAGE,
    ],
    r3_feistel: [
      T("#m-router", "Feistel update", "L_i = R_(i−1) and R_i = L_(i−1) ⊕ F. Only ONE XOR is needed."),
      T("#m-outL", "Route", "Route the correct value into the new L."),
      T("#m-rd", "Practice", "XOR in hex works digit by digit through binary.", { practice: { question: "A ⊕ 3 = ? (hex)", answer: "9", bad: "1010 ⊕ 0011 = 1001." } }), ENGAGE,
    ],
    r3_swap: [
      T("#m-ignite", "Ignite", "Your modules are repaired. Run all 16 rounds.", { action: "Pull the ignition lever." }),
      T("#m-logd", "Round log", "Every value is a real DES result. Open the log to inspect E, XOR, S-boxes, P and the update of any round."),
      T(".ipinv", "Final step", "After round 16, which block enters IP⁻¹? Load the right cartridge."), ENGAGE,
    ],
    r4_order: [
      T("#m-chips", "Same keys", "Decryption uses the SAME 16 subkeys, in reverse order."),
      T("#m-chips", "Practice", "", { practice: { question: "A 3-round cipher used K1, K2, K3. Which key does decryption use first? (number)", answer: ["3", "K3"] } }), ENGAGE,
    ],
    r4_round: [
      T("#m-router", "Same round structure", "A decryption round is identical to an encryption round.", { practice: { question: "Decryption round 1 uses K…", answer: ["16", "K16"] } }),
      T("#m-kdial", "Key dial", "Set the subkey number for this round, route the new left half, and dial in the new right half."), ENGAGE,
    ],
    r4_code: [
      T("#m-plain", "Plaintext bytes", "These 8 byte pairs are ASCII characters."),
      T("#m-wheels", "Practice", "Use the ASCII reference drawer.", { practice: { question: "Hex 41 is the character…", answer: "A" } }),
      T("#m-wheels", "Letter wheels", "Click a wheel and type the letter, or turn it with ▲▼."), ENGAGE,
    ],
  };
  function puzzleTutorial(pid) {
    const steps = (TUTORIALS[pid] || []).filter((s) => !s.target || $(s.target));
    if (!steps.length) return;
    CB.tutorial("p_" + pid, steps, { done: () => tutDone.add("p_" + pid) });
  }

  /* ---------------- Intro + onboarding ---------------- */
  async function intro() {
    W.state.forcedHint = null;
    W.state.alarm = true; $("#game").classList.add("cinematic-alarm"); CB.sound("alarm");
    const flash = setInterval(() => { W.flash("#ff3050"); }, 900);
    await say(["⚠ <b>EMERGENCY LOCKDOWN</b> — CipherBreak Research Facility.",
      "An experiment triggered the lab's cipher locks. Every exit is sealed.",
      "Hello! I'm <b>NOVA</b>, the lab's research assistant. Four security systems control the exit:",
      "the <b>Hex Gate</b>, the <b>Key Vault</b>, the <b>Round Reactor</b> and the <b>Final Decryption Chamber</b>.",
      "Each one is protected by <b>DES</b>, a classic block cipher. Learn how it works, and you walk out of here."]);
    clearInterval(flash); W.state.alarm = false; $("#game").classList.remove("cinematic-alarm");
    CB.api(API + "/intro/", {}).catch(() => {});
    if (!B.preTaken && B.mode !== "demo" && !B.isInstructor) {
      await new Promise((resolve) => {
        const m = CB.modal("Optional pre-assessment", `<p>Before Room 1 you can take a 7-question check of what you already know about DES. It's optional, takes about 3 minutes, and shows you (and your instructor) what you learned afterwards.</p>
          <div class="btnrow"><a class="pxbtn go" href="${B.preUrl}">TAKE IT NOW</a><button type="button" class="pxbtn ghost" data-close>SKIP FOR NOW</button></div>`, { onClose: resolve });
        m.el.classList.add("game-modal", "narrow");
      });
    }
  }
  async function onboarding(replay) {
    await say(["I'll float beside you the whole way. Let's learn the controls.",
      "Move with <b>WASD</b> or the <b>arrow keys</b>. You can also <b>click or tap</b> the floor to walk there."]);
    if (!W.state._moved || replay) {
      W.state._moved = false;
      banner("<b>MOVE</b><span>WASD · ARROWS · CLICK THE FLOOR</span>", 0, "tip");
      await new Promise((r) => { const h = () => r(); W.on("firstmove", h); });
      $("#banner").classList.add("hidden");
    }
    W.state.forcedHint = "info"; updateHint(); drawScenery();
    await say("Nice moves! Machines glow when you can use them. Walk to the <b>holotable</b> in the middle (amber marker) and press <b>E</b> — or just click it.");
    banner("<b>USE</b><span>WALK UP · PRESS E · OR CLICK</span>", 0, "tip");
    await new Promise((r) => (briefingResolve = r));
    $("#banner").classList.add("hidden");
    W.state.forcedHint = null; updateHint(); drawScenery();
    await say(["Doors: <b>red</b> light = locked, <b>green</b> = open. Room 1, the <b>Hex Gate</b>, is the first door on the left.",
      "The top bar shows your score and escape progress, plus <b>💡 hints (H)</b>, <b>🎒 items (I)</b>, <b>🗺 map (M)</b>, <b>📓 notebook (N)</b> and the <b>menu (Esc)</b>.",
      "Every machine is worth up to 100 points: −10 per wrong answer. Format slips never cost anything. Let's go!"]);
    tutDone.add("onboarding"); CB.api("/api/tutorial/onboarding/", {}).catch(() => {});
    drawHud();
  }

  /* ---------------- Escape ---------------- */
  async function escapeSequence() {
    const st = W.state; st.transitioning = true; st.paused = true; mode = "escape";
    CB.sound("unlock"); W.flash("#ffffff"); st.fadeTarget = 1; await sleep(700);
    await loadState();
    const a = S.attempt, earned = S.achievements.filter((x) => x.earned);
    const el = document.createElement("div"); el.className = "escape-screen"; el.setAttribute("role", "dialog"); el.setAttribute("aria-labelledby", "esc-h");
    el.innerHTML = `<div class="esc-inner"><p class="t-kicker">LOCKDOWN LIFTED</p><h1 id="esc-h" class="t-logo small"><span>YOU</span><span>ESCAPED!</span></h1>
      <div class="esc-stats"><div><b>${a.score}</b><small>FINAL SCORE</small></div><div><b>${Math.max(1, Math.round(a.active_seconds / 60))} min</b><small>ACTIVE TIME</small></div>
        <div><b>${S.rooms.filter((r) => r.status === "completed").length}/4</b><small>ROOMS</small></div><div><b>${a.hints_used}</b><small>HINTS</small></div><div><b>${a.mistakes}</b><small>MISTAKES</small></div></div>
      <div class="ach-grid">${earned.map((x) => `<div class="ach on"><span>${x.icon}</span><b>${esc(x.name)}</b></div>`).join("")}</div>
      <p>You escaped by understanding DES — and learned why it should no longer protect real-world systems. Use modern authenticated encryption for real data.</p>
      <div class="btnrow center">
        <form method="post" action="/adventure/new/"><input type="hidden" name="csrfmiddlewaretoken" value="${CB.csrf()}"><input type="hidden" name="mode" value="${B.mode === "demo" ? "guided" : B.mode}"><button class="pxbtn go">↻ PLAY AGAIN (NEW VALUES)</button></form>
        <a class="pxbtn" href="${B.resultsUrl}">📊 MY RESULTS</a>
        ${B.mode !== "demo" ? `<a class="pxbtn amber" href="${B.postUrl}">📝 POST-ASSESSMENT</a>` : ""}
        <button type="button" class="pxbtn ghost" id="esc-stay">KEEP EXPLORING</button>
        <a class="pxbtn ghost" href="${B.dashboardUrl}">DASHBOARD</a></div></div>`;
    document.body.appendChild(el);
    W.confetti(); st.fadeTarget = 0.4;
    $("#esc-stay", el).onclick = () => { el.remove(); st.fadeTarget = 0; st.transitioning = false; st.paused = false; mode = "play"; W.load(4); W.state.player.y = 140; };
    $("button, a", el).focus();
  }

  /* ---------------- Title screen ---------------- */
  function showTitle() {
    mode = "title"; W.state.paused = true;
    $("#title").classList.remove("hidden"); $("#game").classList.add("on-title");
    const a = S && S.attempt;
    $("#t-start").textContent = !a || !a.intro_seen ? "▶ NEW GAME" : a.status === "completed" ? "▶ CONTINUE (ESCAPED)" : "▶ CONTINUE";
    drawSound(); setTimeout(() => $("#t-start").focus(), 50);
  }
  async function startFromTitle() {
    if (mode !== "title") return;
    $("#title").classList.add("hidden"); $("#game").classList.remove("on-title");
    CB.sound("open"); if (CB.settings.music) CB.music.start();
    mode = "play"; W.state.paused = false;
    const pos = S.attempt.position || {}, forced = +new URLSearchParams(location.search).get("room");
    room = forced && S.rooms[forced - 1] ? forced : pos.room || 0;
    if (W.state.scene !== room || !started) W.load(room);
    started = true;
    W.state.reactorPower = room === 3 ? reactorLevel() : 0;
    drawHud();
    if (!S.attempt.intro_seen) { room = 0; W.load(0); drawHud(); await intro(); }
    if (!tutDone.has("onboarding") && B.mode !== "demo" && room === 0) await onboarding();
    else if (room && !tutDone.has("room" + room)) await roomIntro(room);
    else bubble(S.attempt.status === "completed" ? "You already escaped! Explore, replay machines, or open the menu." : room ? ROOM_HELLO[room] : "Welcome back! Follow the amber marker.");
  }
  let started = false;

  /* ---------------- Sound toggles ---------------- */
  function drawSound() {
    $("#b-sound span").textContent = CB.settings.sound ? "🔊" : "🔇"; $("#b-sound").setAttribute("aria-pressed", !!CB.settings.sound);
    $("#b-music").classList.toggle("off", !CB.settings.music); $("#b-music").setAttribute("aria-pressed", !!CB.settings.music);
    $("#t-sound").textContent = CB.settings.sound ? "🔊 SOUND ON" : "🔇 SOUND OFF";
    $("#t-music").textContent = CB.settings.music ? "♫ MUSIC ON" : "♫ MUSIC OFF";
  }
  const toggleSound = () => { CB.settings.sound = !CB.settings.sound; CB.saveSettings(); drawSound(); CB.sound("click"); };
  const toggleMusic = () => { CB.settings.music = !CB.settings.music; CB.saveSettings(); if (CB.settings.music) CB.music.start(); else CB.music.stop(); drawSound(); };

  /* ---------------- Main loop ---------------- */
  let last = performance.now(), stepAcc = 0;
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (mode === "title") W.renderTitle(dt);
    else {
      W.update(dt);
      if ($("#game").classList.contains("floor-plan")) W.render();
      else {
        scenic.style.setProperty("--camera-x", ((160 - W.state.player.x) / 15) + "px");
        scenic.style.setProperty("--camera-y", ((95 - W.state.player.y) / 17) + "px");
      }
      placeBubble();
      if (W.state.player.moving) { stepAcc += dt; if (stepAcc > 0.28) { stepAcc = 0; CB.sound("step"); } }
    }
    requestAnimationFrame(frame);
  }

  /* ---------------- Keyboard ---------------- */
  function modalOpen() { return !!document.querySelector(".modal-back") || (CB.tutorialActive && CB.tutorialActive()); }
  document.addEventListener("keydown", (e) => {
    const k = e.key.toLowerCase();
    if (mode === "title") { if (k === "enter" && document.activeElement === document.body) { e.preventDefault(); startFromTitle(); } return; }
    if (mode !== "play" || modalOpen()) return;
    if (ui.dialog) { if ((k === "enter" || k === " ") && !(document.activeElement && document.activeElement.closest("#dialog"))) { e.preventDefault(); ui.dialog.next(); } return; }
    if (ui.machineOpen) {
      if (k === "escape") { e.preventDefault(); closeMachine(); }
      else if (k === "h" && !e.target.closest(".dial")) requestHint();
      return;
    }
    if ((k === "enter" || k === " ") && e.target.closest("button,a,input,select,textarea")) return;
    if (["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(k)) e.preventDefault();
    if ((k === "e" || k === "enter" || k === " ") && W.state.focus) { e.preventDefault(); interact({ type: "station", s: W.state.focus }); }
    else if (k === "i") showInventory();
    else if (k === "m") showMap();
    else if (k === "n") showNotebook();
    else if (k === "h") requestHint();
    else if (k === "escape") pauseMenu();
  });
  // On-screen pad for touch screens
  $$("#touchpad button").forEach((b) => {
    const k = b.dataset.k;
    const down = (e) => { e.preventDefault(); if (k === "e") { if (W.state.focus) interact({ type: "station", s: W.state.focus }); return; } W.state.keys[k] = true; };
    const up = () => { W.state.keys[k] = false; };
    b.addEventListener("pointerdown", down); b.addEventListener("pointerup", up); b.addEventListener("pointerleave", up);
  });

  /* ---------------- Boot ---------------- */
  async function boot() {
    W.init($("#world"));
    W.onFit = (s) => $("#stage").style.setProperty("--s", s);
    W.fit();
    $("#b-hint").onclick = requestHint; $("#b-inv").onclick = showInventory; $("#b-map").onclick = showMap;
    $("#b-notes").onclick = showNotebook; $("#b-menu").onclick = pauseMenu;
    $("#b-view").onclick = () => {
      const floor = $("#game").classList.toggle("floor-plan");
      $("#b-view").setAttribute("aria-pressed", String(floor));
      W.fit();
    };
    $("#b-sound").onclick = toggleSound; $("#b-music").onclick = toggleMusic;
    $("#t-sound").onclick = toggleSound; $("#t-music").onclick = toggleMusic;
    $("#t-start").onclick = startFromTitle; $("#t-how").onclick = howTo; $("#t-settings").onclick = CB.settingsDialog;
    $("#mc-close").onclick = closeMachine; $("#mc-hint").onclick = requestHint; $("#mc-tut").onclick = () => P && puzzleTutorial(P.id);
    $("#machine-back").addEventListener("click", (e) => { if (e.target.id === "machine-back") closeMachine(); });
    document.addEventListener("cb-settings", drawSound);
    if ("ontouchstart" in window) $("#game").classList.add("touch");
    requestAnimationFrame(frame);
    try { await loadState(); } catch (e) { $("#t-start").disabled = true; $(".t-press").textContent = "Could not load your adventure: " + e.message; return; }
    refreshInventory(false);
    W.load(0);
    showTitle();
    if (new URLSearchParams(location.search).get("skiptitle") === "1") startFromTitle();
  }
  document.addEventListener("DOMContentLoaded", boot);
})();
