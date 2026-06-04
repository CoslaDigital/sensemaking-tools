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
"""
Gets bridging scores from an LLM or Perspective API.
Example Usage:
 python3 -m src.get_bridging_scores \
     --input_csv <INPUT_CSV> \
     --output_csv <OUTPUT_CSV> \
     --scorer_type GEMINI \
     --model_name gemini-3.1-flash-lite-preview
"""

import argparse
import collections
import os
import pandas as pd
from src import get_perspective_scores_lib
from src.get_gemini_scores_lib import ContentScorer
from src.models import sensemaker_model_cli
from src.models.sensemaking_llm import SensemakingLlm

AVERAGE_BRIDGING_COLUMN = "AVERAGE_OF_3_BRIDGING"
BRIDGING_ATTRIBUTES = [
    "CURIOSITY_EXPERIMENTAL",
    "PERSONAL_STORY_EXPERIMENTAL",
    "REASONING_EXPERIMENTAL",
]


def get_bridging_scores(
    df: pd.DataFrame,
    text_column: str,
    scorer_type: str,
    model_name: str,
    gcloud_api_key: str | None = None,
    llm: SensemakingLlm | None = None,
):
  """Score df with bridging attributes using specified scorer."""
  if scorer_type == "GEMINI":
    if llm is None:
      raise ValueError("llm is required when scorer_type is GEMINI.")
    print(f"Using LLM ({model_name}) for bridging scoring...")
    scorer = ContentScorer(llm)
    texts_with_ids = [
        {"text": str(text), "row_id": idx}
        for idx, text in df[text_column].items()
    ]
    results = scorer.score(texts_with_ids, BRIDGING_ATTRIBUTES)
    scores_by_row_id = collections.defaultdict(dict)
    for res in results:
      rid = res["row_id"]
      scores_by_row_id[rid].update(res["scores"])
    scores_df = pd.DataFrame.from_dict(scores_by_row_id, orient='index')
    df = df.join(scores_df)
  elif scorer_type == "PERSPECTIVE":
    if not gcloud_api_key:
      raise ValueError(
          "gcloud_api_key is required when scorer_type is PERSPECTIVE."
      )
    print("Using Perspective API for bridging scoring...")
    client = get_perspective_scores_lib.init_client(
        gcloud_api_key=gcloud_api_key
    )
    scores_list = [
        get_perspective_scores_lib.score_text(
            client, str(text), BRIDGING_ATTRIBUTES
        )
        for text in df[text_column]
    ]
    scores_df = pd.DataFrame(scores_list, index=df.index)
    df = df.join(scores_df)
  else:
    raise ValueError(f"Unknown scorer_type: {scorer_type}")
  df[AVERAGE_BRIDGING_COLUMN] = df[BRIDGING_ATTRIBUTES].mean(axis=1)
  return df


if __name__ == "__main__":
  parser = argparse.ArgumentParser(
      description=(
          "Scores quotes with bridging attributes and"
          " and selects recommended and backup GoV quotes."
      )
  )
  parser.add_argument(
      "--input_csv", required=True, help="Path to the input CSV file."
  )
  parser.add_argument(
      "--output_csv", required=True, help="Path to output CSV file."
  )
  parser.add_argument(
      "--gcloud_api_key",
      help=(
          "API key for Perspective API when --scorer_type is PERSPECTIVE"
          " (or set GCLOUD_API_KEY)."
      ),
  )
  parser.add_argument(
      "--text_column",
      default="quote",
      help="Text column in CSV to score.",
  )
  parser.add_argument(
      "--scorer_type",
      choices=["GEMINI", "PERSPECTIVE"],
      default="GEMINI",
      help="Backend to use for generating bridging scores.",
  )
  parser.add_argument(
      "--model_name",
      default="gemini-3.1-flash-lite-preview",
      help="Model id when scorer_type is GEMINI.",
  )
  sensemaker_model_cli.add_sensemaker_model_options(parser)
  args = parser.parse_args()
  df = pd.read_csv(args.input_csv)
  print(f"Scoring {len(df)} rows from {args.input_csv}")

  if args.scorer_type == "PERSPECTIVE":
    gcloud_key = (
        (args.gcloud_api_key and str(args.gcloud_api_key).strip())
        or os.getenv("GCLOUD_API_KEY")
        or sensemaker_model_cli.resolve_cli_api_key_from_args(args)
    )
    if not gcloud_key:
      raise ValueError(
          "--gcloud_api_key, --api_key, or GCLOUD_API_KEY is required for"
          " PERSPECTIVE scorer_type."
      )
    df = get_bridging_scores(
        df,
        args.text_column,
        args.scorer_type,
        args.model_name,
        gcloud_api_key=gcloud_key,
    )
  else:
    llm = sensemaker_model_cli.create_llm_from_args(
        args, model_name=args.model_name
    )
    df = get_bridging_scores(
        df,
        args.text_column,
        args.scorer_type,
        args.model_name,
        llm=llm,
    )
  df.to_csv(args.output_csv, index=False)
  print(f"Wrote {args.output_csv}")
