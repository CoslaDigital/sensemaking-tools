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

"""Abstract LLM interface used by sensemaking tasks (Gemini today, others later)."""

from typing import Any, Callable, Protocol, Tuple

import pandas as pd

from src.models.llm_job import ThinkingLevel


class SensemakingLlm(Protocol):
  """Async LLM surface implemented by GenaiModel and future backends."""

  max_llm_retries: int

  async def process_prompts_concurrently(
      self,
      prompts: list[dict[str, Any]],
      response_parser: Callable[[str, dict[str, Any]], Any],
      max_concurrent_calls: int = ...,
      retry_attempts: int | None = None,
      skip_log: bool = False,
  ) -> Tuple[pd.DataFrame, pd.DataFrame, float, float]:
    ...

  async def generate_content(
      self,
      prompt: str,
      run_name: str,
      temperature: float = 0.0,
      system_prompt: str | None = None,
      response_mime_type: str | None = None,
      response_schema: dict[str, Any] | None = None,
      thinking_level: ThinkingLevel | None = None,
      max_concurrent_calls: int = ...,
  ) -> dict[str, Any] | None:
    """Vendor-neutral single-shot completion API."""
    ...

  def calculate_token_count_needed(
      self,
      prompt: str,
      run_name: str = "",
      temperature: float = 0.0,
  ) -> int:
    ...
