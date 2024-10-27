import crypto from "crypto";
import { gameStore } from "../store/GameStore.js";
import { GameService } from "../services/GameService.js";
import { config } from "../config.js";

export class WebSocketHandler {
  constructor(wss) {
    this.wss = wss;
    this.clientConnections = new Map();
  }

  handleConnection(ws) {
    const clientId = crypto.randomUUID();
    this.clientConnections.set(clientId, ws);

    ws.on("message", (message) => {
      try {
        const parsedMessage = JSON.parse(message);
        this.handleMessage(clientId, ws, parsedMessage);
      } catch (error) {
        console.error("Error parsing message:", error);
      }
    });

    ws.on("close", () => this.handleDisconnect(clientId));
  }

  handleMessage(clientId, ws, message) {
    const handlers = {
      reg: () => this.handleRegistration(ws, message.data),
      create_room: () => this.handleCreateRoom(clientId, ws),
      add_user_to_room: () => this.handleJoinRoom(clientId, ws, message.data),
      add_ships: () => this.handleAddShips(ws, message.data),
      attack: () => this.handleAttack(ws, message.data),
      randomAttack: () => this.handleRandomAttack(ws, message.data),
    };

    const handler = handlers[message.type];
    if (handler) {
      handler();
    } else {
      console.error("Unknown message type:", message.type);
    }
  }

  handleRegistration(ws, data) {
    const { name, password } = JSON.parse(data);
    const existingPlayer = gameStore.players.get(name);

    if (existingPlayer && existingPlayer.password !== password) {
      return this.send(ws, "reg", {
        error: true,
        errorText: "Invalid credentials",
      });
    }

    const player = gameStore.createPlayer(name, password, ws);

    this.send(ws, "reg", {
      ...player,
      error: false,
      errorText: "",
    });

    this.broadcastRoomUpdate();
    this.broadcastWinnersUpdate();
  }

  handleCreateRoom(clientId, ws) {
    const player = gameStore.getPlayerByWs(ws);
    if (!player) return;

    const roomId = gameStore.createRoom(player);
    this.broadcastRoomUpdate();
  }

  handleJoinRoom(clientId, ws, data) {
    const { indexRoom } = JSON.parse(data);
    const player = gameStore.getPlayerByWs(ws);
    const room = gameStore.rooms.get(indexRoom);

    if (!this.validateRoomJoin(room, player)) return;

    room.roomUsers.push({
      name: player.name,
      index: player.index,
    });

    if (room.roomUsers.length === config.MAX_PLAYERS_PER_ROOM) {
      const game = gameStore.createGame(room);
      this.initializeGame(game, room);
      gameStore.deleteRoom(indexRoom);
      this.broadcastRoomUpdate();
    }
  }

  validateRoomJoin(room, player) {
    if (!room || !player) return false;
    if (room.roomUsers.some((user) => user.index === player.index))
      return false;
    if (room.roomUsers.length >= config.MAX_PLAYERS_PER_ROOM) return false;
    return true;
  }

  initializeGame(game, room) {
    room.roomUsers.forEach((user, index) => {
      const playerWs = gameStore.players.get(user.name).ws;
      this.send(playerWs, "create_game", {
        idGame: game.id,
        idPlayer: game.players[index].gameId,
      });
    });
  }

  handleAttack(ws, data) {
    const { gameId, x, y, indexPlayer } = JSON.parse(data);
    const game = gameStore.getGame(gameId);

    if (!this.validateAttack(game, indexPlayer, x, y)) return;

    const attackingPlayer = game.players.find((p) => p.gameId === indexPlayer);
    const defendingPlayer = game.players.find((p) => p.gameId !== indexPlayer);

    attackingPlayer.shots.add(`${x},${y}`);
    const attackResult = GameService.processAttack(
      x,
      y,
      defendingPlayer.ships,
      attackingPlayer.shots
    );

    this.broadcastAttackResult(game, attackResult, { x, y }, indexPlayer);

    if (attackResult.status === "killed") {
      this.handleShipKilled(
        game,
        attackResult.ship,
        indexPlayer,
        attackingPlayer,
        defendingPlayer
      );
    } else if (attackResult.status === "miss") {
      game.currentPlayer = (game.currentPlayer + 1) % 2;
    }

    this.broadcastTurn(game);
  }

  handleRandomAttack(ws, data) {
    const { gameId, indexPlayer } = JSON.parse(data);
    let x, y;
    do {
      x = Math.floor(Math.random() * config.BOARD_SIZE);
      y = Math.floor(Math.random() * config.BOARD_SIZE);
    } while (this.isCellHit(x, y, gameId, indexPlayer));

    this.handleAttack(ws, JSON.stringify({ gameId, x, y, indexPlayer }));
  }

  // ... Helper methods ...

  send(ws, type, data) {
    ws.send(
      JSON.stringify({
        type,
        data: JSON.stringify(data),
        id: 0,
      })
    );
  }

  broadcast(type, data) {
    this.wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        this.send(client, type, data);
      }
    });
  }

  handleDisconnect(clientId) {
    this.clientConnections.delete(clientId);
  }
}
