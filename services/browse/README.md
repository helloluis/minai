# Browse Service

Headless browser service (Playwright + Chromium) with a self-improving domain memory layer. Runs on the GPU/classifier box (`78.141.226.70:3100`).

## Architecture

- **Playwright + Chromium** headless browser for rendering JS-heavy pages, ASPX sites, SPAs
- **SQLite** (`browse_memories.db`) stores per-domain learnings that improve over time
- **PM2** managed, auto-restarts on reboot
- **Firewall**: port 3100 restricted to sibling VPS IPs only

## Endpoints

### `POST /browse`

Navigate to a URL, optionally interact with the page, extract content.

```json
{
  "url": "https://example.com",
  "actions": [
    { "action": "type", "selector": "#search", "text": "query" },
    { "action": "click_and_wait", "selector": "#submit" }
  ],
  "selector": ".results",
  "timeout": 15000
}
```

**Response:**
```json
{
  "ok": true,
  "url": "https://example.com/results",
  "title": "Search Results",
  "text": "...",
  "links": [{ "text": "Link", "href": "https://..." }],
  "forms": [{ "tag": "input", "type": "text", "selector": "#search", "placeholder": "Search..." }],
  "memories": ["Use /Indexes/index for keyword search instead of homepage"],
  "actions_performed": ["typed \"query\" into #search", "clicked #submit → navigated"],
  "length": 4500
}
```

**Available actions:**

| Action | Required params | Description |
|--------|----------------|-------------|
| `type` | `selector`, `text` | Clear field and type text |
| `click` | `selector` | Click element, 500ms pause |
| `click_and_wait` | `selector` | Click and wait for page navigation |
| `submit` | `selector?` | Programmatic form.submit() + wait for navigation |
| `evaluate` | `text` | Run arbitrary JS (pass code in `text`) |
| `select` | `selector`, `value` | Choose dropdown option |
| `wait` | `selector` | Wait for element to appear |
| `wait_ms` | `ms` | Pause (max 5000ms) |

**Limits:** max 20 actions per request, 30K char text cap, 15s default timeout.

**Safety:** blocks `file://`, `data://`, localhost, and private IP ranges.

### `GET /browse/memories?domain=example.com`

Retrieve all learnings for a domain. Omit `domain` to list all memories.

```json
{
  "ok": true,
  "domain": "philgeps.gov.ph",
  "memories": [
    {
      "id": 1,
      "domain": "philgeps.gov.ph",
      "learning": "Use /Indexes/index for keyword search instead of the homepage search form",
      "created_at": "2026-03-22 10:30:00"
    }
  ]
}
```

### `POST /browse/memories`

Save a new learning for a domain.

```json
{
  "domain": "philgeps.gov.ph",
  "learning": "Use /Indexes/index for keyword search instead of the homepage"
}
```

**Response:** `{ "ok": true, "id": 1, "domain": "philgeps.gov.ph", "learning": "..." }`

### `DELETE /browse/memories/:id`

Delete a specific memory by ID.

### `GET /health`

```json
{ "ok": true, "engine": "playwright-chromium", "memories": 3 }
```

## Domain Memories — How It Works

1. When `POST /browse` is called, the service extracts the domain from the URL
2. Any matching memories from `browse_page_memories` are included in the response as `memories[]`
3. The LLM sees these tips alongside the page content and can adjust its approach
4. When the LLM discovers a better navigation path, it calls `browse_page_memory` (via the minai API tool) to save the learning
5. Future requests to the same domain automatically benefit from the saved knowledge

**Design principle:** each tool on this server gets its own SQLite database and `*_memories` table. As new tools are added (e.g. a document parser, an API client), they spawn their own memory stores following the same pattern.

## Integration (minai API)

The minai API exposes two tools to the LLM:

- **`browse_web`** — calls `POST /browse`, surfaces `memories` as "Domain tips" in the response
- **`browse_page_memory`** — calls `POST /browse/memories` to save a learning

The system prompt explicitly instructs the LLM:
> Always save a learning when you find a non-obvious path that worked.

## Deployment

```bash
# On the GPU box (78.141.226.70)
cd /opt/browse-service
npm install
pm2 start server.js --name browse-service
pm2 save
```

## Files

- `server.js` — HTTP server, Playwright browser, SQLite memories
- `browse_memories.db` — SQLite database (auto-created on first run)
- `package.json` — dependencies: `playwright`, `better-sqlite3`
