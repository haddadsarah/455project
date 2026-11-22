"use strict";

const hotspots = [
  [
    ["card", "Access card", 28, 73, "▱"], ["terminal", "Access terminal", 70, 54, "▦"],
    ["ip-unit", "IP switchboard", 38, 46, "⌗"],
  ],
  [
    ["key-bank", "Key bank", 20, 68, "⌗"], ["pc1-unit", "PC-1 control", 30, 39, "◉"],
    ["disks", "Rotation disks", 54, 55, "◎"], ["pc2-unit", "PC-2 control", 80, 48, "◈"],
  ],
  [
    ["expansion", "Expansion", 16, 63, "↔"], ["xor-unit", "XOR relay", 26, 40, "⊕"],
    ["sboxes", "S-box array", 44, 32, "▦"], ["p-unit", "P router", 60, 42, "⌗"],
    ["feistel-unit", "Feistel XOR", 73, 60, "⊕"], ["registers", "Registers", 86, 43, "⇄"],
  ],
  [
    ["schedule", "Subkey console", 27, 56, "⇄"], ["decrypt-unit", "Decryption terminal", 56, 62, "▦"],
    ["verdict-unit", "Security console", 79, 49, "◈"],
  ],
];
const summaries = [
  "You decoded an ASCII block, routed the initial permutation, and split its output into L₀ and R₀.",
  "You removed parity, split the PC-1 result, rotated C and D, and applied PC-2 to generate a round key.",
  "You powered Expansion, XOR, S-boxes, P, and the Feistel register update. The reactor can now process all sixteen rounds.",
  "You reversed the subkeys, recovered the access code, and recognized the limits of single DES.",
];
const outcomes = {
  LO1: "Represent data and DES blocks", LO2: "Explain the 56-bit effective key",
  LO3: "Generate round subkeys", LO4: "Trace a Feistel round", LO5: "Use an S-box",
  LO6: "Reverse the subkeys and decrypt", LO7: "Evaluate legacy DES security",
};
const guide = [
  ["card", "Inspect the access card", "Select the highlighted card to pick it up. Clues you collect stay in your inventory."],
  ["inventory", "Open your inventory", "Select Inventory in the HUD to inspect the access card again."],
  ["terminal", "Approach the terminal", "Select the highlighted terminal. Each machine gives you a lesson and a signal to repair."],
  ["objective", "Read your objective", "The objective at the bottom of the room points to your next operation. Your score and room progress are in the HUD."],
  ["help", "Ask NOVA", "Select Hint to open NOVA. In Guided mode, use the practice signal before applying the same operation to your mission."],
  ["notebook", "Open your DES notebook", "Select Notebook to revisit concepts. The game saves your values and progress in this browser. Mission menu lets you leave and resume."],
];

let panel = "";
let practiceFeedback = "";
let lessonPhase = null;
let selection = { bits: [], cell: null, shift: null };
let lastFocus = "";
let audio;
let dispatching = false;

function currentLesson(task) {
  const base = lessons[task.id];
  if (task.id !== "ascii") return base;
  const [first, second] = game.code;
  const decimal = first.charCodeAt(0);
  const nibble = bits(decimal, 8);
  const next = second.charCodeAt(0);
  return [base[0], base[1], base[2], [
    first + " → ASCII " + decimal,
    decimal + " → " + nibble.slice(0,4) + " " + nibble.slice(4),
    "Convert each four-bit group → " + hex(decimal, 8),
  ], "Convert the second character, " + second + ". Decimal " + next + " is binary " +
    bits(next, 8).replace(/(.{4})(.{4})/, "$1 $2") + ". Enter its two hexadecimal digits.",
  hex(next, 8)];
}

function hotButton(id, name, x, y, icon, active, done = false) {
  const spotlight = game.mode === "guided" && guide[saved.onboarding]?.[0] === id && game.room === 0;
  return '<button class="hotspot' + (active ? " is-active" : "") + (done ? " is-powered" : "") +
    (spotlight ? " guide-target" : "") + '" type="button" data-hot="' + id + '" style="--x:' + x + '%;--y:' + y +
    '%" aria-label="' + escapeHtml(name) + '"><span class="hotspot-icon" aria-hidden="true">' + icon +
    '</span><span class="hotspot-label">' + escapeHtml(name) + '</span></button>';
}

