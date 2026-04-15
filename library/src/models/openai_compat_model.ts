import { TSchema, type Static } from "@sinclair/typebox";
import { Model } from "./model";
import { checkDataSchema } from "../types";

type OpenAiCompatProvider = "openai" | "together" | "mistral";

type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type ResponseFormatMode = "json_schema" | "json_object" | "prompt_only";

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

export class OpenAiCompatModel extends Model {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly modelName: string;
  private readonly provider: OpenAiCompatProvider;

  constructor(options: OpenAiCompatModelOptions) {
    super();
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.apiKey = options.apiKey;
    this.modelName = options.modelName;
    this.provider = options.provider;
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
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          const response = await this.callChatCompletions(
            this.getMessagesForMode(prompt, jsonSchema, mode),
            this.getResponseFormatForMode(jsonSchema, mode)
          );
          const raw = this.extractText(response);
          const parsed = this.parseJsonFromResponse(raw);
          if (!checkDataSchema(schema, parsed)) {
            failures.push(
              `${mode} attempt ${attempt}: response JSON failed schema validation`
            );
            continue;
          }
          return parsed as Static<typeof schema>;
        } catch (error) {
          failures.push(
            `${mode} attempt ${attempt}: ${(error as Error).message}`
          );
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

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const data = (await response.json()) as OpenAiChatCompletionResponse;
    if (!response.ok) {
      const providerMessage =
        data?.error?.message ||
        `${response.status} ${response.statusText}` ||
        "Unknown provider error";
      throw new Error(
        `OpenAI-compatible API error (${this.provider}): ${providerMessage}`
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
      if (this.provider === "mistral") {
        return {
          type: "json_schema",
          json_schema: jsonSchema,
        };
      }
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
