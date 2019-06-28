// constants: general
var player_id;
var prefix_player_id;
var audio = new Audio('assets/notify.mp3');
var latency = '';
var disc_timeout;


// constants: canvas
var context = canvas.getContext('2d');

var player_name = '';
while($.trim(player_name.replace(/[^a-z0-9\s]/gi, '')) == ''){
  player_name = prompt("Please enter your name");
}
player_name = $.trim(player_name.replace(/[^a-z0-9\s]/gi, ''));

// -------------------------------------------------  socket communication ------------------------------------------------- 
var socket = io.connect({path: "/lobby/socket.io", query: 'player_name='+player_name});
socket.on('player', function(id) {
  player_id = id;
  prefix_player_id = 'p';
});


$(function () {
// -------------------------------------------------  chat communication ------------------------------------------------- 
  $('form').submit(function(e){
    e.preventDefault(); // prevents page reloading
    socket.emit('chat message', $('#m').val());
    $('#m').val('');
    return false;
  });

  socket.emit('refresh lobby');

  socket.on('chat message', function(msg){
    let cur_date = new Date();
    $('#messages')
      .append( $('<li>')
        .append($('<span>').text((cur_date.getHours()<10?'0':'')+cur_date.getHours()+':'+(cur_date.getMinutes()<10?'0':'')+cur_date.getMinutes() + '  '))
        .append($('<span>').attr('c', msg.color).text(msg.id))
        .append($('<span>').text(msg.message))
      );
    $('#messages li span:nth-child(3n+2)').attr('style', function(){ return 'color:'+colors[$(this).attr('c')]; });
    // scroll down
    $('#messages').scrollTop($('#messages').prop('scrollTopMax'))
  });

// -------------------------------------------------  lobby communication ------------------------------------------------- 
  socket.on('refresh lobby', function(data) {
    // update nr of players connected
    let nr_players = data.nr_players;
    $('.lobby_players').text('players ('+nr_players+')');

    let lobby = data.lobby;
    let keys = Object.keys(lobby);
    // remove all rows in table
    $('.tbody').empty();
    // add lobby data
    for (let i=0; i<keys.length; i++){
      $('.tbody').append($('<div class="row drop button">')
        .append($('<div class="el">').text(lobby[keys[i]].index))
        .append($('<div class="el">').text(lobby[keys[i]].name))
        .append($('<div class="el">').text(lobby[keys[i]].player_count+'/'+lobby[keys[i]].max_players))
        .append($('<div class="el">').append($('<i class="material-icons">').text('keyboard_arrow_down')))
        .append($('<div class="clear">'))
      );
      $('.tbody').append($('<div class="gameinfo">')
        .append($('<div class="join button">').text('Join'))
        .append($('<div class="map">').text(lobby[keys[i]].map))
        .append($('<div class="clear">'))
      );
    }
    $('.drop').click(function() {
      $(this).next().slideToggle(200);
    });
    $('.join').click(function() {
      socket.emit('join', $(this).parent().prev().children(":first").text());
    });
  });

  socket.on('join accepted', function(game_id){
    $('ul').empty();
    $('canvas').show();
    $('#lobby').hide();
  });

  $('.refresh').click(function() { socket.emit('refresh lobby'); });
  $('.new').click(function() { $("#dialog").dialog('open'); });
  $('.return_icon').click(function() {
    if (confirm('Are you sure you want to leave the game?')) {
      $('ul').empty();
      $('canvas').hide();
      $('#lobby').show();
      socket.emit('leave game');     
    }
  });

  $('.menu_info_icon').click(function(){
    $('.menu_info').toggle();
    $('ul').toggle();
  });

  $("#dialog").dialog({
        autoOpen: false,
        resizable: false,
        modal: true,
        width:'auto',
        buttons:{'create': function(){
          let game_name = $('input[name=game_name]').val();
          let game_size = $('input[name=game_size]').val();
          let game_map  = $('select').val();
          if (game_name != '' && game_map != '' && game_size>1){
            socket.emit('new game', {'name':game_name, 'type':game_map, 'map_size':game_size});
            $(this).dialog("close");
          }
        }},
        open: function(){ 
          $('.ui-widget-overlay').bind('click',function(){
            $('#dialog').dialog('close');
          })
        }
  });
  $(window).on("resize", draw_state);

  socket.on('creation', function(index) {
    socket.emit('join', index);
  });
  socket.on('error_message', function(error_msg) {
    alert(error_msg);
  });
  socket.on('notify', function(){
    if ($('.menu_info input.notify_sound').is(":checked")){
      audio.play();
    }
  });
  socket.on('pong', function(pong){
    let pong_el = $('.latency span');
    pong_el.text(pong+' ms');
    // refresh disconnected check
    clearTimeout(disc_timeout);
    disc_timeout = setTimeout(function(){pong_el.text('disc.');}, 10000)
  });
});




