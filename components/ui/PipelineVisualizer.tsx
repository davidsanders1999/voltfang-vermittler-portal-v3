import { PIPELINE_PHASES } from '@/lib/constants';
import type { ProjectStatus } from '@/types';
import { CheckCircle2, XCircle, Crown } from 'lucide-react';

export default function PipelineVisualizer({ status }: { status: ProjectStatus }) {
  const isLost = status === 'Verloren';
  const isWon = status === 'Gewonnen';

  const phases = isLost ? [...PIPELINE_PHASES.slice(0, 4), 'Verloren'] : PIPELINE_PHASES;
  const currentIndex = phases.indexOf(status);

  return (
    <div className="w-full py-2">
      <div className="flex items-start justify-between w-full relative">
        {/* Background connector line */}
        <div className="absolute top-[18px] left-[10%] right-[10%] h-px bg-slate-100 z-0" />

        {phases.map((phase, idx) => {
          const isCompleted = idx < currentIndex;
          const isActive = idx === currentIndex;
          const isPhaseWon = phase === 'Gewonnen' && isActive;

          return (
            <div key={phase} className="relative z-10 flex flex-col items-center flex-1">
              <div className={`
                w-9 h-9 rounded-full flex items-center justify-center border-2 transition-all duration-700
                ${isPhaseWon
                  ? 'bg-yellow-400 border-yellow-400 text-white animate-gold shadow-lg shadow-yellow-200/60'
                  : isActive
                    ? isLost
                      ? 'bg-red-500 border-red-500 text-white shadow-md shadow-red-200'
                      : 'bg-[#82a8a4] border-[#82a8a4] text-white shadow-md shadow-[#82a8a4]/30'
                    : isCompleted
                      ? 'bg-slate-700 border-slate-700 text-white'
                      : 'bg-white border-slate-200 text-slate-300'}
              `} style={{ transitionDelay: `${idx * 120}ms` }}>
                {isPhaseWon ? <Crown size={16} fill="currentColor" /> :
                 isCompleted ? <CheckCircle2 size={15} /> :
                 phase === 'Verloren' ? <XCircle size={15} /> :
                 <span className="text-[11px] font-bold">{idx + 1}</span>}
              </div>

              <p className={`
                mt-2.5 text-[9px] font-semibold uppercase tracking-tight text-center px-1 leading-tight transition-colors duration-500
                ${isPhaseWon ? 'text-yellow-600' :
                  isActive ? (isLost ? 'text-red-500' : 'text-[#82a8a4]') :
                  isCompleted ? 'text-slate-600' : 'text-slate-300'}
              `} style={{ transitionDelay: `${idx * 120}ms` }}>
                {phase}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
