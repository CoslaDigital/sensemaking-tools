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

"""Provider-neutral job shape and concurrency constants for LLM workers."""

from enum import Enum
from typing import Any, TypedDict


class ThinkingLevel(Enum):
  """Model reasoning depth; mapped to provider-specific APIs in GenaiModel."""

  HIGH = "HIGH"
  MEDIUM = "MEDIUM"
  LOW = "LOW"
  MINIMAL = "MINIMAL"


class Job(TypedDict, total=False):
  """A TypedDict for representing a job to be processed by the LLM."""

  allocations: Any | None
  job_id: int
  opinion: str | None
  opinion_num: int | None
  prompt: str
  response_mime_type: str | None
  response_schema: dict[str, Any] | None
  retry_attempts: int
  stats: dict[str, Any]
  system_prompt: str | None
  topic: str | None
  thinking_level: ThinkingLevel | None
  temperature: float | None


# The maximum number of times an LLM call should be retried.
MAX_LLM_RETRIES = 20
# How long in seconds to wait between successful LLM calls.
WAIT_BETWEEN_SUCCESSFUL_CALLS_SECONDS = 0.1
# How long in seconds to wait between failed LLM calls.
FAIL_RETRY_DELAY_SECONDS = 60
# Maximum number of concurrent API calls. By default Genai limits to 10.
MAX_CONCURRENT_CALLS = 100
# Maximum delay in seconds for any retry attempt (1 hour).
MAX_RETRY_DELAY_SECONDS = 3600
# Timeout in seconds for API calls. Default Gemini timeout is 10 minutes.
TIMEOUT_SECONDS = 601
# Default thinking level for jobs (None = provider default).
THINKING_LEVEL: ThinkingLevel | None = None
