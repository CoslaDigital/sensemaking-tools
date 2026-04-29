import { Command } from "commander";
import { Model } from "../src/models/model";
import { VertexModel } from "../src/models/vertex_model";
import { OllamaModel } from "../src/models/ollama_model";
import { OpenAiCompatModel } from "../src/models/openai_compat_model";

export type SensemakerAdapter = "vertex" | "ollama" | "openai-compatible";
export type OpenAiCompatProvider = "openai" | "openrouter" | "mistral";

export const DEFAULT_VERTEX_MODEL = "gemini-2.5-pro";
export const DEFAULT_VERTEX_LOCATION = "global";
export const DEFAULT_OLLAMA_MODEL = "gemma3:latest";
export const DEFAULT_OLLAMA_BASE_URL = "http://localhost:11434";
export const DEFAULT_OPENAI_BASE_URL = "https://api.openai.com/v1";
export const DEFAULT_OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
export const DEFAULT_MISTRAL_BASE_URL = "https://api.mistral.ai/v1";
export const VERTEX_CATEGORIZATION_BATCH_SIZE = 100;

const OPENAI_COMPATIBLE_DEFAULTS: Record<OpenAiCompatProvider, string> = {
  openai: DEFAULT_OPENAI_BASE_URL,
  openrouter: DEFAULT_OPENROUTER_BASE_URL,
  mistral: DEFAULT_MISTRAL_BASE_URL,
};

const OPENAI_COMPATIBLE_ENV_KEY: Record<OpenAiCompatProvider, string> = {
  openai: "OPENAI_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
  mistral: "MISTRAL_API_KEY",
};

/** Raw commander opts after parse (before parseSensemakerModelOpts). */
export type SensemakerModelCliRawOpts = {
  adapter?: string;
  provider?: string;
  baseUrl?: string;
  apiKey?: string;
  modelName?: string;
  vertexProject?: string;
  vertexLocation?: string;
  keyFilename?: string;
  categorizationBatchSize?: string;
};

export interface SensemakerModelCliParsed {
  adapter: SensemakerAdapter;
  provider?: OpenAiCompatProvider;
  vertexProject?: string;
  vertexLocation: string;
  keyFilename?: string;
  modelName?: string;
  baseUrl: string;
  apiKey?: string;
  categorizationBatchSize?: number;
  categorizationBatchSizeCliProvided: boolean;
}

