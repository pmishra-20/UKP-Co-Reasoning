"""Providers self-register here. To add one: create a file, then add one register() line."""
from app.providers import registry
from app.providers.mock import MockProvider
from app.providers.openai_compat import OpenAICompatProvider
from app.providers.ukp import UKPProvider

registry.register(MockProvider())
registry.register(UKPProvider())
registry.register(OpenAICompatProvider())
