"use strict";

const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
const all = (selector, root = document) => [...root.querySelectorAll(selector)];

for (const link of all("[data-open-details]")) {
  link.addEventListener("click", () => {
    const target = document.getElementById(link.hash.slice(1));
    if (target?.tagName === "DETAILS") target.open = true;
  });
}

for (const button of all("[data-copy]")) {
  button.addEventListener("click", async () => {
    const original = button.textContent;
    const accessibleLabel = button.getAttribute("aria-label");
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(button.dataset.copy);
      } else {
        const field = document.createElement("textarea");
        field.value = button.dataset.copy;
        field.style.position = "fixed";
        field.style.opacity = "0";
        document.body.append(field);
        field.select();
        const copied = document.execCommand("copy");
        field.remove();
        button.focus();
        if (!copied) throw new Error("Clipboard unavailable");
      }
      button.textContent = button.classList.contains("copy-icon") ? "✓" : "Copied";
      if (accessibleLabel) button.setAttribute("aria-label", "Copied");
    } catch {
      button.textContent = "Copy unavailable";
    }
    window.setTimeout(() => {
      button.textContent = original;
      if (accessibleLabel) button.setAttribute("aria-label", accessibleLabel);
    }, 1700);
  });
}

for (const sequence of all("[data-sequence]")) {
  const button = sequence.querySelector("[data-run-sequence]");
  const cells = all(".sequence-track span", sequence);
  button.addEventListener("click", async () => {
    button.disabled = true;
    sequence.classList.add("running");
    cells.forEach(cell => cell.classList.remove("lit"));
    for (const cell of cells) {
      cell.classList.add("lit");
      if (!motion.matches) await new Promise(resolve => window.setTimeout(resolve, 65));
    }
    button.disabled = false;
    sequence.classList.remove("running");
    sequence.querySelector(".sequence-value").animate(
      [{ opacity: .35 }, { opacity: 1 }], { duration: motion.matches ? 0 : 260 },
    );
  });
}

for (const inspector of all("[data-inspector]")) {
  const select = inspector.querySelector("[data-round-select]");
  const panels = all("[data-round-panel]", inspector);
  const selectRound = () => {
    for (const panel of panels) panel.hidden = panel.dataset.roundPanel !== select.value;
  };
  select.addEventListener("change", selectRound);
  selectRound();
}

for (const lab of all("[data-lab]")) {
  const explanations = lab.querySelector("[data-toggle-explanations]");
  explanations.addEventListener("change", () => {
    for (const paragraph of all("[data-explanation]", lab)) paragraph.hidden = !explanations.checked;
  });
  for (const button of all("[data-vector]", lab)) {
    button.addEventListener("click", () => {
      const [block, key, cipher] = button.dataset.vector.split("|");
      lab.querySelector("#block").value = block;
      lab.querySelector("#key").value = key;
      lab.querySelector("[data-vector-status]").textContent =
        `Loaded. Expected ciphertext is ${cipher}. Select Encrypt to calculate it.`;
    });
  }
}

for (const grid of all("[data-roving]")) {
  const keys = all("button", grid);
  const cols = Number(grid.dataset.columns);
  const moves = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -cols, ArrowDown: cols };
  grid.addEventListener("focusin", event => {
    if (!keys.includes(event.target)) return;
    for (const key of keys) key.tabIndex = key === event.target ? 0 : -1;
  });
  grid.addEventListener("keydown", event => {
    const current = keys.indexOf(event.target);
    if (current < 0) return;
    const move = moves[event.key];
    if (move === undefined && event.key !== "Home" && event.key !== "End") return;
    event.preventDefault();
    const target = event.key === "Home" ? 0 : event.key === "End" ? keys.length - 1 : current + move;
    keys[Math.min(keys.length - 1, Math.max(0, target))]?.focus();
  });
}

