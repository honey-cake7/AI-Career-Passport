import { Types } from 'mongoose';
import type { JobReview } from '../services/jobReview.js';
import type { GapPlan } from '../services/gapPlans.js';
import { ResumeInputError } from '../validation/resume.js';
import type { Response } from 'express';
import type { SkillNormalization } from '../services/skillReview.js';

export const versionOwner = (res: Response) => ({ _id: res.locals.profile._id, userId: res.locals.userId });
export const plansCounter = (value = 0) => value === 0 ? { $or: [{ plansRevision: 0 }, { plansRevision: { $exists: false } }] } : { plansRevision: value };
export const versionProjection = (id: Types.ObjectId) => ({ versions: { $elemMatch: { _id: id } } });
export function parseRevision(value: unknown) {
  if (!Number.isSafeInteger(value) || (value as number) < 0) throw new ResumeInputError('Revision must be a non-negative integer');
  return value as number;
}
export function fitsVersionBudget(content: unknown, jobDescription: string, analysis?: JobReview, gapPlans?: GapPlan[], skillNormalization?: SkillNormalization) {
  // 20 × 500 KiB JSON leaves BSON and base-document headroom below 16 MiB.
  return Buffer.byteLength(JSON.stringify({ content, jobDescription, analysis, gapPlans, skillNormalization }), 'utf8') <= 500 * 1024;
}
