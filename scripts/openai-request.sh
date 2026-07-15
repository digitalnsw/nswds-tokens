# shellcheck shell=bash
# Shared OpenAI request helper. Source this file (instead of openai-config.sh
# directly) to get the model defaults *and* a single openai_responses_text()
# function that every script in this repo uses to talk to the API.
#
# Sourcing this also sources openai-config.sh from the same directory, so
# callers get OPENAI_MODEL / OPENAI_MODEL_FAMILY / OPENAI_SUPPORTS_TEMPERATURE
# without a second source line.
#
# Requires: jq, curl, and a non-empty OPENAI_API_KEY in the environment.

OPENAI_REQUEST_LIB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./openai-config.sh
source "${OPENAI_REQUEST_LIB_DIR}/openai-config.sh"

# Default sampling temperature. Only applied when the model supports a custom
# temperature (legacy gpt-4 family); reasoning models reject the field. Override
# per-script via the OPENAI_TEMPERATURE env var (e.g. suggest-branch-name uses
# a lower value for more deterministic output).
OPENAI_TEMPERATURE="${OPENAI_TEMPERATURE:-0.4}"

# Detect --fail-with-body once. It makes curl return the response body on HTTP
# errors (so we can surface the API's .error), but it's newer than the --fail
# shipped with BSD/macOS curl, so fall back when it's unavailable.
OPENAI_CURL_FAIL_FLAG="--fail-with-body"
if ! curl --help all 2>/dev/null | grep -q -- '--fail-with-body'; then
  OPENAI_CURL_FAIL_FLAG="--fail"
fi

# openai_responses_text <system_prompt> <user_prompt> [max_output_tokens]
#
# Builds a Responses API payload, POSTs it, and echoes the model's combined
# output text on stdout. On any failure (transport, non-JSON, or an API-level
# .error) it prints a diagnostic to stderr and returns 1 — callers decide
# whether to exit or fall back.
openai_responses_text() {
  local system_prompt="$1"
  local user_prompt="$2"
  local max_output_tokens="${3:-}"

  local payload
  payload="$(jq -n \
    --arg model "$OPENAI_MODEL" \
    --arg system "$system_prompt" \
    --arg user "$user_prompt" \
    --arg max_tokens "$max_output_tokens" \
    --arg supports_temp "$OPENAI_SUPPORTS_TEMPERATURE" \
    --arg temperature "$OPENAI_TEMPERATURE" \
    '{
      model: $model,
      input: [
        { role: "system", content: [ { type: "input_text", text: $system } ] },
        { role: "user",   content: [ { type: "input_text", text: $user } ] }
      ]
    }
    + (if $max_tokens != "" then { max_output_tokens: ($max_tokens | tonumber) } else {} end)
    + (if $supports_temp == "true" then { temperature: ($temperature | tonumber) } else {} end)')"

  # `... || curl_status=$?` keeps a transport failure from tripping the caller's
  # errexit without us having to toggle (and risk clobbering) the global set -e.
  local response curl_status=0
  response="$(curl -sS "$OPENAI_CURL_FAIL_FLAG" https://api.openai.com/v1/responses \
    -H "Authorization: Bearer $OPENAI_API_KEY" \
    -H "Content-Type: application/json" \
    -d "$payload" 2>&1)" || curl_status=$?

  if [[ $curl_status -ne 0 ]]; then
    printf "❌ OpenAI API request failed (curl exit code: %s).\n" "$curl_status" >&2
    printf '%s' "$response" | head -c 400 >&2
    printf '\n' >&2
    return 1
  fi

  # Auth/proxy failures can return HTML; fail clearly instead of feeding garbage
  # to the extractor below.
  if ! printf '%s' "$response" | jq -e . >/dev/null 2>&1; then
    printf "❌ OpenAI API returned a non-JSON response.\n" >&2
    printf '%s' "$response" | head -c 400 >&2
    printf '\n' >&2
    return 1
  fi

  if printf '%s' "$response" | jq -e '.error' >/dev/null 2>&1; then
    local err_type err_msg
    err_type="$(printf '%s' "$response" | jq -r '.error.type // "unknown"')"
    err_msg="$(printf '%s' "$response" | jq -r '.error.message // ""' | head -c 200)"
    printf "❌ OpenAI API error (%s): %s\n" "$err_type" "$err_msg" >&2
    return 1
  fi

  printf '%s' "$response" | jq -r '
    [(.output[]? | select(.type=="message") | .content[]? | select(.type=="output_text") | .text)] | join("")
  '
}
