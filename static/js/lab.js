/* DES Learning Laboratory page. */
(function () {
  "use strict";
  const $ = (s) => document.querySelector(s);
  const vectors = JSON.parse($("#lab-vectors").textContent);
  const tables = JSON.parse($("#lab-tables").textContent);
  const params = new URLSearchParams(location.search);
  let mode = params.get("mode") === "decrypt" ? "decrypt" : "encrypt";

  function clientCheck(v, label) {
    const s = v.replace(/\s+/g, "");
    if (!s) return `The ${label} is missing. Enter exactly 16 hexadecimal digits.`;
    if (/[^0-9a-fA-F]/.test(s)) return `The ${label} contains non-hexadecimal characters. Use only 0-9 and A-F.`;
    if (s.length !== 16) return `The ${label} has ${s.length} hex digits; DES needs exactly 16.`;
    return "";
  }

  async function run() {
    const err = $("#lab-error"); err.classList.add("hidden");
    const block = $("#lab-block").value, key = $("#lab-key").value;
    const problem = clientCheck(block, mode === "decrypt" ? "ciphertext" : "message") || clientCheck(key, "key");
    if (problem) { err.textContent = problem; err.classList.remove("hidden"); return; }
    let t;
    try { t = await CB.api("/api/des/", { block, key, mode }); }
    catch (e) { err.textContent = e.message; err.classList.remove("hidden"); return; }
    $("#lab-out").classList.remove("hidden");
    const ascii = (h) => h.match(/../g).map((x) => { const c = parseInt(x, 16); return c >= 32 && c < 127 ? String.fromCharCode(c) : "·"; }).join("");
    $("#lab-summary-h").textContent = mode === "decrypt" ? "Decryption result" : "Encryption result";
    $("#lab-summary").innerHTML = `<div class="table-wrap"><table class="trace-table">
      <tr><td>${mode === "decrypt" ? "Ciphertext in" : "Plaintext in"}</td><td class="v">${t.input.hex} ${CB.copyBtn(t.input.hex)} <span class="muted small">ASCII “${CB.esc(ascii(t.input.hex))}”</span></td></tr>
      <tr><td>Key</td><td class="v">${t.key.hex} ${CB.copyBtn(t.key.hex)}</td></tr>
      <tr><td>${mode === "decrypt" ? "Plaintext out" : "Ciphertext out"}</td><td class="v"><b class="hexline">${t.output.hex}</b> ${CB.copyBtn(t.output.hex)} <span class="muted small">ASCII “${CB.esc(ascii(t.output.hex))}”</span></td></tr>
      <tr><td>Bits changed</td><td class="v">${[...t.input.bin].filter((b, i) => b !== t.output.bin[i]).length} of 64</td></tr></table></div>
      <div class="btn-row"><button class="btn btn-sm" type="button" id="lab-swap">⇄ Use output as input and ${mode === "decrypt" ? "encrypt" : "decrypt"}</button></div>`;
    $("#lab-swap").onclick = () => { $("#lab-block").value = t.output.hex; mode = mode === "decrypt" ? "encrypt" : "decrypt"; run(); };
    CB.renderTrace($("#tab-rounds"), t, { openSboxes: params.get("step") === "sbox" });
    CB.renderKeySchedule($("#tab-keys"), t.key_schedule);
    drawTables();
    if (params.get("tab") === "keys") showTab("keys");
  }

  function permGrid(name, t, cols) {
    return `<h3>${name}</h3><div class="perm-table" style="grid-template-columns:repeat(${cols},1fr);max-width:${cols * 46}px">${t.map((v, i) => `<span title="position ${i + 1}">${v}</span>`).join("")}</div>`;
  }
  function drawTables() {
    $("#tab-tables").innerHTML = `<div class="grid grid-2">${permGrid("IP", tables.IP, 8)}${permGrid("IP⁻¹", tables.IP_INV, 8)}${permGrid("Expansion E", tables.E, 6)}${permGrid("P", tables.P, 8)}${permGrid("PC-1", tables.PC1, 7)}${permGrid("PC-2", tables.PC2, 6)}</div>
      <h3>Shift schedule</h3><p class="mono">${tables.SHIFTS.join(" ")}</p>
      ${tables.SBOXES.map((sb, i) => `<details><summary>S${i + 1}</summary><div class="table-wrap"><table class="sbox-table"><tr><th></th>${[...Array(16).keys()].map((c) => `<th>${c}</th>`).join("")}</tr>${sb.map((r, k) => `<tr><th>${k}</th>${r.map((x) => `<td>${x}</td>`).join("")}</tr>`).join("")}</table></div></details>`).join("")}`;
  }
  function showTab(name) {
    ["rounds", "keys", "tables"].forEach((n) => $("#tab-" + n).classList.toggle("hidden", n !== name));
    document.querySelectorAll("[data-tab]").forEach((b) => { const on = b.dataset.tab === name; b.classList.toggle("btn-primary", on); b.setAttribute("aria-selected", on); });
  }
  document.querySelectorAll("[data-tab]").forEach((b) => b.addEventListener("click", () => showTab(b.dataset.tab)));
  $("#lab-form").addEventListener("submit", (e) => { e.preventDefault(); if (e.submitter) mode = e.submitter.dataset.mode; run(); });
  $("#lab-vector").addEventListener("change", (e) => {
    const v = vectors[+e.target.value]; if (!v) return;
    $("#lab-key").value = v.key; $("#lab-block").value = mode === "decrypt" ? v.ciphertext : v.plaintext; run();
  });
  $("#lab-a2h").onclick = () => {
    const s = $("#lab-ascii").value;
    if (s.length !== 8) { $("#lab-error").textContent = "Type exactly 8 ASCII characters to make one 64-bit block."; $("#lab-error").classList.remove("hidden"); return; }
    $("#lab-block").value = [...s].map((c) => c.charCodeAt(0).toString(16).padStart(2, "0").toUpperCase()).join("");
  };
  $("#lab-explain").addEventListener("change", (e) => document.body.classList.toggle("hide-explain", !e.target.checked));
  const vi = params.get("vector");
  if (vi !== null && vectors[+vi]) { $("#lab-key").value = vectors[+vi].key; $("#lab-block").value = mode === "decrypt" ? vectors[+vi].ciphertext : vectors[+vi].plaintext; }
  run();
})();
