import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { deployAll, getDeployableCount } from '@/api/workflows';

export function DeployButton({ onDeployed }: { onDeployed?: () => void }) {
  const [count, setCount] = useState(0);
  const [deploying, setDeploying] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  useEffect(() => {
    getDeployableCount()
      .then(data => setCount(data.count))
      .catch(() => setCount(0));
  }, [deploying]);

  if (count === 0) return null;

  async function handleDeploy() {
    if (!window.confirm(`테스트 완료된 ${count}건의 VOC를 배포하시겠습니까?`)) return;

    setDeploying(true);
    setResult(null);
    try {
      const res = await deployAll();
      setResult(`${res.deployedVocIds.length}건 배포 완료 (${res.commitHash})`);
      setCount(0);
      onDeployed?.();
    } catch (err) {
      setResult(`배포 실패: ${err instanceof Error ? err.message : '알 수 없는 오류'}`);
    } finally {
      setDeploying(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Button
        onClick={handleDeploy}
        disabled={deploying}
        variant="default"
        size="sm"
      >
        {deploying ? '배포 중...' : `배포 (${count}건)`}
      </Button>
      {result && (
        <span className="text-xs text-muted-foreground">{result}</span>
      )}
    </div>
  );
}
