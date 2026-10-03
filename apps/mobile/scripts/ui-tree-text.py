#!/usr/bin/env python3
"""Print a Maestro `hierarchy` dump as the text a person would see on screen.

One line per element that carries text or an accessibility label, with its
bounds — enough to tell which screen a test reached and what to tap next.
Used by .github/workflows/ios.yml.
"""
import json
import sys


def walk(node, out):
    a = node.get("attributes", {}) or {}
    text = (a.get("text") or "").strip()
    label = (a.get("accessibilityText") or "").strip()
    if text or label:
        shown = text if not label or label == text else f"{text} [{label}]" if text else f"[{label}]"
        out.append(f"{a.get('bounds', '')}  {shown}")
    for child in node.get("children", []) or []:
        walk(child, out)


def main(path):
    try:
        with open(path, encoding="utf-8") as f:
            raw = f.read()
        # The CLI may print a line or two before the JSON itself.
        tree = json.loads(raw[raw.index("{"):])
    except (OSError, ValueError) as e:
        print(f"unreadable: {e}")
        return
    out = []
    walk(tree, out)
    seen = set()
    for line in out:
        if line not in seen:
            seen.add(line)
            print(line)


if __name__ == "__main__":
    main(sys.argv[1])
