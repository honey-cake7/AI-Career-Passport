import { useEffect, useRef, useState, type FormEvent } from 'react';
import { isAxiosError } from 'axios';
import { apiClient } from '../api/axios';
import type { IProfile, JobVersion, VersionListItem } from '../types';
import { ResumeEditor } from './ResumeEditor';
import { JobReviewPanel } from './JobReviewPanel';

export function JobWorkspace({ base, onDirty }: { base: IProfile; onDirty: (value: boolean) => void }) {
  const root = `/api/profile/${base.profileId}/versions`;
  const [versions, setVersions] = useState<VersionListItem[]>([]);
  const [selected, setSelected] = useState<JobVersion | null>(null);
  const [editorEpoch, setEditorEpoch] = useState(0);
  const [label, setLabel] = useState('');
  const [jobDescription, setJobDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState('');
  const generation = useRef(0);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    let active = true;
    const request = generation.current;
    void apiClient.get(root).then(r => { if (active && request === generation.current) setVersions(r.data.data); }).catch(() => { if (active) setError('Unable to load job versions. Return to your base resume and try again.'); });
    return () => { active = false; alive.current = false; };
  }, [root, selected?.profileId]);
  useEffect(() => { if (!selected) onDirty(!!label || !!jobDescription); }, [selected, label, jobDescription, onDirty]);
  const reportDirty = (value: boolean) => { setDirty(value); onDirty(value); };
  async function create(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(''); const request = ++generation.current;
    try {
      const response = await apiClient.post(root, { label, jobDescription, revision: base.revision });
      if (alive.current && request === generation.current) {
        const v: JobVersion = response.data.data;
        setVersions(list => [...list, v]); setSelected(v); setLabel(''); setJobDescription(''); reportDirty(false);
      }
    } catch (error) { if (alive.current) setError(isAxiosError(error) ? error.response?.data?.error ?? 'Unable to create a version.' : 'Unable to create a version.'); }
    finally { if (alive.current) setBusy(false); }
  }
  async function open(id: string) {
    if ((label || jobDescription) && !window.confirm('Discard the new job details and open this saved version?')) return;
    setBusy(true); setError(''); const request = ++generation.current;
    try {
      const response = await apiClient.get(`${root}/${id}`);
      if (alive.current && request === generation.current) { setSelected(response.data.data); setLabel(''); setJobDescription(''); reportDirty(false); }
    } catch { if (alive.current) setError('Unable to load that job version. Return to the list and try again.'); }
    finally { if (alive.current) setBusy(false); }
  }
  if (selected) {
    const path = `${root}/${selected.profileId}`;
    return <><div className="version-context"><button onClick={() => { if (!dirty || window.confirm('Discard unsaved edits and return to job versions?')) { setSelected(null); reportDirty(false); } }}>← All job versions</button><div><strong>{selected.label}</strong><p className="hint">Independent copy of base revision {selected.baseRevision}. Editing this version keeps your base resume intact.</p></div></div>
      <ResumeEditor key={`${selected.profileId}:${editorEpoch}`} profile={selected} documentLabel={selected.label} resourcePath={path} onDirty={reportDirty} onSaved={saved => { const v = saved as JobVersion; setSelected(v); setVersions(list => list.map(x => x.profileId === v.profileId ? v : x)); }} onDeleted={() => { setVersions(list => list.filter(x => x.profileId !== selected.profileId)); setSelected(null); reportDirty(false); }} reviewPanel={controls => <JobReviewPanel key={`${selected.profileId}:${selected.revision}`} version={selected} path={path} {...controls} onRequirementsSaved={v => { setSelected(v); setEditorEpoch(x => x + 1); setVersions(list => list.map(x => x.profileId === v.profileId ? v : x)); }} />} />
    </>;
  }
  return <section className="job-workspace"><div className="workspace-heading"><div><p className="eyebrow">TAILOR WITH CONTEXT</p><h1>One resume. A specific opportunity.</h1><p>Start a separate version, compare the requirements, and decide what to change.</p></div></div>
    {error && <p className="error" role="alert">{error}</p>}
    <div className="job-start-grid"><form className="job-create" onSubmit={create}><h2>Create a job version</h2><p>We copy your saved base resume. You keep control of every edit.</p><fieldset disabled={busy}>
      <label>Version name<input value={label} onChange={e => setLabel(e.target.value)} required maxLength={120} placeholder="e.g. Frontend developer · Acme" /></label>
      <label>Job description<textarea value={jobDescription} onChange={e => setJobDescription(e.target.value)} required maxLength={20000} rows={12} placeholder="Paste the actual job description, including required and preferred qualifications." /></label>
      <p className="hint">Creating a version saves the job description privately. AI processing starts only when you choose “Review this job”. Up to 20 versions.</p><button className="primary" disabled={versions.length >= 20}>{busy ? 'Creating…' : 'Create job version'}</button>
    </fieldset></form>
    <aside className="version-list"><h2>Saved job versions</h2>{versions.length ? <ul>{versions.map(v => <li key={v.profileId}><h3>{v.label}</h3><p className="hint">Saved revision {v.revision} · from base revision {v.baseRevision}</p><button disabled={busy} onClick={() => void open(v.profileId)}>Open {v.label}</button></li>)}</ul> : <p>Create your first version for a role you want to apply to.</p>}</aside></div>
  </section>;
}
