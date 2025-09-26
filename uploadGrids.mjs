import 'dotenv/config';
import pg from 'pg';
const { Pool } = pg;

// Local DB config (reads from .env)
const localPool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_DATABASE,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
});

// Hosted DB config (reads from different .env variables)
const hostedPool = new Pool({
    user: process.env.AWS_DB_USER,
    host: process.env.AWS_DB_HOST,
    database: process.env.AWS_DB_DATABASE,
    password: process.env.AWS_DB_PASSWORD,
    port: process.env.AWS_DB_PORT,
    ssl: { require: true, rejectUnauthorized: false }
});

async function upload() {
    console.log('Fetching all recent grids (daily and country) from local DB...');
    
    // MODIFIED: Removed "WHERE type = 'daily'" to get ALL grid types
    const result = await localPool.query("SELECT * FROM grids WHERE grid_date >= CURRENT_DATE");
    const grids = result.rows;

    if (grids.length === 0) {
        console.log('No new grids to upload.');
        return;
    }

    console.log(`Found ${grids.length} grids to upload. Connecting to hosted DB...`);

    for (const grid of grids) {
        try {
            const query = `
                INSERT INTO grids (type, grid_date, grid_data) 
                VALUES ($1, $2, $3)
                ON CONFLICT (type, grid_date) DO NOTHING;
            `;
            // Use grid.type to upload the correct type ('daily', 'austria', etc.)
            await hostedPool.query(query, [grid.type, grid.grid_date, grid.grid_data]);
            console.log(`  -> Uploaded ${grid.type} grid for ${grid.grid_date.toISOString().split('T')[0]}`);
        } catch (error) {
            console.error(`  -> FAILED to upload grid for ${grid.grid_date}:`, error.message);
        }
    }

    console.log('Upload complete.');
    await localPool.end();
    await hostedPool.end();
}

upload();