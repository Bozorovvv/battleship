const WebSocket = require("ws");
const { v4: uuidv4 } = require("uuid");

// In-memory storage
const players = new Map(); // Store player data
const rooms = new Map(); // Store room data
const games = new Map(); // Store active games
const winners = new Map(); // Store winner statistics

class BattleshipServer {
  constructor(port = 3000) {
    this.wss = new WebSocket.Server({ port });
    this.clientConnections = new Map();
    this.setupWebSocket();
    console.log(`WebSocket server started on port ${port}`);
  }

  setupWebSocket() {
    this.wss.on("connection", (ws) => {
      const clientId = uuidv4();
      this.clientConnections.set(clientId, ws);

      ws.on("message", (message) => {
        try {
          const parsedMessage = JSON.parse(message);
          this.handleMessage(clientId, ws, parsedMessage);
        } catch (error) {
          console.error("Error parsing message:", error);
          this.sendError(ws, "Invalid message format");
        }
      });

      ws.on("close", () => {
        this.handleDisconnect(clientId);
      });
    });
  }

  handleMessage(clientId, ws, message) {
    console.log("Received message:", message);

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
        this.sendError(ws, "Unknown message type");
    }
  }

  handleRegistration(ws, data) {
    const { name, password } = data;

    if (players.has(name) && players.get(name).password !== password) {
      this.send(ws, "reg", {
        error: true,
        errorText: "Invalid credentials",
      });
      return;
    }

    const playerIndex = players.has(name) ? players.get(name).index : uuidv4();

    players.set(name, {
      password,
      index: playerIndex,
      ws,
    });

    // Send registration confirmation
    this.send(ws, "reg", {
      name,
      index: playerIndex,
      error: false,
      errorText: "",
    });

    // Send current rooms and winners
    this.broadcastRoomUpdate();
    this.broadcastWinnersUpdate();
  }

  handleCreateRoom(clientId, ws) {
    const roomId = uuidv4();
    const player = this.getPlayerByWs(ws);

    if (!player) {
      this.sendError(ws, "Player not found");
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
    const { indexRoom } = data;
    const player = this.getPlayerByWs(ws);
    const room = rooms.get(indexRoom);

    if (!room || !player) {
      this.sendError(ws, "Invalid room or player");
      return;
    }

    room.roomUsers.push({
      name: player.name,
      index: player.index,
    });

    // Create game when second player joins
    if (room.roomUsers.length === 2) {
      const gameId = uuidv4();
      const game = {
        id: gameId,
        players: room.roomUsers.map((user) => ({
          ...user,
          ships: [],
          shots: new Set(),
          gameId: uuidv4(),
        })),
        currentPlayer: 0,
        status: "waiting",
      };

      games.set(gameId, game);

      // Notify both players about game creation
      room.roomUsers.forEach((user, index) => {
        const playerWs = players.get(user.name).ws;
        this.send(playerWs, "create_game", {
          idGame: gameId,
          idPlayer: game.players[index].gameId,
        });
      });

      // Remove room from available rooms
      rooms.delete(indexRoom);
      this.broadcastRoomUpdate();
    }
  }

  handleAddShips(ws, data) {
    const { gameId, ships, indexPlayer } = data;
    const game = games.get(gameId);

    if (!game) {
      this.sendError(ws, "Game not found");
      return;
    }

    const player = game.players.find((p) => p.gameId === indexPlayer);
    if (!player) {
      this.sendError(ws, "Player not found in game");
      return;
    }

    // Validate ships placement
    if (!this.validateShipsPlacement(ships)) {
      this.sendError(ws, "Invalid ships placement");
      return;
    }

    player.ships = ships;

    // Send start_game if both players have placed their ships
    if (game.players.every((p) => p.ships.length > 0)) {
      game.status = "playing";
      game.players.forEach((p) => {
        const playerWs = players.get(p.name).ws;
        this.send(playerWs, "start_game", {
          ships: p.ships,
          currentPlayerIndex: p.gameId,
        });
      });

      // Send first turn
      this.broadcastTurn(game);
    }
  }

  handleAttack(ws, data) {
    const { gameId, x, y, indexPlayer } = data;
    const game = games.get(gameId);

    if (!game || game.status !== "playing") {
      this.sendError(ws, "Invalid game or game not started");
      return;
    }

    const attackingPlayer = game.players.find((p) => p.gameId === indexPlayer);
    const defendingPlayer = game.players.find((p) => p.gameId !== indexPlayer);

    if (!attackingPlayer || !defendingPlayer) {
      this.sendError(ws, "Players not found");
      return;
    }

    if (game.currentPlayer !== game.players.indexOf(attackingPlayer)) {
      this.sendError(ws, "Not your turn");
      return;
    }

    // Process attack
    const attackResult = this.processAttack(x, y, defendingPlayer.ships);
    const shotKey = `${x},${y}`;
    attackingPlayer.shots.add(shotKey);

    // Broadcast attack result
    game.players.forEach((p) => {
      const playerWs = players.get(p.name).ws;
      this.send(playerWs, "attack", {
        position: { x, y },
        currentPlayer: indexPlayer,
        status: attackResult.status,
      });
    });

    // If it's a kill, send misses for surrounding cells
    if (attackResult.status === "killed") {
      this.broadcastSurroundingMisses(game, attackResult.ship);
    }

    // Check for game end
    if (this.checkGameEnd(defendingPlayer.ships)) {
      game.status = "finished";
      game.players.forEach((p) => {
        const playerWs = players.get(p.name).ws;
        this.send(playerWs, "finish", {
          winPlayer: attackingPlayer.gameId,
        });
      });

      // Update winners
      this.updateWinners(attackingPlayer.name);
      return;
    }

    // Change turn if missed
    if (attackResult.status === "miss") {
      game.currentPlayer = (game.currentPlayer + 1) % 2;
    }

    this.broadcastTurn(game);
  }

  handleRandomAttack(ws, data) {
    const { gameId, indexPlayer } = data;
    const game = games.get(gameId);

    if (!game || game.status !== "playing") {
      this.sendError(ws, "Invalid game or game not started");
      return;
    }

    const attackingPlayer = game.players.find((p) => p.gameId === indexPlayer);
    if (
      !attackingPlayer ||
      game.currentPlayer !== game.players.indexOf(attackingPlayer)
    ) {
      this.sendError(ws, "Not your turn");
      return;
    }

    // Generate random coordinates that haven't been shot at
    let x, y;
    do {
      x = Math.floor(Math.random() * 10);
      y = Math.floor(Math.random() * 10);
    } while (attackingPlayer.shots.has(`${x},${y}`));

    // Process attack using regular attack handler
    this.handleAttack(ws, { gameId, x, y, indexPlayer });
  }

  // Helper methods
  validateShipsPlacement(ships) {
    // Implement ship placement validation logic
    // Check for:
    // 1. Ships don't overlap
    // 2. Ships are within bounds
    // 3. Correct number and sizes of ships
    return true; // Simplified for brevity
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
        x: ship.direction ? x + i : x,
        y: ship.direction ? y : y + i,
      });
    }
    return cells;
  }

  isShipKilled(ship, ships) {
    // Implement ship killed check logic
    return true; // Simplified for brevity
  }

  checkGameEnd(ships) {
    // Implement game end check logic
    return false; // Simplified for brevity
  }

  broadcastSurroundingMisses(game, ship) {
    // Implement broadcasting misses for cells around killed ship
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
        data,
        id: 0,
      })
    );
  }

  broadcast(type, data) {
    const message = JSON.stringify({
      type,
      data,
      id: 0,
    });
    this.wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
  }

  sendError(ws, errorText) {
    this.send(ws, "error", { error: true, errorText });
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
    // Implement disconnect handling logic
    this.clientConnections.delete(clientId);
  }
}

// Start the server
const server = new BattleshipServer();

// Handle process termination
process.on("SIGTERM", () => {
  console.log("Shutting down server...");
  server.wss.close(() => {
    console.log("Server closed");
    process.exit(0);
  });
});
