
const express = require('express');
const path = require('path');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

// Store votes
let votes = {
  people: 0,
  state: 0
};

// Total lumens is a constant, for example, let's say 100
const TOTAL_LUMENS = 100;

app.use(express.static(path.join(__dirname, 'public')));

// Serve the HTML file as the homepage
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dual_power_fullscreen.html'));
});

// WebSocket connection
io.on('connection', (socket) => {
  console.log('A user connected');

  // Send current votes when a new user connects
  socket.emit('update', calculateBrightness(votes));

  // When a vote is received from a user
  socket.on('vote', (data) => {
    if (data.choice === 'people') {
      votes.people++;
    } else if (data.choice === 'state') {
      votes.state++;
    }
    // Broadcast updated brightness levels to all connected clients
    io.emit('update', calculateBrightness(votes));
  });

  // When a user disconnects
  socket.on('disconnect', () => {
    console.log('A user disconnected');
  });
});

// Function to calculate brightness based on votes
function calculateBrightness(votes) {
  let peopleBrightness = (votes.people / (votes.people + votes.state)) * TOTAL_LUMENS;
  let stateBrightness = TOTAL_LUMENS - peopleBrightness;
  return { people: peopleBrightness, state: stateBrightness };
}

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
