const esbuild = require("esbuild");
const jsdom = require("jsdom");
const fs = require("fs");
const path = require("path");

const { JSDOM } = jsdom;
const srcDir = "dist/web-ui/browser";
const defaultDestDir = "dist/bundled";

// Parse CLI args for output file path (supports -o value, --outputFile value, and --outputFile=value)
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

const outputFilePath = getArgValue(["-o", "--outputFile"]) || `${defaultDestDir}/report.html`;
const outputDir = path.dirname(outputFilePath);

fs.mkdirSync(outputDir, { recursive: true });

const indexFilePath = srcDir + "/index.csr.html"; // this is the root html file from the build
const htmlSource = fs.readFileSync(indexFilePath);
const dom = new JSDOM(htmlSource.toString());

let mainScript;
let scriptsToInject = [];

const isUrl = string => {
  try {
    return Boolean(new URL(string));
  } catch (e) {
    return false;
  }
};

const scriptTags = Array.from(dom.window.document.getElementsByTagName("script"));
scriptTags.forEach((e) => {
  let fileName = e.getAttribute("src");
  if(fileName && !isUrl(fileName)) {
    let scriptPath = srcDir + "/" + fileName;
    if(fileName.includes("main-")) {
      mainScript = scriptPath;
    } else {
      scriptsToInject.push(scriptPath);
    }
    e.remove();
  }
});

const linkTags = Array.from(dom.window.document.getElementsByTagName("link"));
linkTags.forEach((e) => {
  const rel = e.getAttribute("rel");
  const href = e.getAttribute("href");
  const media = e.getAttribute("media");
  if(rel === "stylesheet" && !isUrl(href) && media === "print") {
    e.remove();
    let styleFile = srcDir + "/" + href;
    // Add the stylesheet to dom as inline.
    const style = dom.window.document.createElement("style");
    style.innerHTML = fs.readFileSync(styleFile).toString();
    dom.window.document.body.appendChild(style);
  }
  // find and remove unused resources to prevent console errors
  if(rel === "modulepreload" || rel === "icon") {
    e.remove();
  }
});

// write JS to memory, then add to DOM, then write HTML file
esbuild
  .build({
    entryPoints: [mainScript],
    inject: scriptsToInject,
    bundle: true,
    minify: true,
    sourcemap: false,
    outfile: path.join(outputDir, "bundled.js"), // file won't be created, but property is still required when writing to memory
    format: "esm",
    write: false, // places JS in memory instead of writing to file
  })
  .then(
    (result) => {
      const scriptSrc = result.outputFiles[0].text;
      const script = dom.window.document.createElement("script");
      script.innerHTML = scriptSrc;
      dom.window.document.body.appendChild(script);

      // do not rename file to "index.html"; causes a break
      fs.writeFileSync(outputFilePath, dom.serialize());
      console.log(`Report HTML file created at ${path.resolve(outputFilePath)}`);
    },
    (error) => console.error(error),
  );
