// Modelo de domínio do Módulo 1: Lançamento Estrutural em Concreto Armado
// Unidades: coordenadas e dimensões em metros (m), salvo indicação contrária (cm quando citado).

export interface Point {
  x: number;
  y: number;
}

/** Parede de arquitetura, informada via formulário estruturado (sem desenho livre). */
export interface Wall {
  id: string;
  start: Point;
  end: Point;
  /** Espessura da parede em metros (ex.: 0.15) */
  thickness: number;
  /** Parede externa (fachada) ou interna */
  kind: "external" | "internal";
}

export type ColumnOrigin = "auto" | "manual";

/** Pilar de concreto armado */
export interface Column {
  id: string;
  position: Point;
  /** Dimensões da seção em metros, ex.: 0.20 x 0.20 */
  width: number;
  depth: number;
  origin: ColumnOrigin;
  /** id da parede de referência, quando aplicável */
  wallId?: string;
  /** rótulo, ex.: P1, P2 */
  label: string;
}

export type BeamOrigin = "auto" | "manual";

/** Viga de concreto armado, ligando dois pilares */
export interface Beam {
  id: string;
  startColumnId: string;
  endColumnId: string;
  /** Largura (base) em metros, ex.: 0.20 */
  width: number;
  /** Altura da seção em metros, ex.: 0.40 */
  height: number;
  origin: BeamOrigin;
  wallId?: string;
  label: string;
}

export type SlabDirection = "one-way" | "two-way";

/** Painel de laje maciça, delimitado por vigas */
export interface Slab {
  id: string;
  /** Vértices do polígono do painel (na ordem, fechado implicitamente) */
  polygon: Point[];
  /** ids das vigas que delimitam o painel, quando identificáveis */
  beamIds: string[];
  /** menor vão (m) */
  shortSpan: number;
  /** maior vão (m) */
  longSpan: number;
  direction: SlabDirection;
  /** espessura estimada (m) */
  thickness: number;
  label: string;
}

export interface StructuralWarning {
  id: string;
  severity: "info" | "warning" | "error";
  message: string;
  elementId?: string;
  elementType?: "column" | "beam" | "slab" | "wall";
}

export interface StructuralParams {
  /** Vão máximo admitido entre pilares antes de inserir pilar intermediário (m) */
  maxColumnSpacing: number;
  /** Seção padrão de pilar (m) */
  defaultColumnSize: number;
  /** Largura padrão de viga (m) */
  defaultBeamWidth: number;
  /** Relação vão/altura para pré-dimensionamento de viga (ex.: 12 -> h = vão/12) */
  beamSpanToHeightRatio: number;
  /** Relação para espessura de laje armada em 2 direções (h = maior vão / ratio) */
  twoWaySlabRatio: number;
  /** Relação para espessura de laje armada em 1 direção (h = menor vão / ratio) */
  oneWaySlabRatio: number;
  /** Espessura mínima de laje (m), conforme NBR 6118 (lajes de piso maciças) */
  minSlabThickness: number;
}

export const DEFAULT_STRUCTURAL_PARAMS: StructuralParams = {
  maxColumnSpacing: 5.0,
  defaultColumnSize: 0.2,
  defaultBeamWidth: 0.2,
  beamSpanToHeightRatio: 12,
  twoWaySlabRatio: 40,
  oneWaySlabRatio: 30,
  minSlabThickness: 0.08,
};

export interface StructuralModel {
  columns: Column[];
  beams: Beam[];
  slabs: Slab[];
  warnings: StructuralWarning[];
  generatedAt: string;
}

export interface Project {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
  walls: Wall[];
  params: StructuralParams;
  structure: StructuralModel | null;
}
