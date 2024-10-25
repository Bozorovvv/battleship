export class Game {
  constructor(id, player1, player2) {
    this.id = id;
    this.players = [player1, player2];
    this.turn = player1;
    this.boards = {
      [player1]: [],
      [player2]: [],
    };
  }

  addShips(player, ships) {
    this.boards[player] = ships;
  }

  attack(player, x, y) {
    const opponent = this.players.find((p) => p !== player);
    const opponentBoard = this.boards[opponent];

    if (this.turn !== player) {
      return "not_your_turn";
    }

    if (
      x < 0 ||
      y < 0 ||
      x >= opponentBoard.length ||
      y >= opponentBoard[x].length
    ) {
      return "invalid_coordinates";
    }

    if (opponentBoard[x][y] === "miss" || opponentBoard[x][y] === "hit") {
      return "already_attacked";
    }

    if (opponentBoard[x][y]) {
      opponentBoard[x][y] = "hit";
      this.switchTurn();
      return "hit";
    } else {
      opponentBoard[x][y] = "miss";
      this.switchTurn();
      return "miss";
    }
  }

  randomAttack(player) {
    const opponent = this.players.find((p) => p !== player);
    const opponentBoard = this.boards[opponent];
    let x, y;

    do {
      x = Math.floor(Math.random() * opponentBoard.length);
      y = Math.floor(Math.random() * opponentBoard[x].length);
    } while (opponentBoard[x][y] === "miss" || opponentBoard[x][y] === "hit");

    return { x, y };
  }

  switchTurn() {
    this.turn =
      this.turn === this.players[0] ? this.players[1] : this.players[0];
  }
}
