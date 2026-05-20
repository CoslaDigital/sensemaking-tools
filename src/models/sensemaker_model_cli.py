# Copyright 2025 Google LLC
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

"""Shared CLI options for selecting SensemakingLlm backends (gemini / openai-compatible)."""

from __future__ import annotations

import argparse
import os
from dataclasses import dataclass, replace
from typing import Literal
from urllib.parse import urlparse

from src.models.sensemaking_llm import SensemakingLlm

SensemakerAdapter = Literal["gemini", "openai-compatible"]
OpenAiCompatProvider = Literal["openai", "openrouter", "mistral"]

DEFAULT_ADAPTER: SensemakerAdapter = "gemini"
DEFAULT_OPENAI_BASE_URL = "https://api.openai.com/v1"
DEFAULT_OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"
DEFAULT_MISTRAL_BASE_URL = "https://api.mistral.ai/v1"

OPENAI_COMPAT_DEFAULT_BASE_URL: dict[OpenAiCompatProvider, str] = {
    "openai": DEFAULT_OPENAI_BASE_URL,
    "openrouter": DEFAULT_OPENROUTER_BASE_URL,
    "mistral": DEFAULT_MISTRAL_BASE_URL,
}

OPENAI_COMPAT_ENV_KEYS: dict[OpenAiCompatProvider, str] = {
    "openai": "OPENAI_API_KEY",
    "openrouter": "OPENROUTER_API_KEY",
    "mistral": "MISTRAL_API_KEY",
}


@dataclass
class SensemakerModelConfig:
  """Parsed LLM adapter settings from CLI arguments."""

  adapter: SensemakerAdapter
  provider: OpenAiCompatProvider | None
  base_url: str
  model_name: str | None
  api_key: str | None
  openrouter_site_url: str | None
  openrouter_app_name: str | None


def normalize_base_url(url: str) -> str:
  """Strips trailing slashes from an API base URL."""
  return url.rstrip("/")


def normalize_adapter(value: str | None) -> SensemakerAdapter:
  """Validates and normalizes --adapter."""
  s = (value or DEFAULT_ADAPTER).lower().strip()
  if s == "gemini":
    return "gemini"
  if s == "openai-compatible":
    return "openai-compatible"
  raise ValueError(
      f'Invalid --adapter "{value}". Use "gemini" or "openai-compatible".'
  )


def normalize_provider(value: str | None) -> OpenAiCompatProvider | None:
  """Validates and normalizes --provider."""
  if value is None or str(value).strip() == "":
    return None
  s = str(value).lower().strip()
  if s in ("openai", "openrouter", "mistral"):
    return s  # type: ignore[return-value]
  raise ValueError(
      f'Invalid --provider "{value}". Use "openai", "openrouter", or "mistral".'
  )


def get_base_url(
    adapter: SensemakerAdapter,
    provider: OpenAiCompatProvider | None,
    explicit: str | None,
) -> str:
  """Resolves base URL from explicit flag or adapter/provider presets."""
  if explicit and str(explicit).strip():
    return normalize_base_url(str(explicit).strip())
  if adapter == "openai-compatible" and provider:
    return OPENAI_COMPAT_DEFAULT_BASE_URL[provider]
  return ""


def add_sensemaker_model_options(parser: argparse.ArgumentParser) -> None:
  """Registers shared LLM adapter flags on an ArgumentParser."""
  parser.add_argument(
      "--adapter",
      type=str,
      default=DEFAULT_ADAPTER,
      help=(
          'LLM adapter: "gemini" (default, Google AI Studio) or'
          ' "openai-compatible".'
      ),
  )
  parser.add_argument(
      "--provider",
      type=str,
      default=None,
      help=(
          'Provider preset when --adapter is openai-compatible: "openai",'
          ' "openrouter", or "mistral".'
      ),
  )
  parser.add_argument(
      "--base_url",
      type=str,
      default=None,
      help="API base URL override. Defaults depend on --adapter and --provider.",
  )
  parser.add_argument(
      "--api_key",
      type=str,
      default=None,
      help="API key override. Otherwise uses provider-specific env vars.",
  )
  parser.add_argument(
      "--openrouter_site_url",
      type=str,
      default=None,
      help="Optional HTTP-Referer header for OpenRouter attribution.",
  )
  parser.add_argument(
      "--openrouter_app_name",
      type=str,
      default=None,
      help="Optional X-Title header for OpenRouter attribution.",
  )


