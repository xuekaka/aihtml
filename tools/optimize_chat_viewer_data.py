#!/usr/bin/env python3
from __future__ import annotations

import json
import re
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
    chunks_dir = viewer_dir / "chunks"

    meta = load_js_assignment(meta_path)
    message_map = meta.get("messageMap", {})

    type_start_chunks: dict[str, int] = {}

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

        if changed:
            dump_chunk(chunk_path, chunk_id, messages)

    meta.pop("messageMap", None)
    meta.pop("searchMonths", None)
    meta["typeStartChunks"] = type_start_chunks
    dump_js_assignment(meta_path, "window.__CHAT_VIEWER_META__", meta)
    print("optimized meta and chunk metadata")


if __name__ == "__main__":
    main()
