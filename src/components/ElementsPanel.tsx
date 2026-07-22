"use client";

import type { StructuralModel, StructuralWarning } from "@/lib/types";
import { useProjectStore } from "@/lib/store/useProjectStore";

interface ElementsPanelProps {
  projectId: string;
  structure: StructuralModel;
  selectedColumnId?: string | null;
  onSelectColumn?: (id: string | null) => void;
}

export function ElementsPanel({
  projectId,
  structure,
  selectedColumnId,
  onSelectColumn,
}: ElementsPanelProps) {
  return (
    <div className="flex flex-col gap-4">
      <WarningsList warnings={structure.warnings} />
      <ColumnsList
        projectId={projectId}
        structure={structure}
        selectedColumnId={selectedColumnId}
        onSelectColumn={onSelectColumn}
      />
      <BeamsList projectId={projectId} structure={structure} />
      <SlabsList projectId={projectId} structure={structure} />
    </div>
  );
}

function severityStyle(severity: StructuralWarning["severity"]): string {
  switch (severity) {
    case "error":
      return "border-red-300 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-300";
    case "warning":
      return "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300";
    default:
      return "border-zinc-200 bg-zinc-50 text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400";
  }
}

function WarningsList({ warnings }: { warnings: StructuralWarning[] }) {
  if (warnings.length === 0) return null;
  return (
    <div className="flex flex-col gap-1.5">
      {warnings.map((w) => (
        <div key={w.id} className={`rounded-md border px-3 py-2 text-xs ${severityStyle(w.severity)}`}>
          {w.message}
        </div>
      ))}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
      <div className="border-b border-zinc-200 px-4 py-2 text-xs font-medium text-zinc-700 dark:border-zinc-800 dark:text-zinc-300">
        {title}
      </div>
      <div className="max-h-64 overflow-y-auto p-2">{children}</div>
    </div>
  );
}

function ColumnsList({
  projectId,
  structure,
  selectedColumnId,
  onSelectColumn,
}: ElementsPanelProps) {
  const moveColumn = useProjectStore((s) => s.moveColumn);
  const removeColumn = useProjectStore((s) => s.removeColumn);
  const updateColumnSize = useProjectStore((s) => s.updateColumnSize);

  return (
    <Section title={`Pilares (${structure.columns.length})`}>
      <table className="w-full text-left text-xs">
        <thead>
          <tr className="text-zinc-500 dark:text-zinc-400">
            <th className="py-1">Rótulo</th>
            <th className="py-1">Posição (m)</th>
            <th className="py-1">Seção (cm)</th>
            <th className="py-1"></th>
          </tr>
        </thead>
        <tbody>
          {structure.columns.map((c) => (
            <tr
              key={c.id}
              onClick={() => onSelectColumn?.(c.id)}
              className={`cursor-pointer border-t border-zinc-100 dark:border-zinc-800 ${
                selectedColumnId === c.id ? "bg-red-50 dark:bg-red-950/30" : ""
              }`}
            >
              <td className="py-1.5 font-medium">
                {c.label}
                {c.origin === "manual" && (
                  <span className="ml-1 text-emerald-600 dark:text-emerald-400">•</span>
                )}
              </td>
              <td className="py-1.5">
                <input
                  type="number"
                  step={0.05}
                  value={c.position.x}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) =>
                    moveColumn(projectId, c.id, { x: Number(e.target.value), y: c.position.y })
                  }
                  className="w-14 rounded border border-zinc-300 px-1 py-0.5 dark:border-zinc-700 dark:bg-zinc-800"
                />
                <input
                  type="number"
                  step={0.05}
                  value={c.position.y}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) =>
                    moveColumn(projectId, c.id, { x: c.position.x, y: Number(e.target.value) })
                  }
                  className="ml-1 w-14 rounded border border-zinc-300 px-1 py-0.5 dark:border-zinc-700 dark:bg-zinc-800"
                />
              </td>
              <td className="py-1.5">
                <input
                  type="number"
                  step={5}
                  value={Math.round(c.width * 100)}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) =>
                    updateColumnSize(
                      projectId,
                      c.id,
                      Number(e.target.value) / 100,
                      Number(e.target.value) / 100
                    )
                  }
                  className="w-12 rounded border border-zinc-300 px-1 py-0.5 dark:border-zinc-700 dark:bg-zinc-800"
                />
              </td>
              <td className="py-1.5 text-right">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    removeColumn(projectId, c.id);
                  }}
                  className="text-red-600 hover:underline dark:text-red-400"
                >
                  remover
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Section>
  );
}

