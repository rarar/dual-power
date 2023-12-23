require('dotenv').config();
const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const sqlite3 = require('sqlite3').verbose();
const { Configuration, OpenAIApi } = require("openai");

// App setup
const app = express();
const server = http.createServer(app);
const io = socketIO(server);

const openai = new OpenAIApi(new Configuration({
  apiKey: process.env.OPENAI_API_KEY, // Ensure to set this in your environment or replace with your API key
}));

async function generateOptions() {
  try {
    const response = await openai.createCompletion({
      model: "text-davinci-003", // You can choose the model
      prompt: "Generate two contrasting concepts representing decentralization and centralization.", // Modify this prompt as needed
      max_tokens: 100
    });
    const options = response.data.choices[0].text.trim().split('\n');
    return options.length === 2 ? options : ["Option 1", "Option 2"]; // Fallback options if needed
  } catch (error) {
    console.error("Error in generating options:", error);
    return ["Option 1", "Option 2"]; // Fallback options in case of an error
  }
}


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

// Function to add a new option
function addOption(text, bulb) {
    const stmt = db.prepare('INSERT INTO options (text, bulb, votes) VALUES (?, ?, 0)');
    stmt.run(text, bulb, function(err) {
        if (err) {
            return console.log(err.message);
        }
        console.log(`A new row has been inserted with rowid ${this.lastID}`);
    });
    stmt.finalize();
}

// Function to increment the vote count for an option
function voteOption(id) {
    const stmt = db.prepare('UPDATE options SET votes = votes + 1 WHERE id = ?');
    stmt.run(id, function(err) {
        if (err) {
            return console.log(err.message);
        }
        console.log(`Row(s) updated: ${this.changes}`);
    });
    stmt.finalize();
}

// Function to get the current vote ratios
function getVoteRatios(callback) {
    db.all('SELECT bulb, SUM(votes) as totalVotes FROM options GROUP BY bulb', [], (err, rows) => {
        if (err) {
            throw err;
        }
        callback(rows);
    });
}

// Socket setup & pass server
io.on('connection', (socket) => {
    console.log('A user connected');

    // Send the current options and vote ratios to the client
    getVoteRatios((ratios) => {
        socket.emit('update', ratios);
    });

    // Listen for votes from the client
    socket.on('vote', (optionId) => {
        voteOption(optionId);
        // Send updated vote ratios to all clients
        getVoteRatios((ratios) => {
            io.emit('update', ratios);
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