function renderHome() {
  const available = game && game.room < 4;
  const history = saved.history.map((item) => '<li><strong>' + escapeHtml(item.mode === "guided" ? "Guided" : "Challenge") +
    '</strong><span>' + item.rooms + '/4 rooms · ' + item.score + ' pts</span></li>').join("");
  main.innerHTML = '<section class="hero"><div class="shell hero-inner"><div class="hero-copy"><p class="overline"><span class="status-light"></span> RESEARCH FACILITY IN LOCKDOWN</p><h1><span>The 16-Round</span><br><em>Escape.</em></h1><p class="hero-intro">Explore four rooms, repair the DES machines, and find the way out.</p><div class="actions">' +
    (available ? '<button class="button button-green" data-go="resume">Resume mission</button>' :
      game?.room === 4 ? '<button class="button button-ghost" data-go="resume">View last results</button>' : '') +
    '<button class="button ' + (available ? "button-ghost" : "button-green") + '" data-go="mode">Start new mission</button><a class="button button-ghost" href="#lab">DES laboratory</a></div></div></div></section>' +
    '<section class="shell home-rooms"><div class="room-gallery">' + rooms.map(([name, theme, place, goal]) =>
      '<article class="gallery-card theme-' + theme + '"><div class="gallery-art" aria-hidden="true"></div><div class="gallery-info"><p class="room-index">' +
      place + '</p><h3>' + name + '</h3><p>' + goal + '</p></div></article>').join("") + '</div>' +
    (history ? '<section class="card history"><h2>Previous missions</h2><ul>' + history + '</ul></section>' : '') +
    '<dialog id="mode-dialog" class="field-dialog"><form method="dialog"><button class="field-close" aria-label="Close mission choices">×</button></form><h2>Choose a mission</h2><p>Guided mode includes a worked example and a practice signal at each machine. Challenge mode opens the independent task immediately. Both modes save scores separately.</p><div class="actions"><button type="button" class="button button-green" data-go="guided">Guided mode</button><button type="button" class="button button-ghost" data-go="challenge">Challenge mode</button></div></dialog></section>';
}

function renderEducators() {
  main.innerHTML = '<div class="shell page-stack"><header class="page-heading"><p class="overline">FOR EDUCATORS</p><h1>Teach DES <em>one operation at a time.</em></h1><p>CipherBreak EDU is designed for university cryptography courses and cybersecurity training. Students receive immediate feedback as they perform the same operations that drive the cipher.</p></header><div class="three-col"><section class="card"><h2>Demonstrate</h2><p>Project the DES laboratory and compare the same block and key across all sixteen rounds.</p><a href="#lab">Open the lab</a></section><section class="card"><h2>Practice</h2><p>Have students work through guided examples before completing randomized mission challenges.</p><a href="#home">Start a mission</a></section><section class="card"><h2>Review</h2><p>The self-hosted edition includes accounts, classroom assignments, pre/post assessments, outcome tracking, and CSV export.</p><a href="https://github.com/haddadsarah/455project#readme">Open the instructor setup guide</a></section></div><p>Use the activity to study a historical algorithm. DES’s 56-bit key is insecure for modern use.</p></div>';
}

