// Comprehensive health check that verifies backend connectivity and model functionality.
// Supports Vertex, Ollama, and OpenAI-compatible providers.
//
// Sample Usage (Vertex):
//  npx ts-node ./library/runner-cli/health_check_runner.ts \
//    --vertexProject "{CLOUD_PROJECT_ID}" \
//    --outputFile "health-check"
//
// Sample Usage (Ollama):
//  npx ts-node ./library/runner-cli/health_check_runner.ts \
//    --backend ollama \
//    --outputFile "health-check"
//
// Sample Usage (OpenAI-compatible):
//  npx ts-node ./library/runner-cli/health_check_runner.ts \
//    --backend openai-compatible \
//    --provider openai \
//    --modelName gpt-4o-mini \
//    --outputFile "health-check"

import { Command } from "commander";
import { writeFileSync } from "fs";
import { VertexModel } from "../src/models/vertex_model";
import { OllamaModel } from "../src/models/ollama_model";
import { OpenAiCompatModel } from "../src/models/openai_compat_model";
import {
  addSensemakerModelOptions,
  DEFAULT_OLLAMA_MODEL,
  DEFAULT_VERTEX_MODEL,
  normalizeBaseUrl,
  parseSensemakerModelOpts,
  resolveApiKey,
  validateSensemakerModelOpts,
} from "./sensemaker_model_cli";

interface HealthCheckResult {
  testName: string;
  status: "PASS" | "FAIL" | "SKIP";
  message: string;
  details?: string;
  error?: Error;
  response?: string;
}

async function testVertexModelAccess(
  projectId: string,
  location: string,
  modelName: string,
  keyFilename?: string
): Promise<HealthCheckResult> {
  try {
    const model = new VertexModel(projectId, location, modelName, keyFilename);
    const testPrompt = "Please respond with exactly 'Health check successful' and nothing else.";
    const response = await model.generateText(testPrompt);
    if (response.trim() === "Health check successful") {
      return {
        testName: "Vertex AI Health Check",
        status: "PASS",
        message: `Successfully authenticated and connected to Vertex AI with model: ${modelName}`,
        details: "Authentication, project access, connectivity, and model functionality all verified",
        response,
      };
    }
    return {
      testName: "Vertex AI Health Check",
      status: "FAIL",
      message: "Connected to Vertex AI but model response was unexpected",
      details: `Expected: 'Health check successful', Got: '${response.trim()}'`,
      response,
    };
  } catch (error) {
    return {
      testName: "Vertex AI Health Check",
      status: "FAIL",
      message: "Failed to authenticate or connect to Vertex AI",
      details:
        "Check your credentials, project ID, model name, and ensure Vertex AI API is enabled",
      error: error as Error,
    };
  }
}

interface OllamaTagsResponse {
  models?: { name: string }[];
}

