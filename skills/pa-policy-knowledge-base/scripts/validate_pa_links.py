#!/usr/bin/env python3
"""
Validate that URLs belong to Pennsylvania official government sources.
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path
from urllib.parse import urlparse

URL_RE = re.compile(r"https?://[^\s<>\]\[\"')]+")

DEFAULT_ALLOWED_SUFFIXES = (
    "pa.gov",
    "state.pa.us",
    "pacodeandbulletin.gov",
    "legis.state.pa.us",
)


def extract_urls_from_text(text: str) -> list[str]:
    return URL_RE.findall(text)


def load_urls(files: list[str], direct_urls: list[str]) -> list[str]:
    urls: list[str] = []

    for item in direct_urls:
        urls.extend(extract_urls_from_text(item) or [item.strip()])

    for file_path in files:
        text = Path(file_path).read_text(encoding="utf-8")
        urls.extend(extract_urls_from_text(text))

    # Deduplicate while preserving order.
    seen: set[str] = set()
    result: list[str] = []
    for url in urls:
        clean = url.strip().rstrip(".,;")
        if clean and clean not in seen:
            seen.add(clean)
            result.append(clean)
    return result


def is_allowed_host(hostname: str, allowed_suffixes: tuple[str, ...]) -> bool:
    host = hostname.lower().strip(".")
    for suffix in allowed_suffixes:
        suffix = suffix.lower().strip(".")
        if host == suffix or host.endswith("." + suffix):
            return True
    return False


def validate_url(url: str, allowed_suffixes: tuple[str, ...], allow_http: bool) -> tuple[bool, list[str]]:
    reasons: list[str] = []
    parsed = urlparse(url)

    if not parsed.scheme:
        reasons.append("missing scheme")
        return False, reasons

    if parsed.scheme not in {"https", "http"}:
        reasons.append(f"unsupported scheme: {parsed.scheme}")

    if parsed.scheme == "http" and not allow_http:
        reasons.append("http is not allowed; require https")

    hostname = parsed.hostname
    if not hostname:
        reasons.append("missing hostname")
        return False, reasons

    if not is_allowed_host(hostname, allowed_suffixes):
        reasons.append(f"host not in Pennsylvania official allowlist: {hostname}")

    return (len(reasons) == 0), reasons


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Validate URLs against Pennsylvania official-source domain allowlist."
    )
    parser.add_argument(
        "--file",
        action="append",
        default=[],
        help="Path to text/markdown/json file containing URLs.",
    )
    parser.add_argument(
        "--url",
        action="append",
        default=[],
        help="URL string (repeatable).",
    )
    parser.add_argument(
        "--allow-http",
        action="store_true",
        help="Allow http URLs (not recommended).",
    )
    parser.add_argument(
        "--allow-suffix",
        action="append",
        default=[],
        help="Additional allowed hostname suffix (repeatable).",
    )
    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()

    allowed = tuple(DEFAULT_ALLOWED_SUFFIXES + tuple(args.allow_suffix))
    urls = load_urls(args.file, args.url)

    if not urls:
        print("No URLs found. Provide --url or --file with URLs.", file=sys.stderr)
        return 2

    failures = 0
    print(f"Validated {len(urls)} URL(s)")
    print("Allowed suffixes: " + ", ".join(allowed))
    print("-" * 72)

    for url in urls:
        ok, reasons = validate_url(url, allowed, args.allow_http)
        if ok:
            print(f"OK   {url}")
        else:
            failures += 1
            print(f"FAIL {url}")
            for reason in reasons:
                print(f"     - {reason}")

    print("-" * 72)
    print(f"Result: {len(urls) - failures} passed, {failures} failed")
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
