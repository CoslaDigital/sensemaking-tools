# @cosla/sensemaking-report-builder

> **Cosla fork.** Maintained by [Cosla](https://github.com/CoslaDigital/sensemaking-tools) from the interactive report UI in [Jigsaw sensemaking-tools](https://github.com/Jigsaw-Code/sensemaking-tools) (`src/report_ui`). Not an official Jigsaw or Google release. Cosla adds a path-configurable CLI so Consul and other jobs can pass pipeline artefacts without copying into a package `input/` folder.

Builds an interactive HTML report from **Python pipeline** outputs: bridging-scores / opinions CSV plus `report_data.json` (summary).

This is **not** [`@cosla/sensemaking-report-ui`](https://www.npmjs.com/package/@cosla/sensemaking-report-ui), which consumes Node advanced JSON (`topic-stats.json`, `comments.json`, etc.).

## Install

```bash
npm install @cosla/sensemaking-report-builder
# or
npx @cosla/sensemaking-report-builder inline --help
```

CLI binary: `sensemaking-report-builder`.

## Quick start (CLI)

### Inline (single self-contained HTML) — use `--output`

```bash
npx @cosla/sensemaking-report-builder inline \
  --bridging_scores /path/to/bridging_scores.csv \
  --summary /path/to/report_data.json \
  --output /path/to/report.html
```

`--opinions` is an alias for `--bridging_scores`.

### Static (HTML + CSS/JS siblings) — use `--outputDir`

```bash
npx @cosla/sensemaking-report-builder static \
  --bridging_scores /path/to/bridging_scores.csv \
  --summary /path/to/report_data.json \
  --outputDir /path/to/out
# → /path/to/out/report.html plus assets
```

Using the wrong output flag for the mode fails with a clear error (`inline` forbids `--outputDir`; `static` forbids `--output`).

### Directory-oriented (prepared `input/`)

```bash
npx @cosla/sensemaking-report-builder inline \
  --inputDir ./input \
  --output ./output/report.html
```

Defaults: opinions `<inputDir>/opinions.csv`, summary `<inputDir>/summary.json`, optional `<inputDir>/predicted.json` and `<inputDir>/config.json` if present.

## CLI options

| Arg / flag | Purpose | Default |
|------------|---------|---------|
| `inline` \| `static` | Build mode (**required**) | — |
| `--inputDir` | Base dir for default input paths | `./input` |
| `--opinions` / `--bridging_scores` | Opinions / bridging scores CSV | `<inputDir>/opinions.csv` |
| `--summary` | Summary JSON (`report_data.json`) | `<inputDir>/summary.json` |
| `--predicted` | Predicted-agreement JSON | `<inputDir>/predicted.json` if present |
| `--config` | Config JSON (logo, exclusions, …) | `<inputDir>/config.json` if present; else `{}` |
| `--output` | **inline only:** path to HTML file | `./output/report.html` |
| `--outputDir` | **static only:** output directory | `./output` |

Logo and translations are configured in `config.json` (not CLI flags). Place `logo.svg` / `logo.png` next to that config (under `--inputDir` when using dir mode).

## Input contracts

### Opinions / bridging CSV

Required columns: `topic`, `opinion`, `quote`, `participant_id`.

Optional: `AVERAGE_OF_2_BRIDGING` or `AVERAGE_OF_3_BRIDGING` (used to sort quotes). Demographic columns: prefix with `demo:` (e.g. `demo:Age`).

### Summary JSON

Same shape as Python `sensemaking-report-text` / `report_data.json`: `text`, `sub_contents[]` with `title` and `text`. Optional top-level `title`.

### Config JSON (optional)

| Key | Description |
| :--- | :--- |
| `logo` | Header image filename (e.g. `"logo.svg"`) |
| `translations` | Optional i18n filename under the input dir |
| `overview_chart` | `"toggle"`, `"topics"`, or `"opinions"` |
| `number_of_top_opinions` | Opinions overview chart size |
| `number_of_sample_quotes` | Quote previews per opinion |
| `low_sample_warning_threshold` | Low-sample warning threshold |
| `topic_colors` / `chart_colors` | Overview chart colours |
| `demographic_colors` | Participant chart colours |
| `excludedTopics` / `excludedOpinions` | Hide named topics/opinions |

### Predicted agreement (optional)

`predicted.json` with `text` and `sub_contents[]` containing `statements[]` with `text` and `predicted_agreement`.

### Translations (optional)

Copy `src/default-translations.json`, translate values, set `locale` / `direction` (`ltr` or `rtl`). See that file for keys.

## Local development (git checkout)

From this directory:

```bash
npm install
npm run inline    # → ./output/report.html
npm run static    # → ./output/report.html + assets
npm run preview   # browser-sync on ./output (after static)
```

## Related

- Python CLIs: PyPI [`cosla-sensemaking-tools`](https://pypi.org/project/cosla-sensemaking-tools/) — see repo [README.md](../../README.md) and [PACKAGING.md](../../PACKAGING.md).
- Node report UI (different inputs): [`@cosla/sensemaking-report-ui`](https://www.npmjs.com/package/@cosla/sensemaking-report-ui).
