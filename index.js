import { WebSocketServer } from "ws";
import { httpServer } from "./src/http_server/index.js";

const HTTP_PORT = 8181;

const ws = new WebSocketServer({ server: httpServer });

ws.on("connection", (socket) => {
  console.log("Client connected");

  socket.on("message", (message) => {
    console.log(`Received message: ${message.toString()}`);
    try {
      const parsedMessage = JSON.parse(message);
      handleMessage(ws, parsedMessage);
    } catch (error) {
      console.error("Invalid message:", error);
    }
  });

  socket.on("close", () => {
    console.log("Client disconnected");
  });

  socket.on("close", () => {
    console.log("WebSocket server closed");
  });
});

function handleMessage(ws, message) {
  switch (message.type) {
    case "reg":
      handleRegistration(ws, message.data);
      break;
    case "create_room":
      handleCreateRoom(ws, message.data);
      break;
    default:
      console.error(`Unknown message type: ${message.type}`);
  }
}

function handleRegistration(ws, data) {
  console.log("Registration request:", data);
}

function handleCreateRoom(ws, data) {
  console.log("Create room request:", data);
}

console.log(`Start static http server on the ${HTTP_PORT} port!`);
httpServer.listen(HTTP_PORT, () => {
  console.log(`WebSocket server is running on ws://localhost:${HTTP_PORT}`);
});

const players = new Map();
const rooms = new Map();
const games = new Map();
