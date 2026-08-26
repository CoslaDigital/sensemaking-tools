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

"""OpenAI-compatible chat completions backend (OpenAI, OpenRouter, Mistral)."""

from __future__ import annotations

import asyncio
import logging
import os
import random
import time
from typing import Any, Callable

import pandas as pd
import tqdm.asyncio
from openai import APIStatusError, AsyncOpenAI, RateLimitError

from src.models import llm_schema_utils
from src.models.llm_job import (
    FAIL_RETRY_DELAY_SECONDS,
    Job,
    MAX_CONCURRENT_CALLS,
    MAX_LLM_RETRIES,
    THINKING_LEVEL,
    TIMEOUT_SECONDS,
    WAIT_BETWEEN_SUCCESSFUL_CALLS_SECONDS,
    ThinkingLevel,
)

DEFAULT_OPENAI_COMPAT_PARALLELISM = int(os.getenv("DEFAULT_PARALLELISM", "5"))


class OpenAiCompatLlmError(Exception):
  """Raised when OpenAI-compatible API calls fail."""


class OpenAiCompatLlm:
  """SensemakingLlm implementation using OpenAI-compatible HTTP APIs."""

  def __init__(
      self,
      provider: str,
      base_url: str,
      api_key: str,
      model_name: str,
      max_llm_retries: int | None = None,
      stats_log_file: str | None = None,
      openrouter_site_url: str | None = None,
      openrouter_app_name: str | None = None,
      max_concurrent_calls: int | None = None,
  ):
    """Initializes the OpenAiCompatLlm.

    Args:
      provider: openai, openrouter, or mistral.
      base_url: API root URL (e.g. https://openrouter.ai/api/v1).
      api_key: Bearer token for the provider.
      model_name: Model id passed to the API.
      max_llm_retries: Override for per-job retry count.
      stats_log_file: Optional path for failure logging.
      openrouter_site_url: Optional HTTP-Referer for OpenRouter.
      openrouter_app_name: Optional X-Title for OpenRouter.
      max_concurrent_calls: Worker pool size override.
    """
    self.provider = provider
    self.model_name = model_name
    self.max_llm_retries = (
        max_llm_retries if max_llm_retries is not None else MAX_LLM_RETRIES
    )
    self.stats_log_file = stats_log_file
    self.max_concurrent_calls = (
        max_concurrent_calls
        if max_concurrent_calls is not None
        else DEFAULT_OPENAI_COMPAT_PARALLELISM
    )

    default_headers: dict[str, str] = {}
    if provider == "openrouter":
      if openrouter_site_url:
        default_headers["HTTP-Referer"] = openrouter_site_url
      if openrouter_app_name:
        default_headers["X-Title"] = openrouter_app_name

    self.client = AsyncOpenAI(
        api_key=api_key,
        base_url=base_url,
        default_headers=default_headers or None,
    )
    self._global_pause_event = asyncio.Event()
    self._global_pause_event.set()
    self._global_pause_lock = asyncio.Lock()
    self.total_wall_delay = 0.0
    self._backoff_delay = 2

  def calculate_token_count_needed(
      self,
      prompt: str,
      run_name: str = "",
      temperature: float = 0.0,
  ) -> int:
    """Estimates token count for batch sizing (chars/4 heuristic)."""
    del run_name, temperature
    return max(1, len(prompt) // 4)

  async def generate_content(
      self,
      prompt: str,
      run_name: str,
      temperature: float = 0.0,
      system_prompt: str | None = None,
      response_mime_type: str | None = None,
      response_schema: Any | None = None,
      thinking_level: ThinkingLevel | None = None,
      max_concurrent_calls: int = MAX_CONCURRENT_CALLS,
  ) -> dict[str, Any] | None:
    """Calls the chat completions API with the given prompt."""
    del run_name, thinking_level, max_concurrent_calls
    if not prompt:
      raise ValueError("Prompt must be present.")

    json_schema = llm_schema_utils.schema_to_json_dict(response_schema)
    use_structured = bool(
        json_schema or response_mime_type == "application/json"
    )

    if not use_structured:
      return await self._chat_completion(
          prompt=prompt,
          system_prompt=system_prompt,
          temperature=temperature,
          response_format=None,
      )

    assert json_schema is not None
    failures: list[str] = []
    for mode in llm_schema_utils.STRUCTURED_OUTPUT_MODES:
      try:
        req_schema, unwrap = llm_schema_utils.prepare_schema_for_mode(
            json_schema, mode, self.provider
        )
        messages = llm_schema_utils.get_messages_for_mode(
            prompt, system_prompt, req_schema, mode
        )
        response_format = llm_schema_utils.get_response_format_for_mode(
            req_schema, mode
        )
        result = await self._chat_completion(
            prompt=prompt,
            system_prompt=system_prompt,
            temperature=temperature,
            response_format=response_format,
            messages=messages,
        )
        if result.get("error"):
          failures.append(f"{mode}: {result['error']}")
          continue
        if unwrap:
          # Parser expects text JSON; unwrap is for downstream validate only.
          pass
        return result
      except Exception as e:
        failures.append(f"{mode}: {e}")
        continue

    return {"error": "Structured output failed: " + " | ".join(failures)}

  async def call_gemini(self, *args, **kwargs):
    """Deprecated alias for generate_content."""
    return await self.generate_content(*args, **kwargs)

  async def _chat_completion(
      self,
      prompt: str,
      system_prompt: str | None,
      temperature: float,
      response_format: dict[str, Any] | None,
      messages: list[dict[str, str]] | None = None,
  ) -> dict[str, Any]:
    """Single chat completion request."""
    if messages is None:
      messages = []
      if system_prompt:
        messages.append({"role": "system", "content": system_prompt})
      messages.append({"role": "user", "content": prompt})

    try:
      kwargs: dict[str, Any] = {
          "model": self.model_name,
          "messages": messages,
          "temperature": temperature,
      }
      if response_format:
        kwargs["response_format"] = response_format

      response = await asyncio.wait_for(
          self.client.chat.completions.create(**kwargs),
          timeout=TIMEOUT_SECONDS,
      )
      text = ""
      if response.choices:
        content = response.choices[0].message.content
        text = content or ""

      usage = response.usage
      total = usage.total_tokens if usage else 0
      prompt_tokens = usage.prompt_tokens if usage else 0
      completion_tokens = usage.completion_tokens if usage else 0

      return {
          "text": text,
          "error": None,
          "total_token_count": total,
          "prompt_token_count": prompt_tokens,
          "candidates_token_count": completion_tokens,
          "tool_use_prompt_token_count": 0,
          "thoughts_token_count": 0,
      }
    except Exception as e:
      return {"error": e}

  async def _extract_error_details(self, e: Exception) -> tuple[bool, bool, int]:
    """Returns (is_quota, is_unavailable, delay_seconds)."""
    is_quota = isinstance(e, RateLimitError)
    is_unavailable = False
    delay = FAIL_RETRY_DELAY_SECONDS
    if isinstance(e, APIStatusError):
      if e.status_code == 429:
        is_quota = True
      elif e.status_code in (503, 502):
        is_unavailable = True
        delay = self._backoff_delay
        self._backoff_delay = min(self._backoff_delay * 2, 64)
    return is_quota, is_unavailable, delay

  async def _handle_global_pause(self, delay: int) -> None:
    """Pauses all workers for rate limits / availability."""
    start = time.time()
    await asyncio.sleep(delay)
    self.total_wall_delay += time.time() - start
    self._global_pause_event.set()

  async def _api_worker(
      self,
      worker_id: int,
      queue: asyncio.Queue,
      results_list: list,
      stats_list: list,
      stop_event: asyncio.Event,
      response_parser: Callable[[Any, dict[str, Any]], Any],
      pbar: Any,
  ) -> None:
    """Worker that processes jobs from the queue."""
    del worker_id
    await asyncio.sleep(random.uniform(0, 1))

    while not stop_event.is_set():
      try:
        job: Job | None = await asyncio.wait_for(queue.get(), timeout=1.0)
      except asyncio.TimeoutError:
        continue
      if job is None:
        break

      stats = job.setdefault("stats", {})
      retry_attempts = job.get("retry_attempts", self.max_llm_retries)
      temperature = job.get("temperature", 0.0) or 0.0
      failed_tries: list[dict[str, Any]] = []
      attempt = 0
      stats.update({
          "non_quota_failures": 0,
          "is_complete_failure": False,
          "api_calls_made": 0,
          "is_success": False,
          "429_errors": 0,
          "503_errors": 0,
          "delay_seconds": 0.0,
      })

      while attempt < retry_attempts:
        await self._global_pause_event.wait()
        if stop_event.is_set():
          break

        resp = None
        try:
          stats["api_calls_made"] += 1
          resp = await self.generate_content(
              prompt=job["prompt"],
              run_name=str(job.get("job_id", "")),
              system_prompt=job.get("system_prompt"),
              response_mime_type=job.get("response_mime_type"),
              response_schema=job.get("response_schema"),
              thinking_level=job.get("thinking_level"),
          )

          if resp and resp.get("error"):
            err = resp["error"]
            if isinstance(err, BaseException):
              raise err
            raise OpenAiCompatLlmError(err)

          result = response_parser(resp, job)
          result_data = {
              "result": result,
              "propositions": result,
              "temperature": temperature,
              "total_token_used": resp.get("total_token_count", 0),
              "prompt_token_count": resp.get("prompt_token_count", 0),
              "candidates_token_count": resp.get("candidates_token_count", 0),
              "tool_use_prompt_token_count": 0,
              "thoughts_token_count": 0,
              "failed_tries": pd.DataFrame(failed_tries),
          }
          results_list.append({**job, **result_data})
          stats["is_success"] = True
          stats["total_token_used"] = resp.get("total_token_count", 0)
          self._backoff_delay = 2
          await asyncio.sleep(WAIT_BETWEEN_SUCCESSFUL_CALLS_SECONDS)
          break

        except Exception as e:
          is_quota, is_unavailable, delay = await self._extract_error_details(e)
          if is_quota:
            stats["429_errors"] = stats.get("429_errors", 0) + 1
          if is_unavailable:
            stats["503_errors"] = stats.get("503_errors", 0) + 1
          if is_quota or is_unavailable:
            async with self._global_pause_lock:
              if self._global_pause_event.is_set():
                self._global_pause_event.clear()
                asyncio.create_task(self._handle_global_pause(delay))
          else:
            stats["non_quota_failures"] += 1
            failed_tries.append({
                "attempt_index": attempt,
                "error_message": str(e),
            })
            attempt += 1
            temperature += 0.02
            if attempt < retry_attempts:
              await asyncio.sleep(0.1)
            else:
              stats["is_complete_failure"] = True
              results_list.append({
                  **job,
                  "result": {"error": f"Failed after {retry_attempts} attempts"},
                  "failed_tries": pd.DataFrame(failed_tries),
              })

      stats_list.append(stats)
      if pbar is not None:
        pbar.update(1)

  async def process_prompts_concurrently(
      self,
      prompts: list[dict[str, Any]],
      response_parser: Callable[[Any, dict[str, Any]], Any],
      max_concurrent_calls: int | None = None,
      retry_attempts: int | None = None,
      skip_log: bool = False,
  ) -> tuple[pd.DataFrame, pd.DataFrame, float, float]:
    """Processes prompts with a worker pool (same contract as GenaiModel)."""
    del skip_log
    if retry_attempts is None:
      retry_attempts = self.max_llm_retries
    workers_count = max_concurrent_calls or self.max_concurrent_calls

    self.total_wall_delay = 0.0
    stage_start = time.time()
    queue: asyncio.Queue = asyncio.Queue()
    final_results: list = []
    final_stats: list = []
    stop_event = asyncio.Event()

    pbar = tqdm.asyncio.tqdm(total=len(prompts), desc="Processing prompts")
    workers = [
        asyncio.create_task(
            self._api_worker(
                i,
                queue,
                final_results,
                final_stats,
                stop_event,
                response_parser,
                pbar,
            )
        )
        for i in range(workers_count)
    ]

    for i, prompt_data in enumerate(prompts):
      if stop_event.is_set():
        break
      job: Job = prompt_data.copy()
      job["job_id"] = i
      job["opinion_num"] = i + 1
      job["retry_attempts"] = retry_attempts
      job["thinking_level"] = THINKING_LEVEL
      if "stats" not in job or job["stats"] is None:
        job["stats"] = {}
      await queue.put(job)

    for _ in range(workers_count):
      await queue.put(None)

    try:
      await asyncio.gather(*workers)
    except KeyboardInterrupt:
      stop_event.set()
      await asyncio.gather(*workers, return_exceptions=True)
    finally:
      pbar.close()

    duration = time.time() - stage_start
    llm_response = pd.DataFrame(final_results)
    llm_response_stats = pd.DataFrame(final_stats)
    if not llm_response.empty and "job_id" in llm_response.columns:
      llm_response = llm_response.sort_values(by="job_id").reset_index(
          drop=True
      )
    return llm_response, llm_response_stats, self.total_wall_delay, duration

  def _format_seconds(self, seconds: float) -> str:
    """Formats seconds into a string with minutes or hours if applicable."""
    if seconds >= 3600:
      return f"{seconds:.2f}s ({seconds / 3600:.2f} hrs)"
    if seconds >= 60:
      return f"{seconds:.2f}s ({seconds / 60:.2f} mins)"
    return f"{seconds:.2f}s"

  def log_stats_summary(
      self,
      final_stats: list[dict],
      stage_name: str,
      wall_delay: float,
      duration: float,
  ) -> None:
    """Logs a summary of the processing stats to the stats log file."""
    if not self.stats_log_file or not final_stats:
      return

    total_calls = len(final_stats)
    total_api_calls = sum(s.get("api_calls_made", 0) for s in final_stats)
    total_succeeded = sum(1 for s in final_stats if s.get("is_success", False))
    total_failed = total_calls - total_succeeded
    total_max_retries = sum(
        1 for s in final_stats if s.get("is_complete_failure", False)
    )
    total_503 = sum(s.get("503_errors", 0) for s in final_stats)
    total_429 = sum(s.get("429_errors", 0) for s in final_stats)
    total_delay = sum(s.get("delay_seconds", 0.0) for s in final_stats)

    jobs_with_delay = sum(
        1 for s in final_stats if s.get("delay_seconds", 0.0) > 0
    )

    summary_block = (
        f"\n{'=' * 50}\nSTAGE:"
        f" {stage_name}\n{'=' * 50}\nTotal"
        f" Jobs Processed:     {total_calls}\nTotal API Calls Made:    "
        f" {total_api_calls}\nTotal Succeeded:         "
        f" {total_succeeded}\nTotal Failed:            "
        f" {total_failed}\nReached Max Retries:      {total_max_retries}\nHit"
        f" 503 (Unavailable):    {total_503}\nHit 429 (Exhausted):     "
        f" {total_429}\nTotal Delay (seconds):    {total_delay:.2f}\n"
        f"Jobs with delay:          {jobs_with_delay}\n"
        f"Total delay (wall-clock): {self._format_seconds(wall_delay)}\n"
        f"Total stage duration:     {self._format_seconds(duration)}\n"
    )
    try:
      with open(self.stats_log_file, "a") as f:
        f.write(summary_block)
    except Exception as io_err:
      logging.error(f"Failed to write summary to stats log file: {io_err}")
