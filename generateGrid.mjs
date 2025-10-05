import 'dotenv/config';
import pg from 'pg';
import {
    nationalTeamCategories,
    italianClubCategories,
    dutchClubCategories,
    austrianClubCategories,
    belgianClubCategories,
    spanishClubCategories,
    czechClubCategories,
    frenchClubCategories,
    statCategories,
    tournamentCategories,
    yearCategories,
    nationalityCategories,
    miscCategories
} from './docs/categories.mjs';
import { buildCondition } from './queryBuilder.mjs';

const { Pool } = pg;

function shuffle(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
}

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

/**
 * Finds a valid grid combination from the given lists of specific items.
 * This function is fast and does NOT permanently change the lists it's given.
 * @returns {Promise<{success: boolean, rows?: object[], cols?: object[]}>}
 */
async function findValidGrid(pools, templates, pool) {
    shuffle(templates);

    for (const template of templates) {
        // Create a temporary, shallow copy of the lists for this template attempt.
        const availablePools = {
            T: [...pools.T], N: [...pools.N], R: [...pools.R],
            S: [...pools.S], A: [...pools.A], Y: [...pools.Y]
        };
        Object.values(availablePools).forEach(shuffle);

        
        for (let attempt = 0; attempt < 500; attempt++) {
            const attemptPools = {
                T: [...availablePools.T], N: [...availablePools.N], R: [...availablePools.R],
                S: [...availablePools.S], A: [...availablePools.A], Y: [...availablePools.Y]
            };

            const anchorType = template.rows[0];
            if (attemptPools[anchorType].length === 0) break;
            const anchorCat = attemptPools[anchorType].pop();

            const colTypes = template.cols;
            let compatibleCols = [];
            
            for (const colType of colTypes) {
                let foundCompatibleCol = false;
                shuffle(attemptPools[colType]);

                for (let i = 0; i < attemptPools[colType].length; i++) {
                    const colCat = attemptPools[colType][i];
                    if (colCat.value === anchorCat.value) continue;

                    const { count } = await checkIntersection(anchorCat, colCat, pool);
                    if (count >= 3) {
                        compatibleCols.push(colCat);
                        attemptPools[colType].splice(i, 1); // Remove the used item for this attempt.
                        foundCompatibleCol = true;
                        break;
                    }
                }
                if (!foundCompatibleCol) break;
            }

            if (compatibleCols.length < 3) continue;

            const remainingRowTypes = template.rows.slice(1);
            let remainingRows = [];
            let usedValues = new Set([anchorCat.value, ...compatibleCols.map(c => c.value)]);

            for (const rowType of remainingRowTypes) {
                const candidateIndex = attemptPools[rowType].findIndex(r => !usedValues.has(r.value));
                if (candidateIndex > -1) {
                    const candidate = attemptPools[rowType].splice(candidateIndex, 1)[0];
                    remainingRows.push(candidate);
                    usedValues.add(candidate.value);
                }
            }
            if (remainingRows.length < 2) continue;
            
            const finalGridRows = [anchorCat, ...remainingRows];
            const finalGridCols = compatibleCols;

            let isGridValid = true;
            for (const rowCat of remainingRows) {
                for (const colCat of finalGridCols) {
                    const { count } = await checkIntersection(rowCat, colCat, pool);
                    if (count < 3) {
                        isGridValid = false;
                        break;
                    }
                }
                if (!isGridValid) break;
            }

            if (isGridValid) {
                // SUCCESS: Return the list of specific items used.
                return { success: true, rows: finalGridRows, cols: finalGridCols };
            }
        }
    }
    // FAILURE: No valid grid was found.
    return { success: false };
}

