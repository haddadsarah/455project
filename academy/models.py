from django.conf import settings
from django.db import models
from django.utils import timezone


class Profile(models.Model):
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    onboarding_seen = models.BooleanField(default=False)


class Classroom(models.Model):
    instructor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="classrooms")
    name = models.CharField(max_length=100)
    code = models.CharField(max_length=12, unique=True, editable=False)

    def __str__(self):
        return self.name


class Membership(models.Model):
    classroom = models.ForeignKey(Classroom, on_delete=models.CASCADE, related_name="memberships")
    student = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    joined_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["classroom", "student"], name="unique_class_membership")]


class Mode(models.TextChoices):
    GUIDED = "guided", "Guided practice"
    CHALLENGE = "challenge", "Independent challenge"


class Assignment(models.Model):
    classroom = models.ForeignKey(Classroom, on_delete=models.CASCADE, related_name="assignments")
    title = models.CharField(max_length=120)
    mode = models.CharField(max_length=12, choices=Mode.choices)

    def __str__(self):
        return self.title


class Attempt(models.Model):
    student = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="attempts")
    assignment = models.ForeignKey(Assignment, null=True, blank=True, on_delete=models.SET_NULL, related_name="attempts")
    mode = models.CharField(max_length=12, choices=Mode.choices)
    seed = models.CharField(max_length=32, unique=True, editable=False)
    generator_version = models.PositiveSmallIntegerField(default=1, editable=False)
    current_room = models.PositiveSmallIntegerField(default=0)  # 0 is the lobby.
    stage = models.CharField(max_length=8, default="intro", choices=[
        ("intro", "Briefing"), ("lobby", "Lobby"), ("room", "Room"), ("clear", "Room cleared"), ("results", "Results"),
    ])
    unlocked_room = models.PositiveSmallIntegerField(default=1)
    score = models.PositiveIntegerField(default=0)
    assisted = models.BooleanField(default=False)
    timed = models.BooleanField(default=False)
    started_at = models.DateTimeField(auto_now_add=True)
    entered_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-updated_at", "-pk"]

    @property
    def rooms_completed(self):
        return self.unlocked_room - 1

    @property
    def percent(self):
        return self.rooms_completed * 25

    @property
    def classification(self):
        if self.mode == Mode.CHALLENGE and self.assisted:
            return "Assisted challenge"
        return self.get_mode_display()

    @property
    def duration(self):
        if self.entered_at is None:
            return 0
        return max(0, int(((self.completed_at or timezone.now()) - self.entered_at).total_seconds()))


class RoomProgress(models.Model):
    attempt = models.ForeignKey(Attempt, on_delete=models.CASCADE, related_name="rooms")
    number = models.PositiveSmallIntegerField()
    tutorial_seen = models.BooleanField(default=False)
    completed = models.BooleanField(default=False)
    score = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["number"]
        constraints = [models.UniqueConstraint(fields=["attempt", "number"], name="unique_attempt_room")]


class PuzzleProgress(models.Model):
    room = models.ForeignKey(RoomProgress, on_delete=models.CASCADE, related_name="puzzles")
    code = models.CharField(max_length=24)
    outcome = models.CharField(max_length=3)
    solved = models.BooleanField(default=False)
    mistakes = models.PositiveIntegerField(default=0)
    hint_level = models.PositiveSmallIntegerField(default=0)
    score = models.PositiveSmallIntegerField(default=0)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["room", "code"], name="unique_room_puzzle")]


class Submission(models.Model):
    puzzle = models.ForeignKey(PuzzleProgress, on_delete=models.CASCADE, related_name="submissions")
    request_id = models.UUIDField(unique=True)
    correct = models.BooleanField()
    submitted_at = models.DateTimeField(auto_now_add=True)


class EarnedBadge(models.Model):
    student = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="earned_badges")
    name = models.CharField(max_length=40)
    awarded_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["student", "name"], name="unique_student_badge")]


class Assessment(models.Model):
    attempt = models.ForeignKey(Attempt, on_delete=models.CASCADE, related_name="assessments")
    phase = models.CharField(max_length=4, choices=[("pre", "Pre-assessment"), ("post", "Post-assessment")])
    topics = models.JSONField()
    score = models.PositiveSmallIntegerField()

    class Meta:
        constraints = [models.UniqueConstraint(fields=["attempt", "phase"], name="unique_attempt_assessment")]
