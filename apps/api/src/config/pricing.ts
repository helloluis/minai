export const PRICING = {
  // USD per million tokens (100% markup on Alibaba Cloud pricing)
  input_token_price_per_mil_deep: 1,
  output_token_price_per_mil_deep: 5,
  input_token_price_per_mil_fast: 0.2,
  output_token_price_per_mil_fast: 1,

  // Free output tokens granted to every new user
  free_tokens_initial: 10000,

  // Minimum deposit amount in USD
  min_deposit_usd: 0.10,
} as const;

export function calculateCost(
  model: 'qwen-turbo-latest' | 'qwen-plus-latest',
  inputTokens: number,
  outputTokens: number
): number {
  const isDeep = model === 'qwen-plus-latest';
  const inputPrice = isDeep
    ? PRICING.input_token_price_per_mil_deep
    : PRICING.input_token_price_per_mil_fast;
  const outputPrice = isDeep
    ? PRICING.output_token_price_per_mil_deep
    : PRICING.output_token_price_per_mil_fast;

  return (inputTokens * inputPrice + outputTokens * outputPrice) / 1_000_000;
}
