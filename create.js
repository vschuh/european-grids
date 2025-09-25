import { nationalTeamCategories, italianClubCategories, dutchClubCategories, austrianClubCategories, belgianClubCategories, frenchClubCategories, tournamentCategories, statCategories } from './categories.js';

const API_BASE_URL = 'https://your-render-app-name.onrender.com'; // IMPORTANT: Use your live back-end URL

const allCategories = [
    ...nationalTeamCategories,
    ...italianClubCategories,
    ...dutchClubCategories,
    ...austrianClubCategories,
    ...belgianClubCategories,
    ...frenchClubCategories,
    ...tournamentCategories,
    ...statCategories
];


allCategories.sort((a, b) => a.label.localeCompare(b.label));

function populateDropdowns() {
    const selects = document.querySelectorAll('select');
    selects.forEach(select => {
        allCategories.forEach(cat => {
            const option = document.createElement('option');
            option.value = JSON.stringify(cat);
            option.textContent = cat.label;
            select.appendChild(option);
        });
    });
}

document.getElementById('create-btn').addEventListener('click', async () => {
    const grid = {
        rows: [
            JSON.parse(document.getElementById('row-1').value),
            JSON.parse(document.getElementById('row-2').value),
            JSON.parse(document.getElementById('row-3').value)
        ],
        cols: [
            JSON.parse(document.getElementById('col-1').value),
            JSON.parse(document.getElementById('col-2').value),
            JSON.parse(document.getElementById('col-3').value)
        ]
    };

    try {
        const response = await fetch(`${API_BASE_URL}/api/custom-grid`, {
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

populateDropdowns();