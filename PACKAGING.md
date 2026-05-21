# Packaging and releasing cosla-sensemaking-tools

This repository is published on PyPI as **[cosla-sensemaking-tools](https://pypi.org/project/cosla-sensemaking-tools/)**. It is a **Cosla-maintained fork** of [Jigsaw sensemaking-tools](https://github.com/Jigsaw-Code/sensemaking-tools), distributed as **command-line tools only** (not a supported Python import API).

Dependency versions are defined in [`pyproject.toml`](pyproject.toml).

## Install

```bash
pip install cosla-sensemaking-tools
```

Development (editable install with test tooling):

```bash
pip install -e ".[dev]"
```

## Console commands

After install, these commands are on your `PATH` (equivalent to `python3 -m src.<module>` from a git checkout):

| Command | Purpose |
|---------|---------|
| `sensemaking-categorize` | Topic modeling and quote extraction |
| `sensemaking-bridge-scores` | Constructive quality / bridging scores |
| `sensemaking-report-text` | Discussion summarization (JSON report) |
| `sensemaking-propositions` | Proposition generation |
| `sensemaking-refine-propositions` | Simulated jury refinement |
| `sensemaking-simplify-propositions` | Proposition language simplification |
| `sensemaking-jury` | Standalone simulated jury |
| `sensemaking-opinion-learning` | Opinion learning runner |
| `sensemaking-translate-csv` | CSV translation utility |
| `sensemaking-evals` | Evaluation utilities |
| `sensemaking-moderate` | Moderation preparation |
| `sensemaking-qualtrics-process` | Qualtrics export processing |

## Default additional context file

Bundled in the wheel as package data. Resolve the path after install:

```bash
python3 -c "import importlib.resources as r; print(r.files('src') / 'default-additional-context.md')"
```

Pass that path to `--additional_context_file` / `--additional_context` flags where documented in [README.md](README.md).

## Environment variables

LLM adapters (see README):

- **Gemini (default):** `GOOGLE_API_KEY`
- **OpenAI-compatible:** `OPENAI_API_KEY`, `OPENROUTER_API_KEY`, or `MISTRAL_API_KEY` depending on `--provider`

Use `--adapter`, `--provider`, `--model_name`, and `--api_key` on supported commands (see README).

## Local build (maintainers)

```bash
pip install build twine
python3 -m build
twine check dist/*
```

Inspect the wheel does not contain `case_studies/` or `src/report_ui/`:

```bash
unzip -l dist/cosla_sensemaking_tools-*.whl | head -50
```

Smoke-test install:

```bash
python3 -m venv /tmp/sensemaking-smoke
/tmp/sensemaking-smoke/bin/pip install dist/cosla_sensemaking_tools-*.whl
/tmp/sensemaking-smoke/bin/sensemaking-categorize --help
```

## Release to TestPyPI (manual)

1. Register at [test.pypi.org](https://test.pypi.org) (separate account from production PyPI).
2. Create an API token (scope: entire account or project).
3. Ensure `pyproject.toml` `version` is bumped.
4. `python3 -m build`
5. `twine upload --repository testpypi dist/*`  
   Use `TWINE_USERNAME=__token__` and `TWINE_PASSWORD=<token>` if not using `~/.pypirc`.
6. Verify install:

```bash
pip install --index-url https://test.pypi.org/simple/ --extra-index-url https://pypi.org/simple/ cosla-sensemaking-tools==<version>
sensemaking-report-text --help
```

## Release to PyPI (manual)

1. Confirm the project name is available or you own [cosla-sensemaking-tools](https://pypi.org/project/cosla-sensemaking-tools/).
2. `python3 -m build`
3. `twine upload dist/*`
4. Optional git tag: `git tag v0.1.0 && git push origin v0.1.0` (must match `pyproject.toml` version).

## PyPI organisation transfer (later)

When ready, add the Cosla PyPI organisation as a project owner in the project settings on pypi.org, then remove personal ownership if desired. See [PyPI organisation accounts](https://docs.pypi.org/organization-accounts/).

## GitHub Actions (deferred)

Automated publish via Trusted Publishing and `.github/workflows/publish-pypi.yml` is not configured in v0.1.0.

## What is excluded from the PyPI wheel

- `case_studies/` (archived case study snapshots)
- `src/report_ui/` (published separately as an npm package in future Cosla work)

Shell helpers `src/survey_processing.sh` and `src/moderation.sh` are not installed as console scripts in v0.1.0; run them from a git clone if needed.
