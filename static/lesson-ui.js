"use strict";

(() => {
  const escape = (value) => String(value).replace(/[&<>"']/g, (char) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
  const stages = ["Learn", "Demonstrate", "Practice", "Apply"];
  function lessonCard(lesson, phase, feedback = "") {
    const [objective, title, concept, example, prompt] = lesson;
    const stageItems = stages.map((step, i) => '<li' + (i === phase ? ' aria-current="step"' : "") + '>' + step + '</li>').join("");
    const signals = '<ol class="worked-signal" aria-label="Worked example">' +
      example.map((item, i) => '<li style="--delay:' + i + '">' + escape(item) + '</li>').join("") + '</ol>';
    const body = phase === 0 ? '<p>' + escape(concept) + '</p>' :
      phase === 1 ? signals :
        '<p>' + escape(prompt) + '</p><form class="lesson-practice" data-practice><label for="practice-answer">Practice answer</label>' +
        '<div class="input-row"><input id="practice-answer" name="practice" autocomplete="off" spellcheck="false" maxlength="36" required>' +
        '<button class="button button-green" type="submit">Check practice</button></div></form>';
    return '<div class="lesson-card"><ol class="lesson-steps" aria-label="Learning sequence">' + stageItems +
      '</ol><div class="nova-indicator"><span aria-hidden="true">✳</span><span>NOVA · ' + escape(objective) +
      '</span></div><h2>' + escape(title) + '</h2>' + body +
      (feedback ? '<p class="lesson-feedback" role="status">' + escape(feedback) + '</p>' : "") +
      '<div class="actions"><button class="button button-small button-ghost" data-lesson="back"' + (phase === 0 ? " disabled" : "") +
      '>Back</button>' + (phase < 2 ? '<button class="button button-small button-green" data-lesson="next">' +
      (phase === 0 ? "Show example" : "Try practice") + '</button>' : "") +
      (phase > 0 ? '<button class="button button-small button-ghost" data-lesson="example">Replay example</button>' : "") +
      '<button class="nav-text" data-lesson="help">Ask NOVA</button></div></div>';
  }
  window.CipherLesson = { lessonCard };
})();
