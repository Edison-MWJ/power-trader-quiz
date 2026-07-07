#!/usr/bin/env python3
"""Build a GitHub Pages-friendly split static site."""

from __future__ import annotations

import base64
import json
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
INDEX = ROOT / "index.html"
QUESTIONS = ROOT / "data" / "questions.js"
ICON = ROOT / "icon.svg"
OUTPUT = ROOT / "dist" / "github_pages_split_v1"
CHUNK_SIZE = 180


SCRIPT_BLOCK_RE = re.compile(
    r'\n  <script src="data/meta\.js"></script>\n'
    r"  <script>window\.QUESTION_PARTS = \[\];</script>\n"
    r'(?:  <script src="data/questions-\d{2}\.js"></script>\n)+'
    r"  <script>window\.QUESTION_BANK = \{ meta: window\.QUESTION_META, questions: window\.QUESTION_PARTS\.flat\(\) \};</script>"
)


def load_bank() -> dict[str, object]:
    text = QUESTIONS.read_text(encoding="utf-8").strip()
    match = re.match(r"window\.QUESTION_BANK\s*=\s*(.*);$", text, re.S)
    if not match:
        raise ValueError("questions.js does not contain window.QUESTION_BANK")
    return json.loads(match.group(1))


def main() -> None:
    bank = load_bank()
    questions = bank["questions"]
    meta = bank["meta"]

    icon = ICON.read_text(encoding="utf-8")
    icon_data = "data:image/svg+xml;base64," + base64.b64encode(icon.encode("utf-8")).decode("ascii")
    html = INDEX.read_text(encoding="utf-8")

    script_tags = [
        '  <script src="data/meta.js"></script>',
        '  <script>window.QUESTION_PARTS = [];</script>',
    ]
    for index in range(0, len(questions), CHUNK_SIZE):
        part_no = index // CHUNK_SIZE + 1
        script_tags.append(f'  <script src="data/questions-{part_no:02d}.js"></script>')
    script_tags.append(
        '  <script>window.QUESTION_BANK = { meta: window.QUESTION_META, questions: window.QUESTION_PARTS.flat() };</script>'
    )

    html = html.replace('  <link rel="manifest" href="manifest.webmanifest">\n', "")
    html = html.replace('<link rel="icon" href="icon.svg" type="image/svg+xml">', f'<link rel="icon" href="{icon_data}" type="image/svg+xml">')
    html = html.replace('<img src="icon.svg" alt="">', f'<img src="{icon_data}" alt="">')
    script_block = "\n".join(script_tags)
    if '  <script src="data/questions.js"></script>' in html:
        html = html.replace('  <script src="data/questions.js"></script>', script_block)
    else:
        html = SCRIPT_BLOCK_RE.sub("\n" + script_block, html)
    html = html.replace("离线可用</span>", "在线题库</span>")

    service_worker_block = """\n    if ("serviceWorker" in navigator) {\n      navigator.serviceWorker.register("./service-worker.js").catch(() => {});\n    }\n"""
    html = html.replace(service_worker_block, "\n")

    data_dir = OUTPUT / "data"
    data_dir.mkdir(parents=True, exist_ok=True)
    (OUTPUT / "index.html").write_text(html, encoding="utf-8")
    (data_dir / "meta.js").write_text(
        "window.QUESTION_META = "
        + json.dumps(meta, ensure_ascii=False, separators=(",", ":"))
        + ";\n",
        encoding="utf-8",
    )

    for index in range(0, len(questions), CHUNK_SIZE):
        part_no = index // CHUNK_SIZE + 1
        chunk = questions[index : index + CHUNK_SIZE]
        (data_dir / f"questions-{part_no:02d}.js").write_text(
            "window.QUESTION_PARTS.push("
            + json.dumps(chunk, ensure_ascii=False, separators=(",", ":"))
            + ");\n",
            encoding="utf-8",
        )

    print(f"Wrote {OUTPUT}")
    print(f"Chunks: {(len(questions) + CHUNK_SIZE - 1) // CHUNK_SIZE}")


if __name__ == "__main__":
    main()
