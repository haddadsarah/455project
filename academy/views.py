import csv
from secrets import token_hex
from statistics import mean
from urllib.parse import urlencode
from uuid import uuid4

from django.contrib import messages
from django.contrib.auth import login
from django.contrib.auth.decorators import login_required, user_passes_test
from django.core.exceptions import PermissionDenied
from django.db import transaction
from django.http import Http404, HttpResponse, HttpResponseBadRequest, JsonResponse
from django.shortcuts import get_object_or_404, redirect, render
from django.urls import reverse
from django.utils import timezone
from django.views.decorators.http import require_POST

from . import des, forms, game, lessons
from .curriculum import ASSESSMENTS, BADGES, NOTEBOOK, OUTCOMES, ROOMS
from .models import Assessment, Assignment, Attempt, Classroom, Membership, Mode, Profile

ROOM_OBJECTS = (
    (("card", "Access card", 29, 71, "▱", ()), ("terminal", "Access terminal", 68, 49, "▦", ("ascii", "block")),
     ("ip", "IP switchboard", 37, 41, "⌗", ("ip", "halves"))),
    (("key", "Key bank", 20, 68, "⌗", ("parity",)), ("pc1", "PC-1 control", 30, 39, "◉", ("pc1", "split")),
     ("rotate", "Rotation disks", 54, 54, "◎", ("rotate",)), ("pc2", "PC-2 control", 80, 45, "◈", ("pc2", "subkey"))),
    (("expand", "Expansion", 16, 62, "↔", ("expand",)), ("xor", "XOR relay", 27, 41, "⊕", ("xor",)),
     ("sbox", "S-box array", 44, 31, "▦", ("sbox", "advanced")), ("p", "P router", 60, 41, "⌗", ("p",)),
     ("feistel", "Feistel XOR", 73, 61, "⊕", ("feistel_xor",)), ("register", "Registers", 86, 42, "⇄", ("feistel",))),
    (("schedule", "Subkey console", 27, 56, "⇄", ("order",)), ("decrypt", "Decryption terminal", 56, 60, "▦", ("decrypt", "recover")),
     ("verdict", "Security console", 79, 48, "◈", ("verdict",))),
)

VECTORS = (
    ("FIPS classroom example", "0123456789ABCDEF", "133457799BBCDFF1", "85E813540F0AB405"),
    ("All-zero example", "0000000000000000", "0000000000000000", "8CA64DE9C1B123A7"),
    ("All-ones example", "FFFFFFFFFFFFFFFF", "FFFFFFFFFFFFFFFF", "7359B2163E4EDC58"),
)


def instructor_required(view):
    return login_required(user_passes_test(game.is_instructor, login_url="dashboard")(view))


def home(request):
    return render(request, "home.html", {"rooms": ROOMS})


def educators(request):
    return render(request, "educators.html", {"rooms": ROOMS})


def register(request):
    if request.user.is_authenticated:
        return redirect("dashboard")
    form = forms.RegisterForm(request.POST if request.method == "POST" else None)
    if request.method == "POST" and form.is_valid():
        user = form.save()
        login(request, user)
        return redirect("dashboard")
    return render(request, "registration/register.html", {"form": form})


@login_required
def dashboard(request):
    if game.is_instructor(request.user):
        return redirect("instructor")
    attempts = request.user.attempts.select_related("assignment").all()
    current = attempts.filter(completed_at__isnull=True).first()
    latest = current or attempts.first()
    badges = request.user.earned_badges.order_by("awarded_at")
    return render(request, "dashboard.html", {
        "attempts": attempts, "current": current, "latest": latest, "completed": attempts.filter(completed_at__isnull=False).count(),
        "badges": [(badge.name, BADGES[badge.name]) for badge in badges],
        "rooms": room_map(latest) if latest else room_map(None),
        "assignments": Assignment.objects.filter(classroom__memberships__student=request.user).select_related("classroom"),
        "topics": topic_rows(latest) if latest else [],
    })


def own_attempt(request, pk):
    return get_object_or_404(Attempt, student=request.user, pk=pk)


