# Copyright 2026 Cosla
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

"""Health check for Sensemaking LLM adapters (gemini / vertex / openai-compatible).

Example usage (Gemini):
  python3 -m src.health_check_runner \\
    --output_file health-check.txt \\
    --adapter gemini \\
    --model_name gemini-2.5-flash-lite-preview

Example usage (Vertex AI):
  python3 -m src.health_check_runner \\
    --output_file health-check.txt \\
    --adapter vertex \\
    --vertex_project YOUR_GCP_PROJECT \\
    --vertex_location global \\
    --model_name gemini-2.5-flash-lite-preview

Example usage (OpenAI-compatible):
  python3 -m src.health_check_runner \\
    --output_file health-check.txt \\
    --adapter openai-compatible \\
    --provider openai \\
    --model_name gpt-4o-mini \\
    --api_key "$OPENAI_API_KEY"
"""

from __future__ import annotations

import argparse
import asyncio
import dataclasses
import datetime
import sys
from typing import Literal

from src.models import sensemaker_model_cli
from src.models.sensemaking_llm import SensemakingLlm

PROBE_PROMPT = (
    "Please respond with exactly 'Health check successful' and nothing else."
)
EXPECTED_RESPONSE = "Health check successful"
DEFAULT_GEMINI_HEALTH_CHECK_MODEL = "gemini-2.5-flash-lite-preview"

HealthCheckStatus = Literal["PASS", "FAIL"]


@dataclasses.dataclass
class HealthCheckResult:
  """Outcome of a single adapter health probe."""

  test_name: str
  status: HealthCheckStatus
  message: str
  details: str | None = None
  response: str | None = None
  error: str | None = None


def _test_name_for_adapter(adapter: str) -> str:
  if adapter == "gemini":
    return "Gemini Health Check"
  if adapter == "vertex":
    return "Vertex AI Health Check"
  return "OpenAI-Compatible Health Check"


async def run_health_check(
    llm: SensemakingLlm,
    *,
    adapter: str,
    provider: str | None,
) -> HealthCheckResult:
  """Runs a generate probe against the configured LLM."""
  test_name = _test_name_for_adapter(adapter)
  try:
    result = await llm.call_gemini(
        prompt=PROBE_PROMPT,
        run_name="health_check",
        temperature=0.0,
    )
    if result is None:
      return HealthCheckResult(
          test_name=test_name,
          status="FAIL",
          message="Model call returned no response",
          details="Check API key, model name, and network connectivity.",
      )
    if result.get("error"):
      return HealthCheckResult(
          test_name=test_name,
          status="FAIL",
          message="Model call returned an error",
          details=str(result.get("error")),
          error=str(result.get("error")),
      )
    response_text = (result.get("text") or "").strip()
    if response_text == EXPECTED_RESPONSE:
      adapter_label = provider or adapter
      return HealthCheckResult(
          test_name=test_name,
          status="PASS",
          message=(
              f"Connected to {adapter_label} and model responded correctly"
          ),
          details=(
              "Authentication, connectivity, and model functionality verified"
          ),
          response=response_text,
      )
    return HealthCheckResult(
        test_name=test_name,
        status="FAIL",
        message="Connected but model response was unexpected",
        details=(
            f"Expected: '{EXPECTED_RESPONSE}', Got: '{response_text}'"
        ),
        response=response_text,
    )
  except Exception as e:
    hint = (
        "Check GOOGLE_API_KEY or --api_key for gemini; for vertex check"
        " --vertex_project, ADC credentials, and --model_name; for"
        " openai-compatible check --provider, --api_key, --base_url, and"
        " --model_name."
    )
    if adapter == "openai-compatible" and provider:
      hint = (
          f"Check API key for provider '{provider}', base URL, model id,"
          " and account permissions."
      )
    return HealthCheckResult(
        test_name=test_name,
        status="FAIL",
        message="Failed to connect or generate with the configured adapter",
        details=hint,
        error=str(e),
    )


