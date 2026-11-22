from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction


class Command(BaseCommand):
    help = "Grant the Instructors role to an existing, approved account."

    def add_arguments(self, parser):
        parser.add_argument("username")

    @transaction.atomic
    def handle(self, *args, **options):
        user = get_user_model().objects.filter(username=options["username"]).first()
        if user is None:
            raise CommandError("Create the account before granting instructor access.")
        if user.attempts.exists() or user.membership_set.exists():
            raise CommandError("Use a separate instructor account for this user.")
        group, _ = Group.objects.get_or_create(name="Instructors")
        user.groups.add(group)
        self.stdout.write(self.style.SUCCESS(f"Instructor role granted to {user.username}."))