async function main() {
    console.log('--- Starting Grid Generation Script ---');

    const pool = new Pool({
        user: process.env.DB_USER, host: process.env.DB_HOST, database: process.env.DB_DATABASE,
        password: process.env.DB_PASSWORD, port: process.env.DB_PORT,
    });
    
    console.log("Fetching all team data...");
    const teamDataResult = await pool.query('SELECT id, name, flag FROM team');
    const teamDataMap = new Map(teamDataResult.rows.map(t => [t.id.toString(), { name: t.name, flag: t.flag }]));
    console.log("Successfully fetched all team data.");

    const enrich = (catArray) => catArray.map(cat => ({ ...cat, value: cat.value.toString() }));
    
    const dailyTemplates = [ { rows: ['T', 'T', 'R'], cols: ['N', 'S', 'S'] }, { rows: ['T', 'N', 'S'], cols: ['T', 'R', 'S'] }, { rows: ['T', 'A', 'S'], cols: ['T', 'R', 'S'] }, { rows: ['R', 'S', 'T'], cols: ['T', 'A', 'N'] }, { rows: ['T', 'S', 'R'], cols: ['A', 'Y', 'N'] }, { rows: ['T', 'T', 'N'], cols: ['S', 'S', 'R'] }];
    const countryTemplates = [ { rows: ['T', 'T', 'R'], cols: ['S', 'Y', 'N'] }, { rows: ['S', 'A', 'Y'], cols: ['T', 'T', 'R'] }, { rows: ['T', 'T', 'N'], cols: ['S', 'S', 'R'] }, { rows: ['S', 'Y', 'A'], cols: ['T', 'T', 'N'] }];
    const COUNTRIES = [ { name: 'austria', federation_ids: [8], clubs: austrianClubCategories }, { name: 'netherlands', federation_ids: [1], clubs: dutchClubCategories }, { name: 'italy', federation_ids: [2], clubs: italianClubCategories }, { name: 'czechia', federation_ids: [6, 148], clubs: czechClubCategories }, { name: 'belgium', federation_ids: [143], clubs: belgianClubCategories }, { name: 'france', federation_ids: [14], clubs: frenchClubCategories }, { name: 'spain', federation_ids: [39], clubs: spanishClubCategories }];

    const masterDailyPools = {
        T: enrich([...italianClubCategories, ...dutchClubCategories, ...austrianClubCategories, ...belgianClubCategories, ...spanishClubCategories, ...czechClubCategories, ...frenchClubCategories]),
        N: enrich(nationalTeamCategories), R: enrich(tournamentCategories), S: [...statCategories, ...miscCategories], A: nationalityCategories, Y: yearCategories
    };
    const masterCountryPoolsMap = new Map();
    for (const country of COUNTRIES) {
        masterCountryPoolsMap.set(country.name, {
            T: enrich(country.clubs || []),
            N: enrich(nationalTeamCategories.filter(c => country.federation_ids.includes(c.federation_id))),
            R: enrich(tournamentCategories.filter(c => country.federation_ids.includes(c.federation_id))),
            S: [...statCategories, ...miscCategories], A: nationalityCategories, Y: yearCategories
        });
    }
    let workingDailyPools = JSON.parse(JSON.stringify(masterDailyPools));
    let workingCountryPoolsMap = JSON.parse(JSON.stringify(Object.fromEntries(masterCountryPoolsMap)));
    
    const processCategory = (cat) => cat.type === 'team' ? { ...cat, image: teamDataMap.get(cat.value)?.flag || null } : cat;

    for (let i = 0; i < 100; i++) {
        const gridDate = new Date();
        gridDate.setUTCDate(gridDate.getUTCDate() + i);
        const dateString = gridDate.toISOString().split('T')[0];
        
        console.log(`\n--- [BATCH] Generating grids for date: ${dateString} ---`);

        // --- Daily Grid ---
        const dailyCheck = await pool.query('SELECT 1 FROM grids WHERE type = $1 AND grid_date = $2', ['daily', dateString]);
        if (dailyCheck.rows.length > 0) {
            console.log(`Skipping 'daily' for ${dateString}, grid already exists.`);
        } else {
            console.log(`--- Trying to generate grid for: daily on ${dateString} ---`);
            const result = await findValidGrid(workingDailyPools, dailyTemplates, pool);

            if (result.success) {
                const usedValues = new Set([...result.rows.map(c => c.value), ...result.cols.map(c => c.value)]);
                for (const key in workingDailyPools) {
                    workingDailyPools[key] = workingDailyPools[key].filter(c => !usedValues.has(c.value));
                }
                const goldenGrid = { rows: result.rows.map(processCategory), cols: result.cols.map(processCategory) };
                await pool.query('INSERT INTO grids (type, grid_date, grid_data) VALUES ($1, $2, $3)', ['daily', dateString, JSON.stringify(goldenGrid)]);
                console.log(` Grid for daily on ${dateString} saved to the database.`);
            } else {
                console.log(`\n Failed to find a valid grid for daily on ${dateString} after all attempts.`);
                console.log(`-> Resetting list of specific items for 'daily' for the next attempt.`);
                workingDailyPools = JSON.parse(JSON.stringify(masterDailyPools));
            }
        }

        
        for (const country of COUNTRIES) {
            const countryCheck = await pool.query('SELECT 1 FROM grids WHERE type = $1 AND grid_date = $2', [country.name, dateString]);
            if (countryCheck.rows.length > 0) {
                console.log(`Skipping '${country.name}' for ${dateString}, grid already exists.`);
            } else {
                console.log(`--- Trying to generate grid for: ${country.name} on ${dateString} ---`);
                const workingPools = workingCountryPoolsMap[country.name];
                const result = await findValidGrid(workingPools, countryTemplates, pool);

                if (result.success) {
                    const usedValues = new Set([...result.rows.map(c => c.value), ...result.cols.map(c => c.value)]);
                    for (const key in workingPools) {
                        workingPools[key] = workingPools[key].filter(c => !usedValues.has(c.value));
                    }
                    const goldenGrid = { rows: result.rows.map(processCategory), cols: result.cols.map(processCategory) };
                    await pool.query('INSERT INTO grids (type, grid_date, grid_data) VALUES ($1, $2, $3)', [country.name, dateString, JSON.stringify(goldenGrid)]);
                    console.log(` Grid for ${country.name} on ${dateString} saved to the database.`);
                } else {
                    console.log(`\n Failed to find a valid grid for ${country.name} on ${dateString} after all attempts.`);
                    console.log(`-> Resetting list of specific items for '${country.name}' for the next attempt.`);
                    workingCountryPoolsMap[country.name] = JSON.parse(JSON.stringify(masterCountryPoolsMap.get(country.name)));
                }
            }
        }
    }

    await pool.end();
    console.log("\n--- All grid generation complete. ---");
}

main().catch(error => {
    console.error("An unhandled error occurred in the main script:", error);
});