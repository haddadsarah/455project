"use strict";

const saveKey = "cipherbreak-escape-v2";
const previousKey = "cipherbreak-presentation-v1";
const lessons = window.cipherLessons;
const oldTasks = [
  ["ascii", "block", "ip"], ["parity", "pc1", "rotate", "pc2"],
  ["expand", "xor", "sbox", "p", "feistel"], ["order", "recover", "verdict"],
];
const normalize = (value) => String(value ?? "").toUpperCase().trim().replace(/ *, */g, ",").replace(/ +/g, " ");

function stored(key) {
  try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
}

let saved = stored(saveKey);
if (!saved?.history || (saved.game && !Array.isArray(saved.game.done))) saved = { game: null, history: [], onboarding: 0, audio: 0 };
if (!saved.game && !saved.migrated) {
  const old = stored(previousKey);
  if (old && Number.isInteger(old.room) && old.room >= 0 && old.room <= 4) {
    saved.game = {
      ...old, id: "legacy-" + old.key, mode: "guided", created: Date.now(), inventory: [], phase: 0, optional: false,
      done: old.room < 4 ? oldTasks[old.room].slice(0, old.step) : [],
      achievements: [...badges.slice(0, old.room)],
      roomMistakes: {}, hintLevel: 0, penalty: old.penalty || 0, feedback: "",
    };
    if (old.room > 2 || (old.room === 2 && old.step > 2)) saved.game.achievements.push("S-box Specialist");
    if (old.room > 3 || (old.room === 3 && old.step > 1)) saved.game.achievements.push("Reverse Engineer");
  }
  saved.migrated = true;
}
let game = saved.game;
function save() {
  saved.game = game;
  try { localStorage.setItem(saveKey, JSON.stringify(saved)); } catch {}
}
save();

function fresh(mode) {
  const data = crypto.getRandomValues(new Uint8Array(18));
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  if (game) {
    saved.history.unshift({
      id: game.id, created: game.created, mode: game.mode, rooms: game.room, score: game.score,
      hints: game.hints, misses: game.misses, achievements: game.achievements,
    });
    saved.history = saved.history.slice(0, 30);
  }
  const code = Array.from(data.slice(0, 8), (b) => alphabet[b % alphabet.length]).join("");
  const key = Array.from(data.slice(8, 16), (b) => {
    const even = b & 254;
    const parity = bits(even, 8).split("1").length % 2;
    return hex(even | parity, 8);
  }).join("");
  game = {
    id: Array.from(data, (b) => hex(b, 8)).join(""), code, key, round: data[16] % 16, box: data[17] % 8,
    mode, created: Date.now(), room: 0, score: 0, misses: 0, hints: 0, hintLevel: 0, penalty: 0,
    phase: 0, done: [], achievements: [], inventory: [], roomMistakes: {}, feedback: "", optional: false,
  };
  save();
}

function question(id, title, prompt, answer, tip, data = {}) {
  return { id, title, prompt, answer: String(answer), tip, ...data };
}

