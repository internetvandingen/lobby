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

var max_nr_players = 50;
var players = {}; // {'id':#, 'gameid':#}
var lobby = [];


function Game(name, max_players, map) {
  this.id = (lobby.length==0 ? 0 : lobby[lobby.length-1].id+1);
  this.name = name;
  this.player_count = 0;
  this.players = {};
  this.max_players = max_players;
  this.board = {};
  this.map = map;
  this.turn = 1;
}

lobby.push(new Game('Lennarts game', 2, 'map1'));
lobby.push(new Game('Marks game', 3, 'map1'));


io.on('connection', function(socket) {
  // Assign player number on connecting
  if (Object.keys(players).length < max_nr_players){
    let current_players = [];
    for (let i in players){
      current_players.push(players[i].id);
    }
    for (let i=1; i<=max_nr_players; i++){
      if (!current_players.includes(i)){
        players[socket.id] = {'id':i, 'gameid':-1};
        break;
      }
    }
    socket.emit('player', players[socket.id].id);
    io.emit('chat message', {id:'player '+players[socket.id].id, message:' connected', color:players[socket.id].id});
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

  socket.on('join', function(game_id){
    let available = attempt_join(socket.id, game_id);
    if(available){
      socket.emit('join accepted', game_id);
//      socket.emit('state', lobby[game_id]);
    }
  });

  socket.on('new game', function(){
    console.log('player '+players[socket.id].id+' made new game');
    attempt_create_game();
  });

  socket.on('disconnect', function() {
    if (Object.keys(players).includes(socket.id)){
      io.emit('chat message', {id:'player '+players[socket.id].id, message:' disconnected', color:players[socket.id].id});
      delete players[socket.id];
    } else {
      io.emit('chat message', {id:'', message:'Unknown player disconnected', color:0});
    }
  });
});

function recieved_chat_message(msg, socketid){
  if (msg != ''){
    let temp_name = Object.keys(players).includes(socketid) ? 'player '+players[socketid].id : 'spectator '+spectators[socketid] ;
    io.emit('chat message', {id:temp_name+': ', message:msg, color:players[socketid].id});
  }
}

function attempt_join(socket_id, game_id) {
  console.log('player ' + players[socket_id] + ' tried to join ' + game_id);
  return(true);
}

function attempt_create_game() {
  lobby.push(new Game('Lennarts game', 2, 'map1'));
}

function join_game(game, socketid, gameid) {
  players[socketid].gameid = gameid;
  game.players[socketid] = players[socketid];
}

