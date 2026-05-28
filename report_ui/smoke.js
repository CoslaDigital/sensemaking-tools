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
}

async function main() {
  fs.rmSync(outputRoot, { recursive: true, force: true });
  fs.mkdirSync(outputRoot, { recursive: true });

  await runCase("happy-path");
  await runCase("empty-dataset");
  await runCase("missing-field", true);

  console.log("Smoke tests passed.");
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
