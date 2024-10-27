import crypto from "crypto";

class GameStore {
  constructor() {
    this.players = new Map();
    this.rooms = new Map();
    this.games = new Map();
    this.winners = new Map();
  }

  createPlayer(name, password, ws) {
    const playerIndex = this.players.has(name)
      ? this.players.get(name).index
      : crypto.randomUUID();

    this.players.set(name, { password, index: playerIndex, ws });
    return { name, index: playerIndex };
  }

  createRoom(player) {
    const roomId = crypto.randomUUID();
    this.rooms.set(roomId, {
      roomId,
      roomUsers: [{ name: player.name, index: player.index }],
    });
    return roomId;
  }

  createGame(room) {
    const gameId = crypto.randomUUID();
    const game = {
      id: gameId,
      players: room.roomUsers.map((user) => ({
        ...user,
        ships: [],
        shots: new Set(),
        gameId: crypto.randomUUID(),
      })),
      currentPlayer: 0,
      status: "waiting",
    };

    this.games.set(gameId, game);
    return game;
  }

  updateWinner(winnerName) {
    const currentWins = this.winners.get(winnerName) || 0;
    this.winners.set(winnerName, currentWins + 1);
    return Array.from(this.winners.entries()).map(([name, wins]) => ({
      name,
      wins,
    }));
  }

  getGame(gameId) {
    return this.games.get(gameId);
  }

  getRooms() {
    return Array.from(this.rooms.values());
  }

  getPlayerByWs(ws) {
    for (const [name, data] of this.players.entries()) {
      if (data.ws === ws) {
        return { name, ...data };
      }
    }
    return null;
  }

  deleteRoom(roomId) {
    this.rooms.delete(roomId);
  }
}

export const gameStore = new GameStore();