function renderVictory() {
  const misses = Object.entries(game.roomMistakes).map(([code, count]) => '<li>' + escapeHtml(outcomes[code]) + ' · ' + count + ' retries</li>').join("");
  main.innerHTML = '<div class="field-stage theme-exit field-victory"><div class="field-backdrop"></div><div class="victory-card"><div class="nova-indicator"><span aria-hidden="true">✳</span>NOVA</div><p class="overline">LOCKDOWN ENDED</p><h1>You escaped <em>the Cipher Lab!</em></h1><p>All four rooms are powered. Your mission report is saved in this browser.</p><div class="stat-grid"><div class="stat"><span>Score</span><strong>' +
    game.score + '</strong></div><div class="stat"><span>Mode</span><strong>' + (game.mode === "guided" ? "Guided" : "Challenge") +
    '</strong></div><div class="stat"><span>Mistakes</span><strong>' + game.misses + '</strong></div><div class="stat"><span>Hints</span><strong>' +
    game.hints + '</strong></div></div><h2>Achievements</h2><ul class="field-badges">' + game.achievements.map((badge) => '<li>' + escapeHtml(badge) + '</li>').join("") +
    '</ul>' + (misses ? '<details><summary>Review your toughest topics</summary><ul>' + misses + '</ul></details>' : '') +
    '<div class="actions"><a class="button button-green" href="#home">Mission menu</a><a class="button button-ghost" href="#lab">Inspect DES rounds</a></div></div></div>';
}
function advanceGuide(target) {
  if (game.mode !== "guided" || game.room !== 0 || guide[saved.onboarding]?.[0] !== target) return;
  saved.onboarding += 1;
  save();
}
function renderRoom(focus = lastFocus) {
  if (!game) { location.hash = "#home"; return; }
  if (game.room === 4) { renderVictory(); return; }
  const task = currentTask();
  const ready = !task;
  const [name, theme, place, goal] = rooms[game.room];
  const activeGuide = game.mode === "guided" && game.room === 0 ? guide[saved.onboarding] : null;
  const collectFirst = game.room === 0 && !game.inventory.includes("card");
  const progress = requiredTasks().filter((task) => game.done.includes(task.id)).length;
  const hudButton = (id, label) => '<button class="hud-control' + (activeGuide?.[0] === id ? " guide-target" : "") +
    '" type="button" data-hot="' + id + '">' + label + '</button>';
  const scene = hotspots[game.room].map(([id, label, x, y, icon]) => {
    const done = game.done.some((solved) => mission().tasks[game.room].find((operation) => operation.id === solved)?.machine === id);
    if (id === "card" && !collectFirst) return "";
    return hotButton(id,label,x,y,icon,collectFirst ? id === "card" : id === task?.machine,done);
  }).join("");
  const reactor = game.room === 2 ? '<ol class="reactor-rail" aria-label="Reactor status">' + hotspots[2].map(([id, label]) => {
    const powered = mission().tasks[2].some((operation) => operation.machine === id && game.done.includes(operation.id));
    return '<li class="' + (powered ? "is-powered" : "") + '">' + (powered ? "✓ " : "○ ") + label + '</li>';
  }).join("") + '</ol>' : "";
  main.innerHTML = '<div class="field-stage theme-' + theme + (ready ? ' door-ready' : '') + (panel ? ' field-approach' : '') +
    '"><div class="field-backdrop" aria-hidden="true"></div><div class="field-light" aria-hidden="true"></div><div class="field-particles" aria-hidden="true"></div>' +
    '<header class="field-hud"><div class="hud-location"><span>LAB ' + (game.room + 1) + ' / 4 · ' + place + '</span><h1>' + name + '</h1></div>' +
    '<div class="hud-stats"><span><strong>' + game.score + '</strong> pts</span><span><strong>' + progress + '/' + requiredTasks().length +
    '</strong> circuits</span></div><nav aria-label="Mission controls">' + hudButton("inventory", "Inventory " + game.inventory.length) +
    hudButton("help", "Hint") + hudButton("notebook", "Notebook") + hudButton("pause", "Pause") + '</nav></header>' +
    '<div class="field-hotspots" aria-label="Room objects">' + scene +
    hotButton("door", ready ? "Open door" : "Inspect door", game.room === 0 ? 51 : 69, 76, ready ? "▰" : "◇", ready) +
    '</div>' + reactor + '<div class="field-objective' + (activeGuide?.[0] === "objective" ? " guide-target" : "") +
    '"><span class="objective-orb" aria-hidden="true">✳</span><div><p class="overline">NOVA · OBJECTIVE</p><p>' +
    escapeHtml(ready ? "Access granted. Approach the door." : collectFirst ? "Inspect the glowing access card to begin." : task.title) +
    '</p></div>' + (activeGuide?.[0] === "objective" ? '<button class="button button-small button-green" data-hot="objective">Read objective</button>' : '') + '</div>' +
    (activeGuide && !panel ? '<aside class="field-coach" aria-label="How to play"><p class="overline">NOVA · GUIDE ' + (saved.onboarding + 1) +
    ' / ' + guide.length + '</p><strong>' + activeGuide[1] + '</strong><p>' + activeGuide[2] + '</p><button class="nav-text" data-go="skip-guide">Skip onboarding</button></aside><div class="field-dim" aria-hidden="true"></div>' : '') +
    '<dialog class="field-dialog" id="room-dialog" aria-label="Room console"><div class="field-dialog-content"><button type="button" class="field-close" data-go="close" aria-label="Return to room">×</button><div id="panel-content"></div></div></dialog>' +
    '<p class="sr-only" aria-live="polite">' + escapeHtml(game.feedback || goal) + '</p></div>';
  if (panel) {
    updatePanel(task, focus);
  } else if (focus) {
    main.querySelector('[data-hot="' + CSS.escape(focus) + '"]')?.focus({preventScroll:true});
  }
}
function closePanel() {
  panel = "";
  practiceFeedback = "";
  lessonPhase = null;
  renderRoom();
}
function openPanel(id) {
  panel = id;
  practiceFeedback = "";
  lessonPhase = null;
  renderRoom();
}
const hexKeys = () => '<div class="keypad" aria-label="Hexadecimal keypad">' +
  [..."0123456789ABCDEF"].map((value) => '<button type="button" data-digit="' + value + '">' + value + '</button>').join("") +
  '<button type="button" data-digit="back">⌫ <span class="sr-only">Backspace</span></button></div>';
