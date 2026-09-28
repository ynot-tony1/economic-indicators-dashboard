"""
Tell the website to refresh its cached pages after a nightly load.

The pages are ISR-cached for an hour and only regenerate when someone visits,
so on a quiet site "Updated" could lag the data by days. This calls the site's
/api/revalidate endpoint so the next visitor gets fresh data.

Env:
    SITE_URL            base URL of the site, e.g. https://example.vercel.app
    REVALIDATE_SECRET   shared secret, matching the site's REVALIDATE_SECRET

Never fails the pipeline: a missed refresh only means pages fall back to the
normal hourly ISR window.
"""

from __future__ import annotations

import os
import sys
import urllib.error
import urllib.request


def main() -> int:
    site = os.environ.get("SITE_URL", "").rstrip("/")
    secret = os.environ.get("REVALIDATE_SECRET", "")
    if not site or not secret:
        print("SITE_URL or REVALIDATE_SECRET not set; skipping site refresh")
        return 0

    request = urllib.request.Request(
        f"{site}/api/revalidate",
        method="POST",
        headers={"Authorization": f"Bearer {secret}"},
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            print(f"Site refresh: HTTP {response.status} {response.read().decode()[:200]}")
    except (urllib.error.URLError, TimeoutError) as exc:
        print(f"WARN: site refresh failed ({exc}); pages will refresh on the hourly window")
    return 0


if __name__ == "__main__":
    sys.exit(main())
