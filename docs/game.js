"use strict";
const main = document.querySelector("main");
const rooms = [
  ["The Hex Gate", "hex", "Access corridor", "Translate the access code and route its bits through IP."],
  ["The Key Vault", "key", "Key generation vault", "Remove the parity positions and generate a round key."],
  ["The Round Reactor", "reactor", "Encryption reactor", "Repair the Feistel stages to restore the encryption reactor."],
  ["The Final Decryption Chamber", "exit", "Final exit", "Reverse the subkeys, recover the access code, and give NOVA your security verdict."],
];
const badges = ["Hex Explorer", "Key Master", "Round Master", "CipherBreak Graduate"];
const mask = (width) => (1n << BigInt(width)) - 1n;
const hex = (value, width) => value.toString(16).toUpperCase().padStart(width / 4, "0");
const bits = (value, width) => value.toString(2).padStart(width, "0");
const parse = (value) => BigInt("0x" + value);
const perm = (value, width, map) => map.reduce((acc, at) => (acc << 1n) | ((value >> BigInt(width - at)) & 1n), 0n);
const rotate = (value, shift) => ((value << BigInt(shift)) | (value >> BigInt(28 - shift))) & mask(28);
function trace(block, key, reverse = false) {
  const selection = perm(parse(key), 64, tables.PC1);
  let c = selection >> 28n, d = selection & mask(28);
  const keys = tables.SHIFTS.map((shift, i) => {
    const oldC = c, oldD = d;
    c = rotate(c, shift);
    d = rotate(d, shift);
    const joined = (c << 28n) | d;
    return { n: i + 1, shift, oldC, oldD, c, d, joined, key: perm(joined, 56, tables.PC2) };
  });
  const ip = perm(parse(block), 64, tables.IP);
  let l = ip >> 32n, r = ip & mask(32);
  const rounds = (reverse ? [...keys].reverse() : keys).map((subkey, i) => {
    const expanded = perm(r, 32, tables.E), xor = expanded ^ subkey.key;
    let combined = 0n;
    const sboxes = tables.S_BOXES.map((table, box) => {
      const value = Number((xor >> BigInt(42 - 6 * box)) & 63n);
      const row = ((value >> 5) << 1) | (value & 1), col = (value >> 1) & 15;
      const result = table[row][col];
      combined = (combined << 4n) | BigInt(result);
      return { box, input: bits(value, 6), row, col, result };
    });
    const p = perm(combined, 32, tables.P), next = l ^ p;
    const record = { n: i + 1, subkey, l, r, expanded, xor, sboxes, combined, p, next };
    l = r;
    r = next;
    return record;
  });
  const swap = (r << 32n) | l;
  return { block, key, ip, selection, keys, rounds, swap, output: hex(perm(swap, 64, tables.IP_INVERSE), 64) };
}

