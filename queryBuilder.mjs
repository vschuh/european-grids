import merges from './merges.json' with { type: 'json' };

export const buildCondition = (category, playerAlias = 'p', startingIndex = 1) => {
    const alias = `${playerAlias}.id`;
    let text = '';
    let values = [];
    const getOperator = (cat) => cat.condition === 'max' ? '<=' : '>=';

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
            values = []; 
            return { text, values };
        case 'perfect_game':
            text = `EXISTS (SELECT 1 FROM player_game pg JOIN player_record pr ON pg.playerid = pr.id WHERE pr.playerid = ${alias} and pg.pitch_cg = 1 and pg.pitch_h = 0 and pg.pitch_bb = 0 and pg.pitch_hbp = 0 and pg.pitch_ip ${getOperator(category)} $${startingIndex})`;
            values = [category.value];
            return { text, values };
        case 'no_hitter':
            text = `EXISTS (SELECT 1 FROM player_game pg JOIN player_record pr ON pg.playerid = pr.id WHERE pr.playerid = ${alias} and pg.pitch_cg = 1 and pg.pitch_h = 0 and pg.pitch_ip ${getOperator(category)} $${startingIndex})`;
            values = [category.value];
            return { text, values };
    }

    const [scope, ...statParts] = category.type.split('_');
    const statName = statParts.join('_');
    const summableHitting = { hits: 'h', homeruns: 'homerun', sb: 'sb', bb: 'bb', doubles: 'double', triples: 'triple', rbi: 'rbi', runs: 'r', hbp: 'hbp' };
    const summablePitching = { pitching_k: 'pitching_strikeout', pitching_ip: 'pitching_ip', pitching_hbp: 'pitching_hbp' };
    const gameCols = { h: 'h', hr: 'hr', rbi: 'rbi', k: 'pitch_so' };

    switch (scope) {
        case 'seasonal':
            if (summableHitting[statName] || summablePitching[statName]) {
                const col = { ...summableHitting, ...summablePitching }[statName];
                text = `EXISTS (SELECT 1 FROM player_record pr JOIN player_statistics ps ON pr.id = ps.player_record_id WHERE pr.playerid = ${alias} AND ps.${col} ${getOperator(category)} $${startingIndex})`;
                values = [category.value];
            } else {
                const rateStatQueries = {
                    'avg': `ps.avg ${getOperator(category)} $${startingIndex} AND ps.pa >= 10`,
                    'ops': `ps."OPS" ${getOperator(category)} $${startingIndex} AND ps.pa >= 10`,
                    'wOBA': `ps."wOBA" ${getOperator(category)} $${startingIndex} AND ps.pa >= 10`,
                    'pitching_era': `ps.pitching_era ${getOperator(category)} $${startingIndex} AND ps.pitching_ip >= 90`,
                    'pitching_fip': `ps.pitching_fip ${getOperator(category)} $${startingIndex} AND ps.pitching_ip >= 90`
                };
                if (rateStatQueries[statName]) {
                    text = `EXISTS (SELECT 1 FROM player_record pr JOIN player_statistics ps ON pr.id = ps.player_record_id WHERE pr.playerid = ${alias} AND ${rateStatQueries[statName]})`;
                    values = [category.value];
                }
            }
            break;
        case 'year':
            if (summableHitting[statName] || summablePitching[statName]) {
                const col = { ...summableHitting, ...summablePitching }[statName];
                text = `EXISTS (SELECT 1 FROM player_record pr JOIN player_statistics ps ON pr.id = ps.player_record_id JOIN tournamentevent te ON pr.tournamentid = te.id WHERE pr.playerid = ${alias} GROUP BY te.year HAVING SUM(ps.${col}) ${getOperator(category)} $${startingIndex})`;
                values = [category.value];
            } else {
                const yearlyRateStatQueries = {
                    'avg': `SUM(ps.pa) >= 30 AND (SUM(ps.h)::decimal / NULLIF(SUM(ps.ab), 0)) ${getOperator(category)} $${startingIndex}`,
                    'pitching_era': `SUM(ps.pitching_ip) >= 90 AND ((SUM(ps.pitching_er) * 27) / NULLIF(SUM(ps.pitching_ip), 0)) ${getOperator(category)} $${startingIndex}`
                };
                if(yearlyRateStatQueries[statName]) {
                    text = `EXISTS (SELECT 1 FROM player_record pr JOIN player_statistics ps ON pr.id = ps.player_record_id JOIN tournamentevent te ON pr.tournamentid = te.id WHERE pr.playerid = ${alias} GROUP BY te.year HAVING ${yearlyRateStatQueries[statName]})`;
                    values = [category.value];
                }
            }
            break;
        case 'career':
            if (summableHitting[statName] || summablePitching[statName]) {
                const col = { ...summableHitting, ...summablePitching }[statName];
                text = `(SELECT SUM(ps.${col}) FROM player_statistics ps JOIN player_record pr ON ps.player_record_id = pr.id WHERE pr.playerid = ${alias}) ${getOperator(category)} $${startingIndex}`;
                values = [category.value];
            } else {
                 const careerRateStatQueries = {
                    'avg': `(SELECT SUM(ps.pa) >= 100 AND (SUM(ps.h)::decimal / NULLIF(SUM(ps.ab), 0)) ${getOperator(category)} $${startingIndex} FROM player_record pr JOIN player_statistics ps ON pr.id = ps.player_record_id WHERE pr.playerid = ${alias})`,
                    'pitching_era': `(SELECT SUM(ps.pitching_ip) >= 300 AND ((SUM(ps.pitching_er) * 27) / NULLIF(SUM(ps.pitching_ip), 0)) ${getOperator(category)} $${startingIndex} FROM player_record pr JOIN player_statistics ps ON pr.id = ps.player_record_id WHERE pr.playerid = ${alias})`
                };
                if(careerRateStatQueries[statName]) {
                    text = careerRateStatQueries[statName];
                    values = [category.value];
                }
            }
            break;
        case 'game':
            if (gameCols[statName]) {
                text = `EXISTS (SELECT 1 FROM player_game pg JOIN player_record pr ON pg.playerid = pr.id WHERE pr.playerid = ${alias} AND pg.${gameCols[statName]} ${getOperator(category)} $${startingIndex})`;
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