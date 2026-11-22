import csv
import io
from unittest.mock import patch
from uuid import uuid4

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import Client, SimpleTestCase, TestCase, override_settings
from django.urls import reverse

from . import des, game, lessons
from .curriculum import ASSESSMENTS, OUTCOMES
from .models import Assessment, Assignment, Attempt, Classroom, Membership, Mode
from .puzzles import build_mission, build_mission_v2

BLOCK = "0123456789ABCDEF"
KEY = "133457799BBCDFF1"
CIPHER = "85E813540F0AB405"
PASSWORD = "m0onstone-drift-a73"


class DESTests(SimpleTestCase):
    def test_published_known_answer_vectors_and_round_trip(self):
        vectors = [
            (BLOCK, KEY, CIPHER),
            ("0000000000000000", "0000000000000000", "8CA64DE9C1B123A7"),
            ("FFFFFFFFFFFFFFFF", "FFFFFFFFFFFFFFFF", "7359B2163E4EDC58"),
            ("0000000000000000", "0101010101010101", "8CA64DE9C1B123A7"),
        ]
        for block, key, cipher in vectors:
            with self.subTest(block=block, key=key):
                self.assertEqual(des.encrypt(block, key), cipher)
                self.assertEqual(des.decrypt(cipher, key), block)

    def test_key_schedule_and_all_sixteen_keys(self):
        schedule = des.key_schedule(KEY)
        self.assertEqual((schedule["pc1"], schedule["c0"], schedule["d0"]),
                         ("F0CCAAF556678F", "F0CCAAF", "556678F"))
        expected_keys = """
            1B02EFFC7072 79AED9DBC9E5 55FC8A42CF99 72ADD6DB351D
            7CEC07EB53A8 63A53E507B2F EC84B7F618BC F78A3AC13BFB
            E0DBEBEDE781 B1F347BA464F 215FD3DED386 7571F59467E9
            97C5D1FABA41 5F43B7F2E73A BF918D3D3F0A CB3D8B0E17F5
        """.split()
        self.assertEqual([r["subkey"] for r in schedule["rounds"]], expected_keys)
        self.assertEqual([r["shift"] for r in schedule["rounds"]], list(des.SHIFTS))
        self.assertEqual((schedule["rounds"][0]["c"], schedule["rounds"][0]["d"]), ("E19955F", "AACCF1E"))

    def test_intermediate_values_and_decryption_order(self):
        trace = des.trace_des(BLOCK, KEY)
        self.assertEqual(trace["ip"], "CC00CCFFF0AAF0AA")
        self.assertEqual((trace["l0"], trace["r0"]), ("CC00CCFF", "F0AAF0AA"))
        first = trace["rounds"][0]
        self.assertEqual(first["expanded"], "7A15557A1555")
        self.assertEqual(first["mixed"], "6117BA866527")
        self.assertEqual(first["substituted"], "5C82B597")
        self.assertEqual(first["permuted"], "234AA9BB")
        self.assertEqual(first["r_out"], "EF4A6544")
        self.assertEqual(first["sboxes"][0]["input"], "011000")
        self.assertEqual(first["sboxes"][0]["row"], 0)
        self.assertEqual(first["sboxes"][0]["column"], 12)
        self.assertEqual(first["sboxes"][0]["output"], "0101")
        self.assertEqual(trace["preoutput"], "0A4CD99543423234")
        inverse = des.trace_des(CIPHER, KEY, decrypt=True)
        self.assertEqual([r["key_number"] for r in inverse["rounds"]], list(range(16, 0, -1)))
        self.assertEqual([r["key"] for r in inverse["rounds"]], [r["key"] for r in reversed(trace["rounds"])])
        self.assertEqual(inverse["output"], BLOCK)

    def test_invalid_and_leading_zero_inputs(self):
        for invalid in ("", "0", BLOCK + "0", BLOCK + "\n", BLOCK[:-1] + "G", " " * 16, None):
            with self.subTest(invalid=invalid):
                with self.assertRaises(ValueError):
                    des.encrypt(invalid, KEY)
                with self.assertRaises(ValueError):
                    des.encrypt(BLOCK, invalid)
        self.assertEqual(des.trace_des("000000000000000a", KEY)["input"], "000000000000000A")

    def test_mission_generator_is_reproducible_and_solves_many_seeds(self):
        self.assertEqual(build_mission("fixed"), build_mission("fixed"))
        codes = set()
        for seed in map(str, range(80)):
            mission = build_mission(seed)
            codes.add(mission.message)
            self.assertEqual(mission.decryption["output"], mission.encryption["input"])
            self.assertEqual(bytes.fromhex(mission.decryption["output"]).decode(), mission.message)
            self.assertTrue(all(int(byte, 16).bit_count() % 2 for byte in
                                (mission.encryption["key"][i:i + 2] for i in range(0, 16, 2))))
            for room in mission.rooms:
                for puzzle in room:
                    self.assertTrue(puzzle.check(puzzle.answer))
        self.assertEqual(len(codes), 80)


class ApplicationFlowTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.student = get_user_model().objects.create_user("learner", password=PASSWORD)
        cls.other = get_user_model().objects.create_user("another-learner", password=PASSWORD)
        instructors = Group.objects.create(name="Instructors")
        cls.teacher = get_user_model().objects.create_user("teacher", password=PASSWORD)
        cls.other_teacher = get_user_model().objects.create_user("other-teacher", password=PASSWORD)
        cls.teacher.groups.add(instructors)
        cls.other_teacher.groups.add(instructors)

    def setUp(self):
        self.client.force_login(self.student)

    def start(self, mode=Mode.GUIDED, **extra):
        response = self.client.post(reverse("start"), {"mode": mode, **extra})
        self.assertEqual(response.status_code, 302)
        attempt = self.student.attempts.first()
        return attempt.pk

    def navigation(self, pk, action, **extra):
        return self.client.post(reverse("navigate", args=[pk]), {"action": action, **extra})

    def submit(self, pk, puzzle, answer=None, request_id=None):
        attempt = Attempt.objects.get(pk=pk)
        room = attempt.rooms.get(number=attempt.current_room)
        progress = room.puzzles.get(code=puzzle.code)
        tutorial = reverse("tutorial", args=[pk])
        if room.number == 1 and not room.clue_collected:
            self.client.post(tutorial, {"kind": "collected"})
        if attempt.mode == Mode.GUIDED and progress.lesson_stage < 3 and not progress.solved:
            for action in ("learn", "demonstrate", "practice"):
                self.client.post(tutorial, {"kind": "lesson", "code": puzzle.code,
                                            "action": action, "answer": lessons.practice_answer(puzzle)})
        data = {"code": puzzle.code, "answer": puzzle.answer if answer is None else answer,
                "request_id": request_id or uuid4()}
        if puzzle.widget == "sbox":
            data["sbox_row"], data["sbox_col"] = data["answer"].split(",")
        return self.client.post(reverse("answer", args=[pk]), data, follow=True)

    def finish_room(self, pk, mission, number):
        self.assertEqual(self.navigation(pk, "enter", room=number).status_code, 302)
        for puzzle in mission.rooms[number - 1]:
            if puzzle.optional:
                continue
            self.assertContains(self.client.get(reverse("play", args=[pk])), puzzle.title)
            response = self.submit(pk, puzzle)
            self.assertContains(response, puzzle.feedback, html=False)
        self.assertEqual(Attempt.objects.get(pk=pk).rooms_completed, number)

    def test_register_sign_in_sign_out_persists_hashed_account(self):
        self.client.logout()
        response = self.client.post(reverse("register"), {
            "username": "new-learner", "email": "learner@example.test", "password1": PASSWORD, "password2": PASSWORD,
        })
        self.assertRedirects(response, reverse("dashboard"))
        user = get_user_model().objects.get(username="new-learner")
        self.assertEqual(user.email, "learner@example.test")
        self.assertNotEqual(user.password, PASSWORD)
        self.assertTrue(user.check_password(PASSWORD))
        self.assertEqual(self.client.get(reverse("logout")).status_code, 405)
        self.assertRedirects(self.client.post(reverse("logout")), reverse("home"))
        self.assertRedirects(self.client.post(reverse("login"), {"username": user.username, "password": PASSWORD}), reverse("dashboard"))

    def test_all_rooms_tutorials_hints_retries_badges_and_assessments(self):
        pk = self.start()
        attempt = Attempt.objects.get(pk=pk)
        url = reverse("play", args=[pk])
        pre = {code: question[2] for code, question in zip(OUTCOMES, ASSESSMENTS["pre"], strict=True)}
        self.assertContains(self.client.get(url), "Mission briefing")
        self.assertEqual(self.client.post(reverse("assessment", args=[pk, "pre"]), pre).status_code, 302)
        self.assertEqual(self.navigation(pk, "briefed").status_code, 302)
        self.assertContains(self.client.get(url), 'data-auto="onboarding"')
        self.assertEqual(self.client.post(reverse("tutorial", args=[pk]), {"kind": "onboarding"}).status_code, 204)
        self.assertContains(self.client.get(url), 'data-auto=""')
        self.assertEqual(self.navigation(pk, "enter", room=2).status_code, 403)
        mission = game.mission_for(attempt)
        self.navigation(pk, "enter", room=1)
        self.assertContains(self.client.get(url), 'data-auto="room"')
        self.assertEqual(self.client.post(reverse("tutorial", args=[pk]), {"kind": "room"}).status_code, 204)
        self.assertContains(self.client.get(url), "Try tutorial example")
        self.assertContains(self.client.get(url), 'data-auto=""')
        self.assertNotContains(self.client.get(reverse("notebook", args=[pk])), "P permutation and Feistel update")
        puzzle = mission.rooms[0][0]
        hint_url = reverse("hint", args=[pk])
        for level in (1, 1, 2, 3):
            response = self.client.post(hint_url, {"code": puzzle.code, "level": level}, follow=True)
            self.assertEqual(response.status_code, 200)
        self.assertContains(response, puzzle.hints[2])
        request_id = uuid4()
        self.assertContains(self.submit(pk, puzzle, "DEAD", request_id), "Not quite")
        self.assertNotContains(self.submit(pk, puzzle, "DEAD", request_id), "Not quite")
        correct_id = uuid4()
        self.assertContains(self.submit(pk, puzzle, request_id=correct_id), "Access block verified")
        self.submit(pk, puzzle, request_id=correct_id)
        attempt.refresh_from_db()
        self.assertEqual(attempt.score, 60)
        for step in mission.rooms[0][1:]:
            self.submit(pk, step)
        for room in (2, 3):
            self.finish_room(pk, mission, room)
        optional = mission.rooms[2][-1]
        self.assertContains(self.client.get(url, {"puzzle": optional.code}), optional.title)
        self.assertContains(self.submit(pk, optional), "+110 pts")
        self.finish_room(pk, mission, 4)
        self.assertContains(self.client.get(url), "Open the exit")
        self.navigation(pk, "results")
        self.assertContains(self.client.get(url, follow=True), "the Cipher Lab!")
        attempt.refresh_from_db()
        self.assertEqual(attempt.percent, 100)
        self.assertEqual(attempt.score, 21 * 110 - 50 + 4 * 50)
        self.assertEqual(self.student.earned_badges.count(), 6)
        self.assertContains(self.client.get(reverse("notebook", args=[pk])), "Security limitations")
        post = {code: question[2] for code, question in zip(OUTCOMES, ASSESSMENTS["post"], strict=True)}
        post_url = reverse("assessment", args=[pk, "post"])
        self.assertContains(self.client.post(post_url, post, follow=True), "7 / 7")
        self.assertEqual(Assessment.objects.filter(attempt=attempt).count(), 2)
        self.assertContains(self.client.get(reverse("results", args=[pk])), "Change: +0 of 7")

    def test_refresh_relogin_previous_attempts_and_permissions(self):
        pk = self.start(Mode.CHALLENGE, timed="1")
        original = Attempt.objects.get(pk=pk)
        self.navigation(pk, "briefed")
        self.navigation(pk, "enter", room=1)
        puzzle = game.mission_for(original).rooms[0][0]
        self.submit(pk, puzzle)
        self.client.logout()
        self.client.login(username=self.student.username, password=PASSWORD)
        response = self.client.get(reverse("play", args=[pk]))
        self.assertContains(response, "Check the block width")
        self.assertContains(response, 'data-elapsed=')
        self.assertEqual(game.mission_for(Attempt.objects.get(pk=pk)), game.mission_for(original))
        self.assertContains(self.client.post(reverse("start"), {"mode": Mode.GUIDED}), "Start another adventure?")
        new_pk = self.start(confirm="1")
        self.assertNotEqual(new_pk, pk)
        self.assertNotEqual(game.mission_for(Attempt.objects.get(pk=new_pk)).message, game.mission_for(original).message)
        self.assertEqual(Attempt.objects.filter(student=self.student).count(), 2)
        self.client.force_login(self.other)
        for page in ("play", "results", "attempt_lab", "notebook"):
            self.assertEqual(self.client.get(reverse(page, args=[pk])).status_code, 404)
        self.assertEqual(self.client.get(reverse("instructor")).status_code, 302)
        self.assertEqual(Client().get(reverse("play", args=[pk])).status_code, 302)

    def test_lab_validates_and_marks_a_matching_challenge_as_assisted(self):
        self.assertContains(self.client.get(reverse("lab")), CIPHER)
        self.assertContains(self.client.post(reverse("lab"), {}), "Enter exactly 16 hexadecimal digits", count=2)
        invalid = self.client.post(reverse("lab"), {"block": "bad", "key": KEY})
        self.assertContains(invalid, "Enter exactly 16 hexadecimal digits")
        self.assertNotContains(invalid, "Block trace")
        pk = self.start(Mode.CHALLENGE)
        url = reverse("attempt_lab", args=[pk])
        self.assertContains(self.client.get(url), "Reveal the mission trace?")
        attempt = Attempt.objects.get(pk=pk)
        self.assertFalse(attempt.assisted)
        mission = game.mission_for(attempt)
        self.assertContains(self.client.post(reverse("lab"), {"block": mission.encryption["input"], "key": mission.encryption["key"]}),
                            mission.encryption["output"])
        attempt.refresh_from_db()
        self.assertTrue(attempt.assisted)
        self.assertContains(self.client.get(url, {"direction": "decrypt"}), mission.encryption["input"])
        second = self.start(Mode.CHALLENGE, confirm="1")
        self.assertContains(self.client.post(reverse("attempt_lab", args=[second]), follow=True), "Block trace")
        self.assertTrue(Attempt.objects.get(pk=second).assisted)

    def test_classroom_assignment_reports_csv_and_demo_isolation(self):
        self.client.force_login(self.teacher)
        response = self.client.post(reverse("instructor"), {"name": "Cryptography Studio"}, follow=True)
        course = Classroom.objects.get(instructor=self.teacher)
        self.assertContains(response, course.code)
        page = reverse("classroom", args=[course.pk])
        self.assertContains(self.client.post(page, {"title": "=RESERVED()", "mode": Mode.CHALLENGE}, follow=True), "Export results CSV")
        assignment = Assignment.objects.get(classroom=course)
        demo_url = reverse("demo")
        self.assertContains(self.client.get(demo_url, {"room": "4"}), "DECRYPTION COMPLETE")
        self.client.force_login(self.student)
        self.assertEqual(self.client.get(demo_url).status_code, 302)
        self.assertEqual(self.client.post(reverse("start"), {"assignment": assignment.pk}).status_code, 404)
        self.assertContains(self.client.post(reverse("join"), {"code": course.code.lower()}, follow=True), "Joined Cryptography Studio")
        pk = self.start(Mode.GUIDED, assignment=assignment.pk)
        attempt = Attempt.objects.get(pk=pk)
        self.assertEqual(attempt.mode, Mode.CHALLENGE)
        self.client.post(reverse("attempt_lab", args=[pk]))
        self.client.force_login(self.teacher)
        self.assertContains(self.client.get(page), "Assisted challenge")
        export = reverse("export", args=[course.pk, assignment.pk])
        rows = list(csv.DictReader(io.StringIO(self.client.get(export).content.decode())))
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["Nickname"], self.student.username)
        self.assertEqual(rows[0]["Assignment"], "'=RESERVED()")
        self.assertEqual(rows[0]["LO1 accuracy (%)"], "")
        self.assertNotIn("Email", rows[0])
        self.client.force_login(self.other_teacher)
        self.assertEqual(self.client.get(page).status_code, 404)
        self.assertEqual(self.client.get(export).status_code, 404)

    def test_guided_lesson_requires_correct_practice_and_persists_during_resume(self):
        pk = self.start()
        self.navigation(pk, "briefed")
        self.navigation(pk, "enter", room=1)
        attempt = Attempt.objects.get(pk=pk)
        task = game.mission_for(attempt).rooms[0][0]
        lesson_url = reverse("tutorial", args=[pk])
        answer_url = reverse("answer", args=[pk])
        data = {"code": task.code, "answer": task.answer, "request_id": uuid4()}
        response = self.client.post(answer_url, data, follow=True)
        self.assertContains(response, "Verify the guided practice signal")
        def lesson(action, answer=""):
            return self.client.post(lesson_url, {"kind": "lesson", "code": task.code,
                                                 "action": action, "answer": answer}).json()

        self.assertEqual(lesson("practice", lessons.practice_answer(task))["stage"], 0)
        self.assertEqual(lesson("learn")["stage"], 1)
        self.assertEqual(lesson("demonstrate")["stage"], 2)
        self.assertFalse(lesson("practice", "00?")["correct"])
        self.client.logout()
        self.client.login(username=self.student.username, password=PASSWORD)
        self.assertContains(self.client.get(reverse("play", args=[pk])), 'data-stage="2"')
        self.assertTrue(lesson("practice", lessons.practice_answer(task))["correct"])
        self.assertContains(self.client.post(answer_url, data, follow=True), "Collect the access card")
        self.assertTrue(self.client.post(lesson_url, {"kind": "collected"}).json()["collected"])
        self.assertContains(self.client.post(answer_url, data, follow=True), "Access block verified")

    def test_generation_preserves_prior_missions(self):
        seed = "preserve-existing-adventure"
        old = build_mission(seed)
        updated = build_mission_v2(seed)
        self.assertEqual(old.encryption, updated.encryption)
        self.assertEqual(old.message, updated.message)
        added = [p for room in updated.rooms for p in room
                 if p.code not in {q.code for puzzles in old.rooms for q in puzzles}]
        self.assertEqual([p.code for p in added], ["subkey", "feistel_xor"])

    def test_forms_enforce_csrf(self):
        browser = Client(enforce_csrf_checks=True)
        browser.force_login(self.student)
        self.assertEqual(browser.post(reverse("start"), {"mode": "guided"}).status_code, 403)


