// Dependencies.
var express = require('express');
var fs = require('fs');
var path = require('path');
var http = require('http');
var path = require('path');
var socketIO = require('socket.io');

var app = express();
app.set('strict routing', true);

var server  = app.listen(8000);

var io = socketIO(server, {path: '/lobby/socket.io'});


app.get("/lobby/", function(req, res) {
  res.sendFile( __dirname + "/public/index.html" );
});
app.use('/lobby/', express.static(__dirname + '/public/'));

var max_nr_players = 2;
var players = {};
var lobby = [];


function game(name, max_players, map) {
  this.id = (lobby.length==0 ? 0 : lobby[lobby.length-1].id+1);
  this.name = name;
  this.player_count = 0;
  this.max_players = max_players;
  this.board = {};
  this.map = map;
}

lobby.push(new game('Lennarts game', 2, 'map1'));
lobby.push(new game('Marks game', 3, 'map1'));


io.on('connection', function(socket) {
  // Assign player number on connecting
  if (Object.keys(players).length < max_nr_players){
    let current_players = [];
    for (let i in players){
      current_players.push(players[i]);
    }
    for (let i=1; i<=max_nr_players; i++){
      if (!current_players.includes(i)){
        players[socket.id] = i;
        break;
      }
    }
    socket.emit('player', players[socket.id]);
    io.emit('chat message', {id:'player '+players[socket.id], message:' connected', color:players[socket.id]});
  } else {
    // disallow player and disconnect
    socket.emit('chat message', {id:'', message:'Lobby is full! ('+max_nr_players+')', color:0});
    socket.disconnect();
  }

  socket.on('chat message', function(msg){
    recieved_chat_message(msg, socket.id);
  });

  socket.on('refresh lobby', function(){
    socket.emit('refresh lobby', lobby);
  });

  socket.on('disconnect', function() {
    if (Object.keys(players).includes(socket.id)){
      io.emit('chat message', {id:'player '+players[socket.id], message:' disconnected', color:players[socket.id]});
      delete players[socket.id];
    } else {
      io.emit('chat message', {id:'', message:'Unknown player disconnected', color:0});
    }
  });
});

function recieved_chat_message(msg, socketid){
    if (msg != ''){
      let temp_name = Object.keys(players).includes(socketid) ? 'player '+players[socketid] : 'spectator '+spectators[socketid] ;
      io.emit('chat message', {id:temp_name+': ', message:msg, color:players[socketid]});
    }
}

