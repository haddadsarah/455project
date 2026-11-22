from django import forms
from django.contrib.auth.forms import UserCreationForm
from django.contrib.auth.models import User

from .models import InstructorInvite


class StudentRegistrationForm(UserCreationForm):
    email = forms.EmailField(required=False, help_text="Optional. Needed if you want to reset a forgotten password by email.")

    class Meta:
        model = User
        fields = ("username", "email")
        labels = {"username": "Username or nickname"}

    def clean_email(self):
        email = self.cleaned_data.get("email", "").strip()
        if email and User.objects.filter(email__iexact=email).exists():
            raise forms.ValidationError("An account with this email already exists.")
        return email


class InstructorRegistrationForm(StudentRegistrationForm):
    invite_code = forms.CharField(max_length=40, help_text="Provided by your department administrator.")

    def clean_invite_code(self):
        code = self.cleaned_data["invite_code"].strip()
        invite = InstructorInvite.objects.filter(code=code).first()
        if not invite or not invite.is_usable():
            raise forms.ValidationError("This invitation code is not valid or has already been used.")
        self.invite = invite
        return code