const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]);
const valueGrid = (rows) => '<dl class="value-grid">' + rows.map(([name, value]) => '<div><dt>' + escapeHtml(name) + '</dt><dd><code>' + escapeHtml(value) + '</code></dd></div>').join("") + '</dl>';
let game;
try { game = JSON.parse(localStorage.getItem("cipherbreak-presentation-v1")); } catch {}
let feedback = "", hint = false;
function save() {
  try { localStorage.setItem("cipherbreak-presentation-v1", JSON.stringify(game)); } catch {}
}
function fresh() {
  const data = crypto.getRandomValues(new Uint8Array(18));
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const code = Array.from(data.slice(0, 8), (b) => chars[b % chars.length]).join("");
  const key = Array.from(data.slice(8, 16), (b) => hex(b, 8)).join("");
  game = { code, key, round: data[16] % 16, box: data[17] % 8, room: 0, step: 0, score: 0, misses: 0, hints: 0, penalty: 0 };
  save();
}
function question(title, prompt, answer, tip, signals = [], choices = [], widget = "") {
  return { title, prompt, answer: String(answer), tip, signals, choices, widget };
}
function mission() {
  const block = Array.from(game.code, (ch) => hex(ch.charCodeAt(0), 8)).join("");
  const enc = trace(block, game.key), dec = trace(enc.output, game.key, true);
  const round = enc.rounds[game.round], sub = round.subkey, box = round.sboxes[game.box];
  const ipBit = game.round * 3 % 64, keyBit = game.round * 3 % 56, expBit = game.round * 3 % 48;
  const pBit = game.round * 2 % 32;
  const sboxGrid = '<div class="table-scroll"><table class="sbox"><thead><tr><th>Row / Col</th>' +
    Array.from({length:16}, (_, i) => '<th>' + i + '</th>').join("") + '</tr></thead><tbody>' +
    tables.S_BOXES[game.box].map((row, i) => '<tr><th>' + i + '</th>' + row.map((v, j) =>
    '<td><button type="button" data-cell="' + i + ',' + j + '" aria-label="Row ' + i + ', column ' + j + ', value ' + v + '">' + v + '</button></td>').join("") + '</tr>').join("") + '</tbody></table></div>';
  const map = (title, table, position, name) => question(title, 'Which input position supplies output bit ' + (position + 1) + '?',
    table[position], 'The selected table entry gives the source position. Positions start at 1.', [], [],
    '<div class="widget"><p>' + name + ' output → input map</p><div class="reference-positions">' +
    table.map((bit, i) => '<div' + (position === i ? ' class="target-bit"' : '') + '><small>' + (i + 1) + '</small><code>' + bit + '</code></div>').join("") + '</div></div>');
  return { enc, dec, tasks: [
    [
      question("Decode the access signal", "Convert the access code into exactly 16 hexadecimal digits. Inspect each ASCII byte.", block,
        "A is 41 in hexadecimal. Join the eight two-digit byte values from left to right.", [], [],
        '<div class="widget"><div class="byte-list">' + Array.from(game.code, (ch, i) => '<button type="button" data-byte="' + ch + '" aria-label="Inspect character ' + (i + 1) + ', ' + ch + '">' + ch + '</button>').join("") + '</div><p class="inspect-output" aria-live="polite">Select a character to inspect it.</p></div>'),
      question("Check the block width", "How many bits are in the access block?", 64, "Eight bytes × eight bits per byte.", [["Access block", block]], ["32", "64", "128"]),
      map("Route the initial permutation", tables.IP, ipBit, "IP"),
    ],
    [
      question("Inspect the original key", "How many key bits provide effective strength?", 56, "DES drops one parity position from each of the eight bytes.", [["Represented key", game.key]], ["48", "56", "64"]),
      map("Activate PC-1", tables.PC1, keyBit, "PC-1"),
      question("Turn the key disks", 'How many positions must C and D rotate left in round ' + sub.n + '?', sub.shift,
        "Read the schedule entry for this round. Bits leaving the left wrap around to the right.", [["C before", hex(sub.oldC,28)], ["D before", hex(sub.oldD,28)], ["Shift schedule", tables.SHIFTS.join(" ")]], ["1", "2"]),
      map("Generate a subkey with PC-2", tables.PC2, expBit, "PC-2"),
    ],
    [
      map("Restore expansion E", tables.E, expBit, "Expansion E"),
      question("Close the XOR circuit", "What is the first bit of E(R) XOR K?", Number((round.xor >> 47n) & 1n), "XOR is 1 when the operand bits differ.",
        [["First expanded bit", Number(round.expanded >> 47n)], ["First subkey bit", Number(sub.key >> 47n)]], ["0", "1"]),
      question("Route S-box " + (game.box + 1), "Select the row and column implied by the six-bit input, then verify.", box.row + "," + box.col,
        "Join the outer bits for the row. The middle four bits give the column. Read them in binary.", [["Six-bit input", box.input]], [], sboxGrid),
      map("Route P permutation", tables.P, pBit, "P"),
      question("Update the Feistel halves", "Enter the new left half as eight hexadecimal digits.", hex(round.r,32),
        "The new left half is the previous right half. The new right half is left XOR the P output.", [["Old left", hex(round.l,32)], ["Old right", hex(round.r,32)], ["P output", hex(round.p,32)]]),
    ],
    [
      question("Reverse the key sequence", "Which subkey is used first to decrypt?", "K16", "Decryption reuses the same keys in reverse.", [["Ciphertext", enc.output]], ["K1", "K8", "K16"]),
      question("Recover the access code", "Convert the decrypted block back to its eight ASCII characters.", game.code,
        "Read two digits at a time. Hex 41 represents A, and hex 30 represents 0.", [["Decrypted block", dec.output]], [],
        '<details class="plain-details"><summary>ASCII reference</summary><div class="ascii-grid">' + [..."0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"].map((c) => '<p><code>' + hex(c.charCodeAt(0),8) + '</code> ' + c + '</p>').join("") + '</div></details>'),
      question("Give the security verdict", "Why should modern systems avoid single DES?", "Its 56-bit key makes exhaustive search feasible.", "Remember the effective key size after excluding parity.",
        [], ["It cannot decrypt ciphertext.", "Its 56-bit key makes exhaustive search feasible.", "It uses hexadecimal."]),
    ],
  ]};
}

