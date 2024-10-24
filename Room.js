export class Room {
  constructor(id) {
    this.roomId = id;
    this.players = new Map();
    this.boards = new Map();
    this.gameId = null;
    this.status = "waiting";
    this.currentTurn = null;
  }

  addPlayer(player) {
    if (this.players.size >= 2) return false;
    this.players.set(player.index, player);
    this.boards.set(player.index, new Board());
    player.currentRoom = this.roomId;

    if (this.players.size === 2) {
      this.gameId = generateId();
      this.notifyGameCreated();
    }

    return true;
  }

  notifyGameCreated() {
    this.players.forEach((player) => {
      player.send("create_game", {
        idGame: this.gameId,
        idPlayer: player.index,
      });
    });
  }

  addShip(playerIndex, ships) {
    const board = this.boards.get(playerIndex);
    if (board) {
      board.addShips(ships);
      if (this.areAllShipPlaced()) {
        this.startGame();
      }
      return true;
    }
    return false;
  }

  areAllShipPlaced() {
    return Array.from(this.boards.values()).every(
      (board) => board.ships.length > 0
    );
  }

  startGame() {
    this.status = "playing";
    this.currentTurn = Array.from(this.players.keys())[
      Math.floor(Math.random() * 2)
    ];

    this.playersforEach((player, index) => {
      const board = this.boards.get(index);
      player.send("start_game", {
        ships: board.ships.map((ship) => ({
          position: ship.poistion,
          direction: ship.direction,
          length: ship.length,
          type: ship.type,
        })),
        currenPlayerIndex: index,
      });
    });

    this.broadcast("turn", {
      currentPlayer: this.currentTurn,
    });
  }

  handleAttack(playerIndex, x, y) {
    if (this.status !== "playing" || this.currentTurn !== playerIndex)
      return null;

    const defendingPlayerId = Array.from(this.players.keys()).find(
      (id) => id !== playerIndex
    );

    const defendingBoard = this.boards.get(defendingPlayerId);
    const result = defendingBoard.attack(x, y);

    this.broadcast("attack", {
      position: { x, y },
      currentPlayer: playerIndex,
      status: result.status,
    });

    if (result.status === "killed") {
      result.surroundCells.forEach((cell) => {
        const { x, y } = cell.split(",").map(Number);
        this.broadcast("attack", {
          position: { x, y },
          currentPlayer: playerIndex,
          status: "miss",
        });
      });
    }

    if (result.status === "miss") {
      this.currentTurn = defendingPlayerId;
      this.broadcast("turn", {
        currentPlayer: this.currentTurn,
      });
    }

    if (defendingBoard.areAllShipsDestroyed()) {
      this.status = "finished";
      return { gameOver: true, winner: playerIndex };
    }

    return { gameOver: false };
  }

  handleRandomAttack(playerIndex) {
    if (this.status !== "playing" || this.currentTurn !== playerIndex)
      return null;

    const defendingPlayerId = Array.from(this.players.keys()).find(
      (id) => id !== playerIndex
    );
    const defendingBoard = this.boards.get(defendingPlayerId);
    const position = defendingBoard.getRandomAttackPosition();

    if (position) {
      return this.handleAttack(playerIndex, position.x, position.y);
    }
    return null;
  }

  broadcast(type, data) {
    this.players.forEach((player) => {
      player.send(type, data);
    });
  }

  toJSON() {
    return {
      roomId: this.roomId,
      players: Array.from(this.players.values()).map((player) => ({
        name: player.name,
        index: player.index,
      })),
    };
  }
}
