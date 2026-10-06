#!/usr/bin/env bash
# Build first (npm run build). Runs a production server on :3101 against a fake Qwen and exercises /api/assistant and /api/rate.
set -u
DIR=$(cd "$(dirname "$0")" && pwd -W)
APP=http://127.0.0.1:3101
cleanup() {
  for port in 8599 3101; do
    pid=$(netstat -ano | grep -E "127.0.0.1:$port |0.0.0.0:$port |\[::\]:$port " | grep LISTENING | awk '{print $NF}' | head -1)
    [ -n "$pid" ] && taskkill //F //T //PID "$pid" >/dev/null 2>&1
  done
}
trap cleanup EXIT

(cd "$DIR" && python mock_qwen.py > mock.log 2>&1 &)
(cd /e/monad/metropolis/app && QWEN_API_KEY=test-key QWEN_BASE_URL=http://127.0.0.1:8599/ npx next start -p 3101 > "$DIR/next3101.log" 2>&1 &)
for _ in $(seq 1 90); do curl -s -o /dev/null "$APP/api/assistant" && break; sleep 1; done

ask() { curl -s -w ' [HTTP %{http_code}]' -X POST "$APP/api/assistant" -H 'Content-Type: application/json' -d "{\"messages\":[{\"role\":\"user\",\"content\":\"$1\"}]}"; echo; }

echo "rate:              $(curl -s $APP/api/rate)"
echo "GET enabled:       $(curl -s $APP/api/assistant)"
echo "INR to Mom:        $(ask 'send 5000 rupees to mom')"
echo "USD, no name:      $(ask 'send 50 dollars')"
echo "over cap:          $(ask 'send huge amount in rupees')"
echo "rounds to zero:    $(ask 'send tiny usd')"
echo "bad currency:      $(ask 'nocurrency 100')"
echo "malformed args:    $(ask 'badjson')"
echo "not a payment:     $(ask 'what is the weather')"
echo "guessed currency:  $(ask 'send 3000 to mom')"
echo "empty history:     $(curl -s -w ' [HTTP %{http_code}]' -X POST $APP/api/assistant -H 'Content-Type: application/json' -d '{"messages":[]}')"
echo "--- request sent to Qwen:"
python -c "
import json;d=json.load(open('$DIR/last_request.json'));b=d['body']
print('auth prefix:', d['auth'], '| model:', b['model'], '| temperature:', b['temperature'], '| tool:', b['tools'][0]['function']['name'], '| first role:', b['messages'][0]['role'])"
echo "--- server errors:"; grep -iE "error|failed" "$DIR/next3101.log" | head -5
