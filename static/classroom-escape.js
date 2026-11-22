"use strict";

(() => {
  const field = document.querySelector("[data-classroom-escape]");
  if (!field) return;
  const dialog = field.querySelector("[data-classroom-dialog]");
  const stations = [...dialog.querySelectorAll("[data-station]")];
  const lessonHost = dialog.querySelector("[data-classroom-lesson]");
  const apply = dialog.querySelector("[data-classroom-apply]");
  const task = field.dataset.puzzle;
  const room = field.dataset.room;
  const solved = field.dataset.solved === "yes";
  const guided = field.dataset.mode === "guided";
  let collected = field.dataset.collected === "yes";
  let stage = Number(field.dataset.stage);
  let active;
  let lessonPhase = null;
  let opener;
  let working = false;

  function lessonForTask() {
    const lesson = window.cipherLessons[task];
    if (task !== "ascii") return lesson;
    const [first, second] = [...dialog.querySelectorAll("[data-byte]")].slice(0,2).map((tile) => tile.dataset.byte.split("|"));
    return [lesson[0], lesson[1], lesson[2], [
      first[0] + " → ASCII " + first[1], first[1] + " → binary " + first[2],
      "Convert each four-bit group → " + first[3],
    ], "Convert the second character, " + second[0] + ". Decimal " + second[1] + " is binary " + second[2] +
      ". Enter its two hexadecimal digits.", second[3]];
  }

  async function send(kind, extras = {}) {
    if (working) return null;
    working = true;
    try {
      const token = document.querySelector("#classroom-token input").value;
      const response = await fetch(field.dataset.tutorialUrl, {
        method: "POST", headers: { "X-CSRFToken": token }, keepalive: true,
        body: new URLSearchParams({ kind, room, ...extras }),
      });
      if (!response.ok) throw new Error("The console could not save your progress.");
      return response.status === 204 ? {} : response.json();
    } catch (error) {
      showStatus(error.message || "The console could not save your progress.");
      return null;
    } finally {
      working = false;
    }
  }

  function showStatus(message) {
    const target = stations.find((station) => station.dataset.station === active) || field.querySelector(".field-objective");
    let status = target.querySelector("[data-classroom-feedback]");
    if (!status) {
      status = document.createElement("p");
      status.dataset.classroomFeedback = "";
      status.setAttribute("role","status");
      status.className = "notice error";
      target.append(status);
    }
    status.textContent = message;
  }

  function showLesson(feedback = "") {
    if (!apply) return;
    const phase = lessonPhase ?? (guided && !solved ? stage : 3);
    apply.hidden = phase < 3;
    lessonHost.hidden = phase >= 3;
    lessonHost.innerHTML = phase < 3 ? window.CipherLesson.lessonCard(lessonForTask(), phase, feedback) : "";
    const heading = (phase < 3 ? lessonHost : apply).querySelector("h2");
    heading.tabIndex = -1;
    heading.focus({preventScroll:true});
  }

  function open(name, trigger) {
    opener = trigger && !dialog.contains(trigger) ? trigger : opener;
    active = name;
    for (const station of stations) station.hidden = station.dataset.station !== name;
    if (!dialog.open) dialog.showModal();
    field.classList.add("field-approach");
    if (name === "task") showLesson();
  }

  function dismissGuide() {
    field.querySelector("[data-field-guide]").hidden = true;
    field.querySelector("[data-field-dim]").hidden = true;
    field.querySelector(".guide-target")?.classList.remove("guide-target");
  }

  dialog.addEventListener("close", () => {
    field.classList.remove("field-approach");
    lessonPhase = null;
    if (opener && !opener.hidden) opener.focus({preventScroll:true});
  });

  field.addEventListener("click", async (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    const data = button.dataset;
    if (data.closeConsole !== undefined) dialog.close();
    if (data.classroomKey) {
      const input = dialog.querySelector("#answer-field");
      if (data.classroomKey === "back") input.value = input.value.slice(0,-1);
      else if (input.value.length < input.maxLength) input.value += data.classroomKey;
      input.focus();
    }
    if (data.dismissGuide !== undefined) dismissGuide();
    if (data.object === "card") {
      const result = await send("collected");
      if (!result) return;
      collected = true;
      dismissGuide();
      button.hidden = true;
      field.querySelector("[data-inventory-count]").textContent = "1";
      field.querySelector("[data-objective]").textContent = "Inspect the access terminal.";
      field.querySelector("[data-access-card]").hidden = false;
      field.querySelector("[data-card-instructions]").hidden = false;
      field.querySelector("[data-inventory-empty]").hidden = true;
      open("inventory", field.querySelector('[data-console="inventory"]'));
    } else if (data.console === "task" && room === "1" && !collected) {
      dialog.querySelector("[data-object-title]").textContent = "Access authorization required";
      dialog.querySelector("[data-object-status]").textContent = "Collect the access card before using the gate controls.";
      open("object", button);
    } else if (data.console) {
      open(data.console, button);
    } else if (data.object) {
      dialog.querySelector("[data-object-title]").textContent = data.title;
      dialog.querySelector("[data-object-status]").textContent = data.powered === "yes" ?
        "Powered. Open the notebook to inspect the verified result." :
        "This machine is waiting for input. Complete the highlighted console first.";
      open("object", button);
    }
    if (data.replayLesson !== undefined && task) {
      lessonPhase = 0;
      open("task", button);
    }
    if (data.lesson) {
      const phase = lessonPhase ?? stage;
      if (data.lesson === "help") { showLesson(lessonForTask()[2]); return; }
      if (data.lesson === "back" || data.lesson === "example") {
        lessonPhase = data.lesson === "example" ? 1 : Math.max(0, phase - 1);
        showLesson();
      }
      if (data.lesson === "next") {
        const next = phase + 1;
        if (next > stage) {
          const result = await send("lesson", { code: task, action: phase === 0 ? "learn" : "demonstrate" });
          if (!result) return;
          stage = result.stage;
        }
        lessonPhase = next < stage ? next : null;
        if (!guided || solved) lessonPhase = next;
        showLesson();
      }
    }
  });

  field.addEventListener("submit", async (event) => {
    if (event.target.matches("[data-practice]")) {
      event.preventDefault();
      const input = new FormData(event.target).get("practice");
      const result = await send("lesson", { code: task, action: "practice", answer: input });
      if (!result) return;
      if (!result.correct) {
        showLesson("Try the practice signal again. " + lessonForTask()[2]);
        return;
      }
      stage = result.stage;
      lessonPhase = null;
      showLesson();
    }
    if (event.target.matches("[data-sbox-form]") && event.target.querySelector("[name=sbox_row]")) {
      const data = new FormData(event.target);
      const position = data.get("sbox_row") + "," + data.get("sbox_col");
      if (position !== data.get("answer")) {
        event.preventDefault();
        showStatus("Enter the calculated row and column, then select their intersection.");
      }
    }
  });

  if (location.hash === "#nova") open("hint");
  else if (new URLSearchParams(location.search).get("console") === "1") open("task");
})();
