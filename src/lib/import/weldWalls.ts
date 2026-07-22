import type { Point, Wall } from "@/lib/types";
import { distance } from "@/lib/engine/geometry";

interface Cluster {
  sumX: number;
  sumY: number;
  count: number;
}

/**
 * Une extremidades de paredes que estão muito próximas (mas não idênticas) no mesmo
 * ponto exato. Necessário para dados vindos de detecção em imagem ou desenhos com
 * pequena imprecisão: sem isso, cantos que deveriam coincidir geram nós duplicados
 * no grafo planar, e o motor estrutural lança pilares repetidos nesses pontos.
 */
export function weldNearbyWallEndpoints(walls: Wall[], toleranceM: number): Wall[] {
  const clusters: Cluster[] = [];

  function findOrCreateCluster(p: Point): number {
    for (let i = 0; i < clusters.length; i++) {
      const c = clusters[i];
      const cx = c.sumX / c.count;
      const cy = c.sumY / c.count;
      if (Math.hypot(cx - p.x, cy - p.y) <= toleranceM) {
        c.sumX += p.x;
        c.sumY += p.y;
        c.count++;
        return i;
      }
    }
    clusters.push({ sumX: p.x, sumY: p.y, count: 1 });
    return clusters.length - 1;
  }

  const startIdx = walls.map((w) => findOrCreateCluster(w.start));
  const endIdx = walls.map((w) => findOrCreateCluster(w.end));

  return walls.map((w, i) => {
    const sc = clusters[startIdx[i]];
    const ec = clusters[endIdx[i]];
    return {
      ...w,
      start: { x: sc.sumX / sc.count, y: sc.sumY / sc.count },
      end: { x: ec.sumX / ec.count, y: ec.sumY / ec.count },
    };
  });
}

function projectPointOntoSegment(p: Point, a: Point, b: Point): Point {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const lenSq = abx * abx + aby * aby;
  if (lenSq < 1e-9) return a;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.y - a.y) * aby) / lenSq));
  return { x: a.x + abx * t, y: a.y + aby * t };
}

/**
 * Encaixa extremidades que terminam perto do meio de outra parede (junção em T) mas
 * não exatamente sobre ela — comum em traçados a partir de imagem, onde a detecção
 * tem alguns centímetros de erro. Sem isso, o motor estrutural não reconhece a
 * junção e trata os dois pontos como pilares separados e muito próximos.
 */
export function snapEndpointsToNearbyWalls(walls: Wall[], toleranceM: number): Wall[] {
  function snap(p: Point, selfIndex: number): Point {
    let best = p;
    let bestDist = toleranceM;
    walls.forEach((w, i) => {
      if (i === selfIndex) return;
      const proj = projectPointOntoSegment(p, w.start, w.end);
      const d = distance(p, proj);
      if (d < bestDist) {
        bestDist = d;
        best = proj;
      }
    });
    return best;
  }

  return walls.map((w, i) => ({
    ...w,
    start: snap(w.start, i),
    end: snap(w.end, i),
  }));
}

/** Normaliza um conjunto de paredes vindas de importação: solda cantos próximos e encaixa junções em T. */
export function cleanImportedWalls(walls: Wall[], toleranceM: number): Wall[] {
  const welded = weldNearbyWallEndpoints(walls, toleranceM);
  const snapped = snapEndpointsToNearbyWalls(welded, toleranceM);
  return weldNearbyWallEndpoints(snapped, toleranceM);
}
