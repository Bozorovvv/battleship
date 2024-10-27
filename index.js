import { HTTP_PORT, WS_PORT } from "./src/config/constans.js";
import { httpServer } from "./src/http_server/index.js";
import { Server } from "./src/server.js";

const server = new Server(httpServer, WS_PORT);
server.start();

httpServer.listen(HTTP_PORT, () => {
  console.log(`WebSocket server started on port ${HTTP_PORT}`);
});