for (const form of all("[data-sbox-form]")) {
  const confirmation = form.querySelector(".sbox-confirm");
  if (!confirmation) continue;
  const confirm = confirmation.querySelector("button");
  const picked = confirmation.querySelector("[data-sbox-choice]");
  const buttons = all(".sbox button", form);
  const answer = document.createElement("input");
  answer.type = "hidden";
  answer.name = "answer";
  form.append(answer);
  confirmation.hidden = false;
  for (const button of buttons) {
    button.type = "button";
    button.removeAttribute("name");
    button.setAttribute("aria-pressed", "false");
    button.addEventListener("click", () => {
      for (const cell of buttons) cell.setAttribute("aria-pressed", String(cell === button));
      for (const heading of all(".selected-axis", form)) heading.classList.remove("selected-axis");
      const [row, column] = button.value.split(",");
      button.closest("tr").querySelector("th").classList.add("selected-axis");
      form.querySelector(`thead th:nth-child(${Number(column) + 2})`).classList.add("selected-axis");
      answer.value = button.value;
      picked.textContent = `Selected row ${row}, column ${column} · output ${button.textContent}.`;
      confirm.disabled = false;
    });
  }
}

for (const button of all("[data-byte]")) {
  button.addEventListener("click", () => {
    const widget = button.closest(".widget");
    for (const sibling of all("[data-byte]", widget)) sibling.setAttribute("aria-pressed", String(sibling === button));
    const [character, decimal, binary, hex] = button.dataset.byte.split("|");
    widget.querySelector("[data-byte-output]").textContent = `${character} · ASCII ${decimal} · Binary ${binary}` + (button.hasAttribute("data-byte-independent") ? "" : ` · Hex ${hex}`);
  });
}

for (const widget of all("[data-mapping]")) {
  const bits = BigInt(`0x${widget.dataset.source}`).toString(2).padStart(Number(widget.dataset.width), "0");
  const output = widget.querySelector("[data-mapping-output]");
  for (const button of all("[data-source-bit]", widget)) {
    button.addEventListener("click", () => {
      const { output: position, sourceBit } = button.dataset;
      output.textContent = `Input position ${sourceBit} → output position ${position} · bit value ${bits[Number(sourceBit) - 1]}`;
      if (!motion.matches) output.animate([{ background: "#285c59" }, { background: "#162332" }], 420);
    });
  }
}

for (const input of all("[data-shift]")) {
  input.addEventListener("change", () => {
    const widget = input.form.querySelector("[data-rotation]");
    const shift = Number(input.dataset.shift);
    const rotate = bits => bits.slice(shift) + bits.slice(0, shift);
    widget.querySelector("[data-c-out]").textContent = rotate(widget.dataset.c);
    widget.querySelector("[data-d-out]").textContent = rotate(widget.dataset.d);
    for (const disk of all(".disk", widget)) {
      if (!motion.matches) disk.animate([{ transform: "rotate(0)" }, { transform: `rotate(-${shift * 28}deg)` }], 420);
    }
  });
}

const elapsed = document.querySelector("[data-elapsed]");
if (elapsed?.dataset.complete === "false") {
  const start = Date.now() - Number(elapsed.dataset.elapsed) * 1000;
  window.setInterval(() => {
    const seconds = Math.floor((Date.now() - start) / 1000);
    elapsed.querySelector("strong").textContent = `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, "0")}s`;
  }, 1000);
}

const soundToggle = document.querySelector("[data-sound]");
if (soundToggle) {
  soundToggle.checked = localStorage.getItem("cipherbreak.sound") === "on";
  let audio;
  const chime = () => {
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (!Audio) return;
    audio ??= new Audio();
    audio.resume().then(() => {
      const source = audio.createOscillator();
      const gain = audio.createGain();
      const time = audio.currentTime;
      source.frequency.setValueAtTime(440, time);
      source.frequency.setValueAtTime(659, time + .06);
      gain.gain.setValueAtTime(.035, time);
      gain.gain.exponentialRampToValueAtTime(.001, time + .14);
      source.connect(gain).connect(audio.destination);
      source.start(time);
      source.stop(time + .15);
    }).catch(() => {});
  };
  soundToggle.addEventListener("change", () => {
    localStorage.setItem("cipherbreak.sound", soundToggle.checked ? "on" : "off");
    if (soundToggle.checked) chime();
  });
  for (const form of all(".puzzle-form")) {
    form.addEventListener("submit", () => {
      if (soundToggle.checked) chime();
    });
  }
}

