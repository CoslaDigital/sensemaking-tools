// Copyright 2024 Google LLC
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import { Type } from "@sinclair/typebox";
import { VertexModel } from "./vertex_model";
import { MAX_LLM_RETRIES } from "./model_util";

// mock retry timeout
jest.mock("./model_util", () => {
  const originalModule = jest.requireActual("./model_util");
  return {
    __esModule: true,
    ...originalModule,
    RETRY_DELAY_MS: 0,
  };
});

jest.mock("@google/genai", () => {
  const generateContentStreamMock = jest.fn();
  return {
    GoogleGenAI: jest.fn(() => ({
      models: {
        generateContentStream: generateContentStreamMock,
      },
    })),
    generateContentStreamMock,
    HarmBlockThreshold: {
      BLOCK_NONE: "BLOCK_NONE",
    },
    HarmCategory: {
      HARM_CATEGORY_HATE_SPEECH: "HARM_CATEGORY_HATE_SPEECH",
      HARM_CATEGORY_DANGEROUS_CONTENT: "HARM_CATEGORY_DANGEROUS_CONTENT",
      HARM_CATEGORY_SEXUALLY_EXPLICIT: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
      HARM_CATEGORY_HARASSMENT: "HARM_CATEGORY_HARASSMENT",
      HARM_CATEGORY_UNSPECIFIED: "HARM_CATEGORY_UNSPECIFIED",
    },
  };
});

async function* streamWithText(text: string) {
  yield {
    text,
    usageMetadata: {
      promptTokenCount: 10,
      candidatesTokenCount: 5,
    },
  };
}

function mockSingleModelResponse(generateContentStreamMock: jest.Mock, responseMock: string) {
  generateContentStreamMock.mockImplementationOnce(() => Promise.resolve(streamWithText(responseMock)));
}

describe("VertexAI test", () => {
  const model = new VertexModel("my-project", "us-central1", "models/gemini-pro");
  const { generateContentStreamMock } = jest.requireMock("@google/genai");

  beforeEach(() => {
    generateContentStreamMock.mockClear();
  });

  describe("generateContent", () => {
    it("should retry on rate limit error and return valid JSON", async () => {
      const expectedJSON = [{ result: "success" }];

      generateContentStreamMock.mockImplementationOnce(() => {
        throw new Error("429 Too Many Requests");
      });

      mockSingleModelResponse(generateContentStreamMock, JSON.stringify(expectedJSON));

      const result = JSON.parse(await model.callLLM("Some instructions"));

      expect(generateContentStreamMock).toHaveBeenCalledTimes(2);

      expect(result).toEqual(expectedJSON);
    }, 15000);

    it("should generate valid text", async () => {
      const expectedText = "This is some text.";
      mockSingleModelResponse(generateContentStreamMock, expectedText);

      const result = await model.generateText("Some instructions");

      expect(generateContentStreamMock).toHaveBeenCalledTimes(1);

      expect(result).toEqual(expectedText);
    });

    it("should generate valid structured data that matches the schema", async () => {
      const expectedStructuredData = { key1: "value1", key2: 2 };
      const schema = Type.Object({
        key1: Type.String(),
        key2: Type.Number(),
      });

      mockSingleModelResponse(generateContentStreamMock, JSON.stringify(expectedStructuredData));

      const result = await model.generateData("Some instructions", schema);

      expect(generateContentStreamMock).toHaveBeenCalledTimes(1);

      expect(result).toEqual(expectedStructuredData);
    });

    it("should throw an error when generated data does not match the schema", async () => {
      const expectedStructuredData = { key1: 1, key2: "value2" };
      const schema = Type.Object({
        key1: Type.String(),
        key2: Type.Number(),
      });

      mockSingleModelResponse(generateContentStreamMock, JSON.stringify(expectedStructuredData));
      await expect(async () => {
        await model.generateData("Some instructions", schema);
      }).rejects.toThrow(
        `Failed after ${MAX_LLM_RETRIES} attempts: Failed to get a valid model response.`
      );
    });
  });
});
