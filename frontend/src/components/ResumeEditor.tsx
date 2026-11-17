import { Fragment, useEffect, useId, useRef, useState, type FormEvent, type ChangeEvent, type ReactNode } from 'react';
import { isAxiosError } from 'axios';
import { apiClient } from '../api/axios';
import type { IProfile, EditSuggestion, SkillEntry } from '../types';
import { SkillReview } from './SkillReview';

type Content = Pick<IProfile, 'personalInfo' | 'experiences' | 'education' | 'projects' | 'skills'>;
const parseSkills = (text: string) => text.split(/\r?\n/).map(value => value.trim()).filter(Boolean);
function content(profile: IProfile): Content {
  const { personalInfo, experiences, education, projects, skills } = profile;
  return structuredClone({ personalInfo, experiences, education, projects, skills });
}
function message(error: unknown, fallback: string) {
  return isAxiosError(error) && typeof error.response?.data?.error === 'string' ? error.response.data.error : fallback;
}

function Field({ title, value, onChange, multiline = false, required = false, maxLength = 300, type = 'text', sourceId }: {
  title: string; value?: string; onChange: (value: string) => void;
  multiline?: boolean; required?: boolean; maxLength?: number; type?: string;
  sourceId?: string;
}) {
  const id = useId();
  const props = { id, 'data-source-id': sourceId, value: value ?? '', onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange(event.target.value), required, maxLength };
  return <div className="resume-field"><label htmlFor={id}>{title}{required && ' *'}</label>{multiline ? <textarea {...props} rows={5} /> : <input {...props} type={type} />}</div>;
}

