/**
 * Centroid + IoU tracker. Matches this frame's raw detections (from
 * sky/pipeline.js) against existing tracks, assigns stable ids, detects
 * merges (two tracks collapsing onto one detection) and splits (one track's
 * last blob covering two new detections), and keeps a lost track alive for
 * a grace period before deleting it.
 *
 * All detection/track coordinates are normalized (0-1) image space, so
 * distance and IoU are directly comparable across frame sizes.
 */

const GRACE_PERIOD_MS = 1500;
const MAX_MATCH_COST = 0.9;
const MERGE_DISTANCE = 0.08;
const SPLIT_OVERLAP_DISTANCE = 0.12;

function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function iou(a, b) {
  const x0 = Math.max(a.x0, b.x0), y0 = Math.max(a.y0, b.y0);
  const x1 = Math.min(a.x1, b.x1), y1 = Math.min(a.y1, b.y1);
  const interW = Math.max(0, x1 - x0), interH = Math.max(0, y1 - y0);
  const inter = interW * interH;
  const areaA = (a.x1 - a.x0) * (a.y1 - a.y0);
  const areaB = (b.x1 - b.x0) * (b.y1 - b.y0);
  const union = areaA + areaB - inter;
  return union <= 0 ? 0 : inter / union;
}

function matchCost(track, detection) {
  const d = dist(track.centroid, detection.centroid);
  const overlap = iou(track.bbox, detection.bbox);
  return d + (1 - overlap) * 0.5;
}

export class CloudTracker {
  constructor() {
    this.tracks = new Map(); // id -> track
    this.nextId = 1;
    this.lastUpdate = null;
  }

  update(detections, now = performance.now()) {
    const dt = this.lastUpdate == null ? 0 : Math.max(0, (now - this.lastUpdate) / 1000);
    this.lastUpdate = now;

    const activeTracks = [...this.tracks.values()];
    const pairs = [];
    for (const track of activeTracks) {
      for (let di = 0; di < detections.length; di++) {
        const cost = matchCost(track, detections[di]);
        if (cost <= MAX_MATCH_COST) pairs.push({ track, di, cost });
      }
    }
    pairs.sort((a, b) => a.cost - b.cost);

    const claimedDetections = new Set();
    const matchedTracks = new Set();
    const matches = []; // { track, detection }
    for (const { track, di, cost } of pairs) {
      if (claimedDetections.has(di) || matchedTracks.has(track.id)) continue;
      claimedDetections.add(di);
      matchedTracks.add(track.id);
      matches.push({ track, detection: detections[di] });
    }

    // Apply matches: update track state.
    for (const { track, detection } of matches) {
      const vx = dt > 0 ? (detection.centroid.x - track.centroid.x) / dt : 0;
      const vy = dt > 0 ? (detection.centroid.y - track.centroid.y) / dt : 0;
      Object.assign(track, detection, {
        velocity: { x: vx, y: vy },
        age: track.age + dt,
        lastSeen: now,
        lost: false,
        lostSince: null,
      });
    }

    // Unmatched previous tracks: merge (absorbed into a winner) or lost (grace period).
    for (const track of activeTracks) {
      if (matchedTracks.has(track.id)) continue;
      const winner = matches.find((m) => dist(m.track.centroid, track.centroid) < MERGE_DISTANCE);
      if (winner) {
        this.tracks.delete(track.id); // merged into winner.track this frame
        continue;
      }
      if (track.lostSince == null) track.lostSince = now;
      track.lost = true;
      track.age += dt;
      if (now - track.lostSince > GRACE_PERIOD_MS) {
        this.tracks.delete(track.id);
      }
    }

    // Unmatched new detections: split (near a track that just matched elsewhere) or brand new.
    for (let di = 0; di < detections.length; di++) {
      if (claimedDetections.has(di)) continue;
      const detection = detections[di];
      const parent = matches.find((m) => dist(m.detection.centroid, detection.centroid) < SPLIT_OVERLAP_DISTANCE);
      const id = this.nextId++;
      this.tracks.set(id, {
        id,
        ...detection,
        velocity: { x: 0, y: 0 },
        age: 0,
        lastSeen: now,
        lost: false,
        lostSince: null,
        type: parent ? parent.track.type : detection.pseudoType ?? null,
        confidence: parent ? parent.track.confidence : 0,
        splitFrom: parent ? parent.track.id : null,
      });
    }

    return [...this.tracks.values()];
  }
}
