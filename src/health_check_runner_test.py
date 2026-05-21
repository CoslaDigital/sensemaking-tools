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

import argparse
import asyncio
import os
import tempfile
import unittest
from unittest import mock

from src import health_check_runner
from src.models import sensemaker_model_cli


class _FakeLlm:
  """Minimal stand-in for SensemakingLlm in health check tests."""

  def __init__(self, response):
    self._response = response
    self.call_args = None

  async def call_gemini(self, prompt, run_name, temperature=0.0, **kwargs):
    del kwargs
    self.call_args = {
        "prompt": prompt,
        "run_name": run_name,
        "temperature": temperature,
    }
    if isinstance(self._response, Exception):
      raise self._response
    return self._response


class HealthCheckRunnerTest(unittest.TestCase):

  def test_test_name_for_adapter_vertex(self):
    self.assertEqual(
        health_check_runner._test_name_for_adapter("vertex"),
        "Vertex AI Health Check",
    )

  def test_resolve_model_name_vertex_default(self):
    parser = argparse.ArgumentParser()
    parser.add_argument("--model_name", default=None)
    sensemaker_model_cli.add_sensemaker_model_options(parser)
    args = parser.parse_args([
        "--adapter", "vertex",
        "--vertex_project", "my-project",
    ])
    opts = sensemaker_model_cli.parse_sensemaker_model_opts(args)
    name = health_check_runner._resolve_model_name(args, opts)
    self.assertEqual(name, health_check_runner.DEFAULT_GEMINI_HEALTH_CHECK_MODEL)

  def test_startup_lines_vertex(self):
    opts = sensemaker_model_cli.SensemakerModelConfig(
        adapter="vertex",
        provider=None,
        base_url="",
        model_name="gemini-2.5-flash",
        api_key=None,
        openrouter_site_url=None,
        openrouter_app_name=None,
        vertex_project="sensemaker-466109",
        vertex_location="global",
    )
    lines = health_check_runner._startup_lines(opts, "gemini-2.5-flash")
    self.assertEqual(
        lines[0],
        "Starting health check for Vertex AI (project: sensemaker-466109)...",
    )
    self.assertEqual(lines[1], "Location: global")
    self.assertNotIn("openai-compatible", "\n".join(lines))

  def test_startup_lines_openai_compatible(self):
    opts = sensemaker_model_cli.SensemakerModelConfig(
        adapter="openai-compatible",
        provider="openai",
        base_url="https://api.openai.com/v1",
        model_name="gpt-4o-mini",
        api_key="key",
        openrouter_site_url=None,
        openrouter_app_name=None,
    )
    lines = health_check_runner._startup_lines(opts, "gpt-4o-mini")
    self.assertIn("openai (openai-compatible)", lines[0])

  def test_run_health_check_pass(self):
    llm = _FakeLlm({"text": "Health check successful", "error": None})
    result = asyncio.run(
        health_check_runner.run_health_check(
            llm, adapter="gemini", provider=None
        )
    )
    self.assertEqual(result.status, "PASS")
    self.assertEqual(llm.call_args["prompt"], health_check_runner.PROBE_PROMPT)

  def test_run_health_check_unexpected_text(self):
    llm = _FakeLlm({"text": "Something else", "error": None})
    result = asyncio.run(
        health_check_runner.run_health_check(
            llm, adapter="openai-compatible", provider="openai"
        )
    )
    self.assertEqual(result.status, "FAIL")
    self.assertIn("unexpected", result.message.lower())

  def test_run_health_check_error_in_response(self):
    llm = _FakeLlm({"text": "", "error": "rate limited"})
    result = asyncio.run(
        health_check_runner.run_health_check(
            llm, adapter="gemini", provider=None
        )
    )
    self.assertEqual(result.status, "FAIL")
    self.assertIn("error", result.message.lower())

  def test_run_health_check_exception(self):
    llm = _FakeLlm(RuntimeError("connection refused"))
    result = asyncio.run(
        health_check_runner.run_health_check(
            llm, adapter="gemini", provider=None
        )
    )
    self.assertEqual(result.status, "FAIL")
    self.assertIn("connection refused", result.error)

  def test_write_report_creates_file(self):
    opts = sensemaker_model_cli.SensemakerModelConfig(
        adapter="gemini",
        provider=None,
        base_url="",
        model_name="gemini-2.5-flash-lite-preview",
        api_key=None,
        openrouter_site_url=None,
        openrouter_app_name=None,
    )
    result = health_check_runner.HealthCheckResult(
        test_name="Gemini Health Check",
        status="PASS",
        message="ok",
        response="Health check successful",
    )
    report = health_check_runner.format_report(
        opts, "gemini-2.5-flash-lite-preview", result
    )
    with tempfile.TemporaryDirectory() as tmp:
      path = os.path.join(tmp, "health-check.txt")
      health_check_runner.write_report(path, report)
      with open(path, encoding="utf-8") as f:
        contents = f.read()
      self.assertIn("PASS", contents)
      self.assertIn("Health check successful", contents)

  def test_main_requires_output_file(self):
    parser = argparse.ArgumentParser()
    parser.add_argument("--output_file", required=True)
    sensemaker_model_cli.add_sensemaker_model_options(parser)
    with self.assertRaises(SystemExit):
      parser.parse_args([])

  @mock.patch("src.models.sensemaker_model_cli.create_llm_from_args")
  def test_async_main_exit_zero_on_pass(self, mock_create_llm):
    mock_create_llm.return_value = _FakeLlm(
        {"text": "Health check successful", "error": None}
    )
    parser = argparse.ArgumentParser()
    parser.add_argument("--output_file", required=True)
    parser.add_argument("--model_name", default=None)
    sensemaker_model_cli.add_sensemaker_model_options(parser)
    with tempfile.TemporaryDirectory() as tmp:
      out_path = os.path.join(tmp, "report.txt")
      args = parser.parse_args(["--output_file", out_path])
      code = asyncio.run(health_check_runner.async_main(args))
      self.assertEqual(code, 0)
      self.assertTrue(os.path.isfile(out_path))

  @mock.patch("src.models.sensemaker_model_cli.create_llm_from_args")
  def test_async_main_exit_one_on_fail(self, mock_create_llm):
    mock_create_llm.return_value = _FakeLlm(
        {"text": "wrong", "error": None}
    )
    parser = argparse.ArgumentParser()
    parser.add_argument("--output_file", required=True)
    parser.add_argument("--model_name", default=None)
    sensemaker_model_cli.add_sensemaker_model_options(parser)
    with tempfile.TemporaryDirectory() as tmp:
      out_path = os.path.join(tmp, "report.txt")
      args = parser.parse_args(["--output_file", out_path])
      code = asyncio.run(health_check_runner.async_main(args))
    self.assertEqual(code, 1)


if __name__ == "__main__":
  unittest.main()