export function ResumeEditor({ profile, onSaved, onDeleted, onDirty, resourcePath, documentLabel = 'Base resume', reviewPanel }: {
  profile: IProfile; onSaved: (profile: IProfile) => void; onDeleted: () => void; onDirty: (dirty: boolean) => void;
  resourcePath?: string; documentLabel?: string;
  reviewPanel?: (controls: { dirty: boolean; busy: boolean; apply: (suggestion: EditSuggestion) => boolean; onPlanDirty: (value: boolean) => void; onReviewBusy: (value: boolean) => void; focusEvidence: () => void }) => ReactNode;
}) {
  const path = resourcePath ?? `/api/profile/${profile.profileId}`;
  const [draft, setDraft] = useState(() => content(profile));
  // Keep separators while typing instead of reparsing the field on every keystroke.
  const [skills, setSkills] = useState(profile.skills.join('\n'));
  const [skillEntries, setSkillEntries] = useState<SkillEntry[]>(() => structuredClone(profile.skillNormalization?.entries ?? []));
  const [requestBusy, setBusy] = useState(false);
  const [reviewBusy, setReviewBusy] = useState(false);
  const busy = requestBusy || reviewBusy;
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [pdf, setPdf] = useState('');
  const [conflict, setConflict] = useState(false);
  const [planDirty, setPlanDirty] = useState(false);
  const [panelEpoch, setPanelEpoch] = useState(0);
  const mounted = useRef(true);
  const errorMessage = useRef<HTMLParagraphElement>(null);
  const editorForm = useRef<HTMLFormElement>(null);
  const dirty = JSON.stringify(draft) !== JSON.stringify(content(profile)) || skills !== profile.skills.join('\n')
    || JSON.stringify(skillEntries) !== JSON.stringify(profile.skillNormalization?.entries ?? []);
  useEffect(() => { onDirty(dirty || planDirty); }, [dirty, planDirty, onDirty]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (dirty || planDirty) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty, planDirty]);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => () => { if (pdf) URL.revokeObjectURL(pdf); }, [pdf]);
  useEffect(() => { if (error) errorMessage.current?.focus(); }, [error]);

  function reset(next: IProfile, refreshPanel = true) {
    setDraft(content(next)); setSkills(next.skills.join('\n')); setSkillEntries(structuredClone(next.skillNormalization?.entries ?? [])); setConflict(false); setPdf('');
    if (refreshPanel) setPanelEpoch(x => x + 1);
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (planDirty && !window.confirm('Save the resume and discard unsaved job review edits? Save requirements and plans first to keep them.')) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const clean = { ...draft, skills: parseSkills(skills),
        projects: draft.projects.map(p => ({ ...p, techStack: p.techStack.map(x => x.trim()).filter(Boolean) })) };
      const skillReviews = skillEntries.filter(entry => {
        const saved = profile.skillNormalization?.entries.find(saved => saved.id === entry.id);
        return entry.choice !== 'pending' && (entry.choice !== saved?.choice || entry.value !== saved?.value);
      }).map(entry => ({ id: entry.id, choice: entry.choice, ...(entry.choice === 'custom' ? { value: entry.value } : {}) }));
      const response = await apiClient.put(path, { revision: profile.revision, content: clean, ...(skillReviews.length ? { skillReviews } : {}) });
      if (!mounted.current) return;
      const next: IProfile = response.data.data;
      reset(next); onSaved(next); setNotice('Saved. Your PDF will use these details.');
    } catch (error) {
      if (!mounted.current) return;
      setError(message(error, 'Unable to save. Your edits are still here.'));
      setConflict(isAxiosError(error) && error.response?.status === 409);
    } finally { if (mounted.current) setBusy(false); }
  }
  function chooseSkill(id: string, choice: SkillEntry['choice'], value: string) {
    const entry = skillEntries.find(entry => entry.id === id);
    if (!entry || busy) return;
    const values = parseSkills(skills);
    const shared = skillEntries.some(other => other.id !== id && other.value === entry.value);
    const next = shared ? values : values.filter(skill => skill !== entry.value);
    if (!next.includes(value)) next.push(value);
    setSkills(next.join('\n'));
    setSkillEntries(entries => entries.map(entry => entry.id === id ? { ...entry, choice, value } : entry));
    setPdf(''); setNotice('Skill wording added to your draft. Save changes when ready.');
  }
  async function reviewSkills() {
    if (dirty || planDirty || busy) return;
    if (profile.skillNormalization && !window.confirm('Refresh suggestions and replace previous skill review decisions? Your saved skill list will be kept.')) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const response = await apiClient.post(`${path}/skills/normalize`, { revision: profile.revision });
      if (!mounted.current) return;
      const next: IProfile = response.data.data;
      reset(next); onSaved(next); setNotice('Skill suggestions saved. Review each name before using it.');
    } catch (error) {
      if (!mounted.current) return;
      setError(message(error, 'Skill suggestions are unavailable. Your saved skills are unchanged.'));
      setConflict(isAxiosError(error) && error.response?.status === 409);
    } finally { if (mounted.current) setBusy(false); }
  }
  async function preview() {
    setBusy(true); setError(''); setNotice('');
    try {
      const response = await apiClient.get(`${path}/export`, { params: { revision: profile.revision }, responseType: 'blob' });
      if (mounted.current) setPdf(URL.createObjectURL(response.data));
    } catch (error) {
      if (mounted.current) {
        setError('Unable to generate this saved PDF. Reload if the resume changed in another session.');
        setConflict(isAxiosError(error) && error.response?.status === 409);
      }
    } finally { if (mounted.current) setBusy(false); }
  }
  async function reload() {
    if ((dirty || planDirty) && !window.confirm('Discard your unsaved resume and job review edits and load the latest saved resume?')) return;
    setBusy(true); setError('');
    try {
      const response = await apiClient.get(resourcePath ?? '/api/profile/me');
      if (!mounted.current) return;
      if (!response.data.data) { onDeleted(); return; }
      reset(response.data.data); onSaved(response.data.data); setNotice('Loaded the latest saved resume.');
    } catch (error) { if (mounted.current) setError(message(error, 'Unable to reload. Your edits are still here.')); }
    finally { if (mounted.current) setBusy(false); }
  }
  async function remove() {
    if (!window.confirm(resourcePath ? 'Permanently delete this job version? Your base resume will be kept.' : 'Permanently delete this base resume and all its job versions? Unsaved edits will also be lost.')) return;
    setBusy(true); setError('');
    try { await apiClient.delete(path); if (mounted.current) onDeleted(); }
    catch (error) { if (mounted.current) setError(message(error, 'Unable to delete your resume.')); }
    finally { if (mounted.current) setBusy(false); }
  }
  function personal(key: keyof Content['personalInfo'], value: string) {
    setDraft(d => ({ ...d, personalInfo: { ...d.personalInfo, [key]: value } }));
  }
  function update<T extends 'experiences' | 'education' | 'projects'>(section: T, index: number, key: keyof Content[T][number], value: string | string[]) {
    setDraft(d => ({ ...d, [section]: d[section].map((item, i) => i === index ? { ...item, [key]: value } : item) }));
  }
  function removeItem(section: 'experiences' | 'education' | 'projects', index: number) {
    setDraft(d => ({ ...d, [section]: d[section].filter((_, i) => i !== index) }));
  }
  function apply(suggestion: EditSuggestion): boolean {
    if (busy) return false;
    const match = /^(experience|project):(\d+)$/.exec(suggestion.sourceId);
    const current = suggestion.sourceId === 'summary' ? draft.personalInfo.summary : match?.[1] === 'experience' ? draft.experiences[Number(match[2])]?.description : match?.[1] === 'project' ? draft.projects[Number(match[2])]?.description : undefined;
    const item = match?.[1] === 'experience' ? draft.experiences[Number(match[2])] : undefined;
    const currentLabel = suggestion.sourceId === 'summary' ? 'Summary' : item && match ? `Experience ${Number(match[2]) + 1}: ${item.title} at ${item.company}` : match?.[1] === 'project' ? `Project ${Number(match[2]) + 1}: ${draft.projects[Number(match[2])]?.title}` : undefined;
    if (current !== suggestion.original || currentLabel !== suggestion.sourceLabel) { setError('This section has changed since the suggestion was created. Save and review again before applying it.'); return false; }
    if (suggestion.sourceId === 'summary') personal('summary', suggestion.proposed);
    else if (match) update(match[1] === 'experience' ? 'experiences' : 'projects', Number(match[2]), 'description', suggestion.proposed);
    else return false;
    setPdf(''); setError(''); setNotice('Suggestion added to your draft. Check the wording and save when ready.');
    const target = Array.from(editorForm.current?.querySelectorAll<HTMLTextAreaElement>('[data-source-id]') ?? []).find(x => x.dataset.sourceId === suggestion.sourceId);
    if (target) requestAnimationFrame(() => { if (target.isConnected) { target.scrollIntoView({ block: 'center' }); target.focus({ preventScroll: true }); } });
    return true;
  }

  return <>
    <div className="workspace-heading"><div><p className="eyebrow">YOUR WORKSPACE</p><h1>A resume that sounds like you.</h1><p>Edit the details. Keep the facts. Save a document you can stand behind.</p></div><span className="save-state" role="status">{dirty ? 'Unsaved changes' : planDirty ? 'Unsaved job review edits' : 'All changes saved'}</span></div>
    <div className="editor-layout">
      <form onSubmit={save} className="editor-form" ref={editorForm}>
        <div className="document-toolbar"><strong>{documentLabel}</strong><div className="actions"><button type="button" disabled={busy || !dirty} onClick={() => { if (window.confirm('Discard your unsaved resume changes? Job review edits will be kept.')) { reset(profile, false); setError(''); setNotice(''); } }}>Discard edits</button><button className="primary" disabled={busy || !dirty || conflict}>{busy ? 'Working…' : 'Save changes'}</button></div></div>
        {error && <p className="error" role="alert" tabIndex={-1} ref={errorMessage}>{error}</p>}
        {conflict && <button type="button" disabled={busy} onClick={() => void reload()}>Reload saved resume</button>}
        {notice && <p className="notice" role="status">{notice}</p>}
        <fieldset disabled={busy}>
          <section className="editor-section"><p className="section-number">01 / INTRODUCTION</p><h2>The essentials</h2>
            <div className="field-grid"><Field title="Full name" value={draft.personalInfo.fullName} onChange={v => personal('fullName', v)} required /><Field title="Location" value={draft.personalInfo.location} onChange={v => personal('location', v)} /><Field title="Email" type="email" value={draft.personalInfo.email} onChange={v => personal('email', v)} /><Field title="Phone" value={draft.personalInfo.phone} onChange={v => personal('phone', v)} /></div>
            <Field title="LinkedIn URL" type="url" maxLength={1000} value={draft.personalInfo.linkedIn} onChange={v => personal('linkedIn', v)} />
            <Field title="Summary" sourceId="summary" maxLength={5000} multiline value={draft.personalInfo.summary} onChange={v => personal('summary', v)} />
          </section>
          <section className="editor-section"><p className="section-number">02 / TOOLKIT</p><h2>Skills</h2><p className="hint">One skill per line. Include skills you can discuss and demonstrate.</p><Field title="Your skills" maxLength={15150} multiline value={skills} onChange={setSkills} />
            <SkillReview snapshot={profile.skillNormalization} entries={skillEntries} skills={parseSkills(skills)} blocked={busy || dirty || planDirty || conflict} onReview={() => void reviewSkills()} onChoose={chooseSkill} />
          </section>
          <section className="editor-section"><p className="section-number">03 / EXPERIENCE</p><h2>Where you made a contribution</h2>
            {draft.experiences.map((item, i) => <article className="entry" key={i}><div className="entry-heading"><h3>Experience {i + 1}</h3><button type="button" onClick={() => removeItem('experiences', i)}>Remove experience {i + 1}</button></div>
              <div className="field-grid">{(['title', 'company', 'location', 'startDate', 'endDate'] as const).map(key => <Field key={key} title={{ title: 'Role', company: 'Company', location: 'Location', startDate: 'Start date', endDate: 'End date or Present' }[key]} required={key === 'title' || key === 'company'} value={item[key]} maxLength={key.includes('Date') ? 100 : 300} onChange={v => update('experiences', i, key, v)} />)}</div>
              <Field title="Contribution and outcomes" sourceId={`experience:${i}`} maxLength={10000} multiline value={item.description} onChange={v => update('experiences', i, 'description', v)} /></article>)}
            <button type="button" disabled={draft.experiences.length >= 30} onClick={() => setDraft(d => ({ ...d, experiences: [...d.experiences, { title: '', company: '' }] }))}>+ Add experience</button>
          </section>
          <section className="editor-section"><p className="section-number">04 / PROJECTS</p><h2>What you have built</h2>
            {draft.projects.map((item, i) => <article className="entry" key={i}><div className="entry-heading"><h3>Project {i + 1}</h3><button type="button" onClick={() => removeItem('projects', i)}>Remove project {i + 1}</button></div>
              <Field title="Project name" required value={item.title} onChange={v => update('projects', i, 'title', v)} /><Field title="Project URL" type="url" maxLength={1000} value={item.link} onChange={v => update('projects', i, 'link', v)} />
              <Field title="Technologies · one per line" multiline maxLength={5000} value={item.techStack.join('\n')} onChange={v => update('projects', i, 'techStack', v.split('\n'))} />
              <Field title="What you built and your contribution" sourceId={`project:${i}`} maxLength={10000} multiline value={item.description} onChange={v => update('projects', i, 'description', v)} /></article>)}
            <button type="button" data-add-project disabled={draft.projects.length >= 30} onClick={() => setDraft(d => ({ ...d, projects: [...d.projects, { title: '', techStack: [] }] }))}>+ Add project</button>
          </section>
          <section className="editor-section"><p className="section-number">05 / EDUCATION</p><h2>Your education</h2>
            {draft.education.map((item, i) => <article className="entry" key={i}><div className="entry-heading"><h3>Education {i + 1}</h3><button type="button" onClick={() => removeItem('education', i)}>Remove education {i + 1}</button></div><div className="field-grid">
              {(['institution', 'degree', 'field', 'startDate', 'endDate', 'gpa'] as const).map(key => <Field key={key} title={{ institution: 'Institution', degree: 'Degree', field: 'Field of study', startDate: 'Start date', endDate: 'End date', gpa: 'Grade or GPA' }[key]} required={key === 'institution' || key === 'degree'} maxLength={['startDate', 'endDate', 'gpa'].includes(key) ? 100 : 300} value={item[key]} onChange={v => update('education', i, key, v)} />)}</div></article>)}
            <button type="button" disabled={draft.education.length >= 20} onClick={() => setDraft(d => ({ ...d, education: [...d.education, { institution: '', degree: '' }] }))}>+ Add education</button>
          </section>
        </fieldset>
        <div className="document-toolbar"><p className="hint">* Required fields. Save before previewing or downloading.</p><button className="primary" disabled={busy || !dirty || conflict}>Save changes</button></div>
      </form>
      <aside className="document-aside"><Fragment key={panelEpoch}>{reviewPanel?.({ dirty, busy: requestBusy, apply, onPlanDirty: setPlanDirty, onReviewBusy: setReviewBusy, focusEvidence: () => {
        const target = editorForm.current?.querySelector<HTMLElement>('[data-source-id^="project:"], [data-add-project]');
        target?.scrollIntoView({ block: 'center' }); target?.focus({ preventScroll: true });
      } })}</Fragment><div className="preview-card"><p className="eyebrow">THE DOCUMENT</p><h2>Ready when you are.</h2><p>Your PDF is generated from the saved resume, using a clean A4 layout.</p><button className="primary" disabled={busy || dirty} onClick={() => void preview()}>{pdf && !dirty ? 'Refresh PDF preview' : 'Preview saved PDF'}</button>
        {dirty && <p className="hint">Save your changes to update the PDF.</p>}
        {pdf && !dirty && <><a className="download-link" href={pdf} download={resourcePath ? 'tailored-resume.pdf' : 'resume.pdf'}>Download this PDF ↓</a><iframe title="Saved resume PDF" src={pdf} /></>}
        <p className="hint">The preview and download use the same PDF. Importing a PDF does not preserve its original design.</p></div>
        <div className="editor-note"><h3>Make every line useful.</h3><p>Describe what you did, how you did it, and the result. Add numbers only when you know they are accurate.</p></div>
        <button className="danger-link" disabled={busy} onClick={() => void remove()}>{resourcePath ? 'Delete job version' : 'Delete saved resume'}</button>
      </aside>
    </div>
  </>;
}
