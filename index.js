'use strict';
// Dependencies.
var express = require('express');
var fs = require('fs');
var path = require('path');
var http = require('http');
var socketIO = require('socket.io');

var app = express();
app.set('strict routing', true);

var server  = app.listen(8000);

var io = socketIO(server, {path: '/lobby/socket.io', pingInterval: 5000});

// extract players name
io.use(function(socket, next){
    // return the result of next() to accept the connection.
    let pname = socket.handshake.query.player_name;
    if (typeof pname !== 'undefined' && pname && pname.toString().replace(/[^a-z0-9\s]/gi, '').trim() !== '') {
        players[socket.id] = {'id':0, 'gameid':0, 'pname':pname};
        return next();
    }
    // call next() with an Error if you need to reject the connection.
    next(new Error('Name error'));
});

app.get("/lobby/", function(req, res) {
  res.sendFile( __dirname + "/public/index.html" );
});
app.use('/lobby/', express.static(__dirname + '/public/'));


var Antiyoy = require('./antiyoy');
var antiyoy = new Antiyoy(io);

var max_nr_players = 50;
var players = {}; // object[socket.id] = {playernumber:#, gameid:#, pname:'Unnamed'}
var lobby = {}; // {'gameid': Game object}

// rooms: 0 = lobby, 1-inf = game id

function add_game(game_info){
  // {name, type, map_size}
  let name = game_info['name'];
  let type = game_info['type'];
  let map_size = game_info['map_size'];
  name     =     name.replace(/[^a-zA-Z0-9]/g,'').trim();
  type     =     type.replace(/[^a-zA-Z0-9]/g,'').trim();
  map_size = map_size.replace(/[^0-9]/g,'').trim();
  if (name == '' || type == '' || map_size == ''){
    return('Invalid input!');
  }
  // check if method exists and create new game
  if (antiyoy.available_generators().indexOf(type) > -1){
    var [board, size_x, size_y, max_players] = antiyoy['generate_'+type](map_size); //generate_square, generate_triangle
    // get index ID to use for next game
    let index = (Object.keys(lobby).length==0 ? 1 : lobby[Object.keys(lobby).sort().pop()].index+1 );
    lobby[index] = new antiyoy.Game(board, size_x, size_y, max_players);
  
    lobby[index].index = index;
    lobby[index].name = name;
    return(index);
  } else {
    return('"'+name+'" is not an available map generator!');
  }
}

function check_empty(gameid){
  if( lobby[gameid].player_count == 0 ){
    delete lobby[gameid];
    io.sockets.in('room0').emit('refresh lobby', get_refresh_lobby());
  }
}

function get_refresh_lobby(){
  return({lobby:lobby, nr_players:Object.keys(players).length});
}

