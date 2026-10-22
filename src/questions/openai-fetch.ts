/** Server-side failures where a second attempt can succeed. */
const RETRYABLE_STATUS = new Set([500, 502, 503, 504]);
const RETRY_DELAY_MS = 400;

/**
 * One OpenAI request, retried at most once and only for transient failures:
 * a dropped connection or a 5xx. A timeout is not retried (it would double an
 * already long wait), and 4xx — bad request, auth, quota, rate limit — is
 * returned as-is, because repeating it only adds delay.
 */
export async function fetchOpenAI(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  for (let attempt = 1; ; attempt += 1) {
    const last = attempt === 2;
    let response: Response;
    try {
      response = await fetch(url, {
        ...init,
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      if (last || isTimeout(error)) {
        throw error;
      }
      await pause(RETRY_DELAY_MS);
      continue;
    }
    if (last || !RETRYABLE_STATUS.has(response.status)) {
      return response;
    }
    await pause(RETRY_DELAY_MS);
  }
}

function isTimeout(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === 'TimeoutError' || error.name === 'AbortError')
  );
}

function pause(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
