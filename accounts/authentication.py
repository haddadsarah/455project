from django.conf import settings
from django.contrib.auth.backends import ModelBackend

from .models import Profile


class LocalDemoBackend(ModelBackend):
    def user_can_authenticate(self, user):
        if not super().user_can_authenticate(user):
            return False
        return settings.DEBUG or not Profile.objects.filter(user=user, is_demo=True).exists()
