// Copyright 2025 Google LLC
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

// Util class for models

// The maximum number of times a task should be retried.
export const MAX_RETRIES = 3;
// The maximum number of times an LLM call should be retried (it's higher to avoid rate limits).
export const MAX_LLM_RETRIES = 9;
// How long in milliseconds to wait between API calls.
export const RETRY_DELAY_MS = 5000; // 5 seconds

function parseParallelismEnv(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }
  const parsed = parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed < 1) {
    return undefined;
  }
  return parsed;
}

function getEnvValue(name: string): string | undefined {
  return typeof process !== "undefined" && process.env ? process.env[name] : undefined;
}

// Shared default parallelism across model backends.
export const DEFAULT_PARALLELISM = parseParallelismEnv(getEnvValue("DEFAULT_PARALLELISM"));

// Vertex-specific override. Falls back to shared default, then to hard default of 2.
export const DEFAULT_VERTEX_PARALLELISM =
  parseParallelismEnv(getEnvValue("DEFAULT_VERTEX_PARALLELISM")) ?? DEFAULT_PARALLELISM ?? 2;
