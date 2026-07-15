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

export interface IProfile {
  _id: string;
  profileId?: string;
  slug: string;
  personalInfo: IPersonalInfo;
  experiences: IExperience[];
  education: IEducation[];
  skills: string[];
}

export interface IOptimizationResult {
  matchScore: number;
  missingHardSkills: string[];
  missingSoftSkills: string[];
  recommendations: string[];
  optimizedBullets: {
    original: string;
    optimized: string;
    explanation: string;
  }[];
}
