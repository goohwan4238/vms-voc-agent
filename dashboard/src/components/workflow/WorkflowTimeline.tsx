import type { VocWorkflow } from '@/types/workflow';

interface TimelineStep {
  label: string;
  startedAt: string | null;
  completedAt: string | null;
}

function getTimelineSteps(workflow: VocWorkflow): TimelineStep[] {
  return [
    { label: '접수', startedAt: workflow.queued_at, completedAt: workflow.queued_at },
    { label: '분석', startedAt: workflow.analysis_started_at, completedAt: workflow.analysis_completed_at },
    { label: 'PRD 작성', startedAt: workflow.prd_started_at, completedAt: workflow.prd_completed_at },
    { label: '승인', startedAt: workflow.approved_at, completedAt: workflow.approved_at },
    { label: '개발', startedAt: workflow.dev_started_at, completedAt: workflow.dev_completed_at },
    { label: '리뷰', startedAt: workflow.review_started_at, completedAt: workflow.review_completed_at },
    { label: '테스트', startedAt: workflow.testing_started_at, completedAt: workflow.testing_completed_at },
    { label: '배포', startedAt: workflow.deployed_at, completedAt: workflow.deployed_at },
  ];
}

function formatTime(dateStr: string | null): string {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleString('ko-KR', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDuration(startStr: string | null, endStr: string | null): string | null {
  if (!startStr || !endStr) return null;
  const ms = new Date(endStr).getTime() - new Date(startStr).getTime();
  if (ms < 0) return null;
  const minutes = Math.floor(ms / 60000);
  if (minutes < 60) return `${minutes}분`;
  const hours = Math.floor(minutes / 60);
  const remainMinutes = minutes % 60;
  return remainMinutes > 0 ? `${hours}시간 ${remainMinutes}분` : `${hours}시간`;
}

type StepStatus = 'completed' | 'in_progress' | 'pending';

function getStepStatus(step: TimelineStep): StepStatus {
  if (step.completedAt) return 'completed';
  if (step.startedAt) return 'in_progress';
  return 'pending';
}

export function WorkflowTimeline({ workflow }: { workflow: VocWorkflow }) {
  const steps = getTimelineSteps(workflow);

  return (
    <div className="rounded-lg border bg-card p-4">
      <h3 className="mb-4 text-sm font-semibold text-muted-foreground">진행 타임라인</h3>
      <div className="relative space-y-0">
        {steps.map((step, idx) => {
          const status = getStepStatus(step);
          const prevStep = idx > 0 ? steps[idx - 1] : null;
          const duration = prevStep?.completedAt && step.startedAt
            ? formatDuration(prevStep.completedAt, step.startedAt)
            : null;

          return (
            <div key={step.label} className="relative flex items-start gap-3 pb-4 last:pb-0">
              {/* 세로 라인 */}
              {idx < steps.length - 1 && (
                <div
                  className={`absolute left-[9px] top-5 h-full w-0.5 ${
                    status === 'completed' ? 'bg-green-400' : 'bg-muted'
                  }`}
                />
              )}

              {/* 원형 인디케이터 */}
              <div className="relative z-10 flex-shrink-0">
                {status === 'completed' && (
                  <div className="h-5 w-5 rounded-full bg-green-500 flex items-center justify-center">
                    <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                )}
                {status === 'in_progress' && (
                  <div className="h-5 w-5 rounded-full bg-blue-500 animate-pulse" />
                )}
                {status === 'pending' && (
                  <div className="h-5 w-5 rounded-full border-2 border-muted bg-background" />
                )}
              </div>

              {/* 텍스트 */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className={`text-sm font-medium ${
                    status === 'completed' ? 'text-foreground' :
                    status === 'in_progress' ? 'text-blue-600 dark:text-blue-400' :
                    'text-muted-foreground'
                  }`}>
                    {step.label}
                  </span>
                  {duration && (
                    <span className="text-xs text-muted-foreground">({duration})</span>
                  )}
                </div>
                {(step.startedAt || step.completedAt) && (
                  <div className="text-xs text-muted-foreground">
                    {step.startedAt && step.completedAt && step.startedAt !== step.completedAt ? (
                      <>{formatTime(step.startedAt)} → {formatTime(step.completedAt)}</>
                    ) : (
                      formatTime(step.completedAt || step.startedAt)
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
