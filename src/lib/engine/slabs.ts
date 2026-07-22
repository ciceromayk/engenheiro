import type { Slab, SlabDirection, StructuralParams, Wall } from "@/lib/types";
import { boundingBox, extractRoomPolygons } from "@/lib/engine/geometry";

function roundUpToStep(value: number, step: number): number {
  const result = Math.ceil(value / step - 1e-9) * step;
  return Math.round(result * 1000) / 1000;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Gera os painéis de laje maciça a partir dos cômodos identificados nas paredes,
 * classificando a direção de armação (uma ou duas direções) e estimando a espessura
 * por regras de pré-dimensionamento (h ≈ vão/40 em duas direções, vão/30 em uma direção).
 */
export function generateSlabs(
  walls: Wall[],
  params: StructuralParams,
  segmentToBeams: Map<string, string[]>
): Slab[] {
  const rooms = extractRoomPolygons(walls);

  return rooms.map((room, index) => {
    const { min, max } = boundingBox(room.polygon);
    const widthX = max.x - min.x;
    const widthY = max.y - min.y;
    const shortSpan = Math.min(widthX, widthY);
    const longSpan = Math.max(widthX, widthY);

    const direction: SlabDirection = shortSpan > 0 && longSpan / shortSpan <= 2 ? "two-way" : "one-way";

    const rawThickness =
      direction === "two-way"
        ? longSpan / params.twoWaySlabRatio
        : shortSpan / params.oneWaySlabRatio;
    const thickness = Math.max(roundUpToStep(rawThickness, 0.01), params.minSlabThickness);

    const beamIds = Array.from(
      new Set(room.wallIds.flatMap((segmentId) => segmentToBeams.get(segmentId) ?? []))
    );

    return {
      id: `slab-${index + 1}`,
      polygon: room.polygon,
      beamIds,
      shortSpan: round2(shortSpan),
      longSpan: round2(longSpan),
      direction,
      thickness: round2(thickness),
      label: `L${index + 1}`,
    };
  });
}
