"""Game, persistence, instructor and security tests."""
import csv
import io
import json

from django.contrib.auth.models import User
from django.test import Client, TestCase
from django.urls import reverse

from accounts.models import InstructorInvite, Profile, TutorialCompletion
from classroom.models import Assignment, Classroom, Membership
from des_engine import ascii_to_hex, decrypt, encrypt
from game import autoplay
from game import puzzles as P
from game import services as S
from game.generator import generate_params
from game.models import AssessmentResult, Attempt, HintUsage, PuzzleProgress, UserAchievement

PW = "a-Strong-pass-455"


def make_user(name, instructor=False):
    u = User.objects.create_user(name, password=PW)
    if instructor:
        Profile.objects.filter(user=u).update(role=Profile.INSTRUCTOR)
        u.refresh_from_db()
    return u


class GeneratorTests(TestCase):
    def test_deterministic_and_varied(self):
        self.assertEqual(generate_params(42), generate_params(42))
        a, b = generate_params(1), generate_params(2)
        self.assertNotEqual((a["code"], a["key"]), (b["code"], b["key"]))

    def test_values_are_valid(self):
        for seed in range(60):
            p = generate_params(seed)
            self.assertEqual(len(p["code"]), 8)
            self.assertTrue(all(32 <= ord(c) < 127 for c in p["code"] + p["exit_code"]))
            self.assertNotEqual(p["code"], p["exit_code"])
            key = bytes.fromhex(p["key"])
            self.assertTrue(all(bin(b).count("1") % 2 == 1 for b in key), "odd parity")
            self.assertIn(p["r3"]["round"], range(1, 17))
            self.assertNotEqual(p["r3"]["group"], p["r3"]["bonus_group"])

    def test_answers_come_from_des_engine(self):
        p = generate_params(7)
        ctx = P.context(p)
        self.assertEqual(ctx["plain_hex"], ascii_to_hex(p["code"]))
        self.assertEqual(ctx["enc"]["output"]["hex"], encrypt(ctx["plain_hex"], p["key"]))
        self.assertEqual(P.build(p, "r1_ascii").answer["hex"], ascii_to_hex(p["code"]))
        self.assertEqual(P.build(p, "r4_code").answer["code"], p["exit_code"])
        self.assertEqual(decrypt(ctx["cipher_exit"], p["key"]), ascii_to_hex(p["exit_code"]))
        rnd = p["r3"]["round"]
        f = P.build(p, "r3_feistel")
        self.assertEqual(f.answer["r"], ctx["enc"]["rounds"][rnd - 1]["r_out"]["hex"])


class PuzzleCheckTests(TestCase):
    def setUp(self):
        self.p = generate_params(99)

    def test_every_puzzle_accepts_its_answer_and_rejects_wrong(self):
        for pid in P.BUILDERS:
            pz = P.build(self.p, pid)
            ok, errors, _, _ = P.check(pz, pz.answer)
            self.assertTrue(ok, pid)
            wrong = autoplay.wrong_answer(pz)
            ok, errors, _, _ = P.check(pz, wrong)
            self.assertFalse(ok, pid)
            self.assertFalse(errors, f"{pid}: wrong answer should be well-formed")

    def test_format_errors_are_explained(self):
        pz = P.build(self.p, "r1_ascii")
        ok, errors, _, fb = P.check(pz, {"hex": "12G4"})
        self.assertFalse(ok)
        self.assertIn("hex digits", fb)
        ok, errors, _, fb = P.check(pz, {"hex": "1234"})
        self.assertIn("exactly 16", fb)

    def test_binary_accepted_for_hex_fields(self):
        pz = P.build(self.p, "r2_split")
        as_bin = {k: format(int(v, 16), "028b") for k, v in pz.answer.items()}
        self.assertTrue(P.check(pz, as_bin)[0])

    def test_shift_diagnosis(self):
        p = dict(self.p, r2=dict(self.p["r2"], shift_round=3))  # round 3 shifts by 2
        pz = P.build(p, "r2_shift")
        c_prev = pz.view["c_prev"]["bin"]
        ans = {"c": c_prev[1:] + c_prev[0], "d": pz.answer["d"]}
        ok, _, _, fb = P.check(pz, ans)
        self.assertFalse(ok)
        self.assertIn("needs a shift of 2", fb)

    def test_answers_not_leaked_before_solving(self):
        for pid in P.BUILDERS:
            pub = P.build(self.p, pid).public(solved=False)
            self.assertNotIn("answer", pub)
            self.assertNotIn("reveal", pub)

    def test_challenge_mode_hides_hex_helper(self):
        self.assertNotIn("hex", P.build(self.p, "r1_ascii", "challenge").view["chars"][0])
        self.assertIn("hex", P.build(self.p, "r1_ascii", "guided").view["chars"][0])


