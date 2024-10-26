import crypto from "crypto";
import { WebSocketServer } from "ws";
import { httpServer } from "./src/http_server/index.js";

const WS_PORT = 8181;
const HTTP_PORT = 3000;

const players = new Map();
const rooms = new Map();
const games = new Map();
const winners = new Map();

class WebSocketHandler {
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
        // this.sendError(ws, "reg", "Invalid message format");
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
        this.handleAttack(ws, message.data);
        break;
      case "randomAttack":
        this.handleRandomAttack(ws, message.data);
        break;
      default:
        console.error("'reg'", "Unknown message type");
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
      console.error("'create_room'", "Player not found");
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
      console.error("'add_user_to_room'", "Invalid room or player");
      return;
    }

    const isPlayerInRoom = room.roomUsers.some(
      (user) => user.index === player.index
    );
    if (isPlayerInRoom) {
      console.error("'add_user_to_room'", "You are already in this room");
      return;
    }

    if (room.roomUsers.length >= 2) {
      console.error("'add_user_to_room'", "Room is full");
      return;
    }

    room.roomUsers.push({
      name: player.name,
      index: player.index,
    });

    if (room.roomUsers.length === 2) {
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

      rooms.delete(indexRoom);
      this.broadcastRoomUpdate();
    }
  }

  handleAddShips(ws, data) {
    const { gameId, ships, indexPlayer } = JSON.parse(data);
    const game = games.get(gameId);

    if (!game) {
      console.error("'add_ships'", "Game not found");
      return;
    }

    const player = game.players.find((p) => p.gameId === indexPlayer);
    if (!player) {
      console.error("'add_ships'", "Player not found in game");
      return;
    }

    if (!this.validateShipsPlacement(ships)) {
      console.error("'add_ships'", "Invalid ships placement");
      return;
    }

    player.ships = ships;

    if (game.players.every((p) => p.ships.length > 0)) {
      game.status = "playing";
      game.players.forEach((p) => {
        const playerWs = players.get(p.name).ws;
        this.send(playerWs, "start_game", {
          ships: p.ships,
          currentPlayerIndex: p.gameId,
        });
      });

      this.broadcastTurn(game);
    }
  }

  handleAttack(ws, data) {
    console.log(data);
    const { gameId, x, y, indexPlayer } = JSON.parse(data);
    const game = games.get(gameId);

    if (!game || game.status !== "playing") {
      console.error("'attack'", "Invalid game or game not started");
      return;
    }

    const attackingPlayer = game.players.find((p) => p.gameId === indexPlayer);
    const defendingPlayer = game.players.find((p) => p.gameId !== indexPlayer);

    if (!attackingPlayer || !defendingPlayer) {
      console.error("'attack'", "Players not found");
      return;
    }

    if (game.currentPlayer !== game.players.indexOf(attackingPlayer)) {
      console.error("'attack'", "Not your turn");
      return;
    }

    if (this.isCellHit(x, y, gameId, indexPlayer)) {
      // this.sendError(ws, "attack", "Position already attacked");
      console.error("'attack'", "Position already attacked");
      return;
    }

    attackingPlayer.shots.add(`${x},${y}`);

    const attackResult = this.processAttack(x, y, defendingPlayer.ships);

    game.players.forEach((p) => {
      const playerWs = players.get(p.name).ws;
      this.send(playerWs, "attack", {
        position: { x, y },
        currentPlayer: indexPlayer,
        status: attackResult.status,
      });
    });

    if (attackResult.status === "killed") {
      const surroundingCells = this.getSurroundingCells(attackResult.ship);

      surroundingCells.forEach((cell) => {
        if (!this.isCellHit(cell.x, cell.y, gameId, indexPlayer)) {
          attackingPlayer.shots.add(`${cell.x},${cell.y}`);
          game.players.forEach((p) => {
            const playerWs = players.get(p.name).ws;
            this.send(playerWs, "attack", {
              position: { x: cell.x, y: cell.y },
              currentPlayer: indexPlayer,
              status: "miss",
            });
          });
        }
      });

      if (this.checkGameEnd(defendingPlayer.ships, attackingPlayer.shots)) {
        game.status = "finished";
        game.players.forEach((p) => {
          const playerWs = players.get(p.name).ws;
          this.send(playerWs, "finish", {
            winPlayer: attackingPlayer.gameId,
          });
        });
        this.updateWinners(attackingPlayer.name);
        return;
      }
    }

    if (attackResult.status === "miss") {
      game.currentPlayer = (game.currentPlayer + 1) % 2;
    }

    this.broadcastTurn(game);
  }

  handleRandomAttack(ws, data) {
    const { gameId, indexPlayer } = JSON.parse(data);
    const game = games.get(gameId);

    if (!game || game.status !== "playing") {
      console.error("'randomAttack'", "Invalid game or game not started");
      return;
    }

    const attackingPlayer = game.players.find((p) => p.gameId === indexPlayer);
    if (
      !attackingPlayer ||
      game.currentPlayer !== game.players.indexOf(attackingPlayer)
    ) {
      console.error("'randomAttack'", "Not your turn");
      return;
    }

    let x, y;
    do {
      x = Math.floor(Math.random() * 10);
      y = Math.floor(Math.random() * 10);
    } while (attackingPlayer.shots.has(`${x},${y}`));

    this.handleAttack(ws, { gameId, x, y, indexPlayer });
  }

  validateShipsPlacement(ships) {
    return true;
  }

  processAttack(x, y, ships) {
    for (const ship of ships) {
      const shipCells = this.getShipCells(ship);
      for (const cell of shipCells) {
        if (cell.x === x && cell.y === y) {
          const isKilled = this.isShipKilled(ship, ships);
          return {
            status: isKilled ? "killed" : "shot",
            ship: isKilled ? ship : null,
          };
        }
      }
    }
    return { status: "miss" };
  }

  getShipCells(ship) {
    const cells = [];
    const { x, y } = ship.position;
    for (let i = 0; i < ship.length; i++) {
      cells.push({
        x: !ship.direction ? x + i : x,
        y: !ship.direction ? y : y + i,
      });
    }
    return cells;
  }

  isShipKilled(targetShip, ships) {
    const shipCells = this.getShipCells(targetShip);
    const allShots = Array.from(
      targetShip.gameId
        ? games
            .get(targetShip.gameId)
            .players.flatMap((p) => Array.from(p.shots))
        : []
    );

    return shipCells.every((cell) =>
      allShots.some((shot) => {
        const [shotX, shotY] = shot.split(",").map(Number);
        return shotX === cell.x && shotY === cell.y;
      })
    );
  }

  getShipAtPosition(ships, x, y) {
    for (const ship of ships) {
      const shipCells = this.getShipCells(ship);
      if (shipCells.some((cell) => cell.x === x && cell.y === y)) {
        return ship;
      }
    }
    return null;
  }

  checkGameEnd(ships, attackerShots) {
    return ships.every((ship) => {
      const shipCells = this.getShipCells(ship);
      return shipCells.every((cell) =>
        Array.from(attackerShots).some((shot) => {
          const [x, y] = shot.split(",").map(Number);
          return x === cell.x && y === cell.y;
        })
      );
    });
  }
  isCellHit(x, y, gameId, indexPlayer) {
    const game = games.get(gameId);
    if (!game) return false;

    // Get the specified player by index
    const player = game.players[indexPlayer];
    if (!player) return false;

    // Check if the current player's shots contain the specified coordinates
    return player.shots.has(`${x},${y}`);
  }

  broadcastSurroundingMisses(game, ship) {
    const surroundingCells = this.getSurroundingCells(ship);

    game.players.forEach((p) => {
      const playerWs = players.get(p.name).ws;
      surroundingCells.forEach((cell) => {
        this.send(playerWs, "attack", {
          position: { x: cell.x, y: cell.y },
          currentPlayer: game.currentPlayer,
          status: "miss",
        });
      });
    });
  }

  getSurroundingCells(ship) {
    const cells = new Set();
    const shipCells = this.getShipCells(ship);

    shipCells.forEach((shipCell) => {
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          const x = shipCell.x + dx;
          const y = shipCell.y + dy;

          if (x < 0 || x >= 10 || y < 0 || y >= 10) continue;

          if (shipCells.some((cell) => cell.x === x && cell.y === y)) continue;

          cells.add(`${x},${y}`);
        }
      }
    });

    return Array.from(cells).map((str) => {
      const [x, y] = str.split(",");
      return { x: parseInt(x), y: parseInt(y) };
    });
  }

  broadcastTurn(game) {
    game.players.forEach((p) => {
      const playerWs = players.get(p.name).ws;
      this.send(playerWs, "turn", {
        currentPlayer: game.players[game.currentPlayer].gameId,
      });
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
    // Additional cleanup if needed
  }
}

class Server {
  constructor(httpServer, port) {
    this.port = port;
    this.wss = new WebSocketServer({ server: httpServer });
    this.handler = new WebSocketHandler(this.wss);
  }

  start() {
    this.wss.on("connection", (ws) => this.handler.handleConnection(ws));
  }
}

const server = new Server(httpServer, WS_PORT);
server.start();

httpServer.listen(HTTP_PORT, () => {
  console.log(`WebSocket server started on port ${HTTP_PORT}`);
});

export { Server };
