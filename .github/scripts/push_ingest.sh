#!/usr/bin/env bash
# Push a pipeline batch to the backend and wait for it to be stored.
#   push_ingest.sh <conferences.json>      (env: BACKEND_URL, INGEST_TOKEN)
# The backend answers 202 at once and processes in the background; we poll /ingest/status until done.
set -euo pipefail
OUT="$1"
API="${BACKEND_URL%/}/api/conferences"
H=(-H "x-ingest-token: $INGEST_TOKEN")

echo "Waking the backend (free Render instances sleep when idle)..."
curl -fsS --retry 6 --retry-delay 15 --retry-all-errors --max-time 90 -o /dev/null "${BACKEND_URL%/}/api/auth/status"

for attempt in 1 2 3 4 5 6; do
  code=$(curl -sS --max-time 300 -o resp.json -w '%{http_code}' -X POST "$API/ingest" "${H[@]}" \
    -H "content-type: application/json" --data-binary @"$OUT" || echo 000)
  echo "POST /ingest -> $code $(head -c 300 resp.json 2>/dev/null)"
  case "$code" in
    202) break ;;
    409) echo "Another ingest is running; waiting 60s"; sleep 60 ;;
    401|400|503) exit 1 ;;
    *) sleep 30 ;;
  esac
  [ "$attempt" = 6 ] && { echo "Could not queue the batch"; exit 1; }
done

job=$(python -c 'import json;print(json.load(open("resp.json"))["data"]["id"])')
echo "Queued job $job; waiting for it to finish (up to 30 min)..."
for _ in $(seq 1 90); do
  sleep 20
  curl -fsS --max-time 60 "${H[@]}" "$API/ingest/status" -o status.json || { echo "status check failed, retrying"; continue; }
  read -r state sid <<<"$(python -c 'import json;d=json.load(open("status.json"))["data"];print(d.get("state"), d.get("id"))')"
  if [ "$sid" != "$job" ]; then echo "Backend restarted or another job replaced ours (state=$state)"; exit 1; fi
  case "$state" in
    done)   echo "Ingest finished:"; cat status.json; echo; exit 0 ;;
    failed) echo "Ingest failed:"; cat status.json; echo; exit 1 ;;
    *)      echo "  still running..." ;;
  esac
done
echo "Timed out waiting for the ingest job"; exit 1
