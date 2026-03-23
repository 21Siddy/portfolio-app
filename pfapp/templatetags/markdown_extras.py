from django import template
from django.template.defaultfilters import stringfilter
import markdown as md

register = template.Library()

@register.filter()
@stringfilter
def markdown(value):
    # Converts markdown to HTML, enabling tables, lists, and safe code blocks
    return md.markdown(value, extensions=['markdown.extensions.fenced_code', 'markdown.extensions.tables'])