import { STATUS_STYLES } from '@/lib/constants';
import type { ProjectStatus } from '@/types';

export default function StatusBadge({
  status,
  active = true,
  onClick,
}: {
  status: ProjectStatus;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      disabled={!onClick}
      onClick={onClick}
      className={`
        inline-flex items-center px-2 py-0.5 rounded-md text-[9px] font-semibold uppercase tracking-wide border transition-all
        ${STATUS_STYLES[status]}
        ${!active ? 'opacity-30 grayscale' : 'opacity-100'}
        ${onClick ? 'hover:scale-105 active:scale-95 cursor-pointer' : 'cursor-default'}
      `}
    >
      {status}
    </button>
  );
}
