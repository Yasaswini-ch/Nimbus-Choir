"""Confusion matrix and worst-20-errors report for the trained student model
(the one that actually ships to /web), evaluated on the held-out test split.

Usage:
    python eval.py --manifest ../data/prepped/manifest.csv --student ../data/student/head.pt
"""

import argparse
import csv
from pathlib import Path

import matplotlib.pyplot as plt
import numpy as np
import torch
import torch.nn.functional as F
from PIL import Image
from sklearn.metrics import confusion_matrix

from common.labels import CLASSES
from train_student import PREPROCESS, StudentHead

CLASS_INDEX = {c: i for i, c in enumerate(CLASSES)}


def read_manifest(path: Path, split: str) -> list[dict]:
    with open(path, newline="") as f:
        rows = list(csv.DictReader(f))
    return [r for r in rows if r["split"] == split]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", default="../data/prepped/manifest.csv")
    parser.add_argument("--student", default="../data/student/head.pt")
    parser.add_argument("--out-dir", default="../docs/debug")
    args = parser.parse_args()

    device = "cuda" if torch.cuda.is_available() else "cpu"
    checkpoint = torch.load(args.student, map_location=device)
    backbone = torch.hub.load("facebookresearch/dinov2", checkpoint["backbone"]).eval().to(device)
    head = StudentHead(backbone.embed_dim, checkpoint["head_state"]["net.0.weight"].shape[0], len(CLASSES)).to(device)
    head.load_state_dict(checkpoint["head_state"])
    head.eval()

    test_rows = read_manifest(Path(args.manifest), "test")
    y_true, y_pred, confidences, paths = [], [], [], []

    with torch.no_grad():
        for row in test_rows:
            img = Image.open(row["path"]).convert("RGB")
            x = PREPROCESS(img).unsqueeze(0).to(device)
            logits = head(backbone(x))
            probs = F.softmax(logits, dim=-1).squeeze(0)
            pred_idx = probs.argmax().item()
            y_true.append(CLASS_INDEX[row["label"]])
            y_pred.append(pred_idx)
            confidences.append(probs[CLASS_INDEX[row["label"]]].item())
            paths.append(row["path"])

    cm = confusion_matrix(y_true, y_pred, labels=range(len(CLASSES)))
    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    fig, ax = plt.subplots(figsize=(6, 5))
    im = ax.imshow(cm, cmap="Purples")
    ax.set_xticks(range(len(CLASSES)), CLASSES, rotation=45, ha="right")
    ax.set_yticks(range(len(CLASSES)), CLASSES)
    ax.set_xlabel("predicted")
    ax.set_ylabel("true")
    for i in range(len(CLASSES)):
        for j in range(len(CLASSES)):
            ax.text(j, i, cm[i, j], ha="center", va="center")
    fig.colorbar(im)
    fig.tight_layout()
    fig.savefig(out_dir / "confusion_matrix.png")
    print(f"Saved confusion matrix to {out_dir / 'confusion_matrix.png'}")

    wrong = [
        (p, CLASSES[t], CLASSES[pr], conf)
        for p, t, pr, conf in zip(paths, y_true, y_pred, confidences)
        if t != pr
    ]
    wrong.sort(key=lambda row: row[3])  # lowest confidence-in-truth first
    worst = wrong[:20]

    report_path = out_dir / "worst_errors.txt"
    with open(report_path, "w") as f:
        for path, true_label, pred_label, conf in worst:
            f.write(f"{path}: true={true_label} pred={pred_label} conf_in_truth={conf:.3f}\n")
    print(f"Saved {len(worst)} worst errors to {report_path}")

    accuracy = np.trace(cm) / cm.sum()
    print(f"Test accuracy: {accuracy:.3f}")


if __name__ == "__main__":
    main()
