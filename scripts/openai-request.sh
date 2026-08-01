# shellcheck shell=bash
# Shared AI request helper. Source this file (instead of openai-config.sh
# directly) to get the model defaults *and* a single openai_responses_text()
# function that every script in this repo uses to talk to the API. Requests
# go to the Vercel AI Gateway, which serves the OpenAI Responses API shape
# for any provider/model in its catalog.
#
# Sourcing this also sources openai-config.sh from the same directory, so
# callers get OPENAI_MODEL / OPENAI_MODEL_FAMILY / OPENAI_SUPPORTS_TEMPERATURE
# without a second source line.
#
# Requires: jq, curl, and a non-empty AI_GATEWAY_API_KEY in the environment.
#
# Optional Azure OpenAI fallback: when the gateway answers HTTP 402 (out of
# credits) and AZURE_OPENAI_API_KEY + AZURE_OPENAI_ENDPOINT are set, the
# request is retried against Azure OpenAI's v1 surface using the
# AZURE_OPENAI_DEPLOYMENT model deployment (default: gpt-5.6-sol). Any other
# failure — auth, transport, API error — is NOT failed over, so
# misconfiguration stays loud instead of being masked by the fallback.

OPENAI_REQUEST_LIB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./openai-config.sh
source "${OPENAI_REQUEST_LIB_DIR}/openai-config.sh"

# Default sampling temperature. Only applied when the model supports a custom
# temperature (legacy gpt-4 family); reasoning models reject the field. Override
# per-script via the OPENAI_TEMPERATURE env var (e.g. suggest-branch-name uses
# a lower value for more deterministic output).
OPENAI_TEMPERATURE="${OPENAI_TEMPERATURE:-0.4}"

# Azure fallback deployment name (the v1 surface takes the deployment name as
# the model). Only consulted when the fallback triggers.
AZURE_OPENAI_DEPLOYMENT="${AZURE_OPENAI_DEPLOYMENT:-gpt-5.6-sol}"

# _openai_responses_post <url> <auth_header> <payload> <label>
#
# POSTs a Responses API payload and prints the response body on stdout.
# Returns 0 on success, 42 when the service answered HTTP 402 (out of
# credits — the caller may fail over), and 1 on any other failure
# (transport, non-JSON, or an API-level .error). Diagnostics go to stderr.
_openai_responses_post() {
  local url="$1" auth_header="$2" payload="$3" label="$4"

  # `|| curl_status=$?` keeps a transport failure from tripping the caller's
  # errexit. The -w sentinel carries the HTTP status so 402 is detectable
  # without --fail (which would discard the distinction).
  local raw curl_status=0
  raw="$(curl -sS "$url" \
    -H "$auth_header" \
    -H "Content-Type: application/json" \
    -w $'\n__HTTP_STATUS__:%{http_code}' \
    -d "$payload" 2>&1)" || curl_status=$?

  if [[ $curl_status -ne 0 ]]; then
    printf "❌ %s request failed (curl exit code: %s).\n" "$label" "$curl_status" >&2
    printf '%s' "$raw" | head -c 400 >&2
    printf '\n' >&2
    return 1
  fi

  local http_status="${raw##*__HTTP_STATUS__:}"
  local body="${raw%$'\n'__HTTP_STATUS__:*}"

  if [[ "$http_status" == "402" ]]; then
    printf "⚠️ %s returned HTTP 402 — account is out of credits.\n" "$label" >&2
    return 42
  fi

  # Auth/proxy failures can return HTML; fail clearly instead of feeding
  # garbage to the extractor.
  if ! printf '%s' "$body" | jq -e . >/dev/null 2>&1; then
    printf "❌ %s returned a non-JSON response (HTTP %s).\n" "$label" "$http_status" >&2
    printf '%s' "$body" | head -c 400 >&2
    printf '\n' >&2
    return 1
  fi

  if printf '%s' "$body" | jq -e '.error' >/dev/null 2>&1; then
    local err_type err_msg
    err_type="$(printf '%s' "$body" | jq -r '.error.type // "unknown"')"
    err_msg="$(printf '%s' "$body" | jq -r '.error.message // ""' | head -c 200)"
    printf "❌ %s API error (%s): %s\n" "$label" "$err_type" "$err_msg" >&2
    return 1
  fi

  printf '%s' "$body"
}

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

  local response rc=0
  response="$(_openai_responses_post "https://ai-gateway.vercel.sh/v1/responses" \
    "Authorization: Bearer ${AI_GATEWAY_API_KEY}" "$payload" "AI Gateway")" || rc=$?

  # Out of gateway credits → retry on Azure OpenAI when it's configured.
  # Azure's v1 surface takes the deployment name as the model; temperature is
  # dropped because reasoning-family deployments reject a custom value (and
  # legacy deployments just use their default).
  if [[ $rc -eq 42 && -n "${AZURE_OPENAI_API_KEY:-}" && -n "${AZURE_OPENAI_ENDPOINT:-}" ]]; then
    printf "↪️ Falling back to Azure OpenAI (deployment: %s).\n" "$AZURE_OPENAI_DEPLOYMENT" >&2
    local azure_payload
    azure_payload="$(printf '%s' "$payload" \
      | jq --arg m "$AZURE_OPENAI_DEPLOYMENT" '.model = $m | del(.temperature)')"
    rc=0
    response="$(_openai_responses_post "${AZURE_OPENAI_ENDPOINT%/}/openai/v1/responses" \
      "api-key: ${AZURE_OPENAI_API_KEY}" "$azure_payload" "Azure OpenAI")" || rc=$?
  fi

  [[ $rc -eq 0 ]] || return 1

  printf '%s' "$response" | jq -r '
    [(.output[]? | select(.type=="message") | .content[]? | select(.type=="output_text") | .text)] | join("")
  '
}