def parse_sensemaker_model_opts(args: argparse.Namespace) -> SensemakerModelConfig:
  """Builds SensemakerModelConfig from parsed argparse.Namespace."""
  adapter = normalize_adapter(getattr(args, "adapter", None))
  provider = normalize_provider(getattr(args, "provider", None))
  base_url = get_base_url(
      adapter, provider, getattr(args, "base_url", None)
  )
  api_key = getattr(args, "api_key", None)
  if api_key:
    api_key = api_key.strip() or None
  return SensemakerModelConfig(
      adapter=adapter,
      provider=provider,
      base_url=base_url,
      model_name=getattr(args, "model_name", None),
      api_key=api_key,
      openrouter_site_url=getattr(args, "openrouter_site_url", None),
      openrouter_app_name=getattr(args, "openrouter_app_name", None),
  )


def resolve_api_key(opts: SensemakerModelConfig) -> str | None:
  """Resolves API key from CLI or environment."""
  if opts.api_key:
    return opts.api_key
  if opts.adapter == "gemini":
    return os.getenv("GOOGLE_API_KEY")
  if opts.adapter == "openai-compatible" and opts.provider:
    return os.getenv(OPENAI_COMPAT_ENV_KEYS[opts.provider])
  return None


def validate_sensemaker_model_opts(opts: SensemakerModelConfig) -> None:
  """Raises ValueError if options are inconsistent or incomplete."""
  if opts.adapter == "openai-compatible":
    if not opts.provider:
      raise ValueError(
          '--provider is required when --adapter is openai-compatible. Use'
          ' "openai", "openrouter", or "mistral".'
      )
    if not opts.model_name:
      raise ValueError(
          "--model_name is required when --adapter is openai-compatible."
      )
    try:
      urlparse(opts.base_url)
      if not opts.base_url.startswith("http"):
        raise ValueError()
    except ValueError as e:
      raise ValueError(
          f'Invalid --base_url "{opts.base_url}". Expected a full URL.'
      ) from e
    if not resolve_api_key(opts):
      env_var = OPENAI_COMPAT_ENV_KEYS[opts.provider]
      raise ValueError(
          f'API key is required for provider "{opts.provider}". Pass'
          f" --api_key or set {env_var}."
      )
  elif opts.adapter == "gemini":
    # API key is resolved when constructing GenaiModel (GOOGLE_API_KEY or --api_key).
    pass


def resolve_cli_api_key_from_args(
    args: argparse.Namespace,
    explicit_api_key: str | None = None,
) -> str | None:
  """Resolves API key from explicit arg, ``--api_key``, or legacy ``--gemini_api_key``."""
  if explicit_api_key and str(explicit_api_key).strip():
    return str(explicit_api_key).strip()
  for attr in ("api_key", "gemini_api_key"):
    val = getattr(args, attr, None)
    if val and str(val).strip():
      return str(val).strip()
  return None


def create_llm_from_args(
    args: argparse.Namespace,
    *,
    model_name: str | None = None,
    api_key: str | None = None,
    max_llm_retries: int | None = None,
    stats_log_file: str | None = None,
) -> SensemakingLlm:
  """Creates a SensemakingLlm from argparse Namespace and shared adapter flags.

  Args:
    args: Parsed CLI arguments including adapter/provider flags.
    model_name: Overrides ``--model_name`` when the runner uses a different flag
      name (e.g. ``--eval_model_name``) or a per-stage model id.
    api_key: Explicit API key override; else uses ``--api_key``, legacy
      ``--gemini_api_key``, or provider env vars.
    max_llm_retries: Optional retry override for the backend.
    stats_log_file: Optional path for stage stats summaries.

  Returns:
    Configured GenaiModel or OpenAiCompatLlm instance.
  """
  opts = parse_sensemaker_model_opts(args)
  legacy_key = resolve_cli_api_key_from_args(args, api_key)
  if legacy_key:
    opts = replace(opts, api_key=legacy_key)
  effective_model = model_name or opts.model_name
  if getattr(args, "model_name", None) and not effective_model:
    effective_model = args.model_name
  if effective_model:
    opts = replace(opts, model_name=effective_model)
  validate_sensemaker_model_opts(opts)
  from src.models import llm_factory  # pylint: disable=import-outside-toplevel

  return llm_factory.create_sensemaking_llm(
      opts,
      max_llm_retries=max_llm_retries,
      stats_log_file=stats_log_file,
  )
