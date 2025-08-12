const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Serve static files
app.use(express.static('public'));

// In-memory storage for session data
let users = {};
let chatMessages = [];
let billboardImages = {
  billboard1: null,
  billboard2: null
};
let userCount = 0;

// Configure multer for file uploads (2MB limit)
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 2 * 1024 * 1024 // 2MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
});

// Handle image upload
app.post('/upload-billboard', upload.single('image'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const { billboardId } = req.body;
  if (!billboardId || (billboardId !== 'billboard1' && billboardId !== 'billboard2')) {
    return res.status(400).json({ error: 'Invalid billboard ID' });
  }

  // Convert buffer to base64 for easy transmission
  const imageData = {
    data: `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`,
    timestamp: Date.now()
  };

  billboardImages[billboardId] = imageData;

  // Broadcast to all clients
  io.emit('billboard-updated', {
    billboardId: billboardId,
    imageData: imageData.data
  });

  res.json({ success: true, message: 'Image uploaded successfully' });
});

// Socket connection handling
io.on('connection', (socket) => {
  userCount++;
  console.log(`User connected: ${socket.id}, Total users: ${userCount}`);

  // Send current state to new user
  socket.emit('init-data', {
    users: users,
    chatMessages: chatMessages,
    billboardImages: {
      billboard1: billboardImages.billboard1?.data || null,
      billboard2: billboardImages.billboard2?.data || null
    }
  });

  // Handle user join
  socket.on('user-joined', (userData) => {
    users[socket.id] = {
      id: socket.id,
      username: userData.username || `User_${socket.id.slice(0, 6)}`,
      position: userData.position || { x: 0, y: 0, z: 0 },
      rotation: userData.rotation || { x: 0, y: 0, z: 0 },
      color: userData.color || '#' + Math.floor(Math.random()*16777215).toString(16)
    };

    // Broadcast to all clients
    io.emit('user-list-updated', users);
    
    // Add system message
    const systemMessage = {
      id: Date.now(),
      username: 'System',
      message: `${users[socket.id].username} joined the world`,
      timestamp: new Date().toISOString(),
      type: 'system'
    };
    chatMessages.push(systemMessage);
    io.emit('chat-message', systemMessage);
  });

  // Handle user movement
  socket.on('user-moved', (movementData) => {
    if (users[socket.id]) {
      users[socket.id].position = movementData.position;
      users[socket.id].rotation = movementData.rotation;
      
      // Broadcast to other clients
      socket.broadcast.emit('user-moved', {
        userId: socket.id,
        position: movementData.position,
        rotation: movementData.rotation
      });
    }
  });

  // Handle chat messages
  socket.on('chat-message', (messageData) => {
    if (users[socket.id]) {
      const message = {
        id: Date.now(),
        username: users[socket.id].username,
        message: messageData.message,
        timestamp: new Date().toISOString(),
        type: 'user'
      };
      
      chatMessages.push(message);
      
      // Keep only last 100 messages to prevent memory issues
      if (chatMessages.length > 100) {
        chatMessages = chatMessages.slice(-100);
      }
      
      io.emit('chat-message', message);
    }
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    userCount--;
    console.log(`User disconnected: ${socket.id}, Total users: ${userCount}`);

    if (users[socket.id]) {
      const systemMessage = {
        id: Date.now(),
        username: 'System',
        message: `${users[socket.id].username} left the world`,
        timestamp: new Date().toISOString(),
        type: 'system'
      };
      
      delete users[socket.id];
      io.emit('user-list-updated', users);
      
      chatMessages.push(systemMessage);
      io.emit('chat-message', systemMessage);
    }

    // Clear all data when no users are connected
    if (userCount === 0) {
      console.log('All users disconnected. Clearing data...');
      users = {};
      chatMessages = [];
      billboardImages = {
        billboard1: null,
        billboard2: null
      };
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
