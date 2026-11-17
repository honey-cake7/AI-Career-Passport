import { useEffect, useId, useState, type FormEvent } from 'react';
import type { GapPlan, JobReview, JobVersion, PlanConfirmation } from '../types';
import { confirmationLabels, editable, evidenceLabels, sameRequirement, type PlanControls } from '../hooks/useGapPlans';

export function PlanChooser({ requirement, controls, disabled }: { requirement: JobReview['requirements'][number]; controls: PlanControls; disabled: boolean }) {
  const [choice, setChoice] = useState<PlanConfirmation | ''>('');
  const id = useId();
  const existing = controls.gapPlans.find(p => sameRequirement(p.requirement, requirement));
  if (existing) return <a href={`#plan-${existing.id}`}>Open saved plan for {requirement.label} ↓</a>;
  return <div className="plan-chooser"><label htmlFor={id}>What is true for you?</label><select id={id} value={choice} onChange={e => setChoice(e.target.value as PlanConfirmation)} disabled={disabled || controls.busy}>
    <option value="">Choose before planning</option>{(requirement.kind === 'skill' ? ['has_experience', 'needs_practice', 'needs_review'] as const : ['needs_review'] as const).map(value => <option key={value} value={value}>{confirmationLabels[value]}</option>)}
  </select><button disabled={!choice || disabled || controls.busy || controls.gapPlans.length >= 20} onClick={() => { if (choice) void controls.create(requirement.id, choice); }}>Save a focused plan</button>
    {requirement.kind === 'context' && <p className="hint">Check eligibility, duration and ambiguous conditions yourself. A project cannot establish these.</p>}</div>;
}

