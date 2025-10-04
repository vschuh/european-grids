import 'dotenv/config';
import fs from 'fs';
import pg from 'pg';
const { Pool } = pg;
import merges from './merges.json' with { type: 'json' };

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

function shuffle(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
}

const buildCondition = (category, playerAlias = 'p', startingIndex = 1) => {
    const alias = `${playerAlias}.id`;
    let text = '';
    let values = [];
    const getOperator = (cat) => cat.condition === 'max' ? '<=' : '>=';

    // Handle non-stat, non-scoped categories first
    switch (category.type) {
        case 'team':
            const mainTeamId = category.value;
            const allTeamIds = [mainTeamId, ...(merges.teams[mainTeamId.toString()] || [])];
            const placeholders = allTeamIds.map((_, i) => `$${startingIndex + i}`).join(',');
            text = `EXISTS (SELECT 1 FROM player_record pr JOIN teamrecord tr ON pr.teamid=tr.id WHERE pr.playerid=${alias} AND tr.teamid::text IN (${placeholders}))`;
            values = allTeamIds;
            return { text, values };
        case 'tournament':
            text = `EXISTS (SELECT 1 FROM player_record pr JOIN tournamentevent te ON pr.tournamentid=te.id WHERE pr.playerid=${alias} AND te.category ILIKE $${startingIndex})`;
            values = [category.value];
            return { text, values };
        case 'year':
            text = `EXISTS (SELECT 1 FROM player_record pr JOIN tournamentevent te ON pr.tournamentid=te.id WHERE pr.playerid=${alias} AND te.year = $${startingIndex})`;
            values = [parseInt(category.value)];
            return { text, values };
        case 'nationality':
            text = `p.nationality = $${startingIndex}`;
            values = [category.value];
            return { text, values };
        case 'position':
            text = `EXISTS (SELECT 1 FROM player_record pr_pos JOIN player_game pg ON pg.playerid = pr_pos.id WHERE pr_pos.playerid = ${alias} AND $${startingIndex} = ANY(pg.pos))`;
            values = [category.value];
            return { text, values };
        case 'cycle':
            text = `EXISTS (SELECT 1 FROM player_game pg JOIN player_record pr ON pg.playerid = pr.id WHERE pr.playerid = ${alias} and (pg.h-pg.double-pg.triple-pg.hr) >= 1 and pg.double >= 1 and pg.triple >= 1 and pg.hr >= 1)`;
            values = [1];
            return { text, values };
    }

    // Handle new scoped stat categories
    const [scope, ...statParts] = category.type.split('_');
    const statName = statParts.join('_');

    const hittingCols = { hits: 'h', homeruns: 'homerun', sb: 'sb', bb: 'bb', doubles: 'double', triples: 'triple', rbi: 'rbi', runs: 'r', hbp: 'hbp' };
    const pitchingCols = { pitching_k: 'pitching_strikeout', pitching_ip: 'pitching_ip', pitching_hbp: 'pitching_hbp' };
    const advancedHitting = { wOBA: '"wOBA"', avg: 'avg', ops: '"OPS"' };
    const advancedPitching = { pitching_era: 'pitching_era', pitching_fip: 'pitching_fip' };
    const gameCols = { h: 'h', hr: 'hr', rbi: 'rbi', k: 'pitch_k' };

    switch (scope) {
        case 'seasonal':
            const allSeasonalCols = { ...hittingCols, ...pitchingCols, ...advancedHitting, ...advancedPitching };
            const seasonalCol = allSeasonalCols[statName];
            if (seasonalCol) {
                let qualifier = '';
                if (advancedHitting[statName]) qualifier = ' AND ps.pa >= 10';
                if (advancedPitching[statName]) qualifier = ' AND ps.pitching_ip >= 30';
                text = `EXISTS (SELECT 1 FROM player_record pr_stat JOIN player_statistics ps ON pr_stat.id = ps.player_record_id WHERE pr_stat.playerid = ${alias} AND ps.${seasonalCol} ${getOperator(category)} $${startingIndex}${qualifier})`;
                values = [category.value];
            }
            break;
        case 'year':
            const yearCol = { ...hittingCols, ...pitchingCols }[statName];
            if (yearCol) {
                text = `EXISTS (SELECT 1 FROM player_record pr JOIN player_statistics ps ON pr.id = ps.player_record_id JOIN tournamentevent te ON pr.tournamentid = te.id WHERE pr.playerid = ${alias} GROUP BY te.year HAVING SUM(ps.${yearCol}) ${getOperator(category)} $${startingIndex})`;
                values = [category.value];
            }
            break;
        case 'career':
            const careerCol = { ...hittingCols, ...pitchingCols }[statName];
            if (careerCol) {
                text = `(SELECT SUM(ps.${careerCol}) FROM player_statistics ps JOIN player_record pr ON ps.player_record_id = pr.id WHERE pr.playerid = ${alias}) ${getOperator(category)} $${startingIndex}`;
                values = [category.value];
            }
            break;
        case 'game':
            const gameCol = gameCols[statName];
            if (gameCol) {
                text = `EXISTS (SELECT 1 FROM player_game pg JOIN player_record pr ON pg.playerid = pr.id WHERE pr.playerid = ${alias} AND pg.${gameCol} ${getOperator(category)} $${startingIndex})`;
                values = [category.value];
            } else if (statName === 'perfect_game') {
                text = `EXISTS (SELECT 1 FROM player_game pg JOIN player_record pr ON pg.playerid = pr.id WHERE pr.playerid = ${alias} and pg.pitch_cg = 1 and pg.pitch_h = 0 and pg.pitch_bb = 0 and pg.pitch_hbp = 0 and pg.pitch_ip ${getOperator(category)} $${startingIndex})`;
                values = [category.value];
            } else if (statName === 'no_hitter') {
                text = `EXISTS (SELECT 1 FROM player_game pg JOIN player_record pr ON pg.playerid = pr.id WHERE pr.playerid = ${alias} and pg.pitch_cg = 1 and pg.pitch_h = 0 and pg.pitch_ip ${getOperator(category)} $${startingIndex})`;
                values = [category.value];
            }
            break;
    }
    return { text, values };
};

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
        console.error("\n--- SQL ERROR IN checkIntersection ---");
        console.error("Failed Query:", query);
        console.error("Failed Values:", allValues);
        console.error("Error Message:", error.message);
        return { count: 0 };
    }
}

