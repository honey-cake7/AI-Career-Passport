import { useId, useState } from 'react';
import type { SkillEntry, SkillNormalization } from '../types';

function SkillRow({ entry, listed, choose }: {
  entry: SkillEntry; listed: boolean; choose: (choice: SkillEntry['choice'], value: string) => void;
}) {
  const id = useId();
  const [custom, setCustom] = useState(entry.choice === 'custom' ? entry.value : entry.raw);
  return <li className="skill-review-row">
    <div><strong>{entry.raw}</strong><p className="hint">{entry.suggestion
      ? <>Suggested name: <strong>{entry.suggestion}</strong> · {entry.method === 'exact' ? 'Same name in the taxonomy' : 'Model-selected taxonomy candidate'}</>
      : 'No taxonomy suggestion. Review the original name or enter your own wording.'}</p>
      <p className="hint">{entry.choice === 'pending' ? 'Awaiting your review' : `Your choice: ${entry.value}`}{!listed && ' · This wording is no longer in your skills.'}</p></div>
    <div className="actions"><button type="button" onClick={() => choose('original', entry.raw)}>Keep original</button>
      {entry.suggestion && <button type="button" onClick={() => choose('suggested', entry.suggestion!)}>Use suggested name</button>}</div>
    <details><summary>Use different wording</summary><div className="resume-field"><label htmlFor={id}>Your wording for {entry.raw}</label><input id={id} value={custom} maxLength={100} onChange={event => setCustom(event.target.value)} /></div>
      <button type="button" disabled={!custom.trim()} onClick={() => choose('custom', custom.trim())}>Use this wording</button></details>
  </li>;
}

export function SkillReview({ snapshot, entries, skills, blocked, onReview, onChoose }: {
  snapshot?: SkillNormalization; entries: SkillEntry[]; skills: string[]; blocked: boolean;
  onReview: () => void; onChoose: (id: string, choice: SkillEntry['choice'], value: string) => void;
}) {
  const pending = entries.filter(entry => entry.choice === 'pending').length;
  return <div className="skill-review">
    <h3>Review skill names</h3><p>Check suggested wording before using it. A taxonomy match describes a name; it does not verify your experience or proficiency.</p>
    {snapshot?.status === 'unavailable' && <p role="status" className="notice">Suggestions were unavailable. All original skills were kept. You can edit them here or try again after saving.</p>}
    <button type="button" disabled={blocked || !skills.length} onClick={onReview}>{snapshot ? 'Refresh skill suggestions' : 'Review saved skill names'}</button>
    <p className="hint">Save resume and job review edits first. This sends saved skill names to the normalization service, including the AI provider. Refreshing replaces earlier review decisions; it keeps your saved skill list.</p>
    {snapshot && <details className="skill-review-list"><summary>{entries.length} skill names · {pending} awaiting review</summary>
      <ul>{entries.map(entry => <SkillRow key={`${snapshot.generatedAt}:${entry.id}`} entry={entry} listed={skills.includes(entry.value)} choose={(choice, value) => onChoose(entry.id, choice, value)} />)}</ul>
    </details>}
    {entries.length > 0 && <p className="hint">Choices change your draft. Save changes to keep them and update the PDF. Skills you add manually are kept too.</p>}
  </div>;
}
