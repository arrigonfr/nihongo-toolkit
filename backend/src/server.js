import { createServer } from "node:http";
import { createHandler } from "./app.js";

const port = Number(process.env.PORT ?? 3000);
const server = createServer(createHandler());
server.listen(port, "127.0.0.1", () => console.log(`Nihon backend: http://localhost:${port}`));
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => server.close());
