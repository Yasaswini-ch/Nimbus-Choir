"""Sample the fine-tuned Tinker teacher over the (augmented) train split to
collect soft labels for distillation into the local student.

Same credit-spend gate as train_teacher.py: dry-run by default, prints a
cost estimate, requires --yes-spend-credits to actually call Tinker.

Usage:
    python distill.py --manifest ../data/prepped/manifest.csv --yes-spend-credits
"""

import argparse
import asyncio
import csv
import json
import os
from pathlib import Path

import yaml

from common.labels import CLASSES


def load_config(path: Path) -> dict:
    with open(path) as f:
        return yaml.safe_load(f)


def read_manifest(path: Path, split: str) -> list[tuple[str, str]]:
    with open(path, newline="") as f:
        rows = list(csv.DictReader(f))
    return [(r["path"], r["label"]) for r in rows if r["split"] == split]


def print_cost_estimate(cfg: dict, n_images: int) -> None:
    tokens_per_image = 1100
    tokens = n_images * cfg["distill"]["samples_per_image"] * tokens_per_image
    rate = cfg["pricing_estimate"]["sample_usd_per_million_tokens"]
    cost = tokens / 1_000_000 * rate
    print(f"Planned sampling calls over {n_images} train images "
          f"(x{cfg['distill']['samples_per_image']} samples each)")
    print(f"Estimated tokens: ~{tokens:,} -> estimated sample cost: ~${cost:.2f}")


async def run_distill(cfg: dict, train_rows: list[tuple[str, str]], adapter_ref: str, out_path: Path) -> None:
    import tinker
    from tinker import types

    if not os.environ.get("TINKER_API_KEY"):
        raise SystemExit("TINKER_API_KEY is not set.")

    service_client = tinker.ServiceClient()
    # adapter_ref was written by train_teacher.py's save_weights_async() result.
    sampling_client = await service_client.create_sampling_client_async(model_ref=adapter_ref)
    prompt = cfg["teacher"]["prompt"]
    temperature = cfg["distill"]["temperature"]

    soft_labels = []
    for path, true_label in train_rows:
        # See the same vision-input caveat noted in train_teacher.py.
        result = await sampling_client.sample_async(
            prompt=prompt,
            image_path=path,
            num_samples=cfg["distill"]["samples_per_image"],
            sampling_params=types.SamplingParams(max_tokens=4, temperature=temperature, logprobs=True),
        )
        # Reduce to a probability over our 5 classes from the returned
        # logprobs/votes; exact field names depend on the SDK's response
        # shape for logprobs -- confirm against the API reference, this is
        # a simple majority-vote fallback that always works regardless.
        votes = [seq.text.strip().lower() for seq in result.sequences]
        probs = {c: votes.count(c) / len(votes) for c in CLASSES}
        soft_labels.append({"path": path, "true_label": true_label, "teacher_probs": probs})

    out_path.parent.mkdir(parents=True, exist_ok=True)
    with open(out_path, "w") as f:
        json.dump(soft_labels, f, indent=2)
    print(f"Wrote {len(soft_labels)} soft labels to {out_path}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", default="../data/prepped/manifest.csv")
    parser.add_argument("--config", default="config.yaml")
    parser.add_argument("--adapter-ref-file", default="../data/teacher/adapter_ref.txt")
    parser.add_argument("--out", default="../data/teacher/soft_labels.json")
    parser.add_argument("--yes-spend-credits", action="store_true")
    args = parser.parse_args()

    cfg = load_config(Path(args.config))
    train_rows = read_manifest(Path(args.manifest), "train")
    print_cost_estimate(cfg, len(train_rows))

    if not args.yes_spend_credits:
        print("\nDry run only (default). Re-run with --yes-spend-credits once you've reviewed the estimate above.")
        return

    adapter_ref_path = Path(args.adapter_ref_file)
    if not adapter_ref_path.exists():
        raise SystemExit(f"{adapter_ref_path} not found -- run train_teacher.py first.")
    adapter_ref = adapter_ref_path.read_text().strip()

    asyncio.run(run_distill(cfg, train_rows, adapter_ref, Path(args.out)))


if __name__ == "__main__":
    main()
