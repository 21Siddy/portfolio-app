from django.contrib import admin
from pfapp.models import GermanyFAQ, Projects, ColonyMatch, ColonyLeaderboardEntry

# Register your models here.
@admin.register(GermanyFAQ)
class GermanyFAQAdmin(admin.ModelAdmin):
    list_display = ('question_text', 'question_category', 'created_at')
    search_fields = ('question_text', 'answer_text', 'question_category')
    list_filter = ('question_category', 'created_at')
    
@admin.register(Projects)
class ProjectsAdmin(admin.ModelAdmin):
    list_display = ('title', 'tech_stack', 'created_at')
    search_fields = ('title', 'content', 'tech_stack')
    list_filter = ('created_at',)

@admin.register(ColonyMatch)
class ColonyMatchAdmin(admin.ModelAdmin):
    list_display = ('id', 'player_team', 'ai_model', 'winner', 'is_player_winner', 'total_rounds', 'played_at')
    list_filter = ('ai_model', 'winner', 'is_player_winner', 'player_team', 'played_at')
    search_fields = ('ai_model', 'win_reason')
    readonly_fields = ('played_at', 'ip_hash')

@admin.register(ColonyLeaderboardEntry)
class ColonyLeaderboardEntryAdmin(admin.ModelAdmin):
    list_display = ('rank', 'team_name', 'model_name', 'affiliation', 'level', 'elo_rating', 'wins', 'losses', 'is_siddharth')
    list_filter = ('level', 'is_siddharth', 'affiliation')
    search_fields = ('team_name', 'model_name', 'affiliation')