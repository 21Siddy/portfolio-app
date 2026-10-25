from django.test import SimpleTestCase, Client, override_settings
from django.urls import reverse

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

        # Check the 3 architecture zones
        self.assertIn('01. Clients &amp; Sources', content)
        self.assertIn('02. Cloud Edge &amp; Perimeter', content)
        self.assertIn('03. Homelab Host', content)

        # Check core architecture nodes
        self.assertIn('Public Visitors', content)
        self.assertIn('Dev Workstation', content)
        self.assertIn('Cloudflare Edge', content)
        self.assertIn('GitHub Repository', content)
        self.assertIn('Outbound Tunnel', content)
        self.assertIn('Traefik Proxy', content)
        self.assertIn('Coolify Engine', content)
        self.assertIn('Django App', content)
        self.assertIn('PostgreSQL 16', content)

        # Check clean, non-repetitive technical write-up entries
        self.assertIn('Bare-Metal Host &amp; Efficiency', content)
        self.assertIn('Zero-Inbound Network Security', content)
        self.assertIn('Automated CI/CD &amp; Storage Resilience', content)
        self.assertIn('Zero Open Ports', content)

        # Ensure fake telemetry elements and interval scripts are completely absent
        self.assertNotIn('telemetry-cpu', content)
        self.assertNotIn('telemetry-uptime', content)
        self.assertNotIn('terminal-stream', content)
        self.assertNotIn('setInterval', content)

        # Ensure sensitive operational port dumps and systemd configs are absent
        self.assertNotIn('8000/6001', content)
        self.assertNotIn('HandleLidSwitch', content)

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
            # Verify core routes are in the navbar across pages
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
        self.assertIn('Colony: <span>One</span>', content)
        self.assertIn('How to Play (30s Visual Guide)', content)
        self.assertIn('Context for Curious Minds', content)
        self.assertNotIn('LIVE CONTEST MATCHES', content)
        self.assertNotIn('Glicko-2 &amp; Elo Engine', content)
