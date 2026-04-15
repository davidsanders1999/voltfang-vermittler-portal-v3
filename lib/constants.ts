import type { ProjectStatus } from '@/types';

/** Alle möglichen Projekt-Status in der korrekten Reihenfolge */
export const ALL_PROJECT_STATUSES: ProjectStatus[] = [
  'Eingangsprüfung',
  'Technische Klärung',
  'Angebotsklärung',
  'Closing',
  'Gewonnen',
  'Verloren',
];

/** Phasen für den Pipeline-Visualizer (ohne Verloren) */
export const PIPELINE_PHASES = ALL_PROJECT_STATUSES.slice(0, 5);

/** Tailwind-Klassen pro Status-Badge */
export const STATUS_STYLES: Record<ProjectStatus, string> = {
  'Eingangsprüfung': 'bg-slate-50 text-slate-500 border-slate-200',
  'Technische Klärung': 'bg-sky-50 text-sky-600 border-sky-100',
  'Angebotsklärung': 'bg-amber-50 text-amber-600 border-amber-100',
  'Closing': 'bg-[#82a8a4]/10 text-[#5a7a76] border-[#82a8a4]/25',
  'Gewonnen': 'bg-emerald-50 text-emerald-600 border-emerald-100',
  'Verloren': 'bg-red-50 text-red-400 border-red-100',
};

/** Brand-Farben */
export const BRAND = {
  primary: '#82a8a4',
  sidebar: '#2d2d3a',
  adminSidebar: '#1e1e2e',
} as const;
