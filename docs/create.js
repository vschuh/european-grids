import { nationalTeamCategories, italianClubCategories, dutchClubCategories, austrianClubCategories, belgianClubCategories, spanishClubCategories, czechClubCategories, frenchClubCategories, statCategories, tournamentCategories } from './categories.mjs';

const API_BASE_URL = 'https://european-grids-api.onrender.com';

// Group all categories for the modal
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
    "Player Stats": statCategories
};

let selectedCategories = {};
let activeTarget = null;

const categoryModal = document.getElementById('category-modal');
const mainCategoriesList = document.getElementById('main-categories');
const subCategoriesList = document.getElementById('sub-categories');
const level1 = document.getElementById('level-1');
const level2 = document.getElementById('level-2');
const backBtn = document.getElementById('back-to-main-cat');
const subCatTitle = document.getElementById('sub-category-title');

for (const groupName in categoryGroups) {
    const li = document.createElement('li');
    li.textContent = groupName;
    li.addEventListener('click', () => showSubCategories(groupName));
    mainCategoriesList.appendChild(li);
}

function showSubCategories(groupName) {
    subCatTitle.textContent = `Select a ${groupName}`;
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
    selectedCategories[activeTarget] = category;
    const button = document.querySelector(`.category-btn[data-target="${activeTarget}"]`);
    button.textContent = category.label;
    button.classList.add('selected');
    closeModal();
}

function openModal(target) {
    activeTarget = target;
    categoryModal.classList.remove('modal-hidden');
    level2.classList.add('modal-hidden');
    level1.classList.remove('modal-hidden');
}

function closeModal() {
    categoryModal.classList.add('modal-hidden');
}

document.querySelectorAll('.category-btn').forEach(btn => {
    btn.addEventListener('click', () => openModal(btn.dataset.target));
});

backBtn.addEventListener('click', () => {
    level2.classList.add('modal-hidden');
    level1.classList.remove('modal-hidden');
});

categoryModal.addEventListener('click', (e) => {
    if (e.target === categoryModal) closeModal();
});

document.getElementById('create-btn').addEventListener('click', async () => {
    if (Object.keys(selectedCategories).length < 6) {
        alert("Please select all 6 categories.");
        return;
    }
    const grid = {
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
            const link = `${window.location.origin}/#${data.id}`;
            document.getElementById('share-link').value = link;
            document.getElementById('result-container').style.display = 'block';
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
