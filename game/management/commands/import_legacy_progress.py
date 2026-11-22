"""Copy gameplay from the earlier academy schema into the current facility."""
import json
from datetime import datetime, timezone as utc_zone

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.db import connection, transaction
from django.utils import timezone

from accounts.models import Profile, TutorialCompletion
from game.legacy.puzzles import build_mission
from classroom.models import Assignment, Classroom, Membership
from game.generator import generate_params
from game.models import AssessmentResult, Attempt, HintUsage, PuzzleProgress, PuzzleSubmission, RoomProgress, UserAchievement
from game.puzzles import ACHIEVEMENTS, PUZZLE_META, room_of

LINKS = {
    "ascii": "r1_ascii", "block": "r1_block", "ip": "r1_ip_bit", "halves": "r1_split",
    "parity": "r2_parity", "pc1": "r2_pc1_bit", "split": "r2_split", "rotate": "r2_shift",
    "pc2": "r2_pc2", "subkey": "r2_cycle", "expand": "r3_expand", "xor": "r3_xor",
    "sbox": "r3_sbox", "advanced": "r3_sbox_bonus", "p": "r3_perm", "feistel_xor": "r3_feistel",
    "feistel": "r3_swap", "order": "r4_order", "decrypt": "r4_round", "recover": "r4_code", "verdict": "r4_verdict",
}


def read(table):
    with connection.cursor() as cursor:
        cursor.execute(f"SELECT * FROM {connection.ops.quote_name('academy_' + table)}")
        fields = [field[0] for field in cursor.description]
        return [dict(zip(fields, row, strict=True)) for row in cursor.fetchall()]


def aware(value):
    if value is None:
        return None
    dt = datetime.fromisoformat(str(value))
    return timezone.make_aware(dt, utc_zone.utc) if timezone.is_naive(dt) else dt


def derive(old):
    mission = build_mission(old["seed"])
    seed = int(old["seed"][:12], 16)
    data = generate_params(seed)
    puzzles = {p.code: p for items in mission.rooms for p in items}
    data.update(code=mission.message, exit_code=mission.message, key=mission.encryption["key"], legacy_id=old["id"])
    data["r1"]["ip_position"] = puzzles["ip"].data["target"]
    data["r2"].update(pc1_position=puzzles["pc1"].data["target"],
                      shift_round=puzzles["rotate"].data["round"]["number"],
                      pc2_position=puzzles["pc2"].data["target"])
    data["r3"].update(round=mission.selected_round, group=puzzles["sbox"].data["box"]["number"] - 1,
                      bonus_group=puzzles["advanced"].data["box"]["number"] - 1,
                      p_position=puzzles["p"].data["target"])
    return seed, data


