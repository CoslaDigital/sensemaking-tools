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

- report file generation for happy and empty datasets,
- key section marker presence in output HTML,
- clear failure behavior for malformed input.

## Parity checklist against Angular standalone report

- [x] Single-file standalone HTML output.
- [x] Core report sections:
  - About this report
  - Participant alignment
  - Topic sections with subtopic disclosures
- [x] Interaction baseline:
  - Anchor navigation
  - Share dialog and copy link
  - Statement tooltips
  - "View all statements" drawer dialog
- [ ] Visual style and component parity with Angular Material theme.
- [ ] Chart parity (`visualization-library` intentionally excluded in v1).
- [ ] Threshold/help microcopy parity for every section.

## Publishing notes

This package is structured for eventual npm publishing:

- CLI exposed via `bin` as `sensemaking-report-ui`.
- `files` whitelist includes only runtime artifacts, fixtures, and docs.
- Breaking input-contract changes should use semver major bumps.
