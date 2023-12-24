require('dotenv').config();
const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const sqlite3 = require('sqlite3').verbose();

// App setup
const app = express();
const server = http.createServer(app);
const io = socketIO(server);

// Static files
app.use(express.static('public'));

// Database setup
const db = new sqlite3.Database('./votes.db', sqlite3.OPEN_READWRITE, (err) => {
  if (err) {
    console.error(err.message);
    throw err;
  }
  console.log('Connected to the SQLite database.');
});

// Handle closing the database connection when the server shuts down
process.on('SIGINT', () => {
  db.close();
  console.log('Database connection closed.');
  process.exit();
});

// Options list
const optionsString = process.env.OPTIONS_LIST;
const optionsList = optionsString.split(';').map(pair => pair.split(','));

// Shuffle algorithm
function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]]; // Swap elements
  }
}

const userStates = {};

function getNextOptions(userState) {
  const options = userState.shuffledOptions[userState.currentIndex];
  userState.currentIndex++;

  // Reshuffle and reset index if at the end
  if (userState.currentIndex >= userState.shuffledOptions.length) {
    shuffleArray(userState.shuffledOptions);
    userState.currentIndex = 0;
  }

  return options;
}

function addOption(text, bulb, callback) {
  const stmt = db.prepare('INSERT INTO options (text, bulb, votes) VALUES (?, ?, 0)');
  stmt.run(text, bulb, function (err) {
    if (err) {
      console.error('Error in inserting new option:', err.message);
    } else {
      console.log(`A new option row has been inserted with rowid ${this.lastID}`);
    }
    stmt.finalize();
    callback();
  });
}

function voteOption(optionText, bulb, socket, userState) {
  db.get('SELECT id FROM options WHERE text = ?', [optionText], (err, row) => {
    if (err) {
      console.error('Error in checking option existence:', err.message);
      return;
    }

    if (row) {
      db.run('UPDATE options SET votes = votes + 1 WHERE id = ?', [row.id], function (err) {
        if (err) {
          console.error('Error in updating votes:', err.message);
        } else {
          console.log(`Vote updated for '${optionText}' (ID: ${row.id}). Total votes: ${this.changes}`);
        }
        getVoteRatios(socket);
        socket.emit('update-options', getNextOptions(userState));
      });
    } else {
      addOption(optionText, bulb, () => getVoteRatios(socket));
    }
  });
}

function getVoteRatios(socket) {
  db.all('SELECT bulb, SUM(votes) as totalVotes FROM options GROUP BY bulb', [], (err, rows) => {
    if (err) {
      console.error('Error in getting vote ratios:', err.message);
      return;
    }
    console.log('Current vote ratios:', rows);
  });
}

// Socket setup & pass server
// Socket setup & pass server
io.on('connection', (socket) => {
  console.log('A user connected');

  // Initialize user state for each new connection
  userStates[socket.id] = {
    shuffledOptions: [...optionsList],
    currentIndex: 0
  };
  shuffleArray(userStates[socket.id].shuffledOptions);

  // Send the initial options and vote ratios to the client
  socket.emit('update-options', getNextOptions(userStates[socket.id]));
  
  getVoteRatios((ratios) => {
    socket.emit('update', ratios);
    socket.emit('update-options', getNextOptions(userStates[socket.id]));
  });

  socket.on('vote', (data) => {
    const userState = userStates[socket.id];
    const bulb = data.choice;
    const optionText = data.optionText;

    // Process vote and send updates specific to the user who voted
    voteOption(optionText, bulb, socket, userState);
  });

  socket.on('disconnect', () => {
    // Clean up user state when they disconnect
    delete userStates[socket.id];
    console.log('User disconnected');
  });
});


// Start the server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
