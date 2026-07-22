"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useProjectStore } from "@/lib/store/useProjectStore";

export default function Home() {
  const router = useRouter();
  const projects = useProjectStore((s) => s.projects);
  const createProject = useProjectStore((s) => s.createProject);
  const deleteProject = useProjectStore((s) => s.deleteProject);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    const id = createProject(name.trim(), description.trim() || undefined);
    router.push(`/projeto/${id}`);
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <div className="mx-auto max-w-4xl px-6 py-12">
        <header className="mb-10">
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
            Engenheiro — Lançamento Estrutural
          </h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Módulo 1: a partir da planta de arquitetura de um pavimento tipo, gere o
            lançamento estrutural em concreto armado (pilares, vigas e lajes).
          </p>
        </header>

        <section className="mb-10 rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="mb-4 text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Novo projeto (pavimento tipo)
          </h2>
          <form onSubmit={handleCreate} className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1">
              <label className="mb-1 block text-xs font-medium text-zinc-500 dark:text-zinc-400">
                Nome do projeto
              </label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex.: Edifício Aurora — Pavimento Tipo"
                className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
              />
            </div>
            <div className="flex-1">
              <label className="mb-1 block text-xs font-medium text-zinc-500 dark:text-zinc-400">
                Descrição (opcional)
              </label>
              <input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Ex.: 3 quartos, área de 90 m²"
                className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
              />
            </div>
            <button
              type="submit"
              className="h-fit rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
            >
              Criar projeto
            </button>
          </form>
        </section>

        <section>
          <h2 className="mb-4 text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Projetos ({projects.length})
          </h2>
          {projects.length === 0 ? (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Nenhum projeto ainda. Crie o primeiro acima.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {projects
                .slice()
                .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
                .map((p) => (
                  <li
                    key={p.id}
                    className="flex items-center justify-between rounded-lg border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900"
                  >
                    <Link href={`/projeto/${p.id}`} className="flex-1">
                      <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                        {p.name}
                      </div>
                      <div className="text-xs text-zinc-500 dark:text-zinc-400">
                        {p.walls.length} parede(s)
                        {p.structure
                          ? ` · ${p.structure.columns.length} pilar(es) · ${p.structure.beams.length} viga(s) · ${p.structure.slabs.length} laje(s)`
                          : " · estrutura não gerada"}
                      </div>
                    </Link>
                    <button
                      onClick={() => {
                        if (confirm(`Excluir o projeto "${p.name}"?`)) deleteProject(p.id);
                      }}
                      className="ml-4 text-xs text-red-600 hover:underline dark:text-red-400"
                    >
                      Excluir
                    </button>
                  </li>
                ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
