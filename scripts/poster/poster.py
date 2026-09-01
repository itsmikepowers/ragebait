#!/usr/bin/env python3
"""
Post the next due ragebait video to Instagram via the real-profile Chrome.

Design notes / safety rails — this drives a real 4.7k-follower account:

  * SINGLE POST PER RUN. Never loops the queue. An hourly cron that could
    post N items would empty the whole schedule in one bad run.
  * LOCKFILE. Two overlapping runs (cron tick + manual run) must never both
    upload. Stale locks older than LOCK_STALE_S are reclaimed.
  * FINALIZE ONLY ON CONFIRMED SUCCESS. We finalize only after reading a real
    instagram.com/p/<shortcode>/ or /reel/<shortcode>/ URL back off the page.
    A crash mid-upload leaves posted:false, so the item is retried rather than
    silently lost.
  * DUPLICATE GUARD. Before uploading, the account's most recent post
    shortcode is captured. If after "posting" the newest shortcode is
    unchanged, we do NOT finalize and we exit non-zero.
  * HUMANIZED PACING. Randomized dwell/typing delays; never instant-fire.

Usage:
    poster.py --dry-run     inspect what would post, touch nothing
    poster.py               post one due item
"""

from __future__ import annotations

import argparse
import json
import os
import random
import re
import subprocess
import sys
import tempfile
import time
import urllib.request
import urllib.error
from pathlib import Path

BASE = os.environ.get("RAGEBAIT_BASE", "https://www.ragebait.io")
USERNAME = os.environ.get("RAGEBAIT_IG_USERNAME", "shirtpost.club")
KEY = os.environ.get("POSTER_API_KEY", "").strip()

STATE_DIR = Path.home() / ".ragebait-poster"
STATE_DIR.mkdir(parents=True, exist_ok=True)
LOCK = STATE_DIR / "poster.lock"
LOG = STATE_DIR / "poster.log"
LOCK_STALE_S = 30 * 60

SHORTCODE_RE = re.compile(r"instagram\.com/(?:p|reel)/([A-Za-z0-9_-]+)")


def log(msg: str) -> None:
    line = f"{time.strftime('%Y-%m-%d %H:%M:%S')} {msg}"
    print(line, flush=True)
    with LOG.open("a") as fh:
        fh.write(line + "\n")


def human_pause(lo: float, hi: float) -> None:
    time.sleep(random.uniform(lo, hi))


# ---------------------------------------------------------------- lockfile


def acquire_lock() -> None:
    if LOCK.exists():
        age = time.time() - LOCK.stat().st_mtime
        if age < LOCK_STALE_S:
            log(f"another run holds the lock (age {int(age)}s) — exiting")
            sys.exit(0)
        log(f"reclaiming stale lock (age {int(age)}s)")
    LOCK.write_text(str(os.getpid()))


def release_lock() -> None:
    try:
        LOCK.unlink()
    except FileNotFoundError:
        pass


# ------------------------------------------------------------- ragebait api


def api(path: str, method: str = "GET", body: dict | None = None) -> tuple[int, dict]:
    if not KEY:
        raise SystemExit("POSTER_API_KEY is not set")
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(f"{BASE}{path}", data=data, method=method)
    req.add_header("Authorization", f"Bearer {KEY}")
    if data:
        req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return resp.status, json.loads(resp.read() or b"{}")
    except urllib.error.HTTPError as e:
        raw = e.read()
        try:
            return e.code, json.loads(raw or b"{}")
        except ValueError:
            return e.code, {"error": raw.decode(errors="replace")[:300]}


def fetch_due() -> dict | None:
    status, payload = api(f"/api/fetch/{USERNAME}")
    if status == 404:
        log("nothing due")
        return None
    if status != 200:
        raise SystemExit(f"fetch failed {status}: {payload}")
    return payload


def finalize(post_url: str) -> None:
    status, payload = api(
        f"/api/finalize/{USERNAME}",
        method="POST",
        body={"instagramPostUrl": post_url},
    )
    if status != 200:
        raise SystemExit(f"finalize failed {status}: {payload}")
    log(f"finalized: {payload} url={post_url}")


# ------------------------------------------------------------------ browser


def bh(code: str, timeout: int = 300) -> str:
    """Run python through the browser-harness CLI against real-profile Chrome."""
    exe = os.environ.get(
        "BROWSER_HARNESS",
        str(Path.home() / ".cache/uv/archive-v0/6VQ6UhLYVmFWbxTo/bin/browser-harness"),
    )
    proc = subprocess.run(
        [exe], input=code, text=True, capture_output=True, timeout=timeout
    )
    if proc.returncode != 0:
        raise RuntimeError(f"browser-harness failed: {proc.stderr[-1500:]}")
    return proc.stdout


def newest_shortcode() -> str | None:
    """Most recent post shortcode on the account grid, for duplicate detection."""
    out = bh(
        f'''
new_tab("https://www.instagram.com/{USERNAME}/")
wait_for_load()
import time; time.sleep(3)
print(js("""(() => {{
  const a = document.querySelector('a[href*="/p/"], a[href*="/reel/"]');
  return a ? a.href : "";
}})()"""))
'''
    )
    m = SHORTCODE_RE.search(out)
    return m.group(1) if m else None


def download(url: str) -> Path:
    dest = Path(tempfile.gettempdir()) / f"ragebait-{int(time.time())}.mp4"
    log(f"downloading {url}")
    urllib.request.urlretrieve(url, dest)
    size = dest.stat().st_size
    if size < 10_000:
        raise SystemExit(f"downloaded file suspiciously small: {size} bytes")
    log(f"downloaded {size/1_048_576:.2f} MB -> {dest}")
    return dest


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    item = fetch_due()
    if not item:
        return 0

    log(
        f"due: date={item['date']} caption={item['caption']!r} "
        f"video={item['url']}"
    )

    if args.dry_run:
        log("dry-run — nothing posted")
        return 0

    acquire_lock()
    try:
        before = newest_shortcode()
        log(f"newest shortcode before: {before}")

        video = download(item["url"])
        human_pause(2, 4)

        # Upload is driven by a separate module so this file stays readable
        # and the fragile DOM work is isolated and individually testable.
        from ig_upload import upload_reel

        post_url = upload_reel(
            bh,
            video_path=str(video),
            caption=item["caption"],
            first_comment=item.get("firstComment") or "",
            log=log,
        )

        after = newest_shortcode()
        log(f"newest shortcode after: {after}")

        if not post_url:
            if after and after != before:
                post_url = f"https://www.instagram.com/p/{after}/"
                log(f"recovered url from grid: {post_url}")
            else:
                log("FAILED: no post url and grid unchanged — not finalizing")
                return 1

        if after == before:
            log("FAILED: grid unchanged after upload — not finalizing")
            return 1

        finalize(post_url)
        log("SUCCESS")
        return 0
    finally:
        release_lock()


if __name__ == "__main__":
    sys.exit(main())
