"use client";

import { useMemo, useRef, useState } from "react";
import type { Point, StructuralModel, Wall } from "@/lib/types";
import { boundingBox } from "@/lib/engine/geometry";

interface PlanCanvasProps {
  walls: Wall[];
  structure: StructuralModel | null;
  onMoveColumn?: (columnId: string, position: Point) => void;
  onSelectColumn?: (columnId: string | null) => void;
  selectedColumnId?: string | null;
}

const MARGIN = 1.2;
const SNAP = 0.05;

function toScreen(p: Point): Point {
  return { x: p.x, y: -p.y };
}

function snap(v: number, step: number): number {
  return Math.round(v / step) * step;
}

export function PlanCanvas({
  walls,
  structure,
  onMoveColumn,
  onSelectColumn,
  selectedColumnId,
}: PlanCanvasProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  // A viewBox é derivada apenas das paredes (não dos pilares), para permanecer
  // estável durante o arraste — do contrário, mover um pilar para fora do
  // contorno atual expandiria o bounding box e mudaria a escala em tempo real,
  // criando um efeito de "zoom" instável enquanto o usuário arrasta.
  const allPoints = useMemo(() => {
    const pts: Point[] = [];
    walls.forEach((w) => {
      pts.push(w.start, w.end);
    });
    if (pts.length === 0) pts.push({ x: 0, y: 0 }, { x: 10, y: 8 });
    return pts;
  }, [walls]);

  const bbox = useMemo(() => boundingBox(allPoints), [allPoints]);

  const minX = bbox.min.x - MARGIN;
  const maxX = bbox.max.x + MARGIN;
  const minY = bbox.min.y - MARGIN;
  const maxY = bbox.max.y + MARGIN;
  const width = Math.max(maxX - minX, 1);
  const height = Math.max(maxY - minY, 1);
  const viewBox = `${minX} ${-maxY} ${width} ${height}`;

  const columnById = useMemo(() => {
    const map = new Map<string, { position: Point }>();
    structure?.columns.forEach((c) => map.set(c.id, c));
    return map;
  }, [structure]);

  function screenToWorld(clientX: number, clientY: number): Point | null {
    const svg = svgRef.current;
    if (!svg) return null;
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return null;
    const svgP = pt.matrixTransform(ctm.inverse());
    return { x: svgP.x, y: -svgP.y };
  }

  function handlePointerDown(e: React.PointerEvent, columnId: string) {
    if (!onMoveColumn) return;
    (e.target as Element).setPointerCapture(e.pointerId);
    setDraggingId(columnId);
    onSelectColumn?.(columnId);
  }

  function handlePointerMove(e: React.PointerEvent) {
    if (!draggingId || !onMoveColumn) return;
    const world = screenToWorld(e.clientX, e.clientY);
    if (!world) return;
    onMoveColumn(draggingId, { x: snap(world.x, SNAP), y: snap(world.y, SNAP) });
  }

  function handlePointerUp() {
    setDraggingId(null);
  }

  // Linhas de grade auxiliares a cada 1m (limitadas para não poluir plantas muito grandes).
  const gridLines: React.ReactNode[] = [];
  const showGrid = width <= 60 && height <= 60;
  if (showGrid) {
    const startX = Math.floor(minX);
    const endX = Math.ceil(maxX);
    const startY = Math.floor(minY);
    const endY = Math.ceil(maxY);
    for (let x = startX; x <= endX; x++) {
      gridLines.push(
        <line key={`gx${x}`} x1={x} y1={-startY} x2={x} y2={-endY} stroke="currentColor" strokeWidth={0.01} className="text-zinc-200 dark:text-zinc-800" />
      );
    }
    for (let y = startY; y <= endY; y++) {
      gridLines.push(
        <line key={`gy${y}`} x1={startX} y1={-y} x2={endX} y2={-y} stroke="currentColor" strokeWidth={0.01} className="text-zinc-200 dark:text-zinc-800" />
      );
    }
  }

  return (
    <svg
      ref={svgRef}
      viewBox={viewBox}
      className="h-[520px] w-full touch-none rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950"
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
    >
      {gridLines}

      {/* Lajes */}
      {structure?.slabs.map((slab) => {
        const pts = slab.polygon.map(toScreen);
        const uniquePts = pts.slice(0, -1);
        const cx = uniquePts.reduce((s, p) => s + p.x, 0) / uniquePts.length;
        const cy = uniquePts.reduce((s, p) => s + p.y, 0) / uniquePts.length;
        return (
          <g key={slab.id}>
            <polygon
              points={pts.map((p) => `${p.x},${p.y}`).join(" ")}
              className="fill-sky-100/70 stroke-sky-300 dark:fill-sky-900/30 dark:stroke-sky-700"
              strokeWidth={0.02}
            />
            <text
              x={cx}
              y={cy}
              fontSize={0.28}
              textAnchor="middle"
              className="fill-sky-700 dark:fill-sky-300 select-none"
            >
              {slab.label} · h={Math.round(slab.thickness * 100)}cm
            </text>
          </g>
        );
      })}

      {/* Paredes de arquitetura (referência) */}
      {walls.map((w) => {
        const a = toScreen(w.start);
        const b = toScreen(w.end);
        return (
          <line
            key={w.id}
            x1={a.x}
            y1={a.y}
            x2={b.x}
            y2={b.y}
            strokeWidth={w.thickness}
            className="stroke-zinc-300 dark:stroke-zinc-700"
            strokeLinecap="square"
          />
        );
      })}

      {/* Vigas */}
      {structure?.beams.map((beam) => {
        const start = columnById.get(beam.startColumnId);
        const end = columnById.get(beam.endColumnId);
        if (!start || !end) return null;
        const a = toScreen(start.position);
        const b = toScreen(end.position);
        return (
          <line
            key={beam.id}
            x1={a.x}
            y1={a.y}
            x2={b.x}
            y2={b.y}
            strokeWidth={beam.width}
            className="stroke-amber-500/70 dark:stroke-amber-500/60"
            strokeLinecap="butt"
          />
        );
      })}

      {/* Pilares */}
      {structure?.columns.map((col) => {
        const s = toScreen(col.position);
        const isSelected = selectedColumnId === col.id;
        return (
          <g key={col.id}>
            <rect
              x={s.x - col.width / 2}
              y={s.y - col.depth / 2}
              width={col.width}
              height={col.depth}
              className={
                isSelected
                  ? "fill-red-600 stroke-red-800"
                  : col.origin === "manual"
                    ? "fill-emerald-600 stroke-emerald-800"
                    : "fill-zinc-800 stroke-zinc-950 dark:fill-zinc-200 dark:stroke-zinc-50"
              }
              strokeWidth={0.015}
              style={{ cursor: onMoveColumn ? "grab" : "default" }}
              onPointerDown={(e) => handlePointerDown(e, col.id)}
              onClick={() => onSelectColumn?.(col.id)}
            />
            <text
              x={s.x}
              y={s.y - col.depth / 2 - 0.1}
              fontSize={0.26}
              textAnchor="middle"
              className="fill-zinc-700 dark:fill-zinc-300 select-none"
            >
              {col.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
