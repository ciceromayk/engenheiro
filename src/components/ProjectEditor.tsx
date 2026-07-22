"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useProjectStore } from "@/lib/store/useProjectStore";
import { WallEditor } from "@/components/WallEditor";
import { PlanCanvas } from "@/components/PlanCanvas";
import { ElementsPanel } from "@/components/ElementsPanel";
import type { StructuralParams } from "@/lib/types";

function useHasHydrated(): boolean {
  const [hydrated, setHydrated] = useState(() => useProjectStore.persist.hasHydrated());
  useEffect(() => {
    if (hydrated) return;
    return useProjectStore.persist.onFinishHydration(() => setHydrated(true));
  }, [hydrated]);
  return hydrated;
}

export function ProjectEditor({ projectId }: { projectId: string }) {
  const hydrated = useHasHydrated();
  const project = useProjectStore((s) => s.projects.find((p) => p.id === projectId));
  const generateStructure = useProjectStore((s) => s.generateStructure);
  const updateParams = useProjectStore((s) => s.updateParams);
  const moveColumn = useProjectStore((s) => s.moveColumn);

  const [selectedColumnId, setSelectedColumnId] = useState<string | null>(null);

  if (!hydrated) {
    return <div className="p-8 text-sm text-zinc-500">Carregando…</div>;
  }

  if (!project) {
    return (
      <div className="p-8">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">Projeto não encontrado.</p>
        <Link href="/" className="mt-2 inline-block text-sm text-zinc-900 underline dark:text-zinc-100">
          Voltar para a lista de projetos
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <div className="mx-auto max-w-7xl px-6 py-8">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <Link href="/" className="text-xs text-zinc-500 hover:underline dark:text-zinc-400">
              ← Projetos
            </Link>
            <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">{project.name}</h1>
            {project.description && (
              <p className="text-sm text-zinc-500 dark:text-zinc-400">{project.description}</p>
            )}
          </div>
          <button
            onClick={() => generateStructure(project.id)}
            disabled={project.walls.length === 0}
            className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
          >
            {project.structure ? "Atualizar estrutura" : "Gerar estrutura"}
          </button>
        </div>

        <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="lg:col-span-1">
            <WallEditor projectId={project.id} walls={project.walls} />
          </div>
          <div className="lg:col-span-2">
            <ParamsPanel
              params={project.params}
              onChange={(patch) => updateParams(project.id, patch)}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <PlanCanvas
              walls={project.walls}
              structure={project.structure}
              selectedColumnId={selectedColumnId}
              onSelectColumn={setSelectedColumnId}
              onMoveColumn={(id, pos) => moveColumn(project.id, id, pos)}
            />
            <Legend />
          </div>
          <div className="lg:col-span-1">
            {project.structure ? (
              <ElementsPanel
                projectId={project.id}
                structure={project.structure}
                selectedColumnId={selectedColumnId}
                onSelectColumn={setSelectedColumnId}
              />
            ) : (
              <div className="rounded-lg border border-dashed border-zinc-300 p-6 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
                Lance as paredes e clique em &quot;Gerar estrutura&quot; para ver pilares, vigas
                e lajes sugeridos.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Legend() {
  return (
    <div className="mt-2 flex flex-wrap gap-4 text-xs text-zinc-500 dark:text-zinc-400">
      <span className="flex items-center gap-1">
        <span className="inline-block h-2.5 w-2.5 bg-zinc-800 dark:bg-zinc-200" /> Pilar (auto)
      </span>
      <span className="flex items-center gap-1">
        <span className="inline-block h-2.5 w-2.5 bg-emerald-600" /> Pilar (editado)
      </span>
      <span className="flex items-center gap-1">
        <span className="inline-block h-1 w-4 bg-amber-500" /> Viga
      </span>
      <span className="flex items-center gap-1">
        <span className="inline-block h-2.5 w-2.5 bg-sky-200" /> Laje
      </span>
      <span>Arraste um pilar no desenho para reposicioná-lo.</span>
    </div>
  );
}

function ParamsPanel({
  params,
  onChange,
}: {
  params: StructuralParams;
  onChange: (patch: Partial<StructuralParams>) => void;
}) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <h2 className="mb-3 text-xs font-medium text-zinc-700 dark:text-zinc-300">
        Parâmetros de pré-dimensionamento
      </h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <ParamField
          label="Vão máx. entre pilares (m)"
          value={params.maxColumnSpacing}
          step={0.5}
          onChange={(v) => onChange({ maxColumnSpacing: v })}
        />
        <ParamField
          label="Seção padrão pilar (cm)"
          value={params.defaultColumnSize * 100}
          step={5}
          onChange={(v) => onChange({ defaultColumnSize: v / 100 })}
        />
        <ParamField
          label="Largura padrão viga (cm)"
          value={params.defaultBeamWidth * 100}
          step={5}
          onChange={(v) => onChange({ defaultBeamWidth: v / 100 })}
        />
        <ParamField
          label="Relação vão/altura viga (L/h)"
          value={params.beamSpanToHeightRatio}
          step={1}
          onChange={(v) => onChange({ beamSpanToHeightRatio: v })}
        />
        <ParamField
          label="Relação laje 2 direções (L/h)"
          value={params.twoWaySlabRatio}
          step={1}
          onChange={(v) => onChange({ twoWaySlabRatio: v })}
        />
        <ParamField
          label="Relação laje 1 direção (L/h)"
          value={params.oneWaySlabRatio}
          step={1}
          onChange={(v) => onChange({ oneWaySlabRatio: v })}
        />
      </div>
    </div>
  );
}

function ParamField({
  label,
  value,
  step,
  onChange,
}: {
  label: string;
  value: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-zinc-500 dark:text-zinc-400">
        {label}
      </label>
      <input
        type="number"
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
      />
    </div>
  );
}