export function addSensemakerModelOptions(program: Command): Command {
  return program
    .option(
      "--adapter <adapter>",
      "LLM adapter: vertex (default), ollama, or openai-compatible.",
      "vertex"
    )
    .option(
      "--provider <provider>",
      "Provider preset for --adapter openai-compatible: openai, openrouter, or mistral."
    )
    .option(
      "--baseUrl <url>",
      "Base URL for the LLM HTTP API. Defaults depend on adapter/provider."
    )
    .option(
      "--apiKey <token>",
      "API key for openai-compatible backends. If omitted, provider-specific env var is used."
    )
    .option(
      "-m, --modelName <model>",
      `Model id for the selected adapter (Vertex default: ${DEFAULT_VERTEX_MODEL}; Ollama default: ${DEFAULT_OLLAMA_MODEL}; required for openai-compatible).`
    )
    .option(
      "-v, --vertexProject <project>",
      "Google Cloud project id (required when --adapter is vertex)."
    )
    .option(
      "--vertexLocation <location>",
      `Vertex location/region to use for --adapter vertex. Default: ${DEFAULT_VERTEX_LOCATION}.`,
      DEFAULT_VERTEX_LOCATION
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

function normalizeAdapter(value: unknown): SensemakerAdapter {
  const s = String(value ?? "vertex").toLowerCase().trim();
  if (s === "vertex") {
    return "vertex";
  }
  if (s === "ollama") {
    return "ollama";
  }
  if (s === "openai-compatible") {
    return "openai-compatible";
  }
  throw new Error(
    `Invalid --adapter "${value}". Use "vertex", "ollama", or "openai-compatible".`
  );
}

function normalizeProvider(value: unknown): OpenAiCompatProvider | undefined {
  if (value === undefined || value === null || String(value).trim() === "") {
    return undefined;
  }
  const s = String(value).toLowerCase().trim();
  if (s === "openai" || s === "openrouter" || s === "mistral") {
    return s;
  }
  throw new Error(
    `Invalid --provider "${value}". Use "openai", "openrouter", or "mistral".`
  );
}

export function normalizeBaseUrl(url: string): string {
  return url.replace(/\/+$/, "");
}

export function parseSensemakerModelOpts(
  raw: SensemakerModelCliRawOpts,
  program: Command
): SensemakerModelCliParsed {
  const adapter = normalizeAdapter(raw.adapter);
  const provider = normalizeProvider(raw.provider);
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

  const baseUrl = getBaseUrl(adapter, provider, raw.baseUrl);

  return {
    adapter,
    provider,
    vertexProject: raw.vertexProject?.trim() || undefined,
    vertexLocation: raw.vertexLocation?.trim() || DEFAULT_VERTEX_LOCATION,
    keyFilename: raw.keyFilename,
    modelName: raw.modelName?.trim() || undefined,
    baseUrl,
    apiKey: raw.apiKey?.trim() || undefined,
    categorizationBatchSize,
    categorizationBatchSizeCliProvided,
  };
}

function getBaseUrl(
  adapter: SensemakerAdapter,
  provider: OpenAiCompatProvider | undefined,
  explicit?: string
): string {
  if (explicit && String(explicit).trim().length > 0) {
    return normalizeBaseUrl(String(explicit).trim());
  }
  if (adapter === "ollama") {
    return DEFAULT_OLLAMA_BASE_URL;
  }
  if (adapter === "openai-compatible" && provider) {
    return OPENAI_COMPATIBLE_DEFAULTS[provider];
  }
  return DEFAULT_OLLAMA_BASE_URL;
}

export function resolveApiKey(opts: SensemakerModelCliParsed): string | undefined {
  if (opts.apiKey) {
    return opts.apiKey;
  }
  if (opts.adapter !== "openai-compatible" || !opts.provider) {
    return undefined;
  }
  return process.env[OPENAI_COMPATIBLE_ENV_KEY[opts.provider]];
}

export function validateSensemakerModelOpts(opts: SensemakerModelCliParsed): void {
  if (opts.adapter === "vertex") {
    if (!opts.vertexProject) {
      throw new Error(
        "--vertexProject is required when --adapter is vertex. " +
          "For Ollama, use --adapter ollama."
      );
    }
  }
  if (opts.adapter === "ollama" || opts.adapter === "openai-compatible") {
    try {
      new URL(opts.baseUrl);
    } catch {
      throw new Error(
        `Invalid --baseUrl "${opts.baseUrl}". Expected a full URL (e.g. http://localhost:11434).`
      );
    }
  }
  if (opts.adapter === "openai-compatible") {
    if (!opts.provider) {
      throw new Error(
        '--provider is required when --adapter is openai-compatible. Use "openai", "openrouter", or "mistral".'
      );
    }
    if (!opts.modelName) {
      throw new Error(
        "--modelName is required when --adapter is openai-compatible."
      );
    }
    if (!resolveApiKey(opts)) {
      const envVar = OPENAI_COMPATIBLE_ENV_KEY[opts.provider];
      throw new Error(
        `API key is required for provider "${opts.provider}". Pass --apiKey or set ${envVar}.`
      );
    }
  }
}

export function warnCategorizationBatchSizeForVertex(
  opts: SensemakerModelCliParsed
): void {
  if (
    opts.adapter === "vertex" &&
    opts.categorizationBatchSizeCliProvided
  ) {
    console.warn(
      `[sensemaker] --categorizationBatchSize is ignored for Vertex; categorization uses fixed batch size ${VERTEX_CATEGORIZATION_BATCH_SIZE}.`
    );
  }
}

export function createModelFromCliOptions(opts: SensemakerModelCliParsed): Model {
  if (opts.adapter === "vertex") {
    const modelName = opts.modelName ?? DEFAULT_VERTEX_MODEL;
    return new VertexModel(
      opts.vertexProject!,
      opts.vertexLocation,
      modelName,
      opts.keyFilename
    );
  }
  const modelName = opts.modelName ?? DEFAULT_OLLAMA_MODEL;
  const batch =
    opts.categorizationBatchSize !== undefined
      ? opts.categorizationBatchSize
      : 5;
  if (opts.adapter === "ollama") {
    return new OllamaModel(opts.baseUrl, modelName, batch);
  }
  return new OpenAiCompatModel({
    baseUrl: opts.baseUrl,
    apiKey: resolveApiKey(opts)!,
    modelName: opts.modelName!,
    provider: opts.provider!,
  });
}
