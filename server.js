// A simple example of the server-side logic
const users = {};
io.on('connection', (socket) => {
    socket.on('user-joined', (userData) => {
        // Correctly store the avatarType from the user's data
        users[socket.id] = {
            id: socket.id,
            username: userData.username,
            avatarType: userData.avatarType, // This line is crucial
            position: userData.position,
            rotation: userData.rotation
        };
        io.emit('user-list-updated', users); // Broadcast the full user list
    });

    socket.on('disconnect', () => {
        delete users[socket.id];
        io.emit('user-list-updated', users);
    });

    // Handle updates to a user's avatar if they change it in-game
    socket.on('my-avatar-updated', (data) => {
        if (users[socket.id]) {
            // Update the user's avatarType in the server's state
            users[socket.id].avatarType = data.avatarType;
            // Broadcast the updated user list so all clients can see the change
            io.emit('user-list-updated', users);
        }
    });

    // ... other handlers for chat, movement, etc.
});
