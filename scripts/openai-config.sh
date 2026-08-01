# shellcheck shell=bash
# shellcheck disable=SC2034  # variables are consumed by the sourcing scripts
# Shared model configuration. Source this file to get a single, consistent
# default model across every script in this repo. Requests are routed through
# the Vercel AI Gateway, so model identifiers use the gateway's
# provider/model form (e.g. openai/gpt-5.5, anthropic/claude-sonnet-4.6).
#
# Override the model for any script via the OPENAI_MODEL env var, e.g.
#   OPENAI_MODEL=openai/gpt-4o ./scripts/git-commit.sh
# (a bare model name without a provider prefix is assumed to be OpenAI's,
# so pre-gateway overrides like OPENAI_MODEL=gpt-4o keep working).

# Single source of truth for the default model. Change it here once and every
# script that sources this file picks it up.
OPENAI_MODEL="${OPENAI_MODEL:-openai/gpt-5.5}"

# Back-compat: prefix bare model names with the openai/ provider.
if [[ "$OPENAI_MODEL" != */* ]]; then
  OPENAI_MODEL="openai/${OPENAI_MODEL}"
fi

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
case "$OPENAI_MODEL" in
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