const asciiReference = () => '<details class="plain-details"><summary>ASCII reference</summary><div class="ascii-grid">' +
  [..."0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"].map((letter) => '<p><code>' + hex(letter.charCodeAt(0), 8) + '</code> ' + letter + '</p>').join("") +
  '</div></details>';

function taskControls(task) {
  if (task.type === "ascii") {
    return '<div class="byte-list" aria-label="Eight access card characters">' + [...game.code].map((letter, i) =>
      '<button type="button" data-byte="' + letter + '" aria-label="Inspect character ' + (i + 1) + ', ' + letter + '">' + letter + '</button>').join("") +
      '</div><p class="inspect-output" data-inspected aria-live="polite">Inspect each character to see its decimal number and binary bits.</p>';
  }
  if (task.type === "recover") return asciiReference();
  if (task.type === "parity") {
    return '<div class="byte-lanes" aria-label="Binary key bytes with the last bit of each byte highlighted">' +
      bits(parse(game.key), 64).match(/.{8}/g).map((byte) => '<code>' + byte.slice(0, 7) + '<mark>' + byte[7] + '</mark></code>').join("") + '</div>';
  }
  if (task.type === "map") {
    const near = task.table.slice(Math.max(0,task.target - 4), Math.max(0,task.target - 4) + 9);
    const start = Math.max(0,task.target - 4);
    return '<div class="wire-target"><p>Click a source bit or drag it onto the output socket.</p><div class="signal-chips">' +
      [...bits(task.input,task.inputWidth)].map((bit, i) => '<button type="button" draggable="true" data-source-bit="' + (i + 1) +
      '" aria-label="Input position ' + (i + 1) + ', bit ' + bit + '">' + (i + 1) + '<small>' + bit + '</small></button>').join("") +
      '</div><div class="wire-socket" data-drop-socket>Output ' + (task.target + 1) + ' <strong data-wire>Unwired</strong></div></div>' +
      '<details class="plain-details"><summary>Open wiring diagram</summary><div class="reference-positions">' +
      near.map((position, i) => '<div' + (start + i === task.target ? ' class="target-bit"' : "") +
      '><small>Out ' + (start + i + 1) + '</small><code>In ' + position + '</code></div>').join("") + '</div></details>';
  }
  if (task.type === "rotate") {
    const { sub } = mission();
    const shift = selection.shift;
    const c = shift ? rotate(sub.oldC, shift) : sub.oldC;
    const d = shift ? rotate(sub.oldD, shift) : sub.oldD;
    return '<div class="disk-pair"><div class="disk ' + (shift ? "turn-disk" : "") + '"><span>C</span></div><div class="disk ' +
      (shift ? "turn-disk" : "") + '"><span>D</span></div></div><div class="actions"><button type="button" class="button button-ghost" data-shift="1">Rotate left by 1</button><button type="button" class="button button-ghost" data-shift="2">Rotate left by 2</button></div>' +
      valueGrid([["C register", hex(c,28)], ["D register", hex(d,28)]]) +
      '<details class="plain-details"><summary>Round shift schedule</summary><div class="shift-grid">' +
      tables.SHIFTS.map((count, i) => '<div' + (i + 1 === sub.n ? ' class="target-bit"' : "") + '><small>K' + (i + 1) +
      '</small><strong>' + count + '</strong></div>').join("") + '</div></details>';
  }
  if (task.type === "xor") {
    return valueGrid([["Expanded signal", task.a], ["Subkey signal", task.b]]) +
      '<div class="xor-switches">' + [...task.a].map((bit, i) => '<div><span>' + bit + ' ⊕ ' + task.b[i] + '</span>' +
      '<button type="button" class="button button-ghost" data-switch="' + i + '" aria-label="Output switch ' + (i + 1) +
      '" aria-pressed="' + (selection.bits[i] === "1") + '">' + (selection.bits[i] ?? "–") + '</button></div>').join("") + '</div>';
  }
  if (task.type === "sbox") {
    const colHead = Array.from({length:16}, (_, i) => '<th scope="col">' + i + '</th>').join("");
    let selected = selection.cell?.split(",");
    return '<div class="sbox-input" aria-label="Six-bit input ' + task.box.input + '">' + [...task.box.input].map((bit, i) =>
      '<span class="' + (i === 0 || i === 5 ? "row-bit" : "column-bit") + '">' + bit + '</span>').join("") +
      '</div><div class="sbox-form"><label>Decimal row<input type="number" min="0" max="3" name="row" required></label>' +
      '<label>Decimal column<input type="number" min="0" max="15" name="column" required></label></div><div class="table-scroll"><table class="sbox"><thead><tr><th scope="col">Row / Col</th>' +
      colHead + '</tr></thead><tbody>' + tables.S_BOXES[task.box.box].map((row, i) => '<tr><th scope="row">' + i + '</th>' +
      row.map((value, j) => '<td><button type="button" data-cell="' + [i,j,value].join(",") +
      '" aria-label="Row ' + i + ', column ' + j + ', value ' + value + '" aria-pressed="' +
      (selected?.[0] === String(i) && selected?.[1] === String(j)) + '">' + value + '</button></td>').join("") +
      '</tr>').join("") + '</tbody></table></div><p data-cell-status aria-live="polite">Select the matching cell.</p>';
  }
  return "";
}

