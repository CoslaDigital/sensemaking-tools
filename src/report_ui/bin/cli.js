#!/usr/bin/env node
import { runBuild } from "../build.js";

runBuild(process.argv, process.cwd())
  .then((result) => {
    if (result.command === "config-schema") return;
    const out = result.output || result.outputDir;
    console.log(`Standalone report generated: ${out}`);
  })
  .catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
