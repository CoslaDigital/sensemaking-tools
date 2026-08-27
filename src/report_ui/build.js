/**
 * @fileoverview Build automation for static and inlined HTML reports.
 * CLI-first entry via {@link runBuild}, modeled on @cosla/sensemaking-report-ui.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
import csv from "csvtojson";
import mustache from "mustache";
import { inlineSource } from "inline-source";
import { processReportData, resolveBuildOptions } from "./data.js";

const WORK_DIR_NAME = ".py-report-ui-work";

/**
 * Recursively removes a directory or file if it exists.
 * @param {string} dirPath
 */
function rm(dirPath) {
  if (fs.existsSync(dirPath)) {
    fs.rmSync(dirPath, { recursive: true, force: true });
  }
}

/**
 * Creates a directory recursively if it does not already exist.
 * @param {string} dirPath
 */
function mkdir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

/**
 * Copies a source file or directory to a destination.
 * @param {string} src
 * @param {string} dest
 */
function cp(src, dest) {
  if (!fs.existsSync(src)) return;
  let destination = dest;
  if (fs.existsSync(dest) && fs.statSync(dest).isDirectory()) {
    destination = path.join(dest, path.basename(src));
  }
  fs.cpSync(src, destination, { recursive: true });
}

/**
 * Stages caller inputs into a fixed layout under workDir.
 * @param {import("./data.js").BuildOptions} options
 * @param {string} workDir
 * @returns {{
 *   opinionsCsv: string,
 *   summaryPath: string,
 *   configPath: string|null,
 *   predictedPath: string|null,
 *   stagedInputDir: string,
 * }}
 */
function stageInputs(options, workDir) {
  const stagedInputDir = path.join(workDir, "input");
  mkdir(stagedInputDir);

  const opinionsCsv = path.join(stagedInputDir, "opinions.csv");
  fs.copyFileSync(options.opinionsPath, opinionsCsv);

  const summaryPath = path.join(stagedInputDir, "summary.json");
  fs.copyFileSync(options.summaryPath, summaryPath);

  let configPath = null;
  if (options.configPath) {
    configPath = path.join(stagedInputDir, "config.json");
    fs.copyFileSync(options.configPath, configPath);
  }

  let predictedPath = null;
  if (options.predictedPath) {
    predictedPath = path.join(stagedInputDir, "predicted.json");
    fs.copyFileSync(options.predictedPath, predictedPath);
  }

  if (fs.existsSync(options.inputDir)) {
    for (const name of fs.readdirSync(options.inputDir)) {
      if (name.startsWith("logo.")) {
        cp(path.join(options.inputDir, name), stagedInputDir);
      }
    }
    const translations = path.join(options.inputDir, "translations.json");
    if (fs.existsSync(translations)) {
      cp(translations, stagedInputDir);
    }
    if (configPath) {
      const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
      if (config.translations) {
        const t1 = path.join(options.inputDir, config.translations);
        const t2 = path.join(options.inputDir, `${config.translations}.json`);
        if (fs.existsSync(t1)) cp(t1, stagedInputDir);
        else if (fs.existsSync(t2)) cp(t2, stagedInputDir);
      }
    }
  }

  return {
    opinionsCsv,
    summaryPath,
    configPath,
    predictedPath,
    stagedInputDir,
  };
}

/**
 * Copies package src assets (except mustache) into dest.
 * @param {string} packageRoot
 * @param {string} dest
 */
function copySrcAssets(packageRoot, dest) {
  const srcDir = path.join(packageRoot, "src");
  if (!fs.existsSync(srcDir)) return;
  for (const file of fs.readdirSync(srcDir)) {
    if (file === "index.mustache") continue;
    cp(path.join(srcDir, file), dest);
  }
}

/**
 * Copies logo.* from staged input into dest.
 * @param {string} stagedInputDir
 * @param {string} dest
 */
function copyLogos(stagedInputDir, dest) {
  if (!fs.existsSync(stagedInputDir)) return;
  for (const name of fs.readdirSync(stagedInputDir)) {
    if (name.startsWith("logo.")) {
      cp(path.join(stagedInputDir, name), dest);
    }
  }
}

/**
 * Replaces font file URLs with base64 data URIs from sibling .txt files.
 * @param {string} html
 * @param {string} fontsDir
 * @returns {string}
 */
function inlineFontDataUris(html, fontsDir) {
  if (!fs.existsSync(fontsDir)) return html;
  let result = html;
  const fontFiles = fs
    .readdirSync(fontsDir)
    .filter((f) => f.endsWith(".woff2"));
  for (const fontFile of fontFiles) {
    const txtFile = path.join(
      fontsDir,
      fontFile.replace(/\.woff2$/, ".txt"),
    );
    if (!fs.existsSync(txtFile)) continue;
    const dataUri = fs.readFileSync(txtFile, "utf-8").trim();
    result = result.split(`fonts/${fontFile}`).join(dataUri);
  }
  return result;
}

