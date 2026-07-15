import mongoose, { Schema, Document, Model, Types } from 'mongoose';
import { nanoid } from 'nanoid';

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

// ─── Profile Interface ──────────────────────────────────────

export interface IProfile extends Document {
  userId: Types.ObjectId;
  personalInfo: IPersonalInfo;
  experiences: IExperience[];
  education: IEducation[];
  skills: string[]; // Strictly normalized canonical skill names
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

// ─── Profile Schema ─────────────────────────────────────────

const ProfileSchema = new Schema<IProfile>(
  {
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
