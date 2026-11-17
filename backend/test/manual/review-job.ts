// Opt-in smoke check: a single paid/provider-quota request with synthetic data.
// No database access; only the synthetic JD is sent. Never print provider errors.
export {};
if (!process.argv.includes('--live')) throw new Error('Use --live to explicitly run one synthetic provider request.');
const { reviewJob } = await import('../../src/services/jobReviewProvider.js');
try {
  const result = await reviewJob({ personalInfo: { fullName: 'Synthetic Candidate' }, experiences: [], education: [],
    projects: [{ title: 'Synthetic UI', techStack: ['React'], description: 'Wrote tests for a parser.\nBuilt a React interface.' }], skills: ['Docker'] },
  'Frontend Developer. React experience is required. Docker is preferred. At least 3 years of professional experience. Must be eligible to work in India.', 0);
  console.log(JSON.stringify({ verifiedRequirements: result.requirements.length, statuses: result.requirements.map(r => r.status), suggestions: result.suggestions.length, usage: result.usage }));
} catch (error) {
  const code = (error as { code?: string }).code;
  console.log(`Synthetic live check failed: ${code ?? 'unavailable'}`); process.exitCode = 1;
}