function challenge(task) {
  const textField = !task.choices && task.type !== "sbox" && task.type !== "xor";
  return '<div class="nova-indicator"><span aria-hidden="true">✳</span><span>NOVA · ' + lessons[task.id][0] + ' · APPLY</span></div><h2>' +
    task.title + '</h2><p>' + task.prompt + '</p>' + (task.values ? valueGrid(task.values) : "") +
    '<form data-apply class="puzzle-form console-form">' + taskControls(task) +
    (task.choices ? '<fieldset><legend class="sr-only">Choose an answer</legend>' + task.choices.map(([id, label]) =>
      '<label class="option-label"><input type="radio" name="answer" value="' + id + '" required> ' + label + '</label>').join("") + '</fieldset>' : "") +
    (textField ? '<label for="typed-answer">Answer</label><input id="typed-answer" name="answer" required maxlength="36" autocomplete="off" spellcheck="false">' : "") +
    (["ascii","rotate","recover"].includes(task.type) ? hexKeys() : "") +
    '<div class="actions"><button class="button button-green" type="submit">Verify signal</button><button type="button" class="button button-ghost" data-go="review">Replay lesson</button><button type="button" class="nav-text" data-hot="help">Ask NOVA</button></div></form>' +
    (practiceFeedback ? '<p class="notice error" role="status">' + escapeHtml(practiceFeedback) + '</p>' : "") +
    (game.feedback.startsWith("Try again") ? '<p class="notice error" role="status">' + escapeHtml(game.feedback) + '</p>' : "");
}
function sequenceMarkup(reverse) {
  const data = reverse ? mission().dec : mission().enc;
  return '<div class="round-run"><p>Follow the sixteen rounds ' + (reverse ? "from K16 to K1" : "from K1 to K16") +
    '.</p><div class="sequence-track">' + data.rounds.map((r) => '<span>K' + r.subkey.n + '</span>').join("") +
    '</div><button type="button" class="button button-small button-ghost" data-go="run-trace">Run sixteen rounds</button>' +
    '<p data-trace-out hidden aria-live="polite">' + (reverse ? "Plaintext" : "Ciphertext") + ' <code>' +
    data.output + '</code></p><a href="#lab" data-go="mission-trace">Inspect all rounds and subkeys</a></div>';
}
function updatePanel(task, focus) {
  const dialog = main.querySelector("#room-dialog");
  let content;
  if (panel === "instrument" && task) {
    const phase = lessonPhase ?? (game.mode === "challenge" ? 3 : game.phase);
    content = phase < 3 ? window.CipherLesson.lessonCard(currentLesson(task), phase, practiceFeedback) : challenge(task);
  } else if (panel === "feedback") {
    const previous = mission().tasks[game.room].find((operation) => operation.id === game.lastVerified);
    const concept = previous ? lessons[previous.id][2] : "";
    const boxes = previous?.id === "sbox" ? valueGrid(mission().round.sboxes.map((box) =>
      ["S" + (box.box + 1) + " · " + box.input, bits(box.result, 4)]).concat([["Combined output", hex(mission().round.combined, 32)]])) : "";
    const decrypted = previous?.id === "decrypt" ? sequenceMarkup(true) : "";
    content = '<div class="nova-indicator"><span aria-hidden="true">✳</span>NOVA · FEEDBACK</div><h2>Signal verified.</h2><p>' +
      escapeHtml(game.feedback) + '</p><p>' + concept + '</p>' + boxes + decrypted +
      '<button type="button" class="button button-green" data-go="close">Return to room</button>';
  } else if (panel === "inventory") {
    content = '<h2>Inventory</h2>' + (game.inventory.includes("card") ?
      '<div class="inventory-card"><span aria-hidden="true">▱</span><div><strong>Facility access card</strong><p><code>' + game.code +
      '</code></p></div></div><p>Use the eight-character code in the Hex Gate terminal. You can inspect its individual bytes there.</p>' :
      '<p>Inspect room objects to collect clues.</p>');
  } else if (panel === "notebook") {
    const ids = mission().tasks.slice(0,game.room + 1).flat().filter((t) => !t.optional).map((t) => t.id);
    content = '<h2>DES notebook</h2><p>Revisit concepts from rooms you’ve entered.</p><div class="notebook-list">' + ids.map((id) => {
      const [objective, title, concept, example] = lessons[id];
      return '<details><summary>' + title + ' · ' + objective + '</summary><p>' + concept + '</p><p><code>' + example.join(" → ") + '</code></p></details>';
    }).join("") + '</div><a href="#lab" data-go="mission-trace">Open mission trace</a>';
  } else if (panel === "help") {
    const examples = task ? currentLesson(task)[3].join(" → ") : "";
    const transcript = task ? [lessons[task.id][2], examples, task.tip] : [];
    content = '<div class="nova-indicator"><span aria-hidden="true">✳</span>NOVA</div><h2>Mission help</h2>' +
      (task ? '<p>Current operation: ' + task.title + '.</p>' : '<p>You verified all required signals. The door is ready.</p>') +
      (game.hintLevel ? '<ol class="hint-list">' + transcript.slice(0,game.hintLevel).map((line) => '<li>' + escapeHtml(line) + '</li>').join("") + '</ol>' : "") +
      (task && game.hintLevel < 3 ? '<button type="button" class="button button-ghost" data-go="hint">Reveal hint ' +
      (game.hintLevel + 1) + ' · −10 pts</button>' : "") +
      (task ? '<button type="button" class="button button-ghost" data-go="review">Open lesson</button>' : "");
  } else if (panel === "pause") {
    content = '<h2>Mission paused</h2><p>Your current room, puzzle, and practice step are saved.</p><label for="volume">Sound volume</label>' +
      '<input type="range" id="volume" min="0" max="50" value="' + saved.audio + '">' +
      '<p>Volume starts muted. The game follows your device’s reduced-motion setting.</p><div class="actions"><button type="button" class="button button-green" data-go="close">Resume</button>' +
      '<button type="button" class="button button-ghost" data-go="guide">Replay How to Play</button><a class="button button-ghost" href="#home">Mission menu</a></div>';
  } else if (panel === "guide") {
    content = '<h2>How to play</h2><ul>' + guide.map((step) => '<li><strong>' + step[1] + '.</strong> ' + step[2] + '</li>').join("") + '</ul>' +
      '<button type="button" class="button button-green" data-go="close">Return to room</button>';
  } else if (panel === "door") {
    const ready = !task;
    content = '<p class="overline">' + (ready ? "ACCESS GRANTED" : "LOCK ENGAGED") + '</p><h2>' +
      (ready ? badges[game.room] : "Security door") + '</h2><p>' +
      (ready ? summaries[game.room] : "This door unlocks when you finish " + task.title + " and the remaining room operations.") + '</p>' +
      (ready && game.room >= 2 ? sequenceMarkup(game.room === 3) : "") +
      (ready && game.room === 1 ? '<p>' + mission().enc.keys.length + ' subkeys are online.</p><div class="sequence-track key-indicators">' +
      mission().enc.keys.map((key) => '<span class="lit">K' + key.n + '</span>').join("") +
      '</div><a href="#lab" data-go="mission-trace">Inspect all 16 subkeys</a>' : "") +
      (ready ? '<div class="actions"><button type="button" class="button button-green" data-go="next">' +
      (game.room === 3 ? "Open the exit" : "Enter next room") + '</button>' +
      (game.room === 2 && !game.done.includes("advanced") ? '<button type="button" class="button button-ghost" data-go="optional">Try bonus S-box</button>' : "") +
      '</div>' : "");
  } else {
    const id = panel.replace("machine:", "");
    const object = hotspots[game.room].find((spot) => spot[0] === id);
    const repaired = mission().tasks[game.room].filter((operation) => operation.machine === id && game.done.includes(operation.id));
    content = '<h2>' + (object?.[1] || "Room console") + '</h2><p>' +
      (repaired.length ? "Powered. You can review verified signals in the notebook and laboratory." :
      "This machine is waiting for its input. Complete the highlighted operation first.") + '</p>' +
      (repaired.length ? valueGrid(repaired.map((operation) => [operation.title, operation.output || "Verified"])) : "");
  }
  dialog.querySelector("#panel-content").innerHTML = content;
  dialog.addEventListener("cancel", (event) => { event.preventDefault(); closePanel(); });
  dialog.showModal();
  if (focus && panel === "instrument") dialog.querySelector("h2")?.setAttribute("tabindex", "-1");
  if (focus && panel === "instrument") dialog.querySelector("h2")?.focus({preventScroll:true});
}
function resetSelection() {
  selection = { bits: [], cell: null, shift: null };
}
function sound(success) {
  if (!saved.audio) return;
  try {
    audio ??= new AudioContext();
    const tone = audio.createOscillator();
    const gain = audio.createGain();
    tone.frequency.setValueAtTime(success ? 480 : 160, audio.currentTime);
    tone.frequency.exponentialRampToValueAtTime(success ? 740 : 105, audio.currentTime + .17);
    gain.gain.setValueAtTime(saved.audio / 550, audio.currentTime);
    gain.gain.exponentialRampToValueAtTime(.001, audio.currentTime + .2);
    tone.connect(gain).connect(audio.destination);
    tone.start();
    tone.stop(audio.currentTime + .24);
  } catch {}
}
function handleHot(id) {
  const task = currentTask();
  lastFocus = id;
  advanceGuide(id);
  if (id === "objective") { renderRoom(); return; }
  if (id === "card") {
    if (!game.inventory.includes("card")) game.inventory.push("card");
    save();
    sound(true);
    openPanel("inventory");
  } else if (["door","help","notebook","inventory","pause"].includes(id)) {
    openPanel(id);
  } else if (task?.machine === id && !(game.room === 0 && !game.inventory.includes("card"))) {
    resetSelection();
    openPanel("instrument");
  } else {
    openPanel("machine:" + id);
  }
}
function render() {
  panel = "";
  practiceFeedback = "";
  lessonPhase = null;
  lastFocus = "";
  document.body.classList.toggle("escape-playing", location.hash === "#play" && Boolean(game));
  if (location.hash === "#play") renderRoom();
  else if (location.hash === "#lab") lab();
  else if (location.hash === "#educators") renderEducators();
  else renderHome();
}
function goPlay() {
  if (location.hash === "#play") render();
  else location.hash = "#play";
}
function wire(position) {
  const target = main.querySelector("#typed-answer");
  const status = main.querySelector("[data-wire]");
  if (!target || !status || !/^\d{1,2}$/.test(position)) return;
  target.value = position;
  status.textContent = "Input " + position + " connected";
  status.parentElement.classList.add("is-wired");
}
main.addEventListener("dragstart", (event) => {
  const source = event.target.closest("[data-source-bit]");
  if (source) event.dataTransfer.setData("text/plain", source.dataset.sourceBit);
});
main.addEventListener("dragover", (event) => {
  if (event.target.closest("[data-drop-socket]")) event.preventDefault();
});
main.addEventListener("drop", (event) => {
  if (!event.target.closest("[data-drop-socket]")) return;
  event.preventDefault();
  wire(event.dataTransfer.getData("text/plain"));
});

