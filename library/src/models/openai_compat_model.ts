import { TSchema, type Static } from "@sinclair/typebox";
import pLimit from "p-limit";
import { Model } from "./model";
import { checkDataSchema } from "../types";
import { retryCall } from "../sensemaker_utils";
import { DEFAULT_PARALLELISM, RETRY_DELAY_MS } from "./model_util";

type OpenAiCompatProvider = "openai" | "together" | "mistral";

type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type ResponseFormatMode = "json_schema" | "json_object" | "prompt_only";
type SchemaPreparation = {
  requestSchema: Record<string, unknown>;
  unwrapDataProperty: boolean;
};

interface OpenAiCompatModelOptions {
  baseUrl: string;
  apiKey: string;
  modelName: string;
  provider: OpenAiCompatProvider;
}

interface OpenAiChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string | Array<{ type?: string; text?: string }>;
    };
  }>;
  error?: {
    message?: string;
  };
}

function truncateForErrorLog(value: string, maxLen: number = 1200): string {
  if (value.length <= maxLen) {
    return value;
  }
  return `${value.slice(0, maxLen)}... [truncated ${value.length - maxLen} chars]`;
}

export class OpenAiCompatModel extends Model {
  private static readonly DEFAULT_OPENAI_COMPAT_PARALLELISM = 5;
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly modelName: string;
  private readonly provider: OpenAiCompatProvider;
  private readonly limit: pLimit.Limit;

  constructor(options: OpenAiCompatModelOptions) {
    super();
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.apiKey = options.apiKey;
    this.modelName = options.modelName;
    this.provider = options.provider;
    const parallelism =
      DEFAULT_PARALLELISM ?? OpenAiCompatModel.DEFAULT_OPENAI_COMPAT_PARALLELISM;
    this.limit = pLimit(parallelism);
    console.log(
      "Creating OpenAiCompatModel with ",
      parallelism,
      " parallel workers..."
    );
  }

  async generateText(prompt: string): Promise<string> {
    const response = await this.callChatCompletions([
      { role: "user", content: prompt },
    ]);
    return this.extractText(response);
  }

  async generateData(prompt: string, schema: TSchema): Promise<Static<typeof schema>> {
    const jsonSchema = this.convertTypeBoxToJsonSchema(schema);
    const modes: ResponseFormatMode[] = ["json_schema", "json_object", "prompt_only"];
    const failures: string[] = [];
    for (const mode of modes) {
      let modeAttempt = 0;
      try {
        const parsed = await retryCall(
          async (): Promise<unknown> => {
            modeAttempt += 1;
            const schemaPreparation = this.prepareSchemaForMode(jsonSchema, mode);
            const response = await this.callChatCompletions(
              this.getMessagesForMode(prompt, schemaPreparation.requestSchema, mode),
              this.getResponseFormatForMode(schemaPreparation.requestSchema, mode)
            );
            const raw = this.extractText(response);
            const parsedResponse = this.parseJsonFromResponse(raw);
            const unwrappedResponse = schemaPreparation.unwrapDataProperty
              ? this.unwrapDataProperty(parsedResponse)
              : parsedResponse;
            if (!checkDataSchema(schema, unwrappedResponse)) {
              throw new Error("response JSON failed schema validation");
            }
            return unwrappedResponse;
          },
          () => true,
          2,
          `Failed structured output generation in ${mode} mode.`,
          RETRY_DELAY_MS,
          [],
          []
        );
        return parsed as Static<typeof schema>;
      } catch (error) {
        // retryCall throws only after attempts are exhausted. Record all attempts for this mode.
        const message = (error as Error).message;
        for (let attempt = 1; attempt <= modeAttempt; attempt++) {
          failures.push(`${mode} attempt ${attempt}: ${message}`);
        }
      }
    }
    throw new Error(
      "Failed to generate structured data from openai-compatible model. " +
        `Attempts exhausted. Details: ${failures.join(" | ")}`
    );
  }

  private async callChatCompletions(
    messages: ChatMessage[],
    responseFormat?: Record<string, unknown>
  ): Promise<OpenAiChatCompletionResponse> {
    const body: Record<string, unknown> = {
      model: this.modelName,
      messages,
      stream: false,
      temperature: 0,
    };
    if (responseFormat) {
      body.response_format = responseFormat;
    }

    const response = await this.limit(async () =>
      fetch(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      })
    );

    let rawBody = "";
    let data: OpenAiChatCompletionResponse | undefined;
    if (typeof response.text === "function") {
      rawBody = await response.text();
      try {
        data = rawBody ? (JSON.parse(rawBody) as OpenAiChatCompletionResponse) : undefined;
      } catch {
        data = undefined;
      }
    } else if (typeof response.json === "function") {
      data = (await response.json()) as OpenAiChatCompletionResponse;
      rawBody = data ? JSON.stringify(data) : "";
    }

