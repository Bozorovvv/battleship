import { Player } from "../models/Player.js";

export class PlayerController {
  constructor() {
    this.players = new Map();
  }

  registerPlayer(ws, data) {
    const { name, password } = JSON.parse(data);
    console.log(name);
    if (this.players.has(name)) {
      ws.send(
        JSON.stringify({
          type: "reg",
          data: JSON.stringify({
            name,
            error: true,
            errorText: "Player already exist",
          }),
          id: 0,
        })
      );
    } else {
      const player = new Player(name, password);
      this.players.set(name, player);
      ws.send(
        JSON.stringify({
          type: "reg",
          data: JSON.stringify({
            name,
            index: this.players.size,
            error: false,
            errorText: "",
          }),
          id: 0,
        })
      );
    }
  }
}
