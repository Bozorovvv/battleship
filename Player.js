import { generateId } from "./utils/generateId";

export class Player {
  constructor(name, password, ws) {
    this.index = generateId();
    this.name = name;
    this.password = password;
    this.ws = ws;
    this.wins = 0;
    this.currentRoom = null;
  }

  send(type, data) {
    this.ws.send(
      JSON.stringify({
        type,
        data,
        id: 0,
      })
    );
  }

  toJSON() {
    return {
      name: this.name,
      index: this.index,
    };
  }
}
