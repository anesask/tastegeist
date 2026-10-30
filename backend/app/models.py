from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any


@dataclass
class Anchor:
    """Something the product is "like": how a product with no Qloo entity inherits affinities."""

    name: str
    type: str
    id: str | None = None
    image: str | None = None


@dataclass
class Market:
    name: str
    center: tuple[float, float]  # lon, lat
    parent: str | None = None  # set for neighborhoods

    @property
    def is_neighborhood(self) -> bool:
        return self.parent is not None

    @property
    def wkt(self) -> str:
        return f"POINT({self.center[0]} {self.center[1]})"


@dataclass
class Brief:
    id: str
    title: str
    product: str
    objective: str
    anchors: list[Anchor]
    markets: list[Market]
    age: list[str] = field(default_factory=list)
    gender: str | None = None
    neighborhoods: dict[str, list[Market]] = field(default_factory=dict)
    product_name: str = ""
    budget: float | None = None
    currency: str = "EUR"
    headline: str = ""
    scope: str = "cities"  # country | cities | city
    country: str | None = None
    channels: list[str] = field(default_factory=lambda: ["social", "online_video", "audio", "ooh", "influencers"])
    start: str | None = None
    end: str | None = None
    constraints: str = ""
    # Workspace writing style (Settings > AI): tone, house rules, banned references. Applied at run time.
    style: dict[str, Any] = field(default_factory=dict)


def brief_to_dict(b: Brief) -> dict[str, Any]:
    return asdict(b)


def brief_from_dict(d: dict[str, Any]) -> Brief:
    d = dict(d)
    d["anchors"] = [Anchor(**a) for a in d.get("anchors", [])]
    d["markets"] = [Market(m["name"], tuple(m["center"]), m.get("parent")) for m in d.get("markets", [])]
    d["neighborhoods"] = {
        city: [Market(m["name"], tuple(m["center"]), m.get("parent")) for m in hoods]
        for city, hoods in (d.get("neighborhoods") or {}).items()
    }
    known = Brief.__dataclass_fields__
    return Brief(**{k: v for k, v in d.items() if k in known})
