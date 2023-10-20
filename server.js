const path = require('path');
const http = require('http');
const express = require('express');
const socketio = require('socket.io');
const mongoose = require('mongoose'); 
const formatMessage = require('./utils/messages');
const { userJoin, getCurrentUser, userLeave, getRoomUsers } = require('./utils/users');

const app = express();
const server = http.createServer(app);
const io = socketio(server);

// MongoDB connection
mongoose.connect('mongodb://localhost:27017/chatapp', {
    useNewUrlParser: true,
    useUnifiedTopology: true,
});

const messageSchema = new mongoose.Schema({
    room: String,
    username: String,
    text: String,
    createdAt: {
        type: Date,
        default: Date.now,
    },
});

const Message = mongoose.model('Message', messageSchema);

// Set static folder
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

const admin = 'Admin';
// Run when a client connects
io.on('connection', (socket) => {
    socket.on('joinRoom', async ({ username, room }) => {
        const user = userJoin(socket.id, username, room);
        socket.join(user.room);
        // Fetch and send old messages for the room
        try {
            const messages = await Message.find({ room }).sort({ createdAt: 'asc' });
            messages.forEach((msg) => {
                socket.emit('message', formatMessage(msg.username, msg.text));
            });
        } catch (error) {
            console.error(error);
        }

        // Broadcast when a user connects
        socket.broadcast.to(user.room).emit('message', formatMessage(admin, `${user.username} has joined the chat`));

        // Send users and room info
        io.to(user.room).emit('roomUsers', {
            room: user.room,
            users: getRoomUsers(user.room),
        });
    });

    // Listen for chatMessage
    socket.on('chatMessage', async (msg) => {
        const user = getCurrentUser(socket.id);

        const newMessage = new Message({
            room: user.room,
            username: user.username,
            text: msg,
        });

        try {
            await newMessage.save();
            io.to(user.room).emit('message', formatMessage(user.username, msg));
        } catch (error) {
            console.error(error);
        }
    });

    // Runs when client disconnects
    socket.on('disconnect', () => {
        const user = userLeave(socket.id);

        if (user) {
            io.emit('message', formatMessage(admin, `${user.username} has left the chat`));
        }

        // Send users and room info
        io.emit('roomUsers', {
            room: user.room,
            users: getRoomUsers(user.room),
        });
    });
});
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