function home() {
  main.innerHTML = '<section class="hero"><div class="shell hero-inner"><div class="hero-copy"><p class="overline"><span class="status-light"></span> RESEARCH FACILITY IN LOCKDOWN</p><h1><span>The 16-Round</span><br><em>Escape.</em></h1><p class="hero-intro">Four locked rooms. One historic cipher. Work through DES, bit by bit, to find the way out.</p><div class="actions"><button class="button button-green" data-action="start">' +
    (game && game.room < 4 ? "Resume mission" : "Start mission") + '</button><a class="button button-ghost" href="#lab">DES laboratory</a></div><p class="hero-course">EECE 455 · American University of Beirut</p></div></div></section><section class="shell home-rooms"><div class="section-heading"><div><p class="overline">THE MISSION</p><h2>Find the way out.</h2></div></div><div class="room-gallery">' +
    rooms.map(([name, theme, place, goal]) => '<article class="gallery-card theme-' + theme + '"><div class="gallery-art"></div><div class="gallery-info"><p class="room-index">' + place + '</p><h3>' + name + '</h3><p>' + goal + '</p></div></article>').join("") + '</div></section>';
}
function play() {
  if (!game) { location.hash = "#home"; return; }
  if (game.room === 4) {
    main.innerHTML = '<div class="shell page-stack"><section class="scene scene-room theme-exit scene-open"><div class="scene-copy"><p class="overline">ACCESS GRANTED</p><h1>You escaped <em>the Cipher Lab!</em></h1><p>NOVA · “You recovered the access code and explained why DES is obsolete.”</p></div></section><div class="stat-grid"><div class="stat"><span>Score</span><strong>' + game.score + '</strong></div><div class="stat"><span>Rooms cleared</span><strong>4 / 4</strong></div><div class="stat"><span>Mistakes</span><strong>' + game.misses + '</strong></div><div class="stat"><span>Hints</span><strong>' + game.hints + '</strong></div></div><section class="card"><h2>Badges earned</h2><p>' + badges.join(" · ") + '</p><div class="actions"><button class="button button-green" data-action="restart">Play again</button><a class="button button-ghost" href="#lab">Inspect the DES trace</a></div></section></div>';
    return;
  }
  const [name, theme, place, goal] = rooms[game.room];
  const list = mission().tasks[game.room];
  const task = list[game.step];
  const cleared = !task;
  main.innerHTML = '<div class="shell game-layout theme-' + theme + '"><header class="mission-header"><div><p class="overline">ROOM ' + (game.room + 1) + ' OF 4</p><h1>' + name + '</h1></div><div class="mission-readouts"><div><span>Score</span><strong>' + game.score + ' pts</strong></div><div><span>Rooms cleared</span><strong>' + (game.room + Number(cleared)) + ' / 4</strong></div></div></header><div class="room-layout"><div class="room-main"><section class="scene scene-room ' + (cleared ? 'scene-open' : '') + '"><div class="scene-copy"><p class="overline"><span class="status-light"></span> ' + place + '</p><h2>' + (cleared ? "Room cleared." : goal) + '</h2></div></section>' +
    (cleared ? '<section class="card cleared"><p class="overline">ACCESS GRANTED</p><h2>' + badges[game.room] + '</h2><p>Room cleared. +50 points.</p><button class="button button-green" data-action="next">' + (game.room === 3 ? "Open the exit" : "Enter next room") + '</button></section>' :
    '<section class="card terminal" id="challenge"><p class="overline">CHALLENGE ' + (game.step + 1) + ' OF ' + list.length + '</p><h2>' + task.title + '</h2><p class="puzzle-prompt">' + task.prompt + '</p>' + (task.signals.length ? valueGrid(task.signals) : "") + task.widget +
    '<form class="puzzle-form" id="answer-form">' + (task.choices.length ? '<fieldset><legend class="sr-only">Choose an answer</legend>' + task.choices.map((choice) =>
      '<label class="option-label"><input type="radio" name="answer" required value="' + escapeHtml(choice) + '"> ' + escapeHtml(choice) + '</label>').join("") + '</fieldset>' :
      task.answer.includes(",") ? '<input type="hidden" name="answer"><p id="cell-message" aria-live="polite">Select an S-box cell.</p>' : '<label for="typed-answer">Answer</label><input id="typed-answer" autocomplete="off" spellcheck="false" name="answer" required maxlength="32">') +
    '<button class="button button-green" type="submit">Verify answer</button></form><p class="notice ' + (feedback.startsWith("Not quite") ? "error" : "") + '" role="status"' + (feedback ? "" : " hidden") + '>' + escapeHtml(feedback) + '</p></section>') +
    '</div><aside class="room-sidebar"><section class="card nova"><p class="overline">NOVA · LAB ASSISTANT</p><h2>' + (cleared ? "Well done." : "Need a hint?") + '</h2><p>' + (cleared ? "The next door is unlocked." : hint ? task.tip : "Inspect the values, submit your answer, and unlock the next operation.") + '</p>' +
    (cleared || hint ? "" : '<button class="button button-small button-ghost" data-action="hint">Reveal hint · −10 pts</button>') + '</section><section class="card room-checklist"><h2>Facility map</h2><ol>' +
    rooms.map(([title], i) => '<li>' + (i < game.room || (cleared && i === game.room) ? "✓" : i === game.room ? "●" : "○") + ' ' + title + '</li>').join("") +
    '</ol><p>Progress is saved in this browser.</p></section></aside></div></div>';
}
const known = { block: "0123456789ABCDEF", key: "133457799BBCDFF1", reverse: false, round: 0 };
let labState = { ...known };
function lab() {
  const { block, key, reverse, round: index, invalid } = labState;
  const result = invalid ? null : trace(block, key, reverse);
  const round = result?.rounds[index], sub = result?.keys[index];
  main.innerHTML = '<div class="shell page-stack"><header class="page-heading"><p class="overline">INDEPENDENT LEARNING LABORATORY</p><h1>DES <em>laboratory.</em></h1><p>Trace all 16 Feistel rounds and round keys. Start with the standard classroom vector or enter your own block.</p></header><section class="card"><form id="lab-form" class="stack-form"><div class="two-col"><div><label for="block">Data block</label><input id="block" name="block" required maxlength="16" value="' + escapeHtml(block) + '"></div><div><label for="key">DES key</label><input id="key" name="key" required maxlength="16" value="' + escapeHtml(key) + '"></div></div><div class="actions"><button class="button button-green" value="encrypt">Encrypt</button><button class="button button-ghost" value="decrypt">Decrypt</button><button class="button button-ghost" data-action="vector" type="button">Load test vector</button>' +
   (game ? '<button class="button button-ghost" data-action="mission-trace" type="button">Load mission trace</button>' : '') +
   '</div></form>' + (invalid ? '<p class="notice error">Enter exactly 16 hexadecimal digits in both fields.</p>' : "") + '</section>' +
   (result ? '<section class="card output-card"><h2>' + (reverse ? "Decryption" : "Encryption") + ' trace</h2>' + valueGrid([["Input", block], ["IP", hex(result.ip,64)], ["Final swap", hex(result.swap,64)], ["Final output", result.output]]) + '</section>' +
   '<section class="card"><div class="section-heading"><div><p class="overline">FEISTEL NETWORK</p><h2>Inspect each round</h2></div><label for="round-picker">Round<select id="round-picker">' +
     result.rounds.map((r, i) => '<option value="' + i + '"' + (i === index ? " selected" : "") + '>Round ' + r.n + ' · K' + r.subkey.n + '</option>').join("") + '</select></label></div>' +
   valueGrid([["Left input",hex(round.l,32)],["Right input",hex(round.r,32)],["Applied subkey",hex(round.subkey.key,48)],["Expansion",hex(round.expanded,48)],["XOR",hex(round.xor,48)],["S-box output",hex(round.combined,32)],["P result",hex(round.p,32)],["New left",hex(round.r,32)],["New right",hex(round.next,32)]]) +
   '<details class="plain-details"><summary>Eight S-box calculations</summary><div class="table-scroll"><table><thead><tr><th>S-box</th><th>Six input bits</th><th>Row</th><th>Column</th><th>Four output bits</th></tr></thead><tbody>' +
   round.sboxes.map((s) => '<tr><th>S' + (s.box + 1) + '</th><td><code>' + s.input + '</code></td><td>' + s.row + '</td><td>' + s.col + '</td><td><code>' + bits(s.result,4) + '</code></td></tr>').join("") +
   '</tbody></table></div></details></section><section class="card"><h2>Key schedule · K' + sub.n + '</h2>' +
   valueGrid([["PC-1 output",hex(result.selection,56)],["C before",hex(sub.oldC,28)],["D before",hex(sub.oldD,28)],["Circular left shift",sub.shift],["C after",hex(sub.c,28)],["D after",hex(sub.d,28)],["C ∥ D",hex(sub.joined,56)],["PC-2 output",hex(sub.key,48)]]) + '</section>' : "") +
   '<aside class="education-note">DES has a 64-bit block and 56 effective key bits. Modern systems should use an appropriate authenticated-encryption standard.</aside></div>';
}
function render() {
  if (location.hash === "#play") play();
  else if (location.hash === "#lab") lab();
  else home();
}
function activate() {
  feedback = "";
  hint = false;
  if (location.hash === "#play") { play(); window.scrollTo(0,0); }
  else location.hash = "#play";
}
main.addEventListener("click", (event) => {
  const control = event.target.closest("button");
  if (!control) return;
  const { action, byte, cell } = control.dataset;
  if (byte) {
    const number = byte.charCodeAt(0);
    main.querySelector(".inspect-output").textContent = byte + " · ASCII " + number + " · Binary " + bits(number,8) + " · Hex " + hex(number,8);
  }
  if (cell) {
    main.querySelectorAll("[data-cell]").forEach((button) => button.setAttribute("aria-pressed", String(button === control)));
    main.querySelector("[name=answer]").value = cell;
    main.querySelector("#cell-message").textContent = "Selected row " + cell.split(",").join(", column ") + ".";
  }
  if (action === "start" || action === "restart") {
    if (!game || game.room === 4 || action === "restart") fresh();
    activate();
  }
  if (action === "next") {
    game.room += 1; game.step = 0; game.penalty = 0; game.hinted = false; save(); activate();
  }
  if (action === "hint") {
    if (!game.hinted) { game.hinted = true; game.hints += 1; game.penalty += 10; save(); }
    hint = true;
    play();
    main.querySelector(".nova").scrollIntoView({block:"nearest"});
  }
  if (action === "vector") { labState = { ...known }; lab(); }
  if (action === "mission-trace") { labState = { ...known, block: mission().enc.block, key: game.key }; lab(); }
});
main.addEventListener("submit", (event) => {
  event.preventDefault();
  const data = new FormData(event.target);
  if (event.target.id === "lab-form") {
    const block = data.get("block").trim().toUpperCase(), key = data.get("key").trim().toUpperCase();
    const valid = /^[0-9A-F]{16}$/;
    labState = { block, key, reverse: event.submitter?.value === "decrypt", round: 0, invalid: !(valid.test(block) && valid.test(key)) };
    lab();
    return;
  }
  const task = mission().tasks[game.room][game.step];
  const answer = data.get("answer")?.trim().toUpperCase();
  if (!answer) { feedback = "Select a cell before verifying."; }
  else if (answer !== task.answer.toUpperCase()) {
    game.misses += 1; game.penalty += 10;
    feedback = "Not quite. Inspect the values again or ask NOVA for a hint.";
  } else {
    game.score += Math.max(0, 100 - game.penalty);
    game.step += 1; game.penalty = 0; game.hinted = false; hint = false;
    feedback = "Correct. The next operation is ready.";
    if (game.step === mission().tasks[game.room].length) game.score += 50;
  }
  save();
  play();
  (main.querySelector(".terminal") || main.querySelector(".cleared"))?.scrollIntoView({block:"nearest"});
});
main.addEventListener("change", (event) => {
  if (event.target.id === "round-picker") {
    labState.round = Number(event.target.value); lab();
    main.querySelector("#round-picker").focus({preventScroll:true});
  }
});
window.addEventListener("hashchange", () => { render(); window.scrollTo(0,0); });
render();