class ProgressionAndScoringTests(TestCase):
    def setUp(self):
        self.u = make_user("alice")
        self.a = S.start_attempt(self.u, mode="challenge", seed=1234)

    def answer(self, pid):
        return P.build(self.a.params, pid, self.a.mode).answer

    def test_rooms_locked_in_order(self):
        with self.assertRaises(S.GameError):
            S.enter_room(self.a, 2)
        with self.assertRaises(S.GameError):
            S.open_puzzle(self.a, "r1_block")  # previous step unsolved
        S.enter_room(self.a, 1)

    def test_scoring_wrong_answers_and_hints(self):
        S.open_puzzle(self.a, "r1_ascii")
        pz = P.build(self.a.params, "r1_ascii", self.a.mode)
        self.assertFalse(S.submit(self.a, "r1_ascii", autoplay.wrong_answer(pz))["correct"])
        h1 = S.hint(self.a, "r1_ascii")
        h2 = S.hint(self.a, "r1_ascii")
        self.assertEqual((h1["penalty"], h2["penalty"]), (10, 20))
        res = S.submit(self.a, "r1_ascii", self.answer("r1_ascii"))
        self.assertTrue(res["correct"])
        self.assertEqual(res["points"], 100 - 10 - 30)
        self.a.refresh_from_db()
        self.assertEqual(self.a.score, 60)

    def test_format_error_costs_nothing(self):
        res = S.submit(self.a, "r1_ascii", {"hex": "xyz"})
        self.assertTrue(res["format_error"])
        self.assertEqual(PuzzleProgress.objects.get(attempt=self.a, puzzle_id="r1_ascii").wrong_attempts, 0)

    def test_score_never_negative(self):
        pz = P.build(self.a.params, "r1_ascii", self.a.mode)
        for _ in range(12):
            S.submit(self.a, "r1_ascii", autoplay.wrong_answer(pz))
        for _ in range(3):
            S.hint(self.a, "r1_ascii")
        self.assertEqual(S.submit(self.a, "r1_ascii", pz.answer)["points"], 0)

    def test_no_duplicate_points(self):
        S.submit(self.a, "r1_ascii", self.answer("r1_ascii"))
        self.a.refresh_from_db()
        before = self.a.score
        again = S.submit(self.a, "r1_ascii", self.answer("r1_ascii"))
        self.assertTrue(again["already_solved"])
        self.a.refresh_from_db()
        self.assertEqual(self.a.score, before)

    def test_hints_are_free_in_guided_mode(self):
        g = S.start_attempt(self.u, mode="guided", seed=5)
        self.assertEqual(S.hint(g, "r1_ascii")["penalty"], 0)
        self.assertEqual(HintUsage.objects.filter(attempt=g).count(), 1)

    def test_three_hint_levels_then_stop(self):
        for lvl in (1, 2, 3):
            self.assertEqual(S.hint(self.a, "r1_ascii")["level"], lvl)
        self.assertTrue(S.hint(self.a, "r1_ascii")["max"])
        self.assertEqual(HintUsage.objects.filter(attempt=self.a).count(), 3)

    def test_full_game_completion_badges_and_bonus(self):
        autoplay.play(self.a, skill=1.0)
        self.a.refresh_from_db()
        self.assertEqual(self.a.status, Attempt.COMPLETED)
        required = sum(len(P.required_puzzles(r)) for r in P.ROOMS)
        self.assertEqual(self.a.score, required * 100 + 100 + 4 * P.ROOM_BONUS)  # + optional bonus S-box
        codes = set(UserAchievement.objects.filter(user=self.u).values_list("code", flat=True))
        self.assertEqual(codes, set(P.ACHIEVEMENTS))
        self.assertEqual(S.state(self.a)["attempt"]["percent"], 100)

    def test_sbox_specialist_requires_no_mistakes(self):
        autoplay.play(self.a, rooms=(1, 2), skill=1.0)
        S.enter_room(self.a, 3)
        for pid in ("r3_expand", "r3_xor", "r3_sbox"):
            S.submit(self.a, pid, self.answer(pid))
        pz = P.build(self.a.params, "r3_sbox_bonus", self.a.mode)
        S.submit(self.a, "r3_sbox_bonus", autoplay.wrong_answer(pz))
        S.submit(self.a, "r3_sbox_bonus", pz.answer)
        self.assertFalse(UserAchievement.objects.filter(user=self.u, code="sbox_specialist").exists())

    def test_bonus_closes_after_permutation_opened(self):
        autoplay.play(self.a, rooms=(1, 2), skill=1.0)
        for pid in ("r3_expand", "r3_xor", "r3_sbox"):
            S.submit(self.a, pid, self.answer(pid))
        S.open_puzzle(self.a, "r3_perm")
        with self.assertRaises(S.GameError):
            S.open_puzzle(self.a, "r3_sbox_bonus")

    def test_completed_attempt_rejects_play(self):
        autoplay.play(self.a, skill=1.0)
        with self.assertRaises(S.GameError):
            S.hint(self.a, "r1_ascii")


