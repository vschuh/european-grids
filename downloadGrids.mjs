import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import pg from 'pg';
const { Pool } = pg;

// Connects to your HOSTED AWS database using the CORRECT DB_ variables
const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_DATABASE,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
    ssl: { require: true, rejectUnauthorized: false }
});

async function downloadAndSaveGrids() {
    console.log('--- Starting Grid Download ---');
    
    const outputDir = path.join('docs', 'grids');
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    try {
        console.log('Fetching all future-dated grids from the database...');
        const result = await pool.query("SELECT type, grid_date, grid_data FROM grids WHERE grid_date >= CURRENT_DATE");
        const grids = result.rows;

        if (grids.length === 0) {
            console.log('No new grids to download.');
            return;
        }

        console.log(`Found ${grids.length} grids to save.`);

        grids.forEach(grid => {
            const dateString = grid.grid_date.toISOString().split('T')[0];
            const fileName = `${grid.type}_${dateString}.json`;
            const filePath = path.join(outputDir, fileName);
            fs.writeFileSync(filePath, JSON.stringify(grid.grid_data, null, 2));
            console.log(`  -> Saved ${fileName}`);
        });

    } catch (error) {
        console.error('Error during grid download:', error);
    } finally {
        await pool.end();
        console.log('--- Grid Download Finished ---');
    }
}

downloadAndSaveGrids();