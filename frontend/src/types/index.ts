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
  skillNormalization?: SkillNormalization;
}

export interface SkillEntry {
  id: string; raw: string; suggestion: string | null;
  method: 'exact' | 'model' | 'unresolved';
  choice: 'pending' | 'original' | 'suggested' | 'custom'; value: string;
}
export interface SkillNormalization {
  schemaVersion: 1; generatedAt: string; status: 'ready' | 'unavailable'; entries: SkillEntry[];
}

export interface EditSuggestion {
  id: string; sourceId: string; sourceLabel: string; original: string; proposed: string; reason: string;
}
export interface WordingResult {
  revision: number; reviewedAt: string; generatedAt: string;
  suggestion: EditSuggestion | null;
  requirement: { id: string; label: string; quote: string };
  usage: JobReview['usage'];
}
export interface JobReview {
  schemaVersion: 1; revision: number; generatedAt: string;
  requirements: {
    id: string; label: string; quote: string; kind: 'skill' | 'context'; term: string;
    priority: 'required' | 'preferred' | 'unspecified';
    origin?: 'model' | 'user'; excluded?: boolean;
    original?: { id: string; label: string; quote: string; kind: 'skill' | 'context'; term: string; priority: 'required' | 'preferred' | 'unspecified' };
    status: 'work_mention' | 'claim_only' | 'not_found' | 'unassessed';
    evidence: { id: string; label: string; text: string }[]; action: string;
  }[];
  suggestions: EditSuggestion[];
  usage: { model: string; inputTokens: number | null; outputTokens: number | null };
  coverage?: JobCoverage;
}
export interface JobCoverage {
  schemaVersion: 1;
  groups: Record<'required' | 'preferred' | 'unspecified', {
    assessed: number; workMentions: number; listedOnly: number; notFound: number;
    unassessed: number; excluded: number; duplicates: number; workPercent: number | null;
  }>;
  duplicates: { id: string; countedAs: string }[];
}
export interface JobVersion extends IProfile {
  label: string; jobDescription: string; baseRevision: number; createdAt: string; analysis: JobReview | null;
  gapPlans?: GapPlan[]; plansRevision?: number;
}
export type PlanConfirmation = 'has_experience' | 'needs_practice' | 'needs_review';
export interface GapPlan {
  id: string; requirementKey: string;
  requirement: Pick<JobReview['requirements'][number], 'id' | 'label' | 'quote' | 'kind' | 'term' | 'priority'>;
  confirmation: PlanConfirmation; task: string; criteria: string[]; checks: boolean[];
  status: 'planned' | 'in_progress' | 'completed'; notes: string; link: string;
  createdAt: string; updatedAt: string;
  assessment: { revision: number; checkedAt: string; status: JobReview['requirements'][number]['status']; evidence: JobReview['requirements'][number]['evidence'] };
}
export type VersionListItem = Pick<JobVersion, 'profileId' | 'label' | 'revision' | 'baseRevision' | 'createdAt'>;
