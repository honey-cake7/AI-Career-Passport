import { Router, Request, Response } from 'express';
import multer from 'multer';
import mongoose from 'mongoose';
import { extractTextFromPdf } from '../services/pdfParser.service.js';
import { extractProfileFromText } from '../services/profileExtractor.service.js';
import { normalizeSkillsFromResume } from '../services/skillNormalizer.service.js';
import { Profile } from '../models/Profile.js';
import { optimizeProfileForJob } from '../services/profileOptimizer.service.js';
import { generateProfilePdf } from '../services/pdfGenerator.service.js';

// ─── Multer Configuration ────────────────────────────────────

const MAX_FILE_SIZE = (parseInt(process.env.MAX_FILE_SIZE_MB || '10', 10)) * 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_FILE_SIZE,
  },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed'));
    }
  },
});

// ─── Router ──────────────────────────────────────────────────

const router = Router();

/**
 * POST /api/profile/upload
 *
 * Upload a PDF resume, extract structured profile data, normalize skills
 * via the RAG pipeline, and save to MongoDB.
 *
 * Body (multipart/form-data):
 *   - resume: PDF file
 *   - userId: MongoDB ObjectId string
 */
router.post('/upload', upload.single('resume'), async (req: Request, res: Response): Promise<void> => {
  try {
    // ── Validate inputs ──
    const { userId } = req.body;
    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      res.status(400).json({
        success: false,
        error: 'A valid userId is required in the request body',
      });
      return;
    }

    if (!req.file) {
      res.status(400).json({
        success: false,
        error: 'A PDF file must be uploaded in the "resume" field',
      });
      return;
    }

    console.log(`\n${'═'.repeat(60)}`);
    console.log(`📤 Resume upload received for userId: ${userId}`);
    console.log(`   File: ${req.file.originalname} (${(req.file.size / 1024).toFixed(1)} KB)`);
    console.log(`${'═'.repeat(60)}`);

    // ── Step 1: Extract text from PDF ──
    console.log('\n📄 [1/3] Extracting text from PDF...');
    const resumeText = await extractTextFromPdf(req.file.buffer);

    // ── Step 2: Extract structured profile via LLM ──
    console.log('\n🧠 [2/3] Extracting structured profile via LLM...');
    const extractedProfile = await extractProfileFromText(resumeText);
    console.log(`   Extracted: ${extractedProfile.experiences.length} experiences, ${extractedProfile.education.length} education entries`);

    // ── Step 3: Normalize skills via RAG pipeline ──
    console.log('\n🎯 [3/3] Running skill normalization RAG pipeline...');
    const normalizedSkills = await normalizeSkillsFromResume(resumeText);

    // ── Step 4: Save to MongoDB (upsert on userId) ──
    console.log('\n💾 Saving profile to MongoDB...');
    const profile = await Profile.findOneAndUpdate(
      { userId: new mongoose.Types.ObjectId(userId) },
      {
        userId: new mongoose.Types.ObjectId(userId),
        personalInfo: extractedProfile.personalInfo,
        experiences: extractedProfile.experiences,
        education: extractedProfile.education,
        skills: normalizedSkills,
        rawResumeText: resumeText,
      },
      {
        new: true,           // Return the updated document
        upsert: true,        // Create if doesn't exist
        runValidators: true,
      }
    );

    console.log(`✅ Profile saved (ID: ${profile._id})`);
    console.log(`${'═'.repeat(60)}\n`);

    // ── Return response ──
    res.status(200).json({
      success: true,
      data: {
        profileId: profile._id,
        slug: profile.slug,
        personalInfo: profile.personalInfo,
        experiences: profile.experiences,
        education: profile.education,
        skills: profile.skills,
      },
    });
  } catch (error) {
    console.error('❌ Profile upload failed:', error);

    // Handle multer errors
    if (error instanceof multer.MulterError) {
      res.status(400).json({
        success: false,
        error: error.code === 'LIMIT_FILE_SIZE'
          ? `File size exceeds the ${MAX_FILE_SIZE / (1024 * 1024)}MB limit`
          : error.message,
      });
      return;
    }

    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'An unexpected error occurred',
    });
  }
});

/**
 * POST /api/profile/:profileId/optimize
 * 
 * Takes a jobDescription in the body and returns an AI-generated optimization matrix.
 */
router.post('/:profileId/optimize', async (req: Request, res: Response): Promise<void> => {
  try {
    const { profileId } = req.params;
    const { jobDescription } = req.body;

    if (!jobDescription) {
      res.status(400).json({ success: false, error: 'jobDescription is required in the body' });
      return;
    }

    const profile = await Profile.findById(profileId);
    if (!profile) {
      res.status(404).json({ success: false, error: 'Profile not found' });
      return;
    }

    const optimizationMatrix = await optimizeProfileForJob(profile, jobDescription);
    
    res.status(200).json({
      success: true,
      data: optimizationMatrix,
    });
  } catch (error) {
    console.error('❌ Profile optimization failed:', error);
    res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Server error' });
  }
});

/**
 * GET /api/profile/:profileId/export
 * 
 * Generates and downloads a binary PDF of the profile.
 */
router.get('/:profileId/export', async (req: Request, res: Response): Promise<void> => {
  try {
    const { profileId } = req.params;
    const profile = await Profile.findById(profileId);
    
    if (!profile) {
      res.status(404).json({ success: false, error: 'Profile not found' });
      return;
    }

    const pdfBuffer = await generateProfilePdf(profile);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${profile.personalInfo.fullName.replace(/\s+/g, '_')}_Resume.pdf"`);
    res.send(pdfBuffer);
  } catch (error) {
    console.error('❌ PDF export failed:', error);
    res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Server error' });
  }
});

/**
 * GET /api/profile/public/:slug
 * 
 * Public read-only endpoint for viewing a profile via its shareable URL.
 */
router.get('/public/:slug', async (req: Request, res: Response): Promise<void> => {
  try {
    const { slug } = req.params;
    const profile = await Profile.findOne({ slug });

    if (!profile) {
      res.status(404).json({ success: false, error: 'Profile not found' });
      return;
    }

    res.status(200).json({
      success: true,
      data: {
        personalInfo: profile.personalInfo,
        experiences: profile.experiences,
        education: profile.education,
        skills: profile.skills,
      },
    });
  } catch (error) {
    console.error('❌ Fetching public profile failed:', error);
    res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Server error' });
  }
});

export default router;
