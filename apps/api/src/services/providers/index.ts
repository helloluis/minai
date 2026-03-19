/**
 * Provider factory — returns the configured LLM provider and model IDs.
 * Centralizes provider selection so all services use the same backend.
 */

import { DashScopeProvider } from './dashscope.js';
import { NIMProvider } from './nim.js';

export type ProviderWithComplete = DashScopeProvider | NIMProvider;

const LLM_PROVIDER = process.env.LLM_PROVIDER ?? 'dashscope';

let _provider: ProviderWithComplete | null = null;

export function getProvider(): ProviderWithComplete {
  if (!_provider) {
    _provider = LLM_PROVIDER === 'nim'
      ? new NIMProvider(process.env.NVIDIA_NIM_API_KEY!)
      : new DashScopeProvider(process.env.DASHSCOPE_API_KEY!);
  }
  return _provider;
}

export const MODEL_FAST = LLM_PROVIDER === 'nim'
  ? (process.env.NIM_MODEL_FAST ?? 'meta/llama-3.3-70b-instruct')
  : 'qwen3.5-flash';

export const MODEL_DEEP = LLM_PROVIDER === 'nim'
  ? (process.env.NIM_MODEL_DEEP ?? 'qwen/qwen3.5-397b-a17b')
  : 'qwen3.5-plus';
