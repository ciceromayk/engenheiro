// Em plantas reais, cada parede costuma ser desenhada como DUAS linhas paralelas
// (as duas faces da alvenaria), não uma linha só. Este módulo identifica pares de
// segmentos quase-paralelos, sobrepostos e com afastamento real compatível com uma
// espessura de parede, fundindo cada par em uma única parede com linha de centro e
// espessura calculada — em vez de importar duas paredes finas coladas.

import { lineAngleDifferenceDeg, segmentAngleRad, type Segment } from "@/lib/import/imageWallDetection";

export interface IdentifiedSegment extends Segment {
  id: string;
}

export interface PairedWall extends Segment {
  thicknessM: number;
  sourceIds: [string, string];
}

export interface PairingOptions {
  /** Afastamento mínimo (m) entre as duas linhas para considerá-las faces da mesma parede. */
  minGapM?: number;
  /** Afastamento máximo (m). */
  maxGapM?: number;
  /** Tolerância de ângulo entre as duas linhas (graus) para considerá-las paralelas. */
  angleTolDeg?: number;
  /** Fração mínima de sobreposição ao longo da direção comum (0-1). */
  minOverlapRatio?: number;
}

const DEFAULTS: Required<PairingOptions> = {
  minGapM: 0.08,
  maxGapM: 0.22,
  angleTolDeg: 4,
  minOverlapRatio: 0.5,
};

function perpendicularGapBetweenLines(a: Segment, b: Segment): number {
  const dx = a.x2 - a.x1;
  const dy = a.y2 - a.y1;
  const len = Math.hypot(dx, dy) || 1e-9;
  const nx = -dy / len;
  const ny = dx / len;
  const d1 = (b.x1 - a.x1) * nx + (b.y1 - a.y1) * ny;
  const d2 = (b.x2 - a.x1) * nx + (b.y2 - a.y1) * ny;
  return Math.abs((d1 + d2) / 2);
}

function projectedOverlapRatio(a: Segment, b: Segment, angle: number): number {
  const dirX = Math.cos(angle);
  const dirY = Math.sin(angle);
  const projA = [a.x1 * dirX + a.y1 * dirY, a.x2 * dirX + a.y2 * dirY].sort((x, y) => x - y);
  const projB = [b.x1 * dirX + b.y1 * dirY, b.x2 * dirX + b.y2 * dirY].sort((x, y) => x - y);
  const overlapStart = Math.max(projA[0], projB[0]);
  const overlapEnd = Math.min(projA[1], projB[1]);
  const overlapLen = Math.max(0, overlapEnd - overlapStart);
  const lenA = projA[1] - projA[0];
  const lenB = projB[1] - projB[0];
  const minLen = Math.min(lenA, lenB) || 1e-9;
  return overlapLen / minLen;
}

/** Linha de centro entre duas retas quase-paralelas, cobrindo apenas o trecho em que ambas se sobrepõem. */
function computeCenterline(a: Segment, b: Segment, angle: number): Segment {
  const dirX = Math.cos(angle);
  const dirY = Math.sin(angle);
  const nx = -dirY;
  const ny = dirX;
  const refX = a.x1;
  const refY = a.y1;

  function project(x: number, y: number) {
    return { s: (x - refX) * dirX + (y - refY) * dirY, n: (x - refX) * nx + (y - refY) * ny };
  }

  const pa1 = project(a.x1, a.y1);
  const pa2 = project(a.x2, a.y2);
  const pb1 = project(b.x1, b.y1);
  const pb2 = project(b.x2, b.y2);

  const sA = [pa1.s, pa2.s].sort((x, y) => x - y);
  const sB = [pb1.s, pb2.s].sort((x, y) => x - y);
  const start = Math.max(sA[0], sB[0]);
  const end = Math.min(sA[1], sB[1]);
  const avgN = (pa1.n + pa2.n + pb1.n + pb2.n) / 4;

  return {
    x1: refX + dirX * start + nx * avgN,
    y1: refY + dirY * start + ny * avgN,
    x2: refX + dirX * end + nx * avgN,
    y2: refY + dirY * end + ny * avgN,
  };
}

