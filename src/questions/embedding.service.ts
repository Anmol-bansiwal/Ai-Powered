import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { validateEnv } from '../config/env.validation';
import { fetchOpenAI } from './openai-fetch';

export const EMBEDDING_MODEL = 'text-embedding-3-small';
export const EMBEDDING_DIMENSIONS = 1536;

@Injectable()
export class EmbeddingService {
  async embed(text: string): Promise<number[]> {
    const env = validateEnv(process.env);
    if (env.OPENAI_EMBEDDING_MODEL !== EMBEDDING_MODEL) {
      throw new ServiceUnavailableException(
        'Embedding model must be text-embedding-3-small.',
      );
    }
    if (!env.OPENAI_API_KEY) {
      throw new ServiceUnavailableException(
        'OpenAI API key is not configured.',
      );
    }

    let response: Response;
    try {
      response = await fetchOpenAI(
        'https://api.openai.com/v1/embeddings',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${env.OPENAI_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: EMBEDDING_MODEL,
            input: text,
          }),
        },
        20000,
      );
    } catch {
      throw new ServiceUnavailableException('Embedding request failed.');
    }

    if (!response.ok) {
      throw new ServiceUnavailableException('Embedding request failed.');
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new ServiceUnavailableException('Embedding response was invalid.');
    }

    const embedding = readEmbedding(payload);
    if (embedding === null) {
      throw new ServiceUnavailableException('Embedding response was invalid.');
    }
    return embedding;
  }
}

function readEmbedding(payload: unknown): number[] | null {
  if (typeof payload !== 'object' || payload === null) {
    return null;
  }
  const data = (payload as { data?: unknown }).data;
  if (!Array.isArray(data) || data.length === 0) {
    return null;
  }
  const first = data[0] as { embedding?: unknown };
  if (!Array.isArray(first?.embedding)) {
    return null;
  }
  const values: number[] = [];
  for (const value of first.embedding) {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return null;
    }
    values.push(value);
  }
  if (values.length !== EMBEDDING_DIMENSIONS) {
    return null;
  }
  return values;
}
