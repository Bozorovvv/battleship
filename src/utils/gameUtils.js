export class GameUtils {
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

  static getSurroundingCells(ship) {
    const cells = new Set();
    const shipCells = GameUtils.getShipCells(ship);

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

  static validateShipsPlacement(ships) {
    return true;
  }

  static checkGameEnd(ships, attackerShots) {
    return ships.every((ship) => {
      const shipCells = GameUtils.getShipCells(ship);
      return shipCells.every((cell) =>
        Array.from(attackerShots).some((shot) => {
          const [x, y] = shot.split(",").map(Number);
          return x === cell.x && y === cell.y;
        })
      );
    });
  }
}
