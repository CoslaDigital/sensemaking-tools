# Copyright 2026 Google LLC
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

from src.get_gemini_scores_lib import ContentScorer


class ContentScorerTest(unittest.IsolatedAsyncioTestCase):

  async def test_accepts_injected_sensemaking_llm(self):
    mock_llm = mock.AsyncMock()
    mock_llm.process_prompts_concurrently = mock.AsyncMock(
        return_value=(mock.Mock(empty=True), None, 0.0, 0.0)
    )
    scorer = ContentScorer(mock_llm)
    results = await scorer.score_async(
        [{"text": "hello", "row_id": 0}],
        ["CURIOSITY_EXPERIMENTAL"],
    )
    self.assertEqual(results, [])
    mock_llm.process_prompts_concurrently.assert_called_once()


if __name__ == "__main__":
  unittest.main()
