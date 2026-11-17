import { Router, type Response } from 'express';
import { Profile, type IResumeVersion } from '../models/Profile.js';
import { inputObject, ResumeInputError } from '../validation/resume.js';
import { createGapPlan, editGapPlan, assessPlan, requirementKey, type GapPlan } from '../services/gapPlans.js';
import { coverageFor } from '../services/jobCoverage.js';
import { fitsVersionBudget, parseRevision, plansCounter, versionOwner, versionProjection } from './versionSupport.js';

export function createGapPlanRouter() {
  const router = Router({ mergeParams: true });
  router.get('/', (_req, res) => {
    const v: IResumeVersion = res.locals.version;
    res.json({ success: true, data: { gapPlans: v.gapPlans ?? [], plansRevision: v.plansRevision ?? 0, revision: v.revision } });
  });
  router.use(async (req, res, next) => {
    const allowed = req.method === 'POST' && !req.path.endsWith('/reassess') ? ['revision', 'plansRevision', 'requirementId', 'confirmation'] : req.method === 'PUT' ? ['revision', 'plansRevision', 'plan'] : ['revision', 'plansRevision'];
    const body = inputObject(req.body, allowed, 'Plan request');
    const v: IResumeVersion = res.locals.version;
    const expected = parseRevision(body.revision);
    const plansRevision = parseRevision(body.plansRevision);
    if (expected !== v.revision || plansRevision !== (v.plansRevision ?? 0)) {
      res.status(409).json({ success: false, error: 'The resume or its plans changed. Reload before saving; your current notes have not been saved.' }); return;
    }
    res.locals.planInput = body;
    next();
  });
  async function persist(res: Response, plans: GapPlan[]) {
    const v: IResumeVersion = res.locals.version;
    if (!fitsVersionBudget(v.content, v.jobDescription, v.analysis, plans, v.skillNormalization)) throw new ResumeInputError('This version is too large. Shorten notes or remove an unused plan.');
    // A review may arrive while this request is being validated. Guard that snapshot
    // too, so concurrent metadata writes cannot bypass the combined storage budget.
    const analysis = v.analysis ? { 'analysis.generatedAt': v.analysis.generatedAt } : { analysis: { $exists: false } };
    const updated = await Profile.findOneAndUpdate({ ...versionOwner(res), versions: { $elemMatch: { _id: v._id, revision: v.revision, ...plansCounter(v.plansRevision), ...analysis } } },
      { $set: { 'versions.$.gapPlans': plans }, $inc: { 'versions.$.plansRevision': 1 } },
      { returnDocument: 'after', runValidators: true, projection: versionProjection(v._id) });
    if (!updated?.versions?.[0]) { res.status(409).json({ success: false, error: 'The resume or its plans changed. Reload before saving; your current notes have not been saved.' }); return; }
    const saved = updated.toObject().versions![0]!;
    res.json({ success: true, data: { gapPlans: saved.gapPlans ?? [], plansRevision: saved.plansRevision ?? 0, revision: saved.revision } });
  }
  router.post('/', async (_req, res) => {
    const v: IResumeVersion = res.locals.version;
    const body = res.locals.planInput;
    if (!v.analysis || v.analysis.revision !== v.revision) { res.status(409).json({ success: false, error: 'Review the current saved resume before choosing a requirement to plan.' }); return; }
    const requirement = v.analysis.requirements.find(r => r.id === body.requirementId);
    if (!requirement) throw new ResumeInputError('Choose a requirement from the current review.');
    if (requirement.excluded || coverageFor(v.analysis.requirements).duplicates.some(r => r.id === requirement.id)) throw new ResumeInputError('Choose an included requirement that is counted separately.');
    const plans = v.gapPlans ?? [];
    if (plans.length >= 20) throw new ResumeInputError('A job version can have at most 20 plans.');
    if (plans.some(p => p.requirementKey === requirementKey(requirement))) { res.status(409).json({ success: false, error: 'A plan for this requirement already exists. Open that plan instead.' }); return; }
    await persist(res, [...plans, createGapPlan(requirement, body.confirmation, v.content, v.revision)]);
  });
  router.param('planId', (_req, res, next, id: string) => {
    const v: IResumeVersion = res.locals.version;
    if (!/^[a-f0-9]{24}$/.test(id) || !(v.gapPlans ?? []).some(p => p.id === id)) { res.status(404).json({ success: false, error: 'Plan not found' }); return; }
    next();
  });
  router.put('/:planId', async (req, res) => {
    const v: IResumeVersion = res.locals.version;
    await persist(res, (v.gapPlans ?? []).map(p => p.id === req.params.planId ? editGapPlan(p, res.locals.planInput.plan) : p));
  });
  router.post('/:planId/reassess', async (req, res) => {
    const v: IResumeVersion = res.locals.version;
    await persist(res, (v.gapPlans ?? []).map(p => p.id === req.params.planId ? { ...p, assessment: assessPlan(p.requirement, v.content, v.revision), updatedAt: new Date().toISOString() } : p));
  });
  router.delete('/:planId', async (req, res) => {
    const v: IResumeVersion = res.locals.version;
    await persist(res, (v.gapPlans ?? []).filter(p => p.id !== req.params.planId));
  });
  return router;
}
