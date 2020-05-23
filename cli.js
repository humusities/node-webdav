#!/usr/bin/env node
import createWebdav from "./index.js";

function cli(command, ...args) {
  const actions = {
    [undefined]: () => createWebdav(".").then(console.log),
    create: () => createWebdav(args[0] || ".").then(console.log),
  };

  if (command in actions) actions[command]();
  else console.error("Error in command. Supported: ", Object.keys(actions));
}

console.log("\x1b[33m%s\x1b[0m", `Humusities/Webdav`);
cli(...process.argv.slice(2));
