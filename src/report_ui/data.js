/**
 * @fileoverview Data script for the report.
 * This script performs the ETL (Extract, Transform, Load) process:
 * 1. Loads raw opinion data, configuration, and AI-generated summaries.
 * 2. Transforms flat opinion lists into a hierarchical structure (Topics -> Opinions -> Quotes).
 * 3. Calculates statistics (participant counts, bridging scores).
 * 4. Generates formatted JSON payloads for the frontend ("static" and "inline" variations).
 */

import fs from "node:fs";
import path from "node:path";

const demographics_prefix = "demo:";

/**
 * @typedef {Object} RawOpinion
 * @property {string} topic - The high-level topic category.
 * @property {string} opinion - The specific opinion text.
 * @property {string} quote - The actual quote text.
 * @property {string} participant_id - Representative ID (Participant ID).
 * @property {string|number} [AVERAGE_OF_2_BRIDGING] - Used for sorting.
 * @property {string|number} [AVERAGE_OF_3_BRIDGING] - Alternate bridging column.
 */

/**
 * @typedef {Object} BuildOptions
 * @property {"inline"|"static"} command
 * @property {string} inputDir
 * @property {string|null} output
 * @property {string|null} outputDir
 * @property {string} opinionsPath
 * @property {string} summaryPath
 * @property {string|null} predictedPath
 * @property {string|null} configPath
 * @property {boolean} predictedExplicit
 * @property {boolean} configExplicit
 */

/**
 * Parses argv flags into a Map of key -> value.
 * @param {string[]} args
 * @returns {Map<string, string>}
 */
function parseFlags(args) {
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
  return flags;
}

/**
 * Resolves CLI argv into absolute build paths.
 * @param {string[]} [argv=process.argv]
 * @param {string} [cwd=process.cwd()]
 * @returns {BuildOptions}
 */
export function resolveBuildOptions(argv = process.argv, cwd = process.cwd()) {
  const args = argv.slice(2);
  const commandToken = args[0] && !args[0].startsWith("--") ? args[0] : null;
  if (!commandToken) {
    throw new Error(
      'Build mode is required. Use "inline" or "static" as the first argument.',
    );
  }
  if (commandToken !== "inline" && commandToken !== "static") {
    throw new Error(
      `Unsupported command "${commandToken}". Use "inline" or "static".`,
    );
  }

  const flags = parseFlags(args);
  const hasOutput = flags.has("output");
  const hasOutputDir = flags.has("outputDir");

  if (hasOutput && hasOutputDir) {
    throw new Error(
      "Use either --output (inline) or --outputDir (static), not both.",
    );
  }

  let output = null;
  let outputDir = null;

  if (commandToken === "inline") {
    if (hasOutputDir) {
      throw new Error(
        "inline mode writes a single HTML file; use --output <file.html> (not --outputDir).",
      );
    }
    output = path.resolve(cwd, flags.get("output") || "output/report.html");
  } else {
    if (hasOutput) {
      throw new Error(
        "static mode writes multiple artefacts; use --outputDir <dir> (not --output).",
      );
    }
    outputDir = path.resolve(cwd, flags.get("outputDir") || "output");
  }

  const inputDir = path.resolve(cwd, flags.get("inputDir") || "input");

  const opinionsFlag = flags.get("opinions");
  const bridgingFlag = flags.get("bridging_scores");
  if (opinionsFlag && bridgingFlag) {
    const opinionsResolved = path.resolve(cwd, opinionsFlag);
    const bridgingResolved = path.resolve(cwd, bridgingFlag);
    if (opinionsResolved !== bridgingResolved) {
      throw new Error(
        "--opinions and --bridging_scores both set to different paths; use only one.",
      );
    }
  }
  const opinionsPath = path.resolve(
    cwd,
    opinionsFlag ||
      bridgingFlag ||
      path.join(inputDir, "opinions.csv"),
  );
  const summaryPath = path.resolve(
    cwd,
    flags.get("summary") || path.join(inputDir, "summary.json"),
  );

  const predictedExplicit = flags.has("predicted");
  const configExplicit = flags.has("config");

  let predictedPath = null;
  if (predictedExplicit) {
    predictedPath = path.resolve(cwd, flags.get("predicted"));
  } else {
    const defaultPredicted = path.join(inputDir, "predicted.json");
    if (fs.existsSync(defaultPredicted)) {
      predictedPath = defaultPredicted;
    }
  }

  let configPath = null;
  if (configExplicit) {
    configPath = path.resolve(cwd, flags.get("config"));
  } else {
    const defaultConfig = path.join(inputDir, "config.json");
    if (fs.existsSync(defaultConfig)) {
      configPath = defaultConfig;
    }
  }

  if (!fs.existsSync(opinionsPath)) {
    throw new Error(`Opinions CSV not found: ${opinionsPath}`);
  }
  if (!fs.existsSync(summaryPath)) {
    throw new Error(`Summary JSON not found: ${summaryPath}`);
  }
  if (predictedExplicit && !fs.existsSync(predictedPath)) {
    throw new Error(`Predicted JSON not found: ${predictedPath}`);
  }
  if (configExplicit && !fs.existsSync(configPath)) {
    throw new Error(`Config JSON not found: ${configPath}`);
  }

  return {
    command: commandToken,
    inputDir,
    output,
    outputDir,
    opinionsPath,
    summaryPath,
    predictedPath,
    configPath,
    predictedExplicit,
    configExplicit,
  };
}