// ------------------------------------------------- antiyoy ------------------------------------------------- 

// variables: canvas
var display_size = 0; // 0, 1, 2 => lowest(small), low(medium), normal (large)
var size_gui_icon = [40, 80, 120][display_size],
    size_gui_font = [25, 50, 80][display_size],
    hex_r = [22, 40, 80][display_size];

var image_height = [32, 64, 128];
var colors =        ['grey',    '#f06043', '#4585e5', '#7df73f', '#2ef5e1', '#fdf836', '#e117d4', '#ffb416']
var border_colors = ['#686767', '#e54d2e', '#2463ce', '#43b929', '#13dac4', '#e6c911', '#b90aae', '#f59109']

var holdStart;
var pos_last = null;
var pos_offset = [3*hex_r, size_gui_icon+hex_r];
var pos_moved = false;

var images = {};
var background_color = "#28286d";

// variables: game
var hexboard = {};
var size_x = 0;
var size_y = 0;
var selected = null;
var message = '';
var game_over = false;
var public_income = [];
var show_public_income = false;

// -------------------------------------------------  socket communication ------------------------------------------------- 
socket.on('antiyoy image', function(info) {
  if (info.image) {
    let img_temp = new Image();
    img_temp.src = 'data:image/png;base64,' + info.buffer;
    images[info.img_name] = img_temp;
  }
  draw_state();
});

socket.on('antiyoy player', function(id) {
  player_id = id;
  prefix_player_id = 'p';
});

socket.on('antiyoy spectator', function(id) {
  prefix_player_id = 's'+id;
  player_id = '';
});

socket.on('antiyoy state', function(state) {
  hexboard = state.board;
  size_x = state.size_x;
  size_y = state.size_y;
  message = state.msg;
  selected = state.selected;
  current_players_turn = state.current_players_turn;
  public_income = state.public_income;
  draw_state();
});

function clicked_gui_resign(){    socket.emit('antiyoy resign');             }
function clicked_gui_undo(){      socket.emit('antiyoy undo');               }
function clicked_gui_structure(){ socket.emit('antiyoy structure');          }
function clicked_gui_unit(){      socket.emit('antiyoy unit');               }
function clicked_gui_end_turn(){  socket.emit('antiyoy end_turn');           }
function clicked_hex(index){      socket.emit('antiyoy clicked_hex', index); }
function clicked_background(){    socket.emit('antiyoy background');         }

// -------------------------------------------------  event listeners -------------------------------------------------

canvas.onmousedown = function(event) {
  click_start(event.pageX, event.pageY);
  return false;
};
canvas.addEventListener('touchstart', function(event) {
  click_start(event.touches[0].pageX, event.touches[0].pageY);
  event.preventDefault();
});


canvas.onmousemove = function(event) {
  click_move(event.pageX, event.pageY);
  return false;
};
canvas.addEventListener('touchmove', function(event) {
  click_move(event.touches[0].pageX, event.touches[0].pageY);
  event.preventDefault();
});


canvas.onmouseup = function(event) {
  click_end();
  return false;
};
canvas.addEventListener('touchend', function(event) {
  click_end();
  event.preventDefault();
});


function click_start(x, y){
  holdStart = Date.now();
  pos_last = [x,y];
}

function click_move(x, y){
  if (pos_last != null && Date.now()-holdStart>70){
    pos_offset[0] = pos_offset[0]+x-pos_last[0];
    pos_offset[1] = pos_offset[1]+y-pos_last[1];
    pos_last = [x,y];
    pos_moved = true;
    draw_state();
  }
}