function BeamsList({ projectId, structure }: { projectId: string; structure: StructuralModel }) {
  const updateBeamSection = useProjectStore((s) => s.updateBeamSection);
  const removeBeam = useProjectStore((s) => s.removeBeam);
  const columnLabel = (id: string) => structure.columns.find((c) => c.id === id)?.label ?? "?";

  return (
    <Section title={`Vigas (${structure.beams.length})`}>
      <table className="w-full text-left text-xs">
        <thead>
          <tr className="text-zinc-500 dark:text-zinc-400">
            <th className="py-1">Rótulo</th>
            <th className="py-1">Trecho</th>
            <th className="py-1">Seção (cm)</th>
            <th className="py-1"></th>
          </tr>
        </thead>
        <tbody>
          {structure.beams.map((b) => (
            <tr key={b.id} className="border-t border-zinc-100 dark:border-zinc-800">
              <td className="py-1.5 font-medium">{b.label}</td>
              <td className="py-1.5">
                {columnLabel(b.startColumnId)} → {columnLabel(b.endColumnId)}
              </td>
              <td className="py-1.5">
                <input
                  type="number"
                  step={5}
                  value={Math.round(b.width * 100)}
                  onChange={(e) =>
                    updateBeamSection(projectId, b.id, Number(e.target.value) / 100, b.height)
                  }
                  className="w-12 rounded border border-zinc-300 px-1 py-0.5 dark:border-zinc-700 dark:bg-zinc-800"
                />
                ×
                <input
                  type="number"
                  step={5}
                  value={Math.round(b.height * 100)}
                  onChange={(e) =>
                    updateBeamSection(projectId, b.id, b.width, Number(e.target.value) / 100)
                  }
                  className="w-12 rounded border border-zinc-300 px-1 py-0.5 dark:border-zinc-700 dark:bg-zinc-800"
                />
              </td>
              <td className="py-1.5 text-right">
                <button
                  onClick={() => removeBeam(projectId, b.id)}
                  className="text-red-600 hover:underline dark:text-red-400"
                >
                  remover
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Section>
  );
}

function SlabsList({ projectId, structure }: { projectId: string; structure: StructuralModel }) {
  const updateSlabThickness = useProjectStore((s) => s.updateSlabThickness);

  return (
    <Section title={`Lajes (${structure.slabs.length})`}>
      <table className="w-full text-left text-xs">
        <thead>
          <tr className="text-zinc-500 dark:text-zinc-400">
            <th className="py-1">Rótulo</th>
            <th className="py-1">Vãos (m)</th>
            <th className="py-1">Direção</th>
            <th className="py-1">h (cm)</th>
          </tr>
        </thead>
        <tbody>
          {structure.slabs.map((s) => (
            <tr key={s.id} className="border-t border-zinc-100 dark:border-zinc-800">
              <td className="py-1.5 font-medium">{s.label}</td>
              <td className="py-1.5">
                {s.shortSpan.toFixed(2)} × {s.longSpan.toFixed(2)}
              </td>
              <td className="py-1.5">{s.direction === "two-way" ? "2 direções" : "1 direção"}</td>
              <td className="py-1.5">
                <input
                  type="number"
                  step={1}
                  value={Math.round(s.thickness * 100)}
                  onChange={(e) =>
                    updateSlabThickness(projectId, s.id, Number(e.target.value) / 100)
                  }
                  className="w-12 rounded border border-zinc-300 px-1 py-0.5 dark:border-zinc-700 dark:bg-zinc-800"
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Section>
  );
}
