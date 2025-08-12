const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname)));
app.use(express.json({ limit: '2mb' }));

let users = {};
let chatHistory = [];
let billboardImages = {}; // Stores images as base64 strings

// Function to clean up old users
function cleanupUsers() {
    const now = Date.now();
    for (const id in users) {
        if (now - users[id].lastSeen > 60000) { // 60 seconds of inactivity
            console.log(`User ${users[id].username} (${id}) disconnected.`);
            delete users[id];
            io.emit('user-list-updated', users);
        }
    }
}

setInterval(cleanupUsers, 30000); // Check for inactive users every 30 seconds

io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);
    
    // NEW: Listen for the 'user-joined-with-avatar' event from the client
    socket.on('user-joined-with-avatar', (data) => {
        if (!users[socket.id]) {
            const newUser = {
                id: socket.id,
                username: data.username,
                avatar: data.avatar, // Store the chosen avatar
                color: Math.random() * 0xFFFFFF, // Random color for fallback
                position: data.position,
                rotation: data.rotation,
                lastSeen: Date.now()
            };
            users[socket.id] = newUser;

            console.log(`User ${newUser.username} joined with avatar: ${newUser.avatar}`);

            // Send initial world data to the new user
            socket.emit('join-accepted', {
                initData: {
                    chatMessages: chatHistory,
                    billboardImages: billboardImages
                },
                avatar: newUser.avatar,
            });

            // Tell everyone else about the new user
            io.emit('user-list-updated', users);
        }
    });

    socket.on('user-moved', (data) => {
        if (users[socket.id]) {
            users[socket.id].position = data.position;
            users[socket.id].rotation = data.rotation;
            users[socket.id].lastSeen = Date.now();
            socket.broadcast.emit('user-moved', { userId: socket.id, position: data.position, rotation: data.rotation });
        }
    });

    socket.on('chat-message', (data) => {
        if (users[socket.id]) {
            const messageData = {
                username: users[socket.id].username,
                message: data.message,
                timestamp: Date.now(),
                type: 'user'
            };
            chatHistory.push(messageData);
            if (chatHistory.length > 50) {
                chatHistory.shift();
            }
            io.emit('chat-message', messageData);
        }
    });

    socket.on('disconnect', () => {
        if (users[socket.id]) {
            console.log(`User disconnected: ${users[socket.id].username} (${socket.id})`);
            const disconnectMessage = {
                message: `${users[socket.id].username} has left the world.`,
                timestamp: Date.now(),
                type: 'system'
            };
            chatHistory.push(disconnectMessage);
            if (chatHistory.length > 50) {
                chatHistory.shift();
            }
            io.emit('chat-message', disconnectMessage);
            delete users[socket.id];
            io.emit('user-list-updated', users);

            // Clear billboard images if no one is left
            if (Object.keys(users).length === 0) {
                billboardImages = {};
                console.log('Last user left, billboards cleared.');
                io.emit('billboard-updated', { billboardId: 'billboard1', imageData: null });
                io.emit('billboard-updated', { billboardId: 'billboard2', imageData: null });
            }
        } else {
            console.log(`Anonymous user disconnected: ${socket.id}`);
        }
    });
});

app.post('/upload-billboard', (req, res) => {
    // This is a placeholder for your actual upload logic
    // You would need to handle the image data from req.body
    const { billboardId, imageData } = req.body;
    if (billboardId && imageData) {
        billboardImages[billboardId] = imageData;
        io.emit('billboard-updated', { billboardId, imageData });
        res.json({ success: true, message: 'Billboard updated successfully.' });
    } else {
        res.status(400).json({ success: false, error: 'Invalid data.' });
    }
});

server.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