def format_report(
    model_opts: sensemaker_model_cli.SensemakerModelConfig,
    model_name: str,
    result: HealthCheckResult,
) -> str:
  """Builds a text report written to --output_file."""
  lines = [
      f"Model Test Output ({result.test_name})",
      "=================",
      f"Timestamp: {datetime.datetime.now(datetime.timezone.utc).isoformat()}",
      f"Adapter: {model_opts.adapter}",
  ]
  if model_opts.adapter == "vertex":
    project = sensemaker_model_cli.resolve_vertex_project(model_opts)
    location = sensemaker_model_cli.resolve_vertex_location(model_opts)
    lines.append(f"Vertex project: {project}")
    lines.append(f"Vertex location: {location}")
  if model_opts.provider:
    lines.append(f"Provider: {model_opts.provider}")
  if model_opts.base_url:
    lines.append(f"Base URL: {model_opts.base_url}")
  lines.extend([
      f"Model Name: {model_name}",
      f"Status: {result.status}",
      f"Message: {result.message}",
      f'Test Prompt: "{PROBE_PROMPT}"',
  ])
  if result.details:
    lines.append(f"Details: {result.details}")
  if result.response:
    lines.extend([
        "",
        "Model Response:",
        result.response,
        "",
        "This output confirms that the model is accessible and can generate"
        " text responses.",
    ])
  if result.error:
    lines.extend(["", f"Error: {result.error}"])
  return "\n".join(lines) + "\n"


def write_report(path: str, report: str) -> None:
  """Writes the health check report to disk."""
  with open(path, "w", encoding="utf-8") as f:
    f.write(report)
  print(f"Test output written to: {path}")


def _resolve_model_name(
    args: argparse.Namespace,
    model_opts: sensemaker_model_cli.SensemakerModelConfig,
) -> str:
  if args.model_name:
    return args.model_name
  if model_opts.adapter in ("gemini", "vertex"):
    return DEFAULT_GEMINI_HEALTH_CHECK_MODEL
  raise ValueError("--model_name is required when --adapter is openai-compatible.")


def _startup_lines(
    model_opts: sensemaker_model_cli.SensemakerModelConfig,
    model_name: str,
) -> list[str]:
  """Returns console lines printed before the LLM probe runs."""
  if model_opts.adapter == "gemini":
    return [
        "Starting health check for Gemini...",
        f"Model: {model_name}",
    ]
  if model_opts.adapter == "vertex":
    project = sensemaker_model_cli.resolve_vertex_project(model_opts)
    location = sensemaker_model_cli.resolve_vertex_location(model_opts)
    return [
        f"Starting health check for Vertex AI (project: {project})...",
        f"Location: {location}",
        f"Model: {model_name}",
    ]
  return [
      f"Starting health check for {model_opts.provider} (openai-compatible)...",
      f"Base URL: {model_opts.base_url}",
      f"Model: {model_name}",
  ]


async def async_main(args: argparse.Namespace) -> int:
  """Runs health check and returns process exit code."""
  model_opts = sensemaker_model_cli.parse_sensemaker_model_opts(args)
  sensemaker_model_cli.validate_sensemaker_model_opts(model_opts)
  model_name = _resolve_model_name(args, model_opts)

  for line in _startup_lines(model_opts, model_name):
    print(line)

  llm = sensemaker_model_cli.create_llm_from_args(args, model_name=model_name)
  result = await run_health_check(
      llm,
      adapter=model_opts.adapter,
      provider=model_opts.provider,
  )

  status_label = "OK" if result.status == "PASS" else "FAIL"
  print(f"{status_label} {result.message}")

  report = format_report(model_opts, model_name, result)
  write_report(args.output_file, report)

  if result.status == "PASS":
    print("Health check passed. LLM setup is ready to use.")
    return 0

  if result.error:
    print(result.error)
  if result.details:
    print(result.details)
  print("Health check failed. Please review the error above.")
  return 1


def main() -> None:
  """CLI entry point."""
  parser = argparse.ArgumentParser(
      description=(
          "Verify LLM adapter connectivity and model functionality with a"
          " short generate probe."
      )
  )
  parser.add_argument(
      "--output_file",
      required=True,
      help="Path to write the health check report.",
  )
  parser.add_argument(
      "--model_name",
      type=str,
      default=None,
      help=(
          "Model id for the probe. Default for gemini and vertex:"
          f" {DEFAULT_GEMINI_HEALTH_CHECK_MODEL}. Required for"
          " openai-compatible."
      ),
  )
  sensemaker_model_cli.add_sensemaker_model_options(parser)
  args = parser.parse_args()

  try:
    exit_code = asyncio.run(async_main(args))
  except Exception as e:
    print(f"Fatal error during health check: {e}", file=sys.stderr)
    sys.exit(1)
  sys.exit(exit_code)


if __name__ == "__main__":
  main()
