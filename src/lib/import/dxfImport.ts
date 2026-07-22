import DxfParser from "dxf-parser";
import type { IDxf, IEntity } from "dxf-parser";
import type { Wall } from "@/lib/types";

export interface DxfLayerInfo {
  name: string;
  /** Quantidade de entidades de linha/polilinha nessa camada */
  entityCount: number;
  /** Heurística: o nome da camada sugere que é uma camada de parede */
  likelyWall: boolean;
}

export interface ParsedDxf {
  dxf: IDxf;
  layers: DxfLayerInfo[];
  /** Fator sugerido para converter as unidades do arquivo em metros */
  suggestedUnitScale: number;
}

const WALL_LAYER_KEYWORDS = [
  "parede",
  "wall",
  "alvenaria",
  "arq-parede",
  "arq_parede",
  "arqparede",
  "muro",
  "vedação",
  "vedacao",
];

interface LineLikeEntity extends IEntity {
  vertices?: { x: number; y: number }[];
  shape?: boolean;
}

function isLineLikeEntity(e: IEntity): e is LineLikeEntity {
  return e.type === "LINE" || e.type === "LWPOLYLINE" || e.type === "POLYLINE";
}

/** Analisa o texto de um arquivo DXF, listando as camadas com entidades de linha/polilinha. */
export function parseDxfText(text: string): ParsedDxf {
  const parser = new DxfParser();
  const dxf = parser.parse(text);
  if (!dxf) {
    throw new Error("Não foi possível interpretar o arquivo DXF. Verifique se o arquivo não está corrompido.");
  }

  const counts = new Map<string, number>();
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  for (const entity of dxf.entities ?? []) {
    if (!isLineLikeEntity(entity)) continue;
    const layerName = entity.layer || "0";
    counts.set(layerName, (counts.get(layerName) ?? 0) + 1);
    for (const v of entity.vertices ?? []) {
      minX = Math.min(minX, v.x);
      maxX = Math.max(maxX, v.x);
      minY = Math.min(minY, v.y);
      maxY = Math.max(maxY, v.y);
    }
  }

  const layers: DxfLayerInfo[] = [...counts.entries()]
    .map(([name, entityCount]) => ({
      name,
      entityCount,
      likelyWall: WALL_LAYER_KEYWORDS.some((k) => name.toLowerCase().includes(k)),
    }))
    .sort((a, b) => {
      if (a.likelyWall !== b.likelyWall) return a.likelyWall ? -1 : 1;
      return b.entityCount - a.entityCount;
    });

  const span = Number.isFinite(minX) ? Math.max(maxX - minX, maxY - minY) : 0;
  // Heurística: plantas reais raramente passam de ~300m no maior eixo.
  // Se os valores brutos do arquivo excedem isso, provavelmente estão em cm ou mm.
  let suggestedUnitScale = 1;
  if (span > 3000) suggestedUnitScale = 0.001; // mm -> m
  else if (span > 300) suggestedUnitScale = 0.01; // cm -> m

  return { dxf, layers, suggestedUnitScale };
}

export interface ExtractWallsOptions {
  selectedLayers: Set<string>;
  /** Fator de conversão das unidades do arquivo para metros */
  unitScale: number;
  /** Espessura padrão (m) para paredes importadas, que não trazem espessura no DXF */
  defaultThickness: number;
}

/** Extrai as paredes (segmentos LINE e trechos de LWPOLYLINE/POLYLINE) das camadas escolhidas. */
export function extractWallsFromDxf(dxf: IDxf, options: ExtractWallsOptions): Wall[] {
  const { selectedLayers, unitScale, defaultThickness } = options;
  const walls: Wall[] = [];
  let counter = 0;
  const nextId = () => `dxf-${++counter}`;

  function pushWall(a: { x: number; y: number }, b: { x: number; y: number }) {
    if (Math.abs(a.x - b.x) < 1e-9 && Math.abs(a.y - b.y) < 1e-9) return;
    walls.push({
      id: nextId(),
      start: { x: a.x * unitScale, y: a.y * unitScale },
      end: { x: b.x * unitScale, y: b.y * unitScale },
      thickness: defaultThickness,
      kind: "internal",
      source: "dxf",
    });
  }

  for (const entity of dxf.entities ?? []) {
    if (!isLineLikeEntity(entity)) continue;
    const layerName = entity.layer || "0";
    if (!selectedLayers.has(layerName)) continue;

    const vertices = entity.vertices ?? [];
    if (vertices.length < 2) continue;

    for (let i = 0; i < vertices.length - 1; i++) {
      pushWall(vertices[i], vertices[i + 1]);
    }
    if (entity.shape && vertices.length > 2) {
      pushWall(vertices[vertices.length - 1], vertices[0]);
    }
  }

  return walls;
}
