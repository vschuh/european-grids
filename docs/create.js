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

// --- New Dropdown Logic ---
function createDropdown(targetCell) {
    document.querySelector('.creator-dropdown')?.remove();

    const dropdown = document.createElement('div');
    dropdown.className = 'creator-dropdown';

    for (const groupName in categoryGroups) {
        // Create the top-level category (e.g., "National Teams")
        const groupHeader = document.createElement('div');
        groupHeader.className = 'category-group-header';
        groupHeader.textContent = groupName;
        dropdown.appendChild(groupHeader);
        
        // Create the hidden list for the second-level items
        const subList = document.createElement('ul');
        subList.className = 'sub-category-list';
        
        const categories = categoryGroups[groupName];
        categories.sort((a, b) => a.label.localeCompare(b.label));
        
        categories.forEach(cat => {
            const li = document.createElement('li');
            li.textContent = cat.label;
            li.onclick = () => selectCategory(targetCell, cat);
            subList.appendChild(li);
        });
        dropdown.appendChild(subList);

        // Add click event to show/hide the sub-list
        groupHeader.addEventListener('click', () => {
            const allSubLists = dropdown.querySelectorAll('.sub-category-list');
            // Hide all other lists before showing the new one
            allSubLists.forEach(list => {
                if (list !== subList) list.style.display = 'none';
            });
            // Toggle the clicked list
            subList.style.display = subList.style.display === 'block' ? 'none' : 'block';
        });
    }

    document.body.appendChild(dropdown);
    positionDropdown(targetCell, dropdown);

    // Close dropdown if clicking anywhere else on the page
    setTimeout(() => {
        document.addEventListener('click', (e) => {
            if (!dropdown.contains(e.target) && e.target !== targetCell) {
                dropdown.remove();
            }
        }, { once: true });
    }, 0);
}

function positionDropdown(target, dropdown) {
    const rect = target.getBoundingClientRect();
    dropdown.style.left = `${rect.left}px`;
    dropdown.style.top = `${rect.bottom + 5}px`;
}

function selectCategory(targetCell, category) {
    const targetId = targetCell.dataset.target;
    selectedCategories[targetId] = category;
    targetCell.textContent = category.label;
    targetCell.classList.add('selected');
    document.querySelector('.creator-dropdown')?.remove();
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
    'Innings Pitched': { type: 'seasonal_pitching_ip', unit: 'IP' },
};

for (const statName in baseStats) {
    const option = document.createElement('option');
    option.value = statName;
    option.textContent = statName;
    statTypeSelect.appendChild(option);
}

function openStatCreator() {
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
    alert("Custom stat added to the 'Player Stats' category!");
});

document.getElementById('cancel-stat-btn').addEventListener('click', () => {
    statCreatorModal.classList.add('modal-hidden');
});


document.querySelectorAll('.creator-cell.header').forEach(cell => {
    cell.addEventListener('click', (e) => {
        e.stopPropagation();
        createDropdown(cell);
    });
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
            const link = `${window.location.origin}/docs/index.html#${data.id}`;
            document.getElementById('share-link').value = link;
            document.getElementById('result-container').classList.remove('modal-hidden');
        }
    } catch (error) {
        console.error("Failed to create grid:", error);
        alert("Could not create grid. Please try again.");
    }
});

document.querySelectorAll('.creator-cell.header').forEach(cell => {
    cell.addEventListener('click', (e) => {
        e.stopPropagation();
        createDropdown(cell);
    });
})