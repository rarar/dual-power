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

// Hardcoded options list
const optionsList = [
  ["THE PEOPLE", "THE STATE"],
  ["DEMOCRACY", "TECHNOCRACY"],
  ["DECENTRALIZED", "CENTRALIZED"],
  ["AUTONOMIST", "MARXIST-LENINIST"]
];
let currentOptionIndex = 0;

function getNextOptions() {
  const options = optionsList[currentOptionIndex];
  currentOptionIndex = (currentOptionIndex + 1) % optionsList.length;
  console.log(currentOptionIndex);
  console.log(options);
  return options;
}

// Function to add a new option
function addOption(text, bulb) {
  console.log("addOption");
  const stmt = db.prepare('INSERT INTO options (text, bulb, votes) VALUES (?, ?, 0)');
  stmt.run(text, bulb, function (err) {
    if (err) {
      return console.log(err.message);
    }
    console.log(`A new row has been inserted with rowid ${this.lastID}`);
  });
  stmt.finalize();
}

function voteOption(optionText, bulb, callback) {
  db.get('SELECT id FROM options WHERE text = ?', [optionText], (err, row) => {
    if (err) {
      console.error('Error in checking option existence:', err.message);
      return;
    }

    if (row) {
      db.run('UPDATE options SET votes = votes + 1 WHERE id = ?', [row.id], function (err) {
        if (err) {
          console.error('Error in updating votes:', err.message);
        }
        callback();
      });
    } else {
      db.run('INSERT INTO options (text, bulb, votes) VALUES (?, ?, 1)', [optionText, bulb], function (err) {
        if (err) {
          console.error('Error in inserting new option:', err.message);
        }
        callback();
      });
    }
  });
}


// Function to get the current vote ratios
function getVoteRatios(callback) {
  db.all('SELECT bulb, SUM(votes) as totalVotes FROM options GROUP BY bulb', [], (err, rows) => {
    if (err) {
      throw err;
    }
    console.log(rows);
    callback(rows);
  });
}

// Socket setup & pass server
io.on('connection', (socket) => {
  console.log('A user connected');

  // Send the current options and vote ratios to the client
  getVoteRatios((ratios) => {
    socket.emit('update', ratios);
    socket.emit('update-options', getNextOptions());
  });

  socket.on('vote', (data) => {
    const bulb = data.choice;
    const optionText = data.optionText;

    voteOption(optionText, bulb, () => {
      getVoteRatios((ratios) => {
        io.emit('update', ratios);
        io.emit('update-options', getNextOptions());
      });
    });
  });

  socket.on('disconnect', () => {
    console.log('User disconnected');
  });
});

// Start the server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
