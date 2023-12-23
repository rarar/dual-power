const sqlite3 = require('sqlite3').verbose();

const db = new sqlite3.Database('./votes.db', sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE, (err) => {
    if (err) {
        console.error(err.message);
        throw err;
    }
    console.log('Connected to the SQLite database.');

    db.run(`CREATE TABLE IF NOT EXISTS options (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                text TEXT NOT NULL,
                bulb TEXT NOT NULL CHECK (bulb IN ('left', 'right')),
                votes INTEGER DEFAULT 0
            )`,
        (err) => {
            if (err) {
                console.log('Error creating table', err.message);
            } else {
                console.log('Table options is created or already exists');
            }
        });
});

process.on('SIGINT', () => {
    db.close((err) => {
        if (err) {
            return console.error(err.message);
        }
        console.log('SQLite database connection closed.');
    });
});
