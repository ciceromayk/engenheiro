import type { Beam, Column, Slab, StructuralModel, StructuralParams, Wall } from "@/lib/types";
import { generateColumnsAndBeams } from "@/lib/engine/columnsAndBeams";
import { generateSlabs } from "@/lib/engine/slabs";
import { validateStructure } from "@/lib/engine/validation";

export { generateColumnsAndBeams } from "@/lib/engine/columnsAndBeams";
export { generateSlabs } from "@/lib/engine/slabs";
export { validateStructure } from "@/lib/engine/validation";
export * from "@/lib/engine/geometry";

/** Gera o lançamento estrutural completo (Módulo 1) a partir das paredes de arquitetura. */
export function generateStructuralModel(walls: Wall[], params: StructuralParams): StructuralModel {
  const { columns, beams, segmentToBeams } = generateColumnsAndBeams(walls, params);
  const slabs = generateSlabs(walls, params, segmentToBeams);
  const warnings = validateStructure(walls, columns, beams, slabs, params);

  return {
    columns,
    beams,
    slabs,
    warnings,
    generatedAt: new Date().toISOString(),
  };
}

/** Reexecuta apenas as validações sobre um modelo já existente (após edição manual). */
export function revalidateStructure(
  walls: Wall[],
  columns: Column[],
  beams: Beam[],
  slabs: Slab[],
  params: StructuralParams
) {
  return validateStructure(walls, columns, beams, slabs, params);
}
