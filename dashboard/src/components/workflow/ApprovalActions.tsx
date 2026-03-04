import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { approveWorkflow, rejectWorkflow } from '@/api/workflows';

interface Props {
  vocId: string;
  phase: string;
  status: string;
  onAction: () => void;
}

export function ApprovalActions({ vocId, phase, status, onAction }: Props) {
  const [loading, setLoading] = useState(false);
  const [approveOpen, setApproveOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);

  if (phase !== 'prd-writing' || status !== 'completed') return null;

  const handleApprove = async () => {
    setLoading(true);
    try {
      await approveWorkflow(vocId);
      setApproveOpen(false);
      onAction();
    } catch {
      alert('승인 처리에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleReject = async () => {
    setLoading(true);
    try {
      await rejectWorkflow(vocId);
      setRejectOpen(false);
      onAction();
    } catch {
      alert('반려 처리에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex gap-3">
      <Dialog open={approveOpen} onOpenChange={setApproveOpen}>
        <DialogTrigger asChild>
          <Button>승인</Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>PRD 승인</DialogTitle>
            <DialogDescription>
              이 PRD를 승인하면 개발 단계로 진행됩니다. 계속하시겠습니까?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setApproveOpen(false)}>
              취소
            </Button>
            <Button onClick={handleApprove} disabled={loading}>
              {loading ? '처리 중...' : '승인'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogTrigger asChild>
          <Button variant="destructive">반려</Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>PRD 반려</DialogTitle>
            <DialogDescription>
              이 PRD를 반려하시겠습니까?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectOpen(false)}>
              취소
            </Button>
            <Button variant="destructive" onClick={handleReject} disabled={loading}>
              {loading ? '처리 중...' : '반려'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
