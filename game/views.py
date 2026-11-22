"""Student-facing pages and the JSON API used by the game screen."""
import json

from django.contrib import messages
from django.contrib.auth.decorators import login_required
from django.http import JsonResponse
from django.shortcuts import get_object_or_404, redirect, render
from django.urls import reverse
from django.views.decorators.http import require_POST

from accounts.models import TutorialCompletion
from classroom.models import Assignment, Classroom, Membership

from . import assessments, notebook
from . import puzzles as P
from . import services as S
from .models import AssessmentResult, Attempt, UserAchievement


# ---------------------------------------------------------------------------
# Public pages
# ---------------------------------------------------------------------------

def landing(request):
    return render(request, "landing.html", {"rooms": P.ROOMS})


def how_to_play(request):
    return render(request, "how_to_play.html", {"rooms": P.ROOMS, "achievements": P.ACHIEVEMENTS,
                                                "scoring": {"base": P.POINTS_PER_PUZZLE, "wrong": P.WRONG_PENALTY,
                                                            "hints": P.HINT_PENALTIES, "bonus": P.ROOM_BONUS}})


def educators(request):
    return render(request, "educators.html", {"objectives": P.OBJECTIVES, "rooms": P.ROOMS})


# ---------------------------------------------------------------------------
# Dashboard
# ---------------------------------------------------------------------------

@login_required
def dashboard(request):
    user = request.user
    if user.profile.is_instructor:
        return redirect("instructor_dashboard")
    attempts = list(user.attempts.exclude(mode=Attempt.DEMO).prefetch_related("rooms", "puzzles"))
    active = next((a for a in attempts if a.status == Attempt.ACTIVE), None)
    active_state = S.state(active) if active else None
    completed = [a for a in attempts if a.status == Attempt.COMPLETED]
    earned = {ua.code: ua for ua in UserAchievement.objects.filter(user=user)}
    badges = [{"code": c, **info, "earned": c in earned, "earned_at": earned[c].earned_at if c in earned else None}
              for c, info in P.ACHIEVEMENTS.items()]
    from .models import PuzzleProgress
    all_pp = PuzzleProgress.objects.filter(attempt__user=user).exclude(attempt__mode=Attempt.DEMO)
    stats = S.objective_stats(all_pp)
    history = []
    for a in attempts:
        history.append({"a": a, "rooms": sum(1 for r in a.rooms.all() if r.completed_at),
                        "hints": a.hints.count()})
    memberships = Membership.objects.filter(student=user).select_related("classroom")
    assignments = Assignment.objects.filter(classroom__memberships__student=user).select_related("classroom")
    pre = user.assessments.filter(kind="pre").first()
    post = user.assessments.filter(kind="post").first()
    return render(request, "dashboard.html", {
        "active": active, "active_state": active_state, "history": history, "completed": completed,
        "badges": badges, "stats": stats, "objectives": P.OBJECTIVES,
        "best_score": max([a.score for a in completed], default=0),
        "lifetime_points": sum(a.score for a in attempts),
        "puzzles_solved": all_pp.filter(solved=True).count(),
        "hints_total": sum(h["hints"] for h in history),
        "memberships": memberships, "assignments": assignments, "pre": pre, "post": post,
        "assessment_change": (post.score - pre.score) if pre and post else None,
        "rooms": P.ROOMS,
    })


@login_required
@require_POST
def new_adventure(request):
    mode = request.POST.get("mode", Attempt.GUIDED)
    if mode not in (Attempt.GUIDED, Attempt.CHALLENGE):
        mode = Attempt.GUIDED
    assignment = None
    aid = request.POST.get("assignment")
    if aid:
        assignment = get_object_or_404(Assignment, pk=aid, classroom__memberships__student=request.user)
        if assignment.required_mode in (Attempt.GUIDED, Attempt.CHALLENGE):
            mode = assignment.required_mode
    for old in request.user.attempts.filter(status=Attempt.ACTIVE).exclude(mode=Attempt.DEMO):
        S.abandon_attempt(old)  # the dashboard asks for confirmation first; results are kept
    attempt = S.start_attempt(request.user, mode=mode, timed=request.POST.get("timed") == "on",
                              assignment=assignment, exploration=True)
    return redirect("play", attempt_id=attempt.id)


@login_required
def resume(request):
    attempt = request.user.attempts.filter(status=Attempt.ACTIVE).exclude(mode=Attempt.DEMO).first()
    if not attempt:
        messages.info(request, "You have no adventure in progress. Start a new one!")
        return redirect("dashboard")
    return redirect("play", attempt_id=attempt.id)


@login_required
def play(request, attempt_id):
    attempt = get_object_or_404(Attempt, pk=attempt_id, user=request.user)
    if attempt.status == Attempt.ABANDONED:
        messages.info(request, "That adventure was replaced by a newer one. Its results are kept in your history.")
        return redirect("results", attempt_id=attempt.id)
    tutorials = list(TutorialCompletion.objects.filter(user=request.user).values_list("tutorial_id", flat=True))
    boot = {
        "attemptId": attempt.id, "username": request.user.username, "mode": attempt.mode,
        "tutorialsDone": tutorials, "notebookUrl": reverse("notebook"),
        "labUrl": reverse("lab"), "dashboardUrl": reverse("dashboard"),
        "resultsUrl": reverse("results", args=[attempt.id]),
        "postUrl": reverse("assessment", args=["post"]) + f"?attempt={attempt.id}",
        "preTaken": request.user.assessments.filter(kind="pre").exists(),
        "preUrl": reverse("assessment", args=["pre"]) + f"?attempt={attempt.id}",
        "isInstructor": request.user.profile.is_instructor,
    }
    return render(request, "game/play.html", {"attempt": attempt, "boot": boot})


