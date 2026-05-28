import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import mustache from "mustache";
import { inlineSource } from "inline-source";
import { buildPayload, resolveBuildOptions } from "./data.js";

const require = createRequire(import.meta.url);

function mkdir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function rm(dirPath) {
  if (fs.existsSync(dirPath)) {
    fs.rmSync(dirPath, { recursive: true, force: true });
  }
}

function toJson(value) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

function getVoteTotals(votes) {
  if (!votes || typeof votes !== "object") {
    return { agreeTotal: 0, disagreeTotal: 0, passTotal: 0, voteTotal: 0 };
  }
  const groups = [];
  if (
    typeof votes.agreeCount === "number" &&
    typeof votes.disagreeCount === "number"
  ) {
    groups.push(votes);
  } else {
    Object.values(votes).forEach((value) => {
      if (
        value &&
        typeof value === "object" &&
        typeof value.agreeCount === "number" &&
        typeof value.disagreeCount === "number"
      ) {
        groups.push(value);
      }
    });
  }
  return groups.reduce(
    (acc, group) => {
      const passCount = Number.isFinite(group.passCount) ? group.passCount : 0;
      acc.agreeTotal += group.agreeCount;
      acc.disagreeTotal += group.disagreeCount;
      acc.passTotal += passCount;
      acc.voteTotal += group.agreeCount + group.disagreeCount + passCount;
      return acc;
    },
    { agreeTotal: 0, disagreeTotal: 0, passTotal: 0, voteTotal: 0 },
  );
}

function formatStatement(statement) {
  const agreePercent = Math.round((statement.agreeRate || 0) * 100);
  const disagreePercent = Math.round((statement.disagreeRate || 0) * 100);
  const passPercent = Math.round((statement.passRate || 0) * 100);
  const topics = String(statement.topics || "")
    .replaceAll(";", ", ")
    .replaceAll(":", " > ");
  const totals = getVoteTotals(statement.votes);
  return {
    id: statement.id || "",
    text: statement.text || "",
    agreePercent,
    disagreePercent,
    passPercent,
    topics,
    isHighAlignment: Boolean(statement.isHighAlignment),
    isLowAlignment: Boolean(statement.isLowAlignment),
    isHighUncertainty: Boolean(statement.isHighUncertainty),
    highAlignmentScore: statement.highAlignmentScore || 0,
    lowAlignmentScore: statement.lowAlignmentScore || 0,
    highUncertaintyScore: statement.highUncertaintyScore || 0,
    ...totals,
  };
}

function formatPayload(payload) {
  return {
    ...payload,
    alignmentCardsHigh: payload.comments
      .filter((statement) => statement.isHighAlignment)
      .sort((a, b) => b.highAlignmentScore - a.highAlignmentScore)
      .slice(0, 12)
      .map(formatStatement),
    alignmentCardsLow: payload.comments
      .filter((statement) => statement.isLowAlignment)
      .sort((a, b) => b.lowAlignmentScore - a.lowAlignmentScore)
      .slice(0, 12)
      .map(formatStatement),
    alignmentCardsUncertain: payload.comments
      .filter((statement) => statement.isHighUncertainty)
      .sort((a, b) => b.highUncertaintyScore - a.highUncertaintyScore)
      .slice(0, 12)
      .map(formatStatement),
    topics: payload.topics.map((topic) => ({
      ...topic,
      subtopicStats: topic.subtopicStats.map((subtopic) => ({
        ...subtopic,
        comments: subtopic.comments.map(formatStatement),
        topHighAlignment: subtopic.topHighAlignment.map(formatStatement),
        topLowAlignment: subtopic.topLowAlignment.map(formatStatement),
        topHighUncertainty: subtopic.topHighUncertainty.map(formatStatement),
      })),
    })),
  };
}

async function inlineHtml(rawHtmlPath, rootPath) {
  return inlineSource(rawHtmlPath, {
    rootpath: rootPath,
    compress: false,
    attribute: "inline",
  });
}

export async function runBuild(argv = process.argv, cwd = process.cwd()) {
  const options = resolveBuildOptions(argv, cwd);
  if (options.command !== "inline" && options.command !== "build") {
    throw new Error(`Unsupported command "${options.command}". Use "inline" or "build".`);
  }

  const moduleDir = path.dirname(fileURLToPath(import.meta.url));
  const srcDir = path.join(moduleDir, "src");
  const tempDir = path.join(options.outputDir, ".tmp");
  mkdir(options.outputDir);
  rm(tempDir);
  mkdir(tempDir);

  const payload = formatPayload(buildPayload(options));
  const template = fs.readFileSync(path.join(srcDir, "index.mustache"), "utf-8");
  const html = mustache.render(template, {
    reportTitle: payload.reportTitle,
    payloadJson: toJson(payload),
  });

  const rawHtmlPath = path.join(tempDir, "raw.html");
  fs.writeFileSync(rawHtmlPath, html);
  fs.copyFileSync(path.join(srcDir, "script.js"), path.join(tempDir, "script.js"));
  fs.copyFileSync(path.join(srcDir, "style.css"), path.join(tempDir, "style.css"));
  const vizMainPath = require.resolve("@cosla/sensemaker-visualizations");
  const vizDistDir = path.dirname(vizMainPath);
  fs.copyFileSync(
    path.join(vizDistDir, "sensemaker-chart.umd.js"),
    path.join(tempDir, "viz.js"),
  );
  fs.copyFileSync(
    path.join(vizDistDir, "sensemaker-visualizations.css"),
    path.join(tempDir, "viz.css"),
  );

  const inlined = await inlineHtml(rawHtmlPath, tempDir);
  fs.writeFileSync(options.outputFile, inlined);
  rm(tempDir);
  return { outputFile: options.outputFile };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runBuild()
    .then((result) => {
      console.log(`Standalone report generated: ${result.outputFile}`);
    })
    .catch((error) => {
      console.error(error.message);
      process.exit(1);
    });
}
