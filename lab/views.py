"""Independent DES Learning Laboratory (works without any game progress)."""
import json

from django.http import JsonResponse
from django.shortcuts import render
from django.views.decorators.http import require_POST

from des_engine import DESInputError, TEST_VECTORS, des_trace
from des_engine import tables as T
from game.models import Attempt
from game.services import flag_not_independent


def _active_challenge(request):
    if not request.user.is_authenticated:
        return None
    return request.user.attempts.filter(status=Attempt.ACTIVE, mode=Attempt.CHALLENGE, independent=True).first()


def lab(request):
    challenge = _active_challenge(request)
    if challenge and request.GET.get("confirm") != "1":
        # Showing full DES traces during an independent challenge would reveal answers.
        return render(request, "lab/warning.html", {"attempt": challenge, "query": request.GET.urlencode()})
    if challenge:
        flag_not_independent(challenge, "Opened the DES Laboratory during the challenge.")
    demo = request.GET.get("demo") == "1" and request.user.is_authenticated and request.user.profile.is_instructor
    return render(request, "lab/lab.html", {
        "vectors": TEST_VECTORS, "demo": demo,
        "tables": {"IP": T.IP, "IP_INV": T.IP_INV, "E": T.E, "P": T.P, "PC1": T.PC1, "PC2": T.PC2,
                   "SHIFTS": T.SHIFTS, "SBOXES": T.SBOXES},
    })


@require_POST
def api_des(request):
    try:
        body = json.loads(request.body or "{}")
    except ValueError:
        body = {}
    mode = body.get("mode", "encrypt")
    try:
        trace = des_trace(body.get("block"), body.get("key"), decrypt=(mode == "decrypt"))
    except DESInputError as exc:
        return JsonResponse({"error": str(exc)}, status=400)
    return JsonResponse(trace)