io.on('connection', function(socket) {
  // Assign player number on connecting
  if (Object.keys(players).length < max_nr_players){
    socket.emit('player', players[socket.id].id);
    socket.join('room0');
    io.sockets.in('room0').emit('chat message', {id:players[socket.id].pname, message:' connected', color:players[socket.id].id});
  } else {
    // disallow player and disconnect
    socket.emit('chat message', {id:'', message:'Lobby is full! ('+max_nr_players+')', color:0});
    socket.disconnect();
  }

  socket.on('chat message', function(msg){
    recieved_chat_message(msg, socket.id);
  });

  socket.on('refresh lobby', function(){
    socket.emit('refresh lobby', get_refresh_lobby());
  });

  socket.on('join', function(gameid){
    gameid = String(gameid);
    if (Object.keys(lobby).includes(gameid)){
      let g = lobby[gameid];
      if(g.player_count < g.max_players){
        socket.emit('join accepted', gameid);
        socket.emit('chat message', {id:'Server: ', message:'You are now in game '+gameid, color:0});

        g.new_player(socket, players[socket.id].pname);
        players[socket.id].gameid = gameid;
        let p_color_id = g.players[socket.id];
        players[socket.id].id = p_color_id;
        io.sockets.in('room'+gameid).emit('chat message',
                                          {id:players[socket.id].pname, message:' joined', color:p_color_id});
        socket.join('room'+gameid);
        socket.leave('room0');
        g.send_state_spec();
        g.send_state();
      }
    }
    io.sockets.in('room0').emit('refresh lobby', get_refresh_lobby());
  });

  socket.on('new game', function(new_game_info){
    let result = add_game(new_game_info);
    if (typeof(result) == 'number') {
      io.sockets.in('room0').emit('refresh lobby', get_refresh_lobby());
      socket.emit('creation', result);
    } else {
      socket.emit('error_message', result);
    }
  });

  socket.on('leave game', function(){
    let id = players[socket.id].gameid
    if(id>0 && Object.keys(lobby).includes(id)){
      let g = lobby[id];
      socket.emit('chat message', {id:'Server: ', message:'You are now in the lobby', color:0});
      socket.leave('room'+g.index);
      io.sockets.in('room'+id).emit('chat message', {id:players[socket.id].pname, message:' left the game', color:g.players[socket.id]});
      socket.join('room0');
      g.player_leave(socket.id);
      players[socket.id].gameid = 0;
      players[socket.id].id = 0;
      check_empty(g.index);
      io.sockets.in('room0').emit('refresh lobby', get_refresh_lobby());
    }
  });

  socket.on('disconnect', function() {
    if (Object.keys(players).includes(socket.id)){
      let p = players[socket.id];
      io.sockets.in('room'+p.gameid).emit('chat message', {id:p.pname, message:' disconnected', color:players[socket.id].id});
      if(p.gameid != 0 && Object.keys(lobby).includes(p.gameid)){
        let g = lobby[p.gameid];
        g.try_resign(socket, players[socket.id].pname);
        g.player_leave(socket.id);
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
    if (g instanceof antiyoy.Game){
      if (g.players[socket.id] == g.current_players_turn){
        g.clicked_gui_undo();
      }
    }
  });
  socket.on('antiyoy structure', function() {
    let gameindex = players[socket.id].gameid;
    let g = lobby[gameindex];
    if (g instanceof antiyoy.Game){
      if (g.players[socket.id] == g.current_players_turn){
        g.clicked_gui_structure();
      }
    }
  });

  socket.on('antiyoy unit', function() {
    let gameindex = players[socket.id].gameid;
    let g = lobby[gameindex];
    if (g instanceof antiyoy.Game){
      if (g.players[socket.id] == g.current_players_turn){
        g.clicked_gui_unit();
      }
    }
  });

  socket.on('antiyoy end_turn', function() {
    let gameindex = players[socket.id].gameid;
    let g = lobby[gameindex];
    if (g instanceof antiyoy.Game){
      if (g.players[socket.id] == g.current_players_turn){
        g.clicked_gui_end_turn();
      }
    }
  });

  socket.on('antiyoy clicked_hex', function(hex_index) {
    let gameindex = players[socket.id].gameid;
    let g = lobby[gameindex];
    if (g instanceof antiyoy.Game){
      if (g.players[socket.id] == g.current_players_turn){
        g.clicked_hex(hex_index);
      }
    }
  });

  socket.on('antiyoy background', function(){
    let gameindex = players[socket.id].gameid;
    let g = lobby[gameindex];
    if (g instanceof antiyoy.Game){
      if (g.players[socket.id] == g.current_players_turn){
        g.clicked_background();
      }
    }
  });

  socket.on('antiyoy resign', function(){
    let gameindex = players[socket.id].gameid;
    let g = lobby[gameindex];
    if (g instanceof antiyoy.Game){
      g.try_resign(socket, players[socket.id].pname);
    }
  });
  // ------------------------------------------------- END antiyoy ------------------------------------------------- 

  
});

function recieved_chat_message(msg, socketid){
  if (msg != ''){
    let temp_name = Object.keys(players).includes(socketid) ? players[socketid].pname : 'spectator' ;
    let roomid = players[socketid].gameid;
    io.sockets.in('room'+roomid).emit('chat message', {id:temp_name+': ', message:msg, color:players[socketid].id});
  }
}


Math.seededRandom = function(min, max) {
    max = max || 1;
    min = min || 0;

    Math.seed = (Math.seed * 9301 + 49297) % 233280;
    let rnd = Math.seed / 233280;
 
    return(Math.floor(min + rnd * (max - min)));
}