@login_required
def results(request, attempt_id):
    attempt = get_object_or_404(Attempt, pk=attempt_id, user=request.user)
    ctx = S.results(attempt)
    ctx["objectives"] = P.OBJECTIVES
    ctx["post_taken"] = request.user.assessments.filter(kind="post").exists()
    return render(request, "game/results.html", ctx)


@login_required
def notebook_view(request):
    unlocked = request.user.profile.notebook_unlocked
    return render(request, "game/notebook.html", {
        "pages": notebook.pages(unlocked), "embed": request.GET.get("embed") == "1",
        "focus": request.GET.get("page", "")})


@login_required
def assessment(request, kind):
    if kind not in ("pre", "post"):
        return redirect("dashboard")
    attempt_id = request.GET.get("attempt") or request.POST.get("attempt")
    attempt = Attempt.objects.filter(pk=attempt_id, user=request.user).first() if attempt_id else None
    seed = request.user.id * 7 + (1 if kind == "post" else 0)
    qs = assessments.questions(kind, seed)
    if request.method == "POST":
        answers = {str(q["index"]): request.POST.get(f"q{q['index']}") for q in qs}
        score, total, per = assessments.grade(kind, answers)
        AssessmentResult.objects.create(user=request.user, kind=kind, attempt=attempt, score=score,
                                        total=total, answers=answers, per_objective=per)
        messages.success(request, f"{'Pre' if kind == 'pre' else 'Post'}-assessment saved: {score}/{total}.")
        if kind == "pre" and attempt:
            return redirect("play", attempt_id=attempt.id)
        if attempt:
            return redirect("results", attempt_id=attempt.id)
        return redirect("dashboard")
    previous = request.user.assessments.filter(kind=kind).first()
    return render(request, "game/assessment.html", {"kind": kind, "questions": qs, "attempt": attempt,
                                                    "previous": previous, "objectives": P.OBJECTIVES})


@login_required
@require_POST
def join_classroom(request):
    code = request.POST.get("code", "").strip().upper()
    classroom = Classroom.objects.filter(join_code=code).first()
    if not classroom:
        messages.error(request, "No classroom uses that join code. Check it with your instructor.")
    else:
        _, created = Membership.objects.get_or_create(classroom=classroom, student=request.user)
        messages.success(request, f"You joined {classroom.name}." if created else f"You are already in {classroom.name}.")
    return redirect("dashboard")


# ---------------------------------------------------------------------------
# JSON API
# ---------------------------------------------------------------------------

def _json_body(request):
    try:
        data = json.loads(request.body or "{}")
        return data if isinstance(data, dict) else {}
    except ValueError:
        return {}


def api_view(fn):
    """Login required, attempt ownership enforced, GameError -> 400."""
    @login_required
    def wrapper(request, attempt_id, *args, **kwargs):
        attempt = get_object_or_404(Attempt, pk=attempt_id, user=request.user)
        try:
            return JsonResponse(fn(request, attempt, *args, **kwargs))
        except S.GameError as exc:
            return JsonResponse({"error": str(exc)}, status=400)
    wrapper.__name__ = fn.__name__
    return wrapper


@api_view
def api_state(request, attempt):
    data = S.state(attempt)
    data["tutorials_done"] = list(TutorialCompletion.objects.filter(user=request.user)
                                  .values_list("tutorial_id", flat=True))
    return data


@require_POST
@api_view
def api_enter_room(request, attempt):
    try:
        room = int(_json_body(request).get("room", 0))
    except (ValueError, TypeError):
        raise S.GameError("Unknown room.") from None
    if room == 0:  # back to the lobby
        attempt.position = {"room": 0}
        attempt.touch()
        attempt.save(update_fields=["position", "active_seconds", "last_active"])
    else:
        S.enter_room(attempt, room)
    return {"ok": True, "position": attempt.position}


@api_view
def api_puzzle(request, attempt, pid):
    return S.open_puzzle(attempt, pid)


@require_POST
@api_view
def api_submit(request, attempt, pid):
    return S.submit(attempt, pid, _json_body(request).get("answer", {}))


@require_POST
@api_view
def api_hint(request, attempt, pid):
    return S.hint(attempt, pid)


@require_POST
@api_view
def api_collect(request, attempt):
    if attempt.position.get("room") != 1:
        raise S.GameError("Collect the access card inside the Hex Gate.")
    Attempt.objects.filter(pk=attempt.pk).update(access_card_collected=True)
    attempt.access_card_collected = True
    return {"items": S.inventory(attempt)}


@api_view
def api_inventory(request, attempt):
    return {"items": S.inventory(attempt)}


@api_view
def api_archive(request, attempt, kind):
    return S.archive(attempt, kind)


@require_POST
@api_view
def api_intro_seen(request, attempt):
    attempt.intro_seen = True
    attempt.save(update_fields=["intro_seen"])
    return {"ok": True}


@require_POST
@api_view
def api_flag(request, attempt):
    S.flag_not_independent(attempt, "Opened the DES Explorer during the challenge.")
    return {"ok": True, "independent": attempt.independent}


@login_required
@require_POST
def api_tutorial(request, tutorial_id):
    body = _json_body(request)
    TutorialCompletion.objects.update_or_create(user=request.user, tutorial_id=tutorial_id[:40],
                                                defaults={"skipped": bool(body.get("skipped"))})
    return JsonResponse({"ok": True})
