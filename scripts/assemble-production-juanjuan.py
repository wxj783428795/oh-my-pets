#!/usr/bin/env python3
"""Deterministically assemble ImageGen 2 pose sheets into the production pet pack."""

from __future__ import annotations

import argparse
from collections import deque
import json
from pathlib import Path
from typing import Any

from PIL import Image, ImageDraw


PALETTE = [
    (233, 133, 63),
    (206, 91, 24),
    (255, 242, 210),
    (74, 46, 38),
    (46, 170, 163),
    (239, 166, 160),
    (255, 255, 255),
]
ACTION_CONFIG: dict[str, dict[str, Any]] = {
    "intro": {
        "count": 8,
        "grid": (4, 2),
        "loop": False,
        "height": 220,
        "bottoms": [246, 258, 272, 284, 288, 288, 288, 288],
        "durations": [90, 90, 100, 100, 120, 140, 220, 320],
        "cues": [("land", 300)],
    },
    "idle": {
        "count": 6,
        "grid": (3, 2),
        "loop": True,
        "height": 235,
        "durations": [580, 100, 90, 100, 100, 480],
        "cues": [("blink", 580), ("tail-flick", 580)],
    },
    "walk_left": {
        "count": 6,
        "grid": (3, 2),
        "loop": True,
        "height": 215,
        "durations": [110] * 6,
        "cues": [("step-1", 110), ("step-2", 440)],
    },
    "walk_right": {
        "count": 6,
        "grid": (3, 2),
        "loop": True,
        "height": 215,
        "durations": [110] * 6,
        "cues": [("step-1", 110), ("step-2", 440)],
    },
    "sleep": {
        "count": 5,
        "grid": (5, 1),
        "loop": True,
        "height": 150,
        "durations": [380] * 5,
        "cues": [("settle", 380)],
    },
    "drag_hold": {
        "count": 2,
        "grid": (2, 1),
        "loop": True,
        "height": 225,
        "bottoms": [246, 246],
        "durations": [240, 240],
        "cues": [],
    },
    "fall": {
        "count": 3,
        "grid": (3, 1),
        "loop": True,
        "height": 200,
        "bottoms": [264, 270, 264],
        "durations": [120, 120, 120],
        "cues": [("drop", 40)],
    },
    "land": {
        "count": 4,
        "grid": (4, 1),
        "loop": False,
        "height": 207,
        "durations": [80, 100, 120, 200],
        "cues": [("impact", 80)],
        "separate_props": True,
        "secondary_ratio": 0.008,
    },
    "tap_react": {
        "count": 5,
        "grid": (5, 1),
        "loop": False,
        "height": 230,
        "durations": [120, 100, 120, 140, 240],
        "cues": [("react", 120)],
    },
    "feed_react": {
        "count": 7,
        "grid": (4, 2),
        "loop": False,
        "height": 230,
        "durations": [140, 140, 160, 160, 180, 220, 320],
        "cues": [("sniff", 140), ("grab", 600)],
        "separate_props": True,
    },
    "curious": {
        "count": 5,
        "grid": (5, 1),
        "loop": True,
        "height": 230,
        "durations": [220, 220, 220, 220, 320],
        "cues": [("sniff", 440)],
    },
    "edge_play": {
        "count": 5,
        "grid": (5, 1),
        "loop": True,
        "height": 230,
        "durations": [220, 220, 220, 220, 320],
        "cues": [("peek", 440)],
    },
    "quiet_idle": {
        "count": 4,
        "grid": (4, 1),
        "loop": True,
        "height": 210,
        "durations": [800, 180, 220, 800],
        "cues": [("slow-blink", 800)],
    },
    "rare_1": {
        "count": 10,
        "grid": (5, 2),
        "loop": False,
        "height": 230,
        "durations": [180, 160, 160, 160, 180, 200, 200, 220, 300, 500],
        "cues": [("grab", 340), ("crumple", 840)],
        "separate_props": True,
        "source_order": [9, 0, 1, 2, 3, 4, 5, 7, 6, 8],
    },
    "rare_2": {
        "count": 10,
        "grid": (5, 2),
        "loop": False,
        "height": 208,
        "durations": [120, 120, 120, 140, 160, 180, 200, 220, 300, 500],
        "cues": [("slip", 240), ("catch", 940)],
    },
}
ATLAS_WIDTH = 2560
BASELINE_Y = 288


