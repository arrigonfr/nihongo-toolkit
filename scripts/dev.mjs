import { spawn } from "node:child_process";

const children = [
  spawn("npm", ["run", "dev", "-w", "backend"], { stdio: "inherit" }),
  spawn("npm", ["run", "dev", "-w", "frontend", "--", "--host", "0.0.0.0", "--port", "5173"], { stdio: "inherit" })
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
