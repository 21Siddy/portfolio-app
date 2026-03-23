from django.contrib import admin
from pfapp.models import GermanyFAQ, Projects

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