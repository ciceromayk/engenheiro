// Detecção automática de segmentos de parede em uma imagem de planta baixa,
// via transformada de Hough clássica sobre uma máscara de bordas (Sobel).
// É um auxiliar de "melhor esforço": o resultado deve ser revisado e ajustado
// manualmente, nunca tratado como leitura definitiva da planta.

export interface RasterImage {
  data: Uint8ClampedArray; // RGBA
  width: number;
  height: number;
}

export interface DetectionOptions {
  /** Limiar de magnitude de borda (Sobel), 0-1020. Menor = mais sensível. */
  edgeThreshold?: number;
  /** Passo de ângulo da transformada de Hough, em graus. */
  thetaStepDeg?: number;
  /** Número máximo de retas (picos) extraídas do acumulador. */
  maxLines?: number;
  /** Fração do maior número de votos para considerar um pico válido. */
  minVotesRatio?: number;
  /** Distância perpendicular máxima (px) para um pixel de borda pertencer à reta. */
  maxPerpDistancePx?: number;
  /** Lacuna máxima (px) entre pixels para continuarem no mesmo segmento. */
  maxGapPx?: number;
  /** Comprimento mínimo (px) para manter um segmento. */
  minSegmentLengthPx?: number;
  /** Se definido, ângulos a até N graus de 0°/90° são ajustados para exatamente ortogonais. */
  orthoSnapDeg?: number;
}

export interface DetectedSegment {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  length: number;
}

const DEFAULTS: Required<DetectionOptions> = {
  edgeThreshold: 120,
  thetaStepDeg: 1,
  maxLines: 80,
  minVotesRatio: 0.15,
  maxPerpDistancePx: 2.5,
  maxGapPx: 8,
  minSegmentLengthPx: 18,
  orthoSnapDeg: 3,
};

function toGrayscale(image: RasterImage): Float32Array {
  const { data, width, height } = image;
  const gray = new Float32Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const r = data[i * 4];
    const g = data[i * 4 + 1];
    const b = data[i * 4 + 2];
    gray[i] = 0.299 * r + 0.587 * g + 0.114 * b;
  }
  return gray;
}

const SOBEL_X = [-1, 0, 1, -2, 0, 2, -1, 0, 1];
const SOBEL_Y = [-1, -2, -1, 0, 0, 0, 1, 2, 1];

function sobelEdgePoints(
  gray: Float32Array,
  width: number,
  height: number,
  threshold: number
): { x: number; y: number }[] {
  const points: { x: number; y: number }[] = [];
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      let sx = 0;
      let sy = 0;
      let k = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const v = gray[(y + dy) * width + (x + dx)];
          sx += v * SOBEL_X[k];
          sy += v * SOBEL_Y[k];
          k++;
        }
      }
      const mag = Math.sqrt(sx * sx + sy * sy);
      if (mag >= threshold) points.push({ x, y });
    }
  }
  return points;
}

interface HoughSpace {
  accumulator: Uint32Array;
  numTheta: number;
  numRho: number;
  diag: number;
  cosTable: Float32Array;
  sinTable: Float32Array;
}

function buildHoughSpace(
  points: { x: number; y: number }[],
  width: number,
  height: number,
  thetaStepDeg: number
): HoughSpace {
  const diag = Math.ceil(Math.sqrt(width * width + height * height));
  const numTheta = Math.max(1, Math.round(180 / thetaStepDeg));
  const numRho = 2 * diag + 1;
  const accumulator = new Uint32Array(numTheta * numRho);
  const cosTable = new Float32Array(numTheta);
  const sinTable = new Float32Array(numTheta);

  for (let t = 0; t < numTheta; t++) {
    const theta = ((t * thetaStepDeg) * Math.PI) / 180;
    cosTable[t] = Math.cos(theta);
    sinTable[t] = Math.sin(theta);
  }

  for (const p of points) {
    for (let t = 0; t < numTheta; t++) {
      const rho = p.x * cosTable[t] + p.y * sinTable[t];
      const rIdx = Math.round(rho) + diag;
      accumulator[t * numRho + rIdx]++;
    }
  }

  return { accumulator, numTheta, numRho, diag, cosTable, sinTable };
}

interface Peak {
  theta: number; // índice
  rho: number; // valor real (px)
  votes: number;
}

