import { Room } from "../models/Room.js";
import { Game } from "../models/Game.js";

export class RoomController {
  constructor() {
    this.rooms = new Map();
    this.games = new Map();
    this.winners = new Map();
    this.nextRoomId = 1;
    this.nextGameId = 1;
  }

  createRoom(ws) {
    const room = new Room(this.nextRoomId++);
    this.rooms.set(room.id, room);

    const roomData = Array.from(this.rooms.values())
      .filter((room) => room.players.length > 0)
      .map((room) => ({
        roomId: room.id,
        roomUsers: room.players.map((player, index) => ({
          name: player.name,
          index,
        })),
      }));

    if (roomData.length > 0) {
      ws.send(
        JSON.stringify({
          type: "update_room",
          data: roomData,
          id: 0,
        })
      );
    }
  }

  broadcastRoomUpdateToAll() {
    const roomData = Array.from(this.rooms.values()).map((room) => ({
      roomId: room.id,
      roomUsers: room.players.map((player, index) => ({
        name: player.name,
        index,
      })),
    }));

    this.rooms.forEach((room) => {
      room.players.forEach((playerSocket) => {
        playerSocket.send(
          JSON.stringify({
            type: "update_room",
            data: roomData,
            id: 0,
          })
        );
      });
    });
  }

  broadcastWinnersUpdate() {
    const winnersData = Array.from(this.winners.entries()).map(
      ([name, wins]) => ({
        name,
        wins,
      })
    );

    this.rooms.forEach((room) => {
      room.players.forEach((playerSocket) => {
        playerSocket.send(
          JSON.stringify({
            type: "update_winners",
            data: winnersData,
            id: 0,
          })
        );
      });
    });
  }

  recordWinner(playerName) {
    const currentWins = this.winners.get(playerName) || 0;
    this.winners.set(playerName, currentWins + 1);
    this.broadcastWinnersUpdate();
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

    this.broadcastRoomUpdateToAll();

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
}
