Minai (pronounced "min-eye" or "min-aye") is a sachet-style LLM platform for emerging economies, launching initially in African countries like Kenya and Nigeria, but eventually across Southeast Asia and Latin America.

Emerging economies don't have credit cards and thus are not able to access frontier models like Claude Opus 4.6 or ChatGPT 5.2, not to mention that the $20/mo cost is quite prohibitive. Our goal with Minai is to bring cost-effective frontier models to these customers at 1/20th of the cost.

Minai will take advantage of MiniPay's distribution via the Opera browser and use micropayments to fund user's compute time. The MiniPay SDK for Android is here: https://github.com/jacksoncheek/minipay-android-sdk

Customers can deposit stablecoins ($0.10 minimum) which will be added to their balance on the app. This balance will be shown on the interface as they are chatting with Minai.

The chat interface will be inspired by @helloluis' work on https://github.com/helloluis/beaniebot, which is a mobile responsive personal AI assistant app. It uses multiple LLMs (Qwen 3.5 Flash, Qwen 3.5 Plus, Minimax 2.5) via different providers (Alibaba Cloud, Fireworks) to achieve the highest uptime possible and most efficient token usage possible. (Beaniebot is available on this local env in a folder alongside this current one that we're in.)

For this demo version, we will start with a landing page that says "Login via MiniPay". Clicking that will just create a unique user session so you can start chatting immediately. We'll eventually replace it with a proper MiniPay login workflow, but for now it will just create a unique session every time. This will eventually be replaced by a full user sign-in flow.

Our pricing for now will be in a config file: 
input_token_price_per_mil_deep: 1
output_token_price_per_mil_deep: 5
input_token_price_per_mil_fast: 0.2
output_token_price_per_mil_fast: 1

(These prices are in USD, and represent a 100% markup on Alibaba Cloud's direct pricing.)

The chat interface will be pretty minimalist. There will be a collapsed sidebar for settings and past conversation threads. These conversation threads will be pinnable, orderable, and deletable. The top bar will show the user's balance. Their first 1000 tokens worth of output are always free, and we'll show a pie-chart beside the balance amount representing how much of their allocated tokens are remaining.

The text field at the bottom of the chat interface will be minimalist but have a lot of intelligent features. First, it dynamically expands when the user enters more than one line of text, maxing out at 5 lines. It will also have 3 buttons above it, the first says "Auto", one that says "Fast" and the last says "Deep". These buttons indicate which LLM to use for a particular output, it defaults to "Auto" because the way the system works is that it first evaluates a user's prompt with Qwen 3.5 Flash, and then decides if it's easy enough for Flash to process the rest of it, or whether it needs to hand it off to Qwen 3.5 Plus. The user may choose to override this behavior by always selecting Fast or Deep.

The text field will also accept pasted images, which are automatically handled by Qwen 3.5 Plus because it's multimodal.

Messages in the chat will be pinnable, shareable, and deletable.

All deletes throughout the system are soft-deletes only.

When the user makes a prompt, the chat interface will show the LLM's reasoning stream inside a temporary frame, so we can preview its "thinking". When the reasoning is finalized, the frame will fade out and the final output message will begin streaming.

Note that much of the UX work on helloluis' beaniebot app should be carried over to this app, including things like the mobile-responsiveness of the message thread, and the ability to display tables and long links without affecting the width of the thread. There's also a "jump bar" that appears beside long messages, which let's the user jump up and down the message quickly in 15% increments.

The API reference for the Qwen models are here: https://www.alibabacloud.com/help/en/model-studio/qwen-api-via-dashscope?spm=a2c63.p38356.0.i2

The API Key is stored in .env.local

We will write a general system prompt for Minai that instructs it to be minimalist and straightforward in its responses and avoid spending tokens on being flowery and verbose. It is a helper, assistant, advisor, and friend, but it is not a romantic partner, a military strategist, medical professional, or any other role that requires human-level knowledge and liability. We want to take advantage of Qwen's advanced prompt caching to reduce the costs of our prompts as much as possible. The north star for this app is to provide frontier-grade output at the lowest possible cost. We'll do active compacting on past user messages to ensure that the context window is optimized. (Beaniebot does this too, without ever blocking the UX.)

All data will be stored in a postgresql db. We'll need tables for users, user_memory, user_balances, conversations, messages (with columns for input_token_usage and output_token_usage), compacted_messages, pinned_messages, payments.

When starting a new session with a user, Minai will say "Hello! How can I help you today?" and "Jambo! Ninaweza kukusaidia vipi leo?". This is to show that the chat can accomodate both English and Swahili prompts. I would like to show this special message in English first, and then after 2 seconds, it fades out and the Swahili text animates from below to replace it. After 2 seconds, the English version comes back, and this loop continues indefinitely. 

If the user answers back in Swahili, then the AI assumes that the user wants to converse in Swahili and this becomes our first entry in the user_memory table for that user. If the user answers back in English, that also gets logged into user_memory.

Minai will have some standard tools like web_search but because we are building this as part of the MiniPay and crypto ecosystem, we'll also give her some more robust tools for checking the current crypto price or looking at the price history of given tokens or markets. She should also have robust knowledge of MiniPay itself and Opera browser. (For now these can just be placeholders.) 