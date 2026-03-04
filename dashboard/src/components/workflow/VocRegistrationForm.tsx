import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { createVoc } from '@/api/workflows';

export function VocRegistrationForm() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    id: '',
    title: '',
    description: '',
    requester: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.id.trim() || !form.title.trim()) return;

    setLoading(true);
    try {
      await createVoc({
        id: form.id.trim(),
        title: form.title.trim(),
        description: form.description.trim() || undefined,
        requester: form.requester.trim() || undefined,
      });
      navigate('/');
    } catch {
      alert('VOC 등록에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-lg">
      <Card>
        <CardHeader>
          <CardTitle>새 VOC 등록</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">VOC ID *</label>
              <Input
                placeholder="예: VOC-001"
                value={form.id}
                onChange={(e) => setForm({ ...form, id: e.target.value })}
                required
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">제목 *</label>
              <Input
                placeholder="VOC 제목"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                required
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">설명</label>
              <Textarea
                placeholder="VOC 상세 설명"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                rows={4}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">요청자</label>
              <Input
                placeholder="요청자 이름"
                value={form.requester}
                onChange={(e) => setForm({ ...form, requester: e.target.value })}
              />
            </div>
            <div className="flex gap-3 pt-2">
              <Button type="submit" disabled={loading || !form.id.trim() || !form.title.trim()}>
                {loading ? '등록 중...' : '등록'}
              </Button>
              <Button type="button" variant="outline" onClick={() => navigate('/')}>
                취소
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
