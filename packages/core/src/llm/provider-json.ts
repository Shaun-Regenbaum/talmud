import { LLMError, TRANSIENT } from './llm-error';

/** A broken provider envelope is a transport failure, not a producer schema error. */
export async function readProviderJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch (err) {
    if (err instanceof SyntaxError) {
      throw new LLMError(502, 'Provider returned incomplete or invalid JSON', {
        cls: TRANSIENT,
        cause: err,
      });
    }
    throw err;
  }
}