class PersistenceTests(TestCase):
    def setUp(self):
        self.u = make_user("bob")
        self.c = Client()
        self.c.login(username="bob", password=PW)

    def start(self, mode="guided"):
        r = self.c.post(reverse("new_adventure"), {"mode": mode})
        self.assertEqual(r.status_code, 302)
        return Attempt.objects.filter(user=self.u).first()

    def api(self, url, body=None):
        if body is None:
            return self.c.get(url)
        return self.c.post(url, json.dumps(body), content_type="application/json")

    def test_progress_survives_logout_login_and_refresh(self):
        a = self.start()
        self.api(f"/api/attempt/{a.id}/room/", {"room": 1})
        self.assertEqual(self.api(f"/api/attempt/{a.id}/collect/", {}).status_code, 200)
        ans = P.build(a.params, "r1_ascii", a.mode).answer
        self.assertTrue(self.api(f"/api/attempt/{a.id}/puzzle/r1_ascii/submit/", {"answer": ans}).json()["correct"])
        self.api(f"/api/attempt/{a.id}/puzzle/r1_block/")
        params_before = a.params
        self.c.post(reverse("logout"))
        self.assertEqual(self.api(f"/api/attempt/{a.id}/state/").status_code, 302)  # login required
        self.c.login(username="bob", password=PW)
        st = self.api(f"/api/attempt/{a.id}/state/").json()
        self.assertEqual(st["attempt"]["position"], {"room": 1, "puzzle": "r1_block"})
        self.assertEqual(st["attempt"]["score"], 100)
        a.refresh_from_db()
        self.assertEqual(a.params, params_before)  # resuming never regenerates puzzles
        r = self.c.get(reverse("resume"))
        self.assertRedirects(r, reverse("play", args=[a.id]))
        self.assertEqual(self.c.get(reverse("play", args=[a.id])).status_code, 200)

    def test_refresh_does_not_duplicate_attempts(self):
        a = self.start()
        for _ in range(3):
            self.c.get(reverse("play", args=[a.id]))
            self.api(f"/api/attempt/{a.id}/state/")
        self.assertEqual(Attempt.objects.filter(user=self.u).count(), 1)

    def test_new_adventure_keeps_history_and_changes_values(self):
        a1 = self.start()
        a2 = self.start()
        a1.refresh_from_db()
        self.assertEqual(a1.status, Attempt.ABANDONED)
        self.assertEqual(Attempt.objects.filter(user=self.u).count(), 2)
        self.assertNotEqual(a1.params["key"], a2.params["key"])
        self.assertNotEqual(a1.params["code"], a2.params["code"])
        self.assertEqual(self.c.get(reverse("results", args=[a1.id])).status_code, 200)

    def test_tutorial_skip_and_replay_saved(self):
        self.api("/api/tutorial/onboarding/", {"skipped": True})
        self.api("/api/tutorial/room1/", {})
        t = {x.tutorial_id: x.skipped for x in TutorialCompletion.objects.filter(user=self.u)}
        self.assertEqual(t, {"onboarding": True, "room1": False})
        a = self.start()
        self.assertIn("onboarding", self.api(f"/api/attempt/{a.id}/state/").json()["tutorials_done"])

    def test_notebook_unlocks_with_concepts(self):
        a = self.start()
        self.api(f"/api/attempt/{a.id}/room/", {"room": 1})
        self.api(f"/api/attempt/{a.id}/collect/", {})
        self.api(f"/api/attempt/{a.id}/puzzle/r1_ascii/")
        self.u.profile.refresh_from_db()
        self.assertIn("hex", self.u.profile.notebook_unlocked)
        self.assertContains(self.c.get(reverse("notebook")), "DES security limitations")

    def test_lab_flags_active_challenge(self):
        a = self.start("challenge")
        r = self.c.get(reverse("lab"))
        self.assertContains(r, "recorded as <b>practice</b>")
        a.refresh_from_db()
        self.assertTrue(a.independent)
        self.c.get(reverse("lab") + "?confirm=1")
        a.refresh_from_db()
        self.assertFalse(a.independent)