main.addEventListener("click", (event) => {
  const control = event.target.closest("button, a");
  if (!control) return;
  if (control.dataset.hot) { handleHot(control.dataset.hot); return; }
  const go = control.dataset.go;
  if (go === "mode") main.querySelector("#mode-dialog")?.showModal();
  if (go === "resume") goPlay();
  if (go === "guided" || go === "challenge") { fresh(go); goPlay(); }
  if (go === "close") closePanel();
  if (go === "skip-guide") { saved.onboarding = guide.length; save(); renderRoom(); }
  if (go === "guide") {
    if (game.room === 0 && game.mode === "guided") {
      saved.onboarding = game.inventory.includes("card") ? 1 : 0;
      save();
      closePanel();
    } else openPanel("guide");
  }
  if (go === "hint" && game.hintLevel < 3 && currentTask()) {
    game.hintLevel += 1; game.hints += 1; game.penalty += 10; save(); renderRoom();
  }
  if (go === "review") {
    panel = "instrument";
    lessonPhase = 0;
    practiceFeedback = "";
    renderRoom();
  }
  if (go === "next" && !currentTask()) {
    control.disabled = true;
    main.querySelector(".field-stage").classList.add("field-transition");
    const advance = () => {
      game.room += 1;
      game.done = [];
      game.phase = 0;
      game.optional = false;
      game.feedback = "";
      save();
      sound(true);
      closePanel();
    };
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) advance();
    else window.setTimeout(advance, 370);
  }
  if (go === "optional") { game.optional = true; save(); openPanel("instrument"); }
  if (go === "run-trace") {
    const field = control.closest(".round-run");
    control.disabled = true;
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const cells = [...field.querySelectorAll(".sequence-track span")];
    cells.forEach((item, i) => setTimeout(() => item.classList.add("lit"), reduce ? 0 : i * 65));
    setTimeout(() => { field.querySelector("[data-trace-out]").hidden = false; }, reduce ? 0 : cells.length * 65);
  }

  const { lesson, byte, digit, cell, sourceBit, shift, switch: bitSwitch, action } = control.dataset;
  if (lesson) {
    const phase = lessonPhase ?? game.phase;
    const updated = lesson === "next" ? Math.min(2,phase + 1) : lesson === "back" ? Math.max(0,phase - 1) :
      lesson === "example" ? 1 : phase;
    if (lessonPhase === null && game.mode === "guided") { game.phase = updated; save(); }
    else lessonPhase = updated;
    practiceFeedback = lesson === "help" ? currentLesson(currentTask())[2] : "";
    renderRoom();
  }
  if (byte) {
    const number = byte.charCodeAt(0);
    main.querySelector("[data-inspected]").textContent = byte + " · ASCII " + number + " · Binary " + bits(number,8);
  }
  if (digit) {
    const field = main.querySelector("#typed-answer");
    if (digit === "back") field.value = field.value.slice(0,-1);
    else if (field.value.length < field.maxLength) field.value += digit;
    field.focus();
  }
  if (cell) {
    selection.cell = cell;
    const [row, col, value] = cell.split(",");
    main.querySelectorAll("[data-cell]").forEach((candidate) =>
      candidate.setAttribute("aria-pressed", String(candidate === control)));
    main.querySelector("[data-cell-status]").textContent = "Selected row " + row + ", column " + col + " → " + value + ".";
  }
  if (sourceBit) wire(sourceBit);
  if (shift) { selection.shift = Number(shift); renderRoom(); }
  if (bitSwitch !== undefined) {
    const i = Number(bitSwitch);
    selection.bits[i] = selection.bits[i] === "0" ? "1" : "0";
    control.textContent = selection.bits[i];
    control.setAttribute("aria-pressed", String(selection.bits[i] === "1"));
  }
  if (action === "vector") { labState = { ...known }; lab(); }
  if (action === "mission-trace" || go === "mission-trace") {
    const data = mission();
    const reverse = game.room === 3;
    labState = { ...known, block: reverse ? data.enc.output : data.enc.block, key: game.key, reverse };
    if (location.hash === "#lab") lab();
  }
});

