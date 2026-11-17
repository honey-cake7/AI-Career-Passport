export type ReviewFailureCode = 'authentication' | 'model_unavailable' | 'rate_limited' | 'timeout' | 'invalid_output' | 'unavailable';
const messages: Record<ReviewFailureCode, string> = {
  authentication: 'Job review is not configured correctly. Please contact the service owner.',
  model_unavailable: 'The job review model is unavailable. Please contact the service owner.',
  rate_limited: 'The AI provider is busy or its quota is exhausted. Please try again later.',
  timeout: 'Job review took too long. Your saved version is unchanged; please retry.',
  invalid_output: 'The AI response could not be verified. Your saved version is unchanged; please retry.',
  unavailable: 'Job review is temporarily unavailable. Your saved version is unchanged.',
};
export class JobReviewError extends Error {
  constructor(public readonly code: ReviewFailureCode) { super(messages[code]); }
}
