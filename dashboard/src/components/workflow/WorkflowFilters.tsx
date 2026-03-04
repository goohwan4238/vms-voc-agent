import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { PHASE_LABELS, STATUS_LABELS } from '@/types/workflow';

interface Props {
  phase: string;
  status: string;
  onPhaseChange: (value: string) => void;
  onStatusChange: (value: string) => void;
}

export function WorkflowFilters({ phase, status, onPhaseChange, onStatusChange }: Props) {
  return (
    <div className="flex gap-3">
      <Select value={phase} onValueChange={onPhaseChange}>
        <SelectTrigger className="w-[140px]">
          <SelectValue placeholder="단계 필터" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">전체 단계</SelectItem>
          {Object.entries(PHASE_LABELS).map(([key, label]) => (
            <SelectItem key={key} value={key}>
              {label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={status} onValueChange={onStatusChange}>
        <SelectTrigger className="w-[140px]">
          <SelectValue placeholder="상태 필터" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">전체 상태</SelectItem>
          {Object.entries(STATUS_LABELS).map(([key, label]) => (
            <SelectItem key={key} value={key}>
              {label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