class SecurityTests(TestCase):
    def setUp(self):
        self.alice, self.eve = make_user("alice"), make_user("eve")
        self.a = S.start_attempt(self.alice, seed=3)

    def test_password_hashed(self):
        self.assertNotEqual(self.alice.password, PW)
        self.assertTrue(self.alice.password.startswith(("pbkdf2_", "argon2", "bcrypt", "scrypt")))

    def test_pages_require_login(self):
        c = Client()
        for url in [reverse("dashboard"), reverse("play", args=[self.a.id]), f"/api/attempt/{self.a.id}/state/",
                    reverse("instructor_dashboard"), reverse("notebook")]:
            self.assertEqual(c.get(url).status_code, 302, url)

    def test_other_students_attempts_are_404(self):
        c = Client()
        c.login(username="eve", password=PW)
        for url in [reverse("play", args=[self.a.id]), reverse("results", args=[self.a.id]),
                    f"/api/attempt/{self.a.id}/state/", f"/api/attempt/{self.a.id}/puzzle/r1_ascii/"]:
            self.assertEqual(c.get(url).status_code, 404, url)
        r = c.post(f"/api/attempt/{self.a.id}/puzzle/r1_ascii/submit/", "{}", content_type="application/json")
        self.assertEqual(r.status_code, 404)

    def test_student_cannot_open_instructor_pages(self):
        c = Client()
        c.login(username="eve", password=PW)
        self.assertEqual(c.get(reverse("instructor_dashboard")).status_code, 403)
        self.assertEqual(c.get(reverse("instructor_demo")).status_code, 403)

    def test_csrf_enforced_on_api(self):
        c = Client(enforce_csrf_checks=True)
        c.login(username="alice", password=PW)
        r = c.post(f"/api/attempt/{self.a.id}/puzzle/r1_ascii/submit/", "{}", content_type="application/json")
        self.assertEqual(r.status_code, 403)

    def test_instructor_role_requires_invite(self):
        c = Client()
        data = {"username": "mallory", "password1": PW, "password2": PW, "invite_code": "nope", "role": "instructor"}
        c.post(reverse("register_instructor"), data)
        self.assertFalse(User.objects.filter(username="mallory").exists())
        c.post(reverse("register"), dict(data, role="instructor"))  # extra field ignored
        self.assertEqual(User.objects.get(username="mallory").profile.role, Profile.STUDENT)
        InstructorInvite.objects.create(code="GOOD", uses_remaining=1)
        Client().post(reverse("register_instructor"), dict(data, username="prof", invite_code="GOOD"))
        self.assertTrue(User.objects.get(username="prof").profile.is_instructor)
        self.assertEqual(InstructorInvite.objects.get(code="GOOD").uses_remaining, 0)
        Client().post(reverse("register_instructor"), dict(data, username="prof2", invite_code="GOOD"))
        self.assertFalse(User.objects.filter(username="prof2").exists())

    def test_registration_validation(self):
        r = Client().post(reverse("register"), {"username": "x", "password1": "abc", "password2": "abd"})
        self.assertContains(r, "errorlist")
        self.assertFalse(User.objects.filter(username="x").exists())


