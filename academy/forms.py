from django import forms
from django.contrib.auth.forms import UserCreationForm

from .models import Assignment, Classroom, Mode


class RegisterForm(UserCreationForm):
    email = forms.EmailField(required=False, help_text="Optional. Classroom reports display your nickname.")

    class Meta(UserCreationForm.Meta):
        fields = ("username", "email")


class ClassroomForm(forms.ModelForm):
    class Meta:
        model = Classroom
        fields = ["name"]
        labels = {"name": "Classroom name"}


class AssignmentForm(forms.ModelForm):
    class Meta:
        model = Assignment
        fields = ["title", "mode"]
        labels = {"title": "Assignment title", "mode": "Required mode"}


class StartForm(forms.Form):
    mode = forms.ChoiceField(choices=Mode.choices, required=False)
    assignment = forms.IntegerField(min_value=1, required=False)
    timed = forms.BooleanField(required=False)
    confirm = forms.BooleanField(required=False)


class AnswerForm(forms.Form):
    code = forms.SlugField(max_length=24)
    answer = forms.CharField(max_length=96)
    request_id = forms.UUIDField()
