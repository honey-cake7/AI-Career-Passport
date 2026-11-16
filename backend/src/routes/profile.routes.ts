import { Router } from 'express';
import multer from 'multer';
import { Profile, type IProfile } from '../models/Profile.js';
import { requireAuth } from '../security/auth.js';
import { rateLimit } from '../security/rateLimit.js';
import type { ExtractedProfile } from '../services/profileExtractor.service.js';

// Lazy loading keeps authentication independent of AI keys and native models.
const services = {
  parse: async (buffer: Buffer) => (await import('../services/pdfParser.service.js')).extractTextFromPdf(buffer),
  extract: async (text: string) => (await import('../services/profileExtractor.service.js')).extractProfileFromText(text),
  normalize: async (text: string) => (await import('../services/skillNormalizer.service.js')).normalizeSkillsFromResume(text),
  optimize: async (profile: IProfile, text: string) => (await import('../services/profileOptimizer.service.js')).optimizeProfileForJob(profile, text),
  pdf: async (profile: IProfile) => (await import('../services/pdfGenerator.service.js')).generateProfilePdf(profile),
};

export function profileData(profile: IProfile) {
  return {
    profileId: profile._id, personalInfo: profile.personalInfo,
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

export function createProfileRouter(deps = services) {
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

  router.post('/upload', aiLimit, upload.single('resume'), async (req, res) => {
    if (!req.file || req.file.mimetype !== 'application/pdf' || req.file.buffer.subarray(0, 5).toString() !== '%PDF-') {
      res.status(400).json({ success: false, error: 'Upload a PDF file in the resume field' });
      return;
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
    const profile = await Profile.findOneAndUpdate(
      { userId: res.locals.userId },
      { $set: profileUpdate(extracted, skills), $unset: { rawResumeText: 1 } },
      { returnDocument: 'after', upsert: true, runValidators: true },
    );
    res.json({ success: true, data: profileData(profile) });
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

  router.post('/:profileId/optimize', aiLimit, async (req, res) => {
    const jobDescription = req.body?.jobDescription;
    if (typeof jobDescription !== 'string' || !jobDescription.trim() || jobDescription.length > 20000) {
      res.status(400).json({ success: false, error: 'Job description must contain 1–20,000 characters' });
      return;
    }
    res.json({ success: true, data: await deps.optimize(res.locals.profile, jobDescription) });
  });
  router.get('/:profileId/export', async (_req, res) => {
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
