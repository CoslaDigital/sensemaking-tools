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
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.openai.com/v1/chat/completions",
      expect.objectContaining({
        method: "POST",
      })
    );
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
  });
});
