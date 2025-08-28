// Comprehensive health check that verifies Google Cloud authentication, Vertex AI connectivity,
// and model functionality. Outputs test results and generated text to files.
//
// Sample Usage:
//  npx ts-node ./library/runner-cli/health_check_runner.ts \
//    --vertexProject "{CLOUD_PROJECT_ID}" \
//    --outputFile "health-check"

import { Command } from "commander";
import { writeFileSync } from "fs";
import { VertexModel } from "../src/models/vertex_model";

interface HealthCheckResult {
  testName: string;
  status: "PASS" | "FAIL" | "SKIP";
  message: string;
  details?: string;
  error?: Error;
  response?: string;
}

async function testModelAccess(
  projectId: string,
  modelName: string,
  keyFilename?: string
): Promise<HealthCheckResult> {
  try {
    const model = new VertexModel(projectId, "global", modelName, keyFilename);
    const testPrompt = "Please respond with exactly 'Health check successful' and nothing else.";
    const response = await model.generateText(testPrompt);

    if (response.trim() === "Health check successful") {
      return {
        testName: "Vertex AI Health Check",
        status: "PASS",
        message: `Successfully authenticated and connected to Vertex AI with model: ${modelName}`,
        details: `Authentication, project access, connectivity, and model functionality all verified`,
        response: response
      };
    } else {
      return {
        testName: "Vertex AI Health Check",
        status: "FAIL",
        message: `Connected to Vertex AI but model response was unexpected`,
        details: `Expected: 'Health check successful', Got: '${response.trim()}'`,
        response: response
      };
    }
  } catch (error) {
    return {
      testName: "Vertex AI Health Check",
      status: "FAIL",
      message: `Failed to authenticate or connect to Vertex AI`,
      details: "Check your credentials, project ID, model name, and ensure Vertex AI API is enabled",
      error: error as Error
    };
  }
}

async function main(): Promise<void> {
  const program = new Command();
  program
    .option("-v, --vertexProject <project>", "The Vertex Project name.")
    .option("-o, --outputFile <file>", "The output file basename for health check results.")
    .option("-k, --keyFilename <file>", "Path to the service account key file for authentication.")
    .option("-m, --modelName <model>", "The name of the model to test (defaults to gemini-2.5-pro-preview-06-05).");

  program.parse(process.argv);
  const options = program.opts();

  if (!options.vertexProject) {
    console.error("Error: --vertexProject is required");
    process.exit(1);
  }

  if (!options.outputFile) {
    console.error("Error: --outputFile is required");
    process.exit(1);
  }

  const modelName = options.modelName || "gemini-2.5-pro-preview-06-05";

  console.log("🔍 Starting health check for Vertex AI setup...");
  console.log(`Project: ${options.vertexProject}`);
  console.log(`Model: ${modelName}`);

  const modelResult = await testModelAccess(options.vertexProject, modelName, options.keyFilename);
  console.log(`${modelResult.status === "PASS" ? "✓" : "❌"} ${modelResult.message}`);

  if (modelResult.status === "PASS" && modelResult.response) {
    const testOutputContent = `Model Test Output
=================
Timestamp: ${new Date().toISOString()}
Project ID: ${options.vertexProject}
Model Name: ${modelName}
Test Prompt: "Please respond with exactly 'Health check successful' and nothing else."

Model Response:
${modelResult.response}

This output confirms that the model is accessible and can generate text responses.
`;

    try {
      writeFileSync(`${options.outputFile}`, testOutputContent);
      console.log(`Test output written to: ${options.outputFile}`);
    } catch (error) {
      console.error("Error writing test output:", error);
      console.log("⚠️  Health check failed. Please review the error above.");
      process.exit(1);
    }
  }

  if (modelResult.status === "PASS") {
    console.log("");
    console.log("🎉 Health check passed! Your Vertex AI setup is ready to use.");
    process.exit(0);
  } else {
    console.log(modelResult.error?.message);
    console.log(modelResult.details);
    console.log("");
    console.log("⚠️  Health check failed. Please review the error above.");
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Fatal error during health check:", error);
  process.exit(1);
});