@require_POST
@login_required
@transaction.atomic
def start(request):
    if game.is_instructor(request.user):
        raise PermissionDenied
    form = forms.StartForm(request.POST)
    if not form.is_valid():
        return HttpResponseBadRequest("Choose a valid adventure mode.")
    data = form.cleaned_data
    assignment = None
    mode = data["mode"] or Mode.GUIDED
    if data["assignment"]:
        assignment = get_object_or_404(Assignment, pk=data["assignment"], classroom__memberships__student=request.user)
        mode = assignment.mode
    active = request.user.attempts.filter(completed_at__isnull=True).first()
    if active and not data["confirm"]:
        return render(request, "confirm.html", {"form": form, "active": active})
    attempt = game.create_attempt(request.user, mode, assignment, data["timed"])
    return redirect("play", pk=attempt.pk)


def room_map(attempt):
    progress = {room.number: room for room in attempt.rooms.prefetch_related("puzzles")} if attempt else {}
    rooms = []
    for number, info in enumerate(ROOMS, 1):
        state = progress.get(number)
        status = "Complete" if state and state.completed else ("Available" if number <= (attempt.unlocked_room if attempt else 1) else "Locked")
        rooms.append({**info, "number": number, "status": status, "score": state.score if state else 0,
                      "badges": game.room_badges(state) if state else [],
                      "requirement": ROOMS[number - 2]["name"] if number > 1 else ""})
    return rooms


@login_required
def play(request, pk):
    attempt = own_attempt(request, pk)
    if attempt.stage == "results":
        return redirect("results", pk=pk)
    context = {
        "attempt": attempt, "rooms": room_map(attempt), "elapsed": game.duration_label(attempt.duration),
        "can_pre": not attempt.entered_at and not attempt.assessments.filter(phase="pre").exists(),
    }
    profile, _ = Profile.objects.get_or_create(user=request.user)
    context["global_auto"] = attempt.stage == "lobby" and not profile.onboarding_seen
    if attempt.current_room:
        number = attempt.current_room
        mission = game.mission_for(attempt)
        state = attempt.rooms.get(number=number)
        entries = game.room_entries(mission, state)
        current = game.active_puzzle(entries)
        selected = request.GET.get("puzzle")
        selected_entry = next(((p, s) for p, s in entries if p.code == selected and
                               (s.solved or (p.optional and state.completed and not attempt.completed_at))), None)
        puzzle, progress = selected_entry or current or (None, None)
        required = [s for p, s in entries if not p.optional]
        solved_codes = {p.code for p, progress in entries if progress.solved}
        present_codes = {p.code for p, _ in entries}
        objects = [
            {"id": label_id, "label": label, "x": x, "y": y, "icon": icon,
             "active": bool((puzzle and puzzle.code in codes) or label_id == "card"),
             "powered": bool(solved_codes.intersection(codes))}
            for label_id, label, x, y, icon, codes in ROOM_OBJECTS[number - 1]
            if (label_id == "card" and not state.clue_collected) or present_codes.intersection(codes)
        ]
        context.update({
            "objects": objects, "code": mission.message, "clue_collected": state.clue_collected or number > 1,
            "solved_count": sum(progress.solved for progress in required),
            "room": context["rooms"][number - 1], "room_entries": entries, "room_state": state,
            "room_percent": sum(s.solved for s in required) * 100 // len(required), "puzzle": puzzle, "state": progress,
            "active_index": next((i for i, (p, _) in enumerate(entries, 1) if p == puzzle), 0),
            "required_count": len(required), "request_id": uuid4(),
            "room_auto": attempt.mode == Mode.GUIDED and attempt.stage == "room" and not state.tutorial_seen,
            "hint_lines": puzzle.hints[:progress.hint_level] if progress else (),
            "next_hint": progress.hint_level + 1 if progress else 0,
            "round_selector": range(1, 17),
            "round_number": mission.selected_round, "first_puzzle": entries[0][0],
            "ciphertext": mission.encryption["output"] if state.completed and number == 3 else "",
            "decrypted": mission.decryption["output"] if number == 4 and any(p.code == "decrypt" and s.solved for p, s in entries) else "",
        })
    return render(request, "play.html", context)



@require_POST
@login_required
@transaction.atomic
def navigate(request, pk):
    attempt = own_attempt(request, pk)
    action = request.POST.get("action")
    if action == "briefed" and attempt.stage == "intro":
        attempt.stage = "lobby"
    elif action == "lobby":
        attempt.current_room, attempt.stage = 0, "lobby"
    elif action == "results" and attempt.completed_at:
        attempt.current_room, attempt.stage = 4, "results"
    elif action == "enter":
        try:
            room = int(request.POST.get("room", ""))
        except ValueError:
            return HttpResponseBadRequest("Select a room on the map.")
        if attempt.stage == "intro" or not 1 <= room <= min(4, attempt.unlocked_room):
            raise PermissionDenied
        attempt.current_room = room
        attempt.stage = "clear" if room < attempt.unlocked_room else "room"
        if not attempt.entered_at:
            attempt.entered_at = timezone.now()
    else:
        return HttpResponseBadRequest("That action is unavailable.")
    attempt.save()
    return redirect("play", pk=pk)


