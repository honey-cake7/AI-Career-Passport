import { Types } from 'mongoose';
import type { JobReview } from '../services/jobReview.js';
import type { GapPlan } from '../services/gapPlans.js';
import { ResumeInputError } from '../validation/resume.js';
import type { Response } from 'express';
import type { SkillNormalization } from '../services/skillReview.js';
import type { IResumeVersion } from '../models/Profile.js';
import { withCoverage } from '../services/jobCoverage.js';

export function versionData(version: IResumeVersion) {
  return { profileId: version._id, revision: version.revision, ...version.content,
    label: version.label, jobDescription: version.jobDescription, baseRevision: version.baseRevision,
    createdAt: version.createdAt, skillNormalization: version.skillNormalization,
    analysis: version.analysis ? withCoverage(version.analysis) : null, gapPlans: version.gapPlans ?? [], plansRevision: version.plansRevision ?? 0 };
}

export const versionOwner = (res: Response) => ({ _id: res.locals.profile._id, userId: res.locals.userId });
export const plansCounter = (value = 0) => value === 0 ? { $or: [{ plansRevision: 0 }, { plansRevision: { $exists: false } }] } : { plansRevision: value };
export const versionProjection = (id: Types.ObjectId) => ({ versions: { $elemMatch: { _id: id } } });
export const analysisCounter = (analysis?: JobReview) => analysis
  ? { 'analysis.generatedAt': analysis.generatedAt } : { analysis: { $exists: false } };
export function parseRevision(value: unknown) {
  if (!Number.isSafeInteger(value) || (value as number) < 0) throw new ResumeInputError('Revision must be a non-negative integer');
  return value as number;
}
export function fitsVersionBudget(content: unknown, jobDescription: string, analysis?: JobReview, gapPlans?: GapPlan[], skillNormalization?: SkillNormalization) {
  // 20 × 500 KiB JSON leaves BSON and base-document headroom below 16 MiB.
  return Buffer.byteLength(JSON.stringify({ content, jobDescription, analysis, gapPlans, skillNormalization }), 'utf8') <= 500 * 1024;
}
