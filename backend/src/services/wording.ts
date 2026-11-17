import { randomBytes } from 'node:crypto';
import type { EditSuggestion, JobReview, ResumeSource, ReviewedRequirement } from './jobReview.js';
import { inputObject, inputText, ResumeInputError } from '../validation/resume.js';

export interface WordingContext { source: ResumeSource; requirement: ReviewedRequirement }
export interface WordingOutput {
  suggestion: EditSuggestion | null;
  usage: JobReview['usage'];
}
export type WordingProvider = (context: WordingContext) => Promise<WordingOutput>;

// Conservative vocabulary equivalences, not a general synonym/stemming model.
// Everything else, including pronouns, negation, tense and technical terms,
// must retain the same token sequence. Token preservation is NOT semantic proof.
export const wordingRules = 'Only simplify these phrases: utilized → used; utilizing → using; utilize → use; in order to → to; a total of → (omit); on a daily basis → daily; on a weekly basis → weekly; approximately → about; prior to → before; subsequent to → after. You may change articles/punctuation, but preserve the order of every other word, every quantity, agency, tense, qualification and meaning. Do not freely paraphrase or rearrange factual words.';
function fingerprint(text: string) {
  const normalized = text.toLowerCase()
    .replace(/\bin order to\b/g, 'to').replace(/\ba total of\b/g, '')
    .replace(/\bon a daily basis\b/g, 'daily').replace(/\bon a weekly basis\b/g, 'weekly')
    .replace(/\bprior to\b/g, 'before').replace(/\bsubsequent to\b/g, 'after')
    .replace(/\butilized\b/g, 'used').replace(/\butilizing\b/g, 'using')
    .replace(/\butilize\b/g, 'use').replace(/\bapproximately\b/g, 'about');
  return (normalized.match(/[\p{L}\p{N}]+(?:[+#]+|[.\-/'’][\p{L}\p{N}]+)*/gu) ?? [])
    .filter(word => !['a', 'an', 'the'].includes(word)).join('\n');
}
export function passesWordingChecks(original: string, proposed: string) {
  // Preserve metric formatting too: 10%, 10 and 10+ are different claims.
  const quantities = (text: string) => (text.match(/[-+−]?\p{N}+(?:[.,]\p{N}+)*(?:\s*[%+]|\s*[kKmMbB]\b)?/gu) ?? []).sort().join('|');
  const symbols = (text: string) => (text.match(/[%$€£¥₹×÷=<>±^~&@#*+\/]/gu) ?? []).join('');
  return quantities(original) === quantities(proposed) && symbols(original) === symbols(proposed) && fingerprint(original) === fingerprint(proposed);
}

/** One complete line is replaced; all surrounding lines are copied by the server. */
export function parseWordingOutput(value: unknown, context: WordingContext): EditSuggestion | null {
  const root = inputObject(value, ['edits'], 'Wording response');
  if (!Array.isArray(root.edits) || root.edits.length > 1) throw new ResumeInputError('Invalid wording edits');
  if (!root.edits.length) return null;
  const edit = inputObject(root.edits[0], ['lineIndex', 'proposed'], 'Wording edit');
  const lines = context.source.text.split('\n');
  if (!Number.isInteger(edit.lineIndex) || Number(edit.lineIndex) < 0 || !lines[Number(edit.lineIndex)]?.trim()) throw new ResumeInputError('Invalid wording source');
  const original = lines[Number(edit.lineIndex)]!;
  const proposed = inputText(edit.proposed, 'Wording proposal', true, 4000);
  if (/[\r\n]/.test(proposed) || proposed === original.trim() || !passesWordingChecks(original, proposed)) throw new ResumeInputError('Unverifiable wording proposal');
  lines[Number(edit.lineIndex)] = proposed;
  return { id: `wording:${randomBytes(12).toString('hex')}`, sourceId: context.source.id,
    sourceLabel: context.source.label, original: context.source.text, proposed: lines.join('\n'),
    reason: `Wording for “${context.requirement.label}”. Check that your contribution, qualifications and outcomes are unchanged; these checks cannot verify meaning.` };
}