class InstructorTests(TestCase):
    def setUp(self):
        self.prof = make_user("prof", instructor=True)
        self.other = make_user("prof2", instructor=True)
        self.s1, self.s2 = make_user("s1"), make_user("s2")
        self.room = Classroom.objects.create(name="Sec 1", instructor=self.prof)
        self.assignment = Assignment.objects.create(classroom=self.room, required_mode="challenge")
        self.c = Client()
        self.c.login(username="prof", password=PW)

    def join(self, user):
        c = Client()
        c.login(username=user.username, password=PW)
        c.post(reverse("join_classroom"), {"code": self.room.join_code.lower()})
        return c

    def test_join_and_forced_mode(self):
        c = self.join(self.s1)
        self.assertTrue(Membership.objects.filter(classroom=self.room, student=self.s1).exists())
        c.post(reverse("new_adventure"), {"mode": "guided", "assignment": self.assignment.id})
        self.assertEqual(Attempt.objects.get(user=self.s1).mode, "challenge")

    def test_progress_analytics_and_csv(self):
        self.join(self.s1)
        self.join(self.s2)
        a = S.start_attempt(self.s1, mode="challenge", assignment=self.assignment, seed=11)
        autoplay.play(a, skill=1.0)
        AssessmentResult.objects.create(user=self.s1, attempt=a, kind="pre", score=3, total=7, answers={}, per_objective={"LO1": 1})
        AssessmentResult.objects.create(user=self.s1, attempt=a, kind="post", score=6, total=7, answers={}, per_objective={"LO1": 1})
        r = self.c.get(reverse("classroom_detail", args=[self.room.id]))
        self.assertContains(r, "s1")
        self.assertEqual(r.context["analytics"]["enrolled"], 2)
        self.assertEqual(r.context["analytics"]["completed"], 1)
        self.assertEqual(r.context["analytics"]["completion_rate"], 50)
        csv_resp = self.c.get(reverse("export_csv", args=[self.room.id]))
        rows = list(csv.DictReader(io.StringIO(csv_resp.content.decode())))
        self.assertEqual({row["student_nickname"] for row in rows}, {"s1", "s2"})
        s1 = next(row for row in rows if row["student_nickname"] == "s1")
        self.assertEqual(s1["completion_status"], "completed")
        self.assertEqual((s1["pre_assessment"], s1["post_assessment"], s1["change"]), ("3/7", "6/7", "3"))
        self.assertNotIn("password", csv_resp.content.decode().lower())
        self.assertEqual(self.c.get(reverse("student_detail", args=[self.room.id, self.s1.id])).status_code, 200)

    def test_reports_exclude_work_assigned_to_another_classroom(self):
        self.join(self.s1)
        other_room = Classroom.objects.create(name="Other course", instructor=self.other)
        other_work = Assignment.objects.create(classroom=other_room, title="Other assignment")
        other_attempt = S.start_attempt(self.s1, assignment=other_work, seed=1234)
        autoplay.play(other_attempt, skill=1.0)
        AssessmentResult.objects.create(user=self.s1, attempt=other_attempt, kind="post",
                                        score=7, total=7, answers={}, per_objective={})
        response = self.c.get(reverse("classroom_detail", args=[self.room.id]))
        self.assertEqual(response.context["analytics"]["completed"], 0)
        detail = self.c.get(reverse("student_detail", args=[self.room.id, self.s1.id]))
        self.assertEqual(detail.context["attempts"], [])

    def test_instructors_isolated(self):
        c = Client()
        c.login(username="prof2", password=PW)
        self.assertEqual(c.get(reverse("classroom_detail", args=[self.room.id])).status_code, 404)
        self.assertEqual(c.get(reverse("export_csv", args=[self.room.id])).status_code, 404)

    def test_demo_mode_opens_any_room_with_custom_values(self):
        r = self.c.post(reverse("instructor_demo"), {"code": "LAB4C127", "key": "133457799BBCDFF1",
                                                     "exit_code": "NOVA2026", "room": "3"})
        a = Attempt.objects.get(user=self.prof)
        self.assertEqual(a.mode, "demo")
        self.assertRedirects(r, f"/play/{a.id}/?room=3", fetch_redirect_response=False)
        S.enter_room(a, 4)  # no prerequisites in demo mode
        self.assertEqual(P.build(a.params, "r1_ascii").answer["hex"], "4C41423443313237")
        bad = self.c.post(reverse("instructor_demo"), {"key": "XYZ"})
        self.assertContains(bad, "non-hexadecimal")


