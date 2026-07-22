import type { Point, Wall } from "@/lib/types";

/** Tolerância para considerar dois pontos coincidentes (metros). */
const SNAP_TOLERANCE = 0.01;

export function pointKey(p: Point, tolerance = SNAP_TOLERANCE): string {
  const gx = Math.round(p.x / tolerance);
  const gy = Math.round(p.y / tolerance);
  return `${gx}:${gy}`;
}

export function pointsEqual(a: Point, b: Point, tolerance = SNAP_TOLERANCE): boolean {
  return Math.abs(a.x - b.x) <= tolerance && Math.abs(a.y - b.y) <= tolerance;
}

export function distance(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export function midpoint(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

export function snapPoint(p: Point, tolerance = SNAP_TOLERANCE): Point {
  return {
    x: Math.round(p.x / tolerance) * tolerance,
    y: Math.round(p.y / tolerance) * tolerance,
  };
}

export interface WallSegment {
  /** id do sub-segmento, ex.: "w1#0" */
  id: string;
  /** id da parede original de arquitetura */
  wallId: string;
  start: Point;
  end: Point;
  thickness: number;
  kind: Wall["kind"];
  length: number;
}

/**
 * Retorna os sub-segmentos de parede (já particionados nas interseções, com pontos
 * canônicos/arredondados). Cada segmento liga dois nós consecutivos do grafo planar
 * e é a unidade base para posicionar pilares e vigas.
 */
export function getWallSegments(walls: Wall[]): WallSegment[] {
  const split = splitWallsAtIntersections(walls);
  return split
    .map((w) => {
      const start = snapPoint(w.start);
      const end = snapPoint(w.end);
      const hashIndex = w.id.lastIndexOf("#");
      const originalId = hashIndex >= 0 ? w.id.slice(0, hashIndex) : w.id;
      return {
        id: w.id,
        wallId: originalId,
        start,
        end,
        thickness: w.thickness,
        kind: w.kind,
        length: distance(start, end),
      };
    })
    .filter((s) => s.length > 1e-6);
}

/** Nó do grafo planar formado pelas paredes. */
interface GraphNode {
  point: Point;
  /** Índices de nós vizinhos, um por parede incidente. */
  neighbors: { nodeIndex: number; wallId: string }[];
}

export interface PlanarGraph {
  nodes: GraphNode[];
  keyToIndex: Map<string, number>;
}

function dot(a: Point, b: Point): number {
  return a.x * b.x + a.y * b.y;
}

/** Verifica se o ponto p está sobre o segmento ab (dentro da tolerância), incluindo extremidades. */
function pointOnSegment(p: Point, a: Point, b: Point, tolerance = SNAP_TOLERANCE): boolean {
  const abLen = distance(a, b);
  if (abLen < 1e-9) return false;
  const ab = { x: b.x - a.x, y: b.y - a.y };
  const ap = { x: p.x - a.x, y: p.y - a.y };
  const cross = Math.abs(ab.x * ap.y - ab.y * ap.x) / abLen;
  if (cross > tolerance) return false;
  const t = dot(ap, ab) / (abLen * abLen);
  return t >= -tolerance / abLen && t <= 1 + tolerance / abLen;
}

/** Interseção própria (em X) entre dois segmentos, se houver, com 0<t<1 e 0<s<1. */
function properIntersection(a1: Point, a2: Point, b1: Point, b2: Point): Point | null {
  const d1 = { x: a2.x - a1.x, y: a2.y - a1.y };
  const d2 = { x: b2.x - b1.x, y: b2.y - b1.y };
  const denom = d1.x * d2.y - d1.y * d2.x;
  if (Math.abs(denom) < 1e-9) return null; // paralelas ou colineares
  const diff = { x: b1.x - a1.x, y: b1.y - a1.y };
  const t = (diff.x * d2.y - diff.y * d2.x) / denom;
  const s = (diff.x * d1.y - diff.y * d1.x) / denom;
  const eps = 1e-6;
  if (t <= eps || t >= 1 - eps || s <= eps || s >= 1 - eps) return null;
  return { x: a1.x + t * d1.x, y: a1.y + t * d1.y };
}

/**
 * Particiona as paredes em sub-segmentos nos pontos onde outra parede cruza ou
 * encosta (junção em T), de forma que interseções no meio de uma parede também
 * virem nós do grafo planar (necessário para separar cômodos corretamente).
 */
export function splitWallsAtIntersections(walls: Wall[]): Wall[] {
  const usable = walls.filter((w) => !pointsEqual(w.start, w.end));
  const breakPoints: Point[][] = usable.map((w) => [w.start, w.end]);

  for (let i = 0; i < usable.length; i++) {
    for (let j = i + 1; j < usable.length; j++) {
      const w1 = usable[i];
      const w2 = usable[j];

      for (const p of [w2.start, w2.end]) {
        if (pointOnSegment(p, w1.start, w1.end)) breakPoints[i].push(p);
      }
      for (const p of [w1.start, w1.end]) {
        if (pointOnSegment(p, w2.start, w2.end)) breakPoints[j].push(p);
      }

      const inter = properIntersection(w1.start, w1.end, w2.start, w2.end);
      if (inter) {
        breakPoints[i].push(inter);
        breakPoints[j].push(inter);
      }
    }
  }

  const result: Wall[] = [];
  usable.forEach((w, i) => {
    const dir = { x: w.end.x - w.start.x, y: w.end.y - w.start.y };
    const len = Math.hypot(dir.x, dir.y);
    const unit = { x: dir.x / len, y: dir.y / len };

    const uniquePoints: Point[] = [];
    for (const p of breakPoints[i]) {
      if (!uniquePoints.some((q) => pointsEqual(q, p))) uniquePoints.push(p);
    }
    uniquePoints.sort((a, b) => dot(a, unit) - dot(b, unit));

    for (let k = 0; k < uniquePoints.length - 1; k++) {
      const segStart = uniquePoints[k];
      const segEnd = uniquePoints[k + 1];
      if (distance(segStart, segEnd) < SNAP_TOLERANCE) continue;
      result.push({
        ...w,
        id: `${w.id}#${k}`,
        start: segStart,
        end: segEnd,
      });
    }
  });

  return result;
}

/** Constrói o grafo planar (nós + arestas) a partir da lista de paredes, já particionadas nas interseções. */
export function buildPlanarGraph(walls: Wall[]): PlanarGraph {
  const splitWalls = splitWallsAtIntersections(walls);
  const nodes: GraphNode[] = [];
  const keyToIndex = new Map<string, number>();

  function getOrCreateNode(p: Point): number {
    const snapped = snapPoint(p);
    const key = pointKey(snapped);
    const existing = keyToIndex.get(key);
    if (existing !== undefined) return existing;
    const index = nodes.length;
    nodes.push({ point: snapped, neighbors: [] });
    keyToIndex.set(key, index);
    return index;
  }

  for (const wall of splitWalls) {
    if (pointsEqual(wall.start, wall.end)) continue; // parede degenerada
    const a = getOrCreateNode(wall.start);
    const b = getOrCreateNode(wall.end);
    if (a === b) continue;
    nodes[a].neighbors.push({ nodeIndex: b, wallId: wall.id });
    nodes[b].neighbors.push({ nodeIndex: a, wallId: wall.id });
  }

  return { nodes, keyToIndex };
}

function angleBetween(from: Point, to: Point): number {
  return Math.atan2(to.y - from.y, to.x - from.x);
}

function normalizeAngle(a: number): number {
  let r = a;
  while (r <= -Math.PI) r += 2 * Math.PI;
  while (r > Math.PI) r -= 2 * Math.PI;
  return r;
}

export interface RoomPolygon {
  polygon: Point[];
  wallIds: string[];
  area: number;
}

/**
 * Extrai os polígonos fechados (cômodos) de um grafo planar formado pelas paredes,
 * usando o algoritmo clássico de rastreamento de faces (half-edge / next-edge clockwise).
 * Referência: extração de faces de um grafo planar reto (PSLG).
 */
export function extractRoomPolygons(walls: Wall[]): RoomPolygon[] {
  const graph = buildPlanarGraph(walls);
  const { nodes } = graph;

  // Para cada nó, pré-ordena os vizinhos por ângulo (crescente).
  const sortedNeighbors: { nodeIndex: number; wallId: string; angle: number }[][] = nodes.map(
    (node) =>
      node.neighbors
        .map((n) => ({ ...n, angle: angleBetween(node.point, nodes[n.nodeIndex].point) }))
        .sort((a, b) => a.angle - b.angle)
  );

  const visited = new Set<string>(); // chave: `${u}-${v}` (aresta direcionada)

  function edgeKey(u: number, v: number): string {
    return `${u}->${v}`;
  }

  /** Dado que chegamos em v vindo de u, encontra o próximo nó no sentido horário a partir da direção de volta (v->u). */
  function nextNode(u: number, v: number): { nodeIndex: number; wallId: string } | null {
    const neighbors = sortedNeighbors[v];
    if (neighbors.length === 0) return null;
    if (neighbors.length === 1) {
      // Parede "solta" (dead end): volta pelo mesmo caminho.
      return { nodeIndex: neighbors[0].nodeIndex, wallId: neighbors[0].wallId };
    }
    const backAngle = normalizeAngle(angleBetween(nodes[v].point, nodes[u].point));

    // Encontra o vizinho imediatamente no sentido horário a partir da direção de volta
    // (maior ângulo estritamente menor que backAngle, de forma circular). Isso mantém
    // a face sendo traçada sempre do mesmo lado, gerando polígonos simples e consistentes.
    let best: { nodeIndex: number; wallId: string } | null = null;
    let bestDelta = Infinity;
    for (const n of neighbors) {
      let delta = backAngle - n.angle;
      while (delta <= 0) delta += 2 * Math.PI;
      while (delta > 2 * Math.PI) delta -= 2 * Math.PI;
      if (delta < bestDelta) {
        bestDelta = delta;
        best = n;
      }
    }
    return best;
  }

  const faces: { nodeSeq: number[]; wallIds: string[] }[] = [];

  for (let startU = 0; startU < nodes.length; startU++) {
    for (const startNeighbor of sortedNeighbors[startU]) {
      const startKey = edgeKey(startU, startNeighbor.nodeIndex);
      if (visited.has(startKey)) continue;

      const nodeSeq: number[] = [startU];
      const wallIds: string[] = [];
      let u = startU;
      let v = startNeighbor.nodeIndex;
      let wallId = startNeighbor.wallId;
      let guard = 0;
      const maxSteps = nodes.length * 8 + 16;

      while (guard++ < maxSteps) {
        visited.add(edgeKey(u, v));
        nodeSeq.push(v);
        wallIds.push(wallId);

        if (v === startU && nodeSeq.length > 1) {
          // Fechou o laço exatamente no nó inicial.
          const closesAtStart =
            nodeSeq.length >= 2 && nodeSeq[nodeSeq.length - 1] === startU;
          if (closesAtStart) break;
        }

        const next = nextNode(u, v);
        if (!next) break;
        u = v;
        v = next.nodeIndex;
        wallId = next.wallId;

        if (u === startU && v === startNeighbor.nodeIndex) {
          // Voltou à aresta inicial sem re-percorrer (grau 1 / becos): encerra.
          break;
        }
      }

      faces.push({ nodeSeq, wallIds });
    }
  }

  // Converte sequências de nós em polígonos de pontos e calcula área assinada (shoelace).
  const polygons: RoomPolygon[] = faces
    .map((f) => {
      const polygon = f.nodeSeq.map((idx) => nodes[idx].point);
      const area = signedArea(polygon);
      return { polygon, wallIds: f.wallIds, area };
    })
    .filter((p) => p.polygon.length >= 4 && Math.abs(p.area) > 1e-4);

  if (polygons.length === 0) return [];

  // A face externa (não delimitada) é a de maior área em módulo — descarta.
  let maxAbsArea = 0;
  let maxIdx = -1;
  polygons.forEach((p, i) => {
    if (Math.abs(p.area) > maxAbsArea) {
      maxAbsArea = Math.abs(p.area);
      maxIdx = i;
    }
  });

  const rooms = polygons.filter((_, i) => i !== maxIdx).map((p) => ({
    ...p,
    area: Math.abs(p.area),
  }));

  // Remove duplicatas (mesma face pode ser traçada uma única vez, mas por segurança).
  const seen = new Set<string>();
  const unique: RoomPolygon[] = [];
  for (const room of rooms) {
    const key = room.polygon
      .map((p) => pointKey(p))
      .sort()
      .join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(room);
  }

  return unique;
}

function signedArea(polygon: Point[]): number {
  let sum = 0;
  for (let i = 0; i < polygon.length - 1; i++) {
    const a = polygon[i];
    const b = polygon[i + 1];
    sum += a.x * b.y - b.x * a.y;
  }
  return sum / 2;
}

/** Bounding box de um conjunto de pontos. */
export function boundingBox(points: Point[]): { min: Point; max: Point } {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  return {
    min: { x: Math.min(...xs), y: Math.min(...ys) },
    max: { x: Math.max(...xs), y: Math.max(...ys) },
  };
}
