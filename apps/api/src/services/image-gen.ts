/**
 * DashScope Image Generation + Editing
 * Uses qwen-image-2.0 for text-to-image and qwen-image-edit-plus for editing.
 * Images are persisted to local disk via image-store so they never expire.
 */

import { persistImage } from './image-store.js';

const ENDPOINT = 'https://dashscope-intl.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation';

interface DashScopeImageResponse {
  output?: {
    choices?: Array<{
      message?: {
        content?: Array<{ image?: string; text?: string }>;
      };
    }>;
  };
  code?: string;
  message?: string;
}

function getApiKey(): string {
  const key = process.env.DASHSCOPE_API_KEY;
  if (!key) throw new Error('DASHSCOPE_API_KEY is not set');
  return key;
}

async function callImageApi(body: object, timeoutMs: number): Promise<string> {
  const response = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${getApiKey()}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });

  const data = (await response.json()) as DashScopeImageResponse;

  if (!response.ok) {
    throw new Error(`DashScope image API ${response.status}: ${data.code ?? ''} — ${data.message ?? 'unknown error'}`);
  }

  const tempUrl = data.output?.choices?.[0]?.message?.content?.find((c) => c.image)?.image;
  if (!tempUrl) throw new Error('No image URL in DashScope response');

  // Download and store permanently
  return persistImage(tempUrl);
}

export async function generateImage(prompt: string, size = '1024*1024'): Promise<string> {
  return callImageApi({
    model: 'qwen-image-2.0',
    input: {
      messages: [{ role: 'user', content: [{ text: prompt }] }],
    },
    parameters: { size, n: 1, watermark: false, prompt_extend: true },
  }, 60_000);
}

export async function editImage(
  prompt: string,
  imageDataOrUrl: string,
  size = '1024*1024'
): Promise<string> {
  return callImageApi({
    model: 'qwen-image-edit-plus',
    input: {
      messages: [{
        role: 'user',
        content: [
          { image: imageDataOrUrl },
          { text: prompt },
        ],
      }],
    },
    parameters: { size, n: 1, watermark: false, prompt_extend: true },
  }, 90_000);
}
