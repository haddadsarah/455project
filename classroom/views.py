"""Instructor tools: classrooms, assignments, progress, analytics, CSV, demo mode.

Every query is scoped to classrooms owned by the signed-in instructor."""
import csv
import re
from functools import wraps

from django.contrib import messages
from django.contrib.auth.decorators import login_required
from django.http import HttpResponse, HttpResponseForbidden
from django.shortcuts import get_object_or_404, redirect, render
from django.views.decorators.http import require_POST

from des_engine import DESInputError, validate_hex64
from game import puzzles as P
from game import services as S
from game.models import AssessmentResult, Attempt, PuzzleProgress

from .models import Assignment, Classroom, Membership


def instructor_required(view):
    @login_required
    @wraps(view)
    def wrapper(request, *args, **kwargs):
        if not request.user.profile.is_instructor:
            return HttpResponseForbidden(render(request, "403.html").content)
        return view(request, *args, **kwargs)
    return wrapper


def _student_summary(student, classroom):
    attempts = list(student.attempts.filter(assignment__classroom=classroom).exclude(mode=Attempt.DEMO))
    best = max(attempts, key=lambda a: (a.status == Attempt.COMPLETED, a.score), default=None)
    pps = PuzzleProgress.objects.filter(attempt__in=attempts)
    stats = S.objective_stats(pps)
    assessments = AssessmentResult.objects.filter(user=student, attempt__in=attempts)
    pre = assessments.filter(kind="pre").order_by("taken_at").first()
    post = assessments.filter(kind="post").first()
    rooms_done = len(S.completed_rooms(best)) if best else 0
    current = next((a for a in attempts if a.status == Attempt.ACTIVE), None)
    return {
        "student": student, "attempts": len(attempts), "best": best,
        "started": bool(attempts), "completed": any(a.status == Attempt.COMPLETED for a in attempts),
        "rooms_done": rooms_done,
        "current": (S.state(current)["attempt"]["percent"] if current else None),
        "score": best.score if best else 0,
        "hints": sum(a.hints.count() for a in attempts),
        "mistakes": sum(p.wrong_attempts for p in pps),
        "minutes": round(best.active_seconds / 60, 1) if best and best.status == Attempt.COMPLETED else None,
        "mode": best.label if best else "—",
        "stats": stats, "pre": pre, "post": post,
    }


def _analytics(summaries):
    n = len(summaries)
    started = [s for s in summaries if s["started"]]
    completed = [s for s in summaries if s["completed"]]
    missed = {lo: 0 for lo in P.OBJECTIVES}
    for s in summaries:
        for lo, st in s["stats"].items():
            missed[lo] += st["wrong"]
    pre = [s["pre"].score / s["pre"].total for s in summaries if s["pre"]]
    post = [s["post"].score / s["post"].total for s in summaries if s["post"]]
    pairs = [(s["pre"], s["post"]) for s in summaries if s["pre"] and s["post"]]
    pre_lo = {lo: 0 for lo in P.OBJECTIVES}
    post_lo = {lo: 0 for lo in P.OBJECTIVES}
    for a, b in pairs:
        for lo in P.OBJECTIVES:
            pre_lo[lo] += a.per_objective.get(lo, 0)
            post_lo[lo] += b.per_objective.get(lo, 0)
    max_missed = max(missed.values()) or 1
    return {
        "enrolled": n, "started": len(started), "completed": len(completed),
        "completion_rate": round(100 * len(completed) / n) if n else 0,
        "avg_score": round(sum(s["score"] for s in completed) / len(completed)) if completed else None,
        "avg_hints": round(sum(s["hints"] for s in started) / len(started), 1) if started else None,
        "missed": sorted(([lo, P.OBJECTIVES[lo], c, round(100 * c / max_missed)] for lo, c in missed.items()),
                         key=lambda x: -x[2]),
        "pre_avg": round(100 * sum(pre) / len(pre)) if pre else None,
        "post_avg": round(100 * sum(post) / len(post)) if post else None,
        "paired": len(pairs),
        "lo_change": [(lo, P.OBJECTIVES[lo], pre_lo[lo], post_lo[lo]) for lo in P.OBJECTIVES] if pairs else [],
    }


@instructor_required
def dashboard(request):
    if request.method == "POST":
        name = request.POST.get("name", "").strip()
        if not name:
            messages.error(request, "Give the classroom a name.")
        else:
            c = Classroom.objects.create(name=name[:100], instructor=request.user,
                                         description=request.POST.get("description", "")[:300])
            Assignment.objects.create(classroom=c, required_mode=request.POST.get("mode", "any"))
            messages.success(request, f"Classroom created. Join code: {c.join_code}")
            return redirect("classroom_detail", pk=c.pk)
    classrooms = Classroom.objects.filter(instructor=request.user).prefetch_related("memberships", "assignments")
    return render(request, "instructor/dashboard.html", {"classrooms": classrooms})


@instructor_required
def classroom_detail(request, pk):
    classroom = get_object_or_404(Classroom, pk=pk, instructor=request.user)
    if request.method == "POST":
        Assignment.objects.create(classroom=classroom,
                                  title=request.POST.get("title") or "CipherBreak: The 16-Round Escape",
                                  required_mode=request.POST.get("mode", "any"),
                                  instructions=request.POST.get("instructions", "")[:400],
                                  due_date=request.POST.get("due_date") or None)
        messages.success(request, "Assignment created.")
        return redirect("classroom_detail", pk=pk)
    students = [m.student for m in classroom.memberships.select_related("student")]
    summaries = [_student_summary(s, classroom) for s in students]
    return render(request, "instructor/classroom.html", {
        "classroom": classroom, "summaries": summaries, "analytics": _analytics(summaries),
        "objectives": P.OBJECTIVES, "assignments": classroom.assignments.all()})


