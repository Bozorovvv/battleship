import { config } from "../config.js";

export class GameService {
  static getShipCells(ship) {
    const cells = [];
    const pos = ship.position;

    if (!pos) {
      console.error("Ship position is undefined:", ship);
      return cells;
    }

    if (ship.length === 1) {
      return [{ x: pos.x, y: pos.y }];
    }

    for (let i = 0; i < ship.length; i++) {
      cells.push({
        x: ship.direction ? pos.x : pos.x + i,
        y: ship.direction ? pos.y + i : pos.y,
      });
    }

    return cells;
  }

  static processAttack(x, y, ships, shots) {
    for (const ship of ships) {
      const shipCells = this.getShipCells(ship);
      const isHit = shipCells.some((cell) => cell.x === x && cell.y === y);

      if (isHit) {
        if (ship.length === 1) {
          return { status: "killed", ship };
        }

        const isKilled = this.isShipKilled(ship, shipCells, shots);
        return {
          status: isKilled ? "killed" : "shot",
          ship: isKilled ? ship : null,
        };
      }
    }

    return { status: "miss" };
  }

  static isShipKilled(ship, shipCells, shots) {
    return shipCells.every((cell) =>
      Array.from(shots).some((shot) => {
        const [shotX, shotY] = shot.split(",").map(Number);
        return shotX === cell.x && shotY === cell.y;
      })
    );
  }

  static getSurroundingCells(ship) {
    const cells = new Set();
    const shipCells = this.getShipCells(ship);

    shipCells.forEach((shipCell) => {
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          const x = shipCell.x + dx;
          const y = shipCell.y + dy;

          if (
            x < 0 ||
            x >= config.BOARD_SIZE ||
            y < 0 ||
            y >= config.BOARD_SIZE
          )
            continue;
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

  static validateShipsPlacement(ships) {
    // Add ship placement validation logic here
    return true;
  }

  static checkGameEnd(ships, attackerShots) {
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
}
