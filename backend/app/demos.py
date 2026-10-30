"""The two precomputable demo briefs (spec decision 14)."""

from __future__ import annotations

from .models import Anchor, Brief, Market

DEMOS: dict[str, Brief] = {
    "eu": Brief(
        id="eu",
        title="E-bike launch, Europe",
        product="Lumen, a lightweight commuter e-bike with a minimalist frame and app unlock. Mid-premium price.",
        objective="launch",
        age=["25_to_29", "30_to_34"],
        anchors=[
            Anchor("Patagonia", "urn:entity:brand"),
            Anchor("Muji", "urn:entity:brand"),
            Anchor("Fred again..", "urn:entity:artist"),
        ],
        markets=[
            Market("Amsterdam", center=(4.9041, 52.3676)),
            Market("Berlin", center=(13.4050, 52.5200)),
            Market("London", center=(-0.1276, 51.5072)),
            Market("Manchester", center=(-2.2426, 53.4808)),
        ],
        neighborhoods={
            "Amsterdam": [
                Market("De Pijp", center=(4.8936, 52.3540), parent="Amsterdam"),
                Market("Noord", center=(4.9180, 52.3990), parent="Amsterdam"),
            ]
        },
        product_name="Lumen",
        budget=60000,
        currency="EUR",
        headline="One Amsterdam. Two tastes, two campaigns.",
    ),
    "us": Brief(
        id="us",
        title="Indie album launch, USA",
        product="Night Swims, a debut indie-pop album: bedroom-produced, warm synths, confessional lyrics.",
        objective="launch",
        age=["24_and_younger", "25_to_29"],
        anchors=[
            Anchor("Phoebe Bridgers", "urn:entity:artist"),
            Anchor("Mac DeMarco", "urn:entity:artist"),
            Anchor("A24", "urn:entity:brand"),
        ],
        markets=[
            Market("Los Angeles", center=(-118.2437, 34.0522)),
            Market("New York", center=(-73.9857, 40.7484)),
            Market("Chicago", center=(-87.6298, 41.8781)),
            Market("Austin", center=(-97.7431, 30.2672)),
        ],
        neighborhoods={
            "Los Angeles": [
                Market("Silver Lake", center=(-118.2700, 34.0870), parent="Los Angeles"),
                Market("Venice", center=(-118.4695, 33.9850), parent="Los Angeles"),
            ]
        },
        product_name="Night Swims",
        budget=40000,
        currency="USD",
        headline="One Los Angeles. Two tastes, two campaigns.",
    ),
    "de": Brief(
        id="de",
        title="Alcohol-free beer, all of Germany",
        product="Nachtfalter, an alcohol-free craft beer for long nights out: hoppy, dry, made in Hamburg. Mid-premium.",
        product_name="Nachtfalter",
        objective="launch",
        age=["24_and_younger", "25_to_29", "30_to_34"],
        anchors=[
            Anchor("Club-Mate", "urn:entity:brand"),
            Anchor("Moderat", "urn:entity:artist"),
            Anchor("Dark", "urn:entity:tv_show"),
        ],
        markets=[Market("Germany", center=(10.45, 51.16))],
        scope="country",
        country="Germany",
        budget=50000,
        currency="EUR",
    ),
}
