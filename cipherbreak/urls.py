from django.contrib import admin
from django.contrib.auth import views as auth_views
from django.urls import path

from accounts import views as accounts
from classroom import views as instructor
from game import views as game
from lab import views as lab

urlpatterns = [
    path("", game.landing, name="landing"),
    path("how-to-play/", game.how_to_play, name="how_to_play"),
    path("educators/", game.educators, name="educators"),

    path("accounts/login/", auth_views.LoginView.as_view(template_name="accounts/login.html",
                                                         redirect_authenticated_user=True), name="login"),
    path("accounts/logout/", auth_views.LogoutView.as_view(), name="logout"),
    path("accounts/register/", accounts.register, name="register"),
    path("accounts/password-reset/", auth_views.PasswordResetView.as_view(
        template_name="accounts/password_reset.html", email_template_name="accounts/password_reset_email.txt",
        subject_template_name="accounts/password_reset_subject.txt"), name="password_reset"),
    path("accounts/password-reset/sent/", auth_views.PasswordResetDoneView.as_view(
        template_name="accounts/password_reset_done.html"), name="password_reset_done"),
    path("accounts/reset/<uidb64>/<token>/", auth_views.PasswordResetConfirmView.as_view(
        template_name="accounts/password_reset_confirm.html"), name="password_reset_confirm"),
    path("accounts/reset/done/", auth_views.PasswordResetCompleteView.as_view(
        template_name="accounts/password_reset_complete.html"), name="password_reset_complete"),
    path("accounts/password-change/", auth_views.PasswordChangeView.as_view(
        template_name="accounts/password_change.html", success_url="/dashboard/"), name="password_change"),
    path("accounts/register/instructor/", accounts.register_instructor, name="register_instructor"),

    path("dashboard/", game.dashboard, name="dashboard"),
    path("adventure/new/", game.new_adventure, name="new_adventure"),
    path("adventure/resume/", game.resume, name="resume"),
    path("play/<int:attempt_id>/", game.play, name="play"),
    path("results/<int:attempt_id>/", game.results, name="results"),
    path("notebook/", game.notebook_view, name="notebook"),
    path("assessment/<str:kind>/", game.assessment, name="assessment"),
    path("classrooms/join/", game.join_classroom, name="join_classroom"),

    path("api/attempt/<int:attempt_id>/state/", game.api_state, name="api_state"),
    path("api/attempt/<int:attempt_id>/room/", game.api_enter_room, name="api_enter_room"),
    path("api/attempt/<int:attempt_id>/intro/", game.api_intro_seen, name="api_intro_seen"),
    path("api/attempt/<int:attempt_id>/flag/", game.api_flag, name="api_flag"),
    path("api/attempt/<int:attempt_id>/puzzle/<str:pid>/", game.api_puzzle, name="api_puzzle"),
    path("api/attempt/<int:attempt_id>/puzzle/<str:pid>/submit/", game.api_submit, name="api_submit"),
    path("api/attempt/<int:attempt_id>/puzzle/<str:pid>/hint/", game.api_hint, name="api_hint"),
    path("api/attempt/<int:attempt_id>/collect/", game.api_collect, name="api_collect"),
    path("api/attempt/<int:attempt_id>/inventory/", game.api_inventory, name="api_inventory"),
    path("api/attempt/<int:attempt_id>/archive/<str:kind>/", game.api_archive, name="api_archive"),
    path("api/tutorial/<str:tutorial_id>/", game.api_tutorial, name="api_tutorial"),

    path("lab/", lab.lab, name="lab"),
    path("api/des/", lab.api_des, name="api_des"),

    path("instructor/", instructor.dashboard, name="instructor_dashboard"),
    path("instructor/demo/", instructor.demo, name="instructor_demo"),
    path("instructor/classroom/<int:pk>/", instructor.classroom_detail, name="classroom_detail"),
    path("instructor/classroom/<int:pk>/student/<int:student_id>/", instructor.student_detail, name="student_detail"),
    path("instructor/classroom/<int:pk>/edit/", instructor.classroom_edit, name="classroom_edit"),
    path("instructor/classroom/<int:pk>/delete/", instructor.classroom_delete, name="classroom_delete"),
    path("instructor/classroom/<int:pk>/student/<int:student_id>/remove/", instructor.remove_student,
         name="remove_student"),
    path("instructor/classroom/<int:pk>/assignment/<int:assignment_id>/delete/", instructor.assignment_delete,
         name="assignment_delete"),
    path("instructor/classroom/<int:pk>/export.csv", instructor.export_csv, name="export_csv"),

    path("admin/", admin.site.urls),
]
