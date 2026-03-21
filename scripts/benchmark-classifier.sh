#!/bin/bash
# Benchmark local Ollama classifier on GPU VPS
# Usage: bash benchmark-classifier.sh

set -e

echo "=== Step 1: Install Ollama ==="
if ! command -v ollama &> /dev/null; then
  curl -fsSL https://ollama.com/install.sh | sh
  sleep 3
fi

echo ""
echo "=== Step 2: Pull model ==="
ollama pull qwen3:4b

echo ""
echo "=== Step 3: Check GPU ==="
nvidia-smi 2>/dev/null || echo "No nvidia-smi (CPU only?)"

echo ""
echo "=== Step 4: Check RAM ==="
free -m

echo ""
echo "=== Step 5: Cold start benchmark ==="

PROMPT_TEMPLATE='/no_think
Does this message need AI tools (calendar/files/images/search/prices) or is it just simple chitchat? Answer: tools or chitchat

"hi" chitchat
"yes" tools
"ok do it" tools
"sure" tools
"create event" tools
"check calendar" tools
"summarize PDF" tools
"make image" tools
"bitcoin price" tools
"kumusta" tools
"whats 2+2" chitchat
"hello" chitchat
"thanks" chitchat
"ok thanks" chitchat

'

classify() {
  local msg="$1"
  local expected="$2"
  local start=$(date +%s%N)
  local raw=$(curl -s http://localhost:11434/api/generate -d "{
    \"model\": \"qwen3:4b\",
    \"prompt\": \"${PROMPT_TEMPLATE}\\\"${msg}\\\"\",
    \"stream\": false,
    \"options\": {\"num_predict\": 3, \"temperature\": 0},
    \"raw\": true
  }")
  local end=$(date +%s%N)
  local ms=$(( (end - start) / 1000000 ))
  local response=$(echo "$raw" | grep -o '"response":"[^"]*"' | sed 's/"response":"//;s/"//')
  local result="???"
  if echo "$response" | grep -qi "chitchat"; then result="simple"; else result="balanced"; fi
  local match="✗"
  if [ "$result" = "$expected" ]; then match="✓"; fi
  printf "%6dms | %s %-10s (expected %-10s) | %s\n" "$ms" "$match" "$result" "$expected)" "$msg"
}

echo ""
echo "=== Step 6: Real-world message benchmarks ==="
echo ""
echo "--- Greetings / chitchat (expect: simple) ---"
classify "hi" "simple"
classify "Hey" "simple"
classify "Hi" "simple"
classify "Brisa" "simple"
classify "hello :) just checking how this works." "simple"
classify "ok great thanks" "simple"
classify "thanks" "simple"
classify "what type of folks usually hire VAs" "simple"

echo ""
echo "--- Confirmations (expect: balanced — likely trigger tool) ---"
classify "yup sounds great" "balanced"
classify "ok do it" "balanced"
classify "try again?" "balanced"
classify "No it's fine, Ill do it some other time" "balanced"
classify "lets try it again" "balanced"
classify "sure" "balanced"

echo ""
echo "--- Calendar / scheduling (expect: balanced) ---"
classify "whats on my calendar for tomorrow?" "balanced"
classify "What's my schedule like tomorrow" "balanced"
classify "can you add a 430pm merienda coffee with Beanie in BGC" "balanced"
classify "add a gym session in my calendar for tomorrow at 3pm" "balanced"
classify "on my family calendar, add a 930am psychiatric appointment" "balanced"
classify "Can you create a content calendar" "balanced"
classify "can you already see my calendar" "balanced"
classify "Let's talk thru the weekend schedule" "balanced"

echo ""
echo "--- Image gen/edit (expect: balanced) ---"
classify "can you make me a really dramatic photo of a shiba inu" "balanced"
classify "can you make this into a professional looking headshot?" "balanced"
classify "maybe a little bit more texture in the background" "balanced"
classify "put me in a white three piece suit" "balanced"
classify "the suit looks good but the background needs to be different" "balanced"

echo ""
echo "--- File / document analysis (expect: balanced) ---"
classify "i need a summary of this PDF and highlight some critical mistakes" "balanced"
classify "ok what can you tell me about the 69 files i just uploaded?" "balanced"
classify "what can you tell me about the 10 PDFs i just uploaded" "balanced"

echo ""
echo "--- Feature suggestions (expect: balanced) ---"
classify "i wanna send a feature suggestion" "balanced"
classify "i have a feature suggestion for you" "balanced"

echo ""
echo "--- Non-English (expect: balanced) ---"
classify "puwede mo ba pagandahin itong picture ko" "balanced"
classify "magkano ang bitcoin ngayon" "balanced"

echo ""
echo "--- Web search / news (expect: balanced) ---"
classify "can you give me an update on the Iran war" "balanced"
classify "Search resources for each part" "balanced"

echo ""
echo "--- Deep reasoning (expect: balanced or deep, both ok) ---"
classify "Could you explain to me how Nvidia's NIM is different from Fireworks" "balanced"

echo ""
echo "--- Context-dependent (with recent messages) ---"
echo ""
echo "Testing with conversation context..."

# Test with context
for test_case in \
  "CTX:[user]: i have a feature suggestion|[assistant]: Tell me your idea!|MSG:it should have email forwarding" \
  "CTX:[user]: add a meeting tomorrow|[assistant]: Done! Created meeting.|MSG:ok sounds great" \
  "CTX:[user]: generate a headshot|[assistant]: Here is your headshot!|MSG:make the background blue" \
  "CTX:[user]: summarize this PDF|[assistant]: Here is the summary...|MSG:can you make it shorter"; do

  ctx=$(echo "$test_case" | sed 's/|MSG:.*//' | sed 's/CTX://' | tr '|' '\n')
  msg=$(echo "$test_case" | sed 's/.*MSG://')

  start=$(date +%s%N)
  raw=$(curl -s http://localhost:11434/api/generate -d "{
    \"model\": \"qwen3:4b\",
    \"prompt\": \"/no_think\nDoes this message need AI tools (calendar/files/images/search/prices) or is it just simple chitchat? Consider the conversation context. Answer: tools or chitchat\n\n\\\"hi\\\" chitchat\n\\\"yes\\\" tools\n\\\"ok do it\\\" tools\n\\\"sure\\\" tools\n\\\"create event\\\" tools\n\\\"check calendar\\\" tools\n\\\"summarize PDF\\\" tools\n\\\"make image\\\" tools\n\\\"bitcoin price\\\" tools\n\\\"kumusta\\\" tools\n\\\"whats 2+2\\\" chitchat\n\\\"hello\\\" chitchat\n\\\"thanks\\\" chitchat\n\\\"ok thanks\\\" chitchat\n\nContext:\n${ctx}\n\nMessage: \\\"${msg}\\\"\",
    \"stream\": false,
    \"options\": {\"num_predict\": 3, \"temperature\": 0},
    \"raw\": true
  }")
  end=$(date +%s%N)
  ms=$(( (end - start) / 1000000 ))
  response=$(echo "$raw" | grep -o '"response":"[^"]*"' | sed 's/"response":"//;s/"//')
  result="???"
  if echo "$response" | grep -qi "chitchat"; then result="simple"; else result="balanced"; fi
  printf "%6dms | %-10s | %-40s | (with context)\n" "$ms" "$result" "$msg"
done

echo ""
echo "=== Step 7: RAM after model loaded ==="
free -m

echo ""
echo "=== Step 8: GPU memory usage ==="
nvidia-smi 2>/dev/null | grep -E 'MiB|%' || echo "No GPU stats"

echo ""
echo "=== Done ==="
