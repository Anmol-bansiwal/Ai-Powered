import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { validateEnv } from '../config/env.validation';
import { preservesTechnicalTokens } from './query-rewrite';

export const REWRITE_MODEL = 'gpt-4.1-mini';

export type RewriteResult = {
  rewrittenQuery: string;
  rewritten: boolean;
};

const REWRITE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    rewrittenQuery: { type: 'string' },
  },
  required: ['rewrittenQuery'],
} as const;

// Experimental only. Production search still embeds the student text as typed.
const SYSTEM_PROMPT = [
  'You rewrite informal student search queries into clearer exam-question search text.',
  'Keep the same technical meaning.',
  'Preserve every number, unit, chemical formula, equation fragment, and negation exactly in meaning.',
  'Spoken units may become the usual symbol, for example volt to V or ohm to Ω, but never change the quantity.',
  'Do not invent constraints, values, subjects, or steps that are not in the student text.',
  'Do not answer the question. Return only the rewritten search query.',
].join(' ');

@Injectable()
export class QueryRewriteService {
  async rewrite(query: string): Promise<RewriteResult> {
    const trimmed = query.trim();
    if (trimmed === '') {
      return { rewrittenQuery: trimmed, rewritten: false };
    }

    let candidate: string | null;
    try {
      candidate = await this.proposeRewrite(trimmed);
    } catch (error) {
      if (error instanceof ServiceUnavailableException) {
        return { rewrittenQuery: trimmed, rewritten: false };
      }
      throw error;
    }

    if (
      candidate === null ||
      candidate === '' ||
      candidate === trimmed ||
      !preservesTechnicalTokens(trimmed, candidate)
    ) {
      return { rewrittenQuery: trimmed, rewritten: false };
    }

    return { rewrittenQuery: candidate, rewritten: true };
  }

  private async proposeRewrite(query: string): Promise<string | null> {
    const payload = await this.complete({
      model: REWRITE_MODEL,
      temperature: 0,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `Student query: ${query}` },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'query_rewrite',
          strict: true,
          schema: REWRITE_SCHEMA,
        },
      },
    });

    return readRewrittenQuery(payload);
  }

  private async complete(body: Record<string, unknown>): Promise<unknown> {
    const env = validateEnv(process.env);
    if (!env.OPENAI_API_KEY) {
      throw new ServiceUnavailableException(
        'OpenAI API key is not configured.',
      );
    }

    let response: Response;
    try {
      response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(20000),
      });
    } catch {
      throw new ServiceUnavailableException('Rewrite request failed.');
    }

    if (!response.ok) {
      throw new ServiceUnavailableException('Rewrite request failed.');
    }

    try {
      return (await response.json()) as unknown;
    } catch {
      throw new ServiceUnavailableException('Rewrite response was invalid.');
    }
  }
}

function readRewrittenQuery(payload: unknown): string | null {
  if (typeof payload !== 'object' || payload === null) {
    return null;
  }
  const choices = (payload as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) {
    return null;
  }
  const message = (choices[0] as { message?: { content?: unknown } }).message;
  if (typeof message?.content !== 'string') {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(message.content);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) {
    return null;
  }
  const rewrittenQuery = (parsed as { rewrittenQuery?: unknown })
    .rewrittenQuery;
  if (typeof rewrittenQuery !== 'string') {
    return null;
  }
  const trimmed = rewrittenQuery.trim();
  return trimmed === '' ? null : trimmed;
}
