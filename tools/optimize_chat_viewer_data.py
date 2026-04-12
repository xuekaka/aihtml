#!/usr/bin/env python3
from __future__ import annotations

import json
import re
from collections import defaultdict
from pathlib import Path


ASSIGN_RE = re.compile(
    r"^\(window\.__CHAT_VIEWER_CHUNKS__ = window\.__CHAT_VIEWER_CHUNKS__ \|\| \{\}\)\[(\d+)\] = (.*);\s*$",
    re.S,
)


def load_js_assignment(path: Path) -> dict:
    text = path.read_text("utf-8")
    payload = text.split("=", 1)[1].strip().rstrip(";")
    return json.loads(payload)


def dump_js_assignment(path: Path, var_name: str, payload: object) -> None:
    path.write_text(
        f"{var_name} = {json.dumps(payload, ensure_ascii=False, separators=(',', ':'))};\n",
        "utf-8",
    )


def load_chunk(path: Path) -> tuple[int, list[dict]]:
    text = path.read_text("utf-8")
    match = ASSIGN_RE.match(text)
    if not match:
        raise ValueError(f"Unrecognized chunk format: {path}")
    return int(match.group(1)), json.loads(match.group(2))


def dump_chunk(path: Path, chunk_id: int, payload: list[dict]) -> None:
    path.write_text(
        f"(window.__CHAT_VIEWER_CHUNKS__ = window.__CHAT_VIEWER_CHUNKS__ || {{}})[{chunk_id}] = {json.dumps(payload, ensure_ascii=False, separators=(',', ':'))};\n",
        "utf-8",
    )


def main() -> None:
    repo = Path(__file__).resolve().parents[1]
    viewer_dir = repo / "viewer-data"
    meta_path = viewer_dir / "meta.js"
    search_index_path = viewer_dir / "search-index.js"
    search_dir = viewer_dir / "search"
    chunks_dir = viewer_dir / "chunks"

    meta = load_js_assignment(meta_path)
    message_map = meta.get("messageMap", {})

    type_start_chunks: dict[str, int] = {}
    search_by_month: dict[str, list[list[object]]] = defaultdict(list)

    if search_dir.exists():
        for file in search_dir.iterdir():
            if file.is_file():
                file.unlink()
    else:
        search_dir.mkdir(parents=True, exist_ok=True)

    for chunk_path in sorted(chunks_dir.glob("chunk-*.js")):
        chunk_id, messages = load_chunk(chunk_path)
        changed = False

        for message in messages:
            msg_type = message.get("type") or ""
            media = message.get("media") or []

            if msg_type in {"text", "quote"} and "text" not in type_start_chunks:
                type_start_chunks["text"] = chunk_id
            if msg_type == "image" and "image" not in type_start_chunks:
                type_start_chunks["image"] = chunk_id
            if msg_type == "voice" and "voice" not in type_start_chunks:
                type_start_chunks["voice"] = chunk_id
            if msg_type == "video" and "video" not in type_start_chunks:
                type_start_chunks["video"] = chunk_id

            for item in media:
                kind = item.get("kind")
                if kind in {"image", "voice", "video"} and kind not in type_start_chunks:
                    type_start_chunks[kind] = chunk_id

            quote = message.get("quote")
            if quote and quote.get("targetId") and "targetChunk" not in quote:
                target = message_map.get(quote["targetId"])
                quote["targetChunk"] = None if target is None else target.get("chunk")
                changed = True

            if msg_type == "text":
                body = (message.get("searchText") or message.get("text") or "").strip()
                month = (message.get("day") or "")[:7]
                if month:
                    search_by_month[month].append(
                        [
                            message["id"],
                            chunk_id,
                            message.get("timestamp", 0),
                            message.get("sender") or "",
                            body,
                            body.lower(),
                        ]
                    )

        if changed:
            dump_chunk(chunk_path, chunk_id, messages)

    search_months = []
    for month in sorted(search_by_month):
        filename = f"{month}.js"
        records = search_by_month[month]
        (search_dir / filename).write_text(
            f'(window.__CHAT_VIEWER_SEARCH_MONTHS__ = window.__CHAT_VIEWER_SEARCH_MONTHS__ || {{}})["{month}"] = {json.dumps(records, ensure_ascii=False, separators=(",", ":"))};\n',
            "utf-8",
        )
        search_months.append({"month": month, "file": filename, "count": len(records)})

    meta.pop("messageMap", None)
    meta["typeStartChunks"] = type_start_chunks
    meta["searchMonths"] = search_months
    dump_js_assignment(meta_path, "window.__CHAT_VIEWER_META__", meta)

    if search_index_path.exists():
        search_index_path.unlink()

    print(f"optimized meta, wrote {len(search_months)} monthly search files")


if __name__ == "__main__":
    main()
