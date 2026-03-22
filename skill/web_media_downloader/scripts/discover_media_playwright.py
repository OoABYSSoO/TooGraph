#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import re
import sys
from typing import Any


MEDIA_EXT_RE = re.compile(
    r"\.(avif|bmp|gif|heic|ico|jpe?g|png|svg|tiff?|webp|3gp|avi|flv|m4v|mkv|mov|mp4|mpeg|mpg|ogv|webm|m3u8|mpd|aac|flac|m4a|mp3|oga|ogg|opus|wav)(\?|#|$)",
    re.IGNORECASE,
)


def main() -> int:
    args = _parse_args()
    try:
        from playwright.sync_api import sync_playwright
    except Exception as exc:
        print(f"Python Playwright is not available: {exc}", file=sys.stderr)
        return 2

    items: dict[str, dict[str, str]] = {}

    def add(url: str, source: str, kind: str = "") -> None:
        if not url or url.startswith(("data:", "blob:")):
            return
        if not MEDIA_EXT_RE.search(url) and not kind:
            return
        items[url] = {"url": url, "kind": kind or _kind_for(url), "source": source}

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        page = browser.new_page(user_agent="GraphiteUI/1.0 web_media_downloader")

        def on_response(response: Any) -> None:
            content_type = (response.headers.get("content-type") or "").lower()
            if content_type.startswith("image/"):
                add(response.url, "network", "image")
            elif content_type.startswith("video/"):
                add(response.url, "network", "video")
            elif content_type.startswith("audio/"):
                add(response.url, "network", "audio")
            else:
                add(response.url, "network")

        page.on("response", on_response)
        try:
            page.goto(args.url, wait_until="networkidle", timeout=45_000)
        except Exception:
            page.goto(args.url, wait_until="domcontentloaded", timeout=45_000)
        for _ in range(max(0, args.scrolls)):
            page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
            page.wait_for_timeout(args.wait_ms)
        for item in page.evaluate(_DOM_DISCOVERY_SCRIPT):
            add(str(item.get("url") or ""), str(item.get("source") or "dom"))
        browser.close()

    print(json.dumps([item for item in items.values() if item.get("kind")], ensure_ascii=False))
    return 0


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("url")
    parser.add_argument("--scrolls", type=int, default=4)
    parser.add_argument("--wait-ms", type=int, default=1000)
    return parser.parse_args()


def _kind_for(url: str) -> str:
    path = url.split("?", 1)[0].split("#", 1)[0].lower()
    if re.search(r"\.(avif|bmp|gif|heic|ico|jpe?g|png|svg|tiff?|webp)$", path):
        return "image"
    if re.search(r"\.(3gp|avi|flv|m4v|mkv|mov|mp4|mpeg|mpg|ogv|webm|m3u8|mpd)$", path):
        return "video"
    if re.search(r"\.(aac|flac|m4a|mp3|oga|ogg|opus|wav)$", path):
        return "audio"
    return ""


_DOM_DISCOVERY_SCRIPT = r"""
() => {
  const out = [];
  const attrs = [
    "src",
    "href",
    "poster",
    "content",
    "data-src",
    "data-original",
    "data-lazy-src",
    "data-url",
    "data-full",
    "data-image",
    "data-video",
    "data-bg",
    "data-background",
  ];
  const push = (url, source) => {
    if (!url) return;
    try {
      out.push({ url: new URL(url, document.baseURI).href, source });
    } catch {}
  };
  const pushSrcset = (value, source) => {
    String(value || "")
      .split(",")
      .map((part) => part.trim().split(/\s+/, 1)[0])
      .filter(Boolean)
      .forEach((url) => push(url, source));
  };
  document.querySelectorAll("*").forEach((element) => {
    attrs.forEach((attr) => push(element.getAttribute(attr), `dom:${element.tagName.toLowerCase()}[${attr}]`));
    pushSrcset(element.getAttribute("srcset"), `dom:${element.tagName.toLowerCase()}[srcset]`);
    const background = getComputedStyle(element).backgroundImage || "";
    for (const match of background.matchAll(/url\(["']?(.*?)["']?\)/g)) push(match[1], "dom:computed-style");
  });
  document.querySelectorAll('script[type*="ld+json"]').forEach((script) => {
    const text = script.textContent || "";
    for (const match of text.matchAll(/https?:\/\/[^"'<>\\)\s]+/g)) push(match[0], "dom:json-ld");
  });
  return out;
}
"""


if __name__ == "__main__":
    raise SystemExit(main())
