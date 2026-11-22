from django.contrib import messages
from django.contrib.auth import login
from django.db import transaction
from django.db.models import F
from django.shortcuts import redirect, render

from .forms import InstructorRegistrationForm, StudentRegistrationForm
from .models import InstructorInvite, Profile


def register(request):
    if request.user.is_authenticated:
        return redirect("dashboard")
    form = StudentRegistrationForm(request.POST or None)
    if request.method == "POST" and form.is_valid():
        user = form.save()
        login(request, user)
        messages.success(request, f"Welcome to CipherBreak EDU, {user.username}!")
        return redirect("dashboard")
    return render(request, "accounts/register.html", {"form": form, "instructor": False})


def register_instructor(request):
    """Instructor role is granted ONLY through a valid invitation code checked on the server."""
    if request.user.is_authenticated:
        return redirect("dashboard")
    form = InstructorRegistrationForm(request.POST or None)
    if request.method == "POST" and form.is_valid():
        with transaction.atomic():
            user = form.save()
            Profile.objects.filter(user=user).update(role=Profile.INSTRUCTOR)
            InstructorInvite.objects.filter(pk=form.invite.pk).update(uses_remaining=F("uses_remaining") - 1)
        login(request, user)
        messages.success(request, "Instructor account created.")
        return redirect("instructor_dashboard")
    return render(request, "accounts/register.html", {"form": form, "instructor": True})
