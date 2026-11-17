import { Router } from 'express';
import multer from 'multer';
import { Profile, type IProfile } from '../models/Profile.js';
import { requireAuth } from '../security/auth.js';
import { rateLimit } from '../security/rateLimit.js';
import type { ExtractedProfile } from '../services/profileExtractor.service.js';
import { parseResumeContent, parseResumeSave, ResumeInputError } from '../validation/resume.js';
import { createVersionRouter } from './version.routes.js';
import { withActiveAccount } from '../security/accountAccess.js';

// Lazy loading keeps authentication independent of AI keys and native models.
const services = {
  parse: async (buffer: Buffer) => (await import('../services/pdfParser.service.js')).extractTextFromPdf(buffer),
  extract: async (text: string) => (await import('../services/profileExtractor.service.js')).extractProfileFromText(text),
  normalize: async (text: string) => (await import('../services/skillNormalizer.service.js')).normalizeSkillsFromResume(text),
  pdf: async (profile: IProfile) => (await import('../services/pdfGenerator.service.js')).generateProfilePdf(profile),
};

export function profileData(profile: IProfile) {
  return {
    profileId: profile._id, revision: profile.revision ?? 0, personalInfo: profile.personalInfo,
    experiences: profile.experiences, education: profile.education,
    projects: profile.projects, skills: profile.skills,
  };
}

export function profileUpdate(extracted: ExtractedProfile, skills: string[]) {
  return {
    personalInfo: extracted.personalInfo, experiences: extracted.experiences,
    education: extracted.education, projects: extracted.projects, skills,
  };
}

export function createProfileRouter(deps = services, versionRouter = createVersionRouter()) {
  const router = Router();
  // Existing slugs were published without consent. Never grant them public access.
  router.get('/public/:slug', (_req, res) => {
    res.status(404).json({ success: false, error: 'Profile not found' });
  });
  router.use(requireAuth);
  const aiLimit = rateLimit(10, 15 * 60 * 1000);
  const upload = multer({
    storage: multer.memoryStorage(),
    // Busboy signals partsLimit when it reaches the boundary after a part.
    // Allow that boundary; files/fields still enforce exactly one file, no fields.
    limits: { fileSize: 10 * 1024 * 1024, files: 1, fields: 0, parts: 2 },
  });

  router.get('/me', async (_req, res) => {
    const profile = await Profile.findOne({ userId: res.locals.userId });
    res.json({ success: true, data: profile ? profileData(profile) : null });
  });

  router.post('/', async (req, res) => {
    let content;
    try { content = parseResumeContent(req.body); }
    catch (error) {
      if (!(error instanceof ResumeInputError)) throw error;
      res.status(400).json({ success: false, error: error.message }); return;
    }
    try {
      const profile = await withActiveAccount(res.locals.userId, () => Profile.create({ ...content, userId: res.locals.userId }));
      res.status(201).json({ success: true, data: profileData(profile) });
    } catch (error) {
      if ((error as { code?: number }).code !== 11000) throw error;
      res.status(409).json({ success: false, error: 'A resume already exists. Reload your saved resume before editing.' });
    }
  });

  router.post('/upload', aiLimit, upload.single('resume'), async (req, res) => {
    if (!req.file || req.file.mimetype !== 'application/pdf' || req.file.buffer.subarray(0, 5).toString() !== '%PDF-') {
      res.status(400).json({ success: false, error: 'Upload a PDF file in the resume field' });
      return;
    }
    if (await Profile.findOne({ userId: res.locals.userId })) {
      res.status(409).json({ success: false, error: 'A resume already exists. Edit your saved resume instead of replacing it.' }); return;
    }
    let text: string;
    try {
      text = await deps.parse(req.file.buffer);
    } catch {
      res.status(422).json({ success: false, error: 'Unable to read PDF text. Upload a readable text-based PDF.' });
      return;
    }
    if (!text.trim() || text.length > 100000) {
      res.status(422).json({ success: false, error: 'Resume must contain between 1 and 100,000 text characters' });
      return;
    }
    const extracted = await deps.extract(text);
    const skills = await deps.normalize(text);
    let content;
    try { content = parseResumeContent(profileUpdate(extracted, skills)); }
    catch (error) {
      if (!(error instanceof ResumeInputError)) throw error;
      res.status(422).json({ success: false, error: 'The extracted resume contains invalid details. Try another PDF or start a blank resume.' }); return;
    }
    try {
      // A unique owner index also protects concurrent imports/manual creation.
      const profile = await withActiveAccount(res.locals.userId, () => Profile.create({ ...content, userId: res.locals.userId }));
      res.json({ success: true, data: profileData(profile) });
    } catch (error) {
      if ((error as { code?: number }).code !== 11000) throw error;
      res.status(409).json({ success: false, error: 'A resume was created in another session. Reload your saved resume.' });
    }
  });

  // Ownership belongs in the database predicate, not in a client assertion.
  router.param('profileId', async (_req, res, next, id: string) => {
    if (!/^[a-f0-9]{24}$/i.test(id)) {
      res.status(400).json({ success: false, error: 'Invalid profile ID' });
      return;
    }
    const profile = await Profile.findOne({ _id: id, userId: res.locals.userId });
    if (!profile) {
      res.status(404).json({ success: false, error: 'Profile not found' });
      return;
    }
    res.locals.profile = profile;
    next();
  });

  // Keep auth and owner lookup ahead of the tombstone: a foreign profile must
  // remain indistinguishable from a missing one. This path never invokes AI.
  router.post('/:profileId/optimize', (_req, res) => {
    res.status(410).json({ success: false, code: 'endpoint_retired',
      error: 'Legacy optimization has been retired. Create a job version and use its review endpoint.' });
  });
  router.use('/:profileId/versions', versionRouter);
  router.put('/:profileId', async (req, res) => {
    let input;
    try { input = parseResumeSave(req.body); }
    catch (error) {
      if (!(error instanceof ResumeInputError)) throw error;
      res.status(400).json({ success: false, error: error.message }); return;
    }
    // Atomic comparison prevents a second tab from silently erasing a newer save.
    // Older documents have no revision field and are treated as revision zero.
    const revisionFilter = input.revision === 0
      ? { $or: [{ revision: 0 }, { revision: { $exists: false } }] }
      : { revision: input.revision };
    const profile = await Profile.findOneAndUpdate(
      { _id: req.params.profileId, userId: res.locals.userId, ...revisionFilter },
      { $set: input.content, $inc: { revision: 1 }, $unset: { rawResumeText: 1 } },
      { returnDocument: 'after', runValidators: true },
    );
    if (!profile) {
      res.status(409).json({ success: false, error: 'Your resume changed in another session. Your edits are still here. Reload the saved resume before trying again.' }); return;
    }
    res.json({ success: true, data: profileData(profile) });
  });
  router.get('/:profileId/export', async (req, res) => {
    if (req.query.revision !== undefined && req.query.revision !== String(res.locals.profile.revision ?? 0)) {
      res.status(409).json({ success: false, error: 'The saved resume changed. Reload it before exporting.' }); return;
    }
    const buffer = await deps.pdf(res.locals.profile);
    res.setHeader('Content-Disposition', 'attachment; filename="resume.pdf"');
    res.type('pdf').send(buffer);
  });
  router.delete('/:profileId', async (req, res) => {
    await Profile.deleteOne({ _id: req.params.profileId, userId: res.locals.userId });
    res.sendStatus(204);
  });
  return router;
}
export default createProfileRouter();
