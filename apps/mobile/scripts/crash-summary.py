#!/usr/bin/env python3
"""The useful part of an iOS crash report (.ips): why the app died and where.

For a React Native app the reason is usually a JavaScript error, carried in
the exception's "application specific information"; for a native crash, the
top frames of the thread that crashed. Used by .github/workflows/ios.yml.
"""
import json
import sys


def main(path):
    raw = open(path, encoding="utf-8", errors="replace").read()
    head, _, rest = raw.partition("\n")
    try:
        body = json.loads(rest)
    except ValueError:
        print(raw[:6000])
        return
    try:
        header = json.loads(head)
        print("app:", header.get("app_name"), header.get("app_version"), "·", header.get("timestamp"))
    except ValueError:
        pass
    for key in ("exception", "termination", "asi", "lastExceptionBacktrace", "ktriageinfo"):
        if key in body and key != "lastExceptionBacktrace":
            print(f"{key}:", json.dumps(body[key], ensure_ascii=False)[:3000])
    images = body.get("usedImages", [])

    def frames(fs, n=40):
        for f in fs[:n]:
            img = images[f.get("imageIndex", 0)] if f.get("imageIndex", 0) < len(images) else {}
            print("   ", (img.get("name") or "?").ljust(28), f.get("symbol", "?"), f.get("sourceFile", ""), f.get("sourceLine", ""))

    if body.get("lastExceptionBacktrace"):
        print("last exception backtrace:")
        frames(body["lastExceptionBacktrace"])
    for i, th in enumerate(body.get("threads", [])):
        if th.get("triggered"):
            print(f"crashed thread {i}:", th.get("name") or th.get("queue") or "")
            frames(th.get("frames", []))


if __name__ == "__main__":
    main(sys.argv[1])
