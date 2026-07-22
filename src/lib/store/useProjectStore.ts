import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  DEFAULT_STRUCTURAL_PARAMS,
  type Project,
  type StructuralParams,
  type Wall,
} from "@/lib/types";
import { generateStructuralModel, revalidateStructure } from "@/lib/engine";

function newId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

function now(): string {
  return new Date().toISOString();
}

interface ProjectStoreState {
  projects: Project[];
  createProject: (name: string, description?: string) => string;
  deleteProject: (projectId: string) => void;
  renameProject: (projectId: string, name: string, description?: string) => void;

  addWall: (projectId: string, wall: Omit<Wall, "id">) => void;
  updateWall: (projectId: string, wallId: string, patch: Partial<Omit<Wall, "id">>) => void;
  removeWall: (projectId: string, wallId: string) => void;
  replaceWalls: (projectId: string, walls: Wall[]) => void;
  /** Adiciona várias paredes de uma vez (ex.: importação DXF/imagem), preservando as existentes. */
  appendWalls: (projectId: string, walls: Omit<Wall, "id">[]) => void;

  updateParams: (projectId: string, patch: Partial<StructuralParams>) => void;

  generateStructure: (projectId: string) => void;
  clearStructure: (projectId: string) => void;

  moveColumn: (projectId: string, columnId: string, position: { x: number; y: number }) => void;
  updateColumnSize: (projectId: string, columnId: string, width: number, depth: number) => void;
  removeColumn: (projectId: string, columnId: string) => void;

  updateBeamSection: (projectId: string, beamId: string, width: number, height: number) => void;
  removeBeam: (projectId: string, beamId: string) => void;

  updateSlabThickness: (projectId: string, slabId: string, thickness: number) => void;
}

function withProject(
  projects: Project[],
  projectId: string,
  updater: (project: Project) => Project
): Project[] {
  return projects.map((p) => (p.id === projectId ? updater({ ...p, updatedAt: now() }) : p));
}

/** Reexecuta as validações de um projeto após uma edição manual na estrutura já gerada. */
function revalidate(project: Project): Project {
  if (!project.structure) return project;
  const warnings = revalidateStructure(
    project.walls,
    project.structure.columns,
    project.structure.beams,
    project.structure.slabs,
    project.params
  );
  return { ...project, structure: { ...project.structure, warnings } };
}

export const useProjectStore = create<ProjectStoreState>()(
  persist(
    (set) => ({
      projects: [],

      createProject: (name, description) => {
        const id = newId("proj");
        const project: Project = {
          id,
          name,
          description,
          createdAt: now(),
          updatedAt: now(),
          walls: [],
          params: { ...DEFAULT_STRUCTURAL_PARAMS },
          structure: null,
        };
        set((state) => ({ projects: [...state.projects, project] }));
        return id;
      },

      deleteProject: (projectId) =>
        set((state) => ({ projects: state.projects.filter((p) => p.id !== projectId) })),

      renameProject: (projectId, name, description) =>
        set((state) => ({
          projects: withProject(state.projects, projectId, (p) => ({ ...p, name, description })),
        })),

      addWall: (projectId, wall) =>
        set((state) => ({
          projects: withProject(state.projects, projectId, (p) => ({
            ...p,
            walls: [...p.walls, { ...wall, id: newId("wall") }],
          })),
        })),

      updateWall: (projectId, wallId, patch) =>
        set((state) => ({
          projects: withProject(state.projects, projectId, (p) => ({
            ...p,
            walls: p.walls.map((w) => (w.id === wallId ? { ...w, ...patch } : w)),
          })),
        })),

      removeWall: (projectId, wallId) =>
        set((state) => ({
          projects: withProject(state.projects, projectId, (p) => ({
            ...p,
            walls: p.walls.filter((w) => w.id !== wallId),
          })),
        })),

      replaceWalls: (projectId, walls) =>
        set((state) => ({
          projects: withProject(state.projects, projectId, (p) => ({ ...p, walls })),
        })),

      appendWalls: (projectId, walls) =>
        set((state) => ({
          projects: withProject(state.projects, projectId, (p) => ({
            ...p,
            walls: [...p.walls, ...walls.map((w) => ({ ...w, id: newId("wall") }))],
          })),
        })),

      updateParams: (projectId, patch) =>
        set((state) => ({
          projects: withProject(state.projects, projectId, (p) => ({
            ...p,
            params: { ...p.params, ...patch },
          })),
        })),

      generateStructure: (projectId) =>
        set((state) => ({
          projects: withProject(state.projects, projectId, (p) => ({
            ...p,
            structure: generateStructuralModel(p.walls, p.params),
          })),
        })),

      clearStructure: (projectId) =>
        set((state) => ({
          projects: withProject(state.projects, projectId, (p) => ({ ...p, structure: null })),
        })),

      moveColumn: (projectId, columnId, position) =>
        set((state) => ({
          projects: withProject(state.projects, projectId, (p) => {
            if (!p.structure) return p;
            const columns = p.structure.columns.map((c) =>
              c.id === columnId ? { ...c, position, origin: "manual" as const } : c
            );
            return revalidate({ ...p, structure: { ...p.structure, columns } });
          }),
        })),

      updateColumnSize: (projectId, columnId, width, depth) =>
        set((state) => ({
          projects: withProject(state.projects, projectId, (p) => {
            if (!p.structure) return p;
            const columns = p.structure.columns.map((c) =>
              c.id === columnId ? { ...c, width, depth } : c
            );
            return revalidate({ ...p, structure: { ...p.structure, columns } });
          }),
        })),

      removeColumn: (projectId, columnId) =>
        set((state) => ({
          projects: withProject(state.projects, projectId, (p) => {
            if (!p.structure) return p;
            const columns = p.structure.columns.filter((c) => c.id !== columnId);
            const beams = p.structure.beams.filter(
              (b) => b.startColumnId !== columnId && b.endColumnId !== columnId
            );
            return revalidate({ ...p, structure: { ...p.structure, columns, beams } });
          }),
        })),

      updateBeamSection: (projectId, beamId, width, height) =>
        set((state) => ({
          projects: withProject(state.projects, projectId, (p) => {
            if (!p.structure) return p;
            const beams = p.structure.beams.map((b) =>
              b.id === beamId ? { ...b, width, height } : b
            );
            return revalidate({ ...p, structure: { ...p.structure, beams } });
          }),
        })),

      removeBeam: (projectId, beamId) =>
        set((state) => ({
          projects: withProject(state.projects, projectId, (p) => {
            if (!p.structure) return p;
            const beams = p.structure.beams.filter((b) => b.id !== beamId);
            return revalidate({ ...p, structure: { ...p.structure, beams } });
          }),
        })),

      updateSlabThickness: (projectId, slabId, thickness) =>
        set((state) => ({
          projects: withProject(state.projects, projectId, (p) => {
            if (!p.structure) return p;
            const slabs = p.structure.slabs.map((s) =>
              s.id === slabId ? { ...s, thickness } : s
            );
            return revalidate({ ...p, structure: { ...p.structure, slabs } });
          }),
        })),
    }),
    {
      name: "engenheiro-projects",
    }
  )
);