main.addEventListener("submit", (event) => {
  if (event.target.getAttribute("method") === "dialog") return;
  event.preventDefault();
  const data = new FormData(event.target);
  if (event.target.id === "lab-form") {
    const block = normalize(data.get("block"));
    const key = normalize(data.get("key"));
    const valid = /^[0-9A-F]{16}$/;
    labState = { block, key, reverse: event.submitter?.value === "decrypt", round: 0, invalid: !(valid.test(block) && valid.test(key)) };
    lab();
    return;
  }
  const task = currentTask();
  if (!task) return;
  if (event.target.matches("[data-practice]")) {
    const lesson = currentLesson(task);
    if (normalize(data.get("practice")) !== normalize(lesson[5])) {
      practiceFeedback = "Check the example and try again. " + lesson[2];
      renderRoom();
    } else {
      game.phase = 3;
      save();
      lessonPhase = null;
      practiceFeedback = "";
      sound(true);
      renderRoom();
    }
    return;
  }
  if (!event.target.matches("[data-apply]") || dispatching) return;
  if (game.mode === "guided" && game.phase < 3) return;
  let answer = data.get("answer");
  practiceFeedback = "";
  if (task.type === "sbox") {
    const [r, c, value] = selection.cell?.split(",") || [];
    if (data.get("row") === r && data.get("column") === c) answer = [r,c,value].join(",");
    else practiceFeedback = "Enter a row and column and select their intersection in the table.";
  }
  if (task.type === "xor") {
    answer = selection.bits.filter((bit) => bit !== undefined).join("");
    if (answer.length !== 4) practiceFeedback = "Set all four circuit switches before verifying.";
  }
  if (task.type === "rotate") {
    if (!selection.shift) practiceFeedback = "Rotate both disks before verifying.";
    else if (selection.shift !== mission().sub.shift) answer = "WRONG ROTATION";
  }
  if (practiceFeedback) {
    const note = event.target.querySelector("[data-apply-note]") || document.createElement("p");
    note.dataset.applyNote = "";
    note.setAttribute("role", "status");
    note.className = "notice error";
    note.textContent = practiceFeedback;
    event.target.append(note);
    return;
  }
  dispatching = true;
  const solved = submitAnswer(task, answer);
  sound(solved);
  if (solved) {
    game.lastVerified = task.id;
    save();
    resetSelection();
    panel = "feedback";
  }
  renderRoom();
  dispatching = false;
});
main.addEventListener("change", (event) => {
  if (event.target.id === "round-picker") {
    labState.round = Number(event.target.value); lab();
    main.querySelector("#round-picker").focus({preventScroll:true});
  }
  if (event.target.id === "volume") { saved.audio = Number(event.target.value); save(); sound(true); }
});
window.addEventListener("hashchange", () => { render(); window.scrollTo(0,0); });
render();