async function generateAndSaveGrid(gridName, pools, templates, pool, teamDataMap, gridDate) {
    console.log(`--- Trying to generate grid for: ${gridName} on ${gridDate} ---`);
    shuffle(templates);

    const processCategory = (cat) => {
        if (cat.type === 'team') {
            const teamInfo = teamDataMap.get(cat.value.toString());
            return {
                label: cat.label,
                type: cat.type,
                value: cat.value,
                image: teamInfo ? teamInfo.flag : null
            };
        }
        return cat;
    };

    for (const template of templates) {
        let availablePools = {
            T: [...pools.T], N: [...pools.N], R: [...pools.R],
            S: [...pools.S], A: [...pools.A], Y: [...pools.Y]
        };
        Object.values(availablePools).forEach(shuffle);

        for (let attempt = 0; attempt < 250; attempt++) {
            const anchorType = template.rows[0];
            if (availablePools[anchorType].length === 0) break;
            const anchorCat = availablePools[anchorType].pop();

            const colTypes = template.cols;
            let compatibleCols = [];
            
            for (const colType of colTypes) {
                let foundCompatibleCol = false;
                
                let tempColPool = [...availablePools[colType]];
                shuffle(tempColPool);

                for (const colCat of tempColPool) {
                    if (colCat.value === anchorCat.value) continue;

                    const { count } = await checkIntersection(anchorCat, colCat, pool);
                    if (count >= 3) {
                        compatibleCols.push(colCat);
                        
                        availablePools[colType] = availablePools[colType].filter(c => c.value !== colCat.value);
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
                const candidate = availablePools[rowType].find(r => !usedValues.has(r.value));
                if (candidate) {
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
                const finalRowsProcessed = finalGridRows.map(processCategory);
                const finalColsProcessed = finalGridCols.map(processCategory);
                const goldenGrid = { rows: finalRowsProcessed, cols: finalColsProcessed };

                try {
                    const gridData = JSON.stringify(goldenGrid);
                    const query = `
                        INSERT INTO grids (type, grid_date, grid_data) 
                        VALUES ($1, $2, $3)
                        ON CONFLICT (type, grid_date) DO NOTHING;
                    `;
                    await pool.query(query, [gridName, gridDate, gridData]);
                    console.log(` Grid for ${gridName} on ${gridDate} saved to the database.`);
                    return; 
                } catch (dbError) {
                    console.error(` Failed to save grid to database:`, dbError);
                }
            }
        }
    }
    console.log(`\n Failed to find a valid grid for ${gridName} on ${gridDate} after all attempts.`);
}

async function main() {
    console.log('--- Starting Grid Generation Script ---');

    const pool = new Pool({
        user: process.env.DB_USER,
        host: process.env.DB_HOST,
        database: process.env.DB_DATABASE,
        password: process.env.DB_PASSWORD,
        port: process.env.DB_PORT,
    });
    
    console.log("Fetching all team data...");
    const teamDataResult = await pool.query('SELECT id, name, flag FROM team');
    const teamDataMap = new Map(teamDataResult.rows.map(t => [t.id.toString(), { name: t.name, flag: t.flag }]));
    console.log("Successfully fetched all team data.");

    const enrich = (catArray) => catArray.map(cat => ({ ...cat, value: cat.value.toString() }));
    
    const dailyTemplates = [
        { rows: ['T', 'T', 'R'], cols: ['N', 'S', 'S'] },
        { rows: ['T', 'N', 'S'], cols: ['T', 'R', 'S'] },
        { rows: ['T', 'A', 'S'], cols: ['T', 'R', 'S'] },
        { rows: ['R', 'S', 'T'], cols: ['T', 'A', 'N'] },
        { rows: ['T', 'S', 'R'], cols: ['A', 'Y', 'N'] },
        { rows: ['T', 'T', 'N'], cols: ['S', 'S', 'R'] }
    ];
    
    const countryTemplates = [
        { rows: ['T', 'T', 'R'], cols: ['S', 'Y', 'N'] },
        { rows: ['S', 'A', 'Y'], cols: ['T', 'T', 'R'] },
        { rows: ['T', 'T', 'N'], cols: ['S', 'S', 'R'] },
        { rows: ['S', 'Y', 'A'], cols: ['T', 'T', 'N'] }
    ];

    const dailyPools = {
        T: enrich([...italianClubCategories, ...dutchClubCategories, ...austrianClubCategories, ...belgianClubCategories, ...spanishClubCategories, ...czechClubCategories, ...frenchClubCategories]),
        N: enrich(nationalTeamCategories),
        R: enrich(tournamentCategories),
        S: [...statCategories, ...miscCategories],
        A: nationalityCategories,
        Y: yearCategories
    };

    const COUNTRIES = [
        { name: 'austria', federation_ids: [8], clubs: austrianClubCategories },
        { name: 'netherlands', federation_ids: [1], clubs: dutchClubCategories },
        { name: 'italy', federation_ids: [2], clubs: italianClubCategories },
        { name: 'czechia', federation_ids: [6, 148], clubs: czechClubCategories },
        { name: 'belgium', federation_ids: [143], clubs: belgianClubCategories },
        { name: 'france', federation_ids: [14], clubs: frenchClubCategories }
    ];
    for (let i = 0; i < 100; i++) {
        const gridDate = new Date();
        gridDate.setUTCDate(gridDate.getUTCDate() + i);
        const dateString = gridDate.toISOString().split('T')[0];
        
        console.log(`\n--- [BATCH] Checking grids for date: ${dateString} ---`);

        const dailyCheck = await pool.query('SELECT 1 FROM grids WHERE type = $1 AND grid_date = $2', ['daily', dateString]);
        if (dailyCheck.rows.length > 0) {
            console.log(`Skipping 'daily' for ${dateString}, grid already exists.`);
        } else {
            await generateAndSaveGrid('daily', dailyPools, dailyTemplates, pool, teamDataMap, dateString);
        }

        for (const country of COUNTRIES) {
            const countryCheck = await pool.query('SELECT 1 FROM grids WHERE type = $1 AND grid_date = $2', [country.name, dateString]);
            if (countryCheck.rows.length > 0) {
                console.log(`Skipping '${country.name}' for ${dateString}, grid already exists.`);
            } else {
                const countryPools = {
                    T: enrich(country.clubs || []),
                    N: enrich(nationalTeamCategories.filter(c => country.federation_ids.includes(c.federation_id))),
                    R: enrich(tournamentCategories.filter(c => country.federation_ids.includes(c.federation_id))),
                    S: [...statCategories, ...miscCategories],
                    A: nationalityCategories, 
                    Y: yearCategories
                };
                await generateAndSaveGrid(country.name, countryPools, countryTemplates, pool, teamDataMap, dateString);
            }
        }
    }

    await pool.end();
    console.log("\n--- All grid generation complete. ---");
}

main().catch(error => {
    console.error("An unhandled error occurred in the main script:", error);
});