class LabAndPageTests(TestCase):
    def test_lab_api(self):
        c = Client()
        r = c.post("/api/des/", json.dumps({"block": "0123456789ABCDEF", "key": "133457799BBCDFF1"}),
                   content_type="application/json")
        self.assertEqual(r.json()["output"]["hex"], "85E813540F0AB405")
        self.assertEqual(len(r.json()["rounds"]), 16)
        r = c.post("/api/des/", json.dumps({"block": "85E813540F0AB405", "key": "133457799BBCDFF1", "mode": "decrypt"}),
                   content_type="application/json")
        self.assertEqual(r.json()["output"]["hex"], "0123456789ABCDEF")
        r = c.post("/api/des/", json.dumps({"block": "0123", "key": "133457799BBCDFF1"}), content_type="application/json")
        self.assertEqual(r.status_code, 400)
        self.assertIn("16", r.json()["error"])

    def test_public_pages(self):
        c = Client()
        for name in ("landing", "how_to_play", "educators", "lab", "login", "register", "register_instructor"):
            self.assertEqual(c.get(reverse(name)).status_code, 200, name)

    def test_student_pages(self):
        make_user("carol")
        c = Client()
        c.login(username="carol", password=PW)
        self.assertContains(c.get(reverse("dashboard")), "Welcome back, carol!")
        r = c.get(reverse("assessment", args=["pre"]))
        self.assertEqual(r.status_code, 200)
        answers = {f"q{i}": "0" for i in range(7)}
        c.post(reverse("assessment", args=["pre"]), answers)
        self.assertEqual(AssessmentResult.objects.get(kind="pre").score, 7)


