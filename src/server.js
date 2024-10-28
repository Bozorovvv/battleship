import { WebSocketServer } from "ws";
import { WebSocketHandler } from "./handlers/WebSocketHandler.js";

export class WSServer {
  constructor(port) {
    this.port = port;
    this.wss = new WebSocketServer({ port: this.port });
    this.handler = new WebSocketHandler(this.wss);
  }

  start() {
    this.wss.on("connection", (ws) => this.handler.handleConnection(ws));
    console.log(`WebSocket server ready on port ${this.port}`);
  }
}
