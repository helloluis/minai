/**
 * Brave Search API integration
 * Uses the LLM Context API for AI-optimized search with pre-extracted page content
 * https://api-dashboard.search.brave.com/documentation/services/llm-context
 */

interface BraveSearchResult {
  title: string;
  url: string;
  description: string;
  content?: string;
  age?: string;
}

interface BraveLLMContextResponse {
  grounding: {
    generic?: Array<{
      url: string;
      snippets: Array<{
        text: string;
        relevance_score?: number;
      }>;
    }>;
    poi?: unknown;
    map?: unknown;
  };
  sources: Array<{
    url: string;
    title: string;
    hostname: string;
    page_age?: string;
  }>;
}

interface BraveWebSearchResponse {
  query: { original: string };
  web?: {
    results: Array<{
      title: string;
      url: string;
      description: string;
      age?: string;
      extra_snippets?: string[];
    }>;
  };
  news?: {
    results: Array<{
      title: string;
      url: string;
      description: string;
      age?: string;
    }>;
  };
}

const BRAVE_API_KEY = process.env.BRAVE_API_KEY;

/**
 * Search the web using Brave LLM Context API.
 * Returns pre-extracted page content optimized for LLM grounding.
 * Falls back to legacy web search if LLM Context fails.
 */
export async function searchWeb(
  query: string,
  options: {
    count?: number;
    freshness?: 'pd' | 'pw' | 'pm' | 'py';
    country?: string;
    maxTokens?: number;
  } = {},
): Promise<{ results: BraveSearchResult[]; query: string }> {
  if (!BRAVE_API_KEY) throw new Error('BRAVE_API_KEY not configured');

  const urlCount = Math.min(options.count || 5, 10);
  const params = new URLSearchParams({
    q: query,
    count: String(Math.max(urlCount * 2, 10)),
    maximum_number_of_urls: String(urlCount),
    maximum_number_of_tokens: String(options.maxTokens || 4096),
    maximum_number_of_snippets_per_url: '5',
    context_threshold_mode: 'balanced',
    search_lang: 'en',
  });
  if (options.country) params.set('country', options.country);
  if (options.freshness) params.set('freshness', options.freshness);

  console.log(`[Brave] LLM Context search: "${query}"`);

  try {
    const response = await fetch(
      `https://api.search.brave.com/res/v1/llm/context?${params}`,
      {
        headers: {
          Accept: 'application/json',
          'Accept-Encoding': 'gzip',
          'X-Subscription-Token': BRAVE_API_KEY,
        },
      },
    );

    if (!response.ok) {
      console.error(`[Brave] LLM Context API error: ${response.status}`);
      return searchWebLegacy(query, options);
    }

    const data = (await response.json()) as BraveLLMContextResponse;

    // Build source lookup
    const sourceMap = new Map<string, { title: string; age?: string }>();
    const sources = Array.isArray(data.sources) ? data.sources : [];
    for (const source of sources) {
      if (source?.url) {
        sourceMap.set(source.url, { title: source.title || '', age: source.page_age });
      }
    }

    const results: BraveSearchResult[] = [];
    const genericResults = Array.isArray(data.grounding?.generic)
      ? data.grounding.generic
      : [];

    for (const item of genericResults) {
      if (!item?.url) continue;
      const source = sourceMap.get(item.url);
      const snippets = Array.isArray(item.snippets) ? item.snippets : [];
      const sortedSnippets = snippets
        .filter((s) => s?.text)
        .sort((a, b) => (b.relevance_score || 0) - (a.relevance_score || 0));

      const content = sortedSnippets
        .map((s) => s.text.trim())
        .filter((t) => t.length > 0)
        .join('\n\n');

      const description = sortedSnippets[0]?.text?.slice(0, 300) || '';

      results.push({
        title: source?.title || new URL(item.url).hostname,
        url: item.url,
        description,
        content: content || undefined,
        age: source?.age,
      });
    }

    console.log(`[Brave] LLM Context returned ${results.length} results`);
    return { query, results: results.slice(0, options.count || 5) };
  } catch (err) {
    console.error('[Brave] LLM Context fetch failed, falling back to legacy:', err);
    return searchWebLegacy(query, options);
  }
}

/**
 * Legacy web search fallback.
 */
export async function searchWebLegacy(
  query: string,
  options: {
    count?: number;
    freshness?: 'pd' | 'pw' | 'pm' | 'py';
    country?: string;
  } = {},
): Promise<{ results: BraveSearchResult[]; query: string }> {
  if (!BRAVE_API_KEY) throw new Error('BRAVE_API_KEY not configured');

  console.log(`[Brave] Legacy web search: "${query}"`);

  const params = new URLSearchParams({
    q: query,
    count: String(options.count || 5),
    text_decorations: 'false',
    search_lang: 'en',
  });
  if (options.freshness) params.set('freshness', options.freshness);
  if (options.country) params.set('country', options.country);

  const response = await fetch(
    `https://api.search.brave.com/res/v1/web/search?${params}`,
    {
      headers: {
        Accept: 'application/json',
        'Accept-Encoding': 'gzip',
        'X-Subscription-Token': BRAVE_API_KEY,
      },
    },
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Brave Search error: ${response.status} - ${errorText}`);
  }

  const data = (await response.json()) as BraveWebSearchResponse;
  const results: BraveSearchResult[] = [];

  const webResults = Array.isArray(data.web?.results) ? data.web.results : [];
  for (const r of webResults) {
    if (r?.url) {
      results.push({
        title: r.title || '',
        url: r.url,
        description: r.description || '',
        age: r.age,
      });
    }
  }

  const newsResults = Array.isArray(data.news?.results) ? data.news.results : [];
  for (const r of newsResults) {
    if (r?.url) {
      results.push({
        title: `[News] ${r.title || ''}`,
        url: r.url,
        description: r.description || '',
        age: r.age,
      });
    }
  }

  console.log(`[Brave] Legacy returned ${results.length} results`);
  return { query: data.query?.original || query, results: results.slice(0, options.count || 5) };
}

/** Check if Brave Search is configured. */
export function isBraveConfigured(): boolean {
  return !!BRAVE_API_KEY;
}
