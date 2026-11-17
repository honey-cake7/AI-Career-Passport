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

export interface IProfile {
  profileId: string;
  revision: number;
  personalInfo: IPersonalInfo;
  experiences: IExperience[];
  education: IEducation[];
  projects: IProject[];
  skills: string[];
}

export interface EditSuggestion {
  id: string; sourceId: string; sourceLabel: string; original: string; proposed: string; reason: string;
}
export interface JobReview {
  schemaVersion: 1; revision: number; generatedAt: string;
  requirements: {
    id: string; label: string; quote: string; kind: 'skill' | 'context'; term: string;
    priority: 'required' | 'preferred' | 'unspecified';
    status: 'work_mention' | 'claim_only' | 'not_found' | 'unassessed';
    evidence: { id: string; label: string; text: string }[]; action: string;
  }[];
  suggestions: EditSuggestion[];
  usage: { model: string; inputTokens: number | null; outputTokens: number | null };
}
export interface JobVersion extends IProfile {
  label: string; jobDescription: string; baseRevision: number; createdAt: string; analysis: JobReview | null;
}
export type VersionListItem = Pick<JobVersion, 'profileId' | 'label' | 'revision' | 'baseRevision' | 'createdAt'>;
