#!/usr/bin/env python3
"""Extract exam question banks into a browser-friendly JS data file."""

from __future__ import annotations

import json
import re
from datetime import datetime
from pathlib import Path

from openpyxl import load_workbook


SOURCE_DIR = Path(
    "/Users/higher/Library/CloudStorage/OneDrive-个人/02个人文档资料/01学习资料/"
    "交易员考试/交易员考试"
)
SOURCES = {
    "中级工": SOURCE_DIR / "电力交易员（中级工）题库.xlsx",
    "高级工": SOURCE_DIR / "电力交易员（高级工）题库.xlsx",
    "技师": SOURCE_DIR / "电力交易员（技师）题库.xlsx",
}
ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "data" / "questions.js"
DATA_DIR = OUTPUT.parent
INDEX = ROOT / "index.html"
SERVICE_WORKER = ROOT / "service-worker.js"
CHUNK_SIZE = 180
LETTERS = "ABCDEFGHIJ"
SCRIPT_BLOCK_RE = re.compile(
    r'\n  <script src="data/meta\.js"></script>\n'
    r"  <script>window\.QUESTION_PARTS = \[\];</script>\n"
    r'(?:  <script src="data/questions-\d{2}\.js"></script>\n)+'
    r"  <script>window\.QUESTION_BANK = \{ meta: window\.QUESTION_META, questions: window\.QUESTION_PARTS\.flat\(\) \};</script>"
)
APP_SHELL_RE = re.compile(r"const APP_SHELL = \[\n.*?\n\];", re.S)


def clean(value: object) -> str:
    if value is None:
        return ""
    return str(value).strip()


def compact(value: object) -> str:
    return re.sub(r"\s+", "", clean(value))


def normalize_answer(value: object, qtype: str) -> list[str]:
    text = compact(value)
    if qtype == "判断":
        return [text.replace("正确", "对").replace("错误", "错")]
    return [letter for letter in LETTERS if letter in text.upper()]


def question_scope(levels: list[str]) -> str:
    if levels == ["技师"]:
        return "技师新增"
    if "技师" in levels and "高级工" not in levels:
        return "技师新增"
    if len(levels) == 1:
        return f"{levels[0]}独有"
    return "+".join(levels)


def extract_bank(level: str, source: Path) -> list[dict[str, object]]:
    workbook = load_workbook(source, read_only=True, data_only=True)
    questions = []

    for sheet in workbook.worksheets:
        for row_number, row in enumerate(sheet.iter_rows(min_row=2, values_only=True), start=2):
            stem = clean(row[0] if len(row) > 0 else "")
            qtype = clean(row[1] if len(row) > 1 else "")
            answer = clean(row[2] if len(row) > 2 else "")
            if not stem or not qtype or not answer:
                continue

            options = []
            if qtype in {"单选", "多选"}:
                for idx, value in enumerate(row[3:13]):
                    label = LETTERS[idx]
                    text = clean(value)
                    if text:
                        options.append({"label": label, "text": text})
            elif qtype == "判断":
                options = [{"label": "对", "text": "对"}, {"label": "错", "text": "错"}]

            questions.append(
                {
                    "level": level,
                    "id": f"{level}-{sheet.title}-{row_number}",
                    "type": qtype,
                    "stem": stem,
                    "options": options,
                    "answer": normalize_answer(answer, qtype),
                }
            )

    return questions


def exact_key(question: dict[str, object]) -> tuple[object, ...]:
    options = tuple((option["label"], compact(option["text"])) for option in question["options"])  # type: ignore[index]
    return (
        compact(question["stem"]),
        question["type"],
        tuple(question["answer"]),  # type: ignore[arg-type]
        options,
    )


