export class GameController {
  constructor() {
    this.games = new Map();
    this.nextGameId = 1;
  }

  addShips(ws, data) {
    const { gameId, ships, indexPlayer } = JSON.parse(data);
    const game = this.games.get(gameId);

    if (game) {
      game.addShips(indexPlayer, ships);
      if (Object.keys(game.boards).length === 2) {
        ws.send(
          JSON.stringify({
            type: "start_game",
            data: { ships, currentPlayerIndex: indexPlayer },
            id: 0,
          })
        );
        this.broadcastTurn(gameId, game.turn);
      }
    }
  }

  attack(ws, data) {
    const { gameId, x, y, indexPlayer } = JSON.parse(data);
    const game = this.games.get(gameId);
    if (game) {
      const result = game.attack(indexPlayer, x, y);
      this.broadcastAttackResult(gameId, indexPlayer, x, y, result);
    }
  }

  randomAttack(ws, data) {
    const { gameId, indexPlayer } = JSON.parse(data);
    const game = this.games.get(gameId);
    if (game) {
      const { x, y } = game.randomAttack(indexPlayer);
      const result = game.attack(indexPlayer, x, y);
      this.broadcastAttackResult(gameId, indexPlayer, x, y, result);
    }
  }

  broadcastAttackResult(gameId, indexPlayer, x, y, result) {
    const game = this.games.get(gameId);
    const message = {
      type: "attack",
      data: {
        position: { x, y },
        currentPlayer: indexPlayer,
        status: result,
      },
      id: 0,
    };
    game.players.forEach((player) => player.send(JSON.stringify(message)));

    if (result === "hit" || result === "miss") {
      this.broadcastTurn(gameId, game.turn);
    }
  }

  broadcastTurn(gameId, currentTurn) {
    const game = this.games.get(gameId);
    const turnMessage = {
      type: "turn",
      data: {
        currentPlayer: currentTurn,
      },
      id: 0,
    };
    game.players.forEach((player) => player.send(JSON.stringify(turnMessage)));
  }
}
