import 'dotenv/config';
import express from 'express';
import pg from 'pg';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { buildCondition } from './queryBuilder.mjs';
import merges from './merges.json' with { type: 'json' };

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const { Pool } = pg;
const app = express();
const port = process.env.PORT || 3000;
const serverSessionId = Date.now().toString();

const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_DATABASE,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 10000,
});

const allowedOrigins = ['https://vschuh.github.io', 'http://127.0.0.1:5500', 'http://www.euro-zones.com', "https://www.euro-zones.com"];
const corsOptions = {
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  }
};
app.use(cors(corsOptions));
app.use(express.json());

app.use(express.static(path.join(__dirname, 'docs')));

app.get('/health', async (req, res) => {
    try {
        const client = await pool.connect();
        client.release();
        res.status(200).send({ status: 'ok', database: 'connected' });
    } catch (dbError) {
        console.error('Health check failed:', dbError);
        res.status(503).send({ status: 'error', database: 'disconnected' });
    }
});

const playerMergeMap = new Map();
for (const mainId in merges.players) {
    for (const anyId of merges.players[mainId]) {
        playerMergeMap.set(anyId.toString(), mainId.toString());
    }
}

function interpolateQuery(query, params) {
    let i = 0;
    return query.replace(/\$\d+/g, (match) => {
        if (i < params.length) {
            const value = params[i++];
            if (typeof value === 'string') {
                return "'" + value.replace(/'/g, "''") + "'";
            }
            if (value === null) { return 'NULL'; }
            return value;
        }
        return match;
    });
}

app.get('/api/grid/:identifier', async (req, res) => {
    const { identifier } = req.params;
    const isCustom = !isNaN(identifier);

    try {
        let result;
        if (isCustom) {
            result = await pool.query('SELECT grid_data, name FROM grids WHERE id = $1 AND type = $2', [identifier, 'custom']);
        } else {
            const today = new Date().toISOString().split('T')[0];
            result = await pool.query('SELECT grid_data FROM grids WHERE type = $1 AND grid_date = $2', [identifier, today]);
        }

        if (result.rows.length > 0) {
            const gridData = result.rows[0].grid_data;
            gridData.serverSessionId = serverSessionId;
            if (result.rows[0].name) {
                gridData.name = result.rows[0].name;
            }
            res.json(gridData);
        } else {
            res.status(404).json({ error: 'Grid not found.' });
        }
    } catch (error) {
        console.error(`Error fetching grid for identifier ${identifier}:`, error);
        res.status(500).json({ error: 'Failed to fetch grid.' });
    }
});

app.get('/api/player-search', async (req, res) => {
    const rawQuery = Array.isArray(req.query.query) ? req.query.query[0] : req.query.query;
    const trimmedQuery = rawQuery ? String(rawQuery).trim() : '';

    if (!trimmedQuery || trimmedQuery.length < 3) return res.json([]);

    try {
        const sqlQuery = `
            SELECT p.id, p.firstname, p.lastname, p.dob
            FROM player p
            WHERE unaccent(p.firstname || ' ' || p.lastname) ILIKE unaccent($1)
            ORDER BY
                CASE
                    WHEN unaccent(p.lastname) ILIKE unaccent($2) THEN 1
                    WHEN unaccent(p.firstname) ILIKE unaccent($2) THEN 2
                    ELSE 3
                END,
                p.lastname,
                p.firstname
            LIMIT 20;
        `;
        print(sqlQuery)
        
        const result = await pool.query(sqlQuery, [
            `%${trimmedQuery}%`,
            `${trimmedQuery}%` 
        ]);

        const uniquePlayers = new Map();
        result.rows.forEach(p => {
            const mainId = playerMergeMap.get(p.id.toString()) || p.id.toString();
            if (!uniquePlayers.has(mainId)) {
                uniquePlayers.set(mainId, {
                    id: mainId,
                    name: `${p.firstname} ${p.lastname}`,
                    year: p.dob || 'N/A'
                });
            }
        });

        res.json(Array.from(uniquePlayers.values()).slice(0, 10));
    } catch (error) {
        console.error('Error during player search', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});



app.get('/api/validate', async (req, res) => {
    const { playerName, playerId, categoryValue } = req.query;
    if (!playerName || !playerId || !categoryValue) {
        return res.status(400).json({ error: 'Required parameters are missing.' });
    }

    const imageQuery = `
        SELECT COALESCE(
            (SELECT imglink FROM player_record pr2
             JOIN tournamentevent te2 ON te2.id = pr2.tournamentid
             WHERE pr2.playerid = ANY($1::int[]) AND pr2.imglink != 'https://static.wbsc.org/assets/images/default-player.jpg'
             ORDER BY te2.year DESC, pr2.id ASC LIMIT 1),
            'https://static.wbsc.org/assets/images/default-player.jpg'
        ) AS imglink;
    `;

    const mainPlayerId = playerId;
    const allPlayerIds = [mainPlayerId, ...(merges.players[mainPlayerId] || [])];
    const playerPlaceholders = allPlayerIds.map((_, i) => `$${i + 1}`).join(',');

    const category = JSON.parse(categoryValue);
    const cond = buildCondition(category, 'p', allPlayerIds.length + 1);

    if (!cond.text) {
        return res.status(400).json({ error: 'Invalid category type.' });
    }

    const query = `SELECT EXISTS (SELECT 1 FROM player p WHERE p.id IN (${playerPlaceholders}) AND ${cond.text});`;
    const queryParams = [...allPlayerIds, ...cond.values];

    try {
        console.log("\n--- DEBUG: VALIDATE QUERY ---");
        console.log(interpolateQuery(query, queryParams));
        console.log("---------------------------\n");

        const validationResult = await pool.query(query, queryParams);
        if (validationResult.rows[0].exists) {
            const imageResult = await pool.query(imageQuery, [allPlayerIds]);
            res.json({
                isValid: true,
                player: { name: playerName, image: imageResult.rows[0].imglink }
            });
        } else {
            res.json({ isValid: false });
        }
    } catch (error) {
        console.error('Error during validation', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.post('/api/get-cell-answers', async (req, res) => {
    const { cat1, cat2 } = req.body;
    if (!cat1 || !cat2) {
        return res.status(400).json({ error: 'Two categories are required.' });
    }

    let allValues = [];
    let conditions = [];

    const cond1 = buildCondition(cat1, 'p', 1);
    if (!cond1.text) return res.status(400).json({error: `Invalid category: ${cat1.label}`});
    conditions.push(cond1.text);
    allValues.push(...cond1.values);

    const cond2 = buildCondition(cat2, 'p', allValues.length + 1);
    if (!cond2.text) return res.status(400).json({error: `Invalid category: ${cat2.label}`});
    conditions.push(cond2.text);
    allValues.push(...cond2.values);

    const query = `SELECT DISTINCT p.firstname, p.lastname FROM player p WHERE ${conditions.join(' AND ')} ORDER BY p.lastname, p.firstname;`;

    try {
        console.log("\n--- DEBUG: GET CELL ANSWERS QUERY ---");
        console.log(interpolateQuery(query, allValues));
        console.log("-------------------------------------\n");

        const result = await pool.query(query, allValues);
        const players = result.rows.map(p => `${p.firstname} ${p.lastname}`);
        res.json({ players, count: players.length });
    } catch (error) {
        console.error("Error fetching cell answers:", error);
        res.status(500).json({ error: 'Failed to get answers.' });
    }
});

app.post('/api/grid', async (req, res) => {
    const { rows, cols, name } = req.body;
    if (!rows || !cols || rows.length !== 3 || cols.length !== 3) {
        return res.status(400).json({ error: 'Invalid grid data provided.' });
    }

    try {
        await pool.query("DELETE FROM grids WHERE type = 'custom' AND created_at < NOW() - INTERVAL '24 hours'");
    } catch (cleanupError) { console.error("Error during custom grid cleanup:", cleanupError); }

    try {
        const gridData = JSON.stringify({ rows, cols });

        const result = await pool.query(
            "INSERT INTO grids (type, name, grid_data) VALUES ('custom', $1, $2) RETURNING id",
            [name, gridData]
        );
        res.json({ id: result.rows[0].id });
    } catch (error) {
        console.error('Error saving custom grid:', error);
        res.status(500).json({ error: 'Failed to save custom grid.' });
    }
});

app.get(/^\/.*/, (req, res) => {
    res.sendFile(path.join(__dirname, 'docs', 'index.html'));
});

async function startServer() {
    try {
        const client = await pool.connect();
        console.log('✅ Database connection successful.');
        client.release();

        app.listen(port, () => {
          console.log(`🚀 Server is listening on port ${port}`);
        });
    } catch (err) {
        console.error('❌ Failed to connect to the database. Server will not start.');
        console.error(err.stack);
        process.exit(1);
    }
}

startServer();