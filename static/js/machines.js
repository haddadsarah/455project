/* CipherBreak EDU — in-world puzzle machines.
 * Every DES puzzle is operated as a device (dials, bit lamps, patch cables, cutters,
 * rotor disks, XOR gates, S-box grids, key racks, letter wheels). Each machine turns
 * the player's manipulations into the answer fields the server checks; the server
 * still owns every rule and answer.
 *
 * Machines.build(P, M) -> { html, bind(root), solved?(res), wrong?(res) }
 * M = { set(name, value), mode, sound(kind), esc }
 */
(function () {
  "use strict";
  const esc = (s) => CB.esc(s);
  const HEX = "0123456789ABCDEF".split("");
  const $ = (s, el) => el.querySelector(s);
  const $$ = (s, el) => Array.from(el.querySelectorAll(s));

  /* ---------- shared building blocks ---------- */
  function lampGrid(bits, opts) {
    opts = opts || {};
    const cols = opts.cols || 8;
    return `<div class="lamps ${opts.cls || ""}" ${opts.id ? `id="${opts.id}"` : ""} style="--cols:${cols}" role="group" aria-label="${opts.label || "bits"}">` +
      bits.split("").map((b, i) => {
        const tag = opts.buttons ? "button type=\"button\"" : "span";
        const end = opts.buttons ? "button" : "span";
        const hidden = opts.hide && opts.hide.includes(i + 1);
        return `<${tag} class="lamp ${hidden ? "unk" : b === "1" ? "on" : "off"}" data-pos="${i + 1}" aria-label="bit ${i + 1}${hidden ? "" : " = " + b}">` +
          `<i>${hidden ? "?" : b}</i>${opts.numbered === false ? "" : `<small>${i + 1}</small>`}</${end}>`;
      }).join("") + `</div>`;
  }
  function bitSwitches(n, id, label) {
    return `<div class="switches" id="${id}" role="group" aria-label="${label}">` +
      Array.from({ length: n }, (_, i) => `<button type="button" class="bitsw" data-i="${i}" aria-label="${label} bit ${i + 1}: unset">?</button>`).join("") + `</div>`;
  }
  function bindSwitches(root, id, onChange) {
    const btns = $$(`#${id} .bitsw`, root), vals = btns.map(() => "?");
    btns.forEach((b, i) => b.addEventListener("click", () => {
      vals[i] = vals[i] === "1" ? "0" : "1";
      b.textContent = vals[i]; b.classList.toggle("on", vals[i] === "1"); b.classList.add("set");
      b.setAttribute("aria-label", b.getAttribute("aria-label").replace(/: .*/, ": " + vals[i]));
      CB.sound("click"); onChange(vals.includes("?") ? "" : vals.join(""), vals);
    }));
    return vals;
  }
  /* Rotary/flip dial: ▲ ▼ buttons, arrow keys, or type a symbol directly. */
  function dial(id, value, label, extraCls) {
    return `<div class="dial ${extraCls || ""}" id="${id}" tabindex="0" role="spinbutton" aria-label="${label}" aria-valuetext="${value}">
      <button type="button" class="up" tabindex="-1" aria-hidden="true">▲</button><span class="face">${value}</span><button type="button" class="dn" tabindex="-1" aria-hidden="true">▼</button></div>`;
  }
  function bindDial(root, id, values, onChange, start) {
    const el = $("#" + id, root); let k = Math.max(0, values.indexOf(String(start ?? values[0])));
    const show = (dir) => {
      const face = $(".face", el); face.textContent = values[k]; el.setAttribute("aria-valuetext", values[k]);
      if (dir && !CB.reducedMotion()) { face.classList.remove("flip-up", "flip-dn"); void face.offsetWidth; face.classList.add(dir > 0 ? "flip-up" : "flip-dn"); }
      onChange(values[k]);
    };
    const step = (d) => { k = (k + d + values.length) % values.length; CB.sound("click"); show(d); };
    $(".up", el).addEventListener("click", () => step(1));
    $(".dn", el).addEventListener("click", () => step(-1));
    el.addEventListener("wheel", (e) => { e.preventDefault(); step(e.deltaY < 0 ? 1 : -1); }, { passive: false });
    el.addEventListener("keydown", (e) => {
      if (e.key === "ArrowUp") { e.preventDefault(); step(1); }
      else if (e.key === "ArrowDown") { e.preventDefault(); step(-1); }
      else if (e.key.length === 1) {
        const i = values.findIndex((v) => v.toUpperCase() === e.key.toUpperCase());
        if (i >= 0) {
          e.preventDefault(); k = i; CB.sound("click"); show(1);
          const group = el.closest("[data-dialgroup]");
          if (group) { const all = $$(".dial", group), nx = all[all.indexOf(el) + 1]; if (nx) nx.focus(); }
        }
      }
    });
    show(0);
    return { set(v) { const i = values.indexOf(String(v)); if (i >= 0) { k = i; show(0); } } };
  }
  const NUMS = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => String(a + i));
  function numberDial(root, id, lo, hi, start, onChange) { return bindDial(root, id, NUMS(lo, hi), onChange, start); }
  function hexDials(prefix, n, label) {
    return `<div class="dials" id="${prefix}" data-dialgroup>` + Array.from({ length: n }, (_, i) => dial(`${prefix}-${i}`, "0", `${label} digit ${i + 1}`)).join("") + `</div>`;
  }
  function bindHexDials(root, prefix, n, onChange) {
    const vals = Array(n).fill("0");
    for (let i = 0; i < n; i++) bindDial(root, `${prefix}-${i}`, HEX, (v) => { vals[i] = v; onChange(vals.join("")); });
    return vals;
  }
  const valBox = (label, x, cls) => `<div class="cart ${cls || ""}"><b>${label}</b><span class="hx">${x.hex}</span><span class="bn">${CB.group(x.bin, x.bits === 48 ? 6 : x.bits === 56 || x.bits === 28 ? 7 : 4)}</span></div>`;
  const screen = (inner, id) => `<div class="crt" ${id ? `id="${id}"` : ""}>${inner}</div>`;
  const note = (id, text) => `<p class="mnote" id="${id}" aria-live="polite">${text || ""}</p>`;
  const drawer = (title, inner, id) => `<details class="drawer" ${id ? `id="${id}"` : ""}><summary>${title}</summary><div class="drawer-body">${inner}</div></details>`;
  const fieldOf = (P, name) => P.fields.find((f) => f.name === name);

  /* ---------- Permutation patch-bay (IP, PC-1, PC-2, P) ---------- */
  function tracer(P, M, cfg) {
    const v = P.view, table = v.table, pos = v.position;
    return {
      html: `<div class="tracer" id="m-tracer">
        <div class="tr-col"><h4>${cfg.srcTitle}</h4>${lampGrid(cfg.bits, { cols: cfg.srcCols, id: "m-src", buttons: true, label: cfg.srcTitle })}
          <p class="tiny muted">${cfg.srcHelp}</p></div>
        <div class="tr-col"><h4>${cfg.tableTitle}</h4>
          <div class="ptable" id="m-ptable" style="--cols:${cfg.tableCols}">${table.map((s, i) => `<button type="button" class="pcell ${i + 1 === pos ? "target" : ""}" data-k="${i + 1}" data-v="${s}" title="Output ${i + 1} ← ${s}"><small>${i + 1}</small>${s}</button>`).join("")}</div>
          <p class="tiny muted">Cell <b>k</b> holds the ${cfg.srcWord} that lands at output position <b>k</b>. Click cells to inspect.</p></div>
      </div>
      <div class="socket-row">
        <div class="socket" id="m-socket"><span class="lbl top">${cfg.outLabel} <b>${pos}</b></span>
          <div class="socket-io"><span class="plug" id="m-plug">⟵ patch a cable</span>
          <span class="lbl">value</span>${bitSwitches(1, "m-val", "Output value")}</div></div>
      </div>
      ${note("m-note", `Patch the cable: click the ${cfg.srcWord} that feeds output position ${pos}. Then set the value it carries.`)}
      <svg class="cable" id="m-cable" aria-hidden="true"></svg>`,
      bind(root) {
        const noteEl = $("#m-note", root);
        let patched = null;
        const drawCable = () => {
          const svg = $("#m-cable", root), box = root.getBoundingClientRect();
          if (!patched) { svg.innerHTML = ""; return; }
          const a = $(`#m-src .lamp[data-pos="${patched}"]`, root).getBoundingClientRect(), b = $("#m-plug", root).getBoundingClientRect();
          const x1 = a.left + a.width / 2 - box.left, y1 = a.bottom - box.top - 2, x2 = b.left - box.left + 8, y2 = b.top + b.height / 2 - box.top;
          svg.setAttribute("width", root.scrollWidth); svg.setAttribute("height", root.scrollHeight);
          svg.innerHTML = `<path d="M${x1},${y1} C${x1},${y2 + 40} ${x2 - 80},${y2} ${x2},${y2}" /><circle cx="${x1}" cy="${y1}" r="4"/><circle cx="${x2}" cy="${y2}" r="4"/>`;
        };
        $$("#m-src .lamp", root).forEach((l) => l.addEventListener("click", () => {
          $$("#m-src .lamp", root).forEach((x) => x.classList.remove("patched"));
          patched = +l.dataset.pos; l.classList.add("patched");
          $("#m-plug", root).textContent = `${cfg.srcWord} #${patched}`; $("#m-plug", root).classList.add("live");
          M.set("source", String(patched)); CB.sound("zap"); drawCable();
          noteEl.textContent = `Cable patched from ${cfg.srcWord} ${patched}. Now set the value that travels down it.`;
        }));
        bindSwitches(root, "m-val", (val) => M.set("value", val));
        $$("#m-ptable .pcell", root).forEach((c) => c.addEventListener("click", () => {
          $$("#m-ptable .pcell", root).forEach((x) => x.classList.remove("hl"));
          $$("#m-src .lamp", root).forEach((x) => x.classList.remove("hl"));
          const k = +c.dataset.k, s = +c.dataset.v;
          if (k === pos) { noteEl.innerHTML = `Position <b>${pos}</b> is your job: read the number in this cell, then patch that ${cfg.srcWord}.`; c.classList.add("hl"); return; }
          c.classList.add("hl"); const lamp = $(`#m-src .lamp[data-pos="${s}"]`, root); if (lamp) lamp.classList.add("hl");
          noteEl.innerHTML = `${cfg.outLabel} ${k} ← ${cfg.srcWord} ${s} (value ${cfg.bits[s - 1]}). Positions move; values never change.`;
          CB.sound("click");
        }));
        window.addEventListener("resize", drawCable);
        root.addEventListener("scroll", drawCable, true);
      },
    };
  }

  /* ---------- Laser cutter (L0/R0 and C0/D0) ---------- */
  function cutter(P, M, cfg) {
    const hex = cfg.value.hex, n = hex.length, f = P.fields;
    return {
      html: `<h4>${cfg.title}</h4>
        <div class="cutter" id="m-cutter">${hex.split("").map((h, i) => `<span class="hd" data-i="${i}"><b>${h}</b><small>${CB.group(cfg.value.bin.slice(i * 4, i * 4 + 4))}</small></span>${i < n - 1 ? `<button type="button" class="gap" data-cut="${i + 1}" aria-label="Cut after digit ${i + 1}"><i></i></button>` : ""}`).join("")}</div>
        <p class="tiny muted">${n} hex digits × 4 bits = ${n * 4} bits. Click a gap to aim the laser.</p>
        <div class="trays"><div class="tray l" id="m-trayL"><b>${f[0].label}</b><span class="hx">—</span><small></small></div>
          <div class="tray r" id="m-trayR"><b>${f[1].label}</b><span class="hx">—</span><small></small></div></div>
        ${note("m-note", cfg.help)}`,
      bind(root) {
        $$("#m-cutter .gap", root).forEach((g) => g.addEventListener("click", () => {
          const c = +g.dataset.cut;
          $$("#m-cutter .gap", root).forEach((x) => x.classList.toggle("cut", x === g));
          $$("#m-cutter .hd", root).forEach((d) => { d.classList.toggle("left", +d.dataset.i < c); d.classList.toggle("right", +d.dataset.i >= c); });
          const L = hex.slice(0, c), R = hex.slice(c);
          $("#m-trayL .hx", root).textContent = L; $("#m-trayR .hx", root).textContent = R;
          $("#m-trayL small", root).textContent = `${L.length * 4} bits`; $("#m-trayR small", root).textContent = `${R.length * 4} bits`;
          M.set(f[0].name, L); M.set(f[1].name, R); CB.sound("zap");
          $("#m-note", root).textContent = L.length === R.length ? "Two equal halves. Engage when you're sure." : `Left ${L.length * 4} bits, right ${R.length * 4} bits. Are the halves equal?`;
        }));
      },
    };
  }

  /* ---------- Big switches for multiple-choice ---------- */
  function choiceSwitches(field, id) {
    return `<fieldset class="levers" id="${id}"><legend>${esc(field.label)}</legend>${field.options.map((o) =>
      `<button type="button" class="lever" data-v="${o.value}" aria-pressed="false"><span class="knob"></span><span>${esc(o.label)}</span></button>`).join("")}</fieldset>`;
  }
  function bindChoice(root, id, name, M) {
    $$(`#${id} .lever`, root).forEach((b) => b.addEventListener("click", () => {
      $$(`#${id} .lever`, root).forEach((x) => { x.classList.remove("on"); x.setAttribute("aria-pressed", "false"); });
      b.classList.add("on"); b.setAttribute("aria-pressed", "true"); CB.sound("click"); M.set(name, b.dataset.v);
    }));
  }

  /* ---------- Feistel router (encrypt module 5 and decryption round) ---------- */
  function router(P, M, dec) {
    const v = P.view;
    const carts = { L: v.l, R: v.r, F: v.f };
    const lName = dec ? "Left in" : `L${v.round - 1}`, rName = dec ? "Right in" : `R${v.round - 1}`, fName = dec ? "F(R, K?)" : `F(R${v.round - 1}, K${v.round})`;
    const outL = dec ? "new left half" : `L${v.round}`, outR = dec ? "new right half" : `R${v.round}`;
    return {
      html: `${dec ? `<div class="keydial-row"><span>Decryption round <b>${v.round}</b> of 16 uses subkey K</span>${dial("m-kdial", "1", "Subkey number")}<span class="tiny muted">(keys run in reverse)</span></div>` : ""}
        <div class="router" id="m-router">
          <div class="carts">${valBox(lName, v.l, "l")}${valBox(rName, v.r, "r")}${valBox(fName, v.f, "f")}</div>
          <div class="formula">L<sub>i</sub> = R<sub>i−1</sub> &nbsp;·&nbsp; R<sub>i</sub> = L<sub>i−1</sub> ⊕ F(R<sub>i−1</sub>, K<sub>i</sub>)</div>
          <div class="outs">
            <div class="slot-out" id="m-outL"><b>${outL}</b><div class="route">${["L", "R", "F"].map((k) => `<button type="button" data-c="${k}">${k === "L" ? lName : k === "R" ? rName : "F"}</button>`).join("")}</div><span class="hx">— route a value —</span></div>
            <div class="slot-out xorunit" id="m-outR"><b>${outR} = ${lName} ⊕ F</b>${hexDials("m-rd", 8, outR)}
              <div class="xhelp" id="m-xhelp" aria-live="polite">Focus a dial to see that digit's XOR in binary.</div></div>
          </div></div>
        ${drawer("Hex ↔ binary helper", `<p class="mono small">0=0000 1=0001 2=0010 3=0011 4=0100 5=0101 6=0110 7=0111<br>8=1000 9=1001 A=1010 B=1011 C=1100 D=1101 E=1110 F=1111</p>`)}`,
      bind(root) {
        if (dec) numberDial(root, "m-kdial", 1, 16, 1, (x) => M.set("key", x));
        $$("#m-outL .route button", root).forEach((b) => b.addEventListener("click", () => {
          $$("#m-outL .route button", root).forEach((x) => x.classList.toggle("on", x === b));
          const x = carts[b.dataset.c]; $("#m-outL .hx", root).textContent = x.hex; M.set("l", x.hex); CB.sound("zap");
        }));
        bindHexDials(root, "m-rd", 8, (s) => M.set("r", s));
        const bin = (h) => parseInt(h, 16).toString(2).padStart(4, "0");
        $$("#m-rd .dial", root).forEach((d, i) => d.addEventListener("focus", () => {
          const a = v.l.hex[i], b = v.f.hex[i];
          $("#m-xhelp", root).innerHTML = `Digit ${i + 1}: <span class="mono">${a} = ${bin(a)}</span> ⊕ <span class="mono">${b} = ${bin(b)}</span> → ? (1 where the bits differ)`;
        }));
      },
    };
  }

  /* ============== The machines ============== */
  const BUILD = {
    ascii(P, M) {
      const v = P.view;
      return {
        html: `<h4>Access terminal — code <span class="mono glow">${esc(v.code)}</span></h4>
          <div class="letters" id="m-letters" data-dialgroup>${v.chars.map((c, i) => `<div class="letter-col"><button type="button" class="plate" id="m-char${i}" data-i="${i}" aria-label="Inspect character ${i + 1}: ${esc(c.ch)}">${esc(c.ch)}</button>
            <div class="pair">${dial(`m-hx-${i * 2}`, "0", `Character ${i + 1} high hex digit`)}${dial(`m-hx-${i * 2 + 1}`, "0", `Character ${i + 1} low hex digit`)}</div></div>`).join("")}</div>
          ${screen(`<div id="m-detail" aria-live="polite">Click a letter plate to scan its ASCII code.</div>`, "m-scan")}
          <p class="tiny muted">8 characters × 8 bits = 64 bits = 16 hex digits. Set two hex dials under every letter (type 0–9/A–F or use ▲▼).</p>`,
        bind(root) {
          const vals = Array(16).fill("0");
          for (let i = 0; i < 16; i++) bindDial(root, `m-hx-${i}`, HEX, (x) => { vals[i] = x; M.set("hex", vals.join("")); });
          $$(".plate", root).forEach((t) => t.addEventListener("click", () => {
            $$(".plate", root).forEach((x) => x.classList.remove("active")); t.classList.add("active");
            const c = v.chars[+t.dataset.i];
            const hx = c.hex ? `<b class="nib">${c.hex[0]}</b><b class="nib">${c.hex[1]}</b>` : `<b class="nib">?</b><b class="nib">?</b> <span class="tiny">(Challenge: convert each nibble yourself)</span>`;
            $("#m-detail", root).innerHTML = `<span class="big">'${esc(c.ch)}'</span> → ASCII <b>${c.dec}</b> → bits <b class="nib">${c.bin.slice(0, 4)}</b><b class="nib">${c.bin.slice(4)}</b> → hex ${hx}`;
            CB.sound("scan");
          }));
        },
      };
    },
    block(P, M) {
      const v = P.view, hidden = v.hidden_byte;
      return {
        html: `<h4>Block inspector</h4>${screen(`<div class="hexline big">${v.block}</div>`)}
          <div class="bytes" id="m-bytes">${v.bytes.map((b) => `<div class="byte ${b.bin ? "" : "hid"}"><small>byte ${b.index}</small><b>${b.hex}</b>${b.bin ? `<span class="bn">${b.bin}</span>` : bitSwitches(8, "m-hb", `Byte ${b.index}`)}</div>`).join("")}</div>
          ${note("m-note", `Byte ${hidden}'s bit lamps are dark. Flip its 8 switches to the right bits (each hex digit = 4 bits).`)}
          ${choiceSwitches(fieldOf(P, "choice"), "m-choice")}`,
        bind(root) { bindSwitches(root, "m-hb", (x) => M.set("bin", x)); bindChoice(root, "m-choice", "choice", M); },
      };
    },
    ip(P, M) {
      return tracer(P, M, { bits: P.view.bits, srcCols: 8, srcTitle: "Input block — 64 bits", srcHelp: "Rows are bytes. Small numbers are bit positions 1–64.", tableTitle: "IP wiring table", tableCols: 8, srcWord: "input bit", outLabel: "IP output position" });
    },
    split(P, M) { return cutter(P, M, { value: P.view.ip, title: "Block after IP — aim the splitter", help: "DES cuts the 64-bit block into a left half L0 and a right half R0." }); },
    key(P, M) {
      const v = P.view;
      return {
        html: `<h4>Vault key reader — ${v.key.hex}</h4>
          ${lampGrid(v.key.bin, { cols: 8, id: "m-keybits", buttons: true, label: "Key bits", cls: "taggable" })}
          <p class="tiny muted">Each row is one byte. Click lamps to tag the ones you think are <b>parity bits</b> (they get a P tag).</p>
          <div class="keydial-row"><span>Effective key bits after removing parity:</span>${dial("m-eff", "64", "Effective key bits")}</div>
          ${note("m-note", "")}`,
        bind(root) {
          const tagged = new Set();
          const patterns = { "0": [8, 16, 24, 32, 40, 48, 56, 64], "1": [1, 9, 17, 25, 33, 41, 49, 57], "2": [57, 58, 59, 60, 61, 62, 63, 64] };
          const update = () => {
            const s = [...tagged].sort((a, b) => a - b).join(",");
            let choice = "";
            if (!tagged.size) choice = "3";
            Object.entries(patterns).forEach(([k, arr]) => { if (arr.join(",") === s) choice = k; });
            M.set("choice", choice);
            $("#m-note", root).textContent = tagged.size && !choice ? `${tagged.size} bit(s) tagged. Parity bits follow a regular pattern; keep tagging until it is complete.` : tagged.size ? `${tagged.size} parity bits tagged.` : "No bits tagged (that means: no parity bits).";
          };
          $$("#m-keybits .lamp", root).forEach((l) => l.addEventListener("click", () => {
            const p = +l.dataset.pos; if (tagged.has(p)) tagged.delete(p); else tagged.add(p);
            l.classList.toggle("tag", tagged.has(p)); CB.sound("click"); update();
          }));
          numberDial(root, "m-eff", 0, 64, 64, (x) => M.set("effective", x));
          update();
        },
      };
    },
    pc1(P, M) {
      return tracer(P, M, { bits: P.view.key.bin, srcCols: 8, srcTitle: "64-bit key", srcHelp: "Rows are bytes. Notice what PC-1 never selects.", tableTitle: "PC-1 module (56 wires)", tableCols: 7, srcWord: "key bit", outLabel: "PC-1 output position" });
    },
    keysplit(P, M) { return cutter(P, M, { value: P.view.pc1, title: "PC-1 output (56 bits) — aim the splitter", help: "The 56 bits split into two 28-bit halves, C0 and D0." }); },
    shift(P, M) {
      const v = P.view;
      return {
        html: `<h4>Rotation schedule</h4><div class="sched" id="m-sched">${v.schedule.map((s, i) => `<span class="${i + 1 === v.round ? "cur" : i + 1 < v.round ? "past" : ""}"><small>R${i + 1}</small>${s}</span>`).join("")}</div>
          <div class="rotors" id="m-rotors">${["c", "d"].map((h) => `<div class="rotor-wrap" id="m-${h}wrap">
            <div class="rotor" id="m-rotor-${h}"><div class="hub">${h.toUpperCase()}<small id="m-${h}n">0 turns</small></div></div>
            <div class="rot-btns"><button type="button" class="mbtn" id="m-rot-${h}">⟲ Rotate ${h.toUpperCase()} left</button><button type="button" class="mbtn ghost" id="m-reset-${h}">Reset</button></div>
            <p class="lin mono" id="m-${h}lin"></p></div>`).join("")}</div>
          ${note("m-note", `Load: C${v.round - 1} and D${v.round - 1}. The amber lamp is bit 1; watch it wrap to the end when you rotate.`)}`,
        bind(root) {
          const st = { c: v.c_prev.bin, d: v.d_prev.bin }, n = { c: 0, d: 0 }, ang = { c: 0, d: 0 };
          const draw = (h) => {
            const rotor = $(`#m-rotor-${h}`, root);
            $$(".rb", rotor).forEach((x) => x.remove());
            const R = 92;
            st[h].split("").forEach((b, i) => {
              const s = document.createElement("span"); const a = (i / 28) * 2 * Math.PI - Math.PI / 2;
              s.className = "rb " + (b === "1" ? "on " : "") + ((i + n[h]) % 28 === 0 ? "first" : "");
              s.style.left = `calc(50% + ${Math.cos(a) * R}px)`; s.style.top = `calc(50% + ${Math.sin(a) * R}px)`; s.textContent = b; rotor.appendChild(s);
            });
            $(`#m-${h}n`, root).textContent = `${n[h]} turn${n[h] === 1 ? "" : "s"}`;
            $(`#m-${h}lin`, root).textContent = `${h.toUpperCase()} = ${CB.group(st[h], 7)}`;
            M.set(h, n[h] ? st[h] : "");
          };
          ["c", "d"].forEach((h) => {
            $(`#m-rot-${h}`, root).addEventListener("click", () => {
              st[h] = st[h].slice(1) + st[h][0]; n[h]++; CB.sound("rotor");
              const rotor = $(`#m-rotor-${h}`, root);
              if (!CB.reducedMotion()) { rotor.classList.remove("spin"); void rotor.offsetWidth; rotor.classList.add("spin"); }
              draw(h);
            });
            $(`#m-reset-${h}`, root).addEventListener("click", () => { st[h] = (h === "c" ? v.c_prev : v.d_prev).bin; n[h] = 0; ang[h] = 0; draw(h); });
            draw(h);
          });
        },
      };
    },
    pc2(P, M) {
      const v = P.view;
      return tracer(P, M, { bits: v.cd.bin, srcCols: 7, srcTitle: `C${v.round} ‖ D${v.round} (56 bits)`, srcHelp: "First 4 rows = C, last 4 rows = D.", tableTitle: `PC-2 module → K${v.round} (48 wires)`, tableCols: 6, srcWord: "C‖D bit", outLabel: `K${v.round} bit` });
    },
    keyexplorer(P, M) {
      const ks = P.view.schedule;
      return {
        html: `<div class="forge" id="m-forge">
            <button type="button" class="biglever" id="m-run"><span class="handle"></span>PULL TO FORGE K1 → K16</button>
            <div class="kslots" id="m-kslots">${ks.rounds.map((r) => `<button type="button" class="kslot" data-k="${r.round}"><small>K${r.round}</small><span>⟲${r.shift}</span></button>`).join("")}</div>
            <div class="gauge"><span>Total rotation</span><b id="m-total">0</b><i id="m-gbar"></i></div></div>
          ${note("m-note", "Pull the lever. Each round rotates C and D, then PC-2 stamps out a 48-bit key.")}
          <div class="answers-row"><div class="keydial-row"><span>Total rotation after round 16</span>${dial("m-tot", "0", "Total rotation")}</div>
          ${choiceSwitches(fieldOf(P, "same"), "m-same")}</div>
          ${drawer("Inspect every key round (C, D, shift, PC-2, subkey)", `<div id="m-ks"></div>`, "m-ksd")}`,
        bind(root) {
          CB.renderKeySchedule($("#m-ks", root), ks);
          numberDial(root, "m-tot", 0, 64, 0, (x) => M.set("total", x));
          bindChoice(root, "m-same", "same", M);
          $$(".kslot", root).forEach((b) => b.addEventListener("click", () => {
            $("#m-ksd", root).open = true; const t = $(`[data-kround="${b.dataset.k}"]`, root); if (t) t.click();
          }));
          $("#m-run", root).addEventListener("click", () => {
            const lever = $("#m-run", root); lever.classList.add("pulled"); lever.disabled = true;
            let k = 0;
            const step = () => {
              const r = ks.rounds[k], slot = $$(".kslot", root)[k];
              slot.classList.add("lit"); slot.title = r.subkey.hex;
              $("#m-gbar", root).style.width = (r.total_shift / 28) * 100 + "%";
              $("#m-note", root).innerHTML = `Round ${r.round}: rotate ⟲${r.shift} → C${r.round}=${r.c.hex}, D${r.round}=${r.d.hex} → K${r.round} = <b>${r.subkey.hex}</b>`;
              $("#m-total", root).textContent = "…";
              CB.sound("forge"); k++;
              if (k < 16) setTimeout(step, CB.reducedMotion() ? 40 : 260);
              else { lever.disabled = false; lever.classList.remove("pulled"); $("#m-total", root).textContent = "?"; $("#m-note", root).innerHTML += "<br>All 16 keys forged. Count the rotations in the schedule and compare C16 with C0 in the inspector."; }
            };
            step();
          });
        },
      };
    },
    expand(P, M) {
      const v = P.view;
      return {
        html: `<h4>R${v.round - 1} — 32 bits in</h4>${lampGrid(v.r.bin, { cols: 8, id: "m-rbits", label: "Right half bits" })}
          <h4>Expansion E — 48 output sockets (8 groups of 6)</h4>
          <div class="esockets" id="m-esock">${v.table.map((s, i) => {
            const k = v.positions.indexOf(i + 1);
            return k >= 0 ? `<button type="button" class="esock target" data-k="${i + 1}" data-f="b${k}" aria-label="E output ${i + 1}: unset"><small>${i + 1}</small><i>?</i><em>←${s}</em></button>`
              : `<button type="button" class="esock" data-k="${i + 1}" data-v="${s}"><small>${i + 1}</small><i>${s}</i></button>`;
          }).join("")}</div>
          ${note("m-note", `Glowing sockets ${v.positions.join(", ")} are dead. Click a live socket to see which R bit feeds it; click a dead socket to set its bit.`)}`,
        bind(root) {
          const vals = {};
          $$("#m-esock .esock", root).forEach((s) => s.addEventListener("click", () => {
            $$("#m-rbits .lamp", root).forEach((x) => x.classList.remove("hl"));
            if (s.classList.contains("target")) {
              const f = s.dataset.f; vals[f] = vals[f] === "1" ? "0" : "1";
              s.querySelector("i").textContent = vals[f]; s.classList.add("set"); s.classList.toggle("on", vals[f] === "1");
              M.set(f, vals[f]); CB.sound("click"); return;
            }
            const src = +s.dataset.v; const l = $(`#m-rbits .lamp[data-pos="${src}"]`, root); l.classList.add("hl");
            $("#m-note", root).textContent = `E output ${s.dataset.k} ← R bit ${src} = ${v.r.bin[src - 1]}. Edge bits of each 4-bit group get copied twice.`;
            CB.sound("click");
          }));
        },
      };
    },
    xor(P, M) {
      const v = P.view, g = v.group, a = v.expanded.bin.slice(6 * g, 6 * g + 6), k = v.subkey.bin.slice(6 * g, 6 * g + 6);
      const hl = (bits) => bits.split("").map((b, i) => `<span class="${Math.floor(i / 6) === g ? "hl" : ""}">${b}</span>${i % 6 === 5 ? " " : ""}`).join("");
      return {
        html: `<div class="busrows">${screen(`<div><small>E(R${v.round - 1})</small> <span class="mono">${hl(v.expanded.bin)}</span></div><div><small>K${v.key_index}</small> <span class="mono">${hl(v.subkey.bin)}</span></div>`)}</div>
          <h4>XOR wiring — group ${g + 1} (bits ${6 * g + 1}–${6 * g + 6})</h4>
          <div class="gates" id="m-gates">${a.split("").map((x, i) => `<div class="xgate" data-i="${i}">
            <span class="in ${x === "1" ? "on" : ""}">${x}</span><span class="in ${k[i] === "1" ? "on" : ""}">${k[i]}</span>
            <svg viewBox="0 0 40 40" class="sym" aria-hidden="true"><path d="M6,6 Q20,20 6,34 M10,6 Q26,6 34,20 Q26,34 10,34 Q24,20 10,6"/><path d="M20,4 L20,36 M8,20 L32,20" class="plus"/></svg>
            <button type="button" class="bitsw out" aria-label="Output bit ${i + 1}: unset">?</button></div>`).join("")}</div>
          <table class="truth" aria-label="XOR truth table"><tr><th>a</th><th>b</th><th>a⊕b</th></tr><tr><td>0</td><td>0</td><td>0</td></tr><tr><td>0</td><td>1</td><td>1</td></tr><tr><td>1</td><td>0</td><td>1</td></tr><tr><td>1</td><td>1</td><td>0</td></tr></table>`,
        bind(root) {
          const out = Array(6).fill("?");
          $$("#m-gates .out", root).forEach((b, i) => b.addEventListener("click", () => {
            out[i] = out[i] === "1" ? "0" : "1"; b.textContent = out[i]; b.classList.add("set"); b.classList.toggle("on", out[i] === "1");
            $$("#m-gates .xgate", root).forEach((x) => x.classList.remove("live", "dead"));
            CB.sound("click"); M.set("x", out.includes("?") ? "" : out.join(""));
          }));
        },
        solved(root) { $$("#m-gates .xgate", root).forEach((x, i) => setTimeout(() => x.classList.add("live"), i * 90)); },
        wrong(root) { $$("#m-gates .xgate", root).forEach((x) => x.classList.add("dead")); },
      };
    },
    sbox(P, M) {
      const v = P.view, inp = v.input;
      return {
        html: `<div class="sin" id="m-sin">${inp.split("").map((b, i) => `<span class="lamp ${b === "1" ? "on" : "off"} ${i === 0 || i === 5 ? "rowbit" : "colbit"}"><i>${b}</i><small>${i + 1}</small></span>`).join("")}
            <span class="legend"><b class="rowc">row = bits 1 &amp; 6</b> <b class="colc">column = bits 2–5</b></span></div>
          <h4>S${v.box} substitution grid — select the row and column</h4>
          <div class="sgrid" id="m-sgrid" role="grid" aria-label="S${v.box} table">
            <span class="corner"></span>${[...Array(16).keys()].map((c) => `<button type="button" class="ch" data-c="${c}">${c}<small>${c.toString(2).padStart(4, "0")}</small></button>`).join("")}
            ${v.table.map((row, r) => `<button type="button" class="rh" data-r="${r}">${r}<small>${r.toString(2).padStart(2, "0")}</small></button>${row.map((x, c) => `<button type="button" class="sc" data-r="${r}" data-c="${c}">${x}</button>`).join("")}`).join("")}
          </div>
          <div class="sout"><span>Row <b id="m-srow">?</b> · Column <b id="m-scol">?</b> → value <b id="m-sval">?</b> → 4-bit output</span>${bitSwitches(4, "m-sbits", "S-box output")}</div>
          ${note("m-note", "Click a row header and a column header (or a cell). Then flip the 4 output lamps.")}`,
        bind(root) {
          let r = null, c = null;
          const upd = () => {
            $$("#m-sgrid .sc, #m-sgrid .rh, #m-sgrid .ch", root).forEach((x) => x.classList.remove("rowhl", "colhl", "sel"));
            if (r !== null) $$(`#m-sgrid [data-r="${r}"]`, root).forEach((x) => x.classList.add("rowhl"));
            if (c !== null) $$(`#m-sgrid [data-c="${c}"]`, root).forEach((x) => x.classList.add("colhl"));
            $("#m-srow", root).textContent = r ?? "?"; $("#m-scol", root).textContent = c ?? "?";
            if (r !== null && c !== null) { const cell = $(`#m-sgrid .sc[data-r="${r}"][data-c="${c}"]`, root); cell.classList.add("sel"); $("#m-sval", root).textContent = cell.textContent; }
            else $("#m-sval", root).textContent = "?";
            M.set("row", r === null ? "" : String(r)); M.set("col", c === null ? "" : String(c));
            CB.sound("click");
          };
          $$("#m-sgrid .rh", root).forEach((b) => b.addEventListener("click", () => { r = +b.dataset.r; upd(); }));
          $$("#m-sgrid .ch", root).forEach((b) => b.addEventListener("click", () => { c = +b.dataset.c; upd(); }));
          $$("#m-sgrid .sc", root).forEach((b) => b.addEventListener("click", () => { r = +b.dataset.r; c = +b.dataset.c; upd(); }));
          bindSwitches(root, "m-sbits", (x) => M.set("out", x));
        },
      };
    },
    perm(P, M) {
      const v = P.view;
      const t = tracer(P, M, { bits: v.s_output.bin, srcCols: 4, srcTitle: "S1…S8 outputs (32 bits)", srcHelp: "Each row is one S-box's 4 output bits.", tableTitle: "Permutation P (32 wires)", tableCols: 8, srcWord: "S-output bit", outLabel: "P output position" });
      t.html = drawer("This round's S-box lookups", CB.sboxCards(v.sboxes)) + t.html;
      return t;
    },
    feistel(P, M) { return router(P, M, false); },
    decround(P, M) { return router(P, M, true); },
    fullrun(P, M) {
      const tr = P.view.trace, f = fieldOf(P, "choice");
      return {
        html: `<div class="reactor" id="m-reactor">
            <div class="ring" id="m-ring">${tr.rounds.map((r, i) => `<span class="rl" style="--a:${(i / 16) * 360}deg"><i>${r.round}</i></span>`).join("")}<div class="core" id="m-core"><small>L|R</small><b id="m-lr">${tr.l0.hex}<br>${tr.r0.hex}</b></div></div>
            <div class="reactor-side"><button type="button" class="biglever" id="m-ignite"><span class="handle"></span>IGNITE · RUN 16 ROUNDS</button>
              ${note("m-note", "Your modules are repaired. Ignite the core to run all 16 rounds on your block.")}
              <div class="ipinv"><b>IP⁻¹ input slot</b>${f.options.map((o) => `<button type="button" class="cartopt" data-v="${o.value}">${esc(o.label)}</button>`).join("")}</div></div></div>
          ${drawer("Round log — every operation of every round", `<div id="m-trace"></div>`, "m-logd")}`,
        bind(root) {
          const view = CB.renderTrace($("#m-trace", root), Object.assign({ mode: "encrypt" }, tr));
          $$(".cartopt", root).forEach((b) => b.addEventListener("click", () => {
            $$(".cartopt", root).forEach((x) => x.classList.toggle("on", x === b)); M.set("choice", b.dataset.v); CB.sound("zap");
          }));
          $("#m-ignite", root).addEventListener("click", () => {
            const lever = $("#m-ignite", root); lever.classList.add("pulled"); lever.disabled = true;
            let k = 0; const lamps = $$("#m-ring .rl", root);
            const step = () => {
              const r = tr.rounds[k]; lamps[k].classList.add("lit");
              $("#m-lr", root).innerHTML = `${r.l_out.hex}<br>${r.r_out.hex}`; view.show(r.round);
              $("#m-note", root).innerHTML = `Round ${r.round}: K${r.key_index} · E → ⊕ → S-boxes → P → L${r.round}=${r.l_out.hex}, R${r.round}=${r.r_out.hex}`;
              CB.sound("power"); if (window.Game) window.Game.reactorPower((k + 1) / 16);
              k++;
              if (k < 16) setTimeout(step, CB.reducedMotion() ? 40 : 280);
              else { $("#m-core", root).classList.add("hot"); lever.classList.remove("pulled"); lever.disabled = false;
                $("#m-note", root).innerHTML = `16 rounds done: L16 = <b>${r.l_out.hex}</b>, R16 = <b>${r.r_out.hex}</b>. Which block goes into IP⁻¹? Load the right cartridge.`; }
            };
            step();
          });
        },
      };
    },
    order(P, M) {
      const v = P.view;
      return {
        html: `<div class="keyrack-head">${screen(`<div>Exit ciphertext <b class="mono">${v.cipher}</b> · key <b class="mono">${v.key.hex}</b></div>`)}</div>
          <p class="tiny muted"><b>Drag</b> each key cartridge into the decryption slot that uses it, or click a cartridge to drop it into the next empty slot. Click a filled slot to eject.</p>
          <div class="keycarts" id="m-chips">${v.chips.map((c) => `<button type="button" class="kcart" draggable="true" data-k="${c.k}" aria-label="Round key K${c.k}"><b>K${c.k}</b><small>${c.hex}</small></button>`).join("")}</div>
          <div class="kslots rack" id="m-slots">${[...Array(16).keys()].map((i) => `<div class="kslot" data-slot="${i}" tabindex="0" role="button" aria-label="Decryption round ${i + 1}: empty"><small>D${i + 1}</small><span>—</span></div>`).join("")}</div>
          <div class="btnrow"><button type="button" class="mbtn ghost" id="m-undo">Undo</button><button type="button" class="mbtn ghost" id="m-clear">Eject all</button></div>`,
        bind(root) {
          let slots = Array(16).fill(null); const hist = [];
          const draw = () => {
            $$(".kcart", root).forEach((c) => { const u = slots.includes(+c.dataset.k); c.classList.toggle("used", u); c.setAttribute("aria-disabled", u); });
            $$("#m-slots .kslot", root).forEach((d, i) => { const k = slots[i]; d.querySelector("span").textContent = k ? "K" + k : "—"; d.classList.toggle("lit", !!k); d.draggable = !!k; d.setAttribute("aria-label", `Decryption round ${i + 1}: ${k ? "K" + k : "empty"}`); });
            M.set("order", slots.every(Boolean) ? slots.join(",") : "");
          };
          const place = (k, i) => { hist.push(slots.slice()); const from = slots.indexOf(k), occ = slots[i]; if (from >= 0) slots[from] = occ; slots[i] = k; CB.sound("clunk"); draw(); };
          $$(".kcart", root).forEach((c) => {
            c.addEventListener("click", () => { const k = +c.dataset.k, i = slots.indexOf(null); if (!slots.includes(k) && i >= 0) place(k, i); });
            c.addEventListener("dragstart", (e) => { e.dataTransfer.setData("text/plain", c.dataset.k); e.dataTransfer.effectAllowed = "move"; });
          });
          $$("#m-slots .kslot", root).forEach((d, i) => {
            d.addEventListener("dragstart", (e) => { if (slots[i]) e.dataTransfer.setData("text/plain", String(slots[i])); });
            d.addEventListener("dragover", (e) => { e.preventDefault(); d.classList.add("over"); });
            d.addEventListener("dragleave", () => d.classList.remove("over"));
            d.addEventListener("drop", (e) => { e.preventDefault(); d.classList.remove("over"); const k = +e.dataTransfer.getData("text/plain"); if (k) place(k, i); });
            const clear = () => { if (slots[i]) { hist.push(slots.slice()); slots[i] = null; CB.sound("click"); draw(); } };
            d.addEventListener("click", clear);
            d.addEventListener("keydown", (e) => { if (["Enter", " ", "Delete", "Backspace"].includes(e.key)) { e.preventDefault(); clear(); } });
          });
          $("#m-undo", root).onclick = () => { if (hist.length) { slots = hist.pop(); draw(); } };
          $("#m-clear", root).onclick = () => { hist.push(slots.slice()); slots = Array(16).fill(null); draw(); };
          draw();
        },
      };
    },
    recover(P, M) {
      const v = P.view, pairs = v.plain.hex.match(/../g);
      const chars = []; for (let c = 32; c < 127; c++) chars.push(String.fromCharCode(c));
      const table = chars.map((ch) => `<span>${ch.charCodeAt(0).toString(16).toUpperCase()}=${ch === " " ? "␠" : esc(ch)}</span>`).join("");
      return {
        html: `${screen(`<div>Ciphertext <b class="mono">${v.cipher}</b> → 16 decryption rounds → plaintext</div><div class="hexline big" id="m-plain">${pairs.join(" ")}</div>`)}
          <h4>Exit keypad — turn each letter wheel to the character for its byte</h4>
          <div class="wheels" id="m-wheels" data-dialgroup>${pairs.map((p, i) => `<div class="wheel-col"><span class="mono byte">${p}</span>${dial(`m-wh-${i}`, "A", `Character ${i + 1} (byte ${p})`, "wheel")}</div>`).join("")}</div>
          ${drawer("ASCII reference (hex = character)", `<div class="ascii" id="m-ascii">${table}</div>`, "m-asciid")}
          ${drawer("Decryption log — all 16 rounds (keys K16 → K1)", `<div id="m-dtrace"></div>`)}`,
        bind(root) {
          const vals = Array(8).fill("A");
          for (let i = 0; i < 8; i++) bindDial(root, `m-wh-${i}`, chars, (x) => { vals[i] = x; M.set("code", vals.join("")); }, "A");
          CB.renderTrace($("#m-dtrace", root), Object.assign({ mode: "decrypt" }, v.trace));
        },
      };
    },
    verdict(P, M) {
      return {
        html: `<div class="dialog-q" id="m-verdict">${P.fields.map((f, i) => `<div class="vq" data-i="${i}" ${i ? "hidden" : ""}>
            <p class="nova-line"><span class="nova-face" aria-hidden="true"></span><span>“${esc(f.label)}”</span></p>
            <div class="vopts">${f.options.map((o) => `<button type="button" class="vopt" data-f="${f.name}" data-v="${o.value}">${esc(o.label)}</button>`).join("")}</div></div>`).join("")}
          <div class="vprog" id="m-vprog">${P.fields.map((f, i) => `<span data-i="${i}">${i + 1}</span>`).join("")}</div></div>
          <p class="disclaimer tiny">CipherBreak EDU is an educational simulator. Nothing here is a real attack on any system.</p>`,
        bind(root) {
          const qs = $$(".vq", root), prog = $$("#m-vprog span", root);
          const show = (i) => { qs.forEach((q, k) => (q.hidden = k !== i)); prog.forEach((p, k) => p.classList.toggle("cur", k === i)); };
          prog.forEach((p, i) => p.addEventListener("click", () => show(i)));
          $$(".vopt", root).forEach((b) => b.addEventListener("click", () => {
            const q = b.closest(".vq"); $$(".vopt", q).forEach((x) => x.classList.toggle("on", x === b));
            M.set(b.dataset.f, b.dataset.v); CB.sound("click");
            const i = +q.dataset.i; prog[i].classList.add("done");
            if (i < qs.length - 1) setTimeout(() => show(i + 1), 250);
          }));
          show(0);
        },
        wrong(root, res) {
          const prog = $$("#m-vprog span", root);
          Object.entries(res.fields || {}).forEach(([name, ok]) => { const i = +name.slice(1); if (prog[i]) { prog[i].classList.toggle("bad", !ok); prog[i].classList.toggle("done", ok); } });
          const first = Object.entries(res.fields || {}).find(([, ok]) => !ok);
          if (first) prog[+first[0].slice(1)].click();
        },
      };
    },
  };

  window.Machines = {
    build(P, M) { const b = BUILD[P.view.kind]; return b ? b(P, M) : { html: "<p>Unknown machine.</p>" }; },
    kinds: Object.keys(BUILD),
  };
})();
