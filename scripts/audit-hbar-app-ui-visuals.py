"""Compare captured hbar-app-ui canvases with independently captured reference previews.

The tool does not read or execute reference-page source. It compares only raster
previews passed through command-line paths and writes a JSON report plus optional
heatmaps for the highest-difference states.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter


VIEWPORTS = ("desktop", "tablet", "mobile")


def image_array(path: Path) -> np.ndarray:
    return np.asarray(Image.open(path).convert("RGB"), dtype=np.int16)


def edge_array(image: Image.Image) -> np.ndarray:
    return np.asarray(image.convert("L").filter(ImageFilter.FIND_EDGES), dtype=np.int16)


def compare(reference_path: Path, local_path: Path) -> dict[str, object]:
    reference_image = Image.open(reference_path).convert("RGB")
    local_image = Image.open(local_path).convert("RGB")
    reference = np.asarray(reference_image, dtype=np.int16)
    local = np.asarray(local_image, dtype=np.int16)
    height = min(reference.shape[0], local.shape[0])
    width = min(reference.shape[1], local.shape[1])
    reference = reference[:height, :width]
    local = local[:height, :width]
    difference = np.abs(reference - local)
    max_channel = np.max(difference, axis=2)
    edge_difference = np.abs(edge_array(reference_image)[:height, :width] - edge_array(local_image)[:height, :width])
    return {
        "referenceSize": [reference_image.width, reference_image.height],
        "localSize": [local_image.width, local_image.height],
        "commonSize": [width, height],
        "meanAbsoluteError": round(float(difference.mean()), 3),
        "rootMeanSquareError": round(float(np.sqrt(np.mean(np.square(difference, dtype=np.int64)))), 3),
        "changedPixels18": round(float((max_channel > 18).mean() * 100), 3),
        "changedPixels48": round(float((max_channel > 48).mean() * 100), 3),
        "edgeMeanAbsoluteError": round(float(edge_difference.mean()), 3),
    }


def write_heatmap(reference_path: Path, local_path: Path, output_path: Path) -> None:
    reference = image_array(reference_path)
    local = image_array(local_path)
    height = min(reference.shape[0], local.shape[0])
    width = min(reference.shape[1], local.shape[1])
    delta = np.abs(reference[:height, :width] - local[:height, :width]).astype(np.uint8)
    Image.fromarray(np.clip(delta * 4, 0, 255), "RGB").save(output_path)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--reference-root", required=True, type=Path)
    parser.add_argument("--local-root", required=True, type=Path)
    parser.add_argument("--output", default=Path("artifacts/hbar-app-ui/visual-audit.json"), type=Path)
    parser.add_argument("--heatmap-dir", type=Path)
    parser.add_argument("--heatmap-count", default=0, type=int)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    records: list[dict[str, object]] = []
    missing: list[dict[str, str]] = []
    for reference_variant in sorted(path for path in args.reference_root.iterdir() if path.is_dir()):
        for viewport in VIEWPORTS:
            reference_path = reference_variant / f"preview-{viewport}.png"
            local_path = args.local_root / reference_variant.name / f"{viewport}.png"
            if not reference_path.exists():
                continue
            if not local_path.exists():
                missing.append({"variant": reference_variant.name, "viewport": viewport, "localPath": str(local_path)})
                continue
            metrics = compare(reference_path, local_path)
            records.append({"id": f"hbar-app-ui-{reference_variant.name}", "viewport": viewport, "referencePath": str(reference_path), "localPath": str(local_path), **metrics})

    records.sort(key=lambda record: float(record["changedPixels18"]), reverse=True)
    report = {
        "checked": len(records),
        "missing": missing,
        "meanChangedPixels18": round(float(np.mean([record["changedPixels18"] for record in records])) if records else 0, 3),
        "meanEdgeMeanAbsoluteError": round(float(np.mean([record["edgeMeanAbsoluteError"] for record in records])) if records else 0, 3),
        "records": records,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2), encoding="utf-8")

    if args.heatmap_dir and args.heatmap_count > 0:
        args.heatmap_dir.mkdir(parents=True, exist_ok=True)
        for record in records[:args.heatmap_count]:
            output_path = args.heatmap_dir / f"{record['id']}-{record['viewport']}.png"
            write_heatmap(Path(str(record["referencePath"])), Path(str(record["localPath"])), output_path)

    print(json.dumps({"checked": len(records), "missing": len(missing), "meanChangedPixels18": report["meanChangedPixels18"], "output": str(args.output)}))


if __name__ == "__main__":
    main()
