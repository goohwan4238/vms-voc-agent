export interface TestStepResult {
  step: string;
  passed: boolean;
  output: string;
  duration: number;
  screenshotPaths?: string[];
}

export interface ReviewStepResult {
  step: string;
  passed: boolean;
  output: string;
  issues: string[];
}

export interface ReviewResult {
  steps: ReviewStepResult[];
  overallPassed: boolean;
  summary: string;
}

export interface VocWorkflow {
  id: number;
  voc_id: string;
  title: string | null;
  description: string | null;
  requester: string | null;
  phase: string;
  status: string;
  analysis: string | null;
  prd_path: string | null;
  telegram_message_id: number | null;
  test_results: string | null;
  review_results: string | null;
  created_at: string;
  updated_at: string;
  queued_at: string | null;
  analysis_started_at: string | null;
  analysis_completed_at: string | null;
  prd_started_at: string | null;
  prd_completed_at: string | null;
  approved_at: string | null;
  dev_started_at: string | null;
  dev_completed_at: string | null;
  review_started_at: string | null;
  review_completed_at: string | null;
  testing_started_at: string | null;
  testing_completed_at: string | null;
  deployed_at: string | null;
}

export const PHASE_ORDER = ['queued', 'analysis', 'prd-writing', 'development', 'review', 'testing', 'deployed'] as const;

export const PHASE_LABELS: Record<string, string> = {
  queued: '대기',
  analysis: '분석',
  'prd-writing': 'PRD 작성',
  development: '개발',
  review: '리뷰',
  testing: '테스트',
  deployed: '배포 완료',
};

export const STATUS_LABELS: Record<string, string> = {
  pending: '대기 중',
  in_progress: '진행 중',
  completed: '완료',
  approved: '승인됨',
  rejected: '반려됨',
  failed: '실패',
};
