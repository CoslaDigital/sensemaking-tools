import fs from "node:fs";
import path from "node:path";
import { runBuild } from "./build.js";

const cwd = process.cwd();
const root = path.resolve(cwd, "fixtures");
const outputRoot = path.resolve(cwd, "smoke-output");

function assertIncludes(filePath, expectedText) {
  const content = fs.readFileSync(filePath, "utf-8");
  if (!content.includes(expectedText)) {
    throw new Error(`Expected output to include "${expectedText}" in ${filePath}`);
  }
}

function assertNotIncludes(filePath, unexpectedText) {
  const content = fs.readFileSync(filePath, "utf-8");
  if (content.includes(unexpectedText)) {
    throw new Error(`Expected output to omit "${unexpectedText}" in ${filePath}`);
  }
}

async function runCase(caseName, expectFailure = false) {
  const inputDir = path.join(root, caseName);
  const outputDir = path.join(outputRoot, caseName);
  fs.rmSync(outputDir, { recursive: true, force: true });
  fs.mkdirSync(outputDir, { recursive: true });

  const argv = [
    "node",
    "build.js",
    "inline",
    "--inputDir",
    inputDir,
    "--outputDir",
    outputDir,
    "--outputFile",
    "report.html",
  ];

  if (expectFailure) {
    let failed = false;
    try {
      await runBuild(argv, cwd);
    } catch (error) {
      failed = true;
      if (!String(error.message).includes("topics string")) {
        throw new Error(`Expected clear missing-field error, got: ${error.message}`);
      }
    }
    if (!failed) {
      throw new Error(`Expected fixture "${caseName}" to fail.`);
    }
    return;
  }

  const result = await runBuild(argv, cwd);
  if (!fs.existsSync(result.outputFile)) {
    throw new Error(`Missing output file for fixture "${caseName}".`);
  }
  assertIncludes(result.outputFile, "About this report");

  if (caseName === "with-config") {
    assertIncludes(result.outputFile, "Configured Report Title");
    assertNotIncludes(result.outputFile, "Transport");
    assertIncludes(result.outputFile, "header-logo");
    assertIncludes(result.outputFile, 'id="top">Configured Report Title');
    // Multi-topic statement keeps Housing after Transport is excluded.
    assertIncludes(
      result.outputFile,
      "Link housing density to better bus corridors.",
    );
    assertIncludes(result.outputFile, "Housing > Affordable housing");
  }
}

async function runConfigSchemaSmoke() {
  const { loadConfigSchema, LATEST_CONFIG_SCHEMA_VERSION } = await import(
    "./data.js"
  );
  const moduleDir = cwd;
  const schema = loadConfigSchema(null, moduleDir);
  if (schema.config_schema_version !== LATEST_CONFIG_SCHEMA_VERSION) {
    throw new Error(
      `Expected config_schema_version ${LATEST_CONFIG_SCHEMA_VERSION}, got ${schema.config_schema_version}`,
    );
  }
  for (const key of ["title", "logo", "excluded_topics"]) {
    if (!schema.properties?.[key]) {
      throw new Error(`Config schema missing property "${key}"`);
    }
  }

  const explicit = loadConfigSchema(1, moduleDir);
  if (explicit.config_schema_version !== 1) {
    throw new Error("Expected --schema-version 1 to load v1 schema");
  }

  let failed = false;
  try {
    loadConfigSchema(99, moduleDir);
  } catch (error) {
    failed = true;
    if (!String(error.message).includes("Unknown config schema version")) {
      throw new Error(`Expected clear unknown-version error, got: ${error.message}`);
    }
  }
  if (!failed) {
    throw new Error("Expected unknown schema version to fail.");
  }

  // End-to-end via runBuild (prints JSON to stdout).
  const previousWrite = process.stdout.write.bind(process.stdout);
  let captured = "";
  process.stdout.write = (chunk, ...rest) => {
    captured += String(chunk);
    return true;
  };
  try {
    await runBuild(["node", "build.js", "config-schema"], cwd);
  } finally {
    process.stdout.write = previousWrite;
  }
  const printed = JSON.parse(captured);
  if (printed.config_schema_version !== 1) {
    throw new Error("config-schema command did not print v1 schema");
  }
}

async function main() {
  fs.rmSync(outputRoot, { recursive: true, force: true });
  fs.mkdirSync(outputRoot, { recursive: true });

  await runCase("happy-path");
  await runCase("empty-dataset");
  await runCase("missing-field", true);
  await runCase("with-config");
  await runConfigSchemaSmoke();

  console.log("Smoke tests passed.");
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
