import { ENV } from "./env";
import { app } from "./app";
import { warmDatabase } from "./db";
import { createServer } from "http";

const server = createServer(app);

warmDatabase().then(() => {
  server.listen(ENV.port, () => {
    console.log(`[Smart Ports POS Server] Running on port ${ENV.port}`);
    console.log(`[Environment] ${ENV.nodeEnv}`);
    console.log(`[Database] Connected`);
  });
});

export { app };
export { server };