def chroma_alpha(red: int, green: int, blue: int) -> int:
    blue_excess = blue - max(red, green)
    if blue_excess >= 80:
        return 0
    if blue_excess <= 20:
        return 255
    return round(255 * (80 - blue_excess) / 60)


def connected_component_mask(
    alpha: Image.Image,
    *,
    keep_secondary: bool,
    secondary_ratio: float,
) -> Image.Image:
    width, height = alpha.size
    source = alpha.load()
    visited = bytearray(width * height)
    components: list[list[tuple[int, int]]] = []
    for y in range(height):
        for x in range(width):
            flat_index = y * width + x
            if visited[flat_index] or source[x, y] < 24:
                continue
            queue = deque([(x, y)])
            visited[flat_index] = 1
            component: list[tuple[int, int]] = []
            while queue:
                current_x, current_y = queue.popleft()
                component.append((current_x, current_y))
                for next_x, next_y in (
                    (current_x - 1, current_y),
                    (current_x + 1, current_y),
                    (current_x, current_y - 1),
                    (current_x, current_y + 1),
                ):
                    if not (0 <= next_x < width and 0 <= next_y < height):
                        continue
                    next_index = next_y * width + next_x
                    if visited[next_index] or source[next_x, next_y] < 24:
                        continue
                    visited[next_index] = 1
                    queue.append((next_x, next_y))
            components.append(component)
    if not components:
        raise ValueError("slot contains no visible pose")
    largest = max(len(component) for component in components)
    keep_minimum = max(32, round(largest * secondary_ratio))
    mask = Image.new("L", alpha.size)
    output = mask.load()
    for component in components:
        if len(component) == largest or (
            keep_secondary and len(component) >= keep_minimum
        ):
            for x, y in component:
                output[x, y] = source[x, y]
    return mask


def quantize_flat(source: Image.Image, alpha: Image.Image) -> Image.Image:
    palette_image = Image.new("P", (1, 1))
    flat_palette = [channel for color in PALETTE for channel in color]
    palette_image.putpalette(flat_palette + [0] * (768 - len(flat_palette)))
    quantized = source.convert("RGB").quantize(
        palette=palette_image,
        dither=Image.Dither.NONE,
    ).convert("RGB")
    red, green, blue = quantized.split()
    sprite = Image.merge("RGBA", (red, green, blue, alpha))
    cleaned = Image.new("RGBA", sprite.size)
    cleaned.alpha_composite(sprite)
    return cleaned


def extract_source_poses(strip_path: Path, config: dict[str, Any]) -> list[Image.Image]:
    strip = Image.open(strip_path).convert("RGBA")
    columns, rows = config["grid"]
    slot_width = strip.width / columns
    slot_height = strip.height / rows
    poses: list[Image.Image] = []
    for index in range(config["count"]):
        column = index % columns
        row = index // columns
        left = round(column * slot_width)
        top = round(row * slot_height)
        right = round((column + 1) * slot_width)
        bottom = round((row + 1) * slot_height)
        slot = strip.crop((left, top, right, bottom))
        pixels = slot.load()
        alpha = Image.new("L", slot.size)
        alpha_pixels = alpha.load()
        for y in range(slot.height):
            for x in range(slot.width):
                red, green, blue, _ = pixels[x, y]
                alpha_pixels[x, y] = chroma_alpha(red, green, blue)
        alpha = connected_component_mask(
            alpha,
            keep_secondary=config.get("separate_props", False),
            secondary_ratio=config.get("secondary_ratio", 0.03),
        )
        flat = quantize_flat(slot, alpha)
        bounds = flat.getchannel("A").getbbox()
        if bounds is None:
            raise ValueError(f"{strip_path.name} slot {index} is empty")
        poses.append(flat.crop(bounds))
    return poses


