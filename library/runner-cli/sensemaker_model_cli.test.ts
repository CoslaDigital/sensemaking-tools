// Copyright 2024 Google LLC
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.

import { Command } from "commander";
import { VertexModel } from "../src/models/vertex_model";
import { OllamaModel } from "../src/models/ollama_model";
import {
  addSensemakerModelOptions,
  createModelFromCliOptions,
  DEFAULT_OLLAMA_BASE_URL,
  normalizeBaseUrl,
  parseSensemakerModelOpts,
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

    it("accepts ollama without vertexProject", () => {
      const { program, raw } = parseWithArgv(["--backend", "ollama"]);
      const parsed = parseSensemakerModelOpts(raw, program);
      expect(() => validateSensemakerModelOpts(parsed)).not.toThrow();
      expect(parsed.backend).toBe("ollama");
      expect(parsed.baseUrl).toBe(DEFAULT_OLLAMA_BASE_URL);
    });

    it("rejects invalid backend", () => {
      const { program, raw } = parseWithArgv(["--backend", "openai"]);
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
      const { program, raw } = parseWithArgv([
        "--categorizationBatchSize",
        "x",
      ]);
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

    it("uses explicit categorization batch for ollama", () => {
      const { program, raw } = parseWithArgv([
        "--backend",
        "ollama",
        "--categorizationBatchSize",
        "12",
      ]);
      const parsed = parseSensemakerModelOpts(raw, program);
      validateSensemakerModelOpts(parsed);
      const model = createModelFromCliOptions(parsed);
      expect(model).toBeInstanceOf(OllamaModel);
      expect(model.categorizationBatchSize).toBe(12);
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

    it("does not warn for ollama when batch is set", () => {
      const warnSpy = jest.spyOn(console, "warn").mockImplementation();
      const { program, raw } = parseWithArgv([
        "--backend",
        "ollama",
        "--categorizationBatchSize",
        "3",
      ]);
      const parsed = parseSensemakerModelOpts(raw, program);
      warnCategorizationBatchSizeForVertex(parsed);
      expect(warnSpy).not.toHaveBeenCalled();
      warnSpy.mockRestore();
    });
  });

  describe("defaults", () => {
    it("defaults backend to vertex", () => {
      const { program, raw } = parseWithArgv(["--vertexProject", "p"]);
      const parsed = parseSensemakerModelOpts(raw, program);
      expect(parsed.backend).toBe("vertex");
    });
  });
});