function findPeaks(space: HoughSpace, maxLines: number, minVotes: number): Peak[] {
  const { numTheta, numRho, diag } = space;
  const acc = Uint32Array.from(space.accumulator);
  const peaks: Peak[] = [];
  // Janela de supressão: linhas próximas em ângulo/posição representam a mesma parede
  // (uma parede de alguns pixels de espessura gera bordas paralelas nos dois lados).
  const thetaWindow = Math.max(6, Math.round(numTheta / 15));
  const rhoWindow = 8;

  for (let n = 0; n < maxLines; n++) {
    let bestIdx = -1;
    let bestVal = 0;
    for (let i = 0; i < acc.length; i++) {
      if (acc[i] > bestVal) {
        bestVal = acc[i];
        bestIdx = i;
      }
    }
    if (bestIdx < 0 || bestVal < minVotes) break;

    const t = Math.floor(bestIdx / numRho);
    const r = bestIdx % numRho;
    peaks.push({ theta: t, rho: r - diag, votes: bestVal });

    for (let dt = -thetaWindow; dt <= thetaWindow; dt++) {
      const tt = ((t + dt) % numTheta + numTheta) % numTheta;
      for (let dr = -rhoWindow; dr <= rhoWindow; dr++) {
        const rr = r + dr;
        if (rr < 0 || rr >= numRho) continue;
        acc[tt * numRho + rr] = 0;
      }
    }
  }

  return peaks;
}

function extractSegmentsForPeak(
  peak: Peak,
  points: { x: number; y: number }[],
  space: HoughSpace,
  maxPerpDistancePx: number,
  maxGapPx: number,
  minSegmentLengthPx: number
): { x1: number; y1: number; x2: number; y2: number; length: number }[] {
  const cos = space.cosTable[peak.theta];
  const sin = space.sinTable[peak.theta];
  const dirX = -sin;
  const dirY = cos;

  const projections: number[] = [];
  for (const p of points) {
    const perp = p.x * cos + p.y * sin - peak.rho;
    if (Math.abs(perp) <= maxPerpDistancePx) {
      projections.push(p.x * dirX + p.y * dirY);
    }
  }
  if (projections.length === 0) return [];
  projections.sort((a, b) => a - b);

  const ranges: [number, number][] = [];
  let segStart = projections[0];
  let prev = projections[0];
  for (let i = 1; i < projections.length; i++) {
    if (projections[i] - prev > maxGapPx) {
      if (prev - segStart >= minSegmentLengthPx) ranges.push([segStart, prev]);
      segStart = projections[i];
    }
    prev = projections[i];
  }
  if (prev - segStart >= minSegmentLengthPx) ranges.push([segStart, prev]);

  return ranges.map(([s, e]) => ({
    x1: peak.rho * cos + s * dirX,
    y1: peak.rho * sin + s * dirY,
    x2: peak.rho * cos + e * dirX,
    y2: peak.rho * sin + e * dirY,
    length: e - s,
  }));
}

function applyOrthoSnap(
  seg: { x1: number; y1: number; x2: number; y2: number },
  toleranceDeg: number
): { x1: number; y1: number; x2: number; y2: number } {
  const angle = (Math.atan2(seg.y2 - seg.y1, seg.x2 - seg.x1) * 180) / Math.PI;
  const normalized = ((angle % 180) + 180) % 180;
  const distTo0 = Math.min(normalized, 180 - normalized);
  const distTo90 = Math.abs(normalized - 90);

  if (distTo0 <= toleranceDeg) {
    const y = (seg.y1 + seg.y2) / 2;
    return { x1: seg.x1, y1: y, x2: seg.x2, y2: y };
  }
  if (distTo90 <= toleranceDeg) {
    const x = (seg.x1 + seg.x2) / 2;
    return { x1: x, y1: seg.y1, x2: x, y2: seg.y2 };
  }
  return seg;
}

type Segment = { x1: number; y1: number; x2: number; y2: number };

function segmentAngleRad(s: Segment): number {
  return Math.atan2(s.y2 - s.y1, s.x2 - s.x1);
}

/** Diferença entre dois ângulos (radianos) tratando retas como não-orientadas (0° ≡ 180°). */
function lineAngleDifferenceDeg(a: number, b: number): number {
  let diff = Math.abs(((a - b + Math.PI / 2) % Math.PI) - Math.PI / 2);
  diff = Math.abs(diff);
  return (Math.min(diff, Math.PI - diff) * 180) / Math.PI;
}

/** Distância perpendicular de um ponto à reta infinita definida por um segmento. */
function perpendicularDistanceToLine(line: Segment, px: number, py: number): number {
  const dx = line.x2 - line.x1;
  const dy = line.y2 - line.y1;
  const len = Math.hypot(dx, dy) || 1e-9;
  return Math.abs((px - line.x1) * dy - (py - line.y1) * dx) / len;
}

/**
 * Agrupa segmentos quase colineares (mesma orientação e posição, considerando a
 * espessura do traço/parede) e funde cada grupo em um ou mais segmentos contínuos,
 * eliminando duplicatas e fragmentos gerados por ruído perto de cantos e cruzamentos.
 */