@require_POST
@login_required
@transaction.atomic
def answer(request, pk):
    attempt = own_attempt(request, pk)
    form = forms.AnswerForm(request.POST)
    if not form.is_valid():
        messages.error(request, "Choose an answer or fill in the terminal field.")
        return redirect("play", pk=pk)
    classroom_request = request.POST.get("room_console") == "1"
    if attempt.generator_version >= 2:
        room, challenge, progress = game.get_playable(attempt, attempt.current_room, form.cleaned_data["code"])
        if not progress.solved and attempt.mode == Mode.GUIDED and progress.lesson_stage < 3:
            messages.error(request, "Verify the guided practice signal before applying it to this mission.")
            return redirect(f"{reverse('play', args=[pk])}?console=1")
        if not progress.solved and room.number == 1 and not room.clue_collected:
            messages.error(request, "Collect the access card in the corridor first.")
            return redirect("play", pk=pk)
        if not progress.solved and challenge.widget == "sbox":
            row = request.POST.get("sbox_row", "")
            col = request.POST.get("sbox_col", "")
            if not row.isascii() or not row.isdecimal() or not col.isascii() or not col.isdecimal() or f"{row},{col}" != form.cleaned_data["answer"]:
                messages.error(request, "Calculate the row and column and select their intersection before verifying.")
                return redirect(f"{reverse('play', args=[pk])}?puzzle={challenge.code}&console=1")
    status, puzzle = game.submit(attempt, attempt.current_room, **form.cleaned_data)
    if status == "correct":
        messages.success(request, puzzle.feedback)
    elif status == "incorrect":
        messages.error(request, f"Not quite. {puzzle.hints[0]}")
    console = "&console=1" if classroom_request and status == "incorrect" else ""
    if puzzle.optional:
        return redirect(f"{reverse('play', args=[pk])}?puzzle={puzzle.code}{console}")
    if console:
        return redirect(f"{reverse('play', args=[pk])}?console=1")
    return redirect("play", pk=pk)



@require_POST
@login_required
@transaction.atomic
def hint(request, pk):
    attempt = own_attempt(request, pk)
    try:
        level = int(request.POST.get("level", ""))
    except ValueError:
        return HttpResponseBadRequest("Select a hint level.")
    code = request.POST.get("code", "")
    game.use_hint(attempt, attempt.current_room, code, level)
    _, puzzle, _ = game.get_playable(attempt, attempt.current_room, code)
    return redirect(f"{reverse('play', args=[pk])}?puzzle={puzzle.code}#nova")


@require_POST
@login_required
@transaction.atomic
def tutorial(request, pk):
    attempt = own_attempt(request, pk)
    kind = request.POST.get("kind")
    if kind == "onboarding":
        Profile.objects.update_or_create(user=request.user, defaults={"onboarding_seen": True})
    elif kind == "collected":
        if attempt.current_room != 1:
            raise PermissionDenied
        attempt.rooms.filter(number=1).update(clue_collected=True)
        return JsonResponse({"collected": True})
    elif kind == "lesson":
        code = request.POST.get("code", "")
        _, puzzle, progress = game.get_playable(attempt, attempt.current_room, code)
        action = request.POST.get("action")
        stage = progress.lesson_stage
        if action == "learn" and stage == 0:
            stage = 1
        elif action == "demonstrate" and stage == 1:
            stage = 2
        elif action == "practice" and stage >= 2:
            answer = lessons.normalize_practice(request.POST.get("answer", ""))
            if answer != lessons.practice_answer(puzzle):
                return JsonResponse({"stage": stage, "correct": False})
            stage = 3
        if stage != progress.lesson_stage:
            progress.lesson_stage = stage
            progress.save(update_fields=["lesson_stage"])
        return JsonResponse({"stage": stage, "correct": action == "practice" and stage == 3})
    elif kind == "room":
        number = request.POST.get("room", str(attempt.current_room))
        if number not in {"1", "2", "3", "4"} or int(number) > attempt.unlocked_room:
            raise PermissionDenied
        attempt.rooms.filter(number=number).update(tutorial_seen=True)
    else:
        return HttpResponseBadRequest("Unknown tutorial.")
    return HttpResponse(status=204)