def extract() -> dict[str, object]:
    raw_questions = []
    source_counts: dict[str, int] = {}
    for level, source in SOURCES.items():
        bank_questions = extract_bank(level, source)
        raw_questions.extend(bank_questions)
        source_counts[level] = len(bank_questions)

    merged: dict[tuple[object, ...], dict[str, object]] = {}
    for question in raw_questions:
        key = exact_key(question)
        if key not in merged:
            merged[key] = {
                "stem": question["stem"],
                "type": question["type"],
                "options": question["options"],
                "answer": question["answer"],
                "levels": [],
            }

        item = merged[key]
        level = str(question["level"])
        if level not in item["levels"]:  # type: ignore[operator]
            item["levels"].append(level)  # type: ignore[index,union-attr]

    level_order = {"中级工": 0, "高级工": 1, "技师": 2}
    questions: list[dict[str, object]] = []
    for index, item in enumerate(merged.values(), start=1):
        levels = sorted(item["levels"], key=lambda value: level_order[str(value)])  # type: ignore[arg-type]
        item["levels"] = levels
        item["scope"] = question_scope([str(level) for level in levels])
        item["id"] = f"Q{index:04d}"
        questions.append(item)

    by_type: dict[str, int] = {}
    by_scope: dict[str, int] = {}
    for question in questions:
        qtype = str(question["type"])
        by_type[qtype] = by_type.get(qtype, 0) + 1
        scope = str(question["scope"])
        by_scope[scope] = by_scope.get(scope, 0) + 1

    return {
        "meta": {
            "title": "电力交易员中级工+高级工+技师题库",
            "sourceFiles": [source.name for source in SOURCES.values()],
            "generatedAt": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "rawTotal": len(raw_questions),
            "total": len(questions),
            "deduped": len(raw_questions) - len(questions),
            "sourceCounts": source_counts,
            "byType": by_type,
            "byScope": by_scope,
        },
        "questions": questions,
    }


def main() -> None:
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    data = extract()
    payload = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
    OUTPUT.write_text(f"window.QUESTION_BANK = {payload};\n", encoding="utf-8")
    write_split_files(data)
    update_index_script_tags(data)
    update_service_worker(data)
    meta = data["meta"]
    print(f"Wrote {OUTPUT}")
    print(f"Wrote split data chunks: {(len(data['questions']) + CHUNK_SIZE - 1) // CHUNK_SIZE}")
    print(f"Total: {meta['total']} | By type: {meta['byType']}")


def write_split_files(data: dict[str, object]) -> None:
    questions = data["questions"]
    meta = data["meta"]
    for old_chunk in DATA_DIR.glob("questions-*.js"):
        old_chunk.unlink()

    (DATA_DIR / "meta.js").write_text(
        "window.QUESTION_META = "
        + json.dumps(meta, ensure_ascii=False, separators=(",", ":"))
        + ";\n",
        encoding="utf-8",
    )
    for index in range(0, len(questions), CHUNK_SIZE):  # type: ignore[arg-type]
        part_no = index // CHUNK_SIZE + 1
        chunk = questions[index : index + CHUNK_SIZE]  # type: ignore[index]
        (DATA_DIR / f"questions-{part_no:02d}.js").write_text(
            "window.QUESTION_PARTS.push("
            + json.dumps(chunk, ensure_ascii=False, separators=(",", ":"))
            + ");\n",
            encoding="utf-8",
        )


def chunk_count(data: dict[str, object]) -> int:
    return (len(data["questions"]) + CHUNK_SIZE - 1) // CHUNK_SIZE  # type: ignore[arg-type]


def split_script_block(data: dict[str, object]) -> str:
    script_tags = [
        '  <script src="data/meta.js"></script>',
        '  <script>window.QUESTION_PARTS = [];</script>',
    ]
    for part_no in range(1, chunk_count(data) + 1):
        script_tags.append(f'  <script src="data/questions-{part_no:02d}.js"></script>')
    script_tags.append(
        '  <script>window.QUESTION_BANK = { meta: window.QUESTION_META, questions: window.QUESTION_PARTS.flat() };</script>'
    )
    return "\n".join(script_tags)


def update_index_script_tags(data: dict[str, object]) -> None:
    html = INDEX.read_text(encoding="utf-8")
    updated = SCRIPT_BLOCK_RE.sub("\n" + split_script_block(data), html)
    INDEX.write_text(updated, encoding="utf-8")


def update_service_worker(data: dict[str, object]) -> None:
    urls = [
        "./",
        "./index.html",
        "./manifest.webmanifest",
        "./icon.svg",
        "./quiz-core.js",
        "./data/meta.js",
        "./data/questions.js",
    ]
    urls.extend(f"./data/questions-{part_no:02d}.js" for part_no in range(1, chunk_count(data) + 1))
    block = "const APP_SHELL = [\n" + ",\n".join(f'  "{url}"' for url in urls) + "\n];"
    script = SERVICE_WORKER.read_text(encoding="utf-8")
    script = re.sub(r'const CACHE_NAME = ".*?";', 'const CACHE_NAME = "power-trader-quiz-v7";', script)
    script = APP_SHELL_RE.sub(block, script)
    SERVICE_WORKER.write_text(script, encoding="utf-8")


if __name__ == "__main__":
    main()
