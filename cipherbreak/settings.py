"""
Django settings for CipherBreak EDU.

Local demonstration defaults. For any real deployment set the environment
variables DJANGO_SECRET_KEY, DJANGO_DEBUG=0 and DJANGO_ALLOWED_HOSTS.
"""
import os
import secrets
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent

DEBUG = os.environ.get("DJANGO_DEBUG", os.environ.get("CIPHERBREAK_DEBUG", "1")) == "1"


def _secret_key():
    env = os.environ.get("DJANGO_SECRET_KEY") or os.environ.get("CIPHERBREAK_SECRET_KEY")
    if env:
        return env
    if not DEBUG:
        raise RuntimeError("Set DJANGO_SECRET_KEY when DJANGO_DEBUG=0")
    # Local development: generate once and keep it out of source control.
    path = BASE_DIR / ".dev_secret_key"
    if not path.exists():
        path.write_text(secrets.token_urlsafe(50))
    return path.read_text().strip()


SECRET_KEY = _secret_key()
ALLOWED_HOSTS = os.environ.get("DJANGO_ALLOWED_HOSTS", os.environ.get("CIPHERBREAK_HOSTS", "localhost,127.0.0.1,testserver")).split(",")

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "accounts",
    "game",
    "lab",
    "classroom",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "cipherbreak.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [BASE_DIR / "templates"],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
                "accounts.context_processors.role",
            ],
        },
    },
]

WSGI_APPLICATION = "cipherbreak.wsgi.application"

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": BASE_DIR / "db.sqlite3",
        # Concurrent game requests: wait for locks instead of failing, use WAL journaling.
        "OPTIONS": {"timeout": 20, "transaction_mode": "IMMEDIATE",
                    "init_command": "PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL;"},
    }
}

AUTHENTICATION_BACKENDS = ["accounts.authentication.LocalDemoBackend"]

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

LANGUAGE_CODE = "en-us"
TIME_ZONE = "Asia/Beirut"
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"
STATICFILES_DIRS = [BASE_DIR / "static"]
STATIC_ROOT = BASE_DIR / "staticfiles"
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

LOGIN_URL = "login"
LOGIN_REDIRECT_URL = "dashboard"
LOGOUT_REDIRECT_URL = "landing"

# Email: for the local demo, password-reset emails are printed in the terminal running the server.
# For a real deployment set EMAIL_BACKEND/EMAIL_HOST etc. via environment variables.
EMAIL_BACKEND = os.environ.get("DJANGO_EMAIL_BACKEND", "django.core.mail.backends.console.EmailBackend" if DEBUG else "django.core.mail.backends.smtp.EmailBackend")
DEFAULT_FROM_EMAIL = os.environ.get("DJANGO_DEFAULT_FROM_EMAIL", "CipherBreak EDU <no-reply@cipherbreak.local>")
EMAIL_HOST = os.environ.get("DJANGO_EMAIL_HOST", "localhost")

SESSION_COOKIE_HTTPONLY = True
CSRF_COOKIE_HTTPONLY = False  # the game's fetch() calls read the token from the page
X_FRAME_OPTIONS = "SAMEORIGIN"  # notebook opens in an in-game iframe
if not DEBUG:
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True
