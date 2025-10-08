import { 
    nationalTeamCategories, italianClubCategories, dutchClubCategories, austrianClubCategories, 
    belgianClubCategories, spanishClubCategories, czechClubCategories, frenchClubCategories, 
    statCategories, tournamentCategories, yearCategories, nationalityCategories,miscCategories,euClubCategories,globalClubCategories
} from './categories.mjs';

const API_BASE_URL = 'https://european-grids-api.onrender.com';

const categoryGroups = {
    "National Teams": nationalTeamCategories,
    "Italian Clubs": italianClubCategories,
    "Dutch Clubs": dutchClubCategories,
    "Austrian Clubs": austrianClubCategories,
    "Belgian Clubs": belgianClubCategories,
    "Spanish Clubs": spanishClubCategories,
    "Czech Clubs": czechClubCategories,
    "French Clubs": frenchClubCategories,
    "INT EU Clubs": euClubCategories,
    "INT Global Clubs": globalClubCategories,
    "Tournaments": tournamentCategories,
    "Player Stats": statCategories,
    "Nationalities": nationalityCategories,
    "Years": yearCategories,
    "Misc": miscCategories
};

let selectedCategories = {};
let activeTargetCell = null;

const mainCategoryModal = document.getElementById('main-category-modal');
const subCategoryModal = document.getElementById('sub-category-modal');
const statCreatorModal = document.getElementById('stat-creator-modal');
const mainCategoriesList = document.getElementById('main-categories-list');
const subCategoriesList = document.getElementById('sub-categories-list');
const backToMainBtn = document.getElementById('back-to-main-cat-btn');
const subCatTitle = document.getElementById('sub-category-title');

const statScopeSelect = document.getElementById('stat-scope-select');
const statTypeSelect = document.getElementById('stat-type-select');
const statConditionSelect = document.getElementById('stat-condition-select');
const statValueInput = document.getElementById('stat-value-input');
const statCreatorHint = document.getElementById('stat-creator-hint');
const backFromStatBtn = document.getElementById('back-from-stat-creator-btn');
const copyNotification = document.getElementById('copy-notification');
let notificationTimeout;

mainCategoriesList.innerHTML = ''; 
for (const groupName in categoryGroups) {
    const li = document.createElement('li');
    li.textContent = groupName;
    li.addEventListener('click', () => showSubCategories(groupName));
    mainCategoriesList.appendChild(li);
}
const createStatLi = document.createElement('li');
createStatLi.textContent = "Create Custom Stat...";
createStatLi.style.color = "var(--accent-color)";
createStatLi.addEventListener('click', openStatCreator);
mainCategoriesList.appendChild(createStatLi);

function showSubCategories(groupName) {
    subCatTitle.textContent = `Select from ${groupName}`;
    subCategoriesList.innerHTML = '';
    const categories = categoryGroups[groupName];
    categories.sort((a, b) => a.label.localeCompare(b.label));

    categories.forEach(cat => {
        const li = document.createElement('li');
        li.textContent = cat.label;
        li.addEventListener('click', () => selectCategory(cat));
        subCategoriesList.appendChild(li);
    });

    mainCategoryModal.classList.add('modal-hidden');
    subCategoryModal.classList.remove('modal-hidden');
}

function selectCategory(category) {
    const targetId = activeTargetCell.dataset.target;
    selectedCategories[targetId] = category;
    activeTargetCell.textContent = category.label;
    activeTargetCell.classList.add('selected');

    mainCategoryModal.classList.add('modal-hidden');
    subCategoryModal.classList.add('modal-hidden');
    statCreatorModal.classList.add('modal-hidden');
}

