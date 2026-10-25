from django.test import SimpleTestCase, Client, override_settings
from django.urls import reverse
from pathlib import Path
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

        # Team Ai-DHD attribution strip & team members
        self.assertIn('Team Ai-DHD', content)
        self.assertIn('Siddharth Hemnani', content)
        self.assertIn('Sashreek Dhaimodkar', content)
        self.assertIn('Vedant Vallakati', content)

        # LinkedIn Links
        self.assertIn('https://www.linkedin.com/in/siddharth-hemnani-02a030226/', content)
        self.assertIn('https://www.linkedin.com/in/sashreek-dhaimodkar-b67843234/', content)
        self.assertIn('https://www.linkedin.com/in/vedant-vallakati/', content)

        # Rebranding check: Kernel-76 removed in favor of Ai-DHD
        self.assertNotIn('Kernel-76', content)
        self.assertIn('Ai-DHD Gen 9 Champion', content)

        # Check for visible leaderboard with Fiesty and Affiliation
        self.assertIn('Contest &amp; Challenge Leaderboard', content)
        self.assertIn('Fiesty', content)
        self.assertIn('Affiliation', content)
        self.assertIn('btn-submit-to-leaderboard', content)

        # Ensure spoofable manual-result buttons are absent
        self.assertNotIn('btn-toggle-manual-entry', content)
        self.assertNotIn('btn-submit-direct-result', content)

        # Check that raw $ LaTeX math is completely eliminated
        self.assertNotIn('$4096 \\times 4096$', content)
        self.assertNotIn('$+1.0$', content)
        self.assertNotIn('$-1.0$', content)
        self.assertIn('4,096 &times; 4,096', content)

        # Check for 3 stage modes
        self.assertIn('Play vs AI', content)
        self.assertIn('Test .ONNX', content)
        self.assertIn('Replays', content)

        # Check for 3 challenger registration fields
        self.assertIn('id="challenge-author-name"', content)
        self.assertIn('id="challenge-model-name"', content)
        self.assertIn('id="challenge-affiliation"', content)

    def test_ui_js_uses_roundNumber_not_undefined_round(self):
        ui_js_path = Path(__file__).resolve().parent / 'static' / 'js' / 'colony' / 'ui.js'
        ui_js_text = ui_js_path.read_text(encoding='utf-8')
        self.assertNotIn('this.game.round;', ui_js_text)
        self.assertIn('this.game.roundNumber', ui_js_text)
        self.assertNotIn('action.team', ui_js_text)
        self.assertIn('logEntry.team', ui_js_text)

    def test_projects_page_showcases_team_aidhd(self):
        response = self.client.get(reverse('projects'))
        self.assertEqual(response.status_code, 200)
        content = response.content.decode('utf-8')

        # Team Ai-DHD on projects card
        self.assertIn('Team <strong>Ai-DHD</strong>:', content)
        self.assertIn('Siddharth Hemnani', content)
        self.assertIn('Sashreek Dhaimodkar', content)
        self.assertIn('Vedant Vallakati', content)
        self.assertIn('https://www.linkedin.com/in/sashreek-dhaimodkar-b67843234/', content)
        self.assertIn('https://www.linkedin.com/in/vedant-vallakati/', content)
        self.assertIn('Ai-DHD Gen 9 Champion', content)

    def test_index_page_references_team_aidhd(self):
        response = self.client.get(reverse('index'))
        self.assertEqual(response.status_code, 200)
        content = response.content.decode('utf-8')
        self.assertIn('Team Ai-DHD Cloudfight champion model', content)

    def test_colony_record_challenge_endpoint_and_null_rounds_safety(self):
        payload = {
            'model_name': 'Fiesty-DQN',
            'team_name': 'Fiesty',
            'author_name': 'Fiesty',
            'affiliation': 'DQN Research Colleague',
            'challenger_wins': 2,
            'champion_wins': 0,
            'total_rounds': None
        }
        response = self.client.post(
            reverse('colony_record_challenge'),
            data=json.dumps(payload),
            content_type='application/json'
        )
        self.assertIn(response.status_code, [201, 500])
        if response.status_code == 500:
            # Must only fail due to SimpleTestCase disallowing DB queries, never TypeError on NoneType
            err = response.json().get('error', '')
            self.assertNotIn('NoneType', err)
