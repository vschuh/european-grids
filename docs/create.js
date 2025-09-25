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
    nationalityCategories
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
    "Tournaments": tournamentCategories,
    "Player Stats": statCategories,
    "Nationalities": nationalityCategories,
    "Years": yearCategories
};

let selectedCategories = {};
let activeTargetCell = null;

const categoryModal = document.getElementById('category-modal');
const mainCategoriesList = document.getElementById('main-categories-list');
const subCategoriesList = document.getElementById('sub-categories-list');
const level1 = document.getElementById('level-1');
const level2 = document.getElementById('level-2');
const backBtn = document.getElementById('back-to-main-cat-btn');
const subCatTitle = document.getElementById('sub-category-title');

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

    level1.classList.add('modal-hidden');
    level2.classList.remove('modal-hidden');
}

function selectCategory(category) {
    const targetId = activeTargetCell.dataset.target;
    selectedCategories[targetId] = category;
    activeTargetCell.textContent = category.label;
    activeTargetCell.classList.add('selected');
    closeCategoryModal();
}

function openCategoryModal(cell) {
    activeTargetCell = cell;
    categoryModal.classList.remove('modal-hidden');
    level2.classList.add('modal-hidden');
    level1.classList.remove('modal-hidden');
}

function closeCategoryModal() {
    categoryModal.classList.add('modal-hidden');
}


const statCreatorModal = document.getElementById('stat-creator-modal');
const statTypeSelect = document.getElementById('stat-type-select');
const statConditionSelect = document.getElementById('stat-condition-select');
const statValueInput = document.getElementById('stat-value-input');

const baseStats = {
    'Home Runs': { type: 'seasonal_homeruns', unit: 'HR' },
    'Hits': { type: 'seasonal_hits', unit: 'Hits' },
    'Stolen Bases': { type: 'seasonal_sb', unit: 'SB' },
    'Walks (BB)': { type: 'seasonal_bb', unit: 'BB' },
    'Doubles': { type: 'seasonal_doubles', unit: 'Doubles' },
    'Triples': { type: 'seasonal_triples', unit: 'Triples' },
    'RBIs': { type: 'seasonal_rbi', unit: 'RBI' },
    'Runs': { type: 'seasonal_runs', unit: 'Runs' },
    'Pitching Ks': { type: 'seasonal_pitching_k', unit: 'Ks' },
    'Innings Pitched': { type: 'seasonal_pitching_ip', unit: 'IP' }
};

for (const statName in baseStats) {
    const option = document.createElement('option');
    option.value = statName;
    option.textContent = statName;
    statTypeSelect.appendChild(option);
}

function openStatCreator() {
    closeCategoryModal();
    statCreatorModal.classList.remove('modal-hidden');
}

document.getElementById('add-stat-btn').addEventListener('click', () => {
    const statName = statTypeSelect.value;
    const condition = statConditionSelect.value;
    const value = parseFloat(statValueInput.value);
    const baseStat = baseStats[statName];

    const conditionLabel = condition === 'min' ? '>=' : '<=';
    const newLabel = `${conditionLabel} ${value} ${baseStat.unit} Season`;

    const newStatCategory = {
        label: newLabel,
        type: baseStat.type, 
        value: value
    };

    categoryGroups["Player Stats"].push(newStatCategory);
    statCreatorModal.classList.add('modal-hidden');
    openCategoryModal(activeTargetCell);
});

document.getElementById('cancel-stat-btn').addEventListener('click', () => {
    statCreatorModal.classList.add('modal-hidden');
});

document.querySelectorAll('.creator-cell.header').forEach(cell => {
    cell.addEventListener('click', () => openCategoryModal(cell));
});

backBtn.addEventListener('click', () => {
    level2.classList.add('modal-hidden');
    level1.classList.remove('modal-hidden');
});

categoryModal.addEventListener('click', (e) => {
    if (e.target.id === 'category-container' || e.target.closest('#category-container')) return;
    closeCategoryModal();
});

document.getElementById('create-btn').addEventListener('click', async () => {
    if (Object.keys(selectedCategories).length < 6) {
        alert("Please select all 6 categories.");
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
            const link = `${window.location.protocol}//${window.location.host}${window.location.pathname.replace('create.html', 'index.html')}#${data.id}`;
            document.getElementById('share-link').value = link;
            document.getElementById('result-container').classList.remove('modal-hidden');
        }
    } catch (error) {
        console.error("Failed to create grid:", error);
        alert("Could not create grid. Please try again.");
    }
});

document.getElementById('copy-btn').addEventListener('click', () => {
    const linkInput = document.getElementById('share-link');
    linkInput.select();
    document.execCommand('copy');
});