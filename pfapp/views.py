from django.shortcuts import render
from pfapp.models import GermanyFAQ, Projects

# Create your views here.
def index(request):
    return render(request, 'pfapp/index.html', {})

def projects_page(request):
    try:
        projects = Projects.objects.all().order_by('-created_at')
        # Force evaluation to catch potential database errors
        list(projects)
        messages = []
    except Exception as e:
        print(f"Error fetching projects: {e}")
        projects = []
        messages = ["Unable to load projects at this time. Please try again later."]
        
    return render(request, 'pfapp/projects.html', {'projects': projects, 'messages': messages})

def faq_page(request):
    try:
        faqs = GermanyFAQ.objects.all().order_by('-created_at')
        # Force evaluation to catch potential database errors
        list(faqs)
        messages = []
    except Exception as e:
        print(f"Error fetching FAQs: {e}")
        faqs = []
        messages = ["Unable to load FAQs at this time. Please try again later."]
        
    return render(request, 'pfapp/faq.html', {'faqs': faqs, 'messages': messages}) 

def homelab_page(request):
    return render(request, 'pfapp/homelab.html', {})