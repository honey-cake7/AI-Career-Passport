import { Router } from 'express';
import { Types } from 'mongoose';
import { Profile, type IProfile, type IResumeVersion } from '../models/Profile.js';
import { inputObject, inputText, parseResumeContent, parseResumeSave, ResumeInputError } from '../validation/resume.js';
import { rateLimit } from '../security/rateLimit.js';
import type { JobReview } from '../services/jobReview.js';
import { JobReviewError } from '../services/jobReviewError.js';
import { fitsVersionBudget, plansCounter, parseRevision as revision, versionOwner as owner, versionProjection as projection } from './versionSupport.js';
import { createGapPlanRouter } from './gapPlan.routes.js';

const defaults = {
  review: async (...args: Parameters<typeof import('../services/jobReviewProvider.js').reviewJob>) => {
    if (!process.env.GROQ_API_KEY?.trim()) throw new JobReviewError('authentication');
    return (await import('../services/jobReviewProvider.js')).reviewJob(...args);
  },
};
export function versionData(version: IResumeVersion) {
  return { profileId: version._id, revision: version.revision, ...version.content,
    label: version.label, jobDescription: version.jobDescription, baseRevision: version.baseRevision,
    createdAt: version.createdAt, analysis: version.analysis ?? null, gapPlans: version.gapPlans ?? [], plansRevision: version.plansRevision ?? 0 };
}
function baseContent(profile: IProfile) {
  const plain = profile.toObject();
  return parseResumeContent({ personalInfo: plain.personalInfo, experiences: plain.experiences,
    education: plain.education, projects: plain.projects, skills: plain.skills });
}

export function createVersionRouter(deps = defaults) {
  const router = Router({ mergeParams: true });
  const aiLimit = rateLimit(10, 15 * 60 * 1000);
  // Per-process admission prevents multiple paid reviews for one account at once.
  const reviewing = new Set<string>();

  router.get('/', async (_req, res) => {
    const profile = await Profile.findOne(owner(res), { versions: 1 });
    res.json({ success: true, data: (profile?.versions ?? []).map(v => ({ profileId: v._id, label: v.label, revision: v.revision, baseRevision: v.baseRevision, createdAt: v.createdAt })) });
  });
  router.post('/', async (req, res) => {
    const body = inputObject(req.body, ['label', 'jobDescription', 'revision'], 'Version');
    const label = inputText(body.label, 'Version name', true, 120);
    const jobDescription = inputText(body.jobDescription, 'Job description', true, 20000);
    const expected = revision(body.revision);
    const base: IProfile = res.locals.profile;
    if ((base.revision ?? 0) !== expected) { res.status(409).json({ success: false, error: 'The base resume changed. Reload it before creating a version.' }); return; }
    const id = new Types.ObjectId();
    const version = { _id: id, label, jobDescription, content: baseContent(base), baseRevision: expected, revision: 0, createdAt: new Date() };
    if (!fitsVersionBudget(version.content, jobDescription)) throw new ResumeInputError('This job version is too large. Shorten the resume or job description.');
    const filter = expected === 0 ? { $or: [{ revision: 0 }, { revision: { $exists: false } }] } : { revision: expected };
    const updated = await Profile.findOneAndUpdate({ ...owner(res), ...filter,
      $expr: { $lt: [{ $size: { $ifNull: ['$versions', []] } }, 20] } },
    { $push: { versions: version } }, { returnDocument: 'after', runValidators: true, projection: projection(id) });
    if (!updated?.versions?.[0]) { res.status(409).json({ success: false, error: 'The base changed or 20 versions already exist. Reload or delete an unused version.' }); return; }
    res.status(201).json({ success: true, data: versionData(updated.toObject().versions![0]!) });
  });
  router.param('versionId', async (_req, res, next, id: string) => {
    if (!/^[a-f0-9]{24}$/i.test(id)) { res.status(400).json({ success: false, error: 'Invalid version ID' }); return; }
    const profile = await Profile.findOne({ ...owner(res), 'versions._id': id }, projection(new Types.ObjectId(id)));
    const version = profile?.versions?.[0];
    if (!version) { res.status(404).json({ success: false, error: 'Version not found' }); return; }
    // Convert nested Mongoose documents to plain content before DTO spreads/validation.
    res.locals.version = (profile!.toObject().versions![0]);
    next();
  });
  router.get('/:versionId', (_req, res) => { res.json({ success: true, data: versionData(res.locals.version) }); });
  router.use('/:versionId/plans', createGapPlanRouter());
  router.put('/:versionId', async (req, res) => {
    const input = parseResumeSave(req.body);
    const v: IResumeVersion = res.locals.version;
    if (!fitsVersionBudget(input.content, v.jobDescription, undefined, v.gapPlans)) throw new ResumeInputError('This job version is too large. Shorten the resume content or plan notes.');
    const profile = await Profile.findOneAndUpdate({ ...owner(res), versions: { $elemMatch: { _id: v._id, revision: input.revision, ...plansCounter(v.plansRevision) } } },
      { $set: { 'versions.$.content': input.content }, $inc: { 'versions.$.revision': 1 }, $unset: { 'versions.$.analysis': 1 } },
      { returnDocument: 'after', runValidators: true, projection: projection(v._id) });
    if (!profile?.versions?.[0]) { res.status(409).json({ success: false, error: 'This job version changed. Your edits are still here; reload the saved version.' }); return; }
    res.json({ success: true, data: versionData(profile.toObject().versions![0]!) });
  });
  router.post('/:versionId/review', aiLimit, async (req, res) => {
    const body = inputObject(req.body, ['revision'], 'Review');
    const expected = revision(body.revision);
    const v: IResumeVersion = res.locals.version;
    if (v.revision !== expected) { res.status(409).json({ success: false, error: 'This job version changed. Reload before reviewing.' }); return; }
    if (v.analysis?.revision === expected && v.analysis.schemaVersion === 1) { res.json({ success: true, data: v.analysis }); return; }
    const userId: string = res.locals.userId;
    if (reviewing.has(userId)) { res.status(429).json({ success: false, error: 'A job review is already running. Wait for it to finish.' }); return; }
    reviewing.add(userId);
    try {
      const result: JobReview = await deps.review(v.content, v.jobDescription, expected);
      if (!fitsVersionBudget(v.content, v.jobDescription, result, v.gapPlans)) throw new JobReviewError('invalid_output');
      const saved = await Profile.updateOne({ ...owner(res), versions: { $elemMatch: { _id: v._id, revision: expected, ...plansCounter(v.plansRevision) } } },
        { $set: { 'versions.$.analysis': result } });
      if (!saved.matchedCount) { res.status(409).json({ success: false, error: 'The resume or plans changed during analysis. Discarded the stale review; reload and try again.' }); return; }
      res.json({ success: true, data: result });
    } finally { reviewing.delete(userId); }
  });
  router.get('/:versionId/export', async (req, res) => {
    const v: IResumeVersion = res.locals.version;
    if (req.query.revision !== String(v.revision)) { res.status(409).json({ success: false, error: 'Reload this job version before exporting.' }); return; }
    const buffer = await (await import('../services/pdfGenerator.service.js')).generateProfilePdf(v.content);
    res.setHeader('Content-Disposition', 'attachment; filename="tailored-resume.pdf"'); res.type('pdf').send(buffer);
  });
  router.delete('/:versionId', async (_req, res) => {
    await Profile.updateOne(owner(res), { $pull: { versions: { _id: res.locals.version._id } } });
    res.sendStatus(204);
  });
  return router;
}
