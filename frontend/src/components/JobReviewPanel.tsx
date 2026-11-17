import { useEffect, useId, useRef, useState } from 'react';
import { isAxiosError } from 'axios';
import { apiClient } from '../api/axios';
import type { EditSuggestion, JobReview, JobVersion } from '../types';
import { PlanChooser, SavedGapPlans } from './GapPlans';
import { evidenceLabels as statusLabels, useGapPlans } from '../hooks/useGapPlans';


function Suggestion({ suggestion, apply, disabled }: { suggestion: EditSuggestion; apply: (s: EditSuggestion) => boolean; disabled: boolean }) {
  const editId = useId();
  const [decision, setDecision] = useState<'pending' | 'used' | 'rejected'>('pending');
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(suggestion.proposed);
  return <article className="suggestion-card"><h3>{suggestion.sourceLabel}</h3><p>{suggestion.reason}</p>
    <details><summary>Original text</summary><p className="quoted-text">{suggestion.original}</p></details>
    {editing ? <div><label htmlFor={editId}>Your proposed wording</label><textarea id={editId} value={text} onChange={e => setText(e.target.value)} maxLength={suggestion.sourceId === 'summary' ? 5000 : 10000} rows={5} /></div> : <><p className="hint">Proposed order · existing lines only</p><p className="quoted-text">{text}</p></>}
    <p className="hint">Check meaning and context. No changes are saved until you choose to save the resume.</p>
    {decision === 'pending' ? <div className="actions wrap"><button className="primary" disabled={disabled || !text.trim()} onClick={() => { if (apply({ ...suggestion, proposed: text })) setDecision('used'); }}>{editing ? 'Use edited text in draft' : 'Use suggestion in draft'}</button><button disabled={disabled} onClick={() => setEditing(!editing)}>{editing ? 'Preview wording' : 'Edit wording'}</button><button disabled={disabled} onClick={() => setDecision('rejected')}>Reject</button></div> : <p role="status">{decision === 'used' ? 'Added to your draft. Review and save to keep it.' : 'Rejected. Your resume was not changed.'}{decision === 'rejected' && <button disabled={disabled} onClick={() => setDecision('pending')}>Reconsider</button>}</p>}
  </article>;
}

export function JobReviewPanel({ version, path, dirty, busy, apply, onPlanDirty, focusEvidence }: {
  version: JobVersion; path: string; dirty: boolean; busy: boolean; apply: (s: EditSuggestion) => boolean;
  onPlanDirty: (value: boolean) => void; focusEvidence: () => void;
}) {
  const plans = useGapPlans(version, path, onPlanDirty);
  const [review, setReview] = useState<JobReview | null>(version.analysis);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  async function analyze() {
    setLoading(true); setError('');
    try {
      const response = await apiClient.post(`${path}/review`, { revision: version.revision });
      if (!alive.current) return;
      const result: JobReview = response.data.data;
      if (result.revision !== version.revision) { setError('This review is stale. Reload the saved version.'); return; }
      setReview(result);
    } catch (error) {
      if (alive.current) setError(isAxiosError(error) ? error.response?.data?.error ?? 'Unable to review this job. Your version is unchanged.' : 'Unable to review this job.');
    } finally { if (alive.current) setLoading(false); }
  }
  return <section className="job-review"><p className="eyebrow">ONE JOB, YOUR EXPERIENCE</p><h2>What does this role ask for?</h2><p>Review requirements against the saved version. Mentions provide context; they do not prove proficiency.</p>
    <details><summary>Job description</summary><p className="quoted-text job-description">{version.jobDescription}</p></details>
    <p className="hint">Only the job description is sent to Groq. Resume comparison runs on this server. Your job description is saved privately with this version.</p>
    <button className="primary" disabled={dirty || busy || loading || !!review} onClick={() => void analyze()}>{loading ? 'Reading requirements…' : review ? 'Review is up to date' : 'Review this job'}</button>
    {dirty && <p className="hint">Save your edits before requesting an updated review. Any review below refers to the previously saved content.</p>}
    {error && <p className="error" role="alert">{error}</p>}
    {review && <div className="review-results"><p className="hint">AI-extracted requirements: verify the quoted context and priority. This uses exact terms and a small alias list; it can miss equivalent wording and does not assess depth, negation or alternatives.</p>
      {review.requirements.map(r => <article key={r.id} className={`requirement-card ${r.status}`}><span className="requirement-status">{statusLabels[r.status]}</span><h3>{r.label}</h3><p className="hint">Priority: {r.priority}</p><blockquote>{r.quote}</blockquote>
        {r.evidence.map(e => <details key={e.id}><summary>{e.label}</summary><p className="quoted-text">{e.text}</p></details>)}
        <details><summary>{r.status === 'work_mention' ? 'Prepare an example' : 'Choose a next step'}</summary><p>{r.action}</p>{r.status === 'not_found' && <p className="hint">A missing mention is not proof of a missing skill. Add real experience if you have it; otherwise complete and test a small project task before claiming it.</p>}<PlanChooser requirement={r} controls={plans} disabled={busy || dirty || loading} /></details>
      </article>)}
      <div className="suggestions-heading"><h3>Suggested changes</h3><p className="hint">These bring relevant existing lines first. They do not generate new achievements. You can edit wording before using a suggestion.</p></div>
      {review.suggestions.length ? review.suggestions.map(s => <Suggestion key={s.id} suggestion={s} apply={apply} disabled={busy} />) : <p className="hint">No safe line-reordering suggestions found. Use the requirements above to make factual edits in the document.</p>}
    </div>}
    <SavedGapPlans controls={plans} version={version} disabled={busy || loading} resumeDirty={dirty} focusEvidence={focusEvidence} />
  </section>;
}
