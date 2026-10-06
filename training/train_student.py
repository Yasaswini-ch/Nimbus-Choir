"""Train the small on-device model: a frozen DINOv2 backbone (downloaded
once from torch.hub, open-weight) with a trainable MLP head, distilled from
the Tinker teacher's soft labels and the CCSN ground truth. Fully local,
no Tinker calls, no cost.

Usage:
    python train_student.py --manifest ../data/prepped/manifest.csv \
        --soft-labels ../data/teacher/soft_labels.json
"""

import argparse
import csv
import json
from pathlib import Path

import torch
import torch.nn.functional as F
import yaml
from PIL import Image
from torch import nn
from torch.utils.data import DataLoader, Dataset
from torchvision import transforms

from common.labels import CLASSES

CLASS_INDEX = {c: i for i, c in enumerate(CLASSES)}

PREPROCESS = transforms.Compose(
    [
        transforms.Resize((224, 224)),
        transforms.ToTensor(),
        transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
    ]
)


class CloudDataset(Dataset):
    def __init__(self, rows: list[dict], soft_labels: dict[str, dict[str, float]]):
        self.rows = rows
        self.soft_labels = soft_labels

    def __len__(self) -> int:
        return len(self.rows)

    def __getitem__(self, idx: int):
        row = self.rows[idx]
        img = Image.open(row["path"]).convert("RGB")
        x = PREPROCESS(img)
        y_hard = CLASS_INDEX[row["label"]]
        teacher = self.soft_labels.get(row["path"])
        if teacher is not None:
            y_soft = torch.tensor([teacher[c] for c in CLASSES], dtype=torch.float32)
        else:
            y_soft = F.one_hot(torch.tensor(y_hard), num_classes=len(CLASSES)).float()
        return x, y_hard, y_soft


class StudentHead(nn.Module):
    def __init__(self, backbone_dim: int, hidden_dim: int, n_classes: int):
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(backbone_dim, hidden_dim),
            nn.GELU(),
            nn.Linear(hidden_dim, n_classes),
        )

    def forward(self, features: torch.Tensor) -> torch.Tensor:
        return self.net(features)


def load_config(path: Path) -> dict:
    with open(path) as f:
        return yaml.safe_load(f)


def read_manifest(path: Path, split: str) -> list[dict]:
    with open(path, newline="") as f:
        rows = list(csv.DictReader(f))
    return [r for r in rows if r["split"] == split]


def load_soft_labels(path: Path) -> dict[str, dict[str, float]]:
    if not path.exists():
        print(f"No soft-label file at {path}; training on ground truth only (distill_loss_weight will be ignored).")
        return {}
    with open(path) as f:
        data = json.load(f)
    return {entry["path"]: entry["teacher_probs"] for entry in data}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", default="../data/prepped/manifest.csv")
    parser.add_argument("--soft-labels", default="../data/teacher/soft_labels.json")
    parser.add_argument("--config", default="config.yaml")
    parser.add_argument("--out", default="../data/student/head.pt")
    args = parser.parse_args()

    cfg = load_config(Path(args.config))["student"]
    device = "cuda" if torch.cuda.is_available() else "cpu"

    backbone = torch.hub.load("facebookresearch/dinov2", cfg["backbone"])
    backbone.eval().to(device)
    for p in backbone.parameters():
        p.requires_grad = False
    backbone_dim = backbone.embed_dim

    train_rows = read_manifest(Path(args.manifest), "train")
    val_rows = read_manifest(Path(args.manifest), "val")
    soft_labels = load_soft_labels(Path(args.soft_labels))

    train_ds = CloudDataset(train_rows, soft_labels)
    val_ds = CloudDataset(val_rows, soft_labels)
    train_loader = DataLoader(train_ds, batch_size=cfg["batch_size"], shuffle=True)
    val_loader = DataLoader(val_ds, batch_size=cfg["batch_size"])

    head = StudentHead(backbone_dim, cfg["head_hidden_dim"], len(CLASSES)).to(device)
    optimizer = torch.optim.Adam(head.parameters(), lr=cfg["learning_rate"])
    distill_weight = cfg["distill_loss_weight"]

    for epoch in range(cfg["epochs"]):
        head.train()
        total_loss = 0.0
        for x, y_hard, y_soft in train_loader:
            x, y_hard, y_soft = x.to(device), y_hard.to(device), y_soft.to(device)
            with torch.no_grad():
                features = backbone(x)
            logits = head(features)
            ce_loss = F.cross_entropy(logits, y_hard)
            kd_loss = F.kl_div(F.log_softmax(logits, dim=-1), y_soft, reduction="batchmean")
            loss = (1 - distill_weight) * ce_loss + distill_weight * kd_loss
            optimizer.zero_grad()
            loss.backward()
            optimizer.step()
            total_loss += loss.item() * x.size(0)

        head.eval()
        correct = 0
        with torch.no_grad():
            for x, y_hard, _ in val_loader:
                x, y_hard = x.to(device), y_hard.to(device)
                features = backbone(x)
                preds = head(features).argmax(dim=-1)
                correct += (preds == y_hard).sum().item()
        acc = correct / max(len(val_ds), 1)
        print(f"epoch {epoch}: train loss={total_loss / len(train_ds):.4f} val acc={acc:.3f}")

    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    torch.save({"head_state": head.state_dict(), "backbone": cfg["backbone"]}, out_path)
    print(f"Saved student head to {out_path}")


if __name__ == "__main__":
    main()
