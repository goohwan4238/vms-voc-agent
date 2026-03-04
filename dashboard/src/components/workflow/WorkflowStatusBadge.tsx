import { Badge } from '@/components/ui/badge';
import { PHASE_LABELS, STATUS_LABELS } from '@/types/workflow';

interface Props {
  phase: string;
  status: string;
}

function getVariant(status: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (status) {
    case 'completed':
    case 'approved':
      return 'default';
    case 'in_progress':
      return 'secondary';
    case 'failed':
    case 'rejected':
      return 'destructive';
    default:
      return 'outline';
  }
}

export function WorkflowStatusBadge({ phase, status }: Props) {
  return (
    <div className="flex items-center gap-2">
      <Badge variant="outline">{PHASE_LABELS[phase] ?? phase}</Badge>
      <Badge variant={getVariant(status)}>{STATUS_LABELS[status] ?? status}</Badge>
    </div>
  );
}
