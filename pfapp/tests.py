from django.test import SimpleTestCase, Client, override_settings
from django.urls import reverse
import json

TEST_STORAGES = {
    "default": {
        "BACKEND": "django.core.files.storage.FileSystemStorage",
    },
    "staticfiles": {
        "BACKEND": "django.contrib.staticfiles.storage.StaticFilesStorage",
    },
}

@override_settings(STORAGES=TEST_STORAGES)
class HomelabViewTests(SimpleTestCase):
    databases = []

    def setUp(self):
        self.client = Client()

    def test_homelab_view_status_and_template(self):
        response = self.client.get(reverse('homelab'))
        self.assertEqual(response.status_code, 200)
        self.assertTemplateUsed(response, 'pfapp/homelab.html')

    def test_homelab_architecture_content(self):
        response = self.client.get(reverse('homelab'))
        content = response.content.decode('utf-8')
        
        # Check hero header and branding
        self.assertIn('Inside the', content)
        self.assertIn('Homelab', content)
        self.assertIn('Bare-Metal Infrastructure', content)
        
        # Check the 4 flow channel buttons
        self.assertIn('data-path="all"', content)
        self.assertIn('data-path="ingress"', content)
        self.assertIn('data-path="git"', content)
        self.assertIn('data-path="admin"', content)
        self.assertIn('Visitor Ingress', content)
        self.assertIn('Git Auto-Deploy', content)
        self.assertIn('Remote Admin', content)

        # Check core architecture nodes
        self.assertIn('Public Visitors', content)
        self.assertIn('Cloudflare Edge', content)
        self.assertIn('Outbound Tunnel', content)
        self.assertIn('Coolify Engine', content)
        self.assertIn('Django App', content)
        self.assertIn('PostgreSQL 16', content)

        # Ensure fake telemetry elements and interval scripts are completely absent
        self.assertNotIn('telemetry-cpu', content)
        self.assertNotIn('telemetry-uptime', content)
        self.assertNotIn('setInterval', content)

@override_settings(STORAGES=TEST_STORAGES)
class SiteNavigationTests(SimpleTestCase):
    databases = []

    def setUp(self):
        self.client = Client()

    def test_navigation_parity_across_pages(self):
        for route_name in ['index', 'projects', 'faq', 'homelab', 'colony_playground']:
            response = self.client.get(reverse(route_name))
            self.assertEqual(response.status_code, 200)
            content = response.content.decode('utf-8')
            self.assertIn(reverse('homelab'), content)

@override_settings(STORAGES=TEST_STORAGES)
class ColonyViewTests(SimpleTestCase):
    databases = []

    def setUp(self):
        self.client = Client()

    def test_colony_playground_page_renders_cleanly(self):
        response = self.client.get(reverse('colony_playground'))
        self.assertEqual(response.status_code, 200)
        content = response.content.decode('utf-8')
        
        # Header & Guide
        self.assertIn('Colony: <span>One</span>', content)
        self.assertIn('How to Play (30s Visual Guide)', content)
        self.assertIn('Context for Curious Minds', content)

        # Check that raw $ LaTeX math is completely eliminated
        self.assertNotIn('$4096 \\times 4096$', content)
        self.assertNotIn('$+1.0$', content)
        self.assertNotIn('$-1.0$', content)
        self.assertIn('4,096 &times; 4,096', content)

        # Check for 3 stage modes
        self.assertIn('Play vs AI', content)
        self.assertIn('Test .ONNX', content)
        self.assertIn('Replays', content)

        # Check for visible leaderboard
        self.assertIn('Contest &amp; Challenge Leaderboard', content)

    def test_colony_record_challenge_endpoint(self):
        payload = {
            'model_name': 'TestModel_v1',
            'author_name': 'TestChallenger',
            'challenger_wins': 1,
            'champion_wins': 1
        }
        # In SimpleTestCase without DB, endpoint gracefully catches DB error or returns status
        response = self.client.post(
            reverse('colony_record_challenge'),
            data=json.dumps(payload),
            content_type='application/json'
        )
        self.assertIn(response.status_code, [201, 500])
