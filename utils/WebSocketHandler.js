import { GameController } from "../src/controllers/GameController.js";
import { PlayerController } from "../src/controllers/PlayerController.js";
import { RoomController } from "../src/controllers/RoomController.js";

export class WebSocketHandler {
  constructor(wss) {
    this.wss = wss;
    this.playerController = new PlayerController();
    this.roomController = new RoomController();
    this.gameController = new GameController();
  }

  handleConnection(ws) {
    console.log("New client connected");

    ws.on("message", (message) => {
      const request = JSON.parse(message);
      this.handleRequest(ws, request);
    });

    ws.on("close", () => {
      console.log("Client disconnected");
    });
  }

  handleRequest(ws, request) {
    const { type, data } = request;

    switch (type) {
      case "reg":
        const player = this.playerController.registerPlayer(ws, data);
        ws.playerData = player;
        this.roomController.broadcastRoomUpdateToAll();
        break;
      case "create_room":
        this.roomController.createRoom(ws);
        break;
      case "add_user_to_room":
        this.roomController.addUserToRoom(ws, data);
        break;
      case "add_ships":
        this.gameController.addShips(ws, data);
        break;
      case "attack":
        this.gameController.attack(ws, data);
        break;
      case "randomAttack":
        this.gameController.randomAttack(ws, data);
        break;
      default:
        console.log("Unknown request type: ", type);
    }
  }
}
