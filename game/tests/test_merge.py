from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings

from game.models import Attempt


class MergedFacilityTests(TestCase):
    def setUp(self):
        self.student = get_user_model().objects.create_user("facility-learner", password="local-test-password")
        self.client.force_login(self.student)
        self.client.post("/adventure/new/", {"mode": "guided"})
        self.attempt = Attempt.objects.get(user=self.student)
        self.url = f"/api/attempt/{self.attempt.pk}"

    def test_views_share_one_owned_attempt(self):
        page = self.client.get(f"/play/{self.attempt.pk}/")
        self.assertContains(page, 'id="cinematic-room"')
        self.assertContains(page, 'id="world"')
        self.assertContains(page, 'id="machine"')
        self.assertContains(page, 'id="b-view"')

    def test_card_gate_and_persistence(self):
        self.assertEqual(self.client.get(self.url + "/inventory/").json()["items"], [])
        self.assertEqual(self.client.get(self.url + "/puzzle/r1_ascii/").status_code, 400)
        self.assertEqual(self.client.post(self.url + "/collect/").status_code, 400)
        self.assertEqual(self.client.post(self.url + "/room/", {"room": 1}, content_type="application/json").status_code, 200)
        self.assertEqual(self.client.post(self.url + "/collect/").status_code, 200)
        self.assertTrue(self.client.get(self.url + "/state/").json()["attempt"]["access_card"])
        self.assertEqual(self.client.get(self.url + "/puzzle/r1_ascii/").status_code, 200)
        self.client.logout()
        self.assertTrue(self.client.login(username="facility-learner", password="local-test-password"))
        self.assertTrue(self.client.get(self.url + "/state/").json()["attempt"]["access_card"])

    @override_settings(DEBUG=False)
    def test_demo_user_cannot_sign_in_in_production(self):
        self.student.profile.is_demo = True
        self.student.profile.save()
        self.client.logout()
        self.assertFalse(self.client.login(username="facility-learner", password="local-test-password"))
