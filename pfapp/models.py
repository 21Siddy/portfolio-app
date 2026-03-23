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