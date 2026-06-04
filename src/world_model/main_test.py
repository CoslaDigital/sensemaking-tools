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

"""Tests for the world model query CLI."""

import os
import pickle
import subprocess
import sys
import tempfile
import unittest
from unittest import mock

import pandas as pd

from src.world_model import main as world_model_main


def _minimal_world_model_pickle(path: str) -> None:
  """Writes a minimal refined world model pickle for all_by_topic queries."""
  propositions_df = pd.DataFrame({
      "proposition": ["Prop A", "Prop B"],
      "schulze_rank": [1, 2],
  })
  topic_level_df = pd.DataFrame([{
      "topic": "Topic 1",
      "propositions": propositions_df,
      "full_schulze_ranking": ["Prop A", "Prop B"],
      "topic_level_pav_ranking": [],
  }])
  data = {"topic_level_results": topic_level_df}
  with open(path, "wb") as f:
    pickle.dump(data, f)


class WorldModelMainTest(unittest.TestCase):

  def setUp(self):
    self.temp_dir = tempfile.mkdtemp()
    self.input_pkl = os.path.join(self.temp_dir, "refined_world_model.pkl")
    _minimal_world_model_pickle(self.input_pkl)

  def test_stdout_csv(self):
    with mock.patch("builtins.print") as mock_print:
      world_model_main.main([
          self.input_pkl,
          "--query",
          "all_by_topic",
          "--output_format",
          "csv",
      ])
      mock_print.assert_called()
      printed = mock_print.call_args[0][0]
      self.assertIn("proposition", printed)

  def test_redirect_writes_csv_file(self):
    output_csv = os.path.join(self.temp_dir, "output.csv")
    with open(output_csv, "w", encoding="utf-8") as out_file:
      result = subprocess.run(
          [
              sys.executable,
              "-m",
              "src.world_model.main",
              self.input_pkl,
              "--query",
              "all_by_topic",
              "--output_format",
              "csv",
          ],
          cwd=os.getcwd(),
          stdout=out_file,
          stderr=subprocess.PIPE,
          text=True,
          check=False,
      )
    self.assertEqual(result.returncode, 0, result.stderr)
    loaded = pd.read_csv(output_csv)
    self.assertIn("proposition", loaded.columns)
    self.assertGreaterEqual(len(loaded), 1)

  def test_exits_nonzero_on_missing_pkl(self):
    result = subprocess.run(
        [
            sys.executable,
            "-m",
            "src.world_model.main",
            "/nonexistent/refined_world_model.pkl",
            "--query",
            "all_by_topic",
            "--output_format",
            "csv",
        ],
        cwd=os.getcwd(),
        capture_output=True,
        text=True,
        check=False,
    )
    self.assertEqual(result.returncode, 1)
    self.assertIn("Error:", result.stderr)


if __name__ == "__main__":
  unittest.main()
