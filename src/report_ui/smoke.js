import { loadConfigSchema, LATEST_CONFIG_SCHEMA_VERSION } from "./data.js";
import { runBuild } from "./build.js";
import path from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = path.dirname(fileURLToPath(import.meta.url));

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function main() {
  const schema = loadConfigSchema(null, packageRoot);
  assert(
    schema.config_schema_version === LATEST_CONFIG_SCHEMA_VERSION,
    `Expected config_schema_version ${LATEST_CONFIG_SCHEMA_VERSION}`,
  );
  for (const key of ["title", "logo", "excluded_topics", "excluded_opinions"]) {
    assert(schema.properties?.[key], `Config schema missing property "${key}"`);
  }

  const explicit = loadConfigSchema(1, packageRoot);
  assert(explicit.config_schema_version === 1, "Expected schema version 1");

  let failed = false;
  try {
    loadConfigSchema(99, packageRoot);
  } catch (error) {
    failed = true;
    assert(
      String(error.message).includes("Unknown config schema version"),
      `Expected clear unknown-version error, got: ${error.message}`,
    );
  }
  assert(failed, "Expected unknown schema version to fail.");

  const previousWrite = process.stdout.write.bind(process.stdout);
  let captured = "";
  process.stdout.write = (chunk) => {
    captured += String(chunk);
    return true;
  };
  try {
    await runBuild(["node", "build.js", "config-schema"], packageRoot);
  } finally {
    process.stdout.write = previousWrite;
  }
  const printed = JSON.parse(captured);
  assert(
    printed.config_schema_version === 1,
    "config-schema command did not print v1 schema",
  );

  console.log("Smoke tests passed.");
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
