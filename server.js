var express = require('express');
var app = express();
var http = require('http').Server(app);
var io = require('socket.io')(http);

// server setup
app.get('/', function(req, res){
	res.sendFile(__dirname + '/public/index.html');
});

http.listen(process.env.PORT || 3000, function(){ console.log('listening on', http.address().port);
});
app.use(express.static(__dirname + '/public/images'));
app.use(express.static(__dirname + '/public/styles'));
app.use(express.static(__dirname + '/public/scripts'));

var room_current = 0;
var room_available = [];
var room_occupied = [];
var rooms_info = {}

function get_users_in_room(room_number){
	return rooms_info[room_number].current_users.length;
}

io.sockets.on('connection', function(socket){
	// user login
	socket.on('room create', function(name){
		var room_number = -1;

		// if there is available room
		if (room_available.length == 0) {
			// there is no available room, create directly
			room_number = room_current;
			room_occupied.push(room_number);
			room_current = room_current + 1;
		} else {
			room_number = room_available[0];
			room_occupied.push(room_number);
			room_available.slice(1);
		};

		//update rooms_info
		rooms_info[room_number] = {room_number: room_number, current_users: [{name: name, order: 1}]}
		//emit signal to update UI
		socket.emit('chatroom show', room_number, rooms_info[room_number]);

		// configure socket
		socket.name = name;
		socket.room_number = room_number;
		socket.order = 1;

		// join room
		socket.join(room_number);
	});

	// user tries to enter a room
	socket.on('room enter', function(name, room_number){
		if (room_occupied.indexOf(room_number) >= 0) {
			socket.emit('room exists', name, room_number, true);
		} else {
			socket.emit('room exists', name, room_number, false);
		};
	});

	// user enter a room
	socket.on('chatroom userin', function(name, room_number){
		var order = get_users_in_room(room_number) + 1;
		rooms_info[room_number].current_users.push({name: name, order: order});

		// configure socket
		socket.name = name
		socket.room_number = room_number;
		socket.order = order;
		
		// join room
		socket.join(room_number);

		// send signal to update UI
		socket.emit('chatroom show', room_number, rooms_info[room_number]);
		socket.broadcast.to(room_number).emit('chatroom chat', '服务器', name + ' 登入了游戏', room_number, rooms_info[room_number]);
	});

	// user leave
	socket.on('disconnect', function(){
		// check if in any refresh
		if (socket.name != undefined) {
			// check if this is the last player
			if (get_users_in_room(socket.room_number) == 1) {
				// yes, delete this room
				rooms_info[socket.room_number] = {};
				var temp = [];
				for (var i in room_occupied) {
					var current = room_occupied[i];
					if (current != socket.room_number) {
						temp.push(current);
					}
				}
				room_occupied = temp;

				// add this number to available
				room_available.push(socket.room_number);
			} else {
				//no,  change the current user list in the room
				var temp = []
				var room_users = rooms_info[socket.room_number].current_users
				for (var i in room_users) {
					var current = room_users[i]
					if (current.order < socket.order) {
						temp.push(current);
					} else {
						if (current.order > socket.order) {
							temp.push({name: current.name, order: current.order - 1});
						};
					};
				}

			// update list
			console.log(socket.room_number);
			rooms_info[socket.room_number] = {room_number: socket.room_number, current_users: temp};
			socket.broadcast.to(socket.room_number).emit('chatroom chat', '服务器', socket.name + '断开了游戏', socket.room_number, rooms_info[socket.room_number]);
			};
		}
	});

	// chatty message handling
	socket.on('chatty send', function(content){
		console.log('forwarding', socket.name, socket.room_number, content, room_occupied);
		io.to(socket.room_number).emit('chatty new', socket.name, content);
	})
});