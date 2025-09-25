
require('dotenv').config();
const express = require('express');
const fs = require('fs');
const { Pool } = require('pg');
const merges = require('./merges.json');

const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_DATABASE,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
    ssl: {
        rejectUnauthorized: false
    }
});

const serverSessionId = Date.now().toString()
const app = express();
const cors = require('cors');

const allowedOrigins = ['https://vschuh.github.io', 'http://127.0.0.1:5500','http://www.euro-zones.com',"https://www.euro-zones.com"];

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

app.use(cors(corsOptions));

app.use(express.json());
const port = 3000;
const playerMergeMap = new Map();
for (const mainId in merges.players) {
    for (const anyId of merges.players[mainId]) {
        playerMergeMap.set(anyId.toString(), mainId.toString());
    }
}
app.use((req, res, next) => {
    if (req.headers['x-forwarded-proto'] !== 'https') {
        return res.redirect('https://' + req.get('host') + req.url);
    }
    next();
});

const buildCondition = (category, playerAlias = 'p', startingIndex = 1) => {
    const alias = `${playerAlias}.id`;
    let text = '';
    let values = [];

    if (category.type === 'team') {
        const mainTeamId = category.value;
        const allTeamIds = [mainTeamId, ...(merges.teams[mainTeamId.toString()] || [])];
        const placeholders = allTeamIds.map((_, i) => `$${startingIndex + i}`).join(',');
        text = `EXISTS (SELECT 1 FROM player_record pr JOIN teamrecord tr ON pr.teamid=tr.id WHERE pr.playerid=${alias} AND tr.teamid::text IN (${placeholders}))`;
        values = allTeamIds;
    } else {
         switch (category.type) {
            case 'tournament':
                text = `EXISTS (SELECT 1 FROM player_record pr JOIN tournamentevent te ON pr.tournamentid=te.id WHERE pr.playerid=${alias} AND te.category ILIKE $${startingIndex})`;
                values = [category.value];
                break;
            case 'year':
                text = `EXISTS (SELECT 1 FROM player_record pr JOIN tournamentevent te ON pr.tournamentid=te.id WHERE pr.playerid=${alias} AND te.year = $${startingIndex})`;
                values = [parseInt(category.value)];
                break;
            case 'nationality':
                text = `p.nationality = $${startingIndex}`;
                values = [category.value];
                break;
            case 'seasonal_homeruns':
                text = `EXISTS (SELECT 1 FROM player_record pr_stat JOIN player_statistics ps ON pr_stat.id = ps.player_record_id WHERE pr_stat.playerid = ${alias} AND ps.homerun >= $${startingIndex})`;
                values = [parseInt(category.value)];
                break;
            case 'seasonal_hits':
                text = `EXISTS (SELECT 1 FROM player_record pr_stat JOIN player_statistics ps ON pr_stat.id = ps.player_record_id WHERE pr_stat.playerid = ${alias} AND ps.h >= $${startingIndex})`;
                values = [parseInt(category.value)];
                break;
            case 'seasonal_sb':
                text = `EXISTS (SELECT 1 FROM player_record pr_stat JOIN player_statistics ps ON pr_stat.id = ps.player_record_id WHERE pr_stat.playerid = ${alias} AND ps.sb >= $${startingIndex})`;
                values = [parseInt(category.value)];
                break;
            case 'seasonal_bb':
                text = `EXISTS (SELECT 1 FROM player_record pr_stat JOIN player_statistics ps ON pr_stat.id = ps.player_record_id WHERE pr_stat.playerid = ${alias} AND ps.bb >= $${startingIndex})`;
                values = [parseInt(category.value)];
                break;
            case 'seasonal_doubles':
                text = `EXISTS (SELECT 1 FROM player_record pr_stat JOIN player_statistics ps ON pr_stat.id = ps.player_record_id WHERE pr_stat.playerid = ${alias} AND ps.double >= $${startingIndex})`;
                values = [parseInt(category.value)];
                break;
            case 'seasonal_triples':
                text = `EXISTS (SELECT 1 FROM player_record pr_stat JOIN player_statistics ps ON pr_stat.id = ps.player_record_id WHERE pr_stat.playerid = ${alias} AND ps.triple >= $${startingIndex})`;
                values = [parseInt(category.value)];
                break;
            case 'seasonal_rbi':
                text = `EXISTS (SELECT 1 FROM player_record pr_stat JOIN player_statistics ps ON pr_stat.id = ps.player_record_id WHERE pr_stat.playerid = ${alias} AND ps.rbi >= $${startingIndex})`;
                values = [parseInt(category.value)];
                break;
            case 'seasonal_runs':
                text = `EXISTS (SELECT 1 FROM player_record pr_stat JOIN player_statistics ps ON pr_stat.id = ps.player_record_id WHERE pr_stat.playerid = ${alias} AND ps.r >= $${startingIndex})`;
                values = [parseInt(category.value)];
                break;
            case 'seasonal_wOBA':
                text = `EXISTS (SELECT 1 FROM player_record pr_stat JOIN player_statistics ps ON pr_stat.id = ps.player_record_id WHERE pr_stat.playerid = ${alias} AND ps."wOBA" >= $${startingIndex} AND ps.pa >= 10)`;
                values = [parseFloat(category.value)];
                break;
            case 'seasonal_avg':
                text = `EXISTS (SELECT 1 FROM player_record pr_stat JOIN player_statistics ps ON pr_stat.id = ps.player_record_id WHERE pr_stat.playerid = ${alias} AND ps.avg >= $${startingIndex} AND ps.pa >= 10)`;
                values = [parseFloat(category.value)];
                break;
            case 'seasonal_ops':
                text = `EXISTS (SELECT 1 FROM player_record pr_stat JOIN player_statistics ps ON pr_stat.id = ps.player_record_id WHERE pr_stat.playerid = ${alias} AND ps."OPS" >= $${startingIndex} AND ps.pa >= 10)`;
                values = [parseFloat(category.value)];
                break;
            case 'seasonal_pitching_k':
                text = `EXISTS (SELECT 1 FROM player_record pr_stat JOIN player_statistics ps ON pr_stat.id = ps.player_record_id WHERE pr_stat.playerid = ${alias} AND ps.pitching_strikeout >= $${startingIndex})`;
                values = [parseInt(category.value)];
                break;
            case 'seasonal_pitching_ip':
                text = `EXISTS (SELECT 1 FROM player_record pr_stat JOIN player_statistics ps ON pr_stat.id = ps.player_record_id WHERE pr_stat.playerid = ${alias} AND ps.pitching_ip >= $${startingIndex})`;
                values = [parseInt(category.value)];
                break;
            case 'seasonal_pitching_era':
                text = `EXISTS (SELECT 1 FROM player_record pr_stat JOIN player_statistics ps ON pr_stat.id = ps.player_record_id WHERE pr_stat.playerid = ${alias} AND ps.pitching_era <= $${startingIndex} AND ps.pitching_ip >= 30)`;
                values = [parseFloat(category.value)];
                break;
            case 'seasonal_pitching_fip':
                text = `EXISTS (SELECT 1 FROM player_record pr_stat JOIN player_statistics ps ON pr_stat.id = ps.player_record_id WHERE pr_stat.playerid = ${alias} AND ps.pitching_fip <= $${startingIndex} AND ps.pitching_ip >= 30)`;
                values = [parseFloat(category.value)];
                break;
            case 'position':
                text = `EXISTS (SELECT 1 FROM player_record pr_pos JOIN player_game pg ON pg.playerid = pr_pos.id WHERE pr_pos.playerid = ${alias} AND $${startingIndex} = ANY(pg.pos))`;
                values = [category.value];
                break;
            default:
                text = null;
                values = [];
                break;
        }
    }
    return { text, values };
};



