"""Export the frozen DINOv2 backbone + trained head as a single quantized
ONNX graph for onnxruntime-web.

Usage:
    python export.py --student ../data/student/head.pt --out ../web/public/models/cloud-classifier.onnx
"""

import argparse
from pathlib import Path

import torch
from torch import nn

from common.labels import CLASSES
from train_student import StudentHead


class CloudClassifier(nn.Module):
    """Backbone + head combined so the browser runs a single ONNX graph."""

    def __init__(self, backbone: nn.Module, head: nn.Module):
        super().__init__()
        self.backbone = backbone
        self.head = head

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        features = self.backbone(x)
        return self.head(features)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--student", default="../data/student/head.pt")
    parser.add_argument("--out", default="../web/public/models/cloud-classifier.onnx")
    parser.add_argument("--quantize", action="store_true", default=True)
    args = parser.parse_args()

    checkpoint = torch.load(args.student, map_location="cpu")
    backbone = torch.hub.load("facebookresearch/dinov2", checkpoint["backbone"]).eval()
    head = StudentHead(backbone.embed_dim, checkpoint["head_state"]["net.0.weight"].shape[0], len(CLASSES))
    head.load_state_dict(checkpoint["head_state"])
    head.eval()

    model = CloudClassifier(backbone, head).eval()
    dummy_input = torch.randn(1, 3, 224, 224)

    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    fp32_path = out_path.with_suffix(".fp32.onnx")

    torch.onnx.export(
        model,
        dummy_input,
        fp32_path,
        input_names=["pixel_values"],
        output_names=["logits"],
        dynamic_axes={"pixel_values": {0: "batch"}, "logits": {0: "batch"}},
        opset_version=17,
    )
    print(f"Exported fp32 ONNX to {fp32_path}")

    if args.quantize:
        from onnxruntime.quantization import QuantType, quantize_dynamic

        quantize_dynamic(fp32_path, out_path, weight_type=QuantType.QUInt8)
        fp32_path.unlink()
        print(f"Quantized to {out_path}")
    else:
        fp32_path.rename(out_path)

    (out_path.parent / "classes.json").write_text(
        "[" + ", ".join(f'"{c}"' for c in CLASSES) + "]"
    )
    print(f"Wrote class order to {out_path.parent / 'classes.json'}")


if __name__ == "__main__":
    main()
