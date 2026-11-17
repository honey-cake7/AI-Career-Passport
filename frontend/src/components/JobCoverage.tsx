import type { JobCoverage as Coverage } from '../types';

export function JobCoverage({ coverage, dirty }: { coverage: Coverage; dirty: boolean }) {
  return <section className="coverage-panel" aria-label="Resume coverage"><h3>Resume coverage</h3>
    <p className="hint">Counts reflect saved resume wording against the selected requirements. They do not measure proficiency or hiring probability.</p>
    {dirty && <p className="notice">Showing the saved version. Save your edits to recalculate.</p>}
    <div className="coverage-groups">{(['required', 'preferred', 'unspecified'] as const).map(priority => {
      const group = coverage.groups[priority];
      const title = priority === 'unspecified' ? 'Unspecified priority' : priority === 'required' ? 'Required' : 'Preferred';
      if (priority !== 'required' && !group.assessed && !group.unassessed && !group.excluded && !group.duplicates) return <article className="coverage-group" key={priority} aria-label={`${priority} coverage`}><h4>{title}</h4><p className="hint">No requirements assigned.</p></article>;
      return <article className="coverage-group" key={priority} aria-label={`${priority} coverage`}><h4>{title}</h4>
        <p className="coverage-value">{group.workPercent === null ? 'Not available' : `${group.workPercent}%`}</p>
        <p>{group.workMentions} of {group.assessed} assessed {group.assessed === 1 ? 'skill' : 'skills'} mentioned in work</p>
        <dl><div><dt>Listed without a work example</dt><dd>{group.listedOnly}</dd></div><div><dt>No mention found</dt><dd>{group.notFound}</dd></div>
          <div><dt>Cannot assess · outside percentage</dt><dd>{group.unassessed}</dd></div><div><dt>Excluded by you</dt><dd>{group.excluded}</dd></div><div><dt>Repeated skill names · counted elsewhere</dt><dd>{group.duplicates}</dd></div></dl>
      </article>;
    })}</div>
    <details><summary>How these percentages work</summary><p>Work mentions ÷ distinct assessable skills × 100, rounded to the nearest whole percent. Listed-only claims count in the denominator, but not the numerator. Context and uncertain statements stay outside the percentage. A zero denominator has no percentage.</p>
      <p>Known aliases count once, under their strongest included priority: required, then preferred, then unspecified. Excluded rows stay visible. These are counts of selected requirements, not a claim that every requirement in the job was captured.</p></details>
  </section>;
}
