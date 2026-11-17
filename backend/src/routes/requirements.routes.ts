import { Router } from 'express';
import type { IResumeVersion } from '../models/Profile.js';
import { Profile } from '../models/Profile.js';
import { editRequirements, reassessReview } from '../services/jobCoverage.js';
import { inputObject, ResumeInputError } from '../validation/resume.js';
import { analysisCounter, fitsVersionBudget, parseRevision, plansCounter, versionOwner, versionProjection, versionData } from './versionSupport.js';

export function createRequirementsRouter() {
  const router = Router({ mergeParams: true });
  router.put('/', async (req, res) => {
    const body = inputObject(req.body, ['revision', 'reviewedAt', 'requirements'], 'Requirements request');
    const expected = parseRevision(body.revision);
    if (body.reviewedAt !== null && (typeof body.reviewedAt !== 'string' || body.reviewedAt.length > 100)) throw new ResumeInputError('Supply the saved review timestamp, or null for a manual first review');
    const v: IResumeVersion = res.locals.version;
    if (expected !== v.revision || body.reviewedAt !== (v.analysis?.generatedAt ?? null)) {
      res.status(409).json({ success: false, error: 'This version or its review changed. Your requirement edits are still here; reload before saving.' }); return;
    }
    const requirements = editRequirements(body.requirements, v.analysis?.requirements ?? [], v.jobDescription);
    const analysis = reassessReview(v.analysis, requirements, v.content, expected + 1);
    if (!fitsVersionBudget(v.content, v.jobDescription, analysis, v.gapPlans, v.skillNormalization)) throw new ResumeInputError('This job version is too large. Shorten requirement labels or plan notes.');
    const profile = await Profile.findOneAndUpdate({ ...versionOwner(res), versions: { $elemMatch: {
      _id: v._id, revision: expected, ...plansCounter(v.plansRevision), ...analysisCounter(v.analysis),
    } } }, { $set: { 'versions.$.analysis': analysis }, $inc: { 'versions.$.revision': 1 } },
    { returnDocument: 'after', runValidators: true, projection: versionProjection(v._id) });
    if (!profile?.versions?.[0]) { res.status(409).json({ success: false, error: 'This version, its review or plans changed. Your requirement edits are still here; reload before saving.' }); return; }
    res.json({ success: true, data: versionData(profile.toObject().versions![0]!) });
  });
  return router;
}