async function testOllamaAccess(
  baseUrl: string,
  modelName: string
): Promise<HealthCheckResult> {
  const root = normalizeBaseUrl(baseUrl);
  const tagsUrl = `${root}/api/tags`;
  try {
    const tagsRes = await fetch(tagsUrl, { method: "GET" });
    if (!tagsRes.ok) {
      return {
        testName: "Ollama API Health Check",
        status: "FAIL",
        message: `Could not reach Ollama at ${tagsUrl}`,
        details: `HTTP ${tagsRes.status} ${tagsRes.statusText}. Is Ollama running?`,
      };
    }
    const data = (await tagsRes.json()) as OllamaTagsResponse;
    const names = (data.models ?? []).map((m) => m.name);
    if (names.length === 0) {
      return {
        testName: "Ollama API Health Check",
        status: "FAIL",
        message: "Ollama responded but no models are installed",
        details: `GET ${tagsUrl} returned an empty model list. Run \`ollama pull ${modelName}\`.`,
      };
    }
    const hasModel = names.some((n) => n === modelName || n.startsWith(modelName + ":"));
    if (!hasModel) {
      return {
        testName: "Ollama API Health Check",
        status: "FAIL",
        message: `Model "${modelName}" not found on Ollama server`,
        details: `Available models: ${names.join(", ")}`,
      };
    }

    const model = new OllamaModel(root, modelName);
    const testPrompt = "Please respond with exactly 'Health check successful' and nothing else.";
    const response = await model.generateText(testPrompt);
    if (response.trim() === "Health check successful") {
      return {
        testName: "Ollama API Health Check",
        status: "PASS",
        message: `Ollama is reachable and model "${modelName}" responds correctly`,
        details: "Tags endpoint OK; generate probe OK",
        response,
      };
    }
    return {
      testName: "Ollama API Health Check",
      status: "FAIL",
      message: "Ollama model responded but text did not match expected probe",
      details: `Expected: 'Health check successful', Got: '${response.trim()}'`,
      response,
    };
  } catch (error) {
    return {
      testName: "Ollama API Health Check",
      status: "FAIL",
      message: `Failed to connect to Ollama at ${root}`,
      details:
        "Check that Ollama is running and --baseUrl points to the server (e.g. http://localhost:11434)",
      error: error as Error,
    };
  }
}

async function testOpenAiCompatAccess(
  provider: "openai" | "together" | "mistral",
  baseUrl: string,
  modelName: string,
  apiKey: string
): Promise<HealthCheckResult> {
  try {
    const model = new OpenAiCompatModel({
      provider,
      baseUrl,
      modelName,
      apiKey,
    });
    const testPrompt = "Please respond with exactly 'Health check successful' and nothing else.";
    const response = await model.generateText(testPrompt);
    if (response.trim() === "Health check successful") {
      return {
        testName: "OpenAI-Compatible Health Check",
        status: "PASS",
        message: `Connected to ${provider} with model: ${modelName}`,
        details: "Chat completions call returned expected probe response.",
        response,
      };
    }
    return {
      testName: "OpenAI-Compatible Health Check",
      status: "FAIL",
      message: "Connected but model response was unexpected",
      details: `Expected: 'Health check successful', Got: '${response.trim()}'`,
      response,
    };
  } catch (error) {
    return {
      testName: "OpenAI-Compatible Health Check",
      status: "FAIL",
      message: `Failed to connect to ${provider} chat completions API`,
      details: "Check API key, base URL, model id, and provider account permissions.",
      error: error as Error,
    };
  }
}

function writeReportOrExit(path: string, report: string): void {
  try {
    writeFileSync(path, report);
    console.log(`Test output written to: ${path}`);
  } catch (error) {
    console.error("Error writing test output:", error);
    process.exit(1);
  }
}