function click_end(){
  let x = pos_last[0], y = pos_last[1];
  pos_last = null;
  if (pos_moved){
    pos_moved = false;
  } else {
    if (y>canvas.height-size_gui_icon){
      if (x<size_gui_icon){
        // clicked undo
        selected = null;
        clicked_gui_undo();
      } else if (x>canvas.width/3-size_gui_icon/2 && x<canvas.width/3+size_gui_icon/2) {
        if (selected != null){
          // clicked structure
          clicked_gui_structure();
        }
      } else if (x>canvas.width*2/3-size_gui_icon/2 && x<canvas.width*2/3+size_gui_icon/2){
        if (selected != null){
          // clicked gui unit
          clicked_gui_unit();
        }
      } else if (x>canvas.width-size_gui_icon){
        // clicked end turn
        selected = null;
        clicked_gui_end_turn();
      } else {
        selected = null;
      }
    } else if (y<size_gui_icon && x<size_gui_icon){
      // clicked money
      show_public_income = !show_public_income;
    } else if (x>canvas.width-size_gui_icon){
      if (y<size_gui_icon){
        // toggle display size
        display_size = display_size==2 ? 0 : display_size+1;
        size_gui_icon = [40, 80, 120][display_size];
        size_gui_font = [20, 50, 80][display_size];
        hex_r = [22, 40, 80][display_size];
      } else if (y<canvas.height/2+size_gui_icon/2 && y>canvas.height/2-size_gui_icon/2 && game_over==false){
        if (confirm('Are you sure you want to resign?')) {
          clicked_gui_resign();
          game_over = true;
        }
      }
    } else {
      // get coordinates of clicked hex
      let x_int = Math.round((x-pos_offset[0])/(hex_r*3/2));
      let y_int = (y-pos_offset[1])/(hex_r*Math.sqrt(3));
      if (x_int%2 == 1){
        y_int += 0.5;
      }
      y_int = Math.round(y_int);
  
      // if clicked on hex in board:
      let index = coord_to_index([x_int,y_int]);
      if (x_int>=0 && y_int>=0 && x_int<size_x && y_int<size_y && hexboard.hasOwnProperty(index)){
        clicked_hex(index);
      } else {
        clicked_background();
      }
    }
  }
  draw_state();
}

// ------------------------------------------------- draw functions -------------------------------------------------

function index_to_coord(index){
  x = Math.floor(index/size_y);
  y = index%size_y;
  return([x,y]);
}

function coord_to_index(coord){
  return(coord[0]*size_y + coord[1]);
}

