import { IProfile } from '../models/Profile.js';
import { groqClient } from '../config/groq.js';

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

export async function optimizeProfileForJob(profile: IProfile, jobDescription: string): Promise<IOptimizationResult> {
  // Construct the prompt payload
  const candidateSummary = {
    experiences: profile.experiences.map((exp) => ({
      title: exp.title,
      company: exp.company,
      description: exp.description,
    })),
    skills: profile.skills,
  };

  const systemPrompt = `You are an elite technical recruiter and resume optimizer. 
Your task is to analyze the candidate's profile against the provided Job Description.

Respond ONLY with a strictly formatted JSON object that matches this TypeScript interface:
{
  "matchScore": number, // 0 to 100
  "missingHardSkills": string[],
  "missingSoftSkills": string[],
  "recommendations": string[], // General advice to improve the profile
  "optimizedBullets": [ // Pick up to 4 key experience bullets and rewrite them to better align with the job description
    {
      "original": "original bullet",
      "optimized": "highly impactful, metric-driven rewrite",
      "explanation": "why this is better"
    }
  ]
}

Ensure the response is valid JSON. Do not include markdown formatting or backticks around the JSON.`;

  const userPrompt = `
CANDIDATE PROFILE:
${JSON.stringify(candidateSummary, null, 2)}

JOB DESCRIPTION:
${jobDescription}
`;

  try {
    console.log(`\n🧠 Optimizing profile against job description...`);
    const chatCompletion = await groqClient.chat.completions.create({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
      temperature: 0.2, // Low temperature for consistent, analytical responses
      response_format: { type: 'json_object' }, // Enforce JSON output
    });

    const responseContent = chatCompletion.choices[0]?.message?.content || '{}';
    const result: IOptimizationResult = JSON.parse(responseContent);

    console.log(`✅ Optimization complete (Match Score: ${result.matchScore}%)`);
    return result;
  } catch (error) {
    console.error('❌ Failed to optimize profile:', error);
    throw new Error('Failed to generate profile optimization matrix.');
  }
}