@login_required
def notebook(request, pk):
    attempt = own_attempt(request, pk)
    introduced = min(4, max(attempt.unlocked_room - 1, attempt.current_room, 1))
    return render(request, "notebook.html", {
        "attempt": attempt, "pages": [entry for entry in NOTEBOOK if entry[0] <= introduced], "rooms": ROOMS,
        "introduced": introduced,
    })


def topic_rows(attempt):
    performance = game.performance(attempt)
    return [(code, text, performance[code]) for code, text in OUTCOMES.items()]


@login_required
def results(request, pk):
    attempt = own_attempt(request, pk)
    topics = topic_rows(attempt)
    assessments = {a.phase: a for a in attempt.assessments.all()}
    return render(request, "results.html", {
        "attempt": attempt, "topics": topics, "rooms": room_map(attempt),
        "duration": game.duration_label(attempt.duration), "hints": sum(t[2]["hints"] for t in topics),
        "mistakes": sum(t[2]["mistakes"] for t in topics), "assessments": assessments,
        "assessment_change": assessments["post"].score - assessments["pre"].score if set(assessments) == {"pre", "post"} else None,
    })


@login_required
@transaction.atomic
def assessment(request, pk, phase):
    attempt = own_attempt(request, pk)
    if phase not in ASSESSMENTS:
        raise Http404
    questions = list(zip(OUTCOMES, ASSESSMENTS[phase], strict=True))
    previous = attempt.assessments.filter(phase=phase).first()
    if previous:
        return render(request, "assessment.html", {"attempt": attempt, "phase": phase, "record": previous,
                     "topics": [(code, OUTCOMES[code], correct) for code, correct in previous.topics.items()]})
    if (phase == "pre" and attempt.entered_at) or (phase == "post" and not attempt.completed_at):
        raise PermissionDenied
    if request.method == "POST":
        scores = {}
        for code, (_, options, correct) in questions:
            chosen = request.POST.get(code)
            if chosen not in {str(index) for index in range(len(options))}:
                messages.error(request, "Answer all seven questions to record a score.")
                break
            scores[code] = int(chosen) == correct
        else:
            Assessment.objects.create(attempt=attempt, phase=phase, score=sum(scores.values()), topics=scores)
            return redirect("assessment", pk=pk, phase=phase)
    return render(request, "assessment.html", {"attempt": attempt, "phase": phase, "questions": questions})


def trace_context(block, key, direction, calculate=True):
    trace, errors = None, {}
    if calculate:
        for field, value in (("block", block), ("key", key)):
            try:
                des.require_hex(value)
            except ValueError as error:
                errors[field] = str(error)
        if not errors:
            trace = des.trace_des(block, key, decrypt=direction == "decrypt")
    return {
        "trace": trace, "block_value": block, "key": key, "direction": direction, "vectors": VECTORS, "errors": errors,
        "maps": [("IP", des.IP), ("IP⁻¹", des.IP_INVERSE), ("PC-1", des.PC1), ("PC-2", des.PC2), ("E", des.E), ("P", des.P)],
        "trace_parts": [
            ("l_in", "Left input"), ("r_in", "Right input"), ("key", "Applied subkey"),
            ("expanded", "E expansion"), ("mixed", "E(R) ⊕ K"), ("substituted", "S-box output"),
            ("permuted", "P permutation"), ("feistel_xor", "L ⊕ F"), ("l_out", "New left"), ("r_out", "New right"),
        ],
        "key_parts": [("c_before", "C before"), ("d_before", "D before"), ("c", "Rotated C"),
                      ("d", "Rotated D"), ("combined", "Combined C ∥ D"), ("subkey", "PC-2 output / round key")],
        "sbox_tables": [(number, list(enumerate(table))) for number, table in enumerate(des.S_BOXES, 1)],
        "sbox_columns": range(16),
    }


def lab(request):
    _, default_block, default_key, _ = VECTORS[0]
    block, key = (request.POST.get("block", ""), request.POST.get("key", "")) if request.method == "POST" else (default_block, default_key)
    direction = "decrypt" if request.POST.get("direction") == "decrypt" else "encrypt"
    context = trace_context(block, key, direction)
    if request.method == "POST" and request.user.is_authenticated and context["trace"]:
        mark_matching_challenges(request.user, context["trace"])
    return render(request, "lab.html", context)