const drills = {
  ascii: ["Which hex byte represents ASCII A?", ["04", "41", "65"], 1],
  block: ["How many bits do two hexadecimal digits represent?", ["2", "8", "16"], 1],
  ip: ["A toy permutation is [3, 1, 2]. Which input supplies output 2?", ["Input 1", "Input 2", "Input 3"], 0],
  halves: ["Where does 11223344 land when you split AABBCCDD11223344?", ["L₀", "R₀"], 1],
  parity: ["Two bytes have one parity bit each. How many bits remain?", ["2", "14", "16"], 1],
  pc1: ["PC-1 omits one position per key byte. What are those positions called?", ["Parity bits", "Round bits"], 0],
  split: ["How wide is each half when you split the 56-bit PC-1 output?", ["28 bits", "32 bits"], 0],
  rotate: ["Rotate 10110 left by two places. What do the disks show?", ["11010", "00101", "11000"], 0],
  pc2: ["How wide is the value that leaves PC-2?", ["56 bits", "48 bits", "64 bits"], 1],
  expand: ["Expansion E lists [4, 1, 2, 3, 4, 1] for a toy input. Which input is copied twice?", ["Input 1", "Input 2"], 0],
  xor: ["Close the toy circuit. What is 1 ⊕ 1?", ["0", "1"], 0],
  sbox: ["The input is 100101. Which binary digits select the row?", ["00", "11", "0010"], 1],
  advanced: ["The input is 100101. Which binary digits select the column?", ["11", "0010", "0101"], 1],
  p: ["Does a permutation change any bit value?", ["Yes", "No"], 1],
  feistel: ["If L = A, R = 7, and F = 3, what is the new L?", ["7", "9", "A"], 0],
  order: ["Three toy subkeys encrypted in order K1, K2, K3. Which key decrypts first?", ["K1", "K2", "K3"], 2],
  decrypt: ["If the current right half is 01020304, which value becomes the new left half?", ["04030201", "01020304"], 1],
  recover: ["What ASCII character does hex 41 encode?", ["A", "4", "B"], 0],
  verdict: ["How many candidate keys does a toy eight-bit cipher have?", ["8", "64", "256"], 2],
};

