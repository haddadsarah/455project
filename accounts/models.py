"""Accounts: roles, instructor invitations, tutorial completion."""
from django.conf import settings
from django.db import models


class Profile(models.Model):
    STUDENT = "student"
    INSTRUCTOR = "instructor"
    ROLE_CHOICES = [(STUDENT, "Student"), (INSTRUCTOR, "Instructor")]

    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="profile")
    role = models.CharField(max_length=12, choices=ROLE_CHOICES, default=STUDENT)
    # Notebook pages the student has "discovered" in the game (all pages stay readable).
    notebook_unlocked = models.JSONField(default=list, blank=True)
    is_demo = models.BooleanField(default=False, help_text="Created by the seed_demo command")
    created_at = models.DateTimeField(auto_now_add=True)

    @property
    def is_instructor(self):
        return self.role == self.INSTRUCTOR

    def unlock_notebook(self, keys):
        changed = False
        for k in keys:
            if k not in self.notebook_unlocked:
                self.notebook_unlocked.append(k)
                changed = True
        if changed:
            self.save(update_fields=["notebook_unlocked"])

    def __str__(self):
        return f"{self.user.username} ({self.role})"


class InstructorInvite(models.Model):
    """Instructor accounts can only be created with a valid invitation code.

    Codes are created by an administrator (Django admin) or by seed_demo.
    """
    code = models.CharField(max_length=40, unique=True)
    note = models.CharField(max_length=120, blank=True)
    uses_remaining = models.PositiveIntegerField(default=1)
    active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def is_usable(self):
        return self.active and self.uses_remaining > 0

    def __str__(self):
        return f"{self.code} ({self.uses_remaining} uses left)"


class TutorialCompletion(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="tutorials")
    tutorial_id = models.CharField(max_length=40)
    completed_at = models.DateTimeField(auto_now=True)
    skipped = models.BooleanField(default=False)

    class Meta:
        unique_together = [("user", "tutorial_id")]