/**
 * Runs the full report build.
 * @param {string[]} [argv=process.argv]
 * @param {string} [cwd=process.cwd()]
 * @returns {Promise<{output?: string, outputDir?: string}>}
 */
export async function runBuild(argv = process.argv, cwd = process.cwd()) {
  const options = resolveBuildOptions(argv, cwd);
  const packageRoot = path.dirname(fileURLToPath(import.meta.url));
  const artefactRoot =
    options.command === "inline"
      ? path.dirname(options.output)
      : options.outputDir;
  const workDir = path.join(artefactRoot, WORK_DIR_NAME);

  mkdir(artefactRoot);
  rm(workDir);
  mkdir(workDir);

  try {
    console.log(
      options.command === "inline"
        ? "\n** BUILDING REPORT (INLINE) **\n"
        : "\n** BUILDING REPORT (STATIC) **\n",
    );

    console.log("...staging inputs");
    const staged = stageInputs(options, workDir);

    console.log("...converting opinions csv to json");
    const opinionsRaw = await csv().fromFile(staged.opinionsCsv);

    console.log("...processing data");
    const { dataStatic, dataInline } = processReportData({
      opinionsRaw,
      summaryPath: staged.summaryPath,
      configPath: staged.configPath,
      predictedPath: staged.predictedPath,
      inputDir: staged.stagedInputDir,
      packageRoot,
      workDir,
    });

    const template = fs.readFileSync(
      path.join(packageRoot, "src", "index.mustache"),
      "utf-8",
    );
    const templateData =
      options.command === "inline" ? dataInline : dataStatic;
    const rawHtml = mustache.render(template, templateData);
    const rawHtmlPath = path.join(workDir, "raw.html");
    fs.writeFileSync(rawHtmlPath, rawHtml);

    if (options.command === "inline") {
      console.log("...inlining data and assets");
      copySrcAssets(packageRoot, workDir);
      copyLogos(staged.stagedInputDir, workDir);

      let inlined = await inlineSource(rawHtmlPath, {
        rootpath: workDir,
        compress: false,
        attribute: "inline",
      });
      inlined = inlineFontDataUris(inlined, path.join(workDir, "fonts"));
      fs.writeFileSync(options.output, inlined);
      console.log("\n** BUILD COMPLETE! **\n");
      return { output: options.output };
    }

    console.log("...copying static assets");
    copySrcAssets(packageRoot, artefactRoot);
    copyLogos(staged.stagedInputDir, artefactRoot);
    cp(path.join(workDir, "quotes.json"), artefactRoot);
    const reportHtml = path.join(artefactRoot, "report.html");
    fs.writeFileSync(reportHtml, rawHtml);
    const mustacheOut = path.join(artefactRoot, "index.mustache");
    if (fs.existsSync(mustacheOut)) fs.rmSync(mustacheOut);

    console.log("\n** BUILD COMPLETE! **\n");
    return { outputDir: options.outputDir };
  } finally {
    rm(workDir);
  }
}

/**
 * Legacy preview helper: browser-sync on ./output.
 */
function preview() {
  execSync(
    'npx -y -q browser-sync start --server ./output --files "./output/**"',
    { stdio: "inherit" },
  );
}

/**
 * Legacy github pages helper (static into docs/).
 */
async function github() {
  await runBuild(
    ["node", "build.js", "static", "--outputDir", "./output"],
    process.cwd(),
  );
  console.log("...deploying to github docs");
  rm("docs");
  mkdir("docs");
  for (const file of fs.readdirSync("output")) {
    if (file === WORK_DIR_NAME) continue;
    cp(path.join("output", file), "docs");
  }
  fs.closeSync(fs.openSync("docs/.nojekyll", "w"));
  execSync("git add -A", { stdio: "inherit" });
  execSync('git commit -m "update github pages"', { stdio: "inherit" });
  execSync("git push", { stdio: "inherit" });
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  const command = process.argv[2];
  if (command === "preview") {
    preview();
  } else if (command === "github") {
    github().catch((error) => {
      console.error(error.message);
      process.exit(1);
    });
  } else {
    runBuild(process.argv, process.cwd())
      .then((result) => {
        console.log(
          `Standalone report generated: ${result.output || result.outputDir}`,
        );
      })
      .catch((error) => {
        console.error(error.message);
        process.exit(1);
      });
  }
}
