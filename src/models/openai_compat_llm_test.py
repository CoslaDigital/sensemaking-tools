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

import os
import tempfile
import unittest
from types import SimpleNamespace
from unittest import mock

from src.models.openai_compat_llm import OpenAiCompatLlm


class OpenAiCompatLlmTest(unittest.IsolatedAsyncioTestCase):

  def test_openrouter_headers_passed_to_client(self):
    with mock.patch("src.models.openai_compat_llm.AsyncOpenAI") as mock_client:
      OpenAiCompatLlm(
          provider="openrouter",
          base_url="https://openrouter.ai/api/v1",
          api_key="key",
          model_name="openai/gpt-4o",
          openrouter_site_url="https://example.com",
          openrouter_app_name="TestApp",
      )
      mock_client.assert_called_once()
      kwargs = mock_client.call_args.kwargs
      self.assertEqual(
          kwargs["default_headers"]["HTTP-Referer"], "https://example.com"
      )
      self.assertEqual(kwargs["default_headers"]["X-Title"], "TestApp")

  def test_openai_no_extra_headers(self):
    with mock.patch("src.models.openai_compat_llm.AsyncOpenAI") as mock_client:
      OpenAiCompatLlm(
          provider="openai",
          base_url="https://api.openai.com/v1",
          api_key="key",
          model_name="gpt-4o",
      )
      kwargs = mock_client.call_args.kwargs
      self.assertIsNone(kwargs.get("default_headers"))

  def test_mistral_no_extra_headers(self):
    with mock.patch("src.models.openai_compat_llm.AsyncOpenAI") as mock_client:
      OpenAiCompatLlm(
          provider="mistral",
          base_url="https://api.mistral.ai/v1",
          api_key="key",
          model_name="mistral-small-latest",
      )
      kwargs = mock_client.call_args.kwargs
      self.assertIsNone(kwargs.get("default_headers"))

  async def test_call_gemini_returns_text(self):
    mock_response = SimpleNamespace(
        choices=[
            SimpleNamespace(message=SimpleNamespace(content='{"ok": true}'))
        ],
        usage=SimpleNamespace(
            total_tokens=10, prompt_tokens=5, completion_tokens=5
        ),
    )
    with mock.patch("src.models.openai_compat_llm.AsyncOpenAI") as mock_cls:
      mock_client = mock.AsyncMock()
      mock_client.chat.completions.create = mock.AsyncMock(
          return_value=mock_response
      )
      mock_cls.return_value = mock_client

      model = OpenAiCompatLlm(
          provider="openai",
          base_url="https://api.openai.com/v1",
          api_key="key",
          model_name="gpt-4o",
      )
      result = await model.call_gemini(prompt="hello", run_name="test")
      self.assertEqual(result["text"], '{"ok": true}')
      self.assertIsNone(result["error"])

  async def test_process_prompts_concurrently_ordering(self):
    with mock.patch("src.models.openai_compat_llm.AsyncOpenAI"):
      model = OpenAiCompatLlm(
          provider="openai",
          base_url="https://api.openai.com/v1",
          api_key="key",
          model_name="gpt-4o",
          max_concurrent_calls=2,
      )

      async def fake_call_gemini(**kwargs):
        del kwargs
        return {
            "text": "ok",
            "error": None,
            "total_token_count": 1,
            "prompt_token_count": 1,
            "candidates_token_count": 0,
        }

      with mock.patch.object(
          model, "call_gemini", side_effect=fake_call_gemini
      ):
        df, _, _, _ = await model.process_prompts_concurrently(
            [{"prompt": "a"}, {"prompt": "b"}],
            lambda resp, job: resp["text"],
            max_concurrent_calls=2,
            retry_attempts=1,
        )
    self.assertEqual(len(df), 2)
    self.assertEqual(list(df["job_id"]), [0, 1])

  def test_log_stats_summary_writes_stage_block(self):
    with tempfile.TemporaryDirectory() as tmpdir:
      stats_path = os.path.join(tmpdir, "stats.log")
      with mock.patch("src.models.openai_compat_llm.AsyncOpenAI"):
        model = OpenAiCompatLlm(
            provider="openai",
            base_url="https://api.openai.com/v1",
            api_key="key",
            model_name="gpt-4o",
            stats_log_file=stats_path,
        )
      model.log_stats_summary(
          [
              {
                  "api_calls_made": 2,
                  "is_success": True,
                  "is_complete_failure": False,
                  "503_errors": 0,
                  "429_errors": 0,
                  "delay_seconds": 0.0,
              }
          ],
          "2 (Topic Categorization)",
          wall_delay=1.5,
          duration=10.0,
      )
      with open(stats_path) as f:
        content = f.read()
      self.assertIn("STAGE: 2 (Topic Categorization)", content)
      self.assertIn("Total Jobs Processed:     1", content)
      self.assertIn("Total API Calls Made:     2", content)


if __name__ == "__main__":
  unittest.main()
