from django.db import models

# Create your models here.
class GermanyFAQ(models.Model):
    question_text = models.TextField(max_length=300)
    answer_text = models.TextField(max_length=2500)
    question_category = models.CharField(max_length=100, default="General")
    created_at = models.DateTimeField(auto_now_add=True)
    
    def __str__(self):
        return f"C: {self.question_category} - Q: {self.question_text[:50]} - A: {self.answer_text[:50]}..."

class Projects(models.Model):
    title = models.CharField(max_length=200)
    slug = models.SlugField(unique=True, blank=True)
    content = models.TextField()
    tech_stack = models.CharField(max_length=255)
    link = models.URLField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.title

class ColonyMatch(models.Model):
    TEAM_CHOICES = [
        ('CYAN', 'Cyan'),
        ('MAGENTA', 'Magenta'),
    ]
    WINNER_CHOICES = [
        ('CYAN', 'Cyan'),
        ('MAGENTA', 'Magenta'),
        ('DRAW', 'Draw'),
    ]

    player_team = models.CharField(max_length=10, choices=TEAM_CHOICES)
    ai_model = models.CharField(max_length=100, default='Level 5 Gen 9 Champion')
    winner = models.CharField(max_length=10, choices=WINNER_CHOICES, blank=True, null=True)
    win_reason = models.CharField(max_length=255, blank=True)
    total_rounds = models.PositiveSmallIntegerField(default=1)
    total_actions = models.PositiveSmallIntegerField(default=0)
    is_player_winner = models.BooleanField(default=False)
    ip_hash = models.CharField(max_length=64, blank=True, help_text="Privacy-preserving IP hash for rate control")
    played_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-played_at']
        verbose_name_plural = 'Colony Matches'

    def __str__(self):
        return f"Match #{self.id} — {self.player_team} vs {self.ai_model} (Winner: {self.winner})"

class ColonyLeaderboardEntry(models.Model):
    rank = models.PositiveIntegerField(default=999)
    team_name = models.CharField(max_length=100)
    model_name = models.CharField(max_length=100)
    affiliation = models.CharField(max_length=100, blank=True)
    level = models.CharField(max_length=20, default='Level 5')
    elo_rating = models.IntegerField(default=1500)
    matches_played = models.PositiveIntegerField(default=0)
    wins = models.PositiveIntegerField(default=0)
    losses = models.PositiveIntegerField(default=0)
    is_siddharth = models.BooleanField(default=False)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-elo_rating', '-wins']
        verbose_name_plural = 'Colony Leaderboard Entries'

    @property
    def win_rate_pct(self):
        if self.matches_played == 0:
            return 0.0
        return round((self.wins / self.matches_played) * 100, 1)

    def __str__(self):
        return f"#{self.rank} {self.team_name} ({self.elo_rating} Elo)"