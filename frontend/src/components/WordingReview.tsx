import { useEffect, useId, useRef, useState } from 'react';
import { isAxiosError } from 'axios';
import { apiClient } from '../api/axios';
import type { EditSuggestion, JobReview, JobVersion, WordingResult } from '../types';

export function WordingReview({ version, review, path, blocked, resumeDirty, apply, onDirty, onBusy, onReload, focusEvidence }: {
  version: JobVersion; review: JobReview; path: string; blocked: boolean; resumeDirty: boolean;
  apply: (suggestion: EditSuggestion) => boolean; onDirty: (dirty: boolean) => void;
  onBusy: (busy: boolean) => void; onReload: (version: JobVersion) => void; focusEvidence: () => void;
}) {
  const prefix = useId();
  const [selection, setSelection] = useState('');
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [conflict, setConflict] = useState(false);
  const [result, setResult] = useState<WordingResult | null>(null);
  const [text, setText] = useState('');
  const [editing, setEditing] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [decision, setDecision] = useState<'pending' | 'used' | 'rejected'>('pending');
  const alive = useRef(true);
  const proposal = useRef<HTMLDivElement>(null);
  const pending = !!result?.suggestion && decision === 'pending';
  useEffect(() => { onDirty(pending); }, [pending, onDirty]);
  useEffect(() => () => onDirty(false), [onDirty]);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const options = review.requirements.filter(r => !r.excluded && r.kind === 'skill' && r.status === 'work_mention')
    .flatMap(r => r.evidence.filter(e => e.id.startsWith('project:') || e.id.startsWith('experience:')).map(e => ({ key: `${r.id}|${e.id}`, requirement: r, source: e })));
  const chosen = options.find(option => option.key === selection);
  const sourceIndex = Number(chosen?.source.id.split(':')[1]);
  const sentText = chosen?.source.id.startsWith('project:') ? version.projects[sourceIndex]?.description ?? '' : version.experiences[sourceIndex]?.description ?? '';
  const gaps = review.requirements.filter(r => !r.excluded && r.kind === 'skill' && ['not_found', 'claim_only'].includes(r.status));

  async function generate() {
    if (busy || blocked || resumeDirty || !chosen || !consent || sentText.length > 4000) return;
    if (pending && !window.confirm('Discard this unaccepted wording suggestion and request another?')) return;
    setBusy(true); onBusy(true); setError(''); setConflict(false);
    try {
      const response = await apiClient.post(`${path}/wording`, { revision: version.revision, reviewedAt: review.generatedAt,
        sourceId: chosen.source.id, requirementId: chosen.requirement.id, consent: true });
      if (!alive.current) return;
      const next: WordingResult = response.data.data;
      if (next.revision !== version.revision || next.reviewedAt !== review.generatedAt) { setError('This wording is stale. Reload the saved job version.'); setConflict(true); return; }
      setResult(next); setText(next.suggestion?.proposed ?? ''); setConfirmed(false); setEditing(false); setDecision('pending');
      requestAnimationFrame(() => proposal.current?.focus());
    } catch (error) {
      if (alive.current) {
        setError(isAxiosError(error) && typeof error.response?.data?.error === 'string' ? error.response.data.error : 'Unable to suggest wording. Your resume is unchanged.');
        setConflict(isAxiosError(error) && error.response?.status === 409);
      }
    } finally { if (alive.current) { setBusy(false); onBusy(false); } }
  }
  async function reload() {
    if (busy || blocked) return;
    if ((pending || resumeDirty) && !window.confirm('Discard the unaccepted wording and unsaved resume edits, and reload this job version?')) return;
    setBusy(true); onBusy(true); setError('');
    try {
      const response = await apiClient.get(path);
      if (alive.current) { onDirty(false); onReload(response.data.data); }
    } catch { if (alive.current) setError('Unable to reload. Your current edits are still here.'); }
    finally { if (alive.current) { setBusy(false); onBusy(false); } }
  }
  return <section className="wording-review" aria-label="Review wording improvements"><h3>Make an existing example clearer.</h3>
    <p className="hint">Request a small wording edit to an existing work description. Review it before adding anything to your draft.</p>
    {options.length ? <>
      <fieldset disabled={blocked || resumeDirty || busy}>
        <label htmlFor={`${prefix}-source`}>Section and job requirement<select id={`${prefix}-source`} value={selection} onChange={e => { setSelection(e.target.value); setConsent(false); }}><option value="">Choose a work mention</option>{options.map(option => <option key={option.key} value={option.key}>{option.requirement.label} · {option.source.label}</option>)}</select></label>
        {chosen && <blockquote>{chosen.requirement.quote}</blockquote>}
        {chosen && <details><summary>Description that will be sent ({sentText.length} characters)</summary><p className="quoted-text">{sentText}</p></details>}
        {sentText.length > 4000 && <p className="hint">Shorten this saved description to 4,000 characters before requesting wording.</p>}
        <p className="hint">Sends this description and the quoted requirement to Groq. Contact fields and other sections are omitted. Check the description for sensitive details first.</p>
        <label className="check-label"><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} />Send this description and job quote for wording suggestions</label>
        <button className="primary" type="button" disabled={!chosen || !consent || conflict || sentText.length > 4000} onClick={() => void generate()}>{busy ? 'Checking wording…' : 'Suggest clearer wording'}</button>
      </fieldset>
      {(blocked || resumeDirty) && <p className="hint">Save or discard other edits before requesting wording. An accepted suggestion becomes an unsaved resume edit.</p>}
    </> : <p className="hint">No eligible work mention yet. Add a truthful project or experience description and save it first. Summary claims, missing skills and uncertain wording are not rewritten automatically.</p>}
    {error && <p className="error" role="alert">{error}</p>}
    {conflict && <button type="button" disabled={busy || blocked} onClick={() => void reload()}>Reload saved wording source</button>}
    {result && <div ref={proposal} tabIndex={-1} className="wording-result">
      {!result.suggestion ? <p role="status">No useful wording edit passed the checks. Your resume is unchanged. You can edit it manually.</p> : <article aria-label="Wording proposal">
        <h4>{result.suggestion.sourceLabel}</h4><p className="hint">Related requirement: {result.requirement.label}</p><blockquote>{result.requirement.quote}</blockquote>
        <div className="wording-comparison"><div><h4>Original wording</h4><p className="quoted-text">{result.suggestion.original}</p></div><div><h4>Proposed wording</h4><p className="quoted-text">{text}</p></div></div>
        <p className="hint">{result.suggestion.reason}</p>
        <details><summary>What the wording checks do</summary><p>Edits are limited to a few concision phrases, articles and punctuation; other words keep their order. These checks cannot verify that your claims are true or that the meaning is unchanged.</p></details>
        {decision === 'pending' ? <fieldset disabled={blocked || busy}>
          {editing && <label htmlFor={`${prefix}-text`}>Your edited wording<textarea id={`${prefix}-text`} rows={6} maxLength={10000} value={text} onChange={e => { setText(e.target.value); setConfirmed(false); }} /><span className="hint">Manual edits are your own claims. Add only facts you can support.</span></label>}
          <label className="check-label"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />I checked the facts, ownership of the work, and meaning</label>
          <div className="actions wrap"><button type="button" className="primary" disabled={!confirmed || !text.trim() || conflict} onClick={() => { if (apply({ ...result.suggestion!, proposed: text })) { setDecision('used'); onDirty(false); } }}>Accept wording into draft</button><button type="button" onClick={() => setEditing(value => !value)}>{editing ? 'Close wording editor' : 'Edit proposed wording'}</button><button type="button" onClick={() => { setDecision('rejected'); onDirty(false); }}>Reject wording</button></div>
        </fieldset> : <p role="status">{decision === 'used' ? 'Added to your draft. Review the document and save changes to keep it.' : 'Wording rejected. Your resume was not changed.'}</p>}
      </article>}
      <p className="hint">Only accepted text is kept when you save the resume. Unaccepted proposals are lost when you leave this view.</p>
    </div>}
    {!!gaps.length && <details><summary>Details to add yourself ({gaps.length})</summary><p className="hint">A job requirement does not establish that you have done the work. If you have a real example, describe it in the editor. Otherwise, use a practice plan first.</p>{gaps.map(r => <p className="evidence-question" key={r.id}>For <strong>{r.term}</strong>: what did you personally build or change, how did you use it, and what outcome can you support? Leave metrics out unless you know them.</p>)}<button type="button" disabled={busy || blocked} onClick={focusEvidence}>Add real evidence in editor</button></details>}
  </section>;
}
