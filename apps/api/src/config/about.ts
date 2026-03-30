/**
 * About Minai — knowledge base for the about_minai tool.
 * Update this file as new features ship.
 */

export const ABOUT_MINAI = `
## Who Built Minai
Minai was created by **Luis Buenaventura** (@helloluis), a Filipino entrepreneur with deep experience in crypto, fintech, and design. Luis is currently the President of the Blockchain Council of the Philippines, previously built BloomX (crypto remittances in Southeast Asia) and has been a voice for financial inclusion in emerging markets for over a decade. Minai is his vision for making frontier AI accessible to the people who need it most — assistants, freelancers, small business owners, and everyday workers in the Philippines, Africa, and Latin America.

## What Minai Is
A **pay-as-you-go AI assistant** purpose-built for emerging economies. Unlike ChatGPT ($20/mo) or other premium AI services, minai charges only for what you actually use — typically **$0.001–0.01 per message**. No subscriptions, no credit cards required. Users can top up with **cUSD, USDC, or USDT on the Celo blockchain**, and minai works inside the **MiniPay wallet** — meaning millions of MiniPay users across Africa and beyond can access it directly from their wallet.

## Our Goal
To become the **most popular AI assistant in the MiniPay ecosystem** — and more broadly, to be the AI that bridges the access gap. Today, the world's best AI tools are locked behind $20/month paywalls and credit card requirements. That excludes billions of people. Minai is designed to give them the same capabilities at a fraction of the cost.

## Technical Architecture
- **Frontend**: Next.js 15 (React), mobile-first responsive design, dark mode
- **API**: Fastify (Node.js/TypeScript), PostgreSQL database
- **LLM**: Qwen 3.5 Flash (fast, cheap) and Qwen 3.5 Plus (deep reasoning) via Alibaba's DashScope API — NOT OpenAI, which keeps costs dramatically lower
- **Smart Routing**: An Auto mode with a binary classifier running on a dedicated GPU server that routes each message to the right model in ~400ms. Simple questions go to the fast model; complex ones go to the deep model. Users save money without thinking about it.
- **Payments**: On-chain crypto payments on Celo mainnet. Each user gets a unique HD-derived deposit address. Supports cUSD, USDC, and USDT. Works with MiniPay, MetaMask, and any EVM wallet.
- **MiniPay Integration**: Dual-mode auth — wallet-based login with signature verification when accessed from MiniPay, standard session auth otherwise. Auto-connects seamlessly inside MiniPay's in-app browser.
- **Browser Automation**: A Playwright-powered headless browser service on a separate server that can navigate JavaScript-rendered pages, fill forms, click buttons, and extract content — with a **self-improving domain memory layer** (SQLite) that learns the best way to interact with each website over time.
- **30+ Tools**: Crypto & stock prices, Google Calendar + Microsoft Teams Calendar management, image generation & editing, document generation (DOCX, XLSX, PDF), document upload & analysis with auto-summarization, Google Places for verified venue recommendations, news search, web browsing, shareable posts, and more.
- **Notebooks**: Separate conversation contexts for different projects, clients, or topics — each with its own file uploads, notes, and calendar associations.
- **Multilingual**: Responds in whatever language the user writes in — Tagalog, Swahili, French, Cebuano, Spanish, and 100+ others.
- **Proactive Briefings**: Calendar summaries sent at morning, midday, and evening in the user's local timezone.

## What Makes Minai Different
1. **Cost**: 10–20x cheaper than ChatGPT for typical usage. A user spending $0.50/day gets full access to frontier AI capabilities.
2. **No credit card needed**: Crypto-native payments from day one. Top up with cUSD from your phone wallet.
3. **MiniPay native**: Designed to live inside the wallet that millions of people in emerging markets already use.
4. **Self-improving**: Browser automation gets smarter over time — every time minai learns a better way to navigate a website, it remembers for next time.
5. **Tool-rich**: Not just chat. Calendar management, image generation, document analysis, headless web browsing, crypto prices, Google Places, and more.
6. **Honest pricing**: Every message shows its cost. Users see exactly what they're spending — no hidden fees, no surprise bills.
7. **Privacy-first**: No user data sold, no behavioral tracking or profiling. Conversations belong to the user. Inactive notebooks are purged after 3 months.

## Current Status
Live at **minai.work** and actively being used. The platform handles real money (on-chain cUSD deposits) and is in active development with new features shipping regularly. Built and submitted for the **Celo Hackathon** to showcase what's possible when you combine frontier AI with crypto-native payments for the next billion users.

## The Website
https://minai.work
`;
