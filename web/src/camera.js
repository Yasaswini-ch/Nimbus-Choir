/**
 * Drives a <video> element from either the rear camera or a user-picked
 * video file (so the pipeline can be developed/tested indoors), and runs a
 * callback at ~10fps on a downscaled analysis canvas.
 */

const ANALYSIS_WIDTH = 240;
const ANALYSIS_HEIGHT = 180;
const FPS = 10;

export class CameraSource {
  constructor(videoEl) {
    this.video = videoEl;
    this.analysisCanvas = document.createElement("canvas");
    this.analysisCanvas.width = ANALYSIS_WIDTH;
    this.analysisCanvas.height = ANALYSIS_HEIGHT;
    this.analysisCtx = this.analysisCanvas.getContext("2d", { willReadFrequently: true });
    this._timer = null;
  }

  async startCamera() {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 960 } },
      audio: false,
    });
    this.video.srcObject = stream;
    await this.video.play();
  }

  async startFile(file) {
    if (this.video.srcObject) {
      for (const track of this.video.srcObject.getTracks()) track.stop();
      this.video.srcObject = null;
    }
    this.video.src = URL.createObjectURL(file);
    this.video.loop = true;
    await this.video.play();
  }

  /** Calls onFrame(imageData, sourceCanvasForCrops) at ~FPS until stop() is called. */
  run(onFrame) {
    this.stop();
    this._timer = setInterval(() => {
      if (this.video.readyState < 2) return;
      this.analysisCtx.drawImage(this.video, 0, 0, ANALYSIS_WIDTH, ANALYSIS_HEIGHT);
      const imageData = this.analysisCtx.getImageData(0, 0, ANALYSIS_WIDTH, ANALYSIS_HEIGHT);
      onFrame(imageData, this.analysisCanvas);
    }, 1000 / FPS);
  }

  stop() {
    if (this._timer) clearInterval(this._timer);
    this._timer = null;
  }
}
