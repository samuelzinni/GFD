require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const { getDb } = require('./database');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST', 'PUT', 'DELETE'] }
});

// Initialize database
getDb();

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Make io accessible to routes
app.set('io', io);

// API Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/events', require('./routes/events'));
app.use('/api/participants', require('./routes/participants'));
app.use('/api/tables', require('./routes/tables'));
app.use('/api/tickets', require('./routes/tickets'));
app.use('/api/email', require('./routes/email'));
app.use('/api/scan', require('./routes/scan'));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/import', require('./routes/import'));

// Serve static files in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '..', 'client', 'dist')));
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'client', 'dist', 'index.html'));
  });
}

// WebSocket connection
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  socket.on('join-dashboard', () => {
    socket.join('dashboard');
  });

  socket.on('join-scanner', () => {
    socket.join('scanners');
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`GFD Ticketing Server running on port ${PORT}`);
});
