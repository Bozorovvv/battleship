import { Room } from "./Room";
import { generateId } from "./utils/generateId";

export class RoomManager {
  constructor() {
    this.rooms = new Map();
  }

  createRoom() {
    const id = generateId();
    const room = new Room(id);
    this.rooms.set(id, room);
    return room;
  }

  getRooom(id) {
    return this.rooms.get(id);
  }

  getAvailableRooms() {
    return Array.from(this.rooms.values())
      .filter((room) => room.players.size === 1)
      .map((room) => room.toJSON());
  }

  removeRoom(id) {
    this.rooms.delete(id);
  }
}
