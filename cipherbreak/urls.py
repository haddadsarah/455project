from django.contrib import admin
from django.contrib.auth import views as auth
from django.urls import path

from academy import views

urlpatterns = [
    path("", views.home, name="home"),
    path("educators/", views.educators, name="educators"),
    path("lab/", views.lab, name="lab"),
    path("accounts/register/", views.register, name="register"),
    path("accounts/login/", auth.LoginView.as_view(), name="login"),
    path("accounts/logout/", auth.LogoutView.as_view(), name="logout"),
    path("dashboard/", views.dashboard, name="dashboard"),
    path("class/join/", views.join, name="join"),
    path("adventure/start/", views.start, name="start"),
    path("adventure/<int:pk>/", views.play, name="play"),
    path("adventure/<int:pk>/navigate/", views.navigate, name="navigate"),
    path("adventure/<int:pk>/answer/", views.answer, name="answer"),
    path("adventure/<int:pk>/hint/", views.hint, name="hint"),
    path("adventure/<int:pk>/tutorial/", views.tutorial, name="tutorial"),
    path("adventure/<int:pk>/notebook/", views.notebook, name="notebook"),
    path("adventure/<int:pk>/results/", views.results, name="results"),
    path("adventure/<int:pk>/explorer/", views.attempt_lab, name="attempt_lab"),
    path("adventure/<int:pk>/<str:phase>-assessment/", views.assessment, name="assessment"),
    path("instructor/", views.instructor, name="instructor"),
    path("instructor/demo/", views.demo, name="demo"),
    path("instructor/class/<int:pk>/", views.classroom, name="classroom"),
    path("instructor/class/<int:pk>/export/<int:assignment_pk>/", views.export, name="export"),
    path("admin/", admin.site.urls),
]
