#!/usr/bin/env python3
"""
Real OS-level HID mouse/keyboard driver for macOS via Quartz CGEvent.

Why this exists: CDP's Input.dispatchMouseEvent produces an event the *page*
trusts (isTrusted === true), but Chrome itself knows the event was injected by
the debugger and refuses to open the native file picker. A CGEvent posted to
the HID event tap is indistinguishable from a physical mouse at the OS level,
so Chrome opens the picker normally.

Coordinates are SCREEN points (not viewport). Use --map to convert.
"""
from __future__ import annotations

import argparse
import random
import sys
import time

import Quartz

LEFT = Quartz.kCGMouseButtonLeft


def _post(ev) -> None:
    Quartz.CGEventPost(Quartz.kCGHIDEventTap, ev)


def cursor() -> tuple[float, float]:
    loc = Quartz.CGEventGetLocation(Quartz.CGEventCreate(None))
    return loc.x, loc.y


def move(x: float, y: float) -> None:
    _post(Quartz.CGEventCreateMouseEvent(None, Quartz.kCGEventMouseMoved, (x, y), LEFT))


def glide(x2: float, y2: float, duration: float = 0.45, steps: int = 0) -> None:
    """Human-ish cursor travel: eased, jittered, variable step count."""
    x1, y1 = cursor()
    steps = steps or random.randint(22, 38)
    for i in range(1, steps + 1):
        t = i / steps
        # ease-in-out cubic
        e = 4 * t * t * t if t < 0.5 else 1 - pow(-2 * t + 2, 3) / 2
        jx = random.uniform(-1.2, 1.2) if i < steps else 0
        jy = random.uniform(-1.2, 1.2) if i < steps else 0
        move(x1 + (x2 - x1) * e + jx, y1 + (y2 - y1) * e + jy)
        time.sleep(duration / steps * random.uniform(0.75, 1.3))


def click(x: float, y: float, settle: float = 0.0) -> None:
    glide(x, y)
    time.sleep(random.uniform(0.06, 0.16))
    down = Quartz.CGEventCreateMouseEvent(None, Quartz.kCGEventLeftMouseDown, (x, y), LEFT)
    _post(down)
    time.sleep(random.uniform(0.045, 0.11))  # human press duration
    up = Quartz.CGEventCreateMouseEvent(None, Quartz.kCGEventLeftMouseUp, (x, y), LEFT)
    _post(up)
    if settle:
        time.sleep(settle)


def key(code: int, flags: int = 0) -> None:
    d = Quartz.CGEventCreateKeyboardEvent(None, code, True)
    u = Quartz.CGEventCreateKeyboardEvent(None, code, False)
    if flags:
        Quartz.CGEventSetFlags(d, flags)
        Quartz.CGEventSetFlags(u, flags)
    _post(d)
    time.sleep(random.uniform(0.03, 0.07))
    _post(u)


def type_text(text: str) -> None:
    """Unicode-safe typing with human cadence."""
    for ch in text:
        d = Quartz.CGEventCreateKeyboardEvent(None, 0, True)
        u = Quartz.CGEventCreateKeyboardEvent(None, 0, False)
        Quartz.CGEventKeyboardSetUnicodeString(d, len(ch), ch)
        Quartz.CGEventKeyboardSetUnicodeString(u, len(ch), ch)
        _post(d)
        _post(u)
        delay = random.uniform(0.012, 0.055)
        if ch == " ":
            delay += random.uniform(0.0, 0.04)
        if random.random() < 0.03:      # occasional human hesitation
            delay += random.uniform(0.15, 0.45)
        time.sleep(delay)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("action", choices=["click", "move", "type", "key", "where"])
    ap.add_argument("--x", type=float)
    ap.add_argument("--y", type=float)
    ap.add_argument("--text", default="")
    ap.add_argument("--code", type=int, default=0)
    ap.add_argument("--cmd", action="store_true", help="hold command for key")
    ap.add_argument("--shift", action="store_true")
    ap.add_argument("--settle", type=float, default=0.0)
    a = ap.parse_args()

    if a.action == "where":
        print("%.1f %.1f" % cursor())
    elif a.action == "move":
        glide(a.x, a.y)
    elif a.action == "click":
        click(a.x, a.y, settle=a.settle)
    elif a.action == "type":
        type_text(a.text)
    elif a.action == "key":
        flags = 0
        if a.cmd:
            flags |= Quartz.kCGEventFlagMaskCommand
        if a.shift:
            flags |= Quartz.kCGEventFlagMaskShift
        key(a.code, flags)
    return 0


if __name__ == "__main__":
    sys.exit(main())
