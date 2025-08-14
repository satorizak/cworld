const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const multer = require('multer');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const users = {};
const billboardImages = {
    billboard1: null,
    billboard2: null,
};
const chatMessages = [];
const MESSAGE_HISTORY_LIMIT = 50;

// Setup multer for file uploads
const upload = multer({
    limits: {
        fileSize: 2 * 1024 * 1024 // 2 MB limit
    }
});

// Serve static files from the root directory
app.use(express.static(path.join(__dirname)));

// Handle billboard image uploads
app.post('/upload-billboard', upload.single('image'), (req, res) => {
    if (!req.file) {
        return res.json({ success: false, error: 'No file uploaded.' });
    }

    const billboardId = req.body.billboardId;
    if (!billboardId || !billboardImages.hasOwnProperty(billboardId)) {
        return res.json({ success: false, error: 'Invalid billboard ID.' });
    }

    const imgBase64 = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
    billboardImages[billboardId] = imgBase64;
    io.emit('billboard-updated', { billboardId, imageData: imgBase64 });
    res.json({ success: true });
});

io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);

    // Send initial state to the new user
    socket.emit('init-data', {
        users: users,
        billboardImages: billboardImages,
        chatMessages: chatMessages
    });

    socket.on('user-joined', (userData) => {
        users[socket.id] = {
            id: socket.id,
            username: userData.username,
            avatarType: userData.avatarType,
            position: userData.position,
            rotation: userData.rotation
        };
        const message = {
            type: 'system',
            username: 'System',
            message: `${userData.username} has joined the world.`,
            timestamp: Date.now()
        };
        chatMessages.push(message);
        if (chatMessages.length > MESSAGE_HISTORY_LIMIT) {
            chatMessages.shift();
        }
        io.emit('chat-message', message);
        io.emit('user-list-updated', users);
        console.log(`User joined: ${userData.username} with avatarType: ${userData.avatarType}`);
    });

    socket.on('user-moved', (data) => {
        if (users[socket.id]) {
            users[socket.id].position = data.position;
            users[socket.id].rotation = data.rotation;
            socket.broadcast.emit('user-moved', {
                userId: socket.id,
                position: data.position,
                rotation: data.rotation
            });
        }
    });
    
    socket.on('my-avatar-updated', (data) => {
        if (users[socket.id]) {
            users[socket.id].avatarType = data.avatarType;
            io.emit('user-list-updated', users);
            console.log(`Avatar updated for ${users[socket.id].username} to ${data.avatarType}`);
        }
    });

    socket.on('chat-message', (data) => {
        if (users[socket.id]) {
            const message = {
                type: 'user',
                username: users[socket.id].username,
                message: data.message,
                timestamp: Date.now()
            };
            chatMessages.push(message);
            if (chatMessages.length > MESSAGE_HISTORY_LIMIT) {
                chatMessages.shift();
            }
            io.emit('chat-message', message);
        }
    });

    socket.on('disconnect', () => {
        console.log(`User disconnected: ${socket.id}`);
        if (users[socket.id]) {
            const disconnectedUsername = users[socket.id].username;
            delete users[socket.id];
            const message = {
                type: 'system',
                username: 'System',
                message: `${disconnectedUsername} has left the world.`,
                timestamp: Date.now()
            };
            chatMessages.push(message);
            if (chatMessages.length > MESSAGE_HISTORY_LIMIT) {
                chatMessages.shift();
            }
            io.emit('chat-message', message);
        }
        io.emit('user-list-updated', users);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
