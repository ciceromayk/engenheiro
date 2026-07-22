import type { Beam, Column, Point, StructuralParams, Wall } from "@/lib/types";
import { distance, getWallSegments, pointKey, snapPoint } from "@/lib/engine/geometry";

function roundUpToStep(value: number, step: number): number {
  const result = Math.ceil(value / step - 1e-9) * step;
  return Math.round(result * 1000) / 1000;
}

export interface AutoColumnsAndBeams {
  columns: Column[];
  beams: Beam[];
  /** Mapa: id do sub-segmento de parede -> ids das vigas geradas sobre ele (em ordem). */
  segmentToBeams: Map<string, string[]>;
}

/**
 * Lança automaticamente pilares (nos cantos, cruzamentos/T de paredes e em pontos
 * intermediários quando o vão excede o vão máximo admitido) e vigas (ligando pilares
 * consecutivos ao longo de cada trecho de parede).
 */
export function generateColumnsAndBeams(
  walls: Wall[],
  params: StructuralParams
): AutoColumnsAndBeams {
  const segments = getWallSegments(walls);

  const columnPointByKey = new Map<string, Point>();
  const segmentPoints = new Map<string, Point[]>();

  for (const seg of segments) {
    const divisions = Math.max(1, Math.ceil(seg.length / params.maxColumnSpacing));
    const pts: Point[] = [];
    for (let k = 0; k <= divisions; k++) {
      const t = k / divisions;
      const raw: Point = {
        x: seg.start.x + (seg.end.x - seg.start.x) * t,
        y: seg.start.y + (seg.end.y - seg.start.y) * t,
      };
      const snapped = snapPoint(raw);
      pts.push(snapped);
      columnPointByKey.set(pointKey(snapped), snapped);
    }
    segmentPoints.set(seg.id, pts);
  }

  const uniquePoints = [...columnPointByKey.values()].sort(
    (a, b) => a.y - b.y || a.x - b.x
  );

  const columns: Column[] = uniquePoints.map((p, i) => ({
    id: `col-${i + 1}`,
    position: p,
    width: params.defaultColumnSize,
    depth: params.defaultColumnSize,
    origin: "auto",
    label: `P${i + 1}`,
  }));

  const columnIdByKey = new Map<string, string>();
  uniquePoints.forEach((p, i) => columnIdByKey.set(pointKey(p), columns[i].id));

  const beams: Beam[] = [];
  const segmentToBeams = new Map<string, string[]>();
  let beamCounter = 0;

  for (const seg of segments) {
    const pts = segmentPoints.get(seg.id) ?? [];
    const beamIds: string[] = [];
    for (let k = 0; k < pts.length - 1; k++) {
      const a = pts[k];
      const b = pts[k + 1];
      const span = distance(a, b);
      if (span < 1e-6) continue;

      const startColumnId = columnIdByKey.get(pointKey(a));
      const endColumnId = columnIdByKey.get(pointKey(b));
      if (!startColumnId || !endColumnId) continue;

      beamCounter += 1;
      const height = roundUpToStep(
        Math.max(span / params.beamSpanToHeightRatio, 0.25),
        0.05
      );
      const beam: Beam = {
        id: `beam-${beamCounter}`,
        startColumnId,
        endColumnId,
        width: Math.max(params.defaultBeamWidth, seg.thickness),
        height,
        origin: "auto",
        wallId: seg.wallId,
        label: `V${beamCounter}`,
      };
      beams.push(beam);
      beamIds.push(beam.id);
    }
    segmentToBeams.set(seg.id, beamIds);
  }

  return { columns, beams, segmentToBeams };
}
