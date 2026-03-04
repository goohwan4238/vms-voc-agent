import { useState, useEffect } from 'react';
import Markdown from 'react-markdown';
import { getPrd } from '@/api/workflows';

interface Props {
  vocId: string;
}

export function PrdViewer({ vocId }: Props) {
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    getPrd(vocId)
      .then((text) => {
        setContent(text);
        setError(null);
      })
      .catch(() => setError('PRD를 불러올 수 없습니다.'))
      .finally(() => setLoading(false));
  }, [vocId]);

  if (loading) return <div className="py-8 text-center text-muted-foreground">PRD 로딩 중...</div>;
  if (error) return <div className="py-8 text-center text-muted-foreground">{error}</div>;
  if (!content) return null;

  return (
    <div className="prose prose-sm max-w-none">
      <Markdown>{content}</Markdown>
    </div>
  );
}
