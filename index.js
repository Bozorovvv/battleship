import { httpServer } from "./src/http_server/index.js";
import { HTTP_PORT, WS_PORT } from "./src/config/constans.js";
import { WSServer } from "./src/server.js";

const ws = new WSServer(WS_PORT);
ws.start();

httpServer.listen(HTTP_PORT, () => {
  console.log(`HTTP server running on port ${HTTP_PORT}`);
});
