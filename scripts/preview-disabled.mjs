import { spawn, spawnSync } from "node:child_process";

const env = { ...process.env, DISABLED_PAGES: process.env.DISABLED_PAGES || "shiryo" };
console.log(`Building frontend with DISABLED_PAGES=${env.DISABLED_PAGES}…`);

const build = spawnSync("npm", ["run", "build", "-w", "frontend"], { stdio: "inherit", env });
if (build.status !== 0) process.exit(build.status ?? 1);

const children = [
  spawn("npm", ["run", "dev", "-w", "backend"], { stdio: "inherit", env }),
  spawn("npm", ["run", "preview", "-w", "frontend", "--", "--host", "0.0.0.0", "--port", "5173"], { stdio: "inherit", env })
];

let stopping = false;
function stop(code) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill("SIGTERM");
  process.exitCode = code;
}
for (const child of children) {
  child.on("error", (error) => { console.error(error); stop(1); });
  child.on("exit", (code) => stop(code ?? 1));
}
process.on("SIGINT", () => stop(0));
process.on("SIGTERM", () => stop(0));
