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

"""Helpers for OpenAI-compatible structured output (JSON schema / json_object)."""

from __future__ import annotations

import json
from typing import Any, Literal

ResponseFormatMode = Literal["json_schema", "json_object", "prompt_only"]

STRUCTURED_OUTPUT_MODES: tuple[ResponseFormatMode, ...] = (
    "json_schema",
    "json_object",
    "prompt_only",
)


def schema_to_json_dict(schema: Any | None) -> dict[str, Any] | None:
  """Converts a Pydantic model type, instance schema dict, or None to JSON Schema."""
  if schema is None:
    return None
  if isinstance(schema, dict):
    return schema
  model_json_schema = getattr(schema, "model_json_schema", None)
  if callable(model_json_schema):
    return model_json_schema()
  return None


def prepare_schema_for_mode(
    json_schema: dict[str, Any],
    mode: ResponseFormatMode,
    provider: str,
) -> tuple[dict[str, Any], bool]:
  """Prepares request schema; returns (request_schema, unwrap_data_property)."""
  if mode != "json_schema" or provider != "openai":
    return json_schema, False
  if json_schema.get("type") == "array":
    return (
        {
            "type": "object",
            "properties": {"data": json_schema},
            "required": ["data"],
            "additionalProperties": False,
        },
        True,
    )
  return json_schema, False


def get_response_format_for_mode(
    json_schema: dict[str, Any],
    mode: ResponseFormatMode,
) -> dict[str, Any] | None:
  """Builds OpenAI ``response_format`` for the given mode."""
  if mode == "json_object":
    return {"type": "json_object"}
  if mode == "json_schema":
    return {
        "type": "json_schema",
        "json_schema": {
            "name": "sensemaker_response",
            "schema": json_schema,
        },
    }
  return None


def get_messages_for_mode(
    prompt: str,
    system_prompt: str | None,
    json_schema: dict[str, Any],
    mode: ResponseFormatMode,
) -> list[dict[str, str]]:
  """Builds chat messages for a completion request."""
  json_instruction = (
      "Return only valid JSON. Do not include markdown code fences or extra"
      " commentary."
  )
  if mode == "json_object":
    messages = [{"role": "system", "content": json_instruction}]
    if system_prompt:
      messages.append({"role": "system", "content": system_prompt})
    messages.append({"role": "user", "content": prompt})
    return messages
  if mode == "prompt_only":
    user_content = (
        f"{prompt}\n\nReturn an object that matches this JSON schema"
        f" exactly:\n{json.dumps(json_schema)}"
    )
    messages = [{"role": "system", "content": json_instruction}]
    if system_prompt:
      messages.append({"role": "system", "content": system_prompt})
    messages.append({"role": "user", "content": user_content})
    return messages
  messages = []
  if system_prompt:
    messages.append({"role": "system", "content": system_prompt})
  messages.append({"role": "user", "content": prompt})
  return messages


def unwrap_data_property(parsed: Any) -> Any:
  """Unwraps OpenAI array wrapper ``{data: [...]}`` when used."""
  if isinstance(parsed, dict) and "data" in parsed:
    return parsed["data"]
  return parsed
