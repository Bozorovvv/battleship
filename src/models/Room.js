export class Room {
    constructor(id){
        this.id = id
        this.players = []
    }

    addPlayer(player){
        if(this.players.length < 2){
            this.players.push(player)
            return true
        }
        return false
    }

    isReady(){
        return this.players.length === 2
    }
}