let generated;
function mission() {
  if (generated?.id === game.id) return generated;

  const block = Array.from(game.code, (letter) => hex(letter.charCodeAt(0), 8)).join("");
  const enc = trace(block, game.key);
  const dec = trace(enc.output, game.key, true);
  const round = enc.rounds[game.round];
  const sub = round.subkey;
  const box = round.sboxes[game.box];
  const extra = round.sboxes[(game.box + 3) % 8];
  const bit = game.round * 3;
  const map = (id, title, table, input, inputWidth, output, outputWidth, machine) => {
    const target = bit % table.length;
    return question(id, title, "Route output channel " + (target + 1) + " to its source input position.",
      table[target], "The mapping lists a source position for each output channel. Positions start at 1.",
      { type: "map", table, target, input, inputWidth, machine,
        values: [["Input", hex(input, inputWidth)]], output: hex(output, outputWidth) });
  };
  const boxTask = (id, sbox) => question(id, "Route S-box " + (sbox.box + 1),
    "Calculate the row and column. Then use their intersection in the table.",
    [sbox.row, sbox.col, sbox.result].join(","), "Read the outer bits as one binary number and the four middle bits as another.",
    { type: "sbox", box: sbox, machine: "sboxes", values: [["Input in hexadecimal", hex(parseInt(sbox.input, 2), 8)]],
      output: bits(sbox.result, 4) });
  const xorIndex = (game.round * 2) % 45;
  const windowBits = (value) => bits(value, 48).slice(xorIndex, xorIndex + 4);
  const c0 = hex(enc.selection >> 28n, 28), d0 = hex(enc.selection & mask(28), 28);
  const leftXor = hex(round.l, 32).slice(-2), pXor = hex(round.p, 32).slice(-2);
  generated = { id: game.id, enc, dec, round, sub, tasks: [
    [
      question("ascii", "Decode the access card", "Use the ASCII relay and enter the eight bytes as one 16-digit hexadecimal block.",
        block, "Each byte occupies two hex digits. Read the characters in order, including every leading zero.", { type: "ascii", machine: "terminal", output: block }),
      question("block", "Check the block width", "Enter the number of bits represented by the 16 hexadecimal digits.",
        "64", "Each hex digit accounts for four bits.", { values: [["Access block", block]], machine: "terminal" }),
      map("ip", "Wire the initial permutation", tables.IP, parse(block), 64, enc.ip, 64, "ip-unit"),
      question("halves", "Load the left and right registers", "Enter L₀ and R₀ as two eight-digit hexadecimal values separated by a space.",
        hex(enc.ip >> 32n, 32) + " " + hex(enc.ip & mask(32), 32), "Read the left eight digits and the right eight digits.",
        { values: [["IP output", hex(enc.ip, 64)]], machine: "ip-unit" }),
    ],
    [
      question("parity", "Inspect the key", "Enter the number of effective key bits after discarding the highlighted parity positions.",
        "56", "One position per byte is for parity. Eight bytes therefore have eight parity positions.",
        { type: "parity", values: [["Represented key", game.key]], machine: "key-bank" }),
      map("pc1", "Activate PC-1", tables.PC1, parse(game.key), 64, enc.selection, 56, "pc1-unit"),
      question("split", "Load C₀ and D₀", "Enter the starting halves as two seven-digit hexadecimal values separated by a space.",
        c0 + " " + d0, "Split the 14 hexadecimal digits in half.", { values: [["PC-1 output", hex(enc.selection, 56)]], machine: "pc1-unit" }),
      question("rotate", "Turn the key disks", "Find the shift count for round " + sub.n + ". Rotate both disks and enter the resulting C register in hexadecimal.",
        hex(sub.c, 28), "Move the leading bits to the end. Both disks use the same shift count in this round.",
        { type: "rotate", values: [["C before", hex(sub.oldC, 28)], ["D before", hex(sub.oldD, 28)]], machine: "disks", output: hex(sub.c, 28) + " · " + hex(sub.d, 28) }),
      map("pc2", "Route PC-2", tables.PC2, sub.joined, 56, sub.key, 48, "pc2-unit"),
      question("subkey", "Verify the round subkey", "Convert the 48 output bits to exactly 12 hexadecimal digits.",
        hex(sub.key, 48), "Convert each four-bit group to a single hex digit in order.",
        { values: [["PC-2 output in four-bit groups", bits(sub.key, 48).match(/.{4}/g).join(" ")]], machine: "pc2-unit" }),
    ],
    [
      map("expand", "Restore expansion E", tables.E, round.r, 32, round.expanded, 48, "expansion"),
      question("xor", "Close the XOR circuit", "Set the four switches to the XOR of the paired bits.",
        windowBits(round.xor), "Compare each column. Different bits produce 1.", { type: "xor", a: windowBits(round.expanded), b: windowBits(sub.key),
          values: [["Expanded right", hex(round.expanded, 48)], ["Applied subkey", hex(sub.key, 48)]], machine: "xor-unit", output: hex(round.xor, 48) }),
      boxTask("sbox", box),
      map("p", "Route the P permutation", tables.P, round.combined, 32, round.p, 32, "p-unit"),
      question("feistel_xor", "Mix the previous left register", "XOR the last two digits of the old left half and the P result. Enter two hexadecimal digits.",
        hex(parse(leftXor) ^ parse(pXor), 8), "XOR the four independent bits of each digit. Keep a leading zero.",
        { values: [["Old left", hex(round.l, 32)], ["P output", hex(round.p, 32)], ["Target bytes", leftXor + " XOR " + pXor]], machine: "feistel-unit", output: hex(round.next, 32) }),
      question("feistel", "Update both registers", "Enter the new L and R registers separated by a space. Each must have eight digits.",
        hex(round.r, 32) + " " + hex(round.next, 32), "Copy old R into new L. XOR old L with F to obtain new R.",
        { values: [["Old left", hex(round.l, 32)], ["Old right", hex(round.r, 32)], ["F result", hex(round.p, 32)]], machine: "registers" }),
      { ...boxTask("advanced", extra), optional: true },
    ],
    [
      question("order", "Reverse the key sequence", "Enter the first and last subkey numbers for decryption, separated by a space.",
        "16 1", "Use the encryption subkeys from last to first.", { values: [["Ciphertext", enc.output], ["Encryption order", "K1 → K2 → … → K16"]], machine: "schedule" }),
      question("decrypt", "Follow the first decryption round", "Enter the new left register as eight hexadecimal digits.",
        hex(dec.rounds[0].r, 32), "Apply the same Feistel update. The right input becomes the next left register.",
        { values: [["Left after IP", hex(dec.rounds[0].l, 32)], ["Right after IP", hex(dec.rounds[0].r, 32)], ["K16", hex(dec.rounds[0].subkey.key, 48)]], machine: "decrypt-unit" }),
      question("recover", "Recover the access code", "Decode the eight hexadecimal bytes and enter the recovered access code.",
        game.code, "Work left to right in pairs. Read each pair as one ASCII character.", { type: "recover", values: [["Decrypted block", dec.output]], machine: "decrypt-unit" }),
      question("verdict", "Choose a cipher for the new facility", "A clinic needs to protect sensitive records. Which recommendation should NOVA approve?",
        "modern", "DES decrypts correctly but has a 56-bit effective key, which is short enough for exhaustive search.",
        { choices: [["des", "Use DES because the recovered block matched."], ["modern", "Use a current authenticated-encryption standard. DES’s 56-bit key is vulnerable to exhaustive search."], ["block", "Use DES because its input block has 64 bits."]], machine: "verdict-unit" }),
    ],
  ] };
  return generated;
}

