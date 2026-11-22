/* CipherBreak EDU — shared helpers: API calls, copy buttons, sound, settings, toasts. */
(function () {
  "use strict";
  const CB = (window.CB = window.CB || {});

  CB.csrf = function () {
    const m = document.cookie.match(/(?:^|;\s*)csrftoken=([^;]+)/);
    if (m) return decodeURIComponent(m[1]);
    const el = document.querySelector("[name=csrfmiddlewaretoken]");
    return el ? el.value : "";
  };

  CB.api = async function (url, body) {
    const opts = body === undefined ? {} : {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-CSRFToken": CB.csrf() },
      body: JSON.stringify(body),
    };
    opts.credentials = "same-origin";
    const res = await fetch(url, opts);
    let data = {};
    try { data = await res.json(); } catch (e) { data = { error: "The server returned an unexpected response." }; }
    if (!res.ok) { const err = new Error(data.error || "Request failed"); err.data = data; err.status = res.status; throw err; }
    return data;
  };

  CB.esc = function (s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  };

  CB.group = function (s, n, sep) { // "01011100" -> "0101 1100"
    n = n || 4; sep = sep === undefined ? " " : sep;
    const out = []; for (let i = 0; i < s.length; i += n) out.push(s.slice(i, i + n));
    return out.join(sep);
  };

  CB.copyBtn = function (text, label) {
    return `<button type="button" class="copy-btn" data-copy="${CB.esc(text)}" aria-label="Copy ${CB.esc(label || text)}">copy</button>`;
  };

  document.addEventListener("click", function (e) {
    const b = e.target.closest("[data-copy]");
    if (!b) return;
    const t = b.getAttribute("data-copy");
    const done = () => { const o = b.textContent; b.textContent = "copied ✓"; setTimeout(() => (b.textContent = o), 1200); };
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(t).then(done, done);
    else { const ta = document.createElement("textarea"); ta.value = t; document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); } catch (x) {} ta.remove(); done(); }
  });

  /* ---------- Settings (stored in this browser) ---------- */
  CB.settings = Object.assign({ sound: false, music: false, musicVolume: 0.5, reduceMotion: false, largeText: false },
    JSON.parse(localStorage.getItem("cb-settings") || "{}"));
  CB.saveSettings = function () {
    localStorage.setItem("cb-settings", JSON.stringify(CB.settings));
    CB.applySettings();
  };
  CB.applySettings = function () {
    document.body.classList.toggle("reduce-motion", !!CB.settings.reduceMotion);
    document.body.classList.toggle("large-text", !!CB.settings.largeText);
  };
  CB.reducedMotion = function () {
    return CB.settings.reduceMotion || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  };

  /* ---------- Original synthesized sound effects (muted by default) ---------- */
  let ctx = null;
  CB.sound = function (kind) {
    if (!CB.settings.sound) return;
    try {
      ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
      if (ctx.state === "suspended") ctx.resume();
      // [frequency, duration, wave, slide-to frequency, volume]
      const notes = {
        click: [[660, .04, "square", 0, .04]], good: [[523, .09], [659, .09], [784, .16]], bad: [[200, .12, "sawtooth", 120], [150, .18, "sawtooth", 90]],
        unlock: [[392, .1], [523, .1], [659, .1], [784, .3]], badge: [[784, .08], [988, .08], [1319, .25]],
        zap: [[1200, .08, "square", 300, .05]], scan: [[900, .05, "sine", 1400], [1400, .05, "sine", 900]], rotor: [[180, .07, "square", 240, .05]],
        forge: [[110, .08, "sawtooth", 70, .07], [880, .05, "triangle", 0, .05]], power: [[300, .1, "triangle", 600, .06]],
        clunk: [[140, .08, "square", 80, .07]], step: [[90, .03, "triangle", 60, .05]], door: [[80, .5, "sawtooth", 160, .06], [300, .2, "sine", 600, .05]],
        pickup: [[880, .06], [1175, .06], [1568, .12]], alarm: [[700, .2, "square", 500, .04], [700, .2, "square", 500, .04]], open: [[440, .06, "triangle"], [660, .1, "triangle"]],
        type: [[1500, .015, "square", 0, .02]], deny: [[160, .09, "square", 0, .06], [130, .14, "square", 0, .06]],
      }[kind] || [[440, .05]];
      let t = ctx.currentTime;
      notes.forEach(([f, d, type, slide, vol]) => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = type || "sine"; o.frequency.setValueAtTime(f, t);
        if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + d);
        g.gain.setValueAtTime(vol || .1, t); g.gain.exponentialRampToValueAtTime(.001, t + d);
        o.connect(g); g.connect(ctx.destination); o.start(t); o.stop(t + d + .02); t += d * .9;
      });
    } catch (e) { /* audio unavailable */ }
  };

  /* ---------- Original generative background music (Web Audio, no audio files) ----------
   * A slow ambient "lab" loop: soft pad chords through a low-pass filter, a quiet
   * sub-bass pulse and a sparse arpeggio. Composed procedurally here, so there are
   * no copyright issues. Off by default; it only starts after the player turns it on. */
  const music = { playing: false, timer: null, master: null, step: 0 };
  const CHORDS = [ // A minor-ish progression, MIDI notes
    [57, 60, 64, 67], [53, 57, 60, 64], [55, 59, 62, 67], [52, 55, 59, 64]];
  const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);
  function musicNote(freq, start, dur, type, gain, dest) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(gain, start + Math.min(1.2, dur / 3));
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    o.connect(g); g.connect(dest); o.start(start); o.stop(start + dur + 0.05);
  }
  function scheduleBar() {
    if (!music.playing) return;
    const t = ctx.currentTime + 0.05, bar = 6; // seconds per chord
    const chord = CHORDS[music.step % CHORDS.length];
    chord.forEach((n) => musicNote(midi(n), t, bar + 1.5, "triangle", 0.05, music.filter));
    musicNote(midi(chord[0] - 24), t, bar, "sine", 0.09, music.master);
    for (let k = 0; k < 6; k++) {           // sparse arpeggio, deterministic pattern
      if ((k + music.step) % 3 === 2) continue;
      musicNote(midi(chord[(k * 2 + music.step) % 4] + 12), t + k, 0.9, "sine", 0.025, music.master);
    }
    music.step++;
    music.timer = setTimeout(scheduleBar, bar * 1000);
  }
  CB.music = {
    start() {
      try {
        ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
        if (ctx.state === "suspended") ctx.resume();
        if (music.playing) return;
        music.master = ctx.createGain(); music.master.gain.value = 0.6 * (CB.settings.musicVolume ?? 0.5);
        music.filter = ctx.createBiquadFilter(); music.filter.type = "lowpass"; music.filter.frequency.value = 900;
        music.filter.connect(music.master); music.master.connect(ctx.destination);
        music.playing = true; scheduleBar();
      } catch (e) { /* audio unavailable */ }
    },
    stop() {
      music.playing = false; clearTimeout(music.timer);
      if (music.master) { const m = music.master; m.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.3); setTimeout(() => m.disconnect(), 1500); }
      music.master = null;
    },
    setVolume(v) { CB.settings.musicVolume = v; if (music.master) music.master.gain.value = 0.6 * v; },
    get playing() { return music.playing; },
  };

  CB.toast = function (html, ms) {
    let zone = document.querySelector(".toast-zone");
    if (!zone) { zone = document.createElement("div"); zone.className = "toast-zone"; zone.setAttribute("aria-live", "polite"); document.body.appendChild(zone); }
    const t = document.createElement("div"); t.className = "toast"; t.innerHTML = html; zone.appendChild(t);
    setTimeout(() => t.remove(), ms || 4500);
  };

  /* Accessible modal: returns {el, close}. Escape closes, focus is trapped loosely and restored. */
  CB.modal = function (title, bodyHtml, opts) {
    opts = opts || {};
    const prev = document.activeElement;
    const back = document.createElement("div");
    back.className = "modal-back";
    back.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-labelledby="mdl-t">
      <header><h2 id="mdl-t">${title}</h2><button type="button" class="btn btn-sm btn-ghost" data-close aria-label="Close dialog">✕ Close</button></header>
      <div class="modal-body">${bodyHtml}</div></div>`;
    document.body.appendChild(back);
    const close = () => { back.remove(); document.removeEventListener("keydown", onKey); if (prev && prev.focus) prev.focus(); if (opts.onClose) opts.onClose(); };
    const onKey = (e) => { if (e.key === "Escape") close(); };
    document.addEventListener("keydown", onKey);
    back.addEventListener("click", (e) => { if (e.target === back || e.target.closest("[data-close]")) close(); });
    setTimeout(() => { const f = back.querySelector("button, a, input, select, iframe"); if (f) f.focus(); }, 30);
    return { el: back, close };
  };

  CB.settingsDialog = function () {
    const s = CB.settings;
    const m = CB.modal("Settings", `
      <label class="choice"><input type="checkbox" id="set-sound" ${s.sound ? "checked" : ""}> Sound effects (original synthesized tones)</label>
      <label class="choice"><input type="checkbox" id="set-music" ${s.music ? "checked" : ""}> Background music (original, generated in your browser)</label>
      <label for="set-vol">Music volume</label><input type="range" id="set-vol" min="0" max="1" step="0.05" value="${s.musicVolume}">
      <label class="choice"><input type="checkbox" id="set-motion" ${s.reduceMotion ? "checked" : ""}> Reduce motion (turn animations off)</label>
      <label class="choice"><input type="checkbox" id="set-large" ${s.largeText ? "checked" : ""}> Larger text</label>
      <p class="muted small">Settings are saved in this browser. Your game progress is saved on the server.</p>`);
    m.el.querySelector("#set-vol").addEventListener("input", (e) => { CB.music.setVolume(+e.target.value); CB.saveSettings(); });
    m.el.addEventListener("change", () => {
      s.sound = m.el.querySelector("#set-sound").checked;
      s.music = m.el.querySelector("#set-music").checked;
      if (s.music) CB.music.start(); else CB.music.stop();
      s.reduceMotion = m.el.querySelector("#set-motion").checked;
      s.largeText = m.el.querySelector("#set-large").checked;
      CB.saveSettings();
      document.dispatchEvent(new CustomEvent("cb-settings"));
    });
  };

  document.addEventListener("DOMContentLoaded", CB.applySettings);
})();
