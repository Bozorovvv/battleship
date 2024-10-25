import { WebSocketServer } from "ws";
import { httpServer } from "./src/http_server/index.js";
import { WebSocketHandler } from "./utils/WebSocketHandler.js";

const WS_PORT = 8181;
const HTTP_PORT = 3000;
class Server {
  constructor(httpServer, port) {
    this.port = port;
    this.wss = new WebSocketServer({ server: httpServer });
    this.handler = new WebSocketHandler(this.wss);
  }

  start() {
    this.wss.on("connection", (ws) => this.handler.handleConnection(ws));
  }
}

const server = new Server(httpServer, WS_PORT);
server.start();

httpServer.listen(HTTP_PORT, () => {
  console.log(`WebSocket server started on port ${HTTP_PORT}`);
});
