import { useEffect, useId, useRef, useState } from 'react';
import { isAxiosError } from 'axios';
import { apiClient } from '../api/axios';
import type { EditSuggestion, JobReview, JobVersion } from '../types';
import { PlanChooser, SavedGapPlans } from './GapPlans';
import { evidenceLabels as statusLabels, useGapPlans } from '../hooks/useGapPlans';
import { JobCoverage } from './JobCoverage';
import { RequirementsEditor } from './RequirementsEditor';


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

export function JobReviewPanel({ version, path, dirty, busy, apply, onPlanDirty, onReviewBusy, onRequirementsSaved, focusEvidence }: {
  version: JobVersion; path: string; dirty: boolean; busy: boolean; apply: (s: EditSuggestion) => boolean;
  onPlanDirty: (value: boolean) => void; focusEvidence: () => void;
  onReviewBusy: (value: boolean) => void; onRequirementsSaved: (version: JobVersion) => void;
}) {
  const [planDirty, setPlanDirty] = useState(false);
  const [requirementsDirty, setRequirementsDirty] = useState(false);
  const [requirementsBusy, setRequirementsBusy] = useState(false);
  const plans = useGapPlans(version, path, setPlanDirty);
  const [review, setReview] = useState<JobReview | null>(version.analysis);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => { onPlanDirty(planDirty || requirementsDirty); }, [planDirty, requirementsDirty, onPlanDirty]);
  useEffect(() => () => onPlanDirty(false), [onPlanDirty]);
  useEffect(() => { onReviewBusy(loading || requirementsBusy || plans.busy); }, [loading, requirementsBusy, plans.busy, onReviewBusy]);
  useEffect(() => () => onReviewBusy(false), [onReviewBusy]);
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
    <p className="hint">AI extraction sends only the job description to Groq. Manual requirements and resume comparison use no AI call. Your job description is saved privately with this version.</p>
    <button className="primary" disabled={dirty || busy || loading || planDirty || requirementsDirty || requirementsBusy || plans.busy || !!review} onClick={() => void analyze()}>{loading ? 'Reading requirements…' : review ? 'Review is up to date' : 'Review this job'}</button>
    {dirty && <p className="hint">Save your edits before requesting an updated review. Any review below refers to the previously saved content.</p>}
    {error && <p className="error" role="alert">{error}</p>}
    {review?.coverage && <JobCoverage coverage={review.coverage} dirty={dirty || requirementsDirty} />}
    <RequirementsEditor key={review?.generatedAt ?? 'manual'} review={review} version={version} path={path} blocked={busy || dirty || loading || planDirty || plans.busy} onDirty={setRequirementsDirty} onBusy={setRequirementsBusy} onSaved={onRequirementsSaved} />
    {review && <div className="review-results"><p className="hint">Check the quoted context and priority, and correct missed requirements above. Comparison uses exact terms and a small alias list; it can miss equivalent wording. Saving resume edits recalculates this review locally.</p>
      {review.requirements.map(r => <article key={r.id} className={`requirement-card ${r.status}`}><span className="requirement-status">{r.excluded ? 'Excluded from comparison' : statusLabels[r.status]}</span><h3>{r.label}</h3><p className="hint">Priority: {r.priority} · {r.origin === 'user' ? 'Added by you' : r.original ? 'Edited by you · original extraction retained' : 'Extracted from job description'}</p><blockquote>{r.quote}</blockquote>
        {r.original && <details><summary>Original extracted requirement</summary><p className="quoted-text">{r.original.label} · {r.original.priority}<br />{r.original.quote}</p></details>}
        {review.coverage?.duplicates.some(d => d.id === r.id) && <p className="hint">Repeated skill name: counted once under its strongest included priority.</p>}
        {r.evidence.map(e => <details key={e.id}><summary>{e.label}</summary><p className="quoted-text">{e.text}</p></details>)}
        {!r.excluded && !review.coverage?.duplicates.some(d => d.id === r.id) && <details><summary>{r.status === 'work_mention' ? 'Prepare an example' : 'Choose a next step'}</summary><p>{r.action}</p>{r.status === 'not_found' && <p className="hint">A missing mention is not proof of a missing skill. Add real experience if you have it; otherwise complete and test a small project task before claiming it.</p>}<PlanChooser requirement={r} controls={plans} disabled={busy || dirty || loading || requirementsBusy || requirementsDirty} /></details>}
      </article>)}
      <div className="suggestions-heading"><h3>Suggested changes</h3><p className="hint">These bring relevant existing lines first. They do not generate new achievements. You can edit wording before using a suggestion.</p></div>
      {review.suggestions.length ? review.suggestions.map(s => <Suggestion key={s.id} suggestion={s} apply={apply} disabled={busy || loading || requirementsBusy || requirementsDirty} />) : <p className="hint">No safe line-reordering suggestions found. Use the requirements above to make factual edits in the document.</p>}
    </div>}
    <SavedGapPlans controls={plans} version={version} disabled={busy || loading || requirementsBusy || requirementsDirty} resumeDirty={dirty} focusEvidence={focusEvidence} />
  </section>;
}
