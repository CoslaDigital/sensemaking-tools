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

"""Console entry points for the cosla-sensemaking-tools PyPI distribution."""

import runpy


def _run_module(module: str) -> None:
  """Runs a pipeline module as ``python -m <module>`` (includes __main__ block)."""
  runpy.run_module(module, run_name="__main__", alter_sys=True)


def categorize() -> None:
  _run_module("src.categorization_runner")


def bridge_scores() -> None:
  _run_module("src.get_bridging_scores")


def report_text() -> None:
  _run_module("src.generate_report_text.generate_report_text")


def propositions() -> None:
  _run_module("src.propositions.proposition_generator")


def refine_propositions() -> None:
  _run_module("src.proposition_refinement.main")


def simplify_propositions() -> None:
  _run_module("src.proposition_simplification_runner")


def jury() -> None:
  _run_module("src.simulated_jury.main")


def opinion_learning() -> None:
  _run_module("src.opinion_learning_runner")


def translate_csv() -> None:
  _run_module("src.translate_csv")


def evals() -> None:
  _run_module("src.evals.evals")


def moderate() -> None:
  _run_module("src.moderation.prepare_for_moderation")


def qualtrics_process() -> None:
  _run_module("src.qualtrics.process_qualtrics_output")


def health_check() -> None:
  _run_module("src.health_check_runner")
