"""Create (or reset) fictional demo accounts and classroom data for local demos.

    python manage.py seed_demo            # create demo data if missing
    python manage.py seed_demo --reset    # delete ALL demo users/classrooms and recreate them
    python manage.py seed_demo --remove   # delete demo data only

Only accounts created by this command (Profile.is_demo) are ever deleted.
Simulated students play through the real game rules (game/autoplay.py), so
their scores, hints and mistakes follow the normal scoring code. All names are
fictional. The password comes from CIPHERBREAK_DEMO_PASSWORD; a default is
only allowed when DEBUG is on (local development).
"""
import os
import random

from django.conf import settings
from django.contrib.auth.models import User
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from accounts.models import InstructorInvite, Profile
from classroom.models import Assignment, Classroom, Membership
from game import assessments, autoplay
from game import services as S
from game.models import AssessmentResult, Attempt

INSTRUCTOR = "prof_demo"
STUDENTS = {
    # username: (description, plan)
    "student_demo": ("fresh account for a live demo", None),
    "student_ali": ("completed in Guided mode", {"mode": "guided", "rooms": (1, 2, 3, 4), "skill": .85, "hints": .15, "pre": .45, "post": .9}),
    "student_maya": ("completed in Challenge mode", {"mode": "challenge", "rooms": (1, 2, 3, 4), "skill": .7, "hints": .25, "pre": .3, "post": .8}),
    "student_omar": ("in progress (Rooms 1-2 done)", {"mode": "guided", "rooms": (1, 2), "skill": .6, "hints": .3, "pre": .4}),
    "student_lea": ("joined, not started yet", None),
}
CLASS_CODE = "DEMO55"
INVITE = "AUB-EECE455-DEMO"


class Command(BaseCommand):
    help = "Create, reset or remove fictional demo accounts and classroom data."

    def add_arguments(self, parser):
        parser.add_argument("--reset", action="store_true")
        parser.add_argument("--remove", action="store_true")

    def handle(self, *args, **opts):
        if not settings.DEBUG:
            raise CommandError("Demo accounts are available only in local development.")
        password = os.environ.get("CIPHERBREAK_DEMO_PASSWORD", "cipherbreak-demo-2026")
        if opts["reset"] or opts["remove"]:
            self.remove()
            if opts["remove"]:
                return
        if User.objects.filter(username=INSTRUCTOR).exists():
            self.stdout.write("Demo data already exists. Use --reset to recreate it.")
            return
        with transaction.atomic():
            self.create(password)
        self.stdout.write(self.style.SUCCESS("Demo data created (local development only):"))
        self.stdout.write(f"  Instructor: {INSTRUCTOR} / {password}")
        for name, (desc, _) in STUDENTS.items():
            self.stdout.write(f"  Student:    {name} / {password}   ({desc})")
        self.stdout.write(f"  Classroom join code: {CLASS_CODE}   Instructor invitation code: {INVITE}")

    def remove(self):
        demo_users = User.objects.filter(profile__is_demo=True, username__in=(INSTRUCTOR, *STUDENTS))
        if Membership.objects.filter(classroom__instructor__in=demo_users).exclude(student__in=demo_users).exists():
            raise CommandError("A real account is enrolled in a demo classroom. Its data has been preserved.")
        if Membership.objects.filter(student__in=demo_users).exclude(classroom__instructor__in=demo_users).exists():
            raise CommandError("A demo account is enrolled in another classroom. Its data has been preserved.")
        Classroom.objects.filter(instructor__in=demo_users).delete()
        n = demo_users.count()
        demo_users.delete()
        InstructorInvite.objects.filter(code=INVITE).delete()
        self.stdout.write(f"Removed {n} demo account(s) and their data.")

    def create(self, password):
        InstructorInvite.objects.update_or_create(code=INVITE, defaults={"uses_remaining": 5, "active": True,
                                                                         "note": "Local demo invitation"})
        prof = User.objects.create_user(INSTRUCTOR, email=f"{INSTRUCTOR}@example.com", password=password)
        Profile.objects.filter(user=prof).update(role=Profile.INSTRUCTOR, is_demo=True)
        classroom = Classroom.objects.create(name="EECE 455 — Demo Section", instructor=prof, join_code=CLASS_CODE,
                                             description="Fictional demonstration classroom.")
        assignment = Assignment.objects.create(classroom=classroom, required_mode="any",
                                               instructions="Complete all four rooms, then take the post-assessment.")
        rng = random.Random(455)
        for name, (_desc, plan) in STUDENTS.items():
            user = User.objects.create_user(name, email=f"{name}@example.com", password=password)
            Profile.objects.filter(user=user).update(is_demo=True)
            user.refresh_from_db()
            if name != "student_demo":
                Membership.objects.create(classroom=classroom, student=user)
            if not plan:
                continue
            attempt = S.start_attempt(user, mode=plan["mode"], assignment=assignment, seed=rng.getrandbits(40))
            self.assess(user, "pre", plan["pre"], rng, attempt)
            attempt.intro_seen = True
            attempt.save()
            autoplay.play(attempt, rooms=plan["rooms"], skill=plan["skill"], hint_rate=plan["hints"], rng=rng)
            # Spread simulated active time realistically (about 1.5-3 minutes per challenge).
            attempt.refresh_from_db()
            attempt.active_seconds = int(sum(rng.uniform(90, 180) for _ in attempt.puzzles.all()))
            attempt.save(update_fields=["active_seconds"])
            if "post" in plan:
                self.assess(user, "post", plan["post"], rng, attempt)

    def assess(self, user, kind, p_correct, rng, attempt=None):
        answers = {}
        for i, _q in enumerate(assessments.QUESTIONS[kind]):
            answers[str(i)] = "0" if rng.random() < p_correct else str(rng.randint(1, 3))
        score, total, per = assessments.grade(kind, answers)
        AssessmentResult.objects.create(user=user, kind=kind, attempt=attempt, score=score, total=total,
                                        answers=answers, per_objective=per)
