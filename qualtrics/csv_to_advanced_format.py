# Copyright 2025 Google LLC
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http:#www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

"""
Convert Gallery of Voices data into Qualtrics form.

"""

import argparse
import pandas as pd


def _create_survey(filename: str, output: str):
  props = pd.read_csv(filename, index_col=False)

  with open(output, 'w') as output_file:
    output_file.write('[[AdvancedFormat]]\n\n')
    output_file.write('[[Block:GOVBlock]]\n\n')
    separator = ''
    for index, row in props.iterrows():
      output_file.write(separator)
      output_file.write('[[Question:TextEntry:Essay]]\n')
      output_file.write(f'[[ID:GOV{index}]]\n')
      output_file.write(f'<h4><strong>Topic:</strong> {row["topic"]}</h4>\n<br/>\n')
      output_file.write(f'<h3><strong>Opinion:</strong> {row["opinion"]}</h3>\n<br/>\n')
      output_file.write(f'<p><strong>&ldquo;{row["comment"]}&rdquo;</strong></p>')
      separator = '\n\n'


def main():
  """Reads a set of questions from a exported CSV to create a Qualtrics Survey"""
  parser = argparse.ArgumentParser(
      description=(
          "Exported propositions used to create a Qualtrics Simple Format survey")
  )
  parser.add_argument(
      "--input_csv", required=True, help="Path to the input CSV file."
  )
  parser.add_argument(
      "--output_txt", required=True, help="Output filename."
  )
  args = parser.parse_args()

  _create_survey(args.input_csv, args.output_txt)


if __name__ == "__main__":
  main()
