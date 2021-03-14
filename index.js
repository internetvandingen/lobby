'use strict';
// Dependencies.
var express = require('express');
var fs = require('fs');
var path = require('path');
var http = require('http');
var socketIO = require('socket.io');

var app = express();
app.set('strict routing', true);

var server  = app.listen(80);

var io = socketIO(server, {pingInterval: 5000});


function parseCookie(str) {
  if (typeof str === 'undefined'){
    return({});
  }
  str = str.split('; ');
  var result = {};
  for (var i = 0; i < str.length; i++) {
    var cur = str[i].split('=');
    result[cur[0]] = cur[1];
  }
  return(result);
}


app.get("/", function(req, res) {
  let rc = parseCookie(req.headers.cookie);
  // if lobby_id cookie is not set, set one
  if (Object.keys(rc).includes('lobby_id')){
    res.sendFile( __dirname + "/public/index.html" );
  } else {
    let new_id = Math.random().toString(26).slice(2);
    res.cookie('lobby_id', new_id).sendFile( __dirname + "/public/index.html" );
  }
});

// extract players name
io.use(function(socket, next){
  let cookies = parseCookie(socket.handshake.headers['cookie']);
  socket.lobby_id = cookies.lobby_id;
  socket.reconnecting = false;
  // return the result of next() to accept the connection.
  let pname = socket.handshake.query.player_name;
  if (typeof pname !== 'undefined' && pname && pname.toString().replace(/[^a-z0-9\s]/gi, '').trim() !== '') {
    if (Object.keys(players).includes(socket.lobby_id)){
      // handle reconnect
      socket.reconnecting = true;
      players[socket.lobby_id].socketid = socket.id;
      if (Object.keys(players[socket.lobby_id]).includes('disconnect_timer')){
        clearTimeout(players[socket.lobby_id]['disconnect_timer']);
        delete players[socket.lobby_id]['disconnect_timer'];
      }
      let gameid = players[socket.lobby_id].gameid;
      if(gameid != 0 && Object.keys(lobby).includes(gameid)){
        // reconnect to game
        let g = lobby[gameid];
        let player_ingame_id = g.players[socket.lobby_id];
        g.player_sockets[player_ingame_id] = socket.id;
        socket.leave('room0');
        socket.join('room'+gameid);
        socket.emit('join accepted', gameid);
        socket.emit('chat message', {id:'Server: ', message:'You are now in game '+gameid, color:0});
        io.sockets.in('room'+gameid).emit('chat message', {
                id:players[socket.lobby_id].pname,
                message:' connected',
                color:players[socket.lobby_id].id});
        setTimeout(function(g){
          g.send_state_spec();
          g.send_state();
        }, 500, g);

      }
    } else {
      // create new player
      players[socket.lobby_id] = {'id':0, 'gameid':0, 'pname':pname, 'socketid':socket.id};
    }
    return next();
  }
  // call next() with an Error if you need to reject the connection.
  next(new Error('Player name rejected'));
});

app.use('/', express.static(__dirname + '/public/'));


var Antiyoy = require('./antiyoy');
var antiyoy = new Antiyoy(io);

var max_nr_players = 50;
var players = {}; // object[socket.lobby_id] = {playernumber:#, gameid:#, pname:'Unnamed'}
var lobby = {}; // {'gameid': Game object}

// rooms: 0 = lobby, 1-inf = game id

function add_game(game_info){
  // {name, type, map_size}
  let type = game_info['type'];
  let name = game_info['name'];

  if (type == 'antiyoy') {
    let map = game_info['map'];
    let map_size = game_info['map_size'];
    name     =     name.replace(/[^a-zA-Z0-9]/g,'').trim();
    map      =     map.replace(/[^a-zA-Z0-9]/g,'').trim();
    map_size = map_size.replace(/[^0-9]/g,'').trim();
    if (name == '' || map == '' || map_size == ''){
      return('Invalid input!');
    }
    // check if method exists and create new game
    if (antiyoy.available_generators().indexOf(map) > -1){
      var [board, size_x, size_y, max_players] = antiyoy['generate_'+map](map_size); //generate_square, generate_triangle
      let index = getNewGameId();
      lobby[index] = new antiyoy.Game(board, size_x, size_y, max_players);
      lobby[index].index = index;
      lobby[index].name = name;
      return(index);
    } else {
      return('"'+map+'" is not an available map generator!');
    }
  } else {
    return('Game of type '+type+' does not exist here...');
  }
}

function check_empty(gameid){
  // destroys game if no players are left
  if( lobby[gameid].player_count == 0 ){
    delete lobby[gameid];
    io.sockets.in('room0').emit('refresh lobby', get_refresh_lobby());
    return(true);
  }
  return(false);
}

function get_refresh_lobby(){
  return({lobby:lobby, nr_players:Object.keys(players).length});
}

