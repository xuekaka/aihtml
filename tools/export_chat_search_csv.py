#!/usr/bin/env python3
from __future__ import annotations

import csv
import json
import re
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo


SEARCH_ASSIGN_RE = re.compile(
    r'^\(window\.__CHAT_VIEWER_SEARCH_MONTHS__ = window\.__CHAT_VIEWER_SEARCH_MONTHS__ \|\| \{\}\)\["[^"]+"\] = (.*);\s*$',
    re.S,
)


def parse_search_file(path: Path) -> list[list[object]]:
    text = path.read_text("utf-8").strip()
    match = SEARCH_ASSIGN_RE.match(text)
    if not match:
        raise ValueError(f"Unrecognized search shard format: {path}")
    return json.loads(match.group(1))


def format_day(ts_unix: int, tz_name: str) -> str:
    tz = ZoneInfo(tz_name)
    return datetime.fromtimestamp(ts_unix, tz).strftime("%Y-%m-%d")


def export_csv(search_dir: Path, out_path: Path, tz_name: str) -> int:
    total = 0
    with out_path.open("w", encoding="utf-8", newline="") as fh:
        writer = csv.writer(fh)
        writer.writerow(["message_id", "chunk_id", "ts_unix", "day", "sender", "body"])

        for shard in sorted(search_dir.glob("*.js")):
            for record in parse_search_file(shard):
                message_id, chunk_id, ts_unix, sender, body, _lower = record
                writer.writerow(
                    [
                        message_id,
                        int(chunk_id),
                        int(ts_unix),
                        format_day(int(ts_unix), tz_name),
                        sender or "",
                        body or "",
                    ]
                )
                total += 1
    return total


def main() -> None:
    repo = Path(__file__).resolve().parents[1]
    search_dir = repo / "viewer-data" / "search"
    out_path = repo / "chat_search_messages.csv"
    tz_name = "Asia/Shanghai"

    count = export_csv(search_dir, out_path, tz_name)
    print(f"wrote {count} rows to {out_path}")


if __name__ == "__main__":
    main()
