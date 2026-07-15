import { groqClient, GROQ_MODEL } from '../config/groq.js';
import type { IPersonalInfo, IExperience, IEducation, IProject } from '../models/Profile.js';

export interface ExtractedProfile {
  personalInfo: IPersonalInfo;
  experiences: IExperience[];
  education: IEducation[];
  projects: IProject[];
}

/**
 * Use the Groq LLM to extract structured profile data from raw resume text.
 * Extracts personal info, work experiences, and education.
 *
 * @param resumeText - The raw text extracted from the PDF resume
 * @returns Structured profile data matching the Profile schema shape
 */
export async function extractProfileFromText(resumeText: string): Promise<ExtractedProfile> {
  const systemPrompt = `You are an expert resume parser. Your job is to extract structured data from raw resume text.
You MUST respond with ONLY valid JSON — no markdown, no code fences, no explanation.

The JSON must follow this exact schema:
{
  "personalInfo": {
    "fullName": "string (required)",
    "email": "string or null",
    "phone": "string or null",
    "location": "string or null",
    "linkedIn": "string or null",
    "summary": "string or null (professional summary/objective)"
  },
  "experiences": [
    {
      "title": "string (job title, required)",
      "company": "string (required)",
      "location": "string or null",
      "startDate": "string or null (e.g., 'Jan 2020')",
      "endDate": "string or null (e.g., 'Present', 'Dec 2023')",
      "description": "string or null (responsibilities/achievements)"
    }
  ],
  "education": [
    {
      "institution": "string (required)",
      "degree": "string (required, e.g., 'Bachelor of Science')",
      "field": "string or null (e.g., 'Computer Science')",
      "startDate": "string or null",
      "endDate": "string or null",
      "gpa": "string or null"
    }
  ],
  "projects": [
    {
      "title": "string (required)",
      "description": "string or null (responsibilities/achievements)",
      "techStack": ["string", "string"],
      "link": "string or null (e.g., GitHub or live URL)"
    }
  ]
}

Rules:
- Extract ALL experiences, education entries, and academic/personal/open-source projects found.
- For projects, carefully identify the tech stack and return it as an array of strings.
- If a field is not found in the text, set it to null (except arrays, which should be empty).
- Do NOT invent or hallucinate information not present in the text.
- For dates, use the format as-is from the resume (e.g., "Jan 2020", "2020", "Present").
- fullName is required. If you cannot determine a name, use "Unknown".`;

  const response = await groqClient.chat.completions.create({
    model: GROQ_MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Extract the structured profile from this resume:\n\n${resumeText}` },
    ],
    temperature: 0.1, // Low temperature for deterministic extraction
    max_tokens: 4096,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error('LLM returned empty response during profile extraction');
  }

  try {
    // Strip potential markdown code fences the LLM might add despite instructions
    const jsonStr = content
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();

    const parsed = JSON.parse(jsonStr) as ExtractedProfile;

    // Validate required fields
    if (!parsed.personalInfo?.fullName) {
      parsed.personalInfo = {
        ...parsed.personalInfo,
        fullName: 'Unknown',
      };
    }

    return {
      personalInfo: parsed.personalInfo,
      experiences: Array.isArray(parsed.experiences) ? parsed.experiences : [],
      education: Array.isArray(parsed.education) ? parsed.education : [],
      projects: Array.isArray(parsed.projects) ? parsed.projects : [],
    };
  } catch (parseError) {
    console.error('Failed to parse LLM profile extraction response:', content);
    throw new Error(
      `Failed to parse profile extraction result: ${parseError instanceof Error ? parseError.message : String(parseError)}`
    );
  }
}