class DemoSetupTests(TestCase):
    @override_settings(DEBUG=True)
    def test_demo_setup_and_reset_preserve_unrelated_accounts(self):
        users = get_user_model().objects
        real_user = users.create_user("regular-student")
        output = io.StringIO()
        call_command("demo_data", stdout=output)
        graduate = users.get(username="demo-graduate")
        previous_id = graduate.pk
        self.assertEqual(graduate.attempts.filter(completed_at__isnull=False).count(), 2)
        self.assertEqual(graduate.earned_badges.count(), 6)
        self.assertIn("demo-instructor", output.getvalue())
        classroom = Classroom.objects.get(code="DEMO455")
        link = Membership.objects.create(classroom=classroom, student=real_user)
        with self.assertRaisesMessage(CommandError, "Its data was preserved."):
            call_command("demo_data", reset=True, stdout=io.StringIO())
        self.assertTrue(users.filter(pk=previous_id).exists())
        link.delete()
        call_command("demo_data", reset=True, stdout=io.StringIO())
        self.assertFalse(users.filter(pk=previous_id).exists())
        self.assertTrue(users.filter(pk=real_user.pk).exists())
        self.assertEqual(Classroom.objects.filter(code="DEMO455").count(), 1)


    @override_settings(DEBUG=True)
    @patch.dict("os.environ", {"CIPHERBREAK_DEMO_STUDENT_PASSWORD": "test-course-student-only",
                              "CIPHERBREAK_DEMO_PROFESSOR_PASSWORD": "test-course-professor-only"})
    def test_course_demo_is_repeatable_and_uses_hashed_credentials(self):
        for _ in range(2):
            call_command("course_demo", stdout=io.StringIO())
        users = get_user_model().objects
        student = users.get(username="demo_student")
        professor = users.get(username="demo_professor")
        self.assertTrue(student.check_password("test-course-student-only"))
        self.assertTrue(professor.check_password("test-course-professor-only"))
        self.assertEqual(student.attempts.count(), 2)
        self.assertTrue(game.is_instructor(professor))
        self.assertEqual(professor.classrooms.count(), 1)
