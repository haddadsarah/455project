"""Game persistence: attempts, room/puzzle progress, submissions, hints,
achievements and assessments. All scoring is decided server-side."""
from django.conf import settings
from django.db import models
from django.utils import timezone


class Attempt(models.Model):
    GUIDED, CHALLENGE, DEMO = "guided", "challenge", "demo"
    MODE_CHOICES = [(GUIDED, "Guided"), (CHALLENGE, "Challenge"), (DEMO, "Instructor demo")]
    ACTIVE, COMPLETED, ABANDONED = "active", "completed", "abandoned"
    STATUS_CHOICES = [(ACTIVE, "Active"), (COMPLETED, "Completed"), (ABANDONED, "Abandoned")]

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="attempts")
    assignment = models.ForeignKey("classroom.Assignment", null=True, blank=True,
                                   on_delete=models.SET_NULL, related_name="attempts")
    mode = models.CharField(max_length=10, choices=MODE_CHOICES, default=GUIDED)
    timed = models.BooleanField(default=False)
    seed = models.BigIntegerField()
    # Everything needed to rebuild this attempt's puzzles (stable on resume).
    params = models.JSONField()
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default=ACTIVE)
    independent = models.BooleanField(default=True,
                                      help_text="False if answers were revealed elsewhere during a challenge")
    integrity_note = models.CharField(max_length=200, blank=True)
    intro_seen = models.BooleanField(default=False)
    access_card_collected = models.BooleanField(default=False)
    position = models.JSONField(default=dict, blank=True)  # {"room": 0..4, "puzzle": id}
    score = models.IntegerField(default=0)
    active_seconds = models.PositiveIntegerField(default=0)
    started_at = models.DateTimeField(auto_now_add=True)
    last_active = models.DateTimeField(default=timezone.now)
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-started_at"]

    def touch(self):
        """Accumulate active play time (gaps over 2 minutes count as 2 minutes)."""
        now = timezone.now()
        gap = (now - self.last_active).total_seconds()
        self.active_seconds += int(max(0, min(gap, 120)))
        self.last_active = now

    @property
    def is_graded(self):
        return self.mode == self.CHALLENGE and self.independent

    @property
    def label(self):
        if self.mode == self.GUIDED:
            return "Guided practice"
        if self.mode == self.DEMO:
            return "Instructor demonstration"
        return "Independent challenge" if self.independent else "Challenge (answers viewed, not independent)"

    def __str__(self):
        return f"Attempt {self.pk} by {self.user} ({self.mode}, {self.status})"


class RoomProgress(models.Model):
    attempt = models.ForeignKey(Attempt, on_delete=models.CASCADE, related_name="rooms")
    room = models.PositiveSmallIntegerField()
    entered_at = models.DateTimeField(auto_now_add=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    bonus_points = models.IntegerField(default=0)

    class Meta:
        unique_together = [("attempt", "room")]


class PuzzleProgress(models.Model):
    attempt = models.ForeignKey(Attempt, on_delete=models.CASCADE, related_name="puzzles")
    puzzle_id = models.CharField(max_length=30)
    room = models.PositiveSmallIntegerField()
    objective = models.CharField(max_length=4)  # LO1..LO7
    optional = models.BooleanField(default=False)
    solved = models.BooleanField(default=False)
    wrong_attempts = models.PositiveIntegerField(default=0)
    hint_level = models.PositiveSmallIntegerField(default=0)
    hint_penalty = models.PositiveIntegerField(default=0)
    points = models.IntegerField(default=0)
    first_viewed = models.DateTimeField(auto_now_add=True)
    solved_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        unique_together = [("attempt", "puzzle_id")]


class PuzzleSubmission(models.Model):
    attempt = models.ForeignKey(Attempt, on_delete=models.CASCADE, related_name="submissions")
    puzzle_id = models.CharField(max_length=30)
    answer = models.JSONField()
    correct = models.BooleanField()
    created_at = models.DateTimeField(auto_now_add=True)


class HintUsage(models.Model):
    attempt = models.ForeignKey(Attempt, on_delete=models.CASCADE, related_name="hints")
    puzzle_id = models.CharField(max_length=30)
    level = models.PositiveSmallIntegerField()
    penalty = models.PositiveIntegerField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = [("attempt", "puzzle_id", "level")]


class UserAchievement(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="achievements")
    code = models.CharField(max_length=30)
    attempt = models.ForeignKey(Attempt, null=True, on_delete=models.SET_NULL)
    earned_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = [("user", "code")]


class AssessmentResult(models.Model):
    PRE, POST = "pre", "post"
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="assessments")
    kind = models.CharField(max_length=4, choices=[(PRE, "Pre-assessment"), (POST, "Post-assessment")])
    attempt = models.ForeignKey(Attempt, null=True, blank=True, on_delete=models.SET_NULL)
    score = models.PositiveSmallIntegerField()
    total = models.PositiveSmallIntegerField()
    answers = models.JSONField()
    per_objective = models.JSONField()  # {"LO1": 1 or 0, ...}
    taken_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-taken_at"]
