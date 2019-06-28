'use strict';

var fs = require('fs');

// ------------------------------------------------- game functions ------------------------------------------------- 
module.exports = function(io) {

this.Hextile = function(x, y) {
  this.x = x;
  this.y = y;
  this.color = 0;
  this.item = 'none';
  this.rank = '';
  this.can_move = true;
  this.bank = 0;
  this.highlighted = false;
};

this.generate_square = function(n=2){
  n = Number(n);
  n = n<=2 ? 2 : n; // minimum of 2
  n = n> 7 ? 7 : n; // maximum of 7
  let max_players = 2;
  let board = {};
  let size_y = 2*n+2;
  let size_x = 4*n+1;
  for (let x=0; x<size_x; x++){
    let temp_y = x%2==0 ? size_y-1 : size_y;
    for (let y=0; y<temp_y; y++){
      board[x*size_y+y] = new this.Hextile(x, y);
    }
  }
  
  this.set_color(board, [(2*n)*size_y+1, (2*n)*size_y, (2*n-1)*size_y+1, (2*n+1)*size_y+1], 0, 1);
  this.set_color(board, [(2*n+1)*size_y-3, (2*n+1)*size_y-2, (2*n)*size_y-2, (2*n+2)*size_y-2], 0, 2);
  return([board, size_x, size_y, max_players]);
};

this.generate_triangle = function(n=6){
  n = Number(n);
  n = n<=6 ? 6 : n; // minimum of 6
  n = n>20 ? 20: n; // maximum of 20
  let max_players = 3;
  let board = {};
  let size_y = n, size_x = n;
  for (let i=0; i<n; i++){
    for (let j=0;j<n-i; j++){
      if ((i==0&&j==0) || (i==n-1&&j==0) || (i==0&&j==n-1)){continue;}
      let x = i, y = j+Math.ceil(i/2);
      board[x*size_y+y] = new this.Hextile(x, y);
    }
  }
  this.set_color(board, [1,2,1+n,2+n,2*n+1], 0, 1);
  this.set_color(board, [n-2,n-3,2*n-1,2*n-2,3*n-2], 2, 2);
  this.set_color(board, [n*(n-3)+Math.floor(n/2)-1,n*(n-3)+Math.floor(n/2),n*(n-3)+Math.floor(n/2)+1,n*(n-2)+Math.ceil(n/2),n*(n-2)+Math.ceil(n/2)-1], 4, 3);
  return([board, size_x, size_y, max_players]);
};

this.available_generators = function(){
  return(['triangle', 'square']);
};

this.set_color = function(board, arr, castle_index, color){
  for (let i in arr){
    if (Object.keys(board).includes(arr[i].toString())){
      board[arr[i]].color = color;
      if(i==castle_index){
        board[arr[i]].item = 'castle';
        board[arr[i]].bank = color==1 ? 12 : 10;
      }
    } else {
      console.log(arr[i]+' is not a valid index!');
    }
  }
};





this.Game = function(board, size_x, size_y, max_players){
  this.board = board;
  this.size_x = size_x;
  this.size_y = size_y;
  this.players = {}; // players[socketid] = integer (player number in game)
  this.player_names = {}; // player_names[player_nr] = name
  this.player_count = 0;
  this.defeated_players = [];
  this.spectators = {};
  this.max_players = max_players;
  this.max_spectators = 1;

  this.selected = null;
// if something is selected: {'index':hex_index, 'item':'man', 'rank':0, 'new':true, 'available_tiles':available_tiles}
// otherwise: 		     null

  this.board_last_turn = JSON.parse(JSON.stringify(this.board));
  this.current_players_turn = 1; // this becomes zero when the game is finished
  Math.seed = new Date().getTime();
  this.seed_history = [Math.seed];
  this.board_history = [];
  this.public_income = [];

  // constants: gameplay
  this.rules = {
    unit_move_limit : 4,
    reward_tree : 3,
    price_unit : 10,
    price_tower : [15, 35],
    price_farm : 12,
    price_farm_increase : 2,
    hex_income : 1,
    farm_income : 4,
    tax_tower : [1, 6],
    tax_unit : [2, 6, 18, 36],
    spawn_chance_pine : 0.8,
    spawn_chance_palm : 1.0
  };
  this.rules.spawn_chance_pine /= this.max_players;
  this.rules.spawn_chance_palm /= this.max_players;

  // ---------------------------------- click actions ---------------------------------- 
  this.clicked_hex = function(hex_index){
    this.remove_highlighted_tiles();
    if (this.selected == null || this.selected.item == 'none'){
      // nothing is currently selected
  
      if (this.board[hex_index].color == this.current_players_turn){
        // if tile belongs to player whos turn it is 
        let area = this.get_tiles_in_area(hex_index, [hex_index]);
        if (area.length>1){
          let money = this.get_money_status(area);
          this.selected = {'index':hex_index, 'item':'none', rank:0, 'new':false, 'available_tiles':[], 'bank':money[0], 'income':money[1]};
          if (this.board[hex_index].item == 'man'){
            // select unit on hex
            this.selected.item = this.board[hex_index].item;
            this.selected.rank = this.board[hex_index].rank;
            this.selected.price = 0;
            if (this.board[hex_index].can_move){
              let available_tiles = this.get_available_tiles_man(hex_index, this.selected.rank);
              this.highlight_tiles(available_tiles);
              this.selected.available_tiles = available_tiles;
            }
          }
        } else {
          this.selected = null;
        }
      } else {
        // clicked on hex not owned by you
        this.selected = null;
      }
  
    } else {
      // something is already selected
  
      let area = this.get_tiles_in_area(this.selected.index, [this.selected.index]);
      if (area.length>1){
        let money = this.get_money_status(area);
    
        if (this.selected.available_tiles.includes(hex_index) && money[0]>=this.selected.price){
          // clicked tile is in available tiles of selected item and we have enough money
          // store current board. Parse and stringify is to make a deep copy of an object
          this.board_history.push(JSON.parse(JSON.stringify(this.board)));
          this.seed_history.push(Math.seed);
    
          // deduce price from bank in castle
          this.board[money[2]].bank -= this.selected.price;
  
          // place item
          if (this.board[hex_index].color == this.current_players_turn && this.board[hex_index].item == 'man'){
            // place on top of existing unit
            this.board[hex_index].rank += this.selected.rank + 1;
          } else {
            // not placed on existing unit
            if (['palm', 'pine'].includes(this.board[hex_index].item)){
              this.board[money[2]].bank += this.rules.reward_tree;
            }
            this.board[hex_index].can_move = false;
            this.board[hex_index].item = this.selected.item;
            this.board[hex_index].rank = this.selected.rank;
            this.board[hex_index].bank = 0;
          }
    
          if (!this.selected.new) {
            // selected item was is not a new item, so remove unit on previous position
            this.board[this.selected.index].item = 'none';
            this.board[this.selected.index].rank = '';
          }
  
          let selected_color = this.board[hex_index].color;
    
          // change color of tile to your color in case territory was conquered
          this.board[hex_index].color = this.current_players_turn;
    
          if (![0, this.current_players_turn].includes(selected_color)){
            // conquered enemy territory, so update enemy areas
            this.update_player_areas(selected_color);
          }
          // update own areas to remove possible extra castles when combining two areas
          this.update_player_areas(this.current_players_turn);
        } else {
          this.selected = null;
        }
      }
  
      if (this.board[hex_index].color == this.current_players_turn){
        // independent wether the attempted move can be made or not, if we clicked on our color, update information
        area = this.get_tiles_in_area(hex_index, [hex_index]);
        if (area.length>1){
          let money = this.get_money_status(area);
          this.selected = {'index':hex_index, 'item':'none', 'rank':'', 'new':false, 'available_tiles':[], 'bank':money[0], 'income':money[1]};
        } else {
          this.selected = null;
        }
      } else {
        this.selected = null;
      }
    }
    this.send_state();
  }
  
  this.clicked_gui_unit = function(){
    this.remove_highlighted_tiles();
    if (this.selected.item == 'man' && this.selected.new){
      this.selected.rank = (this.selected.rank == 3 ? 0 : this.selected.rank+1);
    } else {
      this.selected.item = 'man';
      this.selected.rank = 0;
      this.selected.new = true;
    }
    this.selected.price = this.rules.price_unit*(1+this.selected.rank);
    if (this.selected.bank >= this.selected.price) {
      this.selected.available_tiles = this.get_available_tiles_new_man(this.selected.index, this.selected.rank);
      this.highlight_tiles(this.selected.available_tiles);
    }
    this.send_state();
  }
  
  this.clicked_gui_structure = function(){
    this.remove_highlighted_tiles();
    if (this.selected == null){return;}
    this.selected.available_tiles = [];
    if (this.selected.item == 'farm') {
      this.selected.item = 'tower';
      this.selected.rank = 0;
      this.selected.price = this.rules.price_tower[0];
      if (this.selected.bank >= this.selected.price) {
        this.selected.available_tiles = this.get_available_tiles_tower(this.selected.index);
      }
    } else if (this.selected.item == 'tower'){
      if (this.selected.rank == 0){
        this.selected.rank = 1;
        this.selected.price = this.rules.price_tower[1];
        if (this.selected.bank >= this.selected.price) {
          this.selected.available_tiles = this.get_available_tiles_tower(this.selected.index);
        }
      } else {
        this.selected.item = 'farm';
        this.selected.rank = Math.floor(Math.random()*3);
        this.selected.price = this.rules.price_farm + this.rules.price_farm_increase*this.get_farms_in_area(this.selected.index);
        if (this.selected.bank >= this.selected.price) {
          this.selected.available_tiles = this.get_available_tiles_farm(this.selected.index);
        }
      }
    } else {
      // selected.item = none => area is selected
      this.selected.item = 'farm';
      this.selected.rank = Math.floor(Math.random()*3);
      this.selected.new = true;
      this.selected.price = this.rules.price_farm + this.rules.price_farm_increase*this.get_farms_in_area(this.selected.index);
      if (this.selected.bank >= this.selected.price) {
        this.selected.available_tiles = this.get_available_tiles_farm(this.selected.index);
      }
    }
    this.highlight_tiles(this.selected.available_tiles);
    this.send_state();
  }
  
  this.clicked_gui_end_turn = function(){
    this.remove_highlighted_tiles();
    this.selected = null;
    this.board_history = [];
    this.seed_history = [];
  
    // check if players are defeated
    for (let i=1;i<=this.max_players;i++){
      if (!this.defeated_players.includes(i)){
        if (!this.check_player_alive(i)){
          this.defeated_players.push(i);
        }
      }
    }
    
    if (this.check_winner()) {return;}
  
    // update current player
    for (let i=1;i<=this.max_players;i++){
      this.update_current_player();
      if (!this.defeated_players.includes(this.current_players_turn)){ break; }
    }
  
    // grow trees
    let trees = this.get_tree_spawn_tiles(Object.keys(this.board));
    for (let i in trees.palms){
      this.board[trees.palms[i]].item = 'palm';
    }
    for (let i in trees.pines){
      this.board[trees.pines[i]].item = 'pine';
    }
  
    // check areas for starving units, update money, reset can_move
    let areas = this.get_areas(this.current_players_turn);
    for (let i in areas) {
      let area = areas[i];
  
      if (area.length == 1){
        // area of only one tile
        if (this.board[area[0]].item == 'man'){
          this.board[area[0]].item = 'grave';
          this.board[area[0]].rank = '';
        }
      } else {
        // at least two tiles in area
        let money = this.get_money_status(area);
        let bank = money[0], income = money[1], castle_index = money[2];
        if (bank+income < 0){
          // all units starve
          for (let i in area){
            if (this.board[area[i]].item == 'man') {
              this.board[area[i]].item = 'grave';
              this.board[area[i]].rank = '';
            }
          }
          // after units have died, reset bank amount to new income
  //        let money = this.get_money_status(area);
  //        this.board[castle_index].bank = money[1];
          // after units have died, reset bank to 0
            this.board[castle_index].bank = 0;
        } else {
          // taxes can be payed
          this.board[castle_index].bank += income;
          for (let i in area){
            this.board[area[i]].can_move = true;
          }
        }
      }
    }

    this.public_income = this.get_income();
    // update state with last players turn
    this.board_last_turn = this.parse_board(this.board);
    // broadcast state once for every player
    this.send_state_spec();
    this.send_state();
    // send notification to player who needs to make a move
    let socketid = getKeyByValue(this.players, this.current_players_turn);
    io.to(socketid).emit('notify');
  }

  this.clicked_gui_undo = function(){
    this.remove_highlighted_tiles();
    this.selected = null;
    if (this.board_history.length>0){
      this.board = this.board_history.pop();
    }
    if (this.seed_history.length>0){
      Math.seed = this.seed_history.pop();
    }
    this.send_state();
  }
  
  this.clicked_background = function(){
    this.selected = null;
    this.remove_highlighted_tiles();
    this.send_state();
  }

  this.send_state = function(winner=0) {
  // sends full information state to player whose turn it is
    let socketid = getKeyByValue(this.players, this.current_players_turn);
    io.to(socketid).emit('antiyoy state', {
      board:this.board,
      size_x:this.size_x,
      size_y:this.size_y,
      msg:'Your turn',
      selected:this.selected,
      current_players_turn:this.current_players_turn,
      public_income:this.public_income
    });
  }

  this.send_state_spec = function(winner=0){
  // broadcast partial information state to all players in room (including spectators)
    let message_string = this.player_names[this.current_players_turn]+' is next.';
    if (winner>0){
      message_string = this.player_names[winner] + ' has won!';
    }
    io.sockets.in('room'+this.index).emit('antiyoy state', {
      board:this.board,
      size_x:this.size_x,
      size_y:this.size_y,
      msg:message_string,
      selected:null,
      current_players_turn:this.current_players_turn,
      public_income:this.public_income
    });
  }

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
          this.players[socket.id] = i;
          this.player_names[i] = name;
          break;
        }
      }
      this.player_count++;
      socket.emit('antiyoy player', this.players[socket.id]);
      if (this.players[socket.id] == this.current_players_turn){
        // broadcast state once for every other player
        this.send_state_spec();
	// send full state to the player whose turn it is
        this.send_state();
      } else {
        // not first player, so only emit state once
        this.send_state_spec();
      }

    } else { //TODO: make this function return something, accepted as player or spectator, or rejected
      if (Object.keys(this.spectators) < this.max_spectators){
        // allow spectator
        let current_spectators = [];
        for (let i in this.spectators){
          current_spectators.push(this.spectators[i]);
        }
        for (let i=1; i<=this.max_spectators; i++){
          if (!current_spectators.includes(i)){
            this.spectators[socket.id] = i;
            break;
          }
        }
        socket.emit('antiyoy spectator', this.spectators[socket.id]);
        io.sockets.in('room'+this.index).emit('chat message', {message:'spectator '+this.spectators[socket.id]+' connected'});
        this.send_state_spec();
      } else {
        // disallow spectator and disconnect
        socket.disconnect();
      }
    }

    this.player_leave = function(socketid){
      let id = this.players[socketid];
      delete this.player_names[id];
      delete this.players[socketid];
      this.player_count--;
      if (this.player_count == 1){
        let winner = this.players[Object.keys(this.players)[0]];
        this.parse_winner(winner);
      }
    }

  }

  this.try_resign = function(socket, player_name){
    if (this.players.hasOwnProperty(socket.id) && this.current_players_turn!=0){
      let p = this.players[socket.id];
      if (p == this.current_players_turn){
        this.defeated_players.push(this.current_players_turn);
        this.clicked_gui_end_turn();
      } else if(!this.defeated_players.includes(p)){
        this.defeated_players.push(p);
        this.check_winner();
      }
      io.sockets.in('room'+this.index).emit('chat message', {id:player_name, message:' has resigned!', color:p});
    }
  }


  // ---------------------------------- lib ---------------------------------- 

  this.get_income = function(){
    let income = [];
    for (let i=0; i<this.max_players; i++){
      income[i] = 0;
      let areas = this.get_areas(i+1);
      for (let j=0; j<areas.length; j++){
        let area = areas[j];
        let result = this.get_money_status(area);
        //[bank, income, castle_index]
        income[i] += result[1];
      }
    }
    return(income);
  }

  this.check_winner = function(){
    let winner = this.get_winner();
    if (winner != null){
      // game is over
      this.parse_winner(winner);
      return(true);
    } else {
      return(false);
    }
  }

  this.parse_winner = function(winner){
    io.sockets.in('room'+this.index).emit('chat message', {id:this.player_names[winner], message:' has won!', color:winner});
    this.board_last_turn = this.parse_board(this.board);
    this.current_players_turn = 0; // current player to 0 so game loop stops
    this.max_players = 0; // set max players to 0 so nobody can join
    this.max_spectators = 0;
    this.send_state_spec(winner);
  }

  this.parse_board = function(board){
    // make copy of board
    let hex = JSON.parse(JSON.stringify(board));
    // remove bank information
    for (let i in hex){
      if (hex[i].item == 'castle'){
        hex[i].bank = 0;
      }
    }
    return(hex);
  }

  this.get_winner = function(){
    if (this.defeated_players.length == this.max_players-1){
      for (let i=1;i<=this.max_players;i++){
        if(!this.defeated_players.includes(i)){return(i);}
      }
    } else {
      return(null);
    }
  }

  this.update_current_player = function(){
    // update current player
    if (this.current_players_turn == this.max_players){
      this.current_players_turn = 1;
    } else {
      this.current_players_turn += 1;
    }
  }

  this.highlight_tiles = function(area){
    // area is array of indices of hextiles to highlight
    for (let i in area) {
      this.board[area[i]].highlighted = true;
    }
  },

  this.remove_highlighted_tiles = function(){
    for (let i in this.board){
      this.board[i].highlighted = false;
    }
  },

  this.get_tree_spawn_tiles = function(area) {
    let trees = {'palms':[], 'pines':[]};
    for (let i in area){
      if (this.board[area[i]].item == 'none'){
        let count_trees = this.count_trees_nearby(area[i]);
        if (this.is_coast(area[i])){
          if (count_trees[0] >= 1 && Math.random()<this.rules.spawn_chance_palm){
            trees.palms.push(area[i]);
          }
        } else {
          if (count_trees[1] >= 2 && Math.random()<this.rules.spawn_chance_pine){
            trees.pines.push(area[i]);
          }
        }
      } else if (this.board[area[i]].item == 'grave'){
          if (this.is_coast(area[i])){
          trees.palms.push(area[i]);
        } else {
          trees.pines.push(area[i]);
        }
      }
    }
    return(trees);
  }

  this.count_trees_nearby = function(hex_index){
    let neighbors = this.get_neighbor_tiles(hex_index);
    let count_palm = 0, count_pine = 0;
    for (let i in neighbors){
      if (this.board[neighbors[i]].item == 'palm') {
        count_palm += 1;
      } else if (this.board[neighbors[i]].item == 'pine'){
        count_pine += 1;
      }
    }
    return([count_palm, count_pine]);
  }


  this.get_areas = function(color){
    let areas = [];
    let passed_tiles = [];
    for (let index_str in this.board){
      let index = Number(index_str);
      if (this.board[index].color == color && !passed_tiles.includes(index)){
        let area = this.get_tiles_in_area(index, [index]);
        passed_tiles = passed_tiles.concat(area);
        areas.push(area);
      }
    }
    return(areas);
  }


  this.check_player_alive = function(playerid){
    let areas = this.get_areas(playerid);
    let active_areas = 0;
    for (let i in areas){
      let area = areas[i];
      if (Object.keys(this.get_castles(area)).length==1){
        active_areas += 1;
      }
    }
    return(active_areas>0 ? true : false);
  }

  this.update_player_areas = function(color){
    let areas = this.get_areas(color);
    for (let i in areas){
      let area = areas[i];
      if (area.length == 1){
        // area consists of one hex
        if (['castle', 'farm'].includes(this.board[area[0]].item)) {
          this.board[area[0]].item = this.is_coast(area[0]) ? 'palm' : 'pine';
          this.board[area[0]].rank = '';
          this.board[area[0]].bank = 0;
        }
      } else {
        let castles = this.get_castles(area);
        if (Object.keys(castles).length == 0) { 
          // area does not contain castle
          let empty_tiles = [];
          for (let j in area){
            if (this.board[area[j]].item == 'none'){
              empty_tiles.push(area[j]);
            }
          }
          let new_castle_tile;
          if (empty_tiles.length == 0){
            new_castle_tile = area[Math.seededRandom(0, area.length)];
          } else {
            new_castle_tile = empty_tiles[Math.seededRandom(0, empty_tiles.length)];
          }
          this.board[new_castle_tile].item = 'castle';
          this.board[new_castle_tile].rank = '';
        } else if(Object.keys(castles).length > 1){
          // area contains multiple castles
          // find which castle to keep
          let highest_bank = -999999;
          let preserve_index;
          let total_bank = 0;
          for (let j in castles){
            total_bank += castles[j].bank;
            if (castles[j].bank > highest_bank){
              highest_bank = castles[j].bank;
              preserve_index = j;
            }
          }
          // update bank values of all castles
          for (let j in castles){
            if (j==preserve_index){
              this.board[j].bank = total_bank;
            } else {
              this.board[j].item = 'none';
              this.board[j].bank = 0;
            }
          }
        }
      }
    }
  }

  this.get_farms_in_area = function(hex_index){
    let area = this.get_tiles_in_area(hex_index, [hex_index]);
    let nr_farms = 0;
    for (let i in area){
      if (this.board[area[i]].item == 'farm') { nr_farms += 1;}
    }
    return(nr_farms);
  }

  this.get_available_tiles_new_man = function(hex_index, rank){
    let available_tiles = [];
    let area = this.get_tiles_in_area(hex_index, [hex_index]);
    for (let i in area){
      let temp_areatile = this.board[area[i]];
      // tiles adjacent to area
      let temp_neighbors = this.get_neighbor_tiles(area[i]);
      for (let j in temp_neighbors){
        if (!available_tiles.includes(temp_neighbors[j]) && this.board[temp_neighbors[j]].color != temp_areatile.color){
          let tile_defence_rank = this.get_defence_rank(temp_neighbors[j]);
          if (rank == 3 || tile_defence_rank < rank) {
            available_tiles.push(temp_neighbors[j]);
          }
        }
      }
      // tiles in area
      if (this.can_place_man(temp_areatile, rank)){
        available_tiles.push(area[i]);
      }
    }
    return(available_tiles);
  }

  this.get_available_tiles_man = function(hex_index, rank){
    // return indices of tiles which selected man can move to
    let o_color = this.board[hex_index].color;
    let available_tiles = [];
    let all_area_tiles = []; // tiles already investigated
    let area_tiles = [hex_index];  // tiles investigated last move
    let foreign_tiles = [];
  
    // unit_move_limit
    for (let move=0; move<4; move++){
      let neighbors = [];
      for (let i in area_tiles) {
        let temp_neighbors = this.get_neighbor_tiles(area_tiles[i]); // tiles to be investigated
        for (let j in temp_neighbors){
          if (this.board[temp_neighbors[j]].color == o_color){
            if (!all_area_tiles.includes(temp_neighbors[j]) && !area_tiles.includes(temp_neighbors[j]) && !neighbors.includes  (temp_neighbors[j])){
              neighbors.push(temp_neighbors[j]);
              if (this.can_place_man(this.board[temp_neighbors[j]], rank)){
              //if (['none', 'palm', 'pine'].includes(board[temp_neighbors[j]].item)){
                available_tiles.push(temp_neighbors[j]);
              }
            }
          } else {
            if (!foreign_tiles.includes(temp_neighbors[j])){
              foreign_tiles.push(temp_neighbors[j]);
              if (rank == 3 || this.get_defence_rank(temp_neighbors[j]) < rank){
                available_tiles.push(temp_neighbors[j]);
              }
            }
          }
        }
      }
      all_area_tiles = all_area_tiles.concat(area_tiles);
      area_tiles = neighbors;
    }
    return(available_tiles);
  }

  this.can_place_man = function(hex_tile, rank) {
    switch(hex_tile.item){
      case 'man':
        if (rank+1 + hex_tile.rank+1<=4){
          return(true);
        }
      case 'tower':
        return(false);
      case 'castle':
        return(false);
      case 'farm':
        return(false);
      default:
        return(true);
    }
  }

  this.get_defence_rank = function(hex_index){
    // returns with which rank this tile is defended
    // hex.item -> none: -1, castle: 0, tower0: 1, tower1: 2, man([0-3]): [0-3]
    let tiles = this.get_neighbor_tiles_color(hex_index);
    tiles.push(hex_index)
    let max_rank = -1;
    for (let i in tiles) {
      let ctile = this.board[tiles[i]];
      let hex_rank = ctile.rank;
      switch(ctile.item) {
        case 'man':
          hex_rank = ctile.rank;
          break;
        case 'tower':
          hex_rank = ctile.rank+1;
          break;
        case 'castle':
          hex_rank = 0;
          break;
        default:
          hex_rank = -1;
      }
      max_rank = hex_rank > max_rank ? hex_rank : max_rank;
    }
    return(max_rank);
  }

  this.get_available_tiles_tower = function(hex_index){
    // return all tiles of area which do not have an item or it can be upgraded
    let area = this.get_tiles_in_area(hex_index, [hex_index]);
    let available_tiles = [];
    for (let i in area){
      let tile = this.board[area[i]];
      if (tile.item == 'none' || (this.selected.rank == '1' && tile.item == 'tower' && tile.rank == '0')){
        available_tiles.push(area[i]);
      }
    }
    return(available_tiles);
  }

  this.get_available_tiles_farm = function(hex_index){
    // return all tiles of area which do not have an item and are adjacent to another farm
    let area = this.get_tiles_in_area(hex_index, [hex_index]);
    let available_tiles = [];
    for (let i in area){
      if (this.board[area[i]].item == 'none'){
        let neighbors = this.get_neighbor_tiles_color(area[i]);
        for (let j in neighbors){
          if (['farm', 'castle'].includes(this.board[neighbors[j]].item)){
            available_tiles.push(area[i]);
            break;
          }
        }
      }
    }
    return(available_tiles);
  }

  this.get_money_status = function(area){
    // returns money in the bank and projected income for next turn
    let bank = 0, income = 0, castle_index = -1;
    for (let i in area){
      let tile = this.board[area[i]];
      bank += tile.bank;
      income += this.rules.hex_income;
      switch (tile.item){
        case 'none':
          break;
        case 'man':
          income -= this.rules.tax_unit[tile.rank];
          break;
        case 'farm':
          income += this.rules.farm_income;
          break;
        case 'tower':
          income -= this.rules.tax_tower[tile.rank];
          break;
        case 'palm':
          income -= this.rules.hex_income;
          break;
        case 'pine':
          income -= this.rules.hex_income;
          break;
        case 'castle':
          castle_index = area[i];
          break;
      }
    }
    return([bank, income, castle_index]);
  }

  this.get_tiles_in_area = function(tile_index, area_tiles = []){
    // returns all tiles in area
    let neighbors = this.get_neighbor_tiles_color(tile_index);
    let new_area_tiles = [];
    for (let i in neighbors){
      if (!area_tiles.includes(neighbors[i])){
        new_area_tiles.push(neighbors[i]);
      }
    }
    area_tiles = area_tiles.concat(new_area_tiles)
    for (let i in new_area_tiles){
      area_tiles = this.get_tiles_in_area(new_area_tiles[i], area_tiles);
    }
    return(area_tiles);
  }
  
  this.get_neighbor_tiles = function(centertile_index){
    // returns indices of all tiles neihbouring centertile that exist on the board
    let c = this.index_to_coord(centertile_index);
    let x = c[0];
    let y = c[1];
    let diff = x%2==1 ? -1: 1;
    let tile_coordinates = [[x-1, y],[x-1,y+diff], [x,y-1], [x,y+1], [x+1,y], [x+1,y+diff]];
    let tile_indices = [];
    for (let i in tile_coordinates){
      let coord = tile_coordinates[i];
      let index = this.coord_to_index(coord);
      if(coord[0]>=0 && coord[1]>=0 && coord[0]<this.size_x && coord[1] < this.size_y && this.board.hasOwnProperty(index)){
        tile_indices.push(index);
      }
    }
    return(tile_indices);
  }
  
  this.get_neighbor_tiles_color = function(centertile_index){
    // returns indices of all tiles neighboring centertile that exist on the board and have the same color
    let c = this.index_to_coord(centertile_index);
    let x = c[0];
    let y = c[1];
    let diff = x%2==1 ? -1: 1;
    let tile_coordinates = [[x-1, y],[x-1,y+diff], [x,y-1], [x,y+1], [x+1,y], [x+1,y+diff]];
    let tile_indices = [];
    for (let i in tile_coordinates){
      let coord = tile_coordinates[i];
      let index = this.coord_to_index(coord);
      if(coord[0]>=0 && coord[1]>=0 && coord[0]<this.size_x && coord[1] < this.size_y && this.board.hasOwnProperty(index) && this.board[index].color == this.board[centertile_index].color){
        tile_indices.push(index);
      }
    }
    return(tile_indices);
  }
  
  
  this.get_castles = function(area){
    let castles = {};
    for (let i in area) {
      if (this.board[area[i]].item == 'castle'){
        castles[area[i]] = this.board[area[i]];
      }
    }
    return(castles);
  }
  
  this.is_coast = function(hex_index){
    let neighbors = this.get_neighbor_tiles(hex_index);
    return(neighbors.length < 6 ? true : false);
  },
  
  this.index_to_coord = function(index){
    let x = Math.floor(index/this.size_y);
    let y = index%this.size_y;
    return([x,y]);
  },
  
  this.coord_to_index = function(coord){
    return(coord[0]*this.size_y + coord[1]);
  }

  this.public_income = this.get_income();
}

};



function getKeyByValue(object, value) {
  return Object.keys(object).find(key => object[key] === value);
}

