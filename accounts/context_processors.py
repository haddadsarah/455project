def role(request):
    user = getattr(request, "user", None)
    is_instructor = bool(user and user.is_authenticated and hasattr(user, "profile") and user.profile.is_instructor)
    return {"is_instructor": is_instructor}
