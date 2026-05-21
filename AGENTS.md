# AI Agent Instructions

You are an expert Python developer working on this repository. Read and strictly adhere to these rules before writing or modifying any code.

## Project Overview

This repository shares tools developed by Jigsaw as a proof of concept to help make sense of large-scale online conversations. It demonstrates how Large Language Models (LLMs) like Gemini can be leveraged for such tasks. The code provided here offers a transparent look into Jigsaw's methods for categorization, summarization, and identifying points of agreement and disagreement in free response public opinion research. Our goal in sharing this is to inspire others by providing a potential starting point and useful elements for those tackling similar challenges.

More details can be found in the README.md file, along with instructions for running each step of the Sensemaking pipeline.

## PyPI distribution

This fork is published as **`cosla-sensemaking-tools`** on PyPI (CLI-only; the installable Python package name remains `src` for merge compatibility with upstream). Console entry points are defined in [`src/console_entrypoints.py`](src/console_entrypoints.py) and [`pyproject.toml`](pyproject.toml). Release steps are in [PACKAGING.md](PACKAGING.md). The wheel excludes `case_studies/` and `src/report_ui/`.

## Repository Boundaries & Rules
- **DO NOT touch the `case_studies/` directory.** Do not read from it, use it for context, or modify any files inside it. This is intended only to document past work, it does not need modification and should not be imported into other files.
- **Source Code Only:** All active development happens exclusively within the `src/` directory.
- **Google Style Guide:** All Python code must strictly follow standard [Google Python Style conventions](https://google.github.io/styleguide/pyguide.html). All functions, classes, and modules must include Google-style docstrings.

## Architecture & Tech Stack

### 1. LLM integration
Pipeline code depends on **`SensemakingLlm`** ([`src/models/sensemaking_llm.py`](src/models/sensemaking_llm.py)), not a specific vendor SDK.

- **NEVER** import `google-generativeai`, `vertexai`, `litellm`, `openai`, or similar directly in feature code under `src/` (outside `src/models/`).
- **Construct backends** via [`create_llm_from_args`](src/models/sensemaker_model_cli.py) (or [`create_sensemaking_llm`](src/models/llm_factory.py) with a parsed `SensemakerModelConfig`) from CLI options in [`sensemaker_model_cli.py`](src/models/sensemaker_model_cli.py):
  - `--adapter gemini` (default) → [`GenaiModel`](src/models/genai_model.py) / `GOOGLE_API_KEY`
  - `--adapter openai-compatible` + `--provider openai|openrouter|mistral` → [`OpenAiCompatLlm`](src/models/openai_compat_llm.py)
- Runners should call `add_sensemaker_model_options(parser)` then `create_llm_from_args(args, model_name=...)`. Legacy `--gemini_api_key` is still accepted as an API key alias.
- *(Agent Note: Review `genai_model.py` and `openai_compat_llm.py` for completion contracts, retries, and structured output behavior.)*

### 2. Data Handling (CSV)
- We use `pandas` exclusively for reading, writing, and manipulating CSV data.
- Do not use Python's built-in `csv` module unless explicitly requested.

## Executable Commands
Use these exact commands when verifying your work. Run them from the project root.

*   **Install dependencies** (canonical versions in `pyproject.toml`):
    ```bash
    pip install -e ".[dev]"
    ```
*   **Run all tests:**
    ```bash
    pytest
    ```
*   **Run a specific test file:**
    ```bash
    pytest path/to/test_file.py
    ```
*   **Run a specific test function:**
    ```bash
    pytest path/to/test_file.py::test_function_name
    ```

## Agent Workflow
1. When asked to create a new file, place it in the appropriate subdirectory within `src/`.
2. Before presenting code, write unit tests for it using `pytest`.
3. If your code requires new dependencies, ask the user for permission before adding them to `pyproject.toml` `[project.dependencies]` or `[project.optional-dependencies] dev`.