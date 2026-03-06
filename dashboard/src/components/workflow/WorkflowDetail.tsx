import { useParams, Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useWorkflow } from '@/hooks/useWorkflow';
import { WorkflowPhaseTracker } from './WorkflowPhaseTracker';
import { WorkflowTimeline } from './WorkflowTimeline';
import { PrdViewer } from './PrdViewer';
import { ApprovalActions } from './ApprovalActions';
import type { TestStepResult, ReviewResult } from '@/types/workflow';

export function WorkflowDetail() {
  const { id } = useParams<{ id: string }>();
  const { workflow, loading, error, refetch } = useWorkflow(id!);

  if (loading) return <div className="py-12 text-center text-muted-foreground">로딩 중...</div>;
  if (error || !workflow) {
    return (
      <div className="py-12 text-center">
        <p className="text-destructive">{error || 'VOC를 찾을 수 없습니다.'}</p>
        <Link to="/">
          <Button variant="outline" className="mt-4">목록으로</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <Link to="/" className="text-sm text-muted-foreground hover:underline">
            &larr; 목록으로
          </Link>
          <h2 className="text-xl font-bold">{workflow.title || workflow.voc_id}</h2>
        </div>
        <ApprovalActions
          vocId={workflow.voc_id}
          phase={workflow.phase}
          status={workflow.status}
          onAction={refetch}
        />
      </div>

      <WorkflowPhaseTracker currentPhase={workflow.phase} status={workflow.status} />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">기본 정보</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <dt className="text-muted-foreground">VOC ID</dt>
              <dd className="font-mono">{workflow.voc_id}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">요청자</dt>
              <dd>{workflow.requester || '-'}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">갱신일</dt>
              <dd>{new Date(workflow.updated_at).toLocaleString('ko-KR')}</dd>
            </div>
            {workflow.description && (
              <div className="col-span-2">
                <dt className="text-muted-foreground">설명</dt>
                <dd className="mt-1 whitespace-pre-wrap">{workflow.description}</dd>
              </div>
            )}
          </dl>
        </CardContent>
      </Card>

      <WorkflowTimeline workflow={workflow} />

      <Separator />

      <Tabs defaultValue="analysis">
        <TabsList>
          <TabsTrigger value="analysis">분석 결과</TabsTrigger>
          <TabsTrigger value="prd">PRD</TabsTrigger>
          <TabsTrigger value="review-results">코드 리뷰</TabsTrigger>
          <TabsTrigger value="test-results">테스트 결과</TabsTrigger>
        </TabsList>
        <TabsContent value="analysis" className="mt-4">
          {workflow.analysis ? (
            <Card>
              <CardContent className="pt-6">
                <pre className="whitespace-pre-wrap text-sm">{workflow.analysis}</pre>
              </CardContent>
            </Card>
          ) : (
            <p className="py-8 text-center text-muted-foreground">분석 결과가 아직 없습니다.</p>
          )}
        </TabsContent>
        <TabsContent value="prd" className="mt-4">
          {workflow.prd_path ? (
            <Card>
              <CardContent className="pt-6">
                <PrdViewer vocId={workflow.voc_id} />
              </CardContent>
            </Card>
          ) : (
            <p className="py-8 text-center text-muted-foreground">PRD가 아직 작성되지 않았습니다.</p>
          )}
        </TabsContent>
        <TabsContent value="review-results" className="mt-4">
          {workflow.review_results ? (
            <ReviewResultsView reviewResults={workflow.review_results} />
          ) : (
            <p className="py-8 text-center text-muted-foreground">코드 리뷰 결과가 아직 없습니다.</p>
          )}
        </TabsContent>
        <TabsContent value="test-results" className="mt-4">
          {workflow.test_results ? (
            <TestResultsView testResults={workflow.test_results} />
          ) : (
            <p className="py-8 text-center text-muted-foreground">테스트 결과가 아직 없습니다.</p>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function TestResultsView({ testResults }: { testResults: string }) {
  let results: TestStepResult[] = [];
  try {
    results = JSON.parse(testResults);
  } catch {
    return (
      <Card>
        <CardContent className="pt-6">
          <pre className="whitespace-pre-wrap text-sm">{testResults}</pre>
        </CardContent>
      </Card>
    );
  }

  const allPassed = results.every(r => r.passed);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            전체 결과
            <Badge variant={allPassed ? 'default' : 'destructive'}>
              {allPassed ? 'PASSED' : 'FAILED'}
            </Badge>
          </CardTitle>
        </CardHeader>
      </Card>

      {results.map((result) => (
        <Card key={result.step}>
          <CardHeader>
            <CardTitle className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2">
                {result.passed ? '✅' : '❌'} {result.step.toUpperCase()}
              </span>
              <span className="text-xs text-muted-foreground">
                {(result.duration / 1000).toFixed(1)}s
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded bg-muted p-3 text-xs">
              {result.output || '(출력 없음)'}
            </pre>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function ReviewResultsView({ reviewResults }: { reviewResults: string }) {
  let result: ReviewResult;
  try {
    result = JSON.parse(reviewResults);
  } catch {
    return (
      <Card>
        <CardContent className="pt-6">
          <pre className="whitespace-pre-wrap text-sm">{reviewResults}</pre>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            코드 리뷰 결과
            <Badge variant={result.overallPassed ? 'default' : 'destructive'}>
              {result.overallPassed ? 'PASSED' : 'FAILED'}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{result.summary}</p>
        </CardContent>
      </Card>

      {result.steps.map((step) => (
        <Card key={step.step}>
          <CardHeader>
            <CardTitle className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2">
                {step.passed ? '✅' : '❌'} {step.step.toUpperCase()}
              </span>
              <Badge variant="outline">{step.issues.length} issues</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-sm">{step.output}</p>
            {step.issues.length > 0 && (
              <ul className="list-disc pl-5 text-xs text-muted-foreground">
                {step.issues.map((issue, i) => (
                  <li key={i}>{issue}</li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