class Command(BaseCommand):
    help = "Import the previous repository edition's accounts, classrooms, scores and attempts in place."

    @transaction.atomic
    def handle(self, *args, **options):
        if "academy_attempt" not in connection.introspection.table_names():
            self.stdout.write("No earlier academy database tables were found.")
            return
        instructor_ids = set(get_user_model().objects.filter(groups__name="Instructors").values_list("id", flat=True))
        demo_ids = set(get_user_model().objects.filter(groups__name__in=[
            "Local CipherBreak demo fixtures", "Local EECE 455 course fixtures",
        ]).values_list("id", flat=True))
        for user in get_user_model().objects.all():
            fields = {}
            if user.pk in instructor_ids:
                fields["role"] = Profile.INSTRUCTOR
            if user.pk in demo_ids:
                fields["is_demo"] = True
            Profile.objects.update_or_create(user=user, defaults=fields)
        for old in read("profile"):
            if old["onboarding_seen"]:
                TutorialCompletion.objects.get_or_create(user_id=old["user_id"], tutorial_id="onboarding")

        rooms = {}
        for old in read("classroom"):
            course, _ = Classroom.objects.get_or_create(join_code=old["code"], defaults={
                "name": old["name"], "instructor_id": old["instructor_id"],
            })
            if course.instructor_id != old["instructor_id"]:
                raise RuntimeError(f"Classroom code {old['code']} belongs to another instructor.")
            rooms[old["id"]] = course
        for old in read("membership"):
            Membership.objects.get_or_create(classroom=rooms[old["classroom_id"]], student_id=old["student_id"])
        assignments = {}
        for old in read("assignment"):
            assignment = Assignment.objects.filter(classroom=rooms[old["classroom_id"]],
                                                   title=old["title"], required_mode=old["mode"]).first()
            if assignment is None:
                assignment = Assignment.objects.create(classroom=rooms[old["classroom_id"]],
                                                       title=old["title"], required_mode=old["mode"])
            assignments[old["id"]] = assignment

        imported = {}
        for old in read("attempt"):
            if Attempt.objects.filter(params__legacy_id=old["id"]).exists():
                continue
            seed, data = derive(old)
            end = aware(old["completed_at"])
            entered = aware(old["entered_at"])
            updated = aware(old["updated_at"])
            attempt = Attempt.objects.create(
                user_id=old["student_id"], assignment=assignments.get(old["assignment_id"]),
                seed=seed, params=data, mode=old["mode"], timed=old["timed"],
                intro_seen=old["stage"] != "intro", position={"room": old["current_room"]}, score=old["score"],
                status=Attempt.COMPLETED if end else Attempt.ACTIVE, completed_at=end, last_active=updated,
                independent=old["mode"] == Attempt.CHALLENGE and not old["assisted"],
                active_seconds=max(0, int(((end or updated) - entered).total_seconds())) if entered else 0,
            )
            Attempt.objects.filter(pk=attempt.pk).update(started_at=aware(old["started_at"]))
            imported[old["id"]] = attempt

        room_rows = {old["id"]: old for old in read("roomprogress")}
        puzzle_rows = read("puzzleprogress")
        user_by_attempt = {old["id"]: old["student_id"] for old in read("attempt")}
        scores = {}
        for old in puzzle_rows:
            room_id = old["room_id"]
            scores[room_id] = scores.get(room_id, 0) + old["score"]
            if old.get("lesson_stage", 0) >= 3:
                user_id = user_by_attempt[room_rows[room_id]["attempt_id"]]
                TutorialCompletion.objects.get_or_create(user_id=user_id, tutorial_id="p_" + LINKS[old["code"]])
        for key, old in room_rows.items():
            attempt = imported.get(old["attempt_id"])
            if attempt is None:
                continue
            RoomProgress.objects.create(attempt=attempt, room=old["number"],
                completed_at=attempt.last_active if old["completed"] else None,
                bonus_points=max(0, old["score"] - scores.get(key, 0)))
            if old["tutorial_seen"]:
                TutorialCompletion.objects.get_or_create(user=attempt.user, tutorial_id=f"room{old['number']}")
            if old["number"] == 1 and old.get("clue_collected"):
                Attempt.objects.filter(pk=attempt.pk).update(access_card_collected=True)
        progress = {}
        for old in puzzle_rows:
            attempt = imported.get(room_rows[old["room_id"]]["attempt_id"])
            if attempt is None:
                continue
            pid = LINKS[old["code"]]
            if not (old["solved"] or old["mistakes"] or old["hint_level"]):
                continue
            progress[old["id"]] = PuzzleProgress.objects.create(
                attempt=attempt, puzzle_id=pid, room=room_of(pid), objective=PUZZLE_META[pid]["objective"],
                optional=PUZZLE_META[pid]["optional"], solved=old["solved"], wrong_attempts=old["mistakes"],
                hint_level=old["hint_level"], hint_penalty=old["hint_level"] * 10, points=old["score"],
                solved_at=attempt.last_active if old["solved"] else None,
            )
            for level in range(1, old["hint_level"] + 1):
                HintUsage.objects.create(attempt=attempt, puzzle_id=pid, level=level, penalty=10)
        for old in read("submission"):
            pp = progress.get(old["puzzle_id"])
            if pp:
                submission = PuzzleSubmission.objects.create(attempt=pp.attempt, puzzle_id=pp.puzzle_id,
                                                              answer={}, correct=old["correct"])
                PuzzleSubmission.objects.filter(pk=submission.pk).update(created_at=aware(old["submitted_at"]))
        for old in read("earnedbadge"):
            code = next((code for code, item in ACHIEVEMENTS.items() if item["name"] == old["name"]), None)
            if code:
                UserAchievement.objects.get_or_create(user_id=old["student_id"], code=code)
        for old in read("assessment"):
            attempt = imported.get(old["attempt_id"])
            if attempt:
                topics = json.loads(old["topics"])
                AssessmentResult.objects.create(attempt=attempt, user=attempt.user, kind=old["phase"],
                    score=old["score"], total=len(topics), answers={}, per_objective=topics)
        self.stdout.write(self.style.SUCCESS(f"Imported {len(imported)} attempts. Existing tables were preserved."))
