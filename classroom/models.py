"""Classrooms, memberships and assignments for instructors."""
import secrets

from django.conf import settings
from django.db import models

JOIN_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"


def new_join_code():
    return "".join(secrets.choice(JOIN_ALPHABET) for _ in range(6))


class Classroom(models.Model):
    MODE_CHOICES = [("any", "Student's choice"), ("guided", "Guided"), ("challenge", "Challenge")]
    name = models.CharField(max_length=100)
    instructor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="classrooms")
    join_code = models.CharField(max_length=8, unique=True, default=new_join_code)
    description = models.CharField(max_length=300, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.name


class Membership(models.Model):
    classroom = models.ForeignKey(Classroom, on_delete=models.CASCADE, related_name="memberships")
    student = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="memberships")
    joined_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = [("classroom", "student")]


class Assignment(models.Model):
    classroom = models.ForeignKey(Classroom, on_delete=models.CASCADE, related_name="assignments")
    title = models.CharField(max_length=120, default="CipherBreak: The 16-Round Escape")
    required_mode = models.CharField(max_length=10, choices=Classroom.MODE_CHOICES, default="any")
    instructions = models.CharField(max_length=400, blank=True)
    due_date = models.DateField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.title} ({self.classroom})"
