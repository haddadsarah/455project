"""Prepare repeatable local course demonstration with user-provided credentials."""
import os
import sys
from getpass import getpass

from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from academy import game
from academy.management.commands.demo_data import Command as RandomDemo
from academy.models import Assignment, Classroom, Membership, Mode


class Command(BaseCommand):
    help = "Create or refresh the two course demo logins in a local development database."

    def handle(self, *args, **options):
        if not settings.DEBUG:
            raise CommandError("Course demo fixtures require local development settings.")
        accounts = (
            ("demo_student", "student.demo@cipherbreak.local", "CIPHERBREAK_DEMO_STUDENT_PASSWORD"),
            ("demo_professor", "professor.demo@cipherbreak.local", "CIPHERBREAK_DEMO_PROFESSOR_PASSWORD"),
        )
        passwords = []
        for username, _, variable in accounts:
            password = os.environ.get(variable)
            if not password and sys.stdin.isatty():
                password = getpass(f"Local password for {username}: ")
            if not password:
                raise CommandError(f"Set {variable} or run this command in an interactive terminal.")
            passwords.append(password)
        self.seed(accounts, passwords)
        self.stdout.write(self.style.SUCCESS("Local course accounts are ready. Classroom join code: COURSE455"))

    @staticmethod
    @transaction.atomic
    def seed(accounts, passwords):
        fixtures, _ = Group.objects.get_or_create(name="Local EECE 455 course fixtures")
        instructors, _ = Group.objects.get_or_create(name="Instructors")
        accounts_model = get_user_model()
        students = []
        for (username, email, _), password in zip(accounts, passwords, strict=True):
            user = accounts_model.objects.filter(username=username).first()
            if user and not user.groups.filter(pk=fixtures.pk).exists():
                raise CommandError(f"The username {username} belongs to an existing account.")
            if user is None:
                user = accounts_model(username=username, email=email)
            user.set_password(password)
            user.save()
            user.groups.add(fixtures)
            students.append(user)
        student, professor = students
        professor.groups.add(instructors)
        course, _ = Classroom.objects.get_or_create(
            code="COURSE455", defaults={"instructor": professor, "name": "EECE 455 · Local course demonstration"},
        )
        if course.instructor_id != professor.pk:
            raise CommandError("The course demo join code is in use by another classroom.")
        assignment, _ = Assignment.objects.get_or_create(
            classroom=course, title="The 16-Round Escape · Course demo", defaults={"mode": Mode.GUIDED},
        )
        Membership.objects.get_or_create(classroom=course, student=student)
        if not student.attempts.filter(assignment=assignment).exists():
            RandomDemo.seed_playthrough(student, assignment, 4)
        if not student.attempts.filter(completed_at__isnull=True).exists():
            game.create_attempt(student, Mode.GUIDED, assignment)
