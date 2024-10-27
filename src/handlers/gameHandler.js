import { games, players, winners } from "../models/store.js";
import { GameUtils } from "../utils/gameUtils.js";

export class GameHandler {
  static handleAttack(ws, messageHandler, data) {
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

    if (
      GameHandler.isCellHit(x, y, gameId, game.players.indexOf(attackingPlayer))
    ) {
      console.error("'attack'", "Position already attacked");
      return;
    }

    attackingPlayer.shots.add(`${x},${y}`);
    const attackResult = GameHandler.processAttack(x, y, defendingPlayer.ships);

    game.players.forEach((p) => {
      if (!p.isBot) {
        const playerWs = players.get(p.name).ws;
        if (playerWs) {
          messageHandler.send(playerWs, "attack", {
            position: { x, y },
            currentPlayer: indexPlayer,
            status: attackResult.status,
          });
        }
      }
    });

    if (attackResult.status === "killed") {
      GameHandler.handleShipKilled(
        game,
        attackResult.ship,
        attackingPlayer,
        indexPlayer,
        messageHandler
      );

      if (
        GameUtils.checkGameEnd(defendingPlayer.ships, attackingPlayer.shots)
      ) {
        GameHandler.handleGameEnd(game, attackingPlayer, messageHandler);
        return;
      }
    }

    if (attackResult.status === "miss") {
      game.currentPlayer = (game.currentPlayer + 1) % 2;
    }

    messageHandler.broadcastTurn(game);

    if (game.status === "playing" && game.players[game.currentPlayer].isBot) {
      GameHandler.makeBotMove(game, messageHandler);
    }
  }

  static handleShipKilled(
    game,
    ship,
    attackingPlayer,
    indexPlayer,
    messageHandler
  ) {
    const surroundingCells = GameUtils.getSurroundingCells(ship);

    surroundingCells.forEach((cell) => {
      if (
        !GameHandler.isCellHit(
          cell.x,
          cell.y,
          game.id,
          game.players.indexOf(attackingPlayer)
        )
      ) {
        attackingPlayer.shots.add(`${cell.x},${cell.y}`);

        game.players.forEach((p) => {
          if (!p.isBot) {
            const playerWs = players.get(p.name).ws;
            if (playerWs) {
              messageHandler.send(playerWs, "attack", {
                position: { x: cell.x, y: cell.y },
                currentPlayer: indexPlayer,
                status: "miss",
              });
            }
          }
        });
      }
    });
  }

  static handleGameEnd(game, winner, messageHandler) {
    game.status = "finished";

    game.players.forEach((p) => {
      if (!p.isBot) {
        const playerWs = players.get(p.name).ws;
        if (playerWs) {
          messageHandler.send(playerWs, "finish", {
            winPlayer: winner.gameId,
          });
        }
      }
    });

    if (!winner.isBot) {
      messageHandler.updateWinners(winner.name);
    }
  }

  static processAttack(x, y, ships) {
    for (const ship of ships) {
      const shipCells = GameUtils.getShipCells(ship);
      const isHit = shipCells.some((cell) => cell.x === x && cell.y === y);

      if (isHit) {
        if (ship.length === 1) {
          return { status: "killed", ship };
        }

        const isKilled = GameHandler.isShipKilled(ship, ships);
        return {
          status: isKilled ? "killed" : "shot",
          ship: isKilled ? ship : null,
        };
      }
    }

    return { status: "miss" };
  }

  static isShipKilled(ship, ships) {
    const game = GameHandler.findGameByShip(ship);
    if (!game) return false;

    const attackingPlayer = game.players[game.currentPlayer];
    if (!attackingPlayer) return false;

    const shipCells = GameUtils.getShipCells(ship);
    return shipCells.every((cell) =>
      Array.from(attackingPlayer.shots).some((shot) => {
        const [shotX, shotY] = shot.split(",").map(Number);
        return shotX === cell.x && shotY === cell.y;
      })
    );
  }

  static findGameByShip(ship) {
    for (const game of games.values()) {
      for (const player of game.players) {
        if (player.ships.some((s) => s === ship)) {
          return game;
        }
      }
    }
    return null;
  }

  static isCellHit(x, y, gameId, indexPlayer) {
    const game = games.get(gameId);
    if (!game) return false;

    const player = game.players[indexPlayer];
    if (!player) return false;

    return player.shots.has(`${x},${y}`);
  }

  static makeBotMove(game, messageHandler) {
    const botPlayer = game.players.find((p) => p.isBot);
    let x, y;

    do {
      x = Math.floor(Math.random() * 10);
      y = Math.floor(Math.random() * 10);
    } while (botPlayer.shots.has(`${x},${y}`));

    setTimeout(() => {
      GameHandler.handleAttack(
        null,
        messageHandler,
        JSON.stringify({
          gameId: game.id,
          x,
          y,
          indexPlayer: botPlayer.gameId,
        })
      );
    }, 1000);
  }
}
