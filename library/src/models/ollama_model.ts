import { Model } from "./model";
import { TSchema, type Static } from "@sinclair/typebox";

export class OllamaModel extends Model {
  private baseUrl: string;
  private modelName: string;
  public readonly categorizationBatchSize: number;

  constructor(
    baseUrl: string = "http://localhost:11434",
    modelName: string = "gemma3:latest",
    categorizationBatchSize: number = 5 // Default lowered from 100 to avoid context size issues
  ) {
    super();
    this.baseUrl = baseUrl;
    this.modelName = modelName;
    this.categorizationBatchSize = categorizationBatchSize;
  }

  async generateText(prompt: string): Promise<string> {
    const bodyString = JSON.stringify({
      model: this.modelName,
      prompt: prompt,
      stream: false,
      options: {
        num_ctx: 8192 // config for context size, see: https://github.com/ollama/ollama/blob/main/docs/faq.md
      }
    });

    const response = await fetch(`${this.baseUrl}/api/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: bodyString
    });

    if (!response.ok) {
      throw new Error(`Ollama API error: ${response.statusText}`);
    }

    const data = await response.json();
    return data.response;
  }

  async generateData(prompt: string, schema: TSchema): Promise<Static<typeof schema>> {
    const jsonSchema = this.convertTypeBoxToJsonSchema(schema);

    const bodyString = JSON.stringify({
      model: this.modelName,
      prompt: prompt,
      stream: false,
      format: jsonSchema
    });

    const response = await fetch(`${this.baseUrl}/api/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: bodyString
    });

    if (!response.ok) {
      throw new Error(`Ollama API error: ${response.statusText}`);
    }

    const data = await response.json();
    
    try {
      const parsed = JSON.parse(data.response);
      return parsed as Static<typeof schema>;
    } catch (error) {
      console.error('Response content:', data.response);
      throw new Error(`Failed to parse structured response: ${error}`);
    }
  }

  private convertTypeBoxToJsonSchema(schema: TSchema): any {
    const jsonSchema = { ...schema };
    
    // Remove TypeBox-specific properties that might confuse Ollama
    delete jsonSchema.$id;
    delete jsonSchema.$schema;
    
    return jsonSchema;
  }
}
