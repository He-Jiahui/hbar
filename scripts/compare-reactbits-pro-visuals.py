"""Compare the captured React Bits Pro and lumen-app-ui component images.

The audit intentionally keeps source and local screenshots as separate artifacts.
This report normalizes each pair to the source component dimensions so that visual
error remains measurable even when the two implementations have different intrinsic
sizes. Raw dimensions and aspect ratios are retained to make layout drift explicit.
"""

from __future__ import annotations

import argparse
import json
import math
from pathlib import Path

import numpy as np
from PIL import Image, ImageChops


VIEWPORTS = ("desktop", "tablet", "mobile", "stress")
THEMES = ("dark", "light")


def load_rgb(path: Path) -> Image.Image:
    return Image.open(path).convert("RGB")


def resized_array(image: Image.Image, size: tuple[int, int]) -> np.ndarray:
    return np.asarray(image.resize(size, Image.Resampling.LANCZOS), dtype=np.float32)


def diff_image(source: Image.Image, local: Image.Image) -> Image.Image:
    source_rgb = source.convert("RGB")
    local_rgb = local.resize(source_rgb.size, Image.Resampling.LANCZOS).convert("RGB")
    diff = ImageChops.difference(source_rgb, local_rgb)
    amplified = diff.point(lambda value: min(255, value * 3))
    canvas = Image.new("RGB", source_rgb.size, "white")
    canvas.paste(amplified, mask=amplified.convert("L"))
    return canvas


def compare_pair(source_path: Path, local_path: Path, diff_path: Path) -> dict[str, object]:
    source = load_rgb(source_path)
    local = load_rgb(local_path)
    source_array = resized_array(source, source.size)
    local_array = resized_array(local, source.size)
    difference = np.abs(source_array - local_array)
    mae = float(difference.mean() / 255.0)
    rmse = float(math.sqrt(np.square(source_array - local_array).mean()) / 255.0)
    changed = np.any(difference >= 12.0, axis=2)
    diff_path.parent.mkdir(parents=True, exist_ok=True)
    diff_image(source, local).save(diff_path)
    return {
        "source": {"width": source.width, "height": source.height},
        "local": {"width": local.width, "height": local.height},
        "aspectRatioDelta": round(abs(source.width / source.height - local.width / local.height), 6),
        "widthDelta": local.width - source.width,
        "heightDelta": local.height - source.height,
        "normalizedMae": round(mae, 6),
        "normalizedRmse": round(rmse, 6),
        "changedPixelRatio": round(float(changed.mean()), 6),
        "diff": str(diff_path),
    }


def collect_interactions(root: Path) -> list[dict[str, object]]:
    interaction_root = root / "interactions"
    pairs: list[dict[str, object]] = []
    if not interaction_root.exists():
        return pairs
    for source_after in sorted(interaction_root.glob("*/**/source/after.png")):
        relative = source_after.relative_to(interaction_root)
        variant, theme, viewport, case, _kind, _filename = relative.parts
        case_root = source_after.parent.parent
        local_root = case_root / "local"
        local_after = local_root / "after.png"
        source_before = source_after.parent / "before.png"
        local_before = local_root / "before.png"
        if not local_after.exists() or not source_before.exists() or not local_before.exists():
            continue
        after_metrics = compare_pair(
            source_after,
            local_after,
            root / "diff" / "interactions" / variant / theme / viewport / case / "after.png",
        )
        source_feedback = compare_pair(
            source_before,
            source_after,
            root / "diff" / "interactions" / variant / theme / viewport / case / "source-feedback.png",
        )
        local_feedback = compare_pair(
            local_before,
            local_after,
            root / "diff" / "interactions" / variant / theme / viewport / case / "local-feedback.png",
        )
        pairs.append(
            {
                "id": variant,
                "theme": theme,
                "viewport": viewport,
                "case": case,
                "sourceAfter": str(source_after),
                "localAfter": str(local_after),
                "after": after_metrics,
                "feedback": {
                    "sourceChangedPixelRatio": source_feedback["changedPixelRatio"],
                    "localChangedPixelRatio": local_feedback["changedPixelRatio"],
                    "sourceFeedbackMae": source_feedback["normalizedMae"],
                    "localFeedbackMae": local_feedback["normalizedMae"],
                    "feedbackMagnitudeDelta": round(
                        abs(
                            float(source_feedback["changedPixelRatio"])
                            - float(local_feedback["changedPixelRatio"])
                        ),
                        6,
                    ),
                },
            }
        )
    return pairs


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", required=True, type=Path)
    args = parser.parse_args()
    root: Path = args.root.resolve()
    source_root = root / "source"
    local_root = root / "local"
    pairs: list[dict[str, object]] = []
    missing: list[dict[str, str]] = []
    if source_root.exists():
        for source_path in sorted(source_root.glob("*/**/*.png")):
            relative = source_path.relative_to(source_root)
            local_path = local_root / relative
            if not local_path.exists():
                missing.append({"source": str(source_path), "local": str(local_path)})
                continue
            variant, theme, filename = relative.parts
            viewport = Path(filename).stem
            diff_path = root / "diff" / variant / theme / filename
            metrics = compare_pair(source_path, local_path, diff_path)
            pairs.append(
                {
                    "id": variant,
                    "theme": theme,
                    "viewport": viewport,
                    "source": str(source_path),
                    "local": str(local_path),
                    **metrics,
                }
            )
    interaction_pairs = collect_interactions(root)
    report = {
        "schemaVersion": 1,
        "source": "React Bits Pro",
        "local": "lumen-app-ui",
        "pairs": pairs,
        "interactionPairs": interaction_pairs,
        "missing": missing,
        "summary": {
            "pairs": len(pairs),
            "interactionPairs": len(interaction_pairs),
            "missing": len(missing),
            "meanNormalizedMae": round(float(np.mean([p["normalizedMae"] for p in pairs])) if pairs else 0.0, 6),
            "meanChangedPixelRatio": round(float(np.mean([p["changedPixelRatio"] for p in pairs])) if pairs else 0.0, 6),
        },
    }
    output = root / "visual-report.json"
    output.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"command": "visual-diff", **report["summary"], "output": str(output)}))


if __name__ == "__main__":
    main()
