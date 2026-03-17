/**
 * DashScope Image Generation + Editing
 * Uses qwen-image-2.0-pro for text-to-image and qwen-image-edit-plus for editing.
 * Synchronous API — response includes the image URL directly.
 * Image URLs expire after 24 hours.
 */

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

export async function generateImage(
  prompt: string,
  size = '1024*1024'
): Promise<string> {
  const response = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${getApiKey()}`,
    },
    body: JSON.stringify({
      model: 'qwen-image-2.0-pro',
      input: {
        messages: [{ role: 'user', content: [{ text: prompt }] }],
      },
      parameters: {
        size,
        n: 1,
        watermark: false,
        prompt_extend: true,
      },
    }),
    signal: AbortSignal.timeout(60_000),
  });

  const data = (await response.json()) as DashScopeImageResponse;

  if (!response.ok) {
    throw new Error(`Image generation failed: ${data.code ?? response.status} — ${data.message ?? 'unknown error'}`);
  }

  const url = data.output?.choices?.[0]?.message?.content?.find((c) => c.image)?.image;
  if (!url) throw new Error('No image URL in DashScope response');
  return url;
}

export async function editImage(
  prompt: string,
  imageDataOrUrl: string,
  size = '1024*1024'
): Promise<string> {
  const response = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${getApiKey()}`,
    },
    body: JSON.stringify({
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
      parameters: {
        size,
        n: 1,
        watermark: false,
        prompt_extend: true,
      },
    }),
    signal: AbortSignal.timeout(90_000),
  });

  const data = (await response.json()) as DashScopeImageResponse;

  if (!response.ok) {
    throw new Error(`Image editing failed: ${data.code ?? response.status} — ${data.message ?? 'unknown error'}`);
  }

  const url = data.output?.choices?.[0]?.message?.content?.find((c) => c.image)?.image;
  if (!url) throw new Error('No image URL in DashScope response');
  return url;
}
