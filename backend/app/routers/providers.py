from fastapi import APIRouter

from app.config import get_settings
from app.models import ProviderInfo
from app.providers import registry

router = APIRouter()


@router.get("/providers", response_model=list[ProviderInfo])
async def list_providers():
    default = get_settings().default_provider
    return [
        ProviderInfo(
            id=p.id,
            name=p.name,
            available=p.is_available(),
            models=p.models(),
            default_model=p.default_model(),
            is_default=p.id == default,
        )
        for p in registry.list_all()
    ]
