from abc import ABC, abstractmethod
from typing import ClassVar, Literal

from pydantic import BaseModel


class ChatMessage(BaseModel):
    role: Literal["system", "user", "assistant"]
    content: str


class LLMResult(BaseModel):
    text: str
    model: str
    usage: dict | None = None


class LLMProvider(ABC):
    id: ClassVar[str]
    name: ClassVar[str]

    @abstractmethod
    def is_available(self) -> bool: ...

    @abstractmethod
    def models(self) -> list[str]: ...

    def default_model(self) -> str:
        m = self.models()
        return m[0] if m else ""

    @abstractmethod
    async def complete(
        self,
        messages: list[ChatMessage],
        *,
        model: str,
        temperature: float,
        max_tokens: int,
    ) -> LLMResult: ...
