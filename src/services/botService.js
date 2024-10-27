import { GameUtils } from "../utils/gameUtils.js";

export class BotService {
  static generateBotShips() {
    const ships = [];
    const shipLengths = [4, 3, 3, 2, 2, 2, 1, 1, 1, 1];
    const usedCells = new Set();

    for (const length of shipLengths) {
      let ship;
      do {
        ship = BotService.generateRandomShip(length);
      } while (!BotService.isValidBotShipPlacement(ship, usedCells));

      const shipCells = GameUtils.getShipCells(ship);
      shipCells.forEach((cell) => usedCells.add(`${cell.x},${cell.y}`));
      ships.push(ship);
    }

    return ships;
  }

  static generateRandomShip(length) {
    const direction = Math.random() < 0.5;
    let x, y;

    if (direction) {
      x = Math.floor(Math.random() * 10);
      y = Math.floor(Math.random() * (11 - length));
    } else {
      x = Math.floor(Math.random() * (11 - length));
      y = Math.floor(Math.random() * 10);
    }

    return {
      length,
      position: { x, y },
      direction,
    };
  }

  static isValidBotShipPlacement(ship, usedCells) {
    const shipCells = GameUtils.getShipCells(ship);

    if (
      shipCells.some(
        (cell) => cell.x < 0 || cell.x >= 10 || cell.y < 0 || cell.y >= 10
      )
    ) {
      return false;
    }

    for (const cell of shipCells) {
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          const checkX = cell.x + dx;
          const checkY = cell.y + dy;
          if (usedCells.has(`${checkX},${checkY}`)) {
            return false;
          }
        }
      }
    }

    return true;
  }
}