export interface PairingResult {
  paired: PairedWall[];
  unmatched: IdentifiedSegment[];
}

/**
 * Agrupa pares de segmentos quase-paralelos e sobrepostos cujo afastamento real
 * (calculado via pixelsPerMeter) cai na faixa de espessura de alvenaria, fundindo
 * cada par em uma única parede com linha de centro e espessura medida.
 */
export function pairParallelWallLines(
  segments: IdentifiedSegment[],
  pixelsPerMeter: number,
  options: PairingOptions = {}
): PairingResult {
  const opts = { ...DEFAULTS, ...options };
  const minGapPx = opts.minGapM * pixelsPerMeter;
  const maxGapPx = opts.maxGapM * pixelsPerMeter;

  interface Candidate {
    i: number;
    j: number;
    overlapRatio: number;
  }
  const candidates: Candidate[] = [];

  for (let i = 0; i < segments.length; i++) {
    for (let j = i + 1; j < segments.length; j++) {
      const a = segments[i];
      const b = segments[j];
      const angleA = segmentAngleRad(a);
      const angleB = segmentAngleRad(b);
      if (lineAngleDifferenceDeg(angleA, angleB) > opts.angleTolDeg) continue;

      const gapPx = perpendicularGapBetweenLines(a, b);
      if (gapPx < minGapPx || gapPx > maxGapPx) continue;

      const overlapRatio = projectedOverlapRatio(a, b, angleA);
      if (overlapRatio < opts.minOverlapRatio) continue;

      candidates.push({ i, j, overlapRatio });
    }
  }

  candidates.sort((c1, c2) => c2.overlapRatio - c1.overlapRatio);

  const used = new Set<string>();
  const paired: PairedWall[] = [];

  for (const c of candidates) {
    const a = segments[c.i];
    const b = segments[c.j];
    if (used.has(a.id) || used.has(b.id)) continue;
    used.add(a.id);
    used.add(b.id);

    const angle = segmentAngleRad(a);
    const centerline = computeCenterline(a, b, angle);
    const gapPx = perpendicularGapBetweenLines(a, b);

    paired.push({
      ...centerline,
      thicknessM: gapPx / pixelsPerMeter,
      sourceIds: [a.id, b.id],
    });
  }

  const unmatchedRaw = segments.filter((s) => !used.has(s.id));

  // Junções de linhas duplas em cantos e cruzamentos costumam deixar fragmentos
  // residuais de uma parede já pareada (mesma região, leve inclinação que escapou
  // da tolerância de fusão). Descarta sobras que estão coladas em uma parede já
  // capturada, mantendo apenas segmentos realmente independentes.
  const fragmentTolerancePx = opts.maxGapM * 1.5 * pixelsPerMeter;
  const unmatched = unmatchedRaw.filter((s) => !isNearAnyPairedWall(s, paired, fragmentTolerancePx));

  return { paired, unmatched };
}

function distancePointToSegment(px: number, py: number, seg: Segment): number {
  const abx = seg.x2 - seg.x1;
  const aby = seg.y2 - seg.y1;
  const lenSq = abx * abx + aby * aby;
  if (lenSq < 1e-9) return Math.hypot(px - seg.x1, py - seg.y1);
  const t = Math.max(0, Math.min(1, ((px - seg.x1) * abx + (py - seg.y1) * aby) / lenSq));
  const cx = seg.x1 + abx * t;
  const cy = seg.y1 + aby * t;
  return Math.hypot(px - cx, py - cy);
}

function isNearAnyPairedWall(seg: Segment, walls: PairedWall[], toleranceGapPx: number): boolean {
  const midX = (seg.x1 + seg.x2) / 2;
  const midY = (seg.y1 + seg.y2) / 2;
  return walls.some((w) => {
    const dStart = distancePointToSegment(seg.x1, seg.y1, w);
    const dEnd = distancePointToSegment(seg.x2, seg.y2, w);
    const dMid = distancePointToSegment(midX, midY, w);
    return dStart <= toleranceGapPx && dEnd <= toleranceGapPx && dMid <= toleranceGapPx;
  });
}