const baseStats = {
    seasonal: {
        'Home Runs': { type: 'homeruns', unit: 'HR' }, 'Hits': { type: 'hits', unit: 'Hits' }, 'Stolen Bases': { type: 'sb', unit: 'SB' },
        'Walks (BB)': { type: 'bb', unit: 'BB' }, 'Doubles': { type: 'doubles', unit: '2B' }, 'Triples': { type: 'triples', unit: '3B' },
        'RBIs': { type: 'rbi', unit: 'RBI' }, 'Runs': { type: 'runs', unit: 'R' }, 'Hit by Pitches': { type: 'hbp', unit: 'HBP' },
        'Pitching Ks': { type: 'pitching_k', unit: 'K' }, 'Innings Pitched': { type: 'pitching_ip', unit: 'IP' }, 'Pitching HBPs': { type: 'pitching_hbp', unit: 'HBP' },
        'wOBA': { type: 'wOBA', unit: 'wOBA' }, 'AVG': { type: 'avg', unit: 'AVG' }, 'OPS': { type: 'ops', unit: 'OPS' },
        'ERA': { type: 'pitching_era', unit: 'ERA' }, 'FIP': { type: 'pitching_fip', unit: 'FIP' },
    },
    year: {
        'Home Runs': { type: 'homeruns', unit: 'HR' }, 'Hits': { type: 'hits', unit: 'Hits' }, 'Stolen Bases': { type: 'sb', unit: 'SB' },
        'Walks (BB)': { type: 'bb', unit: 'BB' }, 'Doubles': { type: 'doubles', unit: '2B' }, 'Triples': { type: 'triples', unit: '3B' },
        'RBIs': { type: 'rbi', unit: 'RBI' }, 'Runs': { type: 'runs', unit: 'R' }, 'Hit by Pitches': { type: 'hbp', unit: 'HBP' },
        'Pitching Ks': { type: 'pitching_k', unit: 'K' }, 'Innings Pitched': { type: 'pitching_ip', unit: 'IP' }, 'Pitching HBPs': { type: 'pitching_hbp', unit: 'HBP' },
    },
    career: {
        'Home Runs': { type: 'homeruns', unit: 'HR' }, 'Hits': { type: 'hits', unit: 'Hits' }, 'Stolen Bases': { type: 'sb', unit: 'SB' },
        'Walks (BB)': { type: 'bb', unit: 'BB' }, 'Doubles': { type: 'doubles', unit: '2B' }, 'Triples': { type: 'triples', unit: '3B' },
        'RBIs': { type: 'rbi', unit: 'RBI' }, 'Runs': { type: 'runs', unit: 'R' }, 'Hit by Pitches': { type: 'hbp', unit: 'HBP' },
        'Pitching Ks': { type: 'pitching_k', unit: 'K' }, 'Innings Pitched': { type: 'pitching_ip', unit: 'IP' }, 'Pitching HBPs': { type: 'pitching_hbp', unit: 'HBP' },
    },
    game: {
        'Hits': { type: 'h', unit: 'Hits' }, 'Home Runs': { type: 'hr', unit: 'HR' }, 'RBIs': { type: 'rbi', unit: 'RBI' },
        'Pitching Ks': { type: 'k', unit: 'K' }, 'Perfect Game': { type: 'perfect_game', unit: 'min IP' }, 'No Hitter': { type: 'no_hitter', unit: 'min IP' },
    }
};

function populateStatTypes() {
    const selectedScope = statScopeSelect.value;
    const statsForScope = baseStats[selectedScope];
    statTypeSelect.innerHTML = '';

    for (const statName in statsForScope) {
        const option = document.createElement('option');
        option.value = statName;
        option.textContent = statName;
        statTypeSelect.appendChild(option);
    }
}

statScopeSelect.addEventListener('change', populateStatTypes);
document.addEventListener('DOMContentLoaded', populateStatTypes);

function generateStatLabel(scope, statName, condition, value, unit) {
    const conditionLabel = condition === 'min' ? '>=' : '<=';
    let scopeLabel = '';
    switch (scope) {
        case 'seasonal': scopeLabel = 'Season'; break;
        case 'year': scopeLabel = 'in a single Year'; break;
        case 'career': scopeLabel = 'Career'; break;
        case 'game': scopeLabel = 'in a single Game'; break;
    }

    if (statName === 'Perfect Game' || statName === 'No Hitter') {
        return `${statName} (${conditionLabel} ${value} ${unit})`;
    }
    
    if (['wOBA', 'AVG', 'OPS', 'ERA', 'FIP'].includes(statName)) {
         return `${conditionLabel} ${value.toFixed(3)} ${statName} (${scopeLabel})`;
    }
    
    return `${conditionLabel} ${value} ${unit} (${scopeLabel})`;
}

