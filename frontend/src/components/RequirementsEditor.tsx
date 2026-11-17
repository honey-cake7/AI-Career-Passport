import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { isAxiosError } from 'axios';
import { apiClient } from '../api/axios';
import type { JobReview, JobVersion } from '../types';

type Row = Pick<JobReview['requirements'][number], 'label' | 'quote' | 'kind' | 'term' | 'priority'> & { id?: string; excluded: boolean };
const editable = (review: JobReview | null): Row[] => (review?.requirements ?? []).map(({ id, label, quote, kind, term, priority, excluded }) => ({ id, label, quote, kind, term, priority, excluded: !!excluded }));

export function RequirementsEditor({ review, version, path, blocked, onDirty, onSaved, onBusy }: {
  review: JobReview | null; version: JobVersion; path: string; blocked: boolean;
  onDirty: (value: boolean) => void; onBusy: (value: boolean) => void; onSaved: (version: JobVersion) => void;
}) {
  const prefix = useId();
  const [rows, setRows] = useState(() => editable(review));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [conflict, setConflict] = useState(false);
  const alive = useRef(true);
  const dirty = JSON.stringify(rows) !== JSON.stringify(editable(review));
  useEffect(() => { onDirty(dirty); }, [dirty, onDirty]);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  function change(index: number, patch: Partial<Row>) { setRows(rows => rows.map((row, i) => i === index ? { ...row, ...patch } : row)); }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (blocked || busy) return;
    setBusy(true); onBusy(true); setError('');
    try {
      const response = await apiClient.put(`${path}/requirements`, { revision: version.revision, reviewedAt: review?.generatedAt ?? null, requirements: rows });
      if (alive.current) { onDirty(false); onSaved(response.data.data); }
    } catch (error) {
      if (alive.current) {
        setError(isAxiosError(error) ? error.response?.data?.error ?? 'Unable to save requirements. Your edits are still here.' : 'Unable to save requirements.');
        setConflict(isAxiosError(error) && error.response?.status === 409);
      }
    } finally { if (alive.current) { setBusy(false); onBusy(false); } }
  }
  async function reload() {
    if (dirty && !window.confirm('Discard your requirement edits and reload the saved job version?')) return;
    setBusy(true); onBusy(true); setError('');
    try {
      const response = await apiClient.get(path);
      if (alive.current) { onDirty(false); onSaved(response.data.data); }
    } catch { if (alive.current) setError('Unable to reload. Your requirement edits are still here.'); }
    finally { if (alive.current) { setBusy(false); onBusy(false); } }
  }
  return <details className="requirements-editor"><summary>{review ? 'Edit job requirements' : 'Add requirements yourself'}</summary>
    <p>Correct the extracted requirements, add a missed one, or exclude an irrelevant row. Copy each source quote exactly from the saved job description. Your changes affect coverage, not your resume.</p>
    <form onSubmit={save}><fieldset disabled={blocked || busy}>
      {rows.map((row, i) => <article className="requirement-edit" key={row.id ?? `new:${i}`} aria-label={`Requirement ${i + 1}`}>
        <h4>Requirement {i + 1}</h4>
        <label htmlFor={`${prefix}-${i}-label`}>Requirement label<input id={`${prefix}-${i}-label`} value={row.label} maxLength={200} required onChange={e => change(i, { label: e.target.value })} /></label>
        <label htmlFor={`${prefix}-${i}-quote`}>Exact job quote<textarea id={`${prefix}-${i}-quote`} value={row.quote} maxLength={1200} required rows={3} onChange={e => change(i, { quote: e.target.value })} /></label>
        <label htmlFor={`${prefix}-${i}-kind`}>Requirement type<select id={`${prefix}-${i}-kind`} value={row.kind} onChange={e => change(i, { kind: e.target.value as Row['kind'], term: e.target.value === 'context' ? '' : row.term })}><option value="skill">Named skill / technology</option><option value="context">Context / manual check</option></select></label>
        {row.kind === 'skill' && <label htmlFor={`${prefix}-${i}-term`}>Exact skill name in quote<input id={`${prefix}-${i}-term`} value={row.term} maxLength={100} required onChange={e => change(i, { term: e.target.value })} /></label>}
        <label htmlFor={`${prefix}-${i}-priority`}>Priority<select id={`${prefix}-${i}-priority`} value={row.priority} onChange={e => change(i, { priority: e.target.value as Row['priority'] })}><option value="required">Required</option><option value="preferred">Preferred</option><option value="unspecified">Unspecified</option></select></label>
        <label className="check-label"><input type="checkbox" checked={row.excluded} onChange={e => change(i, { excluded: e.target.checked })} />Exclude from this comparison</label>
        {!row.id && <button type="button" onClick={() => setRows(rows => rows.filter((_, index) => index !== i))}>Remove new requirement</button>}
      </article>)}
      <button type="button" disabled={rows.length >= 30} onClick={() => setRows(rows => [...rows, { label: '', quote: '', kind: 'skill', term: '', priority: 'unspecified', excluded: false }])}>+ Add requirement</button>
      <p className="hint">Up to 30 rows. Alternatives, duration and eligibility need a context/manual check. Known aliases are counted once. Existing rows can be excluded, so their source remains visible. Saved plans retain their original requirement.</p>
      <div className="actions wrap"><button className="primary" disabled={!dirty || conflict}>{busy ? 'Saving requirements…' : 'Save requirements'}</button><button type="button" disabled={!dirty} onClick={() => { setRows(editable(review)); setError(''); setConflict(false); }}>Discard requirement edits</button></div>
    </fieldset></form>
    {blocked && <p className="hint">Save or discard resume and plan edits before changing requirements.</p>}
    {error && <p className="error" role="alert">{error}</p>}
    {conflict && <button type="button" disabled={busy || blocked} onClick={() => void reload()}>Reload saved job version</button>}
  </details>;
}
