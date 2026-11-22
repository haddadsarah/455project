"""Play an attempt through the real game rules (used by tests and seed_demo).

Simulated players submit through ``services.submit`` exactly like the browser,
so every recorded score, hint and mistake follows the normal rules."""
import random

from . import puzzles as P
from . import services as S


def wrong_answer(pz):
    ans = dict(pz.answer)
    spec = pz.fields[0]
    name = spec["name"]
    if spec["kind"] == "choice":
        ans[name] = next(o["value"] for o in spec["options"] if o["value"] != ans[name])
    elif spec["kind"] == "bin":
        ans[name] = ("1" if ans[name][0] == "0" else "0") + ans[name][1:]
    elif spec["kind"] == "hex":
        ans[name] = ("1" if ans[name][0] != "1" else "2") + ans[name][1:]
    elif spec["kind"] == "int":
        ans[name] = str(int(ans[name]) + 1)
    elif spec["kind"] == "order":
        ans[name] = ",".join(str(i) for i in range(1, 17))
    else:
        ans[name] = ans[name][::-1] + "x"
    return ans


def play(attempt, rooms=(1, 2, 3, 4), skill=1.0, hint_rate=0.0, rng=None, bonus=True):
    """skill = probability of answering correctly on each try."""
    rng = rng or random.Random(attempt.seed)
    for room in rooms:
        S.enter_room(attempt, room)
        for pid in P.ROOMS[room]["puzzles"]:
            if pid == "r3_sbox_bonus" and not bonus:
                continue
            attempt.refresh_from_db()
            S.open_puzzle(attempt, pid)
            pz = P.build(attempt.params, pid, attempt.mode)
            while rng.random() < hint_rate:
                if S.hint(attempt, pid).get("max"):
                    break
            tries = 0
            while rng.random() > skill and tries < 4:
                S.submit(attempt, pid, wrong_answer(pz))
                tries += 1
            res = S.submit(attempt, pid, pz.answer)
            assert res["correct"], (pid, res)
        attempt.refresh_from_db()
    return attempt
