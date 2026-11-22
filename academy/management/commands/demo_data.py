"""Explicit, local-only fixtures. All scores are produced by normal game logic."""
from secrets import token_urlsafe
from uuid import uuid4

from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

from academy import game
from academy.curriculum import OUTCOMES
from academy.models import Assessment, Assignment, Classroom, Membership, Mode, Profile

ACCOUNTS = ("demo-instructor", "demo-student", "demo-reactor", "demo-graduate")
GROUP_NAME = "Local CipherBreak demo fixtures"


class Command(BaseCommand):
    help = "Create fictional local demo accounts. Use --reset to replace these fixtures and rotate their passwords."

    def add_arguments(self, parser):
        parser.add_argument("--reset", action="store_true")

    @transaction.atomic
    def handle(self, *args, **options):
        if not settings.DEBUG:
            raise CommandError("Demo accounts are available only in local debug mode.")
        users = get_user_model().objects
        demo_group, _ = Group.objects.get_or_create(name=GROUP_NAME)
        existing = users.filter(username__in=ACCOUNTS)
        if existing.exclude(groups=demo_group).exists():
            raise CommandError("A demo username is already used by another account. No data was changed.")
        if existing.exists():
            if not options["reset"]:
                raise CommandError("Demo fixtures already exist. Use --reset to replace them and print new passwords.")
            if Membership.objects.filter(classroom__instructor__in=existing).exclude(student__in=existing).exists():
                raise CommandError("An account outside the demo is enrolled in a demo classroom. Its data was preserved.")
            if Membership.objects.filter(student__in=existing).exclude(classroom__instructor__in=existing).exists():
                raise CommandError("A demo student is enrolled in another classroom. Its data was preserved.")
            existing.delete()

        fixtures = {}
        credentials = []
        for name in ACCOUNTS:
            password = token_urlsafe(15)
            user = users.create_user(username=name, password=password)
            user.groups.add(demo_group)
            fixtures[name] = user
            credentials.append((name, password))
        instructor_group, _ = Group.objects.get_or_create(name="Instructors")
        teacher = fixtures["demo-instructor"]
        teacher.groups.add(instructor_group)

        course = Classroom.objects.create(instructor=teacher, name="EECE 455 · Fictional demonstration", code="DEMO455")
        guided = Assignment.objects.create(classroom=course, title="The 16-Round Escape", mode=Mode.GUIDED)
        challenge = Assignment.objects.create(classroom=course, title="Independent DES practice", mode=Mode.CHALLENGE)
        for name in ACCOUNTS[1:]:
            Membership.objects.create(classroom=course, student=fixtures[name])
        self.seed_playthrough(fixtures["demo-reactor"], guided, 2)
        self.seed_playthrough(fixtures["demo-graduate"], guided, 4)
        self.seed_playthrough(fixtures["demo-graduate"], challenge, 4)

        self.stdout.write(self.style.SUCCESS("Fictional demo classroom ready. Use these credentials on your local instance only."))
        for username, password in credentials:
            self.stdout.write(f"  {username:18} {password}")
        self.stdout.write("  Classroom code: DEMO455")

    @staticmethod
    def seed_playthrough(student, assignment, cleared_rooms):
        attempt = game.create_attempt(student, assignment.mode, assignment)
        Profile.objects.update_or_create(user=student, defaults={"onboarding_seen": True})
        pre_topics = dict(zip(OUTCOMES, (True, False, False, True, False, True, False), strict=True))
        Assessment.objects.create(attempt=attempt, phase="pre", topics=pre_topics, score=sum(pre_topics.values()))
        attempt.entered_at = timezone.now() - timezone.timedelta(minutes=(cleared_rooms + 1) * 2)
        mission = game.mission_for(attempt)
        for number in range(1, cleared_rooms + 1):
            attempt.stage = "room"
            attempt.current_room = number
            attempt.save()
            for index, puzzle in enumerate(mission.rooms[number - 1]):
                if puzzle.optional:
                    continue
                if index == 1 and number in {2, 3}:
                    game.use_hint(attempt, number, puzzle.code, 1)
                    game.submit(attempt, number, puzzle.code, "demo-incorrect", uuid4())
                game.submit(attempt, number, puzzle.code, puzzle.answer, uuid4())
        if attempt.completed_at:
            topics = {code: True for code in OUTCOMES}
            Assessment.objects.create(attempt=attempt, phase="post", topics=topics, score=len(topics))
            attempt.stage = "results"
        else:
            attempt.current_room = cleared_rooms + 1
            attempt.stage = "room"
        attempt.save()