class ClassroomManagementTests(TestCase):
    def setUp(self):
        self.prof = make_user("prof", instructor=True)
        self.other = make_user("prof2", instructor=True)
        self.s1 = make_user("s1")
        self.room = Classroom.objects.create(name="Sec 1", instructor=self.prof)
        self.assignment = Assignment.objects.create(classroom=self.room)
        Membership.objects.create(classroom=self.room, student=self.s1)
        self.a = S.start_attempt(self.s1, assignment=self.assignment, seed=8)
        self.c = Client()
        self.c.login(username="prof", password=PW)

    def test_edit_classroom_and_regenerate_code(self):
        old = self.room.join_code
        self.c.post(reverse("classroom_edit", args=[self.room.id]), {"name": "Section A", "description": "x", "new_code": "on"})
        self.room.refresh_from_db()
        self.assertEqual(self.room.name, "Section A")
        self.assertNotEqual(self.room.join_code, old)
        self.c.post(reverse("classroom_edit", args=[self.room.id]), {"name": "  "})
        self.room.refresh_from_db()
        self.assertEqual(self.room.name, "Section A")

    def test_remove_student_keeps_history(self):
        r = self.c.post(reverse("remove_student", args=[self.room.id, self.s1.id]))
        self.assertRedirects(r, reverse("classroom_detail", args=[self.room.id]))
        self.assertFalse(Membership.objects.filter(classroom=self.room, student=self.s1).exists())
        self.assertTrue(Attempt.objects.filter(pk=self.a.pk).exists())

    def test_delete_requires_exact_name(self):
        self.c.post(reverse("classroom_delete", args=[self.room.id]), {"confirm_name": "wrong"})
        self.assertTrue(Classroom.objects.filter(pk=self.room.pk).exists())
        r = self.c.post(reverse("classroom_delete", args=[self.room.id]), {"confirm_name": "Sec 1"})
        self.assertRedirects(r, reverse("instructor_dashboard"))
        self.assertFalse(Classroom.objects.filter(pk=self.room.pk).exists())
        self.assertFalse(Membership.objects.filter(student=self.s1).exists())
        self.a.refresh_from_db()  # student's attempt survives, assignment link cleared
        self.assertIsNone(self.a.assignment)

    def test_delete_assignment(self):
        self.c.post(reverse("assignment_delete", args=[self.room.id, self.assignment.id]))
        self.assertFalse(Assignment.objects.filter(pk=self.assignment.pk).exists())

    def test_management_is_post_only_and_owner_only(self):
        self.assertEqual(self.c.get(reverse("classroom_delete", args=[self.room.id])).status_code, 405)
        c = Client()
        c.login(username="prof2", password=PW)
        for name, args, data in [("classroom_edit", [self.room.id], {"name": "hack"}),
                                 ("classroom_delete", [self.room.id], {"confirm_name": "Sec 1"}),
                                 ("remove_student", [self.room.id, self.s1.id], {}),
                                 ("assignment_delete", [self.room.id, self.assignment.id], {})]:
            self.assertEqual(c.post(reverse(name, args=args), data).status_code, 404, name)
        s = Client()
        s.login(username="s1", password=PW)
        self.assertEqual(s.post(reverse("remove_student", args=[self.room.id, self.s1.id])).status_code, 403)
        self.assertTrue(Classroom.objects.filter(pk=self.room.pk, name="Sec 1").exists())
        self.assertTrue(Membership.objects.filter(classroom=self.room).exists())


class PasswordTests(TestCase):
    def test_password_reset_flow(self):
        from django.core import mail
        u = User.objects.create_user("dana", email="dana@example.com", password=PW)
        r = Client().post(reverse("password_reset"), {"email": "dana@example.com"})
        self.assertRedirects(r, reverse("password_reset_done"))
        self.assertEqual(len(mail.outbox), 1)
        link = next(line for line in mail.outbox[0].body.splitlines() if "/accounts/reset/" in line)
        path = link.split("testserver", 1)[1].strip()
        c = Client()
        r = c.get(path, follow=True)  # Django redirects to a session-bound "set-password" URL
        self.assertContains(r, "Choose a new password")
        r = c.post(r.redirect_chain[-1][0], {"new_password1": "Brand-new-pass-77", "new_password2": "Brand-new-pass-77"})
        self.assertRedirects(r, reverse("password_reset_complete"))
        self.assertTrue(Client().login(username="dana", password="Brand-new-pass-77"))
        u.refresh_from_db()
        self.assertFalse(u.check_password(PW))

    def test_unknown_email_reveals_nothing(self):
        from django.core import mail
        r = Client().post(reverse("password_reset"), {"email": "nobody@example.com"})
        self.assertRedirects(r, reverse("password_reset_done"))
        self.assertEqual(len(mail.outbox), 0)

    def test_change_password_when_signed_in(self):
        make_user("erin")
        c = Client()
        c.login(username="erin", password=PW)
        c.post(reverse("password_change"), {"old_password": PW, "new_password1": "Other-pass-9876",
                                            "new_password2": "Other-pass-9876"})
        self.assertTrue(Client().login(username="erin", password="Other-pass-9876"))


