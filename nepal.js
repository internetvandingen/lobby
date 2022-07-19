'use strict';

var fs = require('fs');

module.exports = function(io) {

this.Game = function() {
  this.players = {}; // players[socketid] = integer (player number in game)
  this.player_names = {}; // player_names[player_nr] = name
  this.player_sockets = {}; // player_sockets[player_nr] = socketid
  this.player_count = 0;
  this.defeated_players = [];
  this.spectators = {};
  this.max_players = 2;
  this.max_spectators = 1;

  // ---------------------------------- from index ----------------------------------
  this.new_player = function(socket, name){
    // Assign player number on connecting
    if (Object.keys(this.players).length < this.max_players){
      let current_players = [];
      for (let i in this.players){
        current_players.push(this.players[i]);
      }
      for (let i=1; i<=this.max_players; i++){
        if (!current_players.includes(i)){
          this.players[socket.lobby_id] = i;
          this.player_names[i] = name;
          this.player_sockets[i] = socket.id;
          break;
        }
      }
      this.player_count++;
      socket.emit('nepal player', this.players[socket.lobby_id]);
  //     if (this.players[socket.lobby_id] == this.current_players_turn){
  //       // broadcast state once for every other player
  //       this.send_state_spec();
  // // send full state to the player whose turn it is
  //       this.send_state();
  //     } else {
  //       // not first player, so only emit state once
  //       this.send_state_spec();
  //     }

    } else { //TODO: make this function return something, accepted as player or spectator, or rejected
      if (Object.keys(this.spectators) < this.max_spectators){
        // allow spectator
        let current_spectators = [];
        for (let i in this.spectators){
          current_spectators.push(this.spectators[i]);
        }
        for (let i=1; i<=this.max_spectators; i++){
          if (!current_spectators.includes(i)){
            this.spectators[socket.lobby_id] = i;
            break;
          }
        }
        socket.emit('nepal spectator', this.spectators[socket.lobby_id]);
        io.sockets.in('room'+this.index).emit('chat message', {message:'spectator '+this.spectators[socket.lobby_id]+' connected'});
        this.send_state_spec();
      } else {
        // disallow spectator and disconnect
        socket.disconnect();
      }
    }
  }

  this.player_leave = function(socketid){
    // player leaves voluntarily
    let id = this.players[socketid];
    delete this.player_sockets[id];
    delete this.player_names[id];
    delete this.players[socketid];
    this.player_count--;
    // if (this.player_count == 1){
    //   let winner = this.players[Object.keys(this.players)[0]];
    //   this.parse_winner(winner);
    // }
  }

  this.try_resign = function(socket, player_name){
    if (this.players.hasOwnProperty(socket.lobby_id) && this.current_players_turn!=0){
      let p = this.players[socket.lobby_id];
      if (p == this.current_players_turn){
        this.defeated_players.push(this.current_players_turn);
        // this.clicked_gui_end_turn();
      } else if(!this.defeated_players.includes(p)){
        this.defeated_players.push(p);
        // this.check_winner();
      }
      io.sockets.in('room'+this.index).emit('chat message', {id:player_name, message:' has resigned!', color:p});
    }
  }
}

};