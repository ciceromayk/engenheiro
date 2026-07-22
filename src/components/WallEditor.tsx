"use client";

import { useState } from "react";
import type { Wall } from "@/lib/types";
import { useProjectStore } from "@/lib/store/useProjectStore";

function parseOffsetList(text: string): number[] {
  return text
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map((s) => Number(s.replace(",", ".")))
    .filter((n) => Number.isFinite(n) && n > 0);
}

interface WallEditorProps {
  projectId: string;
  walls: Wall[];
}

export function WallEditor({ projectId, walls }: WallEditorProps) {
  const [tab, setTab] = useState<"grid" | "table">("grid");

  return (
    <div className="rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex border-b border-zinc-200 dark:border-zinc-800">
        <TabButton active={tab === "grid"} onClick={() => setTab("grid")}>
          Modo grade rápido
        </TabButton>
        <TabButton active={tab === "table"} onClick={() => setTab("table")}>
          Paredes ({walls.length})
        </TabButton>
      </div>
      <div className="p-4">
        {tab === "grid" ? (
          <GridHelper projectId={projectId} />
        ) : (
          <WallTable projectId={projectId} walls={walls} />
        )}
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 text-xs font-medium ${
        active
          ? "border-b-2 border-zinc-900 text-zinc-900 dark:border-zinc-100 dark:text-zinc-100"
          : "text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
      }`}
    >
      {children}
    </button>
  );
}

function GridHelper({ projectId }: { projectId: string }) {
  const replaceWalls = useProjectStore((s) => s.replaceWalls);
  const [width, setWidth] = useState("10");
  const [depth, setDepth] = useState("8");
  const [thicknessExt, setThicknessExt] = useState("20");
  const [thicknessInt, setThicknessInt] = useState("15");
  const [verticalOffsets, setVerticalOffsets] = useState("4");
  const [horizontalOffsets, setHorizontalOffsets] = useState("");

  function handleGenerate() {
    const w = Number(width);
    const d = Number(depth);
    if (!Number.isFinite(w) || !Number.isFinite(d) || w <= 0 || d <= 0) {
      alert("Informe largura e profundidade válidas (m).");
      return;
    }
    const tExt = Number(thicknessExt) / 100 || 0.2;
    const tInt = Number(thicknessInt) / 100 || 0.15;

    const newWalls: Wall[] = [];
    let counter = 0;
    const id = () => `w${++counter}`;

    // Contorno externo
    newWalls.push({ id: id(), start: { x: 0, y: 0 }, end: { x: w, y: 0 }, thickness: tExt, kind: "external" });
    newWalls.push({ id: id(), start: { x: w, y: 0 }, end: { x: w, y: d }, thickness: tExt, kind: "external" });
    newWalls.push({ id: id(), start: { x: w, y: d }, end: { x: 0, y: d }, thickness: tExt, kind: "external" });
    newWalls.push({ id: id(), start: { x: 0, y: d }, end: { x: 0, y: 0 }, thickness: tExt, kind: "external" });

    // Divisórias verticais (a partir da esquerda), atravessando toda a profundidade
    for (const x of parseOffsetList(verticalOffsets)) {
      if (x >= w) continue;
      newWalls.push({ id: id(), start: { x, y: 0 }, end: { x, y: d }, thickness: tInt, kind: "internal" });
    }

    // Divisórias horizontais (a partir de baixo), atravessando toda a largura
    for (const y of parseOffsetList(horizontalOffsets)) {
      if (y >= d) continue;
      newWalls.push({ id: id(), start: { x: 0, y }, end: { x: w, y }, thickness: tInt, kind: "internal" });
    }

    replaceWalls(projectId, newWalls);
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        Gera rapidamente o contorno retangular do pavimento e paredes divisórias que
        atravessam toda a largura/profundidade. Depois ajuste ou complemente na aba
        &quot;Paredes&quot;.
      </p>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Largura total (m)" value={width} onChange={setWidth} />
        <Field label="Profundidade total (m)" value={depth} onChange={setDepth} />
        <Field label="Espessura parede externa (cm)" value={thicknessExt} onChange={setThicknessExt} />
        <Field label="Espessura parede interna (cm)" value={thicknessInt} onChange={setThicknessInt} />
        <Field
          label="Divisórias verticais — dist. da esquerda (m, separadas por vírgula)"
          value={verticalOffsets}
          onChange={setVerticalOffsets}
          full
        />
        <Field
          label="Divisórias horizontais — dist. de baixo (m, separadas por vírgula)"
          value={horizontalOffsets}
          onChange={setHorizontalOffsets}
          full
        />
      </div>
      <button
        onClick={handleGenerate}
        className="mt-1 self-start rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
      >
        Gerar paredes (substitui as atuais)
      </button>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  full,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  full?: boolean;
}) {
  return (
    <div className={full ? "col-span-2" : undefined}>
      <label className="mb-1 block text-xs font-medium text-zinc-500 dark:text-zinc-400">
        {label}
      </label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-zinc-300 px-3 py-1.5 text-sm outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
      />
    </div>
  );
}

function WallTable({ projectId, walls }: { projectId: string; walls: Wall[] }) {
  const addWall = useProjectStore((s) => s.addWall);
  const removeWall = useProjectStore((s) => s.removeWall);
  const updateWall = useProjectStore((s) => s.updateWall);

  const [form, setForm] = useState({
    x1: "0",
    y1: "0",
    x2: "0",
    y2: "0",
    thickness: "15",
    kind: "internal" as Wall["kind"],
  });

  function handleAdd() {
    const x1 = Number(form.x1);
    const y1 = Number(form.y1);
    const x2 = Number(form.x2);
    const y2 = Number(form.y2);
    const thickness = Number(form.thickness) / 100;
    if (![x1, y1, x2, y2, thickness].every(Number.isFinite)) {
      alert("Preencha coordenadas e espessura válidas.");
      return;
    }
    if (x1 === x2 && y1 === y2) {
      alert("Parede precisa ter comprimento (pontos diferentes).");
      return;
    }
    addWall(projectId, { start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness, kind: form.kind });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-6 gap-2 items-end">
        <MiniField label="X1 (m)" value={form.x1} onChange={(v) => setForm({ ...form, x1: v })} />
        <MiniField label="Y1 (m)" value={form.y1} onChange={(v) => setForm({ ...form, y1: v })} />
        <MiniField label="X2 (m)" value={form.x2} onChange={(v) => setForm({ ...form, x2: v })} />
        <MiniField label="Y2 (m)" value={form.y2} onChange={(v) => setForm({ ...form, y2: v })} />
        <MiniField
          label="Esp. (cm)"
          value={form.thickness}
          onChange={(v) => setForm({ ...form, thickness: v })}
        />
        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-500 dark:text-zinc-400">Tipo</label>
          <select
            value={form.kind}
            onChange={(e) => setForm({ ...form, kind: e.target.value as Wall["kind"] })}
            className="w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
          >
            <option value="external">Externa</option>
            <option value="internal">Interna</option>
          </select>
        </div>
      </div>
      <button
        onClick={handleAdd}
        className="self-start rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
      >
        Adicionar parede
      </button>

      {walls.length > 0 && (
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="text-zinc-500 dark:text-zinc-400">
              <th className="py-1">Início</th>
              <th className="py-1">Fim</th>
              <th className="py-1">Esp.</th>
              <th className="py-1">Tipo</th>
              <th className="py-1"></th>
            </tr>
          </thead>
          <tbody>
            {walls.map((w) => (
              <tr key={w.id} className="border-t border-zinc-100 dark:border-zinc-800">
                <td className="py-1.5">
                  ({w.start.x.toFixed(2)}, {w.start.y.toFixed(2)})
                </td>
                <td className="py-1.5">
                  ({w.end.x.toFixed(2)}, {w.end.y.toFixed(2)})
                </td>
                <td className="py-1.5">{(w.thickness * 100).toFixed(0)} cm</td>
                <td className="py-1.5">
                  <select
                    value={w.kind}
                    onChange={(e) =>
                      updateWall(projectId, w.id, { kind: e.target.value as Wall["kind"] })
                    }
                    className="rounded border border-zinc-300 bg-transparent px-1 py-0.5 text-xs dark:border-zinc-700"
                  >
                    <option value="external">Externa</option>
                    <option value="internal">Interna</option>
                  </select>
                </td>
                <td className="py-1.5 text-right">
                  <button
                    onClick={() => removeWall(projectId, w.id)}
                    className="text-red-600 hover:underline dark:text-red-400"
                  >
                    remover
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function MiniField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-zinc-500 dark:text-zinc-400">
        {label}
      </label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
      />
    </div>
  );
}
