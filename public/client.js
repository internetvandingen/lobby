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


// -------------------------------------------------  chat communication ------------------------------------------------- 
$(function () {
  $('form').submit(function(e){
    e.preventDefault(); // prevents page reloading
    socket.emit('chat message', $('#m').val());
    $('#m').val('');
    return false;
  });

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


  socket.on('refresh lobby', function(lobby) {
    // remove all rows in table
    $('tbody').empty();
    // add lobby data
    for (let i=0; i<lobby.length; i++){
      $('table').append($('<tr>')
        .append($('<td>').text(lobby[i].id))
        .append($('<td>').text(lobby[i].name))
        .append($('<td>').text(lobby[i].player_count))
        .append($('<td>').text(lobby[i].map))
      );
    }
  });


  $('th.refresh').click(function() { socket.emit('refresh lobby'); });
  $('tr.dropdown').click(
    function() {
      $('.drop').slideToggle(400);
    });
});

