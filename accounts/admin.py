from django.contrib import admin

from .models import InstructorInvite, Profile, TutorialCompletion

admin.site.register(Profile)
admin.site.register(InstructorInvite)
admin.site.register(TutorialCompletion)
