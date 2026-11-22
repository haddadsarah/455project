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
