from django.contrib import admin

from .models import AssessmentResult, Attempt, HintUsage, PuzzleProgress, PuzzleSubmission, RoomProgress, UserAchievement

for m in (Attempt, RoomProgress, PuzzleProgress, PuzzleSubmission, HintUsage, UserAchievement, AssessmentResult):
    admin.site.register(m)
