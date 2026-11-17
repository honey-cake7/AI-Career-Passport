import { Router } from 'express';
import { Profile, type IResumeVersion } from '../models/Profile.js';
import { inputObject, inputText, ResumeInputError } from '../validation/resume.js';
import { compareRequirements, resumeSources } from '../services/jobReview.js';
import type { WordingProvider } from '../services/wording.js';
import { WordingError } from '../services/wordingError.js';
import { analysisCounter, parseRevision, versionOwner } from './versionSupport.js';

export const wordingProvider: WordingProvider = async context => {
  if (!process.env.GROQ_API_KEY?.trim()) throw new WordingError('authentication');
  return (await import('../services/wordingProvider.js')).suggestWording(context);
};
export function createWordingRouter(provider: WordingProvider, reviewing: Set<string>) {
  const router = Router({ mergeParams: true });
  router.post('/', async (req, res) => {
    const body = inputObject(req.body, ['revision', 'reviewedAt', 'sourceId', 'requirementId', 'consent'], 'Wording request');
    const expected = parseRevision(body.revision);
    const sourceId = inputText(body.sourceId, 'Source', true, 100);
    const requirementId = inputText(body.requirementId, 'Requirement', true, 100);
    const reviewedAt = inputText(body.reviewedAt, 'Review timestamp', true, 100);
    if (body.consent !== true) throw new ResumeInputError('Confirm sending the selected section and job quote to the AI provider');
    const v: IResumeVersion = res.locals.version;
    if (v.revision !== expected || v.analysis?.revision !== expected || v.analysis.generatedAt !== reviewedAt) {
      res.status(409).json({ success: false, error: 'The saved resume or review changed. Reload before requesting wording.' }); return;
    }
    const source = resumeSources(v.content).find(s => s.id === sourceId && s.id !== 'summary');
    const definition = v.analysis.requirements.find(r => r.id === requirementId && !r.excluded && r.kind === 'skill');
    const requirement = definition && compareRequirements([definition], v.content)[0];
    if (!source || source.text.length > 4000 || !requirement || requirement.status !== 'work_mention' || !requirement.evidence.some(e => e.id === sourceId)) throw new ResumeInputError('Choose an existing work section mentioning an included skill. Sections must be at most 4,000 characters. Add missing facts yourself before requesting wording.');
    const userId: string = res.locals.userId;
    if (reviewing.has(userId)) { res.status(429).json({ success: false, error: 'A job review or wording request is already running. Wait for it to finish.' }); return; }
    reviewing.add(userId);
    try {
      const result = await provider({ source, requirement });
      // Read-only proposals must also be discarded after deletion/concurrent edits.
      const current = await Profile.exists({ ...versionOwner(res), versions: { $elemMatch: { _id: v._id, revision: expected, ...analysisCounter(v.analysis) } } });
      if (!current) { res.status(409).json({ success: false, error: 'The saved resume or review changed during the request. Discarded the stale suggestion; reload before trying again.' }); return; }
      res.json({ success: true, data: { ...result, revision: expected, reviewedAt, generatedAt: new Date().toISOString(),
        requirement: { id: requirement.id, label: requirement.label, quote: requirement.quote } } });
    } finally { reviewing.delete(userId); }
  });
  return router;
}
