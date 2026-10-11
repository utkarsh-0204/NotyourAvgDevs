import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

const intFromEnv = (name: string, fallback: number): number => {
  const parsed = parseInt(process.env[name] || '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

export const config = {
  port: parseInt(process.env.PORT || '5001', 10),
  mongoUri: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/nyayadrishti',
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  geminiModel: process.env.GEMINI_MODEL || 'gemini-2.5-flash',

  // NVIDIA hosted inference (OpenAI-compatible API). The key is only ever read on the server.
  nvidiaApiKey: (process.env.NVIDIA_API_KEY || '').trim(),
  nvidiaBaseUrl: (process.env.NVIDIA_BASE_URL || 'https://integrate.api.nvidia.com/v1').replace(/\/+$/, ''),
  nvidiaModel: process.env.NVIDIA_MODEL || 'nvidia/nemotron-3-super-120b-a12b',
  // Nemotron reasoning models think by default; disabling it keeps JSON output clean and fast.
  nvidiaEnableThinking: (process.env.NVIDIA_ENABLE_THINKING || 'false').toLowerCase() === 'true',
  nvidiaTemperature: parseFloat(process.env.NVIDIA_TEMPERATURE || '0.2'),
  nvidiaTimeoutMs: intFromEnv('NVIDIA_TIMEOUT_MS', 180000),
  nvidiaMaxRetries: intFromEnv('NVIDIA_MAX_RETRIES', 4),
  nvidiaMaxOutputTokens: intFromEnv('NVIDIA_MAX_OUTPUT_TOKENS', 8192),
  nvidiaConcurrency: intFromEnv('NVIDIA_CONCURRENCY', 2),
  // Size of each judgment chunk sent to the model (characters, ~4 chars per token).
  nvidiaChunkChars: intFromEnv('NVIDIA_CHUNK_CHARS', 36000),
  // Upper bound on the combined chunk notes passed to one synthesis call before they are consolidated.
  nvidiaSynthesisMaxChars: intFromEnv('NVIDIA_SYNTHESIS_MAX_CHARS', 120000),

  // Retrieval-Augmented Generation (RAG) for "Ask the Judgment"
  nvidiaEmbeddingModel: process.env.NVIDIA_EMBEDDING_MODEL || 'nvidia/nemotron-3-embed-1b',
  // Chunks of ~1,400 characters (~350 tokens) stay within typical retrieval-embedding input limits.
  ragChunkChars: intFromEnv('RAG_CHUNK_CHARS', 1400),
  ragChunkOverlap: intFromEnv('RAG_CHUNK_OVERLAP', 200),
  ragTopK: intFromEnv('RAG_TOP_K', 8),
  ragEmbedBatchSize: intFromEnv('RAG_EMBED_BATCH_SIZE', 32),

  uploadDir: process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads'),
  maxFileSize: 25 * 1024 * 1024, // 25 MB
  nodeEnv: process.env.NODE_ENV || 'development',
};