class InventoryAndArchiveTests(TestCase):
    """The game world's inventory and archive terminals reveal values only once earned."""

    def setUp(self):
        self.u, self.eve = make_user("ivy"), make_user("eve2")
        self.a = S.start_attempt(self.u, seed=11)
        self.c = Client()
        self.c.login(username="ivy", password=PW)

    def items(self):
        r = self.c.get(f"/api/attempt/{self.a.id}/inventory/")
        self.assertEqual(r.status_code, 200)
        return {i["id"]: i for i in r.json()["items"]}

    def test_inventory_grows_with_progress(self):
        self.assertEqual(set(self.items()), {"codecard"})
        autoplay.play(self.a, rooms=(1,), skill=1.0)
        items = self.items()
        self.assertTrue({"codecard", "block", "halves", "key"} <= set(items))
        self.assertNotIn("subkeys", items)
        block = dict(items["block"]["values"])
        self.assertEqual(len(next(iter(block.values()))), 16)
        autoplay.play(self.a, skill=1.0)
        items = self.items()
        self.assertTrue({"subkeys", "cipher", "exitcipher", "exitcode"} <= set(items))
        self.assertEqual(len(items["subkeys"]["values"]), 16)
        code = dict(items["exitcode"]["values"])
        ctx = P.context(self.a.params)
        self.assertIn(self.a.params["exit_code"], code.values())
        self.assertTrue(ctx)

    def test_archives_locked_until_solved(self):
        for kind in ("keys", "encrypt", "decrypt"):
            self.assertEqual(self.c.get(f"/api/attempt/{self.a.id}/archive/{kind}/").status_code, 400, kind)
        self.assertEqual(self.c.get(f"/api/attempt/{self.a.id}/archive/nope/").status_code, 400)
        autoplay.play(self.a, skill=1.0)
        ks = self.c.get(f"/api/attempt/{self.a.id}/archive/keys/").json()["schedule"]
        self.assertEqual(len(ks["rounds"]), 16)
        enc = self.c.get(f"/api/attempt/{self.a.id}/archive/encrypt/").json()["trace"]
        dec = self.c.get(f"/api/attempt/{self.a.id}/archive/decrypt/").json()["trace"]
        self.assertEqual(len(enc["rounds"]), 16)
        self.assertEqual([r["key_index"] for r in dec["rounds"]], list(range(16, 0, -1)))
        self.assertEqual(encrypt(enc["input"]["hex"], ks["key"]["hex"]), enc["output"]["hex"])

    def test_inventory_and_archive_are_private(self):
        c = Client()
        c.login(username="eve2", password=PW)
        self.assertEqual(c.get(f"/api/attempt/{self.a.id}/inventory/").status_code, 404)
        self.assertEqual(c.get(f"/api/attempt/{self.a.id}/archive/keys/").status_code, 404)

    def test_game_page_loads_world(self):
        r = self.c.get(reverse("play", args=[self.a.id]))
        self.assertEqual(r.status_code, 200)
        for asset in ("js/world.js", "js/machines.js", "js/play.js", "css/game.css", 'id="world"', 'id="title"'):
            self.assertContains(r, asset)