app.get('/api/grid/:identifier', async (req, res) => {
    const { identifier } = req.params;
    const isCustom = !isNaN(identifier);

    try {
        let result;
        if (isCustom) {
            
            
            result = await pool.query('SELECT grid_data FROM grids WHERE id = $1 AND type = $2', [identifier, 'custom']);
        } else {
            
            result = await pool.query(
                'SELECT grid_data FROM grids WHERE type = $1 ORDER BY grid_date DESC LIMIT 1',
                [identifier]
            );
        }

        if (result.rows.length > 0) {
            const gridData = result.rows[0].grid_data;
            gridData.serverSessionId = serverSessionId;
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
    const { query } = req.query;
    if (!query || query.length < 3) return res.json([]);
    try {
        const sqlQuery = `
            SELECT p.id, p.firstname, p.lastname, p.dob
            FROM player p
            WHERE unaccent(p.firstname || ' ' || p.lastname) ILIKE unaccent($1)
            ORDER BY p.lastname, p.firstname
            LIMIT 20;
        `;
        const result = await pool.query(sqlQuery, [`%${query}%`]);

        
        const uniquePlayers = new Map();
        result.rows.forEach(p => {
            const mainId = playerMergeMap.get(p.id.toString()) || p.id.toString();
            if (!uniquePlayers.has(mainId)) {
                uniquePlayers.set(mainId, {
                    id: mainId, 
                    name: `${p.firstname} ${p.lastname}`,
                    year: p.dob
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
    const { playerName, playerId, categoryType, categoryValue } = req.query;
    if (!playerName || !playerId || !categoryType || !categoryValue) {
        return res.status(400).json({ error: 'Required parameters are missing.' });
    }

    const imageQuery = `
        SELECT COALESCE(
            (SELECT imglink FROM player_record pr2
             JOIN tournamentevent te2 ON te2.id = pr2.tournamentid
             WHERE pr2.playerid = $1 AND pr2.imglink != 'https://static.wbsc.org/assets/images/default-player.jpg'
             ORDER BY te2.year DESC, pr2.id ASC LIMIT 1),
            'https://static.wbsc.org/assets/images/default-player.jpg'
        ) AS imglink;
    `;

    const mainPlayerId = playerId;
    const allPlayerIds = [mainPlayerId, ...(merges.players[mainPlayerId] || [])];
    const playerPlaceholders = allPlayerIds.map((_, i) => `$${i + 1}`).join(',');

    const category = { type: categoryType, value: categoryValue };
    const cond = buildCondition(category, 'p', allPlayerIds.length + 1);
    
    if (!cond.text) {
        return res.status(400).json({ error: 'Invalid category type.' });
    }

    const query = `SELECT EXISTS (SELECT 1 FROM player p WHERE p.id IN (${playerPlaceholders}) AND ${cond.text});`;
    const queryParams = [...allPlayerIds, ...cond.values];

    try {
        const validationResult = await pool.query(query, queryParams);
        if (validationResult.rows[0].exists) {
            const imageResult = await pool.query(imageQuery, [playerId]);
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
    conditions.push(cond1.text);
    allValues.push(...cond1.values);

    const cond2 = buildCondition(cat2, 'p', allValues.length + 1);
    conditions.push(cond2.text);
    allValues.push(...cond2.values);

    const query = `SELECT DISTINCT p.firstname, p.lastname FROM player p WHERE ${conditions.join(' AND ')} ORDER BY p.lastname, p.firstname;`;
    
    try {
        const result = await pool.query(query, allValues);
        const players = result.rows.map(p => `${p.firstname} ${p.lastname}`);
        res.json({ players, count: players.length });
    } catch (error) {
        console.error("Error fetching cell answers:", error);
        res.status(500).json({ error: 'Failed to get answers.' });
    }
});

app.post('/api/grid', async (req, res) => {
    const { rows, cols } = req.body;
    if (!rows || !cols || rows.length !== 3 || cols.length !== 3) {
        return res.status(400).json({ error: 'Invalid grid data provided.' });
    }

    try {
        await pool.query("DELETE FROM grids WHERE type = 'custom' AND created_at < NOW() - INTERVAL '24 hours'");
    } catch (cleanupError) {
        console.error("Error during custom grid cleanup:", cleanupError);
    }

    try {
        const gridData = JSON.stringify({ rows, cols });
        const result = await pool.query(
            "INSERT INTO grids (type, grid_data) VALUES ('custom', $1) RETURNING id",
            [gridData]
        );
        res.json({ id: result.rows[0].id });
    } catch (error) {
        console.error('Error saving custom grid:', error);
        res.status(500).json({ error: 'Failed to save custom grid.' });
    }
});



app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});

