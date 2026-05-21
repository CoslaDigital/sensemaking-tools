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

import argparse
import os
import unittest
from unittest import mock

from src.models import genai_model
from src.models import sensemaker_model_cli
from src.models.openai_compat_llm import OpenAiCompatLlm


class SensemakerModelCliTest(unittest.TestCase):

  def test_default_adapter_is_gemini(self):
    parser = argparse.ArgumentParser()
    sensemaker_model_cli.add_sensemaker_model_options(parser)
    args = parser.parse_args([])
    opts = sensemaker_model_cli.parse_sensemaker_model_opts(args)
    self.assertEqual(opts.adapter, "gemini")
    sensemaker_model_cli.validate_sensemaker_model_opts(opts)

  def test_openrouter_base_url_preset(self):
    opts = sensemaker_model_cli.SensemakerModelConfig(
        adapter="openai-compatible",
        provider="openrouter",
        base_url=sensemaker_model_cli.get_base_url(
            "openai-compatible", "openrouter", None
        ),
        model_name="openai/gpt-4o",
        api_key=None,
        openrouter_site_url=None,
        openrouter_app_name=None,
    )
    self.assertEqual(
        opts.base_url, sensemaker_model_cli.DEFAULT_OPENROUTER_BASE_URL
    )

  def test_openai_base_url_preset(self):
    url = sensemaker_model_cli.get_base_url("openai-compatible", "openai", None)
    self.assertEqual(url, sensemaker_model_cli.DEFAULT_OPENAI_BASE_URL)

  def test_mistral_base_url_preset(self):
    url = sensemaker_model_cli.get_base_url("openai-compatible", "mistral", None)
    self.assertEqual(url, sensemaker_model_cli.DEFAULT_MISTRAL_BASE_URL)

  def test_normalize_adapter_vertex(self):
    self.assertEqual(
        sensemaker_model_cli.normalize_adapter("vertex"), "vertex"
    )

  def test_vertex_requires_project(self):
    opts = sensemaker_model_cli.SensemakerModelConfig(
        adapter="vertex",
        provider=None,
        base_url="",
        model_name="gemini-2.5-pro",
        api_key=None,
        openrouter_site_url=None,
        openrouter_app_name=None,
        vertex_project=None,
        vertex_location=None,
    )
    with self.assertRaises(ValueError) as ctx:
      sensemaker_model_cli.validate_sensemaker_model_opts(opts)
    self.assertIn("vertex_project", str(ctx.exception))

  def test_vertex_rejects_provider(self):
    opts = sensemaker_model_cli.SensemakerModelConfig(
        adapter="vertex",
        provider="openai",
        base_url="",
        model_name="gemini-2.5-pro",
        api_key=None,
        openrouter_site_url=None,
        openrouter_app_name=None,
        vertex_project="my-project",
        vertex_location="global",
    )
    with self.assertRaises(ValueError) as ctx:
      sensemaker_model_cli.validate_sensemaker_model_opts(opts)
    self.assertIn("provider", str(ctx.exception))

  def test_gemini_rejects_vertex_flags(self):
    parser = argparse.ArgumentParser()
    sensemaker_model_cli.add_sensemaker_model_options(parser)
    args = parser.parse_args([
        "--adapter", "gemini",
        "--vertex_project", "my-project",
    ])
    opts = sensemaker_model_cli.parse_sensemaker_model_opts(args)
    with self.assertRaises(ValueError) as ctx:
      sensemaker_model_cli.validate_sensemaker_model_opts(opts)
    self.assertIn("vertex", str(ctx.exception))

  def test_resolve_vertex_project_from_env(self):
    with mock.patch.dict(
        os.environ, {"GOOGLE_CLOUD_PROJECT": "env-project"}, clear=False
    ):
      opts = sensemaker_model_cli.SensemakerModelConfig(
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
      self.assertEqual(
          sensemaker_model_cli.resolve_vertex_project(opts), "env-project"
      )

  def test_resolve_vertex_location_defaults_global(self):
    opts = sensemaker_model_cli.SensemakerModelConfig(
        adapter="vertex",
        provider=None,
        base_url="",
        model_name=None,
        api_key=None,
        openrouter_site_url=None,
        openrouter_app_name=None,
        vertex_project="p",
        vertex_location=None,
    )
    self.assertEqual(
        sensemaker_model_cli.resolve_vertex_location(opts), "global"
    )

  def test_vertex_resolve_api_key_is_none(self):
    opts = sensemaker_model_cli.SensemakerModelConfig(
        adapter="vertex",
        provider=None,
        base_url="",
        model_name="gemini-2.5-pro",
        api_key="ignored",
        openrouter_site_url=None,
        openrouter_app_name=None,
        vertex_project="my-project",
        vertex_location="us-central1",
    )
    self.assertIsNone(sensemaker_model_cli.resolve_api_key(opts))

  def test_openai_compatible_requires_provider(self):
    opts = sensemaker_model_cli.SensemakerModelConfig(
        adapter="openai-compatible",
        provider=None,
        base_url="",
        model_name="gpt-4o",
        api_key=None,
        openrouter_site_url=None,
        openrouter_app_name=None,
    )
    with self.assertRaises(ValueError):
      sensemaker_model_cli.validate_sensemaker_model_opts(opts)

  def test_resolve_openrouter_api_key_from_env(self):
    with mock.patch.dict(
        os.environ, {"OPENROUTER_API_KEY": "test-key"}, clear=False
    ):
      opts = sensemaker_model_cli.SensemakerModelConfig(
          adapter="openai-compatible",
          provider="openrouter",
          base_url=sensemaker_model_cli.DEFAULT_OPENROUTER_BASE_URL,
          model_name="openai/gpt-4o",
          api_key=None,
          openrouter_site_url=None,
          openrouter_app_name=None,
      )
      self.assertEqual(sensemaker_model_cli.resolve_api_key(opts), "test-key")

  def test_resolve_mistral_api_key_from_env(self):
    with mock.patch.dict(
        os.environ, {"MISTRAL_API_KEY": "mistral-test-key"}, clear=False
    ):
      opts = sensemaker_model_cli.SensemakerModelConfig(
          adapter="openai-compatible",
          provider="mistral",
          base_url=sensemaker_model_cli.DEFAULT_MISTRAL_BASE_URL,
          model_name="mistral-small-latest",
          api_key=None,
          openrouter_site_url=None,
          openrouter_app_name=None,
      )
      self.assertEqual(
          sensemaker_model_cli.resolve_api_key(opts), "mistral-test-key"
      )

  @mock.patch.dict("os.environ", {"GOOGLE_API_KEY": "g-key"}, clear=False)
  def test_create_llm_from_args_default_gemini(self):
    parser = argparse.ArgumentParser()
    parser.add_argument("--model_name", default="gemini-2.5-pro")
    sensemaker_model_cli.add_sensemaker_model_options(parser)
    args = parser.parse_args([])
    model = sensemaker_model_cli.create_llm_from_args(
        args, model_name=args.model_name
    )
    self.assertIsInstance(model, genai_model.GenaiModel)

  def test_create_llm_from_args_legacy_gemini_api_key(self):
    parser = argparse.ArgumentParser()
    parser.add_argument("--model_name", default=None)
    sensemaker_model_cli.add_sensemaker_model_options(parser)
    args = parser.parse_args([
        "--adapter", "openai-compatible",
        "--provider", "openrouter",
        "--model_name", "openai/gpt-4o",
    ])
    args.gemini_api_key = "legacy-key"
    model = sensemaker_model_cli.create_llm_from_args(args)
    self.assertIsInstance(model, OpenAiCompatLlm)
    self.assertEqual(model.provider, "openrouter")

  @mock.patch("google.genai.Client")
  def test_create_llm_from_args_vertex(self, mock_genai_client):
    parser = argparse.ArgumentParser()
    parser.add_argument("--model_name", default="gemini-2.5-pro")
    sensemaker_model_cli.add_sensemaker_model_options(parser)
    args = parser.parse_args([
        "--adapter", "vertex",
        "--vertex_project", "my-gcp-project",
        "--vertex_location", "global",
    ])
    model = sensemaker_model_cli.create_llm_from_args(args)
    self.assertIsInstance(model, genai_model.GenaiModel)
    mock_genai_client.assert_called_once_with(
        vertexai=True,
        project="my-gcp-project",
        location="global",
    )

  @mock.patch.dict("os.environ", {"OPENROUTER_API_KEY": "or-env"}, clear=False)
  def test_create_llm_from_args_openrouter(self):
    parser = argparse.ArgumentParser()
    parser.add_argument("--model_name", default=None)
    sensemaker_model_cli.add_sensemaker_model_options(parser)
    args = parser.parse_args([
        "--adapter", "openai-compatible",
        "--provider", "openrouter",
        "--model_name", "openai/gpt-4o",
    ])
    model = sensemaker_model_cli.create_llm_from_args(args)
    self.assertIsInstance(model, OpenAiCompatLlm)


if __name__ == "__main__":
  unittest.main()