async function main(): Promise<void> {
  const program = new Command();
  addSensemakerModelOptions(program);
  program.option(
    "-o, --outputFile <file>",
    "The output file basename for health check results."
  );
  program.parse(process.argv);
  const options = program.opts();

  if (!options.outputFile) {
    console.error("Error: --outputFile is required");
    process.exit(1);
  }

  const modelOpts = parseSensemakerModelOpts(options, program);
  validateSensemakerModelOpts(modelOpts);

  const modelName =
    modelOpts.modelName ??
    (modelOpts.backend === "ollama" ? DEFAULT_OLLAMA_MODEL : DEFAULT_VERTEX_MODEL);

  if (modelOpts.backend === "vertex") {
    console.log("Starting health check for Vertex AI...");
    console.log(`Project: ${modelOpts.vertexProject}`);
    console.log(`Location: ${modelOpts.vertexLocation}`);
    console.log(`Model: ${modelName}`);

    const modelResult = await testVertexModelAccess(
      modelOpts.vertexProject!,
      modelOpts.vertexLocation,
      modelName,
      modelOpts.keyFilename
    );
    console.log(`${modelResult.status === "PASS" ? "OK" : "FAIL"} ${modelResult.message}`);

    if (modelResult.status === "PASS" && modelResult.response) {
      const report = `Model Test Output (Vertex)
=================
Timestamp: ${new Date().toISOString()}
Project ID: ${modelOpts.vertexProject}
Location: ${modelOpts.vertexLocation}
Model Name: ${modelName}
Test Prompt: "Please respond with exactly 'Health check successful' and nothing else."

Model Response:
${modelResult.response}

This output confirms that the model is accessible and can generate text responses.
`;
      writeReportOrExit(`${options.outputFile}`, report);
    }

    if (modelResult.status === "PASS") {
      console.log("Health check passed. Vertex AI setup is ready to use.");
      process.exit(0);
    }
    console.log(modelResult.error?.message);
    console.log(modelResult.details);
    console.log("Health check failed. Please review the error above.");
    process.exit(1);
  }

  if (modelOpts.backend === "ollama") {
    console.log("Starting health check for Ollama...");
    console.log(`Base URL: ${modelOpts.baseUrl}`);
    console.log(`Model: ${modelName}`);

    const ollamaResult = await testOllamaAccess(modelOpts.baseUrl, modelName);
    console.log(`${ollamaResult.status === "PASS" ? "OK" : "FAIL"} ${ollamaResult.message}`);

    const report = `Model Test Output (Ollama)
=================
Timestamp: ${new Date().toISOString()}
Base URL: ${modelOpts.baseUrl}
Model Name: ${modelName}
Status: ${ollamaResult.status}
Message: ${ollamaResult.message}
${ollamaResult.details ? `Details: ${ollamaResult.details}\n` : ""}${
      ollamaResult.response ? `\nGenerate probe response:\n${ollamaResult.response}\n` : ""
    }${ollamaResult.error ? `\nError: ${ollamaResult.error.message}\n` : ""}
`;
    writeReportOrExit(`${options.outputFile}`, report);

    if (ollamaResult.status === "PASS") {
      console.log("Health check passed. Ollama setup is ready to use.");
      process.exit(0);
    }
    console.log(ollamaResult.error?.message);
    console.log(ollamaResult.details);
    console.log("Health check failed. Please review the error above.");
    process.exit(1);
  }

  console.log(`Starting health check for ${modelOpts.provider} (openai-compatible)...`);
  console.log(`Base URL: ${modelOpts.baseUrl}`);
  console.log(`Model: ${modelName}`);

  const openAiCompatResult = await testOpenAiCompatAccess(
    modelOpts.provider!,
    modelOpts.baseUrl,
    modelName,
    resolveApiKey(modelOpts)!
  );
  console.log(
    `${openAiCompatResult.status === "PASS" ? "OK" : "FAIL"} ${openAiCompatResult.message}`
  );

  const report = `Model Test Output (OpenAI-Compatible)
=================
Timestamp: ${new Date().toISOString()}
Provider: ${modelOpts.provider}
Base URL: ${modelOpts.baseUrl}
Model Name: ${modelName}
Status: ${openAiCompatResult.status}
Message: ${openAiCompatResult.message}
${openAiCompatResult.details ? `Details: ${openAiCompatResult.details}\n` : ""}${
    openAiCompatResult.response
      ? `\nGenerate probe response:\n${openAiCompatResult.response}\n`
      : ""
  }${openAiCompatResult.error ? `\nError: ${openAiCompatResult.error.message}\n` : ""}
`;
  writeReportOrExit(`${options.outputFile}`, report);

  if (openAiCompatResult.status === "PASS") {
    console.log("Health check passed. OpenAI-compatible setup is ready to use.");
    process.exit(0);
  }
  console.log(openAiCompatResult.error?.message);
  console.log(openAiCompatResult.details);
  console.log("Health check failed. Please review the error above.");
  process.exit(1);
}

main().catch((error) => {
  console.error("Fatal error during health check:", error);
  process.exit(1);
});