function requiredTasks() { return mission().tasks[game.room].filter((task) => !task.optional); }
function currentTask() {
  const tasks = mission().tasks[game.room];
  return game.optional ? tasks.find((task) => task.optional && !game.done.includes(task.id)) :
    tasks.find((task) => !task.optional && !game.done.includes(task.id));
}
function giveBadge(badge) {
  if (!game.achievements.includes(badge)) game.achievements.push(badge);
}
function submitAnswer(task, answer) {
  if (game.done.includes(task.id) || !normalize(answer)) return false;
  if (normalize(answer) !== normalize(task.answer)) {
    game.misses += 1;
    game.penalty += 10;
    const objective = lessons[task.id][0];
    game.roomMistakes[objective] = (game.roomMistakes[objective] || 0) + 1;
    game.feedback = "Try again. " + task.tip;
    save();
    return false;
  }

  game.done.push(task.id);
  const earned = Math.max(0, 100 - game.penalty);
  game.score += earned;
  game.feedback = "Signal verified. +" + earned + " pts." + (task.output ? " Output " + task.output + "." : "");
  game.penalty = 0;
  game.hintLevel = 0;
  game.phase = 0;
  game.optional = false;
  if (task.id === "sbox") giveBadge("S-box Specialist");
  if (task.id === "recover") giveBadge("Reverse Engineer");
  if (!currentTask() && !game.achievements.includes(badges[game.room])) {
    giveBadge(badges[game.room]);
    game.score += 50;
  }
  save();
  return true;
}
