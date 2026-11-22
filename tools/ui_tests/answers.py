import os, sys, json
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "cipherbreak.settings")
import django; django.setup()
from game.models import Attempt
from game import puzzles as P
a = Attempt.objects.get(pk=int(sys.argv[1]))
out = {}
for pid in P.BUILDERS:
    pz = P.build(a.params, pid, a.mode)
    out[pid] = {"answer": pz.answer, "fields": pz.fields}
print(json.dumps({"rooms": {k: v["puzzles"] for k, v in P.ROOMS.items()}, "p": out, "status": a.status, "score": a.score}))
