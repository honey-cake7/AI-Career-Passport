import mongoose, { Schema, Document, Model, Types } from 'mongoose';
import { nanoid } from 'nanoid';
import type { ResumeContent } from '../validation/resume.js';
import type { JobReview } from '../services/jobReview.js';
import type { GapPlan } from '../services/gapPlans.js';

export interface IResumeVersion {
  _id: Types.ObjectId;
  label: string;
  jobDescription: string;
  baseRevision: number;
  revision: number;
  content: ResumeContent;
  analysis?: JobReview;
  gapPlans?: GapPlan[];
  plansRevision?: number;
  createdAt: Date;
}

// ─── Sub-document Interfaces ─────────────────────────────────

export interface IPersonalInfo {
  fullName: string;
  email?: string;
  phone?: string;
  location?: string;
  linkedIn?: string;
  summary?: string;
}

export interface IExperience {
  title: string;
  company: string;
  location?: string;
  startDate?: string;
  endDate?: string;
  description?: string;
}

export interface IEducation {
  institution: string;
  degree: string;
  field?: string;
  startDate?: string;
  endDate?: string;
  gpa?: string;
}

export interface IProject {
  title: string;
  description?: string;
  techStack: string[];
  link?: string;
}

// ─── Profile Interface ──────────────────────────────────────

export interface IProfile extends Document {
  userId: Types.ObjectId;
  revision: number;
  versions?: IResumeVersion[];
  personalInfo: IPersonalInfo;
  experiences: IExperience[];
  education: IEducation[];
  projects: IProject[];
  skills: string[]; // User-reviewed wording; canonical matching is a separate concern.
  slug: string; // Public sharing link
  rawResumeText?: string;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Sub-schemas ─────────────────────────────────────────────

const PersonalInfoSchema = new Schema<IPersonalInfo>(
  {
    fullName: { type: String, required: true, trim: true },
    email: { type: String, trim: true },
    phone: { type: String, trim: true },
    location: { type: String, trim: true },
    linkedIn: { type: String, trim: true },
    summary: { type: String, trim: true },
  },
  { _id: false }
);

const ExperienceSchema = new Schema<IExperience>(
  {
    title: { type: String, required: true, trim: true },
    company: { type: String, required: true, trim: true },
    location: { type: String, trim: true },
    startDate: { type: String, trim: true },
    endDate: { type: String, trim: true },
    description: { type: String, trim: true },
  },
  { _id: false }
);

const EducationSchema = new Schema<IEducation>(
  {
    institution: { type: String, required: true, trim: true },
    degree: { type: String, required: true, trim: true },
    field: { type: String, trim: true },
    startDate: { type: String, trim: true },
    endDate: { type: String, trim: true },
    gpa: { type: String, trim: true },
  },
  { _id: false }
);

const ProjectSchema = new Schema<IProject>(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    techStack: { type: [String], default: [] },
    link: { type: String, trim: true },
  },
  { _id: false }
);

// ─── Profile Schema ─────────────────────────────────────────

const ResumeContentSchema = new Schema<ResumeContent>({
  personalInfo: { type: PersonalInfoSchema, required: true },
  experiences: { type: [ExperienceSchema], default: [] },
  education: { type: [EducationSchema], default: [] },
  projects: { type: [ProjectSchema], default: [] },
  skills: { type: [String], default: [] },
}, { _id: false });

// Embedded versions make profile deletion and version updates atomic on standalone
// MongoDB too. HTTP validation and a 20-version cap bound document size below 16 MB.
const ResumeVersionSchema = new Schema<IResumeVersion>({
  label: { type: String, required: true },
  jobDescription: { type: String, required: true },
  baseRevision: { type: Number, required: true },
  revision: { type: Number, default: 0 },
  content: { type: ResumeContentSchema, required: true },
  analysis: { type: Schema.Types.Mixed }, // Only server-validated JobReview values.
  gapPlans: { type: [Schema.Types.Mixed], default: [] }, // Only validated, owner-scoped plan mutations.
  plansRevision: { type: Number, default: 0, min: 0 },
  createdAt: { type: Date, default: Date.now },
});

const ProfileSchema = new Schema<IProfile>(
  {
    revision: { type: Number, default: 0, min: 0 },
    versions: { type: [ResumeVersionSchema], default: [], select: false },
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User ID is required'],
      unique: true,
      index: true,
    },
    personalInfo: {
      type: PersonalInfoSchema,
      required: true,
    },
    experiences: {
      type: [ExperienceSchema],
      default: [],
    },
    education: {
      type: [EducationSchema],
      default: [],
    },
    projects: {
      type: [ProjectSchema],
      default: [],
    },
    skills: {
      type: [String],
      default: [],
    },
    slug: {
      type: String,
      unique: true,
      index: true,
      default: () => nanoid(10),
    },
    rawResumeText: {
      type: String,
      select: false, // Excluded from queries by default (large field)
    },
  },
  {
    timestamps: true,
  }
);

// ─── Model ───────────────────────────────────────────────────

export const Profile: Model<IProfile> = mongoose.model<IProfile>('Profile', ProfileSchema);