/**
 * Recursively deep merges source object into target object.
 * @param {Object} target
 * @param {Object} source
 * @returns {Object}
 */
function deepMerge(target, source) {
  const output = { ...target };
  for (const key of Object.keys(source || {})) {
    if (
      source[key] instanceof Object &&
      key in target &&
      target[key] instanceof Object &&
      !Array.isArray(source[key])
    ) {
      output[key] = deepMerge(target[key], source[key]);
    } else if (source[key] !== undefined) {
      output[key] = source[key];
    }
  }
  return output;
}

/**
 * Converts a string of markdown to clean HTML.
 * @param {string} text
 * @returns {string}
 */
function cleanMarkdown(text) {
  if (!text) return "";
  let html = text;
  html = html.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*(.*?)\*/g, "<em>$1</em>");
  return html;
}

/**
 * Strips markdown header symbols (e.g. '#', '##') and leading whitespace.
 * @param {string} text
 * @returns {string}
 */
function stripMarkdownHeader(text) {
  if (!text) return "";
  return text.replace(/^#+\s*/, "");
}

/**
 * Sums an array of numbers.
 * @param {number[]} arr
 * @returns {number}
 */
function sum(arr) {
  return arr.reduce((a, b) => a + b, 0);
}

/**
 * Groups an array of objects by a specific property key.
 * @param {Object[]} array
 * @param {string} column
 * @returns {[string, Object[]][]}
 */
function groupBy(array, column) {
  const map = new Map();
  array.forEach((item) => {
    const key = item[column];
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(item);
  });
  return Array.from(map);
}

/**
 * Generates a URL-safe slug from a string supporting all Unicode scripts.
 * @param {string} str
 * @param {boolean} [useFirstWords=false]
 * @returns {string}
 */
function generateId(str, useFirstWords = false) {
  if (!str) return "item";
  const words = str
    .split(" ")
    .slice(0, useFirstWords ? 5 : undefined)
    .join(" ");
  return (
    words
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^\p{L}\p{N}]+/gu, "") || "item"
  );
}

/**
 * Reads bridging score from AVERAGE_OF_2_BRIDGING or AVERAGE_OF_3_BRIDGING.
 * @param {RawOpinion} row
 * @returns {number}
 */
function bridgingScore(row) {
  const raw = row.AVERAGE_OF_2_BRIDGING ?? row.AVERAGE_OF_3_BRIDGING;
  return raw ? +raw : 0;
}

/**
 * Resolves optional user i18n file under the staged input directory.
 * @param {Object} config
 * @param {string} inputDir
 * @returns {string|null}
 */
function resolveUserI18nPath(config, inputDir) {
  if (config.translations) {
    const direct = path.join(inputDir, config.translations);
    if (fs.existsSync(direct)) return direct;
    const withJson = path.join(inputDir, `${config.translations}.json`);
    if (fs.existsSync(withJson)) return withJson;
  }
  const defaultPath = path.join(inputDir, "translations.json");
  if (fs.existsSync(defaultPath)) return defaultPath;
  return null;
}

