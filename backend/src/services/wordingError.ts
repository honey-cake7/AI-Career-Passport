import type { ReviewFailureCode } from './jobReviewError.js';

const messages: Record<ReviewFailureCode, string> = {
  authentication: 'Wording suggestions are not configured. You can still edit your resume manually.',
  model_unavailable: 'The wording model is unavailable. You can still edit your resume manually.',
  rate_limited: 'The AI provider is busy or its quota is exhausted. Please try later.',
  timeout: 'The wording request took too long. Your resume is unchanged.',
  invalid_output: 'The proposed wording did not pass the source checks. Your resume is unchanged; edit manually or try later.',
  unavailable: 'Wording suggestions are temporarily unavailable. Your resume is unchanged.',
};
export class WordingError extends Error {
  constructor(public readonly code: ReviewFailureCode) { super(messages[code]); }
}
