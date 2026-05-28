#!/usr/bin/env node
import { runBuild } from "./build.js";

runBuild(process.argv, process.cwd())
  .then((result) => {
    console.log(`Standalone report generated: ${result.outputFile}`);
  })
  .catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