def normalize_poses(
    poses: list[Image.Image],
    config: dict[str, Any],
) -> list[tuple[Image.Image, int, int]]:
    median_height = sorted(pose.height for pose in poses)[len(poses) // 2]
    scale = config["height"] / median_height
    bottoms = config.get("bottoms", [BASELINE_Y] * len(poses))
    normalized: list[tuple[Image.Image, int, int]] = []
    for index, pose in enumerate(poses):
        width = max(1, round(pose.width * scale))
        height = max(1, round(pose.height * scale))
        if width > 300 or height > 260:
            raise ValueError(
                f"normalized pose {index} exceeds the 320×320 safe canvas: {width}×{height}",
            )
        resized = pose.resize((width, height), Image.Resampling.LANCZOS)
        alpha = resized.getchannel("A").point(lambda value: 0 if value < 12 else value)
        resized.putalpha(alpha)
        bounds = resized.getchannel("A").getbbox()
        if bounds is None:
            raise ValueError(f"normalized pose {index} became empty")
        resized = resized.crop(bounds)
        offset_x = round(160 - resized.width / 2)
        offset_y = bottoms[index] - resized.height
        if offset_x < 0 or offset_y < 0 or offset_x + resized.width > 320:
            raise ValueError(
                f"normalized pose {index} falls outside the 320×320 canvas: "
                f"{resized.size} at ({offset_x}, {offset_y})",
            )
        normalized.append((resized, offset_x, offset_y))
    return normalized


def pack_frames(
    frames: list[tuple[str, Image.Image, int, int]],
) -> tuple[Image.Image, dict[str, dict[str, int]]]:
    x = 0
    y = 0
    row_height = 0
    placements: list[tuple[str, Image.Image, int, int, int, int]] = []
    for name, image, offset_x, offset_y in sorted(
        frames,
        key=lambda frame: (-frame[1].height, -frame[1].width, frame[0]),
    ):
        if x > 0 and x + image.width > ATLAS_WIDTH:
            x = 0
            y += row_height + 2
            row_height = 0
        placements.append((name, image, x, y, offset_x, offset_y))
        x += image.width + 2
        row_height = max(row_height, image.height)
    atlas_height = y + row_height
    if atlas_height > 2048:
        raise ValueError(
            f"atlas exceeds preferred 2560×2048 budget: {atlas_height}px high",
        )
    atlas = Image.new("RGBA", (ATLAS_WIDTH, atlas_height))
    placement_by_name = {
        name: (image, atlas_x, atlas_y, offset_x, offset_y)
        for name, image, atlas_x, atlas_y, offset_x, offset_y in placements
    }
    for name, image, atlas_x, atlas_y, offset_x, offset_y in placements:
        atlas.alpha_composite(image, (atlas_x, atlas_y))
    manifest: dict[str, dict[str, int]] = {}
    frame_names = [name for name, _, _, _ in frames]
    ordered_names = ["idle_00", *[name for name in frame_names if name != "idle_00"]]
    for name in ordered_names:
        image, atlas_x, atlas_y, offset_x, offset_y = placement_by_name[name]
        manifest[name] = {
            "x": atlas_x,
            "y": atlas_y,
            "w": image.width,
            "h": image.height,
            "offsetX": offset_x,
            "offsetY": offset_y,
        }
    return atlas, manifest


def compose_canvas(image: Image.Image, offset_x: int, offset_y: int) -> Image.Image:
    canvas = Image.new("RGBA", (320, 320))
    canvas.alpha_composite(image, (offset_x, offset_y))
    return canvas


def write_contact_sheet(
    action_frames: dict[str, list[tuple[Image.Image, int, int]]],
    output: Path,
) -> None:
    cell = 112
    label_width = 120
    columns = 10
    sheet = Image.new(
        "RGB",
        (label_width + columns * cell, len(action_frames) * cell),
        (245, 242, 235),
    )
    draw = ImageDraw.Draw(sheet)
    for row, (action_name, frames) in enumerate(action_frames.items()):
        draw.text((8, row * cell + 48), action_name, fill=(74, 46, 38))
        for column, (image, offset_x, offset_y) in enumerate(frames):
            canvas = compose_canvas(image, offset_x, offset_y)
            preview = canvas.resize((cell, cell), Image.Resampling.LANCZOS)
            sheet.paste(preview, (label_width + column * cell, row * cell), preview)
            draw.text(
                (label_width + column * cell + 4, row * cell + 4),
                f"{column:02}",
                fill=(74, 46, 38),
            )
    output.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(output, optimize=True)


def labeled_preview_frame(
    action_name: str,
    image: Image.Image,
    offset_x: int,
    offset_y: int,
) -> Image.Image:
    frame = Image.new("RGB", (420, 360), (245, 242, 235))
    canvas = compose_canvas(image, offset_x, offset_y)
    frame.paste(canvas, (50, 28), canvas)
    ImageDraw.Draw(frame).text((16, 336), action_name, fill=(74, 46, 38))
    return frame


def write_motion_preview(
    action_frames: dict[str, list[tuple[Image.Image, int, int]]],
    output: Path,
    selected_actions: list[str] | None = None,
) -> None:
    preview_frames: list[Image.Image] = []
    durations: list[int] = []
    action_names = selected_actions or list(action_frames)
    for action_name in action_names:
        config = ACTION_CONFIG[action_name]
        for (image, offset_x, offset_y), duration in zip(
            action_frames[action_name],
            config["durations"],
            strict=True,
        ):
            preview_frames.append(
                labeled_preview_frame(action_name, image, offset_x, offset_y),
            )
            durations.append(duration)
        if not config["loop"]:
            durations[-1] += 1800 if selected_actions else 280
    output.parent.mkdir(parents=True, exist_ok=True)
    preview_frames[0].save(
        output,
        save_all=True,
        append_images=preview_frames[1:],
        duration=durations,
        loop=0,
        disposal=2,
        optimize=True,
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--run-dir", type=Path, required=True)
    parser.add_argument("--pack-dir", type=Path, required=True)
    parser.add_argument("--qa-dir", type=Path, required=True)
    args = parser.parse_args()

    action_frames: dict[str, list[tuple[Image.Image, int, int]]] = {}
    packed_frames: list[tuple[str, Image.Image, int, int]] = []
    actions: dict[str, Any] = {}
    for action_name, config in ACTION_CONFIG.items():
        strip_path = args.run_dir / "strips" / f"{action_name}.png"
        source_poses = extract_source_poses(strip_path, config)
        source_order = config.get("source_order")
        if source_order is not None:
            source_poses = [source_poses[index] for index in source_order]
        normalized = normalize_poses(source_poses, config)
        action_frames[action_name] = normalized
        frames = []
        for index, ((image, offset_x, offset_y), duration) in enumerate(
            zip(normalized, config["durations"], strict=True),
        ):
            frame_name = f"{action_name}_{index:02}"
            packed_frames.append((frame_name, image, offset_x, offset_y))
            frames.append({"ref": frame_name, "durationMs": duration})
        actions[action_name] = {
            "loop": config["loop"],
            "frames": frames,
            "cuePoints": [
                {"name": name, "timeMs": time_ms}
                for name, time_ms in config["cues"]
            ],
        }

    atlas, atlas_frames = pack_frames(packed_frames)
    args.pack_dir.mkdir(parents=True, exist_ok=True)
    atlas.save(args.pack_dir / "atlas.png", optimize=True)
    atlas_manifest = {
        "imagePath": "atlas.png",
        "pixelWidth": atlas.width,
        "pixelHeight": atlas.height,
        "frames": atlas_frames,
    }
    (args.pack_dir / "atlas.json").write_text(
        json.dumps(atlas_manifest, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    pet_manifest = {
        "schemaVersion": 1,
        "id": "juanjuan-cat",
        "version": "1.0.0",
        "displayName": "卷卷",
        "description": "一只安静、好奇、偶尔有点笨拙的短腿橘白猫。",
        "author": {"name": "Oh My Pets"},
        "minAppVersion": "0.1.0",
        "renderer": "sprite-atlas-v1",
        "canvas": {"width": 320, "height": 320},
        "atlasPath": "atlas.json",
        "layout": {
            "baseline": {"x": 160, "y": BASELINE_Y},
            "hitbox": {"x": 62, "y": 54, "width": 196, "height": 234},
            "dropZone": {"x": 88, "y": 116, "width": 144, "height": 124},
            "bubbleAnchor": {"x": 160, "y": 34},
        },
        "actions": actions,
    }
    (args.pack_dir / "pet.json").write_text(
        json.dumps(pet_manifest, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    idle_image, idle_x, idle_y = action_frames["idle"][0]
    compose_canvas(idle_image, idle_x, idle_y).save(
        args.pack_dir / "preview.png",
        optimize=True,
    )
    write_contact_sheet(action_frames, args.qa_dir / "contact-sheet.png")
    write_motion_preview(action_frames, args.qa_dir / "motion-preview.gif")
    write_motion_preview(
        action_frames,
        args.qa_dir / "rare-1.gif",
        selected_actions=["rare_1"],
    )
    write_motion_preview(
        action_frames,
        args.qa_dir / "rare-2.gif",
        selected_actions=["rare_2"],
    )
    print(
        f"assembled {len(packed_frames)} frames into {atlas.width}×{atlas.height} atlas",
    )


if __name__ == "__main__":
    main()