function mergeCollinearSegments(
  segments: Segment[],
  angleTolDeg: number,
  perpTolPx: number,
  gapTolPx: number
): Segment[] {
  const used = new Array(segments.length).fill(false);
  const merged: Segment[] = [];

  for (let i = 0; i < segments.length; i++) {
    if (used[i]) continue;
    const ref = segments[i];
    const refAngle = segmentAngleRad(ref);
    const group: Segment[] = [ref];
    used[i] = true;

    for (let j = i + 1; j < segments.length; j++) {
      if (used[j]) continue;
      const candidate = segments[j];
      if (lineAngleDifferenceDeg(refAngle, segmentAngleRad(candidate)) > angleTolDeg) continue;
      const midX = (candidate.x1 + candidate.x2) / 2;
      const midY = (candidate.y1 + candidate.y2) / 2;
      if (perpendicularDistanceToLine(ref, midX, midY) > perpTolPx) continue;
      group.push(candidate);
      used[j] = true;
    }

    merged.push(...mergeGroupIntervals(group, refAngle, gapTolPx));
  }

  return merged;
}

/** Funde um grupo de segmentos quase colineares projetando-os sobre a direção comum. */
function mergeGroupIntervals(group: Segment[], dirAngle: number, gapTolPx: number): Segment[] {
  const dirX = Math.cos(dirAngle);
  const dirY = Math.sin(dirAngle);
  const perpX = -dirY;
  const perpY = dirX;
  const refX = group[0].x1;
  const refY = group[0].y1;

  const intervals = group
    .map((s) => {
      const p1 = (s.x1 - refX) * dirX + (s.y1 - refY) * dirY;
      const p2 = (s.x2 - refX) * dirX + (s.y2 - refY) * dirY;
      return [Math.min(p1, p2), Math.max(p1, p2)] as [number, number];
    })
    .sort((a, b) => a[0] - b[0]);

  const mergedIntervals: [number, number][] = [];
  let [curStart, curEnd] = intervals[0];
  for (let i = 1; i < intervals.length; i++) {
    const [s, e] = intervals[i];
    if (s - curEnd <= gapTolPx) {
      curEnd = Math.max(curEnd, e);
    } else {
      mergedIntervals.push([curStart, curEnd]);
      curStart = s;
      curEnd = e;
    }
  }
  mergedIntervals.push([curStart, curEnd]);

  const avgPerp =
    group.reduce((sum, s) => {
      const mx = (s.x1 + s.x2) / 2;
      const my = (s.y1 + s.y2) / 2;
      return sum + ((mx - refX) * perpX + (my - refY) * perpY);
    }, 0) / group.length;

  return mergedIntervals.map(([s, e]) => ({
    x1: refX + dirX * s + perpX * avgPerp,
    y1: refY + dirY * s + perpY * avgPerp,
    x2: refX + dirX * e + perpX * avgPerp,
    y2: refY + dirY * e + perpY * avgPerp,
  }));
}

/** Detecta segmentos de reta (candidatos a parede) em uma imagem de planta baixa. */
export function detectWallSegments(
  image: RasterImage,
  options: DetectionOptions = {}
): DetectedSegment[] {
  const opts = { ...DEFAULTS, ...options };
  const gray = toGrayscale(image);
  const edgePoints = sobelEdgePoints(gray, image.width, image.height, opts.edgeThreshold);
  if (edgePoints.length === 0) return [];

  const space = buildHoughSpace(edgePoints, image.width, image.height, opts.thetaStepDeg);

  let maxVotes = 0;
  for (const v of space.accumulator) if (v > maxVotes) maxVotes = v;
  const minVotes = Math.max(10, Math.round(maxVotes * opts.minVotesRatio));

  const peaks = findPeaks(space, opts.maxLines, minVotes);

  const rawSegments: { x1: number; y1: number; x2: number; y2: number; length: number }[] = [];
  for (const peak of peaks) {
    const segs = extractSegmentsForPeak(
      peak,
      edgePoints,
      space,
      opts.maxPerpDistancePx,
      opts.maxGapPx,
      opts.minSegmentLengthPx
    );
    rawSegments.push(...segs);
  }

  const snapped = rawSegments.map((s) =>
    opts.orthoSnapDeg > 0 ? applyOrthoSnap(s, opts.orthoSnapDeg) : s
  );

  const merged = mergeCollinearSegments(
    snapped,
    Math.max(opts.orthoSnapDeg, 4),
    opts.maxPerpDistancePx * 2.5,
    opts.maxGapPx * 1.5
  );

  return merged.map((s, i) => ({
    id: `det-${i + 1}`,
    x1: s.x1,
    y1: s.y1,
    x2: s.x2,
    y2: s.y2,
    length: Math.hypot(s.x2 - s.x1, s.y2 - s.y1),
  }));
}
