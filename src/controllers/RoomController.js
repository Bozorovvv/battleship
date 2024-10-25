import { Room } from "../models/Room.js";
import { Game } from "../models/Game.js";

export class RoomController {
  constructor() {
    this.rooms = new Map();
    this.games = new Map();
    this.nextRoomId = 1;
    this.nextGameId = 1;
  }

  createRoom(ws) {
    const room = new Room(this.nextRoomId++);
    this.rooms.set(room.id, room);
    ws.send(
      JSON.stringify({
        type: "update_room",
        data: JSON.stringify([{ roomId: room.id, roomUsers: room.players }]),
        id: 0,
      })
    );
  }

  addUserToRoom(ws, data) {
    const { indexRoom, playerName } = JSON.parse(data);
    const room = this.rooms.get(indexRoom);

    if (!room) {
      ws.send(
        JSON.stringify({
          type: "error",
          message: `Room ${indexRoom} does not exist`,
        })
      );
      return;
    }

    if (room.players.length >= 2) {
      ws.send(
        JSON.stringify({
          type: "error",
          message: `Room ${indexRoom} is already full`,
        })
      );
      return;
    }

    const playerAdded = room.addPlayer(playerName);
    if (!playerAdded) {
      ws.send(
        JSON.stringify({
          type: "error",
          message: `Could not add player to room ${indexRoom}.`,
        })
      );
      return;
    }

    this.broadcastRoomUpdate(room);

    if (room.isReady()) {
      const gameId = this.nextGameId++;
      const game = new Game(gameId, room.players[0], room.players[1]);
      this.games.set(gameId, game);

      room.players.forEach((playerSocket) => {
        playerSocket.send(
          JSON.stringify({
            type: "create_game",
            data: {
              idGame: gameId,
              players: room.players.map((player) => player.name),
              id: 0,
            },
          })
        );
      });
    } else {
      ws.send(
        JSON.stringify({
          type: "room_joined",
          data: { roomId: indexRoom, player: playerName },
          id: 0,
        })
      );
    }
  }

  broadcastRoomUpdate(room) {
    const roomUpdate = {
      type: "update_room",
      data: JSON.parse({
        roomId: room.id,
        roomUsers: room.players.map((player) => player.name),
      }),
      id: 0,
    };
    room.players.forEach((playerSocket) => {
      playerSocket.send(JSON.stringify(roomUpdate));
    });
  }
}
