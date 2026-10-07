import fs from "node:fs";
import path from "node:path";
import { marked } from "marked";

function readJson(filePath, label) {
  if (!filePath) {
    throw new Error(`Missing required option for ${label}.`);
  }
  if (!fs.existsSync(filePath)) {
    throw new Error(`${label} file not found: ${filePath}`);
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch (error) {
    throw new Error(`Invalid JSON in ${label} file (${filePath}): ${error.message}`);
  }
}

function assertArray(value, name) {
  if (!Array.isArray(value)) {
    throw new Error(`Expected ${name} to be an array.`);
  }
}

function getVoteTotals(votes) {
  if (!votes || typeof votes !== "object") {
    return { agreeCount: 0, disagreeCount: 0, passCount: 0, total: 0 };
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
      const pass = Number.isFinite(group.passCount) ? group.passCount : 0;
      acc.agreeCount += group.agreeCount;
      acc.disagreeCount += group.disagreeCount;
      acc.passCount += pass;
      acc.total += group.agreeCount + group.disagreeCount + pass;
      return acc;
    },
    { agreeCount: 0, disagreeCount: 0, passCount: 0, total: 0 },
  );
}

function ensureTopicLinks(topics, comments) {
  const topicLookup = new Map();
  const subtopicIds = [];
  topics.forEach((topic) => {
    if (!topic || typeof topic.name !== "string") {
      throw new Error("Each topic in topic-stats.json must have a string name.");
    }
    assertArray(topic.subtopicStats, `topic.subtopicStats for ${topic.name}`);
    topicLookup.set(topic.name, topic);
    topic.subtopicStats.forEach((subtopic) => {
      if (!subtopic || typeof subtopic.name !== "string") {
        throw new Error(`Subtopic in topic ${topic.name} is missing a string name.`);
      }
      subtopic.id = `${topic.name}-${subtopic.name}`;
      subtopic.comments = [];
      subtopicIds.push(subtopic.id);
    });
  });

  let totalVotes = 0;
  comments.forEach((comment) => {
    if (!comment || typeof comment.text !== "string") {
      throw new Error("Each comment must have a string text field.");
    }
    if (typeof comment.topics !== "string") {
      throw new Error(`Comment is missing topics string: "${comment.text.slice(0, 40)}..."`);
    }
    const topicTokens = comment.topics.split(";").map((token) => token.trim()).filter(Boolean);
    topicTokens.forEach((topicToken) => {
      const [topicName, subtopicName] = topicToken.split(":");
      const topic = topicLookup.get(topicName);
      if (!topic) return;
      const subtopic = topic.subtopicStats.find((item) => item.name === subtopicName);
      if (!subtopic) return;
      subtopic.comments.push(comment);
    });
    totalVotes += getVoteTotals(comment.votes).total;
  });

  return { totalVotes, subtopicIds };
}

function getTopStatements(statements, category) {
  if (category === "high-alignment") {
    return statements
      .filter((statement) => statement.isHighAlignment)
      .sort((a, b) => b.highAlignmentScore - a.highAlignmentScore)
      .slice(0, 12);
  }
  if (category === "low-alignment") {
    return statements
      .filter((statement) => statement.isLowAlignment)
      .sort((a, b) => b.lowAlignmentScore - a.lowAlignmentScore)
      .slice(0, 12);
  }
  return statements
    .filter((statement) => statement.isHighUncertainty)
    .sort((a, b) => b.highUncertaintyScore - a.highUncertaintyScore)
    .slice(0, 12);
}

function markdownToHtml(value) {
  if (!value) return "";
  return marked.parse(value);
}

function getSummaryLookups(summaryData) {
  const topicRoot =
    summaryData?.contents?.find((content) => String(content.title || "").includes("Topics")) || {};
  const topicEntries = Array.isArray(topicRoot.subContents) ? topicRoot.subContents : [];
  const topicMap = new Map();
  topicEntries.forEach((topicEntry) => {
    topicMap.set(topicEntry.title || "", topicEntry);
  });
  return { topicEntries, topicMap };
}

