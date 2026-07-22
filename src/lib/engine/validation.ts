import type { Beam, Column, Slab, StructuralParams, StructuralWarning, Wall } from "@/lib/types";
import { boundingBox, distance } from "@/lib/engine/geometry";

function signedPolygonArea(polygon: { x: number; y: number }[]): number {
  let sum = 0;
  for (let i = 0; i < polygon.length - 1; i++) {
    const a = polygon[i];
    const b = polygon[i + 1];
    sum += a.x * b.y - b.x * a.y;
  }
  return Math.abs(sum / 2);
}

/**
 * Executa checagens de pré-dimensionamento sobre o modelo estrutural (pilares, vigas
 * e lajes), gerando avisos informativos, de atenção e de erro. Não substitui a análise
 * estrutural detalhada conforme NBR 6118 — serve como triagem inicial (lançamento).
 */
export function validateStructure(
  walls: Wall[],
  columns: Column[],
  beams: Beam[],
  slabs: Slab[],
  params: StructuralParams
): StructuralWarning[] {
  const warnings: StructuralWarning[] = [];

  if (walls.length === 0) {
    warnings.push({
      id: "no-walls",
      severity: "info",
      message: "Nenhuma parede lançada ainda. Informe as paredes da planta para gerar a estrutura.",
    });
    return warnings;
  }

  const columnById = new Map(columns.map((c) => [c.id, c]));

  for (const beam of beams) {
    const startColumn = columnById.get(beam.startColumnId);
    const endColumn = columnById.get(beam.endColumnId);
    if (!startColumn || !endColumn) continue;
    const span = distance(startColumn.position, endColumn.position);
    if (span > params.maxColumnSpacing + 0.05) {
      warnings.push({
        id: `beam-span-${beam.id}`,
        severity: "warning",
        message: `Viga ${beam.label}: vão de ${span.toFixed(2)} m excede o vão máximo recomendado entre pilares (${params.maxColumnSpacing.toFixed(2)} m). Considere adicionar um pilar intermediário.`,
        elementId: beam.id,
        elementType: "beam",
      });
    }
  }

  for (const slab of slabs) {
    const { min, max } = boundingBox(slab.polygon);
    const bboxArea = (max.x - min.x) * (max.y - min.y);
    const actualArea = signedPolygonArea(slab.polygon);
    if (bboxArea > 0 && actualArea / bboxArea < 0.85) {
      warnings.push({
        id: `slab-shape-${slab.id}`,
        severity: "info",
        message: `Laje ${slab.label}: cômodo não retangular. Vãos e espessura estimados pela caixa envolvente (aproximação); revise manualmente.`,
        elementId: slab.id,
        elementType: "slab",
      });
    }

    if (slab.longSpan > 8) {
      warnings.push({
        id: `slab-span-${slab.id}`,
        severity: "warning",
        message: `Laje ${slab.label}: maior vão de ${slab.longSpan.toFixed(2)} m é grande para laje maciça convencional. Considere viga adicional, laje nervurada ou protendida.`,
        elementId: slab.id,
        elementType: "slab",
      });
    }

    if (slab.beamIds.length === 0) {
      warnings.push({
        id: `slab-unbound-${slab.id}`,
        severity: "warning",
        message: `Laje ${slab.label}: não foi possível associar vigas de apoio no perímetro. Verifique se as paredes/pilares ao redor foram gerados.`,
        elementId: slab.id,
        elementType: "slab",
      });
    }
  }

  warnings.push({
    id: "disclaimer",
    severity: "info",
    message:
      "Lançamento automático é uma estimativa preliminar (pré-dimensionamento). O dimensionamento final deve seguir a NBR 6118 e ser validado por profissional habilitado.",
  });

  return warnings;
}