@transaction.atomic
def mark_matching_challenges(user, trace):
    for attempt in user.attempts.filter(mode=Mode.CHALLENGE, completed_at__isnull=True, assisted=False):
        mission = game.mission_for(attempt)
        if (trace["key_schedule"]["pc1"] == mission.encryption["key_schedule"]["pc1"]
                and trace["input"] in {mission.encryption["input"], mission.encryption["output"]}):
            attempt.assisted = True
            attempt.save(update_fields=["assisted", "updated_at"])


@login_required
@transaction.atomic
def attempt_lab(request, pk):
    attempt = own_attempt(request, pk)
    if request.method == "POST":
        if attempt.mode == Mode.CHALLENGE and not attempt.completed_at and not attempt.assisted:
            attempt.assisted = True
            attempt.save(update_fields=["assisted", "updated_at"])
        return redirect("attempt_lab", pk=pk)
    if attempt.mode == Mode.CHALLENGE and not attempt.completed_at and not attempt.assisted:
        return render(request, "lab_confirm.html", {"attempt": attempt})
    mission = game.mission_for(attempt)
    direction = "decrypt" if request.GET.get("direction") == "decrypt" else "encrypt"
    block = mission.encryption["output" if direction == "decrypt" else "input"]
    context = trace_context(block, mission.encryption["key"], direction)
    return render(request, "lab.html", {**context, "attempt": attempt})


@require_POST
@login_required
@transaction.atomic
def join(request):
    if game.is_instructor(request.user):
        raise PermissionDenied
    code = request.POST.get("code", "").strip().upper()
    classroom = Classroom.objects.filter(code=code).first()
    if classroom:
        _, created = Membership.objects.get_or_create(classroom=classroom, student=request.user)
        messages.success(request, f"Joined {classroom.name}." if created else f"You are already enrolled in {classroom.name}.")
    else:
        messages.error(request, "That classroom code was not found. Check the code with your instructor.")
    return redirect("dashboard")


@instructor_required
@transaction.atomic
def instructor(request):
    form = forms.ClassroomForm(request.POST if request.method == "POST" else None)
    if request.method == "POST" and form.is_valid():
        classroom = form.save(commit=False)
        classroom.instructor = request.user
        classroom.code = token_hex(4).upper()
        while Classroom.objects.filter(code=classroom.code).exists():
            classroom.code = token_hex(4).upper()
        classroom.save()
        messages.success(request, f"{classroom.name} is ready. Share its join code with your students.")
        return redirect("classroom", pk=classroom.pk)
    return render(request, "instructor.html", {"form": form, "classes": request.user.classrooms.all()})


def classroom_report(course, assignment):
    attempts = {}
    if assignment:
        for attempt in assignment.attempts.prefetch_related("assessments"):
            attempts.setdefault(attempt.student_id, []).append(attempt)
    students = []
    for membership in course.memberships.select_related("student").order_by("student__username"):
        history = attempts.get(membership.student_id, [])
        eligible = [a for a in history if a.mode != Mode.CHALLENGE or not a.assisted]
        complete = [a for a in eligible if a.completed_at]
        selected = next(iter(complete or eligible or history), None)
        assessments = {a.phase: a for a in selected.assessments.all()} if selected else {}
        topics = topic_rows(selected) if selected else []
        students.append({
            "student": membership.student, "attempts": len(history), "attempt": selected, "started": bool(history),
            "complete": bool(complete), "status": "Complete" if complete else
            ("Assisted" if selected and selected.assisted else ("In progress" if selected else "Not started")),
            "score": selected.score if selected else None, "hints": sum(t[2]["hints"] for t in topics),
            "topics": topics, "pre": assessments.get("pre"), "post": assessments.get("post"),
            "change": assessments["post"].score - assessments["pre"].score if set(assessments) == {"pre", "post"} else None,
            "duration": game.duration_label(selected.duration) if selected else "",
        })
    completed = [s for s in students if s["complete"]]
    started = [s for s in students if s["started"]]
    paired = [s for s in started if s["change"] is not None]
    misses = {code: 0 for code in OUTCOMES}
    for student in started:
        for code, _, data in student["topics"]:
            misses[code] += data["mistakes"]
    return students, {
        "enrolled": len(students), "started": len(started), "complete": len(completed),
        "rate": round(100 * len(completed) / len(students)) if students else 0,
        "average_score": round(mean(s["score"] for s in completed), 1) if completed else None,
        "average_hints": round(mean(s["hints"] for s in started), 1) if started else None,
        "paired": len(paired),
        "pre": round(mean(s["pre"].score for s in paired), 1) if paired else None,
        "post": round(mean(s["post"].score for s in paired), 1) if paired else None,
        "misses": [(code, OUTCOMES[code], count) for code, count in sorted(misses.items(), key=lambda pair: -pair[1])],
        "max_misses": max(misses.values(), default=0),
    }


