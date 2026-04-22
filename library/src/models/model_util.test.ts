describe("model_util parallelism env precedence", () => {
  const originalVertex = process.env.DEFAULT_VERTEX_PARALLELISM;
  const originalDefault = process.env.DEFAULT_PARALLELISM;

  afterEach(() => {
    if (originalVertex === undefined) {
      delete process.env.DEFAULT_VERTEX_PARALLELISM;
    } else {
      process.env.DEFAULT_VERTEX_PARALLELISM = originalVertex;
    }
    if (originalDefault === undefined) {
      delete process.env.DEFAULT_PARALLELISM;
    } else {
      process.env.DEFAULT_PARALLELISM = originalDefault;
    }
    jest.resetModules();
  });

  it("uses vertex override when set", () => {
    process.env.DEFAULT_VERTEX_PARALLELISM = "7";
    process.env.DEFAULT_PARALLELISM = "11";
    jest.isolateModules(() => {
      const util = require("./model_util");
      expect(util.DEFAULT_PARALLELISM).toBe(11);
      expect(util.DEFAULT_VERTEX_PARALLELISM).toBe(7);
    });
  });

  it("falls back to shared parallelism for vertex when override is absent", () => {
    delete process.env.DEFAULT_VERTEX_PARALLELISM;
    process.env.DEFAULT_PARALLELISM = "9";
    jest.isolateModules(() => {
      const util = require("./model_util");
      expect(util.DEFAULT_PARALLELISM).toBe(9);
      expect(util.DEFAULT_VERTEX_PARALLELISM).toBe(9);
    });
  });

  it("falls back to vertex default of 2 when no env vars are set", () => {
    delete process.env.DEFAULT_VERTEX_PARALLELISM;
    delete process.env.DEFAULT_PARALLELISM;
    jest.isolateModules(() => {
      const util = require("./model_util");
      expect(util.DEFAULT_PARALLELISM).toBeUndefined();
      expect(util.DEFAULT_VERTEX_PARALLELISM).toBe(2);
    });
  });
});
