/* Interactive overlay tutorial engine.
 * A step can: highlight an element, explain, require the player to perform an action
 * (click the highlighted control), or check a tiny practice answer before continuing.
 * Keyboard: → / Enter = Next, ← = Back, Esc = Skip.
 */
(function () {
  "use strict";
  const CB = (window.CB = window.CB || {});
  let active = null;

  function q(sel) { return typeof sel === "function" ? sel() : (sel ? document.querySelector(sel) : null); }

  CB.tutorial = function (id, steps, opts) {
    opts = opts || {};
    if (active) active.end(false);
    let i = 0, actionDone = false;
    const hole = document.createElement("div"); hole.className = "tut-hole";
    const block = document.createElement("div"); block.className = "tut-block";
    const tip = document.createElement("div"); tip.className = "tut-tip";
    tip.setAttribute("role", "dialog"); tip.setAttribute("aria-live", "polite"); tip.setAttribute("aria-label", "Tutorial");
    document.body.append(block, hole, tip);
    let actionEl = null, actionHandler = null;

    function clearAction() {
      if (actionEl && actionHandler) actionEl.removeEventListener("click", actionHandler, true);
      if (actionEl) actionEl.style.removeProperty("position"), actionEl.style.removeProperty("z-index");
      actionEl = actionHandler = null;
    }

    let ended = false;
    function place() {
      if (ended || !steps[i]) return;
      const s = steps[i];
      const t = q(s.target);
      if (!t) { hole.style.cssText = "left:50%;top:40%;width:0;height:0"; tip.className = "tut-tip center";
        tip.style.left = Math.max(10, (innerWidth - tip.offsetWidth) / 2) + "px"; tip.style.top = Math.max(10, innerHeight * .3) + "px"; return; }
      const r = t.getBoundingClientRect(), pad = 6;
      hole.style.left = r.left - pad + "px"; hole.style.top = r.top - pad + "px";
      hole.style.width = r.width + 2 * pad + "px"; hole.style.height = r.height + 2 * pad + "px";
      const below = r.bottom + 16 + tip.offsetHeight < innerHeight || r.top < tip.offsetHeight + 20;
      tip.className = "tut-tip " + (below ? "below" : "above");
      tip.style.left = Math.min(Math.max(10, r.left), innerWidth - tip.offsetWidth - 10) + "px";
      tip.style.top = (below ? Math.min(r.bottom + 14, innerHeight - tip.offsetHeight - 10) : Math.max(10, r.top - tip.offsetHeight - 14)) + "px";
    }

    function render() {
      clearAction();
      const s = steps[i];
      actionDone = !s.action && !s.practice;
      const t = q(s.target);
      if (t && t.scrollIntoView) t.scrollIntoView({ block: "center", behavior: CB.reducedMotion() ? "auto" : "smooth" });
      tip.innerHTML = `<h4>${s.title || "NOVA"}</h4><p>${s.text}</p>
        ${s.action ? `<p class="act">▶ ${s.action}</p>` : ""}
        ${s.practice ? `<div class="tut-practice"><label class="small" for="tut-in">${s.practice.question}</label>
          <input id="tut-in" type="text" autocomplete="off" placeholder="${s.practice.placeholder || ""}"> <button type="button" data-t="check">Check</button><span class="res" aria-live="polite"></span></div>` : ""}
        <div class="tut-btns"><span class="count">${i + 1} / ${steps.length}</span>
        <span><button type="button" data-t="skip">Skip tutorial</button>
        <button type="button" data-t="back" ${i === 0 ? "disabled" : ""}>Back</button>
        <button type="button" data-t="next" class="primary" ${actionDone ? "" : "disabled"}>${i === steps.length - 1 ? "Finish" : "Next"}</button></span></div>`;
      // Action steps let the player click the highlighted control itself.
      block.style.display = s.action ? "none" : "block";
      if (s.action && t) {
        actionEl = t;
        actionHandler = () => { setTimeout(() => { if (!s.check || s.check()) { actionDone = true; enableNext(); tip.querySelector(".act").textContent = "✓ " + (s.done || "Well done!"); } }, 60); };
        t.addEventListener("click", actionHandler, true);
      }
      if (s.onShow) s.onShow();
      requestAnimationFrame(place); setTimeout(place, 350);
      const focusEl = tip.querySelector(s.practice ? "#tut-in" : "[data-t=next]:not([disabled])") || tip.querySelector("[data-t=skip]");
      if (focusEl && !s.action) focusEl.focus();
    }
    function enableNext() { const n = tip.querySelector("[data-t=next]"); if (n) { n.disabled = false; n.focus(); } }

    function check() {
      const s = steps[i], inp = tip.querySelector("#tut-in"), res = tip.querySelector(".res");
      const v = inp.value.replace(/\s+/g, "").toUpperCase();
      const answers = [].concat(s.practice.answer).map((a) => String(a).toUpperCase());
      if (answers.includes(v)) { res.textContent = "✓ " + (s.practice.good || "Correct!"); res.style.color = "#126b2f"; actionDone = true; enableNext(); CB.sound("good"); }
      else { res.textContent = "✗ " + (s.practice.bad || "Try again."); res.style.color = "#a1121f"; CB.sound("bad"); }
    }

    function go(d) { i += d; if (i >= steps.length) return end(true); if (i < 0) i = 0; render(); }
    function end(completed, skipped) {
      ended = true;
      clearAction(); hole.remove(); block.remove(); tip.remove();
      document.removeEventListener("keydown", onKey, true); removeEventListener("resize", place); removeEventListener("scroll", place, true);
      active = null;
      if (completed || skipped) {
        CB.api(`/api/tutorial/${id}/`, { skipped: !!skipped }).catch(() => {});
        (opts.done || (() => {}))(!!skipped);
      }
    }
    function onKey(e) {
      if (e.target && e.target.id === "tut-in" && e.key === "Enter") { e.preventDefault(); check(); return; }
      if (e.key === "Escape") { e.preventDefault(); end(false, true); }
      else if ((e.key === "ArrowRight" || (e.key === "Enter" && e.target.tagName !== "BUTTON")) && actionDone) { e.preventDefault(); go(1); }
      else if (e.key === "ArrowLeft" && i > 0 && e.target.tagName !== "INPUT") { e.preventDefault(); go(-1); }
    }
    tip.addEventListener("click", (e) => {
      const b = e.target.closest("[data-t]"); if (!b) return;
      ({ next: () => go(1), back: () => go(-1), skip: () => end(false, true), check })[b.dataset.t]();
    });
    document.addEventListener("keydown", onKey, true);
    addEventListener("resize", place); addEventListener("scroll", place, true);
    render();
    active = { end };
    return active;
  };
  CB.tutorialActive = () => !!active;
})();