function PlanEditor({ plan, revision, controls, disabled, resumeDirty, focusEvidence }: { plan: GapPlan; revision: number; controls: PlanControls; disabled: boolean; resumeDirty: boolean; focusEvidence: () => void }) {
  const [draft, setDraft] = useState(() => editable(plan));
  const id = useId();
  const dirty = JSON.stringify(draft) !== JSON.stringify(editable(plan));
  const reportDirty = controls.reportDirty;
  useEffect(() => { reportDirty(plan.id, dirty); return () => reportDirty(plan.id, false); }, [dirty, plan.id, reportDirty]);
  const blocked = disabled || controls.busy;
  async function save(event: FormEvent) {
    event.preventDefault();
    const result = await controls.save(plan.id, draft);
    const saved = result?.gapPlans.find(p => p.id === plan.id);
    if (saved) setDraft(editable(saved));
  }
  return <article className="gap-plan" id={`plan-${plan.id}`} aria-label={`Plan for ${plan.requirement.label}`}>
    <p className="eyebrow">{confirmationLabels[plan.confirmation]}</p><h3>{plan.requirement.label}</h3><details><summary>Original job requirement</summary><blockquote>{plan.requirement.quote}</blockquote><p className="hint">This quoted requirement stays with the plan, even after a new review.</p></details>
    <form onSubmit={event => void save(event)}><fieldset disabled={blocked}>
      <label htmlFor={`${id}-task`}>Focused task</label><textarea id={`${id}-task`} value={draft.task} maxLength={500} required rows={2} onChange={e => setDraft(d => ({ ...d, task: e.target.value }))} />
      <p className="hint">Adapt this starting point to a real project and the job's context. It is not a complete curriculum.</p>
      <p className="plan-label">Completion criteria</p>{draft.criteria.map((criterion, i) => <div className="plan-criterion" key={i}>
        <label className="check-label"><input type="checkbox" checked={draft.checks[i]} onChange={e => setDraft(d => ({ ...d, checks: d.checks.map((value, index) => index === i ? e.target.checked : value) }))} />Criterion {i + 1} done</label>
        <label className="visually-hidden" htmlFor={`${id}-criterion-${i}`}>Criterion {i + 1}</label><textarea id={`${id}-criterion-${i}`} rows={2} maxLength={300} required value={criterion} onChange={e => setDraft(d => ({ ...d, criteria: d.criteria.map((value, index) => index === i ? e.target.value : value), checks: d.checks.map((value, index) => index === i ? false : value) }))} />
        <button type="button" disabled={draft.criteria.length <= 1} onClick={() => setDraft(d => ({ ...d, criteria: d.criteria.filter((_, index) => index !== i), checks: d.checks.filter((_, index) => index !== i) }))}>Remove criterion {i + 1}</button>
      </div>)}
      <button type="button" disabled={draft.criteria.length >= 5} onClick={() => setDraft(d => ({ ...d, criteria: [...d.criteria, ''], checks: [...d.checks, false] }))}>+ Add criterion</button>
      <label htmlFor={`${id}-status`}>Task status</label><select id={`${id}-status`} value={draft.status} onChange={e => setDraft(d => ({ ...d, status: e.target.value as GapPlan['status'] }))}><option value="planned">Planned</option><option value="in_progress">In progress</option><option value="completed">Completed · self-reported</option></select>
      <label htmlFor={`${id}-notes`}>Outcome notes</label><textarea id={`${id}-notes`} rows={4} maxLength={3000} value={draft.notes} onChange={e => setDraft(d => ({ ...d, notes: e.target.value }))} placeholder="What did you actually do? What worked, what failed, and what can someone check?" />
      <label htmlFor={`${id}-link`}>Evidence URL · optional</label><input type="url" id={`${id}-link`} maxLength={1000} value={draft.link} onChange={e => setDraft(d => ({ ...d, link: e.target.value }))} placeholder="https://…" />
      <p className="hint">To record completion, check each criterion and describe the outcome. Links are saved privately and are not fetched or verified.</p><button className="primary" disabled={blocked || !dirty}>Save plan</button>{dirty && <span className="hint"> Unsaved plan edits</span>}
    </fieldset></form>
    <div className="plan-assessment"><h4>What the saved resume shows</h4><p>{evidenceLabels[plan.assessment.status]}</p><p className="hint">Checked against revision {plan.assessment.revision}.{plan.assessment.revision !== revision && ' Out of date: reassess after saving your resume.'}</p>
      {plan.assessment.evidence.map(e => <details key={e.id}><summary>{e.label}</summary><p className="quoted-text">{e.text}</p></details>)}
      <p className="hint">Task completion does not add evidence to the resume or establish proficiency. Write only what you can support.</p><div className="actions wrap"><button disabled={blocked} onClick={focusEvidence}>Edit resume evidence</button><button disabled={blocked || dirty || resumeDirty} onClick={() => void controls.reassess(plan.id)}>Reassess saved resume</button></div>
      {(dirty || resumeDirty) && <p className="hint">Save your plan and resume before reassessing.</p>}
    </div><button className="danger-link" disabled={blocked} onClick={() => { if (window.confirm('Delete this plan and its notes? Your resume will be kept.')) void controls.remove(plan.id); }}>Delete plan</button>
  </article>;
}

export function SavedGapPlans({ controls, version, disabled, resumeDirty, focusEvidence }: { controls: PlanControls; version: JobVersion; disabled: boolean; resumeDirty: boolean; focusEvidence: () => void }) {
  return <section className="saved-plans"><h3>Your next steps</h3><p>Save a small, checkable task for a requirement. Keep what you have done separate from what your resume says.</p>
    {controls.error && <p className="error" role="alert">{controls.error}</p>}{controls.notice && <p className="notice" role="status">{controls.notice}</p>}
    {controls.gapPlans.length ? controls.gapPlans.map(plan => <PlanEditor key={`${plan.id}:${controls.epoch}`} plan={plan} revision={version.revision} controls={controls} disabled={disabled} resumeDirty={resumeDirty} focusEvidence={focusEvidence} />) : <p className="hint">No plans yet. Review the job, then choose what is true for you beneath a requirement.</p>}
    <button disabled={disabled || controls.busy} onClick={() => void controls.reload()}>Reload saved plans</button><p className="hint">Plans and outcome notes stay private in this job version. Up to 20 plans. Deleting the version removes its plans.</p>
  </section>;
}
