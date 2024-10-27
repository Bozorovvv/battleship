import { WebSocketServer } from "ws";
import { WebSocketHandler } from "./handlers/WebSocketHandler.js";

export class Server {
  constructor(httpServer, port) {
    this.port = port;
    this.wss = new WebSocketServer({ server: httpServer });
    this.handler = new WebSocketHandler(this.wss);
  }

  start() {
    this.wss.on("connection", (ws) => this.handler.handleConnection(ws));
  }
}
