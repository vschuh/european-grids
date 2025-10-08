import 'dotenv/config';
import pg from 'pg';
import { buildCondition } from './queryBuilder.mjs';

const { Pool } = pg;


const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_DATABASE,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
    // MODIFICATION: This new line correctly enables/disables SSL
    ssl: process.env.DB_HOST === 'localhost' ? false : { require: true, rejectUnauthorized: false }
});

async function checkIntersection(cat1, cat2, pool) {
    let allValues = [];
    let conditions = [];
    
    const cond1 = buildCondition(cat1, 'p', 1);
    if (!cond1 || !cond1.text) return { count: 0 };
    conditions.push(cond1.text);
    allValues.push(...cond1.values);

    const cond2 = buildCondition(cat2, 'p', allValues.length + 1);
    if (!cond2 || !cond2.text) return { count: 0 };
    conditions.push(cond2.text);
    allValues.push(...cond2.values);

    const query = `SELECT COUNT(DISTINCT p.id) FROM player p WHERE ${conditions.join(' AND ')};`;
    
    try {
        const result = await pool.query(query, allValues);
        return { count: parseInt(result.rows[0].count) };
    } catch (error) {
        console.error("\n--- SQL ERROR IN checkIntersection ---", { query, allValues, error: error.message });
        return { count: 0 };
    }
}

async function backfill() {
    console.log('--- Starting Answer Count Backfill Script ---');
    
    // Find all grids that DO NOT have the 'answers' key in their grid_data
    const staleGridsResult = await pool.query(
        "SELECT id, type, grid_date, grid_data FROM grids WHERE NOT (grid_data ? 'answers') AND grid_date >= CURRENT_DATE"
    );
    const staleGrids = staleGridsResult.rows;

    if (staleGrids.length === 0) {
        console.log('✅ No grids found that need updating. All grids have answer counts.');
        await pool.end();
        return;
    }

    console.log(`Found ${staleGrids.length} grids to update...`);

    for (const grid of staleGrids) {
        const dateString = grid.grid_date.toISOString().split('T')[0];
        console.log(` -> Processing grid ${grid.type} for ${dateString}...`);
        
        const { rows, cols } = grid.grid_data;
        const answerCounts = {};

        // Calculate the answer count for all 9 cells
        for (let i = 0; i < 3; i++) {
            for (let j = 0; j < 3; j++) {
                const rowCat = rows[i];
                const colCat = cols[j];
                const { count } = await checkIntersection(rowCat, colCat, pool);
                answerCounts[`${i}-${j}`] = count;
            }
        }

        // Add the new 'answers' object to the existing grid_data
        const newGridData = { ...grid.grid_data, answers: answerCounts };
        
        // Update the row in the database with the enhanced grid_data
        await pool.query(
            "UPDATE grids SET grid_data = $1 WHERE id = $2",
            [JSON.stringify(newGridData), grid.id]
        );
        console.log(`    ... Done.`);
    }

    console.log('\n--- Backfill Complete! ---');
    await pool.end();
}

backfill().catch(err => {
    console.error("An error occurred during the backfill process:", err);
    pool.end();
});