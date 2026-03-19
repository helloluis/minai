import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

// Default model listed first — pi uses the first model as default
const PI_AGENT_MODELS = [
  {
    id: 'qwen/qwen3-next-80b-a3b-instruct',
    name: 'Qwen3 Next 80b',
    contextWindow: 131072,
    maxTokens: 8192,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  },
  {
    id: 'moonshotai/kimi-k2.5',
    name: 'Kimi K2.5',
    contextWindow: 131072,
    maxTokens: 8192,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  },
  {
    id: 'deepseek-ai/deepseek-v3.2',
    name: 'Deepseek V3.2',
    contextWindow: 131072,
    maxTokens: 8192,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  },
  {
    id: 'qwen/qwen3-coder-480b-a35b-instruct',
    name: 'Qwen3 Coder 480b',
    contextWindow: 131072,
    maxTokens: 8192,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  },
  {
    id: 'mistralai/devstral-2-123b-instruct-2512',
    name: 'Devstral 2 123b',
    contextWindow: 131072,
    maxTokens: 8192,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  },
  {
    id: 'mistralai/mistral-large-3-675b-instruct-2512',
    name: 'Mistral Large 3 675b',
    contextWindow: 131072,
    maxTokens: 8192,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  },
];

export function setupPiConfig() {
  const apiKey = process.env.NVIDIA_NIM_API_KEY;
  if (!apiKey) {
    console.log('[pi-config] NVIDIA_NIM_API_KEY not set, skipping pi agent config');
    return;
  }

  const piDir = join(homedir(), '.pi', 'agent');
  mkdirSync(piDir, { recursive: true });

  const modelsConfig = {
    providers: {
      'nvidia-nim': {
        baseUrl: 'https://integrate.api.nvidia.com/v1',
        apiKey,
        api: 'openai-completions',
        models: PI_AGENT_MODELS,
      },
    },
  };

  const modelsPath = join(piDir, 'models.json');
  writeFileSync(modelsPath, JSON.stringify(modelsConfig, null, 2));
  console.log(`[pi-config] Wrote ${PI_AGENT_MODELS.length} NIM models to ${modelsPath}`);
}
