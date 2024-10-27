import crypto from "crypto";
import { players, rooms, games, winners } from "../models/store.js";
import { GameUtils } from "../utils/gameUtils.js";
import { GameHandler } from "./gameHandler.js";
import { BotService } from "../services/botService.js";

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

    ws.on("close", () => {
      this.handleDisconnect(clientId);
    });
  }

  handleMessage(clientId, ws, message) {
    switch (message.type) {
      case "reg":
        this.handleRegistration(ws, message.data);
        break;
      case "create_room":
        this.handleCreateRoom(clientId, ws);
        break;
      case "add_user_to_room":
        this.handleJoinRoom(clientId, ws, message.data);
        break;
      case "add_ships":
        this.handleAddShips(ws, message.data);
        break;
      case "attack":
        GameHandler.handleAttack(ws, this, message.data);
        break;
      case "randomAttack":
        this.handleRandomAttack(ws, message.data);
        break;
      case "single_play":
        this.handleSinglePlay(clientId, ws);
        break;
      default:
        console.error("Unknown message type:", message.type);
    }
  }

  handleRegistration(ws, data) {
    const { name, password } = JSON.parse(data);

    if (players.has(name) && players.get(name).password !== password) {
      this.send(ws, "reg", {
        error: true,
        errorText: "Invalid credentials",
      });
      return;
    }

    if (players.has(name)) {
      const existingPlayer = players.get(name);
      if (
        existingPlayer.ws &&
        existingPlayer.ws.readyState === WebSocket.OPEN
      ) {
        this.send(ws, "reg", {
          error: true,
          errorText: "Player is already logged in",
        });
        return;
      }
    }

    const playerIndex = players.has(name)
      ? players.get(name).index
      : crypto.randomUUID();

    players.set(name, {
      password,
      index: playerIndex,
      ws,
    });

    this.send(ws, "reg", {
      name,
      index: playerIndex,
      error: false,
      errorText: "",
    });

    this.broadcastRoomUpdate();
    this.broadcastWinnersUpdate();
  }

  handleCreateRoom(clientId, ws) {
    const roomId = crypto.randomUUID();
    const player = this.getPlayerByWs(ws);

    if (!player) {
      console.error("Player not found");
      return;
    }

    rooms.set(roomId, {
      roomId,
      roomUsers: [
        {
          name: player.name,
          index: player.index,
        },
      ],
    });

    this.broadcastRoomUpdate();
  }

  handleJoinRoom(clientId, ws, data) {
    const { indexRoom } = JSON.parse(data);
    const player = this.getPlayerByWs(ws);
    const room = rooms.get(indexRoom);

    if (!room || !player) {
      console.error("Invalid room or player");
      return;
    }

    if (room.roomUsers.some((user) => user.index === player.index)) {
      console.error("You are already in this room");
      return;
    }

    if (room.roomUsers.length >= 2) {
      console.error("Room is full");
      return;
    }

    room.roomUsers.push({
      name: player.name,
      index: player.index,
    });

    if (room.roomUsers.length === 2) {
      this.createGame(room);
      rooms.delete(indexRoom);
      this.broadcastRoomUpdate();
    }
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

    games.set(gameId, game);

    room.roomUsers.forEach((user, index) => {
      const playerWs = players.get(user.name).ws;
      this.send(playerWs, "create_game", {
        idGame: gameId,
        idPlayer: game.players[index].gameId,
      });
    });
  }

  handleSinglePlay(clientId, ws) {
    const player = this.getPlayerByWs(ws);
    if (!player) {
      console.error("Player not found");
      return;
    }

    const gameId = crypto.randomUUID();
    const botName = `Bot-${crypto.randomUUID().slice(0, 4)}`;

    players.set(botName, {
      password: crypto.randomUUID(),
      index: crypto.randomUUID(),
      isBot: true,
    });

    const botPlayer = {
      name: botName,
      index: players.get(botName).index,
      gameId: crypto.randomUUID(),
      ships: BotService.generateBotShips(),
      shots: new Set(),
      isBot: true,
    };

    const game = {
      id: gameId,
      players: [
        {
          name: player.name,
          index: player.index,
          gameId: crypto.randomUUID(),
          ships: [],
          shots: new Set(),
          isBot: false,
        },
        botPlayer,
      ],
      currentPlayer: 0,
      status: "waiting",
      isSinglePlayer: true,
    };

    games.set(gameId, game);

    this.send(ws, "create_game", {
      idGame: gameId,
      idPlayer: game.players[0].gameId,
      isSinglePlayer: true,
    });
  }

  handleAddShips(ws, data) {
    try {
      const { gameId, ships, indexPlayer } = JSON.parse(data);
      const game = games.get(gameId);

      if (!game) {
        this.sendError(ws, "add_ships", "Game not found");
        return;
      }

      const player = game.players.find((p) => p.gameId === indexPlayer);
      if (!player) {
        this.sendError(ws, "add_ships", "Player not found in game");
        return;
      }

      if (!GameUtils.validateShipsPlacement(ships)) {
        this.sendError(ws, "add_ships", "Invalid ships placement");
        return;
      }

      player.ships = ships;

      const allShipsPlaced = game.players.every((p) => p.ships.length > 0);
      if (allShipsPlaced) {
        this.startGame(game);
      } else {
        this.send(ws, "add_ships", {
          success: true,
          message: "Ships placed successfully, waiting for other player",
        });
      }
    } catch (error) {
      console.error("Error in handleAddShips:", error);
      this.sendError(ws, "add_ships", "Internal server error");
    }
  }

  startGame(game) {
    game.status = "playing";

    game.players.forEach((p) => {
      if (!p.isBot) {
        const playerWs = players.get(p.name).ws;
        if (playerWs && playerWs.readyState === WebSocket.OPEN) {
          this.send(playerWs, "add_ships", {
            success: true,
            message: "Ships placed successfully",
          });

          this.send(playerWs, "start_game", {
            ships: p.ships,
            currentPlayerIndex: game.players[game.currentPlayer].gameId,
            gameStatus: game.status,
          });
        }
      }
    });

    this.broadcastTurn(game);

    if (game.players[game.currentPlayer].isBot) {
      GameHandler.makeBotMove(game, this);
    }
  }

  handleRandomAttack(ws, data) {
    const { gameId, indexPlayer } = JSON.parse(data);
    const game = games.get(gameId);

    if (!game || game.status !== "playing") {
      console.error("Invalid game or game not started");
      return;
    }

    const attackingPlayer = game.players.find((p) => p.gameId === indexPlayer);
    if (
      !attackingPlayer ||
      game.currentPlayer !== game.players.indexOf(attackingPlayer)
    ) {
      console.error("Not your turn");
      return;
    }

    let x, y;
    do {
      x = Math.floor(Math.random() * 10);
      y = Math.floor(Math.random() * 10);
    } while (attackingPlayer.shots.has(`${x},${y}`));

    GameHandler.handleAttack(
      ws,
      this,
      JSON.stringify({ gameId, x, y, indexPlayer })
    );
  }

  send(ws, type, data) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(
        JSON.stringify({
          type,
          data: JSON.stringify(data),
          id: 0,
        })
      );
    }
  }

  broadcast(type, data) {
    this.wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(
          JSON.stringify({
            type,
            data: JSON.stringify(data),
            id: 0,
          })
        );
      }
    });
  }

  sendError(ws, type, errorText) {
    this.send(ws, type, { error: true, errorText });
  }

  broadcastTurn(game) {
    game.players.forEach((p) => {
      if (!p.isBot) {
        const playerWs = players.get(p.name).ws;
        if (playerWs) {
          this.send(playerWs, "turn", {
            currentPlayer: game.players[game.currentPlayer].gameId,
          });
        }
      }
    });
  }

  broadcastRoomUpdate() {
    const roomsList = Array.from(rooms.values());
    this.broadcast("update_room", roomsList);
  }

  broadcastWinnersUpdate() {
    const winnersList = Array.from(winners.entries()).map(([name, wins]) => ({
      name,
      wins,
    }));
    this.broadcast("update_winners", winnersList);
  }

  updateWinners(winnerName) {
    const currentWins = winners.get(winnerName) || 0;
    winners.set(winnerName, currentWins + 1);
    this.broadcastWinnersUpdate();
  }

  getPlayerByWs(ws) {
    for (const [name, data] of players.entries()) {
      if (data.ws === ws) {
        return { name, ...data };
      }
    }
    return null;
  }

  handleDisconnect(clientId) {
    this.clientConnections.delete(clientId);
  }
}
