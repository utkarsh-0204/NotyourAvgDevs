import { config } from '../config/index.js';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatOptions {
  maxTokens?: number;
  temperature?: number;
  /** Label used in logs, e.g. "chunk 3/12". */
  label?: string;
}

export interface ChatResult {
  content: string;
  finishReason: string | null;
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
}

/** The request was larger than the model's context window. Callers can split the input and retry. */
export class NvidiaContextLengthError extends Error {}

/** Non-retryable failure (bad key, unknown model, malformed request). */
export class NvidiaRequestError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const CONTEXT_ERROR_PATTERN = /context length|context window|maximum context|too many tokens|prompt is too long|input.*too long/i;

/**
 * Minimal client for NVIDIA's OpenAI-compatible chat completions endpoint
 * (https://integrate.api.nvidia.com/v1/chat/completions).
 * The API key never leaves the backend; it is only placed in the Authorization header here.
 */
export class NvidiaClient {
  public static isConfigured(): boolean {
    return config.nvidiaApiKey.length > 0;
  }

  public static get model(): string {
    return config.nvidiaModel;
  }

  public static async chat(messages: ChatMessage[], options: ChatOptions = {}): Promise<ChatResult> {
    if (!this.isConfigured()) {
      throw new NvidiaRequestError('NVIDIA_API_KEY is not configured on the server.');
    }

    const body: Record<string, unknown> = {
      model: config.nvidiaModel,
      messages,
      temperature: options.temperature ?? config.nvidiaTemperature,
      top_p: 0.95,
      max_tokens: options.maxTokens ?? config.nvidiaMaxOutputTokens,
      stream: false,
      // Nemotron chat template switch; ignored by models that do not use it.
      chat_template_kwargs: { enable_thinking: config.nvidiaEnableThinking },
    };

    const json = await this.post('/chat/completions', body, options.label, config.nvidiaModel, 'NVIDIA_MODEL');
    const choice = json?.choices?.[0];
    const rawContent: string = choice?.message?.content ?? '';
    return {
      content: this.stripReasoning(rawContent),
      finishReason: choice?.finish_reason ?? null,
      usage: json?.usage,
    };
  }

  /**
   * Embeddings for retrieval (RAG). NVIDIA retrieval embedding models need to know whether the text
   * is a stored passage or a search query; using the wrong type noticeably hurts search quality.
   */
  public static async embed(texts: string[], inputType: 'passage' | 'query', label = 'embed'): Promise<number[][]> {
    if (!this.isConfigured()) {
      throw new NvidiaRequestError('NVIDIA_API_KEY is not configured on the server.');
    }
    if (texts.length === 0) return [];
    const json = await this.post(
      '/embeddings',
      {
        model: config.nvidiaEmbeddingModel,
        input: texts,
        input_type: inputType,
        encoding_format: 'float',
        // Chunks are sized to fit, but never fail a request because one is slightly too long.
        truncate: 'END',
      },
      label,
      config.nvidiaEmbeddingModel,
      'NVIDIA_EMBEDDING_MODEL'
    );
    const data: Array<{ index: number; embedding: number[] }> = Array.isArray(json?.data) ? json.data : [];
    if (data.length !== texts.length) {
      throw new Error(`NVIDIA embeddings returned ${data.length} vectors for ${texts.length} inputs.`);
    }
    return [...data].sort((a, b) => a.index - b.index).map((d) => d.embedding);
  }

  /** POST with timeout, retries on 429/5xx/network errors, and clear errors for bad key/model. */
  private static async post(path: string, body: Record<string, unknown>, labelText: string | undefined, model: string, modelEnv: string): Promise<any> {
    const label = labelText ? ` [${labelText}]` : '';
    let lastError: Error = new Error('Unknown NVIDIA API error');

    for (let attempt = 0; attempt <= config.nvidiaMaxRetries; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), config.nvidiaTimeoutMs);
      try {
        const res = await fetch(`${config.nvidiaBaseUrl}${path}`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${config.nvidiaApiKey}`,
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        if (!res.ok) {
          const errText = (await res.text().catch(() => '')).slice(0, 600);
          const message = `NVIDIA API ${res.status}: ${this.sanitize(errText) || res.statusText}`;

          if ((res.status === 400 || res.status === 413 || res.status === 422) && CONTEXT_ERROR_PATTERN.test(errText)) {
            throw new NvidiaContextLengthError(message);
          }
          if (res.status === 429 || res.status >= 500) {
            lastError = new Error(message);
            const retryAfter = parseFloat(res.headers.get('retry-after') || '');
            const waitMs = Number.isFinite(retryAfter) ? retryAfter * 1000 : this.backoff(attempt, res.status === 429);
            console.warn(`[NvidiaClient]${label} ${message}. Retrying in ${Math.round(waitMs / 1000)}s (attempt ${attempt + 1}/${config.nvidiaMaxRetries + 1}).`);
            await sleep(waitMs);
            continue;
          }
          // 401/403/404 and other client errors will not succeed on retry.
          const hint =
            res.status === 401 || res.status === 403
              ? ' Check NVIDIA_API_KEY in backend/.env.'
              : res.status === 404
              ? ` Check that ${modelEnv} ("${model}") is available to your account.`
              : '';
          throw new NvidiaRequestError(message + hint, res.status);
        }

        return await res.json();
      } catch (err: any) {
        if (err instanceof NvidiaContextLengthError || err instanceof NvidiaRequestError) throw err;
        const isTimeout = err?.name === 'AbortError';
        lastError = new Error(isTimeout ? `NVIDIA API request timed out after ${config.nvidiaTimeoutMs / 1000}s` : `NVIDIA API network error: ${err?.message || err}`);
        if (attempt < config.nvidiaMaxRetries) {
          const waitMs = this.backoff(attempt, false);
          console.warn(`[NvidiaClient]${label} ${lastError.message}. Retrying in ${Math.round(waitMs / 1000)}s.`);
          await sleep(waitMs);
        }
      } finally {
        clearTimeout(timer);
      }
    }
    throw lastError;
  }

  /** Lightweight connectivity check used by the test script. */
  public static async ping(): Promise<string> {
    const result = await this.chat([{ role: 'user', content: 'Reply with the single word: OK' }], { maxTokens: 16, label: 'ping' });
    return result.content.trim();
  }

  private static backoff(attempt: number, rateLimited: boolean): number {
    const base = rateLimited ? 5000 : 2000;
    return Math.min(60000, base * 2 ** attempt) + Math.floor(Math.random() * 1000);
  }

  /** Some reasoning models inline their chain of thought in <think> tags; only the final answer is kept. */
  private static stripReasoning(content: string): string {
    return content.replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/^[\s\S]*?<\/think>/i, '').trim();
  }

  /** Make sure an error body can never echo the API key back into logs or responses. */
  private static sanitize(text: string): string {
    return config.nvidiaApiKey ? text.split(config.nvidiaApiKey).join('[redacted]') : text;
  }
}
