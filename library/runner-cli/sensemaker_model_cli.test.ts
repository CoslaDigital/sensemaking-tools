import { Command } from "commander";
import { VertexModel } from "../src/models/vertex_model";
import { OllamaModel } from "../src/models/ollama_model";
import { OpenAiCompatModel } from "../src/models/openai_compat_model";
import {
  addSensemakerModelOptions,
  createModelFromCliOptions,
  DEFAULT_MISTRAL_BASE_URL,
  DEFAULT_OLLAMA_BASE_URL,
  DEFAULT_OPENAI_BASE_URL,
  DEFAULT_TOGETHER_BASE_URL,
  DEFAULT_VERTEX_LOCATION,
  normalizeBaseUrl,
  parseSensemakerModelOpts,
  resolveApiKey,
  validateSensemakerModelOpts,
  warnCategorizationBatchSizeForVertex,
} from "./sensemaker_model_cli";

function parseWithArgv(argv: string[]): {
  program: Command;
  raw: Record<string, unknown>;
} {
  const program = new Command();
  addSensemakerModelOptions(program);
  program.parse(argv, { from: "user" });
  return { program, raw: program.opts() as Record<string, unknown> };
}

describe("sensemaker_model_cli", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.OPENAI_API_KEY;
    delete process.env.TOGETHER_API_KEY;
    delete process.env.MISTRAL_API_KEY;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe("normalizeBaseUrl", () => {
    it("strips trailing slashes", () => {
      expect(normalizeBaseUrl("http://localhost:11434/")).toBe(
        "http://localhost:11434"
      );
      expect(normalizeBaseUrl("http://localhost:11434///")).toBe(
        "http://localhost:11434"
      );
    });
  });

  describe("parseSensemakerModelOpts + validateSensemakerModelOpts", () => {
    it("requires vertexProject when backend is vertex", () => {
      const { program, raw } = parseWithArgv(["--backend", "vertex"]);
      const parsed = parseSensemakerModelOpts(raw, program);
      expect(() => validateSensemakerModelOpts(parsed)).toThrow(
        /--vertexProject is required/
      );
    });

    it("accepts vertex with project", () => {
      const { program, raw } = parseWithArgv([
        "--backend",
        "vertex",
        "--vertexProject",
        "my-project",
      ]);
      const parsed = parseSensemakerModelOpts(raw, program);
      expect(() => validateSensemakerModelOpts(parsed)).not.toThrow();
      expect(parsed.backend).toBe("vertex");
      expect(parsed.vertexProject).toBe("my-project");
    });

    it("defaults vertexLocation to global", () => {
      const { program, raw } = parseWithArgv([
        "--backend",
        "vertex",
        "--vertexProject",
        "my-project",
      ]);
      const parsed = parseSensemakerModelOpts(raw, program);
      expect(parsed.vertexLocation).toBe(DEFAULT_VERTEX_LOCATION);
    });

    it("parses --vertexLocation override", () => {
      const { program, raw } = parseWithArgv([
        "--backend",
        "vertex",
        "--vertexProject",
        "my-project",
        "--vertexLocation",
        "us-central1",
      ]);
      const parsed = parseSensemakerModelOpts(raw, program);
      expect(parsed.vertexLocation).toBe("us-central1");
    });

    it("accepts ollama without vertexProject", () => {
      const { program, raw } = parseWithArgv(["--backend", "ollama"]);
      const parsed = parseSensemakerModelOpts(raw, program);
      expect(() => validateSensemakerModelOpts(parsed)).not.toThrow();
      expect(parsed.backend).toBe("ollama");
      expect(parsed.baseUrl).toBe(DEFAULT_OLLAMA_BASE_URL);
    });

    it("sets provider default base URL for openai-compatible backends", () => {
      const openAi = parseSensemakerModelOpts(
        parseWithArgv([
          "--backend",
          "openai-compatible",
          "--provider",
          "openai",
          "--modelName",
          "gpt-4o-mini",
          "--apiKey",
          "x",
        ]).raw,
        parseWithArgv([
          "--backend",
          "openai-compatible",
          "--provider",
          "openai",
          "--modelName",
          "gpt-4o-mini",
          "--apiKey",
          "x",
        ]).program
      );
      expect(openAi.baseUrl).toBe(DEFAULT_OPENAI_BASE_URL);

      const together = parseSensemakerModelOpts(
        parseWithArgv([
          "--backend",
          "openai-compatible",
          "--provider",
          "together",
          "--modelName",
          "openai/gpt-oss-20b",
          "--apiKey",
          "x",
        ]).raw,
        parseWithArgv([
          "--backend",
          "openai-compatible",
          "--provider",
          "together",
          "--modelName",
          "openai/gpt-oss-20b",
          "--apiKey",
          "x",
        ]).program
      );
      expect(together.baseUrl).toBe(DEFAULT_TOGETHER_BASE_URL);

      const mistral = parseSensemakerModelOpts(
        parseWithArgv([
          "--backend",
          "openai-compatible",
          "--provider",
          "mistral",
          "--modelName",
          "mistral-small-latest",
          "--apiKey",
          "x",
        ]).raw,
        parseWithArgv([
          "--backend",
          "openai-compatible",
          "--provider",
          "mistral",
          "--modelName",
          "mistral-small-latest",
          "--apiKey",
          "x",
        ]).program
      );
      expect(mistral.baseUrl).toBe(DEFAULT_MISTRAL_BASE_URL);
    });

    it("requires provider for openai-compatible backend", () => {
      const { program, raw } = parseWithArgv([
        "--backend",
        "openai-compatible",
        "--modelName",
        "gpt-4o-mini",
        "--apiKey",
        "x",
      ]);
      const parsed = parseSensemakerModelOpts(raw, program);
      expect(() => validateSensemakerModelOpts(parsed)).toThrow(
        /--provider is required/
      );
    });

    it("requires modelName for openai-compatible backend", () => {
      const { program, raw } = parseWithArgv([
        "--backend",
        "openai-compatible",
        "--provider",
        "openai",
        "--apiKey",
        "x",
      ]);
      const parsed = parseSensemakerModelOpts(raw, program);
      expect(() => validateSensemakerModelOpts(parsed)).toThrow(
        /--modelName is required/
      );
    });

    it("requires API key for openai-compatible backend", () => {
      const { program, raw } = parseWithArgv([
        "--backend",
        "openai-compatible",
        "--provider",
        "openai",
        "--modelName",
        "gpt-4o-mini",
      ]);
      const parsed = parseSensemakerModelOpts(raw, program);
      expect(() => validateSensemakerModelOpts(parsed)).toThrow(
        /API key is required/
      );
    });

    it("resolves API key from environment when CLI key is omitted", () => {
      process.env.OPENAI_API_KEY = "env-key";
      const { program, raw } = parseWithArgv([
        "--backend",
        "openai-compatible",
        "--provider",
        "openai",
        "--modelName",
        "gpt-4o-mini",
      ]);
      const parsed = parseSensemakerModelOpts(raw, program);
      expect(resolveApiKey(parsed)).toBe("env-key");
      expect(() => validateSensemakerModelOpts(parsed)).not.toThrow();
    });

    it("prefers --apiKey over environment key", () => {
      process.env.OPENAI_API_KEY = "env-key";
      const { program, raw } = parseWithArgv([
        "--backend",
        "openai-compatible",
        "--provider",
        "openai",
        "--modelName",
        "gpt-4o-mini",
        "--apiKey",
        "cli-key",
      ]);
      const parsed = parseSensemakerModelOpts(raw, program);
      expect(resolveApiKey(parsed)).toBe("cli-key");
    });

    it("rejects invalid backend", () => {
      const { program, raw } = parseWithArgv(["--backend", "something"]);
      expect(() => parseSensemakerModelOpts(raw, program)).toThrow(
        /Invalid --backend/
      );
    });

    it("parses categorizationBatchSize and detects CLI source", () => {
      const { program, raw } = parseWithArgv([
        "--backend",
        "ollama",
        "--categorizationBatchSize",
        "8",
      ]);
      const parsed = parseSensemakerModelOpts(raw, program);
      expect(parsed.categorizationBatchSize).toBe(8);
      expect(parsed.categorizationBatchSizeCliProvided).toBe(true);
    });

    it("rejects non-integer categorizationBatchSize", () => {
      const { program, raw } = parseWithArgv(["--categorizationBatchSize", "x"]);
      expect(() => parseSensemakerModelOpts(raw, program)).toThrow(
        /positive integer/
      );
    });
  });

  describe("createModelFromCliOptions", () => {
    it("returns VertexModel for vertex backend", () => {
      const { program, raw } = parseWithArgv([
        "--vertexProject",
        "proj-1",
        "--modelName",
        "gemini-test",
      ]);
      const parsed = parseSensemakerModelOpts(raw, program);
      validateSensemakerModelOpts(parsed);
      const model = createModelFromCliOptions(parsed);
      expect(model).toBeInstanceOf(VertexModel);
    });

    it("returns OllamaModel for ollama backend with batch default", () => {
      const { program, raw } = parseWithArgv(["--backend", "ollama"]);
      const parsed = parseSensemakerModelOpts(raw, program);
      validateSensemakerModelOpts(parsed);
      const model = createModelFromCliOptions(parsed);
      expect(model).toBeInstanceOf(OllamaModel);
      expect(model.categorizationBatchSize).toBe(5);
    });

    it("returns OpenAiCompatModel for openai-compatible backend", () => {
      const { program, raw } = parseWithArgv([
        "--backend",
        "openai-compatible",
        "--provider",
        "openai",
        "--modelName",
        "gpt-4o-mini",
        "--apiKey",
        "cli-key",
      ]);
      const parsed = parseSensemakerModelOpts(raw, program);
      validateSensemakerModelOpts(parsed);
      const model = createModelFromCliOptions(parsed);
      expect(model).toBeInstanceOf(OpenAiCompatModel);
    });
  });

  describe("warnCategorizationBatchSizeForVertex", () => {
    it("warns when vertex and batch flag was passed on CLI", () => {
      const warnSpy = jest.spyOn(console, "warn").mockImplementation();
      const { program, raw } = parseWithArgv([
        "--backend",
        "vertex",
        "--vertexProject",
        "p",
        "--categorizationBatchSize",
        "99",
      ]);
      const parsed = parseSensemakerModelOpts(raw, program);
      warnCategorizationBatchSizeForVertex(parsed);
      expect(warnSpy).toHaveBeenCalled();
      expect(String(warnSpy.mock.calls[0]?.[0])).toContain("ignored for Vertex");
      warnSpy.mockRestore();
    });
  });
});
