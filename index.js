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


var Antiyoy = require('./antiyoy');
var antiyoy = new Antiyoy(io);

var max_nr_players = 50;
var players = {}; // {'id':#, 'gameid':#}
var lobby = {}; // {'gameid': Game object}

// rooms: 0 = lobby, 1-inf = game id

// Minimal attributes of game
//function Game(index, name, max_players, map) {
//  this.index = index;
//  this.name = name;
//  this.player_count = 0;
//  this.players = {};
//  this.max_players = max_players;
//  this.board = {};
//  this.map = map;
//  this.new_player = function(socket){}
//}

function add_game(name, max_players, map, map_size=8){
  let index = (Object.keys(lobby).length==0 ? 1 : lobby[Object.keys(lobby).sort().pop()].index+1 );

  var [board, size_x, size_y, max_players] = antiyoy.generate_triangle(map_size); //generate_square, generate_triangle
  lobby[index] = new antiyoy.Game(board, size_x, size_y, max_players);

  lobby[index].index = index;
  lobby[index].player_count = 0;
  lobby[index].name = name;
}

add_game('Lennarts game', 2, 'map1');
add_game('Marks game', 3, 'map1');


function check_empty(gameid){
  if( lobby[gameid].player_count == 0 ){
    delete lobby[gameid];
    io.sockets.in('room0').emit('refresh lobby', lobby);
  }
}

io.on('connection', function(socket) {
  // Assign player number on connecting
  if (Object.keys(players).length < max_nr_players){
    let current_players = [];
    for (let i in players){
      current_players.push(players[i].id);
    }
    for (let i=1; i<=max_nr_players; i++){
      if (!current_players.includes(i)){
        players[socket.id] = {'id':i, 'gameid':0};
        break;
      }
    }
    socket.emit('player', players[socket.id].id);
    socket.join('room0');
    io.sockets.in('room0').emit('chat message', {id:'player '+players[socket.id].id, message:' connected', color:players[socket.id].id});
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

  socket.on('join', function(gameid){
    let g = lobby[gameid];
    if(g.player_count < g.max_players){
      socket.emit('join accepted', gameid);
      socket.emit('chat message', {id:'Server: ', message:'You are now in game '+gameid, color:0});
      io.sockets.in('room'+gameid).emit('chat message',
                                        {id:'player '+players[socket.id].id, message:' joined', color:players[socket.id].id});
      socket.join('room'+gameid);
      socket.leave('room0');

      g.new_player(socket);
      players[socket.id].gameid = gameid;
      g.player_count++;
//      socket.emit('state', g);
    }
  });

  socket.on('new game', function(){
    attempt_create_game();
  });

  socket.on('leave game', function(){
    let id = players[socket.id].gameid
    if(id>0){
      let g = lobby[id];
      delete g.players[socket.id];
      g.player_count--;
      players[socket.id].gameid = 0;
      socket.emit('chat message', {id:'Server: ', message:'You are now in the lobby', color:0});
      socket.leave('room'+g.index);
      socket.join('room0');
      check_empty(g.index);
    }
  });

  socket.on('disconnect', function() {
    if (Object.keys(players).includes(socket.id)){
      let p = players[socket.id];
      io.sockets.in('room'+p.gameid).emit('chat message', {id:'player '+p.id, message:' disconnected', color:players[socket.id].id});
      if(p.gameid != 0){
        let g = lobby[p.gameid];
        delete g.players[socket.id];
        g.player_count--;
        g.try_resign(socket);
        check_empty(g.index);
      }
      delete players[socket.id];
    } else {
      io.sockets.in('room0').emit('chat message', {id:'', message:'Unknown player disconnected', color:0});
    }
  });

  // ------------------------------------------------- START antiyoy ------------------------------------------------- 
  socket.on('antiyoy undo', function() {
    let gameindex = players[socket.id].gameid;
    let g = lobby[gameindex];
    if (g.players[socket.id] == g.current_players_turn){
      g.clicked_gui_undo();
    }
  });
  socket.on('antiyoy structure', function() {
    let gameindex = players[socket.id].gameid;
    let g = lobby[gameindex];
    if (g.players[socket.id] == g.current_players_turn){
      g.clicked_gui_structure();
    }
  });

  socket.on('antiyoy unit', function() {
    let gameindex = players[socket.id].gameid;
    let g = lobby[gameindex];
    if (g.players[socket.id] == g.current_players_turn){
      g.clicked_gui_unit();
    }
  });

  socket.on('antiyoy end_turn', function() {
    let gameindex = players[socket.id].gameid;
    let g = lobby[gameindex];
    if (g.players[socket.id] == g.current_players_turn){
      g.clicked_gui_end_turn();
    }
  });

  socket.on('antiyoy clicked_hex', function(hex_index) {
    let gameindex = players[socket.id].gameid;
    let g = lobby[gameindex];
    if (g.players[socket.id] == g.current_players_turn){
      g.clicked_hex(hex_index);
    }
  });

  socket.on('background', function(){
    let gameindex = players[socket.id].gameid;
    let g = lobby[gameindex];
    if (g.players[socket.id] == g.current_players_turn){
      g.clicked_background();
    }
  });

  socket.on('antiyoy resign', function(){
    let gameindex = players[socket.id].gameid;
    let g = lobby[gameindex];
    g.try_resign(socket);
  });
  // ------------------------------------------------- END antiyoy ------------------------------------------------- 

  
});

function recieved_chat_message(msg, socketid){
  if (msg != ''){
    let temp_name = Object.keys(players).includes(socketid) ? 'player '+players[socketid].id : 'spectator '+spectators[socketid] ;
    let roomid = players[socketid].gameid;
    io.sockets.in('room'+roomid).emit('chat message', {id:temp_name+': ', message:msg, color:players[socketid].id});
  }
}

function attempt_create_game() {
  add_game('Lennarts game', 2, 'map1');
}


Math.seededRandom = function(min, max) {
    max = max || 1;
    min = min || 0;

    Math.seed = (Math.seed * 9301 + 49297) % 233280;
    let rnd = Math.seed / 233280;
 
    return(Math.floor(min + rnd * (max - min)));
}

