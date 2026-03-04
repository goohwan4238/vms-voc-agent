import type { VocWorkflow } from '@/types/workflow';
import { apiFetch } from './client';

export function getWorkflows(): Promise<VocWorkflow[]> {
  return apiFetch('/voc');
}

export function getWorkflow(id: string): Promise<VocWorkflow> {
  return apiFetch(`/voc/${id}`);
}

export async function approveWorkflow(id: string): Promise<{ success: boolean; message: string }> {
  return apiFetch(`/voc/${id}/approve`, { method: 'POST' });
}

export async function rejectWorkflow(id: string): Promise<{ success: boolean; message: string }> {
  return apiFetch(`/voc/${id}/reject`, { method: 'POST' });
}

export async function getPrd(id: string): Promise<string> {
  const res = await fetch(`/voc/${id}/prd`);
  if (!res.ok) throw new Error('PRD not found');
  return res.text();
}

export async function deployAll(): Promise<{
  success: boolean;
  message: string;
  deployedVocIds: string[];
  commitHash: string | null;
}> {
  return apiFetch('/deploy', { method: 'POST' });
}

export async function getDeployableCount(): Promise<{ count: number }> {
  return apiFetch('/deploy/count');
}

export async function createVoc(data: {
  id: string;
  title: string;
  description?: string;
  requester?: string;
}): Promise<{ received: boolean; voc_id: string }> {
  return apiFetch('/webhook/voc', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}