function topicNameFromSummaryTitle(title) {
  return String(title || "")
    .replace(/^#+\s*/, "")
    .trim();
}

function filterSummaryTopics(summaryData, excludedTopics) {
  if (excludedTopics.size === 0) {
    return summaryData;
  }
  const summary = JSON.parse(JSON.stringify(summaryData));
  const topicsSection = summary?.contents?.find((content) =>
    String(content.title || "").includes("Topics"),
  );
  if (topicsSection && Array.isArray(topicsSection.subContents)) {
    topicsSection.subContents = topicsSection.subContents.filter(
      (entry) => !excludedTopics.has(topicNameFromSummaryTitle(entry.title)),
    );
  }
  return summary;
}

function filterComments(comments, excludedTopics) {
  if (excludedTopics.size === 0) {
    return comments;
  }
  return comments
    .map((comment) => {
      const tokens = String(comment.topics || "")
        .split(";")
        .map((token) => token.trim())
        .filter(Boolean)
        .filter((token) => {
          const topicName = token.split(":")[0];
          return !excludedTopics.has(topicName);
        });
      if (tokens.length === 0) {
        return null;
      }
      return { ...comment, topics: tokens.join(";") };
    })
    .filter(Boolean);
}

function resolveLogoPath(logo, configPath, inputDir) {
  if (!logo) {
    return null;
  }
  const searchDirs = [];
  if (configPath) {
    searchDirs.push(path.dirname(configPath));
  }
  if (inputDir && !searchDirs.includes(inputDir)) {
    searchDirs.push(inputDir);
  }
  for (const dir of searchDirs) {
    const candidate = path.join(dir, logo);
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  throw new Error(
    `Logo file not found: ${logo} (searched next to config and under inputDir)`,
  );
}

export function buildPayload(options) {
  const config = options.configPath ? readJson(options.configPath, "config") : {};
  const excludedTopics = new Set(config.excluded_topics || []);

  let topicData = readJson(options.topicsPath, "topics");
  let summaryData = readJson(options.summaryPath, "summary");
  let comments = readJson(options.commentsPath, "comments");
  const metadata = readJson(options.metadataPath, "metadata");

  assertArray(topicData, "topic-stats");
  assertArray(comments, "comments");
  if (!metadata || typeof metadata !== "object") {
    throw new Error("metadata must be an object.");
  }

  topicData = topicData.filter(
    (topic) => topic && typeof topic.name === "string" && !excludedTopics.has(topic.name),
  );
  summaryData = filterSummaryTopics(summaryData, excludedTopics);
  comments = filterComments(comments, excludedTopics);

  const { totalVotes, subtopicIds } = ensureTopicLinks(topicData, comments);
  const { topicEntries } = getSummaryLookups(summaryData);

  const topicsWithContent = topicData.map((topic) => {
    const summaryTopic = topicEntries.find((entry) =>
      String(entry.title || "").includes(topic.name),
    );
    const subtopicStats = topic.subtopicStats.map((subtopic) => {
      const summarySubtopic = summaryTopic?.subContents?.find((entry) =>
        String(entry.title || "").includes(subtopic.name),
      );
      const themes = summarySubtopic?.subContents?.find((entry) =>
        String(entry.title || "").toLowerCase().includes("themes"),
      );
      return {
        ...subtopic,
        themesHtml: markdownToHtml(themes?.text || ""),
        topHighAlignment: getTopStatements(subtopic.comments, "high-alignment"),
        topLowAlignment: getTopStatements(subtopic.comments, "low-alignment"),
        topHighUncertainty: getTopStatements(subtopic.comments, "high-uncertainty"),
      };
    });
    return { ...topic, subtopicStats };
  });

  const logo = typeof config.logo === "string" ? config.logo : "";
  const logoPath = logo
    ? resolveLogoPath(logo, options.configPath, options.inputDir)
    : null;

  return {
    reportTitle:
      options.reportTitle || config.title || metadata.title || "Report",
    logo: logoPath ? path.basename(logoPath) : "",
    logoPath,
    summary: summaryData,
    topics: topicsWithContent,
    comments,
    counts: {
      totalStatements: comments.length,
      totalVotes,
      topicNumber: topicData.length,
      subtopicNumber: subtopicIds.length,
    },
  };
}

/** Latest shipped config schema version (omit `--schema-version` → this). */
export const LATEST_CONFIG_SCHEMA_VERSION = 1;

const CONFIG_SCHEMA_FILES = {
  1: "config.v1.json",
};

/**
 * Loads a config JSON Schema document for the given version.
 * @param {string|number|null|undefined} schemaVersion
 * @param {string} packageRoot Absolute path to the package root (directory of build.js).
 * @returns {object}
 */
export function loadConfigSchema(schemaVersion, packageRoot) {
  const version =
    schemaVersion === undefined || schemaVersion === null || schemaVersion === ""
      ? LATEST_CONFIG_SCHEMA_VERSION
      : Number(schemaVersion);
  if (!Number.isInteger(version) || !CONFIG_SCHEMA_FILES[version]) {
    const supported = Object.keys(CONFIG_SCHEMA_FILES).join(", ");
    throw new Error(
      `Unknown config schema version "${schemaVersion}". Supported: ${supported}.`,
    );
  }
  const schemaPath = path.join(packageRoot, "schemas", CONFIG_SCHEMA_FILES[version]);
  if (!fs.existsSync(schemaPath)) {
    throw new Error(`Config schema file not found: ${schemaPath}`);
  }
  return JSON.parse(fs.readFileSync(schemaPath, "utf-8"));
}

export function resolveBuildOptions(argv, cwd) {
  const args = argv.slice(2);
  const command = args[0] && !args[0].startsWith("--") ? args[0] : "inline";
  const flags = new Map();
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = args[index + 1];
    if (next && !next.startsWith("--")) {
      flags.set(key, next);
      index += 1;
    } else {
      flags.set(key, "true");
    }
  }

  if (command === "config-schema") {
    return {
      command,
      schemaVersion: flags.has("schema-version")
        ? flags.get("schema-version")
        : null,
    };
  }

  const inputDir = path.resolve(cwd, flags.get("inputDir") || "input");
  const outputDir = path.resolve(cwd, flags.get("outputDir") || "output");

  const configExplicit = flags.has("config");
  let configPath = null;
  if (configExplicit) {
    configPath = path.resolve(cwd, flags.get("config"));
    if (!fs.existsSync(configPath)) {
      throw new Error(`Config JSON not found: ${configPath}`);
    }
  } else {
    const defaultConfig = path.join(inputDir, "config.json");
    if (fs.existsSync(defaultConfig)) {
      configPath = defaultConfig;
    }
  }

  return {
    command,
    inputDir,
    outputDir,
    outputFile: path.resolve(outputDir, flags.get("outputFile") || "report.html"),
    reportTitle: flags.get("reportTitle"),
    configPath,
    topicsPath: path.resolve(cwd, flags.get("topics") || path.join(inputDir, "topic-stats.json")),
    summaryPath: path.resolve(cwd, flags.get("summary") || path.join(inputDir, "summary.json")),
    commentsPath: path.resolve(cwd, flags.get("comments") || path.join(inputDir, "comments.json")),
    metadataPath: path.resolve(cwd, flags.get("metadata") || path.join(inputDir, "metadata.json")),
  };
}