function openStatCreator() {
    mainCategoryModal.classList.add('modal-hidden');
    statCreatorModal.classList.remove('modal-hidden');
}

document.getElementById('add-stat-btn').addEventListener('click', () => {
    const scope = statScopeSelect.value;
    const statName = statTypeSelect.value;
    const condition = statConditionSelect.value;
    const value = parseFloat(statValueInput.value);
    const baseStat = baseStats[scope][statName];
    
    const newStatCategory = { 
        type: `${scope}_${baseStat.type}`,
        value: value,
        condition: condition,
        label: generateStatLabel(scope, statName, condition, value, baseStat.unit)
    };
    selectCategory(newStatCategory);
});

document.querySelectorAll('.creator-cell.header').forEach(cell => {
    cell.addEventListener('click', () => {
        activeTargetCell = cell;
        mainCategoryModal.classList.remove('modal-hidden');
    });
});

backToMainBtn.addEventListener('click', () => {
    subCategoryModal.classList.add('modal-hidden');
    mainCategoryModal.classList.remove('modal-hidden');
});

backFromStatBtn.addEventListener('click', () => {
    statCreatorModal.classList.add('modal-hidden');
    mainCategoryModal.classList.remove('modal-hidden');
});

document.getElementById('cancel-stat-btn').addEventListener('click', () => {
    statCreatorModal.classList.add('modal-hidden');
});

mainCategoryModal.addEventListener('click', (e) => { if (e.target.id === 'main-category-modal') mainCategoryModal.classList.add('modal-hidden'); });
subCategoryModal.addEventListener('click', (e) => { if (e.target.id === 'sub-category-modal') subCategoryModal.classList.add('modal-hidden'); });
statCreatorModal.addEventListener('click', (e) => { if (e.target.id === 'stat-creator-modal') statCreatorModal.classList.add('modal-hidden'); });

statTypeSelect.addEventListener('change', () => {
    const selectedStatName = statTypeSelect.value;
    statCreatorHint.textContent = (selectedStatName === 'Perfect Game' || selectedStatName === 'No Hitter')
        ? `Value should be the minimum innings pitched in the game.`
        : "";
});

document.getElementById('create-btn').addEventListener('click', async () => {
    if (Object.keys(selectedCategories).length < 6) {
        alert("Please select all 6 categories before creating the grid.");
        return;
    }

    const grid = {
        name: document.getElementById('grid-name-input').value || 'Custom Grid',
        rows: [selectedCategories['row-1'], selectedCategories['row-2'], selectedCategories['row-3']],
        cols: [selectedCategories['col-1'], selectedCategories['col-2'], selectedCategories['col-3']]
    };

    try {
        const response = await fetch(`${API_BASE_URL}/api/grid`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(grid)
        });
        const data = await response.json();

        if (data.id) {
            const link = `https://www.euro-zones.com/${data.id}`;
            document.getElementById('share-link').value = link;
            document.getElementById('result-container').classList.remove('modal-hidden');
        } else {
            console.error("Server responded without a grid ID:", data);
            alert("An error occurred on the server. Please check the server logs.");
        }
    } catch (error) {
        console.error("Failed to create grid:", error);
        alert("Could not create grid. Please try again.");
    }
});

document.getElementById('copy-btn').addEventListener('click', () => {
    const linkInput = document.getElementById('share-link');
    linkInput.select();
    navigator.clipboard.writeText(linkInput.value).then(() => {
        clearTimeout(notificationTimeout);
        copyNotification.classList.remove('hidden');
        notificationTimeout = setTimeout(() => copyNotification.classList.add('hidden'), 2000);
    }).catch(err => console.error('Failed to copy text: ', err));
});