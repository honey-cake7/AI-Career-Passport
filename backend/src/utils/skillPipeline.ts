export type SkillStage = 'extraction' | 'embedding' | 'qdrant' | 'canonicalization';

const messages: Record<SkillStage, string> = {
  extraction: 'Skill extraction is temporarily unavailable. Please retry shortly.',
  embedding: 'The skill model is still loading or unavailable. Please retry shortly.',
  qdrant: 'The skill taxonomy is temporarily unavailable. Please retry shortly.',
  canonicalization: 'Skill normalization is temporarily unavailable. Please retry shortly.',
};

export class SkillPipelineError extends Error {
  constructor(public readonly stage: SkillStage, public readonly code: 'timeout' | 'failed') {
    super(messages[stage]);
    this.name = 'SkillPipelineError';
  }
}

/** Bounds the caller's wait; cancellation is also passed to dependencies that support it. */
export async function runSkillStage<T>(
  stage: SkillStage,
  timeoutMs: number,
  operation: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();
  const started = Date.now();
  console.log(`skill_stage_started stage=${stage}`);
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const deadline = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => {
        reject(new SkillPipelineError(stage, 'timeout'));
        controller.abort();
      }, timeoutMs);
    });
    const result = await Promise.race([deadline, Promise.resolve().then(() => operation(controller.signal))]);
    console.log(`skill_stage_complete stage=${stage} duration_ms=${Date.now() - started}`);
    return result;
  } catch (error) {
    const safe = error instanceof SkillPipelineError ? error : new SkillPipelineError(stage, 'failed');
    console.warn(`skill_stage_failed stage=${stage} code=${safe.code} duration_ms=${Date.now() - started}`);
    throw safe;
  } finally {
    clearTimeout(timer);
  }
}