io.on('connection', function(socket) {
  // Assign player number on connecting
  if (Object.keys(players).length < max_nr_players){
    socket.emit('player', players[socket.lobby_id].id);
    socket.join('room0');
    io.sockets.in('room0').emit('chat message', {id:players[socket.lobby_id].pname, message:' connected', color:players[socket.lobby_id].id});
    io.sockets.in('room0').emit('refresh lobby', get_refresh_lobby());
  } else {
    // disallow player and disconnect
    socket.emit('chat message', {id:'', message:'Lobby is full! ('+max_nr_players+')', color:0});
    socket.disconnect();
  }

  socket.on('chat message', function(msg){
    recieved_chat_message(msg, socket.lobby_id);
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

        g.new_player(socket, players[socket.lobby_id].pname);
        players[socket.lobby_id].gameid = gameid;
        let p_color_id = g.players[socket.lobby_id];
        players[socket.lobby_id].id = p_color_id;
        io.sockets.in('room'+gameid).emit('chat message',
                                          {id:players[socket.lobby_id].pname, message:' joined', color:p_color_id});
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
    let id = players[socket.lobby_id].gameid
    if(id>0 && Object.keys(lobby).includes(id)){
      let g = lobby[id];
      socket.emit('chat message', {id:'Server: ', message:'You are now in the lobby', color:0});
      socket.leave('room'+g.index);
      io.sockets.in('room'+id).emit('chat message', {id:players[socket.lobby_id].pname, message:' left the game', color:g.players[socket.lobby_id]});
      socket.join('room0');
      g.player_leave(socket.lobby_id);
      players[socket.lobby_id].gameid = 0;
      players[socket.lobby_id].id = 0;
      check_empty(g.index);
      io.sockets.in('room0').emit('refresh lobby', get_refresh_lobby());
    }
  });

  socket.on('disconnect', function() {
    if (Object.keys(players).includes(socket.lobby_id)){
      let p = players[socket.lobby_id];
      io.sockets.in('room'+p.gameid).emit('chat message', {id:p.pname, message:' disconnected', color:players[socket.lobby_id].id});
      if(p.gameid != 0 && Object.keys(lobby).includes(p.gameid)){
        let g = lobby[p.gameid];
        // keep player in memory because they might come back, but set 15s timer to destroy
        players[socket.lobby_id]['disconnect_timer'] = setTimeout( function(lobby_id) {
          let gameid = players[lobby_id].gameid;
          let g = lobby[gameid];
          io.sockets.in('room'+gameid).emit('chat message', {
              id:players[lobby_id].pname,
              message:' left the game',
              color:g.players[lobby_id]});
          g.player_leave(lobby_id);
          // check and destroy game if no players are left
          check_empty(gameid);
          delete players[lobby_id];
        }, 15000, socket.lobby_id);
      } else {
        delete players[socket.lobby_id];
      }
    } else {
      io.sockets.in('room0').emit('chat message', {id:'', message:'Unknown player disconnected', color:0});
    }
  });

  // ------------------------------------------------- START antiyoy -------------------------------------------------

  // Send images now (when connecting)
  function emit_image(socket, filename, image_name, image_number){
    fs.readFile( __dirname + '/public/assets/'+filename, function(err, buf){
      socket.emit('antiyoy image', {image: true, img_name:image_name+image_number, buffer: buf.toString('base64')});
  //    console.log('image sent: '+image_name+image_number);
    });
  }
  let image_names = {'coin':0, 'end_turn':0, 'exclamation_mark':0, 'undo':0, 'castle':0, 'farm':2, 'grave':0, 'house':0, 'man':3, 'palm':0, 'pine':0, 'tower':1, 'resign':0};
  for (let image_name in image_names){
    for (let i=0; i<=image_names[image_name];i++){
      let image_number = '';
      if (image_names[image_name] != 0){
        image_number = i;
      }
      let filename = image_name+image_number+'.png';
      emit_image(socket, filename, image_name, image_number);
    }
  }

  function get_game(lobby_id){
    let result = false;
    try{
      let gameindex = players[lobby_id].gameid;
      let g = lobby[gameindex];
      if (g instanceof antiyoy.Game){
        result = g;
      }
    } catch (err) {
      console.log(err.name+': '+err.message);
    } finally {
      return(result);
    }
  }

  socket.on('antiyoy undo', function() {
    let g = get_game(socket.lobby_id);
    if (g!=false && g.players[socket.lobby_id] == g.current_players_turn){
      g.clicked_gui_undo();
    }
  });
  socket.on('antiyoy structure', function() {
    let g = get_game(socket.lobby_id);
    if (g!=false && g.players[socket.lobby_id] == g.current_players_turn){
      g.clicked_gui_structure();
    }
  });

  socket.on('antiyoy unit', function() {
    let g = get_game(socket.lobby_id);
    if (g!=false && g.players[socket.lobby_id] == g.current_players_turn){
      g.clicked_gui_unit();
    }
  });

  socket.on('antiyoy end_turn', function() {
    let g = get_game(socket.lobby_id);
    if (g!=false && g.players[socket.lobby_id] == g.current_players_turn){
      g.clicked_gui_end_turn();
    }
  });

  socket.on('antiyoy clicked_hex', function(hex_index) {
    let g = get_game(socket.lobby_id);
    if (g!=false && g.players[socket.lobby_id] == g.current_players_turn){
      g.clicked_hex(hex_index);
    }
  });

  socket.on('antiyoy background', function(){
    let g = get_game(socket.lobby_id);
    if (g!=false && g.players[socket.lobby_id] == g.current_players_turn){
      g.clicked_background();
    }
  });

  socket.on('antiyoy resign', function(){
    let g = get_game(socket.lobby_id);
    if (g!=false){
      g.try_resign(socket, players[socket.lobby_id].pname);
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

function getNewGameId() {
  // get index ID to use for next game
  return (Object.keys(lobby).length==0 ? 1 : lobby[Object.keys(lobby).sort().pop()].index+1 );
}

Math.seededRandom = function(min, max) {
    max = max || 1;
    min = min || 0;

    Math.seed = (Math.seed * 9301 + 49297) % 233280;
    let rnd = Math.seed / 233280;

    return(Math.floor(min + rnd * (max - min)));
}

