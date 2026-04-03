import { Command } from "commander";
import { Model } from "../src/models/model";
import { VertexModel } from "../src/models/vertex_model";
import { OllamaModel } from "../src/models/ollama_model";

export type SensemakerBackend = "vertex" | "ollama";

export const DEFAULT_VERTEX_MODEL = "gemini-2.5-pro-preview-06-05";
export const DEFAULT_OLLAMA_MODEL = "gemma3:latest";
export const DEFAULT_OLLAMA_BASE_URL = "http://localhost:11434";
export const VERTEX_CATEGORIZATION_BATCH_SIZE = 100;

/** Raw commander opts after parse (before parseSensemakerModelOpts). */
export type SensemakerModelCliRawOpts = {
  backend?: string;
  baseUrl?: string;
  modelName?: string;
  vertexProject?: string;
  keyFilename?: string;
  categorizationBatchSize?: string;
};

export interface SensemakerModelCliParsed {
  backend: SensemakerBackend;
  vertexProject?: string;
  keyFilename?: string;
  modelName?: string;
  baseUrl: string;
  categorizationBatchSize?: number;
  categorizationBatchSizeCliProvided: boolean;
}

export function addSensemakerModelOptions(program: Command): Command {
  return program
    .option(
      "--backend <backend>",
      "LLM backend: vertex (default) or ollama.",
      "vertex"
    )
    .option(
      "--baseUrl <url>",
      `Base URL for the LLM HTTP API (Ollama server root). Default: ${DEFAULT_OLLAMA_BASE_URL}.`,
      DEFAULT_OLLAMA_BASE_URL
    )
    .option(
      "-m, --modelName <model>",
      `Model id for the selected backend (Vertex default: ${DEFAULT_VERTEX_MODEL}; Ollama default: ${DEFAULT_OLLAMA_MODEL}).`
    )
    .option(
      "-v, --vertexProject <project>",
      "Google Cloud project id (required when --backend is vertex)."
    )
    .option(
      "-k, --keyFilename <file>",
      "Path to the service account key file for Vertex authentication."
    )
    .option(
      "--categorizationBatchSize <n>",
      "Statements per categorization batch. Used for Ollama only; Vertex always uses batch size 100."
    );
}

function normalizeBackend(value: unknown): SensemakerBackend {
  const s = String(value ?? "vertex").toLowerCase().trim();
  if (s === "vertex") {
    return "vertex";
  }
  if (s === "ollama") {
    return "ollama";
  }
  throw new Error(`Invalid --backend "${value}". Use "vertex" or "ollama".`);
}

export function normalizeBaseUrl(url: string): string {
  return url.replace(/\/+$/, "");
}

export function parseSensemakerModelOpts(
  raw: SensemakerModelCliRawOpts,
  program: Command
): SensemakerModelCliParsed {
  const backend = normalizeBackend(raw.backend);
  let categorizationBatchSize: number | undefined;
  if (
    raw.categorizationBatchSize !== undefined &&
    raw.categorizationBatchSize !== ""
  ) {
    const n = parseInt(String(raw.categorizationBatchSize), 10);
    if (Number.isNaN(n) || n < 1) {
      throw new Error("--categorizationBatchSize must be a positive integer.");
    }
    categorizationBatchSize = n;
  }

  const categorizationBatchSizeCliProvided =
    program.getOptionValueSource("categorizationBatchSize") === "cli";

  const baseUrl = normalizeBaseUrl(
    (raw.baseUrl && String(raw.baseUrl).trim()) || DEFAULT_OLLAMA_BASE_URL
  );

  return {
    backend,
    vertexProject: raw.vertexProject?.trim() || undefined,
    keyFilename: raw.keyFilename,
    modelName: raw.modelName?.trim() || undefined,
    baseUrl,
    categorizationBatchSize,
    categorizationBatchSizeCliProvided,
  };
}

export function validateSensemakerModelOpts(opts: SensemakerModelCliParsed): void {
  if (opts.backend === "vertex") {
    if (!opts.vertexProject) {
      throw new Error(
        "--vertexProject is required when --backend is vertex. " +
          "For Ollama, use --backend ollama."
      );
    }
  }
  if (opts.backend === "ollama") {
    try {
      new URL(opts.baseUrl);
    } catch {
      throw new Error(
        `Invalid --baseUrl "${opts.baseUrl}". Expected a full URL (e.g. http://localhost:11434).`
      );
    }
  }
}

export function warnCategorizationBatchSizeForVertex(
  opts: SensemakerModelCliParsed
): void {
  if (
    opts.backend === "vertex" &&
    opts.categorizationBatchSizeCliProvided
  ) {
    console.warn(
      `[sensemaker] --categorizationBatchSize is ignored for Vertex; categorization uses fixed batch size ${VERTEX_CATEGORIZATION_BATCH_SIZE}.`
    );
  }
}

export function createModelFromCliOptions(opts: SensemakerModelCliParsed): Model {
  if (opts.backend === "vertex") {
    const modelName = opts.modelName ?? DEFAULT_VERTEX_MODEL;
    return new VertexModel(
      opts.vertexProject!,
      "global",
      modelName,
      opts.keyFilename
    );
  }
  const modelName = opts.modelName ?? DEFAULT_OLLAMA_MODEL;
  const batch =
    opts.categorizationBatchSize !== undefined
      ? opts.categorizationBatchSize
      : 5;
  return new OllamaModel(opts.baseUrl, modelName, batch);
}
