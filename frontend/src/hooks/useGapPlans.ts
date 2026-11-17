import { useCallback, useEffect, useRef, useState } from 'react';
import { isAxiosError } from 'axios';
import { apiClient } from '../api/axios';
import type { GapPlan, JobVersion, PlanConfirmation } from '../types';

export const evidenceLabels = { work_mention: 'Mentioned in work', claim_only: 'Listed without an example', not_found: 'Not found in this resume', unassessed: 'Cannot assess automatically' };
export const confirmationLabels = { has_experience: 'I have relevant experience', needs_practice: 'I need practice', needs_review: 'I need to check this requirement' };
export type EditablePlan = Pick<GapPlan, 'task' | 'criteria' | 'checks' | 'status' | 'notes' | 'link'>;
type PlanState = { gapPlans: GapPlan[]; plansRevision: number; revision: number };
export const editable = ({ task, criteria, checks, status, notes, link }: GapPlan): EditablePlan => ({ task, criteria: [...criteria], checks: [...checks], status, notes, link });

export function sameRequirement(a: GapPlan['requirement'], b: GapPlan['requirement']) {
  return a.kind === b.kind && a.term.toLowerCase() === b.term.toLowerCase() && a.quote.replace(/\s+/g, ' ').trim() === b.quote.replace(/\s+/g, ' ').trim();
}

export function useGapPlans(version: JobVersion, path: string, onDirty: (dirty: boolean) => void) {
  const [state, setState] = useState<PlanState>({ gapPlans: version.gapPlans ?? [], plansRevision: version.plansRevision ?? 0, revision: version.revision });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [epoch, setEpoch] = useState(0);
  const [drafts, setDrafts] = useState<Record<string, boolean>>({});
  const alive = useRef(true);
  const inFlight = useRef(false);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const reportDirty = useCallback((id: string, dirty: boolean) => setDrafts(d => d[id] === dirty ? d : { ...d, [id]: dirty }), []);
  const dirty = Object.values(drafts).some(Boolean);
  useEffect(() => { onDirty(dirty); }, [dirty, onDirty]);
  useEffect(() => () => onDirty(false), [onDirty]);
  async function mutate(suffix: string, method: 'post' | 'put' | 'delete', body: object, success: string): Promise<PlanState | null> {
    if (inFlight.current) return null;
    inFlight.current = true; setBusy(true); setError(''); setNotice('');
    try {
      const response = await apiClient.request({ url: `${path}/plans${suffix}`, method, data: { revision: version.revision, plansRevision: state.plansRevision, ...body } });
      if (!alive.current) return null;
      const data: PlanState = response.data.data;
      setState(data); setNotice(success); return data;
    } catch (error) {
      if (alive.current) setError(isAxiosError(error) ? error.response?.data?.error ?? 'Unable to save the plan. Your edits are still here.' : 'Unable to save the plan.');
      return null;
    } finally { inFlight.current = false; if (alive.current) setBusy(false); }
  }
  async function reload() {
    if (dirty && !window.confirm('Discard unsaved plan edits and load the latest saved plans?')) return;
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setError(''); setNotice('');
    try {
      const response = await apiClient.get(`${path}/plans`);
      if (!alive.current) return;
      const data: PlanState = response.data.data;
      if (data.revision !== version.revision) { setError('The saved resume changed in another session. Save or copy your notes, then reload the whole job version.'); return; }
      setState(data); setDrafts({}); setEpoch(x => x + 1); setNotice('Loaded the latest saved plans.');
    } catch { if (alive.current) setError('Unable to reload plans. Your edits are still here.'); }
    finally { inFlight.current = false; if (alive.current) setBusy(false); }
  }
  return { ...state, busy, error, notice, epoch, reportDirty, reload,
    create: (requirementId: string, confirmation: PlanConfirmation) => mutate('', 'post', { requirementId, confirmation }, 'Plan saved. Adapt the task to your project before starting.'),
    save: (id: string, plan: EditablePlan) => mutate(`/${id}`, 'put', { plan }, 'Plan saved. Completion is self-reported; your resume has not changed.'),
    reassess: (id: string) => mutate(`/${id}/reassess`, 'post', {}, 'Compared the original requirement with your saved resume. No AI call was needed.'),
    remove: (id: string) => mutate(`/${id}`, 'delete', {}, 'Plan deleted. Your resume has not changed.'),
  };
}
export type PlanControls = ReturnType<typeof useGapPlans>;