@instructor_required
def student_detail(request, pk, student_id):
    classroom = get_object_or_404(Classroom, pk=pk, instructor=request.user)
    membership = get_object_or_404(Membership, classroom=classroom, student_id=student_id)
    summary = _student_summary(membership.student, classroom)
    attempts = membership.student.attempts.filter(assignment__classroom=classroom).exclude(mode=Attempt.DEMO)
    return render(request, "instructor/student.html", {
        "classroom": classroom, "s": summary, "attempts": [(a, S.results(a)) for a in attempts],
        "objectives": P.OBJECTIVES})


def csv_text(value):
    formula_prefixes = ("=", "+", "-", "@")
    control_prefixes = (chr(9), chr(10), chr(13))
    if value.lstrip().startswith(formula_prefixes) or value.startswith(control_prefixes):
        return "'" + value
    return value


@instructor_required
def export_csv(request, pk):
    classroom = get_object_or_404(Classroom, pk=pk, instructor=request.user)
    resp = HttpResponse(content_type="text/csv")
    slug = re.sub(r"[^A-Za-z0-9]+", "_", classroom.name)[:40]
    resp["Content-Disposition"] = f'attachment; filename="cipherbreak_{slug}.csv"'
    w = csv.writer(resp)
    los = list(P.OBJECTIVES)
    w.writerow(["student_nickname", "assignment", "completion_status", "best_score", "mode", "rooms_completed",
                "attempts", "hints_used", "mistakes", "active_minutes"] + [f"{lo}_accuracy_pct" for lo in los]
               + ["pre_assessment", "post_assessment", "change"])
    for m in classroom.memberships.select_related("student"):
        s = _student_summary(m.student, classroom)
        pre = f"{s['pre'].score}/{s['pre'].total}" if s["pre"] else ""
        post = f"{s['post'].score}/{s['post'].total}" if s["post"] else ""
        change = (s["post"].score - s["pre"].score) if s["pre"] and s["post"] else ""
        status = "completed" if s["completed"] else ("in progress" if s["started"] else "not started")
        assignment = s["best"].assignment if s["best"] else None
        w.writerow([csv_text(m.student.username), csv_text(assignment.title) if assignment else "", status, s["score"], s["mode"],
                    s["rooms_done"], s["attempts"], s["hints"], s["mistakes"], s["minutes"] or ""]
                   + [s["stats"][lo]["accuracy"] if s["stats"][lo]["accuracy"] is not None else "" for lo in los]
                   + [pre, post, change])
    return resp


@instructor_required
def demo(request):
    """Instructor demonstration: open any room, optionally with your own code and key."""
    error = None
    if request.method == "POST":
        code = request.POST.get("code", "").strip()
        exit_code = request.POST.get("exit_code", "").strip()
        key = request.POST.get("key", "").strip()
        overrides = {}
        try:
            for label, c in (("message code", code), ("exit code", exit_code)):
                if c and (len(c) != 8 or not all(32 <= ord(ch) < 127 for ch in c)):
                    raise DESInputError(f"The {label} must be exactly 8 printable ASCII characters.")
            if key:
                overrides["key"] = validate_hex64(key, "key")
            overrides["code"], overrides["exit_code"] = code, exit_code
        except DESInputError as exc:
            error = str(exc)
        if not error:
            attempt = S.start_attempt(request.user, mode=Attempt.DEMO, overrides=overrides)
            attempt.intro_seen = True
            attempt.save(update_fields=["intro_seen"])
            room = request.POST.get("room", "0")
            url = f"/play/{attempt.id}/" + (f"?room={room}" if room in ("1", "2", "3", "4") else "")
            return redirect(url)
    return render(request, "instructor/demo.html", {"error": error, "rooms": P.ROOMS})


@instructor_required
@require_POST
def classroom_edit(request, pk):
    classroom = get_object_or_404(Classroom, pk=pk, instructor=request.user)
    name = request.POST.get("name", "").strip()
    if not name:
        messages.error(request, "The classroom name cannot be empty.")
    else:
        classroom.name = name[:100]
        classroom.description = request.POST.get("description", "")[:300]
        if request.POST.get("new_code") == "on":
            from .models import new_join_code
            classroom.join_code = new_join_code()
        classroom.save()
        messages.success(request, "Classroom updated.")
    return redirect("classroom_detail", pk=pk)


@instructor_required
@require_POST
def classroom_delete(request, pk):
    classroom = get_object_or_404(Classroom, pk=pk, instructor=request.user)
    if request.POST.get("confirm_name", "").strip() != classroom.name:
        messages.error(request, "Type the classroom's exact name to confirm deletion.")
        return redirect("classroom_detail", pk=pk)
    name = classroom.name
    classroom.delete()  # memberships and assignments go with it; students' own attempts are kept
    messages.success(request, f"Classroom “{name}” deleted. Students keep their own game history.")
    return redirect("instructor_dashboard")


@instructor_required
@require_POST
def remove_student(request, pk, student_id):
    classroom = get_object_or_404(Classroom, pk=pk, instructor=request.user)
    membership = get_object_or_404(Membership, classroom=classroom, student_id=student_id)
    username = membership.student.username
    membership.delete()
    messages.success(request, f"{username} was removed from {classroom.name}. Their own game history is kept.")
    return redirect("classroom_detail", pk=pk)


@instructor_required
@require_POST
def assignment_delete(request, pk, assignment_id):
    classroom = get_object_or_404(Classroom, pk=pk, instructor=request.user)
    get_object_or_404(Assignment, pk=assignment_id, classroom=classroom).delete()
    messages.success(request, "Assignment deleted.")
    return redirect("classroom_detail", pk=pk)
