export class Winners {
  constructor() {
    this.winners = [];
  }

  addWinner(playerName) {
    const winnerIndex = this.winners.findIndex(
      (winner) => winner.name === playerName
    );

    if (winnerIndex !== -1) {
      this.winners[winnerIndex].wins++;
    } else {
      this.winners.push({ name: playerName, wins: 1 });
    }
  }

  getWinners() {
    return this.winners;
  }
}
