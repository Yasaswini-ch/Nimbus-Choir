"""LoRA fine-tune a Tinker vision model as the cloud-type teacher.

This calls the paid Tinker API. Run with --dry-run first (the default
behavior if --yes-spend-credits is omitted): it prints the exact calls and a
token/cost estimate without touching the network. Only re-run with
--yes-spend-credits after you've reviewed that estimate.

Usage:
    python train_teacher.py --manifest ../data/prepped/manifest.csv
    python train_teacher.py --manifest ../data/prepped/manifest.csv --yes-spend-credits
"""

import argparse
import asyncio
import csv
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


def estimate_tokens(n_images: int, epochs: int, tokens_per_image: int = 1100) -> int:
    # ~1000-1200 tokens is a rough per-image vision-prefill estimate for a
    # mid-resolution tile at Qwen3.6-35B-A3B's image encoder; the response
    # itself is one short word (a handful of tokens). Confirm against actual
    # billing after a small real run -- this is a planning estimate only.
    return n_images * epochs * tokens_per_image


def print_cost_estimate(cfg: dict, n_train: int) -> None:
    epochs = cfg["teacher"]["epochs"]
    tokens = estimate_tokens(n_train, epochs)
    rate = cfg["pricing_estimate"]["train_usd_per_million_tokens"]
    cost = tokens / 1_000_000 * rate
    print(f"\nPlanned Tinker call: create_lora_training_client_async(")
    print(f"    base_model={cfg['teacher']['base_model']!r}, rank={cfg['teacher']['lora_rank']})")
    print(f"Training images: {n_train}, epochs: {epochs}")
    print(f"Estimated tokens: ~{tokens:,} -> estimated train cost: ~${cost:.2f}")
    print("(Estimate only -- re-check https://tinker-docs.thinkingmachines.ai/tinker/models/ for current rates.)")


async def run_training(cfg: dict, train_rows: list[tuple[str, str]], val_rows: list[tuple[str, str]], out_dir: Path) -> None:
    import tinker
    from tinker import types

    api_key = os.environ.get("TINKER_API_KEY")
    if not api_key:
        raise SystemExit("TINKER_API_KEY is not set. Run `uv run tinker auth login` or export the key.")

    service_client = tinker.ServiceClient()
    training_client = await service_client.create_lora_training_client_async(
        base_model=cfg["teacher"]["base_model"], rank=cfg["teacher"]["lora_rank"]
    )
    prompt = cfg["teacher"]["prompt"]

    # NOTE: the exact shape of a vision datum/ModelInput (how an image is
    # attached to a prompt) wasn't in the docs pages fetched while planning
    # this -- Tinker's "rendering" tutorial covers it. Confirm the real
    # builder (likely something like tinker.types.ModelInput.from_image(...))
    # against that tutorial before the first real run; this dict shape is a
    # placeholder to be corrected then.
    def to_datum(path: str, label: str):
        return {"image_path": path, "prompt": prompt, "target": label}

    for epoch in range(cfg["teacher"]["epochs"]):
        for i in range(0, len(train_rows), cfg["teacher"]["batch_size"]):
            batch = train_rows[i : i + cfg["teacher"]["batch_size"]]
            data = [to_datum(p, l) for p, l in batch]
            fwd_bwd_future = await training_client.forward_backward_async(data=data, loss_fn="cross_entropy")
            optim_future = await training_client.optim_step_async(
                types.AdamParams(learning_rate=cfg["teacher"]["learning_rate"])
            )
            loss = (await fwd_bwd_future.result_async()).loss
            await optim_future.result_async()
            print(f"epoch {epoch} step {i // cfg['teacher']['batch_size']}: loss={loss:.4f}")

        correct = 0
        sampling_client = await training_client.save_weights_and_get_sampling_client_async()
        for path, label in val_rows:
            # Same placeholder-input caveat as to_datum() above.
            result = await sampling_client.sample_async(
                prompt=prompt, image_path=path, num_samples=1, sampling_params=types.SamplingParams(max_tokens=4)
            )
            pred = result.sequences[0].text.strip().lower()
            correct += int(pred.startswith(label))
        acc = correct / max(len(val_rows), 1)
        print(f"epoch {epoch}: val accuracy = {acc:.3f}")

    out_dir.mkdir(parents=True, exist_ok=True)
    save_response = await training_client.save_weights_async(name="cloud-teacher-lora")
    (out_dir / "adapter_ref.txt").write_text(str(save_response))
    print(f"Saved adapter reference to {out_dir / 'adapter_ref.txt'}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", default="../data/prepped/manifest.csv")
    parser.add_argument("--config", default="config.yaml")
    parser.add_argument("--out-dir", default="../data/teacher")
    parser.add_argument("--yes-spend-credits", action="store_true")
    args = parser.parse_args()

    cfg = load_config(Path(args.config))
    manifest_path = Path(args.manifest)
    train_rows = read_manifest(manifest_path, "train")
    val_rows = read_manifest(manifest_path, "val")

    print_cost_estimate(cfg, len(train_rows))

    if not args.yes_spend_credits:
        print("\nDry run only (default). Re-run with --yes-spend-credits once you've reviewed the estimate above.")
        return

    asyncio.run(run_training(cfg, train_rows, val_rows, Path(args.out_dir)))


if __name__ == "__main__":
    main()
