#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import re
import shutil
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent
WEB_DIR = ROOT / "web"
OUT_DIR = ROOT / "public"

REPO = "xueh0635-design/lib-hfut"
BRANCH = "master"
SOURCE_REPO = "lib-hfut/lib-hfut"

EXCLUDED_ROOTS = {
    ".git",
    ".github",
    ".vscode",
    ".circleci",
    "__pycache__",
    "docs",
    "site",
    "public",
    "web",
}

COURSE_RE = re.compile(r"^(?P<title>.+)_(?P<code>[A-Za-z0-9]+)$")


def display_info(name: str) -> tuple[str, str]:
    match = COURSE_RE.match(name)
    if match:
        return match.group("title"), match.group("code")
    return name.strip("_") or name, ""


def build_node(path: Path) -> dict:
    rel = path.relative_to(ROOT).as_posix()

    if path.is_dir():
        children = []
        try:
            entries = list(os.scandir(path))
        except OSError:
            entries = []

        entries.sort(
            key=lambda item: (
                0 if item.is_dir(follow_symlinks=False) else 1,
                item.name.casefold(),
            )
        )

        for entry in entries:
            if entry.name in {".DS_Store", "Thumbs.db"}:
                continue
            child = Path(entry.path)
            if entry.is_dir(follow_symlinks=False):
                children.append(build_node(child))
            elif entry.is_file(follow_symlinks=False):
                try:
                    size = entry.stat(follow_symlinks=False).st_size
                except OSError:
                    size = 0
                children.append(
                    {
                        "type": "file",
                        "name": entry.name,
                        "path": child.relative_to(ROOT).as_posix(),
                        "size": size,
                    }
                )

        file_count = sum(
            1 if child["type"] == "file" else child.get("file_count", 0)
            for child in children
        )
        dir_count = sum(
            0 if child["type"] == "file" else 1 + child.get("dir_count", 0)
            for child in children
        )

        return {
            "type": "dir",
            "name": path.name,
            "path": rel,
            "file_count": file_count,
            "dir_count": dir_count,
            "children": children,
        }

    raise ValueError(f"Unsupported path: {path}")


def main() -> None:
    if not WEB_DIR.exists():
        raise SystemExit("web/ directory does not exist")

    if OUT_DIR.exists():
        shutil.rmtree(OUT_DIR)
    shutil.copytree(WEB_DIR, OUT_DIR)

    collections = []
    for entry in sorted(ROOT.iterdir(), key=lambda p: p.name.casefold()):
        if not entry.is_dir() or entry.name in EXCLUDED_ROOTS or entry.name.startswith("."):
            continue

        node = build_node(entry)
        title, code = display_info(entry.name)
        node["title"] = title
        node["code"] = code
        node["is_course"] = bool(code)
        collections.append(node)

    payload = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "repo": REPO,
        "branch": BRANCH,
        "source_repo": SOURCE_REPO,
        "collections": collections,
    }

    data_dir = OUT_DIR / "data"
    data_dir.mkdir(parents=True, exist_ok=True)
    with (data_dir / "catalog.json").open("w", encoding="utf-8") as fp:
        json.dump(payload, fp, ensure_ascii=False, separators=(",", ":"))

    (OUT_DIR / ".nojekyll").write_text("", encoding="utf-8")

    total_files = sum(item["file_count"] for item in collections)
    print(f"Generated {len(collections)} collections and {total_files} files.")


if __name__ == "__main__":
    main()
