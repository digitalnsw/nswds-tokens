# shellcheck shell=bash
# shellcheck disable=SC2034  # variables are consumed by the sourcing scripts
# Shared model configuration. Source this file to get a single, consistent
# default model across every script in this repo. Requests are routed through
# the Vercel AI Gateway, so model identifiers use the gateway's
# provider/model form (e.g. openai/gpt-5.5, anthropic/claude-sonnet-4.6).
#
# Override for any script via the AI_MODEL / AI_PROVIDER env vars, e.g.
#   AI_MODEL=openai/gpt-4o ./scripts/git-commit.sh
# or by putting them in the repo's .env (see load-dotenv.sh). A bare model name
# without a provider prefix is assumed to be OpenAI's, so pre-gateway overrides
# like AI_MODEL=gpt-4o keep working. OPENAI_MODEL is still honoured as a
# deprecated alias.

# Single source of truth for the default model. Change it here once and every
# script that sources this file picks it up.
#
# gpt-5.6-sol, not the older gpt-5.5: several openai/* models currently fail
# through the gateway with an Azure "deployment does not exist" 404 (gpt-5.5 and
# gpt-4o-mini both reproduce it), while gpt-5.6-sol resolves on every provider
# we tested. Re-check before changing.
AI_MODEL="${AI_MODEL:-${OPENAI_MODEL:-openai/gpt-5.6-sol}}"

# Back-compat: prefix bare model names with the openai/ provider.
if [[ "$AI_MODEL" != */* ]]; then
  AI_MODEL="openai/${AI_MODEL}"
fi

# Pin the gateway to a single provider (e.g. azure) rather than letting it pick.
# Sent as providerOptions.gateway.only — a hard pin, so there is no failover to
# another provider if this one is unavailable.
#
# To restore the gateway's own routing, set AI_PROVIDER to an empty string or to
# the literal `none`. Both work here; `none` also works in CI, where an empty
# value is impossible to express (GitHub Actions renders an unset and an empty
# org variable identically as ""), so the two surfaces share one mental model.
#
# `-` rather than `:-`: only an *unset* variable takes the default, so an
# explicit empty value survives instead of being forced back to azure.
AI_PROVIDER="${AI_PROVIDER-azure}"
if [[ "$AI_PROVIDER" == "none" ]]; then
  AI_PROVIDER=""
fi

# Deprecated alias, kept so existing overrides and any local scripts that read
# OPENAI_MODEL still see the resolved value.
OPENAI_MODEL="$AI_MODEL"

# Classify the model so callers can adapt their request parameters. Newer
# reasoning-style models (gpt-5*, o1/o3/o4*) differ from the gpt-4 family:
#   - they reject a custom `temperature` (only the default is allowed);
#   - on the Chat Completions API they require `max_completion_tokens`
#     instead of `max_tokens`;
#   - they spend output tokens on hidden reasoning, so they need a larger
#     output-token budget to actually emit a result.
# Non-OpenAI providers are treated as reasoning-family: the larger output
# budget is harmless, and omitting `temperature` avoids 400s from models
# that reject the field.
case "$AI_MODEL" in
  openai/gpt-5*|openai/o1*|openai/o3*|openai/o4*) OPENAI_MODEL_FAMILY="reasoning" ;;
  openai/*) OPENAI_MODEL_FAMILY="legacy" ;;
  *) OPENAI_MODEL_FAMILY="reasoning" ;;
esac

# Convenience flag: whether the model accepts a custom `temperature`. When
# "false", callers must omit the field entirely rather than send a value.
if [[ "$OPENAI_MODEL_FAMILY" == "reasoning" ]]; then
  OPENAI_SUPPORTS_TEMPERATURE="false"
else
  OPENAI_SUPPORTS_TEMPERATURE="true"
fi