    if (!response.ok) {
      const providerMessage = data?.error?.message;
      const statusText = `${response.status} ${response.statusText}`.trim();
      const detail = rawBody ? truncateForErrorLog(rawBody) : "<empty response body>";
      const fullMessage = providerMessage
        ? `${statusText}: ${providerMessage}`
        : statusText || "Unknown provider error";
      const contextHint =
        response.status === 422
          ? " (unprocessable request; provider rejected payload/params)"
          : "";
      throw new Error(
        `OpenAI-compatible API error (${this.provider}): ${fullMessage}${contextHint}. Response body: ${detail}`
      );
    }
    if (!data) {
      throw new Error(
        `OpenAI-compatible API error (${this.provider}): 200 OK but response body was not valid JSON. Body: ${truncateForErrorLog(rawBody)}`
      );
    }
    return data;
  }

  private extractText(response: OpenAiChatCompletionResponse): string {
    const content = response.choices?.[0]?.message?.content;
    if (typeof content === "string") {
      return content;
    }
    if (Array.isArray(content)) {
      const merged = content
        .map((part) => part.text || "")
        .join("")
        .trim();
      if (merged.length) {
        return merged;
      }
    }
    throw new Error("OpenAI-compatible response did not include message content.");
  }

  private getResponseFormatForMode(
    jsonSchema: Record<string, unknown>,
    mode: ResponseFormatMode
  ): Record<string, unknown> | undefined {
    if (mode === "json_object") {
      return { type: "json_object" };
    }
    if (mode === "json_schema") {
      // Mistral expects json_schema to be wrapped with both name and schema.
      // Raw schema objects (without wrapper) are rejected with 422.
      return {
        type: "json_schema",
        json_schema: {
          name: "sensemaker_response",
          schema: jsonSchema,
        },
      };
    }
    return undefined;
  }

  private getMessagesForMode(
    prompt: string,
    jsonSchema: Record<string, unknown>,
    mode: ResponseFormatMode
  ): ChatMessage[] {
    if (mode === "json_object") {
      return [
        {
          role: "system",
          content:
            "Return only valid JSON. Do not include markdown code fences or extra commentary.",
        },
        { role: "user", content: prompt },
      ];
    }
    if (mode === "prompt_only") {
      return [
        {
          role: "system",
          content:
            "Return only valid JSON. Do not include markdown code fences or extra commentary.",
        },
        {
          role: "user",
          content:
            `${prompt}\n\n` +
            "Return an object that matches this JSON schema exactly:\n" +
            `${JSON.stringify(jsonSchema)}`,
        },
      ];
    }
    return [{ role: "user", content: prompt }];
  }

  private prepareSchemaForMode(
    jsonSchema: Record<string, unknown>,
    mode: ResponseFormatMode
  ): SchemaPreparation {
    if (mode !== "json_schema" || this.provider !== "openai") {
      return { requestSchema: jsonSchema, unwrapDataProperty: false };
    }
    if (jsonSchema.type === "array") {
      return {
        requestSchema: {
          type: "object",
          properties: {
            data: jsonSchema,
          },
          required: ["data"],
          additionalProperties: false,
        },
        unwrapDataProperty: true,
      };
    }
    return { requestSchema: jsonSchema, unwrapDataProperty: false };
  }

  private unwrapDataProperty(parsedResponse: unknown): unknown {
    if (typeof parsedResponse === "object" && parsedResponse !== null && "data" in parsedResponse) {
      return (parsedResponse as { data: unknown }).data;
    }
    return parsedResponse;
  }

  private parseJsonFromResponse(raw: string): unknown {
    const trimmed = raw.trim();
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const candidate = fenced?.[1]?.trim() || trimmed;
    try {
      return JSON.parse(candidate);
    } catch {
      const firstBrace = candidate.indexOf("{");
      const lastBrace = candidate.lastIndexOf("}");
      if (firstBrace >= 0 && lastBrace > firstBrace) {
        const maybeJson = candidate.slice(firstBrace, lastBrace + 1);
        return JSON.parse(maybeJson);
      }
      throw new Error(`Model returned non-JSON content: ${raw}`);
    }
  }

  private convertTypeBoxToJsonSchema(schema: TSchema): Record<string, unknown> {
    const jsonSchema = { ...schema } as Record<string, unknown>;
    delete jsonSchema.$id;
    delete jsonSchema.$schema;
    return jsonSchema;
  }
}
