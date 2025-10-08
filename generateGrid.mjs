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
    miscCategories,
    euClubCategories
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

async function findValidGrid(pools, templates, pool) {
    shuffle(templates);

    for (const template of templates) {
        const availablePools = JSON.parse(JSON.stringify(pools));
        Object.values(availablePools).forEach(shuffle);
        
        for (let attempt = 0; attempt < 500; attempt++) {
            const attemptPools = JSON.parse(JSON.stringify(availablePools));

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
                        attemptPools[colType].splice(i, 1);
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
                const answerCounts = {};
                for (let i = 0; i < 3; i++) {
                    for (let j = 0; j < 3; j++) {
                        const rowCat = finalGridRows[i];
                        const colCat = finalGridCols[j];
                        const { count } = await checkIntersection(rowCat, colCat, pool);
                        answerCounts[`${i}-${j}`] = count;
                    }
                }
                return { success: true, rows: finalGridRows, cols: finalGridCols, answers: answerCounts };
            }
        }
    }
    return { success: false };
}


async function main() {
    console.log('--- Starting Grid Generation Script ---');

    const pool = new Pool({
        user: process.env.DB_USER, host: process.env.DB_HOST, database: process.env.DB_DATABASE,
        password: process.env.DB_PASSWORD, port: process.env.DB_PORT,
    });
    
    const teamDataResult = await pool.query('SELECT id, name, flag FROM team');
    const teamDataMap = new Map(teamDataResult.rows.map(t => [t.id.toString(), { name: t.name, flag: t.flag }]));
    const enrich = (catArray) => catArray.map(cat => ({ ...cat, value: cat.value.toString() }));
    const processCategory = (cat) => cat.type === 'team' ? { ...cat, image: teamDataMap.get(cat.value)?.flag || null } : cat;


    const COUNTRIES = [
        { name: 'wbsc_eu', clubs: euClubCategories, federation_ids: [278] },
        // { name: 'wbsc_global', clubs: [], federation_ids: [0] }, // MODIFICATION: Added placeholder for global
        { name: 'austria', clubs: austrianClubCategories, federation_ids: [8] },
        { name: 'netherlands', clubs: dutchClubCategories, federation_ids: [1] },
        { name: 'italy', clubs: italianClubCategories, federation_ids: [2] },
        { name: 'czechia', clubs: czechClubCategories, federation_ids: [6, 148] },
        { name: 'belgium', clubs: belgianClubCategories, federation_ids: [143] },
        { name: 'france', clubs: frenchClubCategories, federation_ids: [14] },
        { name: 'spain', clubs: spanishClubCategories, federation_ids: [39] }
    ];
    const INTERNATIONAL_GRIDS = ['wbsc_eu', 'wbsc_global'];

    const dailyTemplates = [ { rows: ['T', 'T', 'R'], cols: ['N', 'S', 'S'] }, { rows: ['T', 'N', 'S'], cols: ['T', 'R', 'S'] }, { rows: ['T', 'A', 'S'], cols: ['T', 'R', 'S'] }, { rows: ['R', 'S', 'T'], cols: ['T', 'A', 'N'] }, { rows: ['T', 'S', 'R'], cols: ['A', 'Y', 'N'] }, { rows: ['T', 'T', 'N'], cols: ['S', 'S', 'R'] }];
    const countryTemplates = [ { rows: ['T', 'T', 'R'], cols: ['S', 'Y', 'N'] }, { rows: ['S', 'A', 'Y'], cols: ['T', 'T', 'R'] }, { rows: ['T', 'T', 'N'], cols: ['S', 'S', 'R'] }, { rows: ['S', 'Y', 'A'], cols: ['T', 'T', 'N'] }];
    const internationalTemplates = [
        { rows: ['U', 'U', 'U'], cols: ['R', 'R', 'S'] },
        { rows: ['U', 'U', 'U'], cols: ['R', 'S', 'Y'] },
        { rows: ['R', 'R', 'S'], cols: ['U', 'U', 'U'] },
        { rows: ['R', 'S', 'Y'], cols: ['U', 'U', 'U'] }
    ];


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




for (let i = 0; i < 100; i++) {
    const gridDate = new Date();
    gridDate.setUTCDate(gridDate.getUTCDate() + i);
    const dateString = gridDate.toISOString().split('T')[0];

    console.log(`\n--- [BATCH] Generating grids for date: ${dateString} ---`);

    const processAndSaveGrid = async (type, masterPool, templates) => {
        const check = await pool.query('SELECT 1 FROM grids WHERE type = $1 AND grid_date = $2', [type, dateString]);
        if (check.rows.length > 0) {
            console.log(`Skipping '${type}' for ${dateString}, grid already exists.`);
            return;
        }

        console.log(`--- Trying to generate grid for: ${type} on ${dateString} ---`);
        const result = await findValidGrid(masterPool, templates, pool);

        if (result.success) {
            const goldenGrid = {
                rows: result.rows.map(processCategory),
                cols: result.cols.map(processCategory),
                answers: result.answers 
            };
            await pool.query('INSERT INTO grids (type, grid_date, grid_data) VALUES ($1, $2, $3)', [type, dateString, JSON.stringify(goldenGrid)]);
            console.log(` Grid for ${type} on ${dateString} saved to the database.`);
        } else {
            console.log(`\n Failed to find a valid grid for ${type} on ${dateString} after all attempts.`);
        }
    };

    await processAndSaveGrid('daily', masterDailyPools, dailyTemplates);

    for (const country of COUNTRIES) {
        if (INTERNATIONAL_GRIDS.includes(country.name)) {
            const internationalPool = {
                U: [...enrich(country.clubs || []), ...enrich(nationalTeamCategories)],
                R: enrich(tournamentCategories.filter(c => country.federation_ids.includes(c.federation_id))),
                S: [...statCategories, ...miscCategories],
                Y: yearCategories
            };
            await processAndSaveGrid(country.name, internationalPool, internationalTemplates);
        } else {
            await processAndSaveGrid(country.name, masterCountryPoolsMap.get(country.name), countryTemplates);
        }
    }
}

    await pool.end();
    console.log("\n--- All grid generation complete. ---");
}

main().catch(error => {
    console.error("An unhandled error occurred in the main script:", error);
});