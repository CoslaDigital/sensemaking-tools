# report_ui

Lightweight report builder that generates a standalone `report.html` without Angular.

## CLI usage

```bash
npx sensemaking-report-ui inline \
  --topics ./input/topic-stats.json \
  --summary ./input/summary.json \
  --comments ./input/comments.json \
  --metadata ./input/metadata.json \
  --reportTitle "My Report" \
  --outputDir ./output \
  --outputFile report.html
```

You can also run from this workspace directly:

```bash
npm run build -- inline --inputDir ./fixtures/happy-path --outputDir ./output
```

## Supported options

- `--topics`: path to `topic-stats.json` (default: `<inputDir>/topic-stats.json`)
- `--summary`: path to `summary.json` (default: `<inputDir>/summary.json`)
- `--comments`: path to `comments.json` (default: `<inputDir>/comments.json`)
- `--metadata`: path to `metadata.json` (default: `<inputDir>/metadata.json`)
- `--reportTitle`: optional title override (falls back to metadata title)
- `--inputDir`: base input directory (default: `./input`)
- `--outputDir`: output directory (default: `./output`)
- `--outputFile`: filename or path for final html (default: `report.html`)

## Fixtures and smoke tests

Fixtures are in `fixtures/`:

- `happy-path`
- `empty-dataset`
- `missing-field`

Run smoke checks:

```bash
npm run smoke
```

This validates:

- successful builds for `happy-path` and `empty-dataset` (output under `smoke-output/<fixture>/report.html`),
- output HTML includes the `About this report` section marker,
- `missing-field` fails with a clear validation error (`topics string`).

## Parity checklist against Angular standalone report

- [x] Single-file standalone HTML output (CSS, JS, and viz assets inlined).
- [x] Core report sections:
  - About this report (summary copy, alignment definitions, metrics)
  - Conversation overview (`topics-overview` chart)
  - Participant alignment (high / low / uncertainty toggles)
  - Topics identified badge and per-topic cards (breakdown, chart, subtopic accordions)
  - Subtopic panels (breakdown, themes, high / low / uncertainty statement groups, view-all)
- [x] Charts via inlined `@cosla/sensemaker-visualizations` (`sensemaker-chart`):
  - `topics-overview` on conversation overview
  - `topic-alignment` with Groupings / Statements (`solid` / `waffle`) per topic
- [x] Interaction baseline:
  - Side nav (`details` / `summary`) with topic and subtopic links
  - In-page anchor scroll (overview, topics, subtopics)
  - Share dialog and copy link
  - Statement card tooltips (including inside the statements dialog)
  - Centered statements dialog for “View all statements” (grouped like the Angular drawer)
- [~] Visual style: lightweight CSS approximating layout and colors; not full Angular Material parity (typography, icons, breakdown widgets, etc.).
- [~] Threshold / help microcopy: main section copy and tooltips match Angular; minor gaps may remain (e.g. per-section share buttons, overview breakdown icons).

## Publishing notes

This package is structured for npm publishing:

- CLI exposed via `bin` as `sensemaking-report-ui`.
- Runtime dependency on `@cosla/sensemaker-visualizations` (UMD + CSS copied in at build time).
- `files` whitelist includes only runtime artifacts, fixtures, and docs.
- Breaking input-contract changes should use semver major bumps.
