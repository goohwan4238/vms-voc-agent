import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';

export function Header() {
  const [healthy, setHealthy] = useState<boolean | null>(null);

  useEffect(() => {
    const check = () =>
      fetch('/health')
        .then((r) => setHealthy(r.ok))
        .catch(() => setHealthy(false));
    check();
    const id = setInterval(check, 30000);
    return () => clearInterval(id);
  }, []);

  return (
    <header className="border-b bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link to="/" className="flex items-center gap-3 no-underline">
          <h1 className="text-xl font-bold text-foreground">VMS VOC Agent</h1>
          <span
            className={`inline-block h-2.5 w-2.5 rounded-full ${
              healthy === null ? 'bg-gray-300' : healthy ? 'bg-green-500' : 'bg-red-500'
            }`}
            title={healthy === null ? '확인 중...' : healthy ? '서버 정상' : '서버 오류'}
          />
        </Link>
        <Link to="/voc/new">
          <Button>새 VOC 등록</Button>
        </Link>
      </div>
    </header>
  );
}
