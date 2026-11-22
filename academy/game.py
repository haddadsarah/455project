"""Transactional mission state transitions and shared performance calculations."""
from collections import defaultdict
from secrets import token_hex

from django.core.exceptions import PermissionDenied
from django.db import transaction
from django.utils import timezone

from .curriculum import OUTCOMES, ROOMS
from .models import Attempt, EarnedBadge, Mode, PuzzleProgress, RoomProgress, Submission
from .puzzles import build_mission, build_mission_v2

HINT_COSTS = (0, 10, 20, 30)
ROOM_BONUS = 50
FIRST_TRY_BONUS = 10
BADGE_BY_PUZZLE = {"sbox": "S-box Specialist", "recover": "Reverse Engineer"}


def mission_for(attempt):
    # Keep prior generation rules here if a new generator version is introduced.
    if attempt.generator_version == 1:
        return build_mission(attempt.seed)
    if attempt.generator_version == 2:
        return build_mission_v2(attempt.seed)
    raise ValueError("Unknown mission generator version.")


@transaction.atomic
def create_attempt(student, mode, assignment=None, timed=False):
    recent = set(student.attempts.values_list("seed", flat=True)[:5])
    recent_codes = {build_mission(seed).message for seed in recent}
    seed = token_hex(16)
    mission = build_mission_v2(seed)
    while mission.message in recent_codes:
        seed = token_hex(16)
        mission = build_mission_v2(seed)
    attempt = Attempt.objects.create(student=student, assignment=assignment, seed=seed, mode=mode, timed=timed, generator_version=2)
    for number, puzzles in enumerate(mission.rooms, 1):
        room = RoomProgress.objects.create(attempt=attempt, number=number)
        PuzzleProgress.objects.bulk_create(PuzzleProgress(room=room, code=p.code, outcome=p.outcome) for p in puzzles)
    return attempt


def is_instructor(user):
    return user.is_authenticated and user.groups.filter(name="Instructors").exists()


def room_entries(mission, room):
    states = {state.code: state for state in room.puzzles.all()}
    return [(puzzle, states[puzzle.code]) for puzzle in mission.rooms[room.number - 1]]


def room_badges(room):
    badges = [BADGE_BY_PUZZLE[p.code] for p in room.puzzles.all() if p.solved and p.code in BADGE_BY_PUZZLE]
    if room.completed:
        badges.append(ROOMS[room.number - 1]["badge"])
    return badges


def active_puzzle(entries):
    return next(((p, state) for p, state in entries if not state.solved and not p.optional), None)


def award(student, name):
    EarnedBadge.objects.get_or_create(student=student, name=name)


def get_playable(attempt, room_number, code):
    if not 1 <= room_number <= min(4, attempt.unlocked_room):
        raise PermissionDenied
    if attempt.current_room != room_number or attempt.stage not in {"room", "clear"}:
        raise PermissionDenied
    room = attempt.rooms.get(number=room_number)
    entries = room_entries(mission_for(attempt), room)
    current = active_puzzle(entries)
    for puzzle, progress in entries:
        if puzzle.code == code and (progress.solved or (current and current[0].code == code)
                                    or (puzzle.optional and room.completed and not attempt.completed_at)):
            return room, puzzle, progress
    raise PermissionDenied


def use_hint(attempt, number, code, level):
    _, _, progress = get_playable(attempt, number, code)
    if not progress.solved and level == progress.hint_level + 1 and level <= 3:
        progress.hint_level = level
        progress.save(update_fields=["hint_level"])
        attempt.save(update_fields=["updated_at"])


def submit(attempt, number, code, answer, request_id):
    room, puzzle, state = get_playable(attempt, number, code)
    if state.solved or Submission.objects.filter(request_id=request_id).exists():
        return "repeat", puzzle
    correct = puzzle.check(answer)
    Submission.objects.create(puzzle=state, correct=correct, request_id=request_id)
    if not correct:
        state.mistakes += 1
        state.save(update_fields=["mistakes"])
        attempt.save(update_fields=["updated_at"])
        return "incorrect", puzzle

    score = max(0, 100 - 10 * state.mistakes - HINT_COSTS[state.hint_level] + (FIRST_TRY_BONUS if not state.mistakes else 0))
    state.solved = True
    state.score = score
    state.save(update_fields=["solved", "score"])
    if code in BADGE_BY_PUZZLE:
        award(attempt.student, BADGE_BY_PUZZLE[code])
    if not room.completed and not active_puzzle(room_entries(mission_for(attempt), room)):
        score += ROOM_BONUS
        room.completed = True
        award(attempt.student, ROOMS[number - 1]["badge"])
        attempt.unlocked_room = number + 1
        attempt.stage = "clear"
        if number == 4:
            attempt.completed_at = timezone.now()
    room.score += score
    room.save(update_fields=["score", "completed"])
    attempt.score += score
    attempt.save()
    return "correct", puzzle


def performance(attempt):
    totals = defaultdict(lambda: {"correct": 0, "mistakes": 0, "hints": 0})
    for state in PuzzleProgress.objects.filter(room__attempt=attempt):
        topic = totals[state.outcome]
        topic["correct"] += state.solved
        topic["mistakes"] += state.mistakes
        topic["hints"] += state.hint_level
    for code in OUTCOMES:
        topic = totals[code]
        count = topic["correct"] + topic["mistakes"]
        topic["accuracy"] = round(100 * topic["correct"] / count) if count else None
    return dict(totals)


def duration_label(seconds):
    return f"{seconds // 60}m {seconds % 60:02}s"