function interactiveTour(game) {
  const panel = game.querySelector(".tour-panel");
  const spotlight = game.querySelector(".tour-spotlight");
  const caption = panel.querySelector("[data-tour-progress]");
  const title = panel.querySelector("#tour-title");
  const copy = panel.querySelector("[data-tour-copy]");
  const practice = panel.querySelector("[data-tour-practice]");
  const feedback = panel.querySelector("[data-tour-feedback]");
  const back = panel.querySelector("[data-tour-back]");
  const next = panel.querySelector("[data-tour-next]");
  const skip = panel.querySelector("[data-tour-skip]");
  let kind;
  let opener;
  let steps = [];
  let index = 0;
  let practiced = new Set();

  const onboarding = [
    ["objective", "Read the objective", "NOVA briefs you on the science and the next step to unlock."],
    ["terminal", "Find the terminal", "Select an available room on the map. In the room, activate its terminal to inspect signals and verify your work."],
    ["progress", "Watch your progress", "The meter tracks completed rooms. Correct answers earn points and each cleared room earns a bonus."],
    ["hint", "Ask NOVA for a hint", "Start with a concept. If you need more help, ask for an example or a step-by-step method."],
    ["notebook", "Revisit a concept", "Your learning notebook grows as you move through the facility."],
  ];

  function roomSteps() {
    const terminal = game.querySelector("[data-puzzle]");
    const code = terminal?.dataset.puzzle || game.dataset.firstPuzzle;
    const drill = drills[code];
    const objective = game.querySelector('[data-tour-target="objective"] p:not(.overline)');
    return [
      ["objective", "Room briefing", objective?.textContent || "Read the current objective before working the terminal."],
      ["terminal", "Watch an example", terminal?.dataset.example || game.dataset.firstExample || "Review how this room's operation works."],
      ["terminal", "Try it with a practice signal", drill?.[0] || "Return to the terminal when you’re ready.", drill],
    ];
  }

  function targetForStep() {
    return all(`[data-tour-target="${steps[index]?.[0]}"]`, game).find(element => element.getClientRects().length) ||
      game.querySelector('[data-tour-target="objective"]') ||
      game.querySelector("h1");
  }

  function position() {
    if (panel.hidden) return;
    const rect = targetForStep().getBoundingClientRect();
    const top = Math.max(6, rect.top - 5);
    const bottom = Math.min(window.innerHeight - 6, rect.bottom + 5);
    if (bottom <= top) {
      spotlight.hidden = true;
    } else {
      spotlight.hidden = false;
      Object.assign(spotlight.style, {
        top: `${top}px`, left: `${Math.max(4, rect.left - 5)}px`,
        width: `${Math.min(innerWidth - 10, rect.width + 10)}px`, height: `${bottom - top}px`,
      });
    }
    const width = panel.offsetWidth;
    const height = panel.offsetHeight;
    const side = rect.right + width + 22 < innerWidth;
    const left = side ? rect.right + 14 : Math.max(12, Math.min(innerWidth - width - 12, rect.left));
    const preferred = side ? top : rect.bottom + height + 16 < innerHeight ? rect.bottom + 12 : rect.top - height - 12;
    const y = preferred >= 10 ? Math.min(innerHeight - height - 12, preferred) : innerHeight - height - 12;
    panel.style.left = `${left}px`;
    panel.style.top = `${Math.max(10, y)}px`;
  }

  function showStep() {
    const [, heading, body, drill] = steps[index];
    caption.textContent = `NOVA · ${index + 1} / ${steps.length}`;
    title.textContent = heading;
    copy.textContent = body;
    practice.replaceChildren();
    practice.hidden = !drill;
    feedback.hidden = true;
    const alreadyDone = practiced.has(index);
    back.disabled = index === 0;
    next.disabled = Boolean(drill && !alreadyDone);
    next.textContent = index === steps.length - 1 ? "Finish tutorial" : "Next";
    if (drill) {
      for (const [number, choice] of drill[1].entries()) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "button button-small button-ghost";
        button.textContent = choice;
        button.addEventListener("click", () => {
          const correct = number === drill[2];
          feedback.hidden = false;
          feedback.textContent = correct ? "Correct. Apply the same rule at the terminal." : "Try again, or use Back to revisit the example.";
          if (correct) {
            practiced.add(index);
            next.disabled = false;
            next.focus({ preventScroll: true });
          }
          position();
        });
        practice.append(button);
      }
    }
    panel.hidden = false;
    targetForStep().scrollIntoView({ block: "center", behavior: "instant" });
    position();
    panel.focus({ preventScroll: true });
  }

  function open(type, trigger = null) {
    kind = type;
    opener = trigger;
    steps = type === "room" ? roomSteps() : onboarding;
    index = 0;
    practiced = new Set();
    showStep();
  }

  async function close() {
    const closedKind = kind;
    panel.hidden = spotlight.hidden = true;
    opener?.focus();
    const csrf = document.querySelector("#tutorial-token input").value;
    try {
      const result = await fetch(game.dataset.tutorialUrl, {
        method: "POST",
        keepalive: true,
        headers: { "X-CSRFToken": csrf },
        body: new URLSearchParams({ kind: closedKind, room: game.dataset.room }),
      });
      if (!result.ok) throw new Error("Tutorial preference was not saved");
    } catch {
      const status = game.querySelector(".saved");
      status.textContent = "Tutorial preference could not be saved";
    }
  }

  back.addEventListener("click", () => {
    if (index > 0) {
      index -= 1;
      showStep();
    }
  });
  next.addEventListener("click", () => {
    if (next.disabled) return;
    if (index === steps.length - 1) {
      close();
    } else {
      index += 1;
      showStep();
    }
  });
  skip.addEventListener("click", close);
  for (const trigger of all("[data-tour]", game)) {
    trigger.addEventListener("click", () => open(trigger.dataset.tour, trigger));
  }
  document.addEventListener("keydown", event => {
    if (panel.hidden) return;
    if (event.key === "Escape" || (panel.contains(event.target) && ["ArrowLeft", "ArrowRight"].includes(event.key))) {
      event.preventDefault();
      if (event.key === "Escape") close();
      if (event.key === "ArrowLeft") back.click();
      if (event.key === "ArrowRight") next.click();
    }
  });
  window.addEventListener("scroll", position, { passive: true });
  window.addEventListener("resize", position);
  if (game.dataset.auto) open(game.dataset.auto);
}

const game = document.querySelector("[data-game]");
if (game) interactiveTour(game);
