// constants: general
//var canvas = document.getElementById('canvas');
var player_id;
var prefix_player_id;

// constants: canvas
//var context = canvas.getContext('2d');

// variables: canvas
var display_size = 0; // 0, 1, 2 => lowest(small), low(medium), normal (large)
var background_color = "#28286d";
var colors = ['grey', '#d7263d', '#1b998b', '#c5d86d', '#624763', '#5158bb', '#f46036'] //fitting

// -------------------------------------------------  socket communication ------------------------------------------------- 
var socket = io.connect({path: "/lobby/socket.io"});

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
  socket.on('refresh lobby', function(lobby) {
    // remove all rows in table
    $('.tbody').empty();
    // add lobby data
    for (let i=0; i<lobby.length; i++){
      $('.tbody').append($('<div class="row drop">')
        .append($('<div class="el">').text(lobby[i].id))
        .append($('<div class="el">').text(lobby[i].name))
        .append($('<div class="el">').text(lobby[i].player_count+'/'+lobby[i].max_players))
        .append($('<div class="el">').append($('<i class="material-icons">').text('keyboard_arrow_down')))
        .append($('<div class="clear">'))
      );
      $('.tbody').append($('<div class="info">')
        .append($('<div class="join button">').text('Join'))
        .append($('<div class="map">').text(lobby[i].map))
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
    $('canvas').show();
    $('#lobby').hide();
  });

  $('.refresh').click(function() { socket.emit('refresh lobby'); });
  $('.new').click(function() { socket.emit('new game'); });
});

