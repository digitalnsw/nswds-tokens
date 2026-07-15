# shellcheck shell=bash
# shellcheck disable=SC2034  # variables are consumed by the sourcing scripts
# Shared OpenAI configuration. Source this file to get a single, consistent
# default model across every script in this repo.
#
# Override the model for any script via the OPENAI_MODEL env var, e.g.
#   OPENAI_MODEL=gpt-4o ./scripts/git-commit.sh

# Single source of truth for the default model. Change it here once and every
# script that sources this file picks it up.
OPENAI_MODEL="${OPENAI_MODEL:-gpt-5.5}"

# Classify the model so callers can adapt their request parameters. Newer
# reasoning-style models (gpt-5*, o1/o3/o4*) differ from the gpt-4 family:
#   - they reject a custom `temperature` (only the default is allowed);
#   - on the Chat Completions API they require `max_completion_tokens`
#     instead of `max_tokens`;
#   - they spend output tokens on hidden reasoning, so they need a larger
#     output-token budget to actually emit a result.
OPENAI_MODEL_FAMILY="legacy"
case "$OPENAI_MODEL" in
  gpt-5*|o1*|o3*|o4*) OPENAI_MODEL_FAMILY="reasoning" ;;
esac

# Convenience flag: whether the model accepts a custom `temperature`. When
# "false", callers must omit the field entirely rather than send a value.
if [[ "$OPENAI_MODEL_FAMILY" == "reasoning" ]]; then
  OPENAI_SUPPORTS_TEMPERATURE="false"
else
  OPENAI_SUPPORTS_TEMPERATURE="true"
fi
