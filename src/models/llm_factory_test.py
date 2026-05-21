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

import unittest
from unittest import mock

from src.models import genai_model
from src.models import llm_factory
from src.models.openai_compat_llm import OpenAiCompatLlm
from src.models.sensemaker_model_cli import SensemakerModelConfig


class LlmFactoryTest(unittest.TestCase):

  @mock.patch.dict("os.environ", {"GOOGLE_API_KEY": "g-key"}, clear=False)
  @mock.patch("google.genai.Client")
  def test_create_vertex(self, mock_genai_client):
    opts = SensemakerModelConfig(
        adapter="vertex",
        provider=None,
        base_url="",
        model_name="gemini-2.5-pro",
        api_key=None,
        openrouter_site_url=None,
        openrouter_app_name=None,
        vertex_project="gcp-proj",
        vertex_location="global",
    )
    model = llm_factory.create_sensemaking_llm(opts)
    self.assertIsInstance(model, genai_model.GenaiModel)
    mock_genai_client.assert_called_once_with(
        vertexai=True,
        project="gcp-proj",
        location="global",
    )

  @mock.patch.dict("os.environ", {"GOOGLE_CLOUD_PROJECT": "env-proj"}, clear=False)
  @mock.patch("google.genai.Client")
  def test_create_vertex_project_from_env(self, mock_genai_client):
    opts = SensemakerModelConfig(
        adapter="vertex",
        provider=None,
        base_url="",
        model_name=None,
        api_key=None,
        openrouter_site_url=None,
        openrouter_app_name=None,
        vertex_project=None,
        vertex_location=None,
    )
    model = llm_factory.create_sensemaking_llm(opts)
    self.assertIsInstance(model, genai_model.GenaiModel)
    mock_genai_client.assert_called_once_with(
        vertexai=True,
        project="env-proj",
        location="global",
    )

  @mock.patch.dict("os.environ", {"GOOGLE_API_KEY": "g-key"}, clear=False)
  def test_create_gemini(self):
    opts = SensemakerModelConfig(
        adapter="gemini",
        provider=None,
        base_url="",
        model_name="gemini-2.5-pro",
        api_key=None,
        openrouter_site_url=None,
        openrouter_app_name=None,
    )
    model = llm_factory.create_sensemaking_llm(opts)
    self.assertIsInstance(model, genai_model.GenaiModel)

  def test_create_openrouter(self):
    opts = SensemakerModelConfig(
        adapter="openai-compatible",
        provider="openrouter",
        base_url="https://openrouter.ai/api/v1",
        model_name="openai/gpt-4o",
        api_key="or-key",
        openrouter_site_url=None,
        openrouter_app_name=None,
    )
    model = llm_factory.create_sensemaking_llm(opts)
    self.assertIsInstance(model, OpenAiCompatLlm)
    self.assertEqual(model.provider, "openrouter")

  def test_create_openai(self):
    opts = SensemakerModelConfig(
        adapter="openai-compatible",
        provider="openai",
        base_url="https://api.openai.com/v1",
        model_name="gpt-4o",
        api_key="oa-key",
        openrouter_site_url=None,
        openrouter_app_name=None,
    )
    model = llm_factory.create_sensemaking_llm(opts)
    self.assertIsInstance(model, OpenAiCompatLlm)
    self.assertEqual(model.provider, "openai")

  def test_create_mistral(self):
    opts = SensemakerModelConfig(
        adapter="openai-compatible",
        provider="mistral",
        base_url="https://api.mistral.ai/v1",
        model_name="mistral-small-latest",
        api_key="mistral-key",
        openrouter_site_url=None,
        openrouter_app_name=None,
    )
    model = llm_factory.create_sensemaking_llm(opts)
    self.assertIsInstance(model, OpenAiCompatLlm)
    self.assertEqual(model.provider, "mistral")


if __name__ == "__main__":
  unittest.main()