function draw_state() {
  let state = hexboard;
  canvas.width = context.canvas.clientWidth;
  canvas.height = context.canvas.clientHeight;

  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = background_color;
  context.fillRect(0, 0, canvas.width, canvas.height);
  // draw hexboard
  for (let key in state) {
    y = state[key].y;
    x = state[key].x;
    if (x%2 == 1){
      y -= 0.5;
    }
    x_coord = pos_offset[0]+hex_r*x*3/2;
    y_coord = pos_offset[1]+hex_r*y*Math.sqrt(3);
    // draw hexagon
    let color_index = state[key].color;
    draw_hex_tile(context, x_coord, y_coord, colors[color_index], border_colors[color_index]);

    // don't drawin tile index
    //context.fillStyle = 'black';
    //context.fillText(key, x_coord, y_coord);

    if (state[key].item != 'none'){
      // draw item on hex tile
      let img = images[state[key].item+state[key].rank];
      let size_pixels = image_height[display_size];
      try{
        context.drawImage(img,
                          x_coord - size_pixels/2,
                          y_coord - size_pixels/7*4,
                          size_pixels,
                          size_pixels);
      } catch(TypeError){
//        console.log('Not all images are loaded!');
      }
      if (current_players_turn == player_id   &&
          state[key].color == player_id       &&
          ((state[key].item=='man' && state[key].can_move)  ||  state[key].bank >= 10)
         ){
        // draw exclamation mark for units/structures that have available actions
        try{
          context.drawImage(images.exclamation_mark, 
                            x_coord - hex_r*0.65,
                            y_coord - hex_r, 
                            hex_r/2,
                            hex_r);
        } catch(TypeError){
//          console.log('Not all images are loaded!');
        }
      }
    }
    if (state[key].highlighted) {
      // highlight hex tile
      let rect_width = Math.floor(hex_r/5);
      context.beginPath();
      context.fillStyle = 'black';
      context.rect(x_coord-1, y_coord-1, rect_width, rect_width);
      context.fill();
    }
  }

  // display message and player# in screen
  context.font = size_gui_font+"px Arial";
  // display player number right corner
  context.textAlign = "right";
  let p_text = prefix_player_id+player_id;
  let p_x = canvas.width-size_gui_font/3;
  let p_y = size_gui_icon/2+size_gui_font/3;
  context.lineWidth = size_gui_icon/20;
  context.strokeStyle = 'black';
  context.strokeText(p_text, p_x, p_y)
  context.fillStyle = colors[player_id];
  context.fillText(p_text, p_x, p_y);
  // display message
  context.fillStyle = 'white';
  context.textAlign = "center";
  context.fillText(message, canvas.width/2, size_gui_icon/2+size_gui_font/3);
  
  // draw gui
  try{
    context.drawImage(images['coin'], 0, 0, size_gui_icon, size_gui_icon);
  } catch(TypeError){
//    console.log('Not all images are loaded!');
  }
  if(show_public_income){
    context.beginPath();
    context.rect(size_gui_icon, size_gui_icon, canvas.width/5, size_gui_font*(0.3+public_income.length));
    context.fillStyle = "white";
    context.fill();
    let max_inc = 1;
    for (let i=0; i<public_income.length; i++){if(public_income[i]>max_inc){max_inc = public_income[i];}}
    for (let i=0; i<public_income.length; i++){
      context.fillStyle = colors[i+1];
      context.fillText(public_income[i], size_gui_icon+size_gui_font, size_gui_icon+(i+1)*size_gui_font);
      context.beginPath();
      let public_income_max = Math.max(0.05, public_income[i]);
      context.rect(size_gui_icon+size_gui_font*2, // x
                   size_gui_icon+(i+0.15)*size_gui_font, // y
                   (canvas.width/5-size_gui_font*5/2)*public_income_max/max_inc,  // width
                   size_gui_font*0.9);  // height
      context.fill()
    }
  }
  if (prefix_player_id == 'p'){
    if (selected != null) {
      // draw price of placable unit
      context.textAlign = "center";
      if (selected.price != null){
        context.fillStyle = "white";
        context.fillText('$'+selected.price, canvas.width/2, canvas.height-size_gui_icon/2+size_gui_font/3);
      }

      // if an area is selected, draw money, placeable items
      let img_structure = 'house'
      let img_unit_append = 0;
      if (selected.new){
        if (selected.item == 'man') {
          img_unit_append = selected.rank;
        } else {
          img_structure = (selected.item != 'farm' ? selected.item+selected.rank : 'house');
        }
      }
      let img = images[img_structure];
      try {
        context.drawImage(img,
                          canvas.width/3-size_gui_icon/2,
                          canvas.height-size_gui_icon,
                          size_gui_icon,
                          size_gui_icon);
        img = images['man'+img_unit_append];
        context.drawImage(img,
                          canvas.width*2/3-size_gui_icon/2,
                          canvas.height-size_gui_icon,
                          size_gui_icon,
                          size_gui_icon);
      } catch(TypeError){
//        console.log('Not all images are loaded!');
      }
      // display money situation
      context.fillStyle = 'white';
      context.textAlign = "left";
      context.font = size_gui_font+"px Arial";
      context.fillText(selected.bank+' ' + (selected.income<0 ? '' : '+') + selected.income,
                       size_gui_icon,
                       size_gui_icon/2+size_gui_font/3);
    }
    try {
      context.drawImage(images['undo'], 
                        0, //x
                        canvas.height-size_gui_icon,//y
                        size_gui_icon, //width
                        size_gui_icon);//height
      context.drawImage(images['end_turn'],
                        canvas.width-size_gui_icon,//x
                        canvas.height-size_gui_icon,//y
                        size_gui_icon,//width
                        size_gui_icon);//height
      context.drawImage(images['resign'],
                        canvas.width-size_gui_icon,//x
                        canvas.height/2-size_gui_icon/2,//y
                        size_gui_icon*0.71,//width
                        size_gui_icon);//height
    } catch(TypeError){
//      console.log('Not all images are loaded!');
    }
  }
}

function draw_hex_tile(context, x, y, color, border_color){
  let lw = Math.floor(hex_r/10);
  context.beginPath();
  context.moveTo(x + (hex_r-lw)*Math.cos(0), 
                 y + (hex_r-lw)*Math.sin(0));
  for (let i = 1; i <= 7;i += 1) {
      context.lineTo (x + (hex_r-lw)*Math.cos(i*2*Math.PI/6), 
                      y + (hex_r-lw)*Math.sin(i*2*Math.PI/6));
  }
  context.strokeStyle = border_color;
  context.lineWidth = lw*2;
  context.stroke();
  context.fillStyle = color;
  context.fill();
}







