import { PHASE_ORDER, PHASE_LABELS } from '@/types/workflow';

interface Props {
  currentPhase: string;
  status: string;
}

export function WorkflowPhaseTracker({ currentPhase, status }: Props) {
  const currentIndex = PHASE_ORDER.indexOf(currentPhase as (typeof PHASE_ORDER)[number]);

  return (
    <div className="flex items-center gap-1">
      {PHASE_ORDER.map((phase, i) => {
        let color = 'bg-gray-200 text-gray-500';
        if (i < currentIndex) {
          color = 'bg-green-100 text-green-700';
        } else if (i === currentIndex) {
          if (status === 'failed' || status === 'rejected') {
            color = 'bg-red-100 text-red-700';
          } else if (status === 'completed' || status === 'approved') {
            color = 'bg-green-100 text-green-700';
          } else {
            color = 'bg-blue-100 text-blue-700';
          }
        }

        return (
          <div key={phase} className="flex items-center">
            {i > 0 && <div className={`mx-1 h-0.5 w-4 ${i <= currentIndex ? 'bg-green-300' : 'bg-gray-200'}`} />}
            <span className={`rounded-md px-2 py-1 text-xs font-medium ${color}`}>
              {PHASE_LABELS[phase]}
            </span>
          </div>
        );
      })}
    </div>
  );
}
