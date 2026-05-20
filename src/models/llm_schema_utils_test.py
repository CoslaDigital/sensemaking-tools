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

from pydantic import BaseModel

from src.models import llm_schema_utils
from src.models.custom_types import ScoreResponse


class LlmSchemaUtilsTest(unittest.TestCase):

  def test_schema_to_json_dict_from_pydantic_type(self):
    schema = llm_schema_utils.schema_to_json_dict(ScoreResponse)
    self.assertIsInstance(schema, dict)
    self.assertIn("properties", schema)

  def test_schema_to_json_dict_from_dict(self):
    raw = {"type": "object", "properties": {"x": {"type": "string"}}}
    self.assertEqual(llm_schema_utils.schema_to_json_dict(raw), raw)

  def test_prepare_schema_openai_array_wraps(self):
    arr = {"type": "array", "items": {"type": "string"}}
    req, unwrap = llm_schema_utils.prepare_schema_for_mode(
        arr, "json_schema", "openai"
    )
    self.assertTrue(unwrap)
    self.assertEqual(req["properties"]["data"], arr)

  def test_prepare_schema_openrouter_no_wrap(self):
    arr = {"type": "array", "items": {"type": "string"}}
    req, unwrap = llm_schema_utils.prepare_schema_for_mode(
        arr, "json_schema", "openrouter"
    )
    self.assertFalse(unwrap)
    self.assertEqual(req, arr)

  def test_prepare_schema_mistral_no_openai_array_wrap(self):
    arr = {"type": "array", "items": {"type": "string"}}
    req, unwrap = llm_schema_utils.prepare_schema_for_mode(
        arr, "json_schema", "mistral"
    )
    self.assertFalse(unwrap)
    self.assertEqual(req, arr)

  def test_get_response_format_json_schema(self):
    fmt = llm_schema_utils.get_response_format_for_mode(
        {"type": "object"}, "json_schema"
    )
    self.assertEqual(fmt["type"], "json_schema")
    self.assertEqual(fmt["json_schema"]["name"], "sensemaker_response")

  def test_unwrap_data_property(self):
    self.assertEqual(
        llm_schema_utils.unwrap_data_property({"data": [1, 2]}), [1, 2]
    )


if __name__ == "__main__":
  unittest.main()