/**
 * Processes staged report inputs into static/inline Mustache payloads.
 * @param {Object} params
 * @param {RawOpinion[]} params.opinionsRaw
 * @param {string} params.summaryPath
 * @param {string|null} params.configPath
 * @param {string|null} params.predictedPath
 * @param {string} params.inputDir - Staged work dir (for translations / relative paths)
 * @param {string} params.packageRoot
 * @param {string} params.workDir - Directory to write quotes + data JSON files
 * @returns {{ dataStatic: Object, dataInline: Object, quotes: Object[] }}
 */
export function processReportData({
  opinionsRaw,
  summaryPath,
  configPath,
  predictedPath,
  inputDir,
  packageRoot,
  workDir,
}) {
  const opinions = opinionsRaw.map((d, index) => ({
    ...d,
    index,
  }));

  const config = configPath
    ? JSON.parse(fs.readFileSync(configPath, "utf-8"))
    : {};

  const summary = JSON.parse(fs.readFileSync(summaryPath, "utf-8"));

  const predictedRaw = predictedPath
    ? JSON.parse(fs.readFileSync(predictedPath, "utf-8"))
    : [];

  const defaultI18n = JSON.parse(
    fs.readFileSync(
      path.join(packageRoot, "src", "default-translations.json"),
      "utf-8",
    ),
  );

  const userI18nPath = resolveUserI18nPath(config, inputDir);
  const userI18n = userI18nPath
    ? JSON.parse(fs.readFileSync(userI18nPath, "utf-8"))
    : {};

  const i18n = deepMerge(defaultI18n, userI18n);
  i18n.locale = i18n.locale || "en";
  i18n.direction = i18n.direction || "ltr";

  const numberFormatter = new Intl.NumberFormat(i18n.locale);
  const percentFormatter = new Intl.NumberFormat(i18n.locale, {
    style: "percent",
    maximumFractionDigits: 1,
  });

  /**
   * @param {number|string} value
   * @returns {string|null}
   */
  function formatPercent(value) {
    if (value == null || value === "") return null;
    const num = Number(value);
    if (isNaN(num)) return null;
    const ratio = num > 1 ? num / 100 : num;
    return percentFormatter.format(ratio);
  }

  /**
   * @param {number} num
   * @returns {string}
   */
  function formatNumber(num) {
    return numberFormatter.format(num);
  }

  const overviewChart = config.overview_chart || "toggle";
  const reportOptions = {
    logo: config.logo || "",
    overviewChart,
    hasToggle: overviewChart === "toggle",
    lowSampleThreshold: config.low_sample_warning_threshold || 30,
    sampleQuoteCount: Math.min(
      Math.max(config.number_of_sample_quotes || 4, 2),
      10,
    ),
    topOpinionCount: Math.min(
      Math.max(config.number_of_top_opinions || 10, 2),
      20,
    ),
    topicColors: config.chart_colors || [
      "#AFB42B",
      "#F4511E",
      "#3949AB",
      "#E52592",
      "#00897B",
      "#EFB22F",
      "#aaa",
    ],
    demographicColors: config.demographic_colors || [
      "#4886f7",
      "#4071d5",
      "#385db3",
      "#2f4a93",
      "#273874",
      "#1e2656",
    ],
  };

  /**
   * @param {RawOpinion[]} values
   * @returns {Object[]}
   */
  function sortAndExtractQuotes(values) {
    return values
      .map((v) => {
        const demos = Object.fromEntries(
          Object.entries(v)
            .filter(([k]) => k.startsWith(demographics_prefix))
            .map(([k, val]) => [k.slice(demographics_prefix.length), val]),
        );
        return {
          index: v.index,
          text: v.quote,
          participant_id: v.participant_id,
          avg_bridging: bridgingScore(v),
          ...demos,
        };
      })
      .sort((a, b) => b.avg_bridging - a.avg_bridging)
      .filter((v) => v.text);
  }

  /**
   * @param {RawOpinion[]} opinionsList
   * @returns {Object[]}
   */
  function groupOpinions(opinionsList) {
    const byTopic = groupBy(opinionsList, "topic");
    return byTopic.map(([topicText, topicOpinions]) => {
      const topicMatch = (summary.sub_contents || []).find(
        (t) => stripMarkdownHeader(t.title) === topicText,
      );
      const topicId = generateId(topicText, true);
      const byOpinion = groupBy(topicOpinions, "opinion").map(([_, values]) => ({
        opinionID: generateId(values[0].opinion),
        fullID: `${topicId}-${generateId(values[0].opinion)}`,
        text: values[0].opinion,
        count: values.length,
        quotes: sortAndExtractQuotes(values),
      }));

      byOpinion.sort((a, b) => {
        if (a.text === "Other") return 1;
        if (b.text === "Other") return -1;
        return b.count - a.count;
      });

      return {
        topicID: topicId,
        summary: cleanMarkdown(topicMatch?.text),
        text: topicText,
        count: topicOpinions.length,
        opinions: byOpinion,
      };
    });
  }

  /**
   * @param {Object[]} opinionsGrouped
   * @returns {Object[]}
   */
  function flattenQuotes(opinionsGrouped) {
    const flat = [];
    opinionsGrouped.forEach((topic) => {
      topic.opinions.forEach((opinion) => {
        opinion.quotes.forEach((quote) => {
          const { index, text, participant_id, avg_bridging, fullID, ...demos } =
            quote;
          flat.push({
            id: opinion.fullID,
            quote: quote.text,
            ...demos,
          });
        });
      });
    });
    return flat;
  }

  /**
   * @param {string} text
   * @returns {string[]}
   */
  function parseSummary(text) {
    return text.split("\n\n").map((p) => p.trim());
  }

  const globalSampleParticipants = new Set();

  /**
   * @param {Object[]} topicOpinions
   * @returns {Object[]}
   */
  function getSampleQuotes(topicOpinions) {
    const allQuotes = topicOpinions
      .map((o) => o.quotes.map((q) => ({ ...q, fullID: o.fullID })))
      .flat();
    allQuotes.sort((a, b) => b.avg_bridging - a.avg_bridging);

    const selected = [];
    for (let i = 0; i < reportOptions.sampleQuoteCount; i++) {
      for (const o of topicOpinions) {
        const possible = allQuotes.filter((q) => q.fullID === o.fullID);
        if (!possible.length) continue;
        let newQuote = possible.find(
          (q) =>
            !globalSampleParticipants.has(q.participant_id) &&
            !selected.find((s) => s.participant_id === q.participant_id),
        );
        if (!newQuote) {
          newQuote = possible.find(
            (q) => !selected.find((s) => s.participant_id === q.participant_id),
          );
        }
        if (!newQuote) {
          newQuote = possible.find(
            (q) => !selected.find((s) => s.index === q.index),
          );
        }
        if (newQuote) {
          selected.push({ ...newQuote });
          globalSampleParticipants.add(newQuote.participant_id);
        }
      }
    }
    return selected;
  }

  /**
   * @param {Object[]} topicOpinions
   * @returns {number}
   */
  function getUniqueQuoteCount(topicOpinions) {
    const uniqueParticipantIds = new Set();
    topicOpinions.forEach((o) => {
      o.quotes.forEach((q) => {
        uniqueParticipantIds.add(q.participant_id);
      });
    });
    return uniqueParticipantIds.size;
  }

  /**
   * @param {Object} raw
   * @returns {{text: string, topics: Object[]}}
   */
  function processPredicted(raw) {
    const data = Array.isArray(raw) ? raw[0] : raw;
    if (!data || !data.sub_contents) return { text: "", topics: [] };
    return {
      text: data.text,
      topics: data.sub_contents.map((s) => ({
        topicID: generateId(s.title || "", true),
        title: stripMarkdownHeader(s.title),
        text: s.text,
        statements: (s.statements || []).map((stmt) => ({
          text: stmt.text,
          predictedAgreement: formatPercent(stmt.predicted_agreement),
          hasPredictedAgreement: stmt.predicted_agreement != null,
        })),
      })),
    };
  }

  const byParticipant = groupBy(opinions, "participant_id");
  const totalParticipants = formatNumber(byParticipant.length);
  const totalParticipantsFormatted = formatNumber(byParticipant.length);
  const propositionsGenerated = 0;

  const opinionsGrouped = groupOpinions(opinions);
  const quotes = flattenQuotes(opinionsGrouped);
  const predicted = processPredicted(predictedRaw);

  const topicsIdentified = (summary.sub_contents || []).length;
  const topicsIdentifiedFormatted = formatNumber(topicsIdentified);
  const opinionsIdentified = opinionsGrouped
    .map((t) => t.opinions.length)
    .reduce((a, b) => a + b, 0);
  const opinionsIdentifiedFormatted = formatNumber(opinionsIdentified);

  const topics = opinionsGrouped.map((topic) => {
    const allSampleQuotes = getSampleQuotes(topic.opinions);
    return {
      topicID: topic.topicID,
      text: topic.text,
      topicCount: topic.count,
      topicCountFormatted: formatNumber(topic.count),
      opinionCount: topic.opinions.length,
      opinionCountFormatted: formatNumber(topic.opinions.length),
      rawQuoteCount: sum(topic.opinions.map((o) => o.count)),
      quoteCount: getUniqueQuoteCount(topic.opinions),
      quoteCountFormatted: formatNumber(getUniqueQuoteCount(topic.opinions)),
      summary: topic.summary,
      opinions: topic.opinions.map((o) => ({
        text: o.text,
        count: o.count,
        countFormatted: formatNumber(o.count),
        quotesCountFormatted: (
          i18n.sections?.quotesCount || "{count} Quotes"
        ).replace("{count}", formatNumber(o.count)),
        sampleQuotes: allSampleQuotes
          .filter((q) => q.fullID === o.fullID)
          .map((q) => q.text),
        viewAllQuotes: o.quotes.length > reportOptions.sampleQuoteCount,
        fullID: o.fullID,
      })),
    };
  });

  topics.sort((a, b) => b.quoteCount - a.quoteCount);

  const uniqueParticipants = byParticipant.map(([, rows]) => rows[0]);
  const demoKeys = Object.keys(uniqueParticipants[0] || {}).filter((k) =>
    k.startsWith(demographics_prefix),
  );

  const demographics = demoKeys.map((key) => {
    const label = key.slice(demographics_prefix.length);
    const counts = new Map();
    uniqueParticipants.forEach((p) => {
      const val = p[key];
      if (val !== undefined && val !== null && val !== "") {
        counts.set(val, (counts.get(val) || 0) + 1);
      }
    });
    let values = Array.from(counts, ([value, count]) => ({
      value,
      count,
    })).sort((a, b) => b.count - a.count);

    if (values.length > 6) {
      const otherCount = values.slice(5).reduce((acc, v) => acc + v.count, 0);
      const otherCategory = i18n.chart?.otherCategory || "Other";
      values = [
        ...values.slice(0, 5),
        { value: otherCategory, count: otherCount },
      ];
    }

    return { label, values };
  });

  demographics.sort((a, b) => a.label.localeCompare(b.label, i18n.locale));

  const executiveSummary = parseSummary(cleanMarkdown(summary.text || ""));
  const title = stripMarkdownHeader(summary.title);

  const conversationOverviewLead = (
    i18n.sections?.conversationLeadTemplate ||
    "Below is a high level overview of the topics discussed in the conversation. The most discussed topics were {topTopic1} and {topTopic2}."
  )
    .replace("{topTopic1}", topics[0]?.text || "")
    .replace("{topTopic2}", topics[1]?.text || "");

  const topicsIdentifiedBadge = (
    i18n.sections?.topicsIdentifiedBadge || "{count} topics identified"
  ).replace("{count}", topicsIdentifiedFormatted);

  const baseOutput = {
    ...reportOptions,
    title,
    executiveSummary,
    conversationOverviewLead,
    totalParticipants,
    totalParticipantsFormatted,
    topicsIdentified,
    topicsIdentifiedFormatted,
    topicsIdentifiedBadge,
    opinionsIdentified,
    opinionsIdentifiedFormatted,
    propositionsGenerated,
    topics,
    demographics,
    predicted,
    hasPredicted: predicted.topics.length > 0,
    i18n,
  };

  fs.writeFileSync(path.join(workDir, "quotes.json"), JSON.stringify(quotes));

  const dataStatic = { ...baseOutput };
  dataStatic.payload = JSON.stringify({
    topics,
    demographics,
    options: reportOptions,
    i18n,
  }).replace(/</g, "\\u003c");
  fs.writeFileSync(
    path.join(workDir, "data-static.json"),
    JSON.stringify(dataStatic),
  );

  const dataInline = { ...baseOutput };
  dataInline.payload = JSON.stringify({
    topics,
    demographics,
    options: reportOptions,
    quotes,
    i18n,
  }).replace(/</g, "\\u003c");
  fs.writeFileSync(
    path.join(workDir, "data-inline.json"),
    JSON.stringify(dataInline),
  );

  console.log("Data processing complete.");
  return { dataStatic, dataInline, quotes };
}
