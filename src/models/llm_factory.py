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

"""Factory for SensemakingLlm backends from CLI configuration."""

from __future__ import annotations

from src.models import genai_model
from src.models.openai_compat_llm import OpenAiCompatLlm
from src.models.sensemaker_model_cli import (
    SensemakerModelConfig,
    resolve_api_key,
    resolve_vertex_location,
    resolve_vertex_project,
)
from src.models.sensemaking_llm import SensemakingLlm


def create_sensemaking_llm(
    opts: SensemakerModelConfig,
    *,
    max_llm_retries: int | None = None,
    stats_log_file: str | None = None,
) -> SensemakingLlm:
  """Creates a SensemakingLlm from parsed CLI options.

  Args:
    opts: Parsed adapter/provider configuration.
    max_llm_retries: Optional retry override passed to the backend.
    stats_log_file: Optional stats log path for stage summaries.

  Returns:
    GenaiModel or OpenAiCompatLlm implementing SensemakingLlm.
  """
  if opts.adapter == "vertex":
    project = resolve_vertex_project(opts)
    if not project:
      raise ValueError(
          "Vertex project is required. Pass --vertex_project or set"
          " GOOGLE_CLOUD_PROJECT."
      )
    return genai_model.GenaiModel(
        model_name=opts.model_name or "gemini-3.5-flash",
        vertex_project=project,
        vertex_location=resolve_vertex_location(opts),
        max_llm_retries=max_llm_retries,
        stats_log_file=stats_log_file,
    )

  if opts.adapter == "gemini":
    api_key = resolve_api_key(opts)
    return genai_model.GenaiModel(
        model_name=opts.model_name or "gemini-3.5-flash",
        gemini_api_key=api_key,
        max_llm_retries=max_llm_retries,
        stats_log_file=stats_log_file,
    )

  if opts.adapter == "openai-compatible":
    assert opts.provider is not None
    api_key = resolve_api_key(opts)
    if not api_key:
      env_key = f" (set {opts.provider} API key env var or --api_key)"
      raise ValueError(f"API key is required for provider {opts.provider}{env_key}")
    return OpenAiCompatLlm(
        provider=opts.provider,
        base_url=opts.base_url,
        api_key=api_key,
        model_name=opts.model_name or "",
        max_llm_retries=max_llm_retries,
        stats_log_file=stats_log_file,
        openrouter_site_url=opts.openrouter_site_url,
        openrouter_app_name=opts.openrouter_app_name,
    )

  raise ValueError(f"Unsupported adapter: {opts.adapter}")
