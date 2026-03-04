import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useWorkflows } from '@/hooks/useWorkflows';
import { WorkflowStatusBadge } from './WorkflowStatusBadge';
import { WorkflowFilters } from './WorkflowFilters';
import { DeployButton } from './DeployButton';

export function WorkflowList() {
  const { workflows, loading, error } = useWorkflows();
  const [phaseFilter, setPhaseFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  const filtered = useMemo(() => {
    return workflows.filter((w) => {
      if (phaseFilter !== 'all' && w.phase !== phaseFilter) return false;
      if (statusFilter !== 'all' && w.status !== statusFilter) return false;
      return true;
    });
  }, [workflows, phaseFilter, statusFilter]);

  if (loading) return <div className="py-12 text-center text-muted-foreground">로딩 중...</div>;
  if (error) return <div className="py-12 text-center text-destructive">{error}</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h2 className="text-lg font-semibold">VOC 워크플로우 ({filtered.length})</h2>
          <DeployButton onDeployed={() => window.location.reload()} />
        </div>
        <WorkflowFilters
          phase={phaseFilter}
          status={statusFilter}
          onPhaseChange={setPhaseFilter}
          onStatusChange={setStatusFilter}
        />
      </div>

      {filtered.length === 0 ? (
        <div className="py-12 text-center text-muted-foreground">
          {workflows.length === 0 ? '등록된 VOC가 없습니다.' : '필터 조건에 맞는 VOC가 없습니다.'}
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[120px]">VOC ID</TableHead>
              <TableHead>제목</TableHead>
              <TableHead>요청자</TableHead>
              <TableHead>상태</TableHead>
              <TableHead className="w-[160px]">갱신일</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((w) => (
              <TableRow key={w.voc_id}>
                <TableCell>
                  <Link to={`/voc/${w.voc_id}`} className="font-mono text-sm text-primary hover:underline">
                    {w.voc_id}
                  </Link>
                </TableCell>
                <TableCell>{w.title || '-'}</TableCell>
                <TableCell>{w.requester || '-'}</TableCell>
                <TableCell>
                  <WorkflowStatusBadge phase={w.phase} status={w.status} />
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {new Date(w.updated_at).toLocaleString('ko-KR')}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
