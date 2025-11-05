const esbuild = require("esbuild");
const jsdom = require("jsdom");
const fs = require("fs");
const path = require("path");

const { JSDOM } = jsdom;

const argv = process.argv.slice(2);
function getArgValue(names) {
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    for (const name of names) {
      if (a === name && argv[i + 1]) return argv[i + 1];
      if (a.startsWith(name + "=")) return a.split("=", 2)[1];
    }
  }
  return undefined;
}

const outputFilePath = getArgValue(["-o", "--outputFile"]) || "dist/health-check.html";
const outputDir = path.dirname(outputFilePath);

fs.mkdirSync(outputDir, { recursive: true });

const dom = new JSDOM(`<!DOCTYPE html>
<html>
<head>
  <title>Web-UI Health Check</title>
</head>
<body>
  <h1>Hello World</h1>
  <p>Web-UI health check passed!</p>
</body>
</html>`);

const simpleScript = `
console.log('Health check: Web-UI dependencies are working!');
`;

esbuild
  .build({
    stdin: {
      contents: simpleScript,
      loader: "js",
    },
    bundle: true,
    minify: true,
    format: "iife",
    write: false,
  })
  .then(
    (result) => {
      const scriptSrc = result.outputFiles[0].text;
      const script = dom.window.document.createElement("script");
      script.innerHTML = scriptSrc;
      dom.window.document.body.appendChild(script);

      fs.writeFileSync(outputFilePath, dom.serialize());
      console.log(`Health check HTML file created at ${path.resolve(outputFilePath)}`);
      console.log("✓ Web-UI health check passed");
      process.exit(0);
    },
    (error) => {
      console.error("Health check failed:", error);
      process.exit(1);
    }
  );

