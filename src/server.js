import { WebSocketServer } from "ws";
import { WebSocketHandler } from "./handlers/WebSocketHandler.js";
import { httpServer } from "./http_server/index.js";
import { config } from "./config.js";

class Server {
  constructor(httpServer, port) {
    this.port = port;
    this.wss = new WebSocketServer({ server: httpServer });
    this.handler = new WebSocketHandler(this.wss);
  }

  start() {
    this.wss.on("connection", (ws) => this.handler.handleConnection(ws));

    httpServer.listen(this.port, () => {
      console.log(`WebSocket server started on port ${this.port}`);
    });
  }
}

const server = new Server(httpServer, config.HTTP_PORT);
server.start();

export { Server };
