from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[2]
load_dotenv(ROOT / ".env")


@dataclass(frozen=True)
class Settings:
    qloo_base_url: str = os.getenv("QLOO_API_SERVER_URL", "https://hackathon.api.qloo.com").rstrip("/")
    qloo_api_key: str = os.getenv("QLOO_API_KEY", "")
    anthropic_api_key: str = os.getenv("ANTHROPIC_API_KEY", "")
    openai_api_key: str = os.getenv("OPENAI_API_KEY", "")
    # Generated hero images are off by default: posters are built from real Qloo imagery instead.
    generate_images: bool = os.getenv("GENERATE_IMAGES", "0") == "1"
    data_dir: Path = field(default=ROOT / "backend" / "data")


settings = Settings()