@instructor_required
@transaction.atomic
def classroom(request, pk):
    course = get_object_or_404(Classroom, pk=pk, instructor=request.user)
    form = forms.AssignmentForm(request.POST if request.method == "POST" else None)
    if request.method == "POST" and form.is_valid():
        assignment = form.save(commit=False)
        assignment.classroom = course
        assignment.save()
        return redirect("classroom", pk=pk)
    assignments = course.assignments.order_by("-pk")
    selection = request.GET.get("assignment")
    assignment = get_object_or_404(assignments, pk=selection) if selection and selection.isdecimal() else assignments.first()
    students, stats = classroom_report(course, assignment)
    return render(request, "classroom.html", {
        "classroom": course, "form": form, "assignments": assignments, "assignment": assignment,
        "students": students, "stats": stats, "outcomes": OUTCOMES,
    })


def csv_cell(value):
    # Spreadsheet programs can interpret strings starting with these characters as formulas.
    return f"'{value}" if value.lstrip().startswith(("=", "+", "-", "@", "\t", "\r", "\n")) else value


@instructor_required
def export(request, pk, assignment_pk):
    course = get_object_or_404(Classroom, pk=pk, instructor=request.user)
    assignment = get_object_or_404(course.assignments, pk=assignment_pk)
    students, _ = classroom_report(course, assignment)
    response = HttpResponse(content_type="text/csv; charset=utf-8")
    response["Content-Disposition"] = f'attachment; filename="cipherbreak-class-{pk}-assignment-{assignment_pk}.csv"'
    writer = csv.writer(response)
    writer.writerow(["Nickname", "Assignment", "Required mode", "Classification", "Status", "Rooms completed", "Score", "Attempts", "Hints",
                     "Elapsed seconds", "Pre (/7)", "Post (/7)", "Change",
                     *[f"{code} accuracy (%)" for code in OUTCOMES],
                     *[f"{phase} {code} correct" for phase in ("Pre", "Post") for code in OUTCOMES]])
    for s in students:
        attempt = s["attempt"]
        accuracies = [row[2]["accuracy"] for row in s["topics"]] if s["topics"] else [None] * len(OUTCOMES)
        topics = [int(record.topics[code]) if record else None for record in (s["pre"], s["post"]) for code in OUTCOMES]
        writer.writerow([csv_cell(s["student"].username), csv_cell(assignment.title), assignment.get_mode_display(),
                         attempt.classification if attempt else "", s["status"], attempt.rooms_completed if attempt else 0,
                         s["score"], s["attempts"], s["hints"], attempt.duration if attempt else "",
                         s["pre"].score if s["pre"] else "", s["post"].score if s["post"] else "", s["change"],
                         *accuracies, *topics])
    return response


@instructor_required
def demo(request):
    _, default_block, default_key, _ = VECTORS[0]
    values = request.POST if request.method == "POST" else request.GET
    selection = values.get("room", "1")
    number = int(selection) if selection in {"1", "2", "3", "4"} else 1
    direction = values.get("direction", "decrypt" if number == 4 else "encrypt")
    direction = "decrypt" if direction == "decrypt" else "encrypt"
    block = values.get("block", "" if request.method == "POST" else VECTORS[0][3] if number == 4 else default_block)
    key = values.get("key", "" if request.method == "POST" else default_key)
    context = trace_context(block, key, direction)
    room_links = []
    for index, room in enumerate(ROOMS, 1):
        options = {"room": index}
        if trace := context["trace"]:
            target_direction = "decrypt" if index == 4 else "encrypt"
            options.update({
                "block": trace["input" if direction == target_direction else "output"],
                "key": trace["key"], "direction": target_direction,
            })
        room_links.append((index, room["short"], urlencode(options)))
    return render(request, "lab.html", {
        **context, "demo": True, "room_links": room_links, "room": ROOMS[number - 1], "room_number": number,
    })
