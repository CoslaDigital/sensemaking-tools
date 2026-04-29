import { Type } from "@sinclair/typebox";
import { OpenAiCompatModel } from "./openai_compat_model";

describe("OpenAiCompatModel", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it("generateText sends chat completion and extracts text", async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "Hello world" } }],
      }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const model = new OpenAiCompatModel({
      provider: "openai",
      baseUrl: "https://api.openai.com/v1",
      modelName: "gpt-4o-mini",
      apiKey: "k",
    });

    const text = await model.generateText("Say hi");
    expect(text).toBe("Hello world");
    expect(fetchMock).toHaveBeenCalled();
    expect(fetchMock.mock.calls[0][0]).toBe("https://api.openai.com/v1/chat/completions");
    expect((fetchMock.mock.calls[0][1] as { method: string }).method).toBe("POST");
  });

  it("generateData succeeds with json_schema mode when provider supports it", async () => {
    const schema = Type.Object({
      answer: Type.String(),
    });
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "{\"answer\":\"ok\"}" } }],
      }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const model = new OpenAiCompatModel({
      provider: "openai",
      baseUrl: "https://api.openai.com/v1",
      modelName: "gpt-4o-mini",
      apiKey: "k",
    });

    const data = await model.generateData("return json", schema);
    expect(data).toEqual({ answer: "ok" });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.response_format.type).toBe("json_schema");
  });

  it("generateData falls back from json_schema to json_object", async () => {
    const schema = Type.Object({
      answer: Type.String(),
    });
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: "Bad Request",
        json: async () => ({ error: { message: "json_schema unsupported" } }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: "Bad Request",
        json: async () => ({ error: { message: "json_schema unsupported" } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: "{\"answer\":\"fallback\"}" } }],
        }),
      });
    global.fetch = fetchMock as unknown as typeof fetch;

    const model = new OpenAiCompatModel({
      provider: "together",
      baseUrl: "https://api.together.xyz/v1",
      modelName: "openai/gpt-oss-20b",
      apiKey: "k",
    });

    const data = await model.generateData("return json", schema);
    expect(data).toEqual({ answer: "fallback" });
  }, 15000);

  it("generateData uses wrapped json_schema format for mistral", async () => {
    const schema = Type.Object({
      answer: Type.String(),
    });
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "{\"answer\":\"ok\"}" } }],
      }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const model = new OpenAiCompatModel({
      provider: "mistral",
      baseUrl: "https://api.mistral.ai/v1",
      modelName: "mistral-medium-2508",
      apiKey: "k",
    });

    const data = await model.generateData("return json", schema);
    expect(data).toEqual({ answer: "ok" });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.response_format.type).toBe("json_schema");
    expect(body.response_format.json_schema.name).toBe("sensemaker_response");
    expect(body.response_format.json_schema.schema).toBeDefined();
  });

  it("generateData wraps top-level array schema for openai json_schema mode", async () => {
    const schema = Type.Array(
      Type.Object({
        name: Type.String(),
      })
    );
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "{\"data\":[{\"name\":\"topic\"}]}" } }],
      }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const model = new OpenAiCompatModel({
      provider: "openai",
      baseUrl: "https://api.openai.com/v1",
      modelName: "gpt-4o-mini",
      apiKey: "k",
    });

    const data = await model.generateData("return json", schema);
    expect(data).toEqual([{ name: "topic" }]);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.response_format.type).toBe("json_schema");
    expect(body.response_format.json_schema.schema.type).toBe("object");
    expect(body.response_format.json_schema.schema.required).toContain("data");
    expect(body.response_format.json_schema.schema.properties.data.type).toBe("array");
  });

  it("generateData includes explicit JSON instruction in json_object mode", async () => {
    const schema = Type.Object({
      answer: Type.String(),
    });
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: "Bad Request",
        json: async () => ({ error: { message: "json_schema unsupported" } }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: "Bad Request",
        json: async () => ({ error: { message: "json_schema unsupported" } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: "{\"answer\":\"ok\"}" } }],
        }),
      });
    global.fetch = fetchMock as unknown as typeof fetch;

    const model = new OpenAiCompatModel({
      provider: "openai",
      baseUrl: "https://api.openai.com/v1",
      modelName: "gpt-4o-mini",
      apiKey: "k",
    });

    const data = await model.generateData("return json", schema);
    expect(data).toEqual({ answer: "ok" });
    const jsonObjectBody = JSON.parse(fetchMock.mock.calls[2][1].body);
    expect(jsonObjectBody.response_format.type).toBe("json_object");
    expect(jsonObjectBody.messages[0].content.toLowerCase()).toContain("json");
  }, 15000);
});
