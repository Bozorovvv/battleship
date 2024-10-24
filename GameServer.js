import WebSocket from "ws";
import { RoomManager } from "./RoomManager";
import { Player } from "./Player";

export class BattleshipServer {
  constructor(port) {
    this.players = new Map();
    this.roomManager = new RoomManager();
    this.server = new WebSocket.Server({ port });

    this.server.on("listening", () => {
      console.log(`Websocket server started on port ${port}...`);
    });

    this.server.on("connection", this.handleConnection.bind(this));
  }

  handleConnection(ws) {
    console.log("New connection established");

    ws.on("message", (message) => {
      try {
        const { type, data, id } = JSON.parse(message);
        console.log("Received:", type, data);
        this.handleMessage(ws, type, data);
      } catch (error) {
        console.error("Invalid message:", error);
      }
    });
    ws.on("close", () => {
      const player = Array.from(this.players.values()).find((p) => p.ws === ws);
      if (player) {
        if (player.currentRoom) {
          const room = this.roomManager.getRooom(player.currentRoom);
          if (room) {
            room.removePlayer(player.index);
            if (room.players.length === 0) {
              this.roomManager.removeRoom(room.roomId);
            }
          }
        }
        this.players.delete(player.index);
        this.broadcastRoomUpdate();
      }
    });
  }

  handleMessage(ws, type, data) {
    switch (type) {
      case "reg":
        this.handleRegistration(ws, data);
        break;
      case "create_room":
        this.handleCreateRoom(ws);
        break;
      case "add_user_to_room":
        this.handleAddUserToRoom(ws, data);
        break;
      case "add_ships":
        this.handleAddShips(ws, data);
        break;
      case "attack":
        this.handleAttack(ws, data);
        break;
      case "randomAttack":
        this.handleRandomAttack(ws, data);
        break;
    }
  }

  handleRegistration(ws, { name, password }) {
    let player = Array.from(this.players.values()).find((p) => p.name === name);

    if (player) {
      if (player.password !== password) {
        ws.send(
          JSON.stringify({
            type: "reg",
            data: {
              name,
              index: "",
              error: true,
              errorText: "Invalid password",
            },
            id: 0,
          })
        );
        return;
      }
      player.ws = ws;
    } else {
      player = new Player(name, password, ws);
      this.players.set(player.index, player);
    }

    ws.send(
      JSON.stringify({
        type: "reg",
        data: {
          name: player.name,
          index: player.index,
          error: false,
          errorText: "",
        },
        id: 0,
      })
    );

    this.broadcastRoomUpdate();
    this.broadcastWinners();
  }

  handleCreateRoom(ws) {
    const player = Array.from(this.players.values()).find((p) => p.ws === ws);

    if (player) {
      const room = this.roomManager.createRoom();
      room.addPlayer(player);
      this.broadcastRoomUpdate();
    }
  }

  handleAddUserToRoom(ws, { indexRoom }) {
    const player = Array.from(this.players.values()).find((p) => p.ws === ws);
    const room = this.roomManager.getRoom(indexRoom);

    if (player && room) {
      room.addPlayer(player);
      this.broadcastRoomUpdate();
    }
  }

  handleAddShips(ws, { gameId, ships, indexPlayer }) {
    const player = Array.from(this.players.values()).find((p) => p.ws === ws);

    if (player && player.currentRoom) {
      const room = this.roomManager.getRoom(player.currentRoom);
      if (room && room.gameId === gameId) {
        room.addShips(indexPlayer, ships);
      }
    }
  }

  handleAttack(ws, { gameId, x, y, indexPlayer }) {
    const player = Array.from(this.players.values()).find((p) => p.ws === ws);

    if (player && player.currentRoom) {
      const room = this.roomManager.getRoom(player.currentRoom);
      if (room && room.gameId === gameId) {
        const result = room.handleAttack(indexPlayer, x, y);
        if (result?.gameOver) {
          player.wins++;
          room.broadcast("finish", { winPlayer: indexPlayer });
          this.broadcastWinners();
        }
      }
    }
  }

  handleRandomAttack(ws, { gameId, indexPlayer }) {
    const player = Array.from(this.players.values()).find((p) => p.ws === ws);

    if (player && player.currentRoom) {
      const room = this.roomManager.getRoom(player.currentRoom);
      if (room && room.gameId === gameId) {
        const result = room.handleRandomAttack(indexPlayer);
        if (result?.gameOver) {
          player.wins++;
          room.broadcast("finish", { winPlayer: indexPlayer });
          this.broadcastWinners();
        }
      }
    }
  }

  broadcastRoomUpdate() {
    const rooms = this.roomManager.getAvailableRooms();
    const message = {
      type: "update_room",
      data: rooms,
      id: 0,
    };

    this.players.forEach((player) => {
      player.ws.send(JSON.stringify(message));
    });
  }
}
