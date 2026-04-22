import { FREE_CREDIT_INITIAL_USD } from '@minai/shared';

export const PRICING = {
  // USD per million tokens (100% markup on Alibaba Cloud pricing)
  input_token_price_per_mil_deep: 1,
  output_token_price_per_mil_deep: 5,
  input_token_price_per_mil_fast: 0.2,
  output_token_price_per_mil_fast: 1,

  // Free USD credit granted to every new user
  free_credit_initial_usd: FREE_CREDIT_INITIAL_USD,

  // Minimum deposit amount in USD
  min_deposit_usd: 0.10,

  // Image generation — fixed per-image cost (DashScope cost + 2x markup)
  // qwen-image-2.0: ~0.04 CNY/image → ~$0.006 USD → $0.012 with markup
  // qwen-image-edit-plus: ~0.06 CNY/image → ~$0.008 USD → $0.016 with markup
  image_gen_cost_usd: 0.012,
  image_edit_cost_usd: 0.016,
} as const;

export function calculateCost(
  model: string,
  inputTokens: number,
  outputTokens: number
): number {
  const isDeep = model === 'qwen3.5-plus' || model === 'qwen3.6-plus';
  const inputPrice = isDeep
    ? PRICING.input_token_price_per_mil_deep
    : PRICING.input_token_price_per_mil_fast;
  const outputPrice = isDeep
    ? PRICING.output_token_price_per_mil_deep
    : PRICING.output_token_price_per_mil_fast;

  return (inputTokens * inputPrice + outputTokens * outputPrice) / 1_000_000;
}
