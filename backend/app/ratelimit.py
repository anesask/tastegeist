"""Per-IP sliding-window rate limits (in memory; fine for a single server process)."""

from __future__ import annotations

import os
import time
from collections import defaultdict, deque

from fastapi import HTTPException, Request

# Only the first hop of X-Forwarded-For is trusted, and only when behind our own proxy.
TRUST_PROXY = True
# Local development only: RATE_LIMITS=off in .env lifts every limit (testing hits them fast).
# Never set it on a public server; the daily model-spend cap still applies either way.
ENABLED = os.getenv("RATE_LIMITS", "on").lower() != "off"


def client_ip(request: Request) -> str:
    if TRUST_PROXY and (fwd := request.headers.get("x-forwarded-for")):
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


class RateLimit:
    def __init__(self, *windows: tuple[int, int]):
        """windows: (max requests, seconds) pairs, e.g. (3, 3600), (10, 86400)."""
        self.windows = windows
        self.hits: dict[str, deque[float]] = defaultdict(deque)

    def check(self, request: Request) -> None:
        if not ENABLED:
            return
        ip, now = client_ip(request), time.time()
        q = self.hits[ip]
        longest = max(s for _, s in self.windows)
        while q and q[0] < now - longest:
            q.popleft()
        for limit, seconds in self.windows:
            if sum(1 for t in q if t >= now - seconds) >= limit:
                raise HTTPException(429, f"Rate limit: {limit} per {seconds // 3600 or 1}{'h' if seconds >= 3600 else 's'}. Try a demo brief instead.")
        q.append(now)
