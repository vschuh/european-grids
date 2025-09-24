document.addEventListener('DOMContentLoaded', () => {
    const API_BASE_URL = 'http://localhost:3000';
    const gridContainer = document.getElementById('grid-container');
    const livesCountSpan = document.getElementById('lives-count');
    const giveUpBtn = document.getElementById('give-up-btn');
    const searchModal = document.getElementById('search-modal');
    const searchInput = document.getElementById('search-input');
    const searchResults = document.getElementById('search-results');
    const closeModalBtn = document.getElementById('close-modal-btn');
    const countryNav = document.getElementById('country-nav');
    const giveUpModal = document.getElementById('give-up-modal');
    const confirmGiveUpBtn = document.getElementById('confirm-give-up-btn');
    const cancelGiveUpBtn = document.getElementById('cancel-give-up-btn');

    let gridData = {};
    let gameState = {};
    let isGameOver = false;
    let activeCell = null;

    // --- STATE MANAGEMENT ---
    function getCountryCode() {
        return window.location.hash.substring(1) || 'daily';
    }

    function loadGameState(newSessionId) {
        const country = getCountryCode();
        const savedStateJSON = localStorage.getItem(`gridGameState_${country}`);
        const savedState = savedStateJSON ? JSON.parse(savedStateJSON) : null;
    
        if (!savedState || savedState.serverSessionId !== newSessionId) {
            gameState = {
                guesses: 9,
                guessedPlayerIds: [], // Renamed from guessedPlayers
                correctCells: {},
                serverSessionId: newSessionId
            };
        } else {
            gameState = savedState;
            // Ensure old states have the new property
            if (!gameState.guessedPlayerIds) {
                gameState.guessedPlayerIds = [];
            }
        }
        isGameOver = gameState.guesses <= 0;
    }

    function saveGameState() {
        const country = getCountryCode();
        localStorage.setItem(`gridGameState_${country}`, JSON.stringify(gameState));
    }

    function updateGuessesDisplay() {
        livesCountSpan.textContent = gameState.guesses;
    }

    async function renderGridFromState() {
        updateGuessesDisplay();
        document.querySelectorAll('.grid-cell').forEach(cell => {
            const cellId = `${cell.dataset.row}-${cell.dataset.col}`;
            if (gameState.correctCells[cellId]) {
                const data = gameState.correctCells[cellId];
                cell.innerHTML = `<div class="player-name-cell">${data.name}</div>`;
                //cell.innerHTML = `<img src="${data.image}" alt="${data.name}" class="player-image">`;
                cell.classList.add('correct');
            }
        });
    
        if (isGameOver) {
            
            for (const cell of document.querySelectorAll('.grid-cell:not(.correct)')) {
                const { row, col } = cell.dataset;
                const rowCat = gridData.rows[row];
                const colCat = gridData.cols[col];
                cell.classList.add('game-over-cell');
                try {
                    const response = await fetch(`${API_BASE_URL}/api/get-cell-answers`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ cat1: rowCat, cat2: colCat })
                    });
                    const { count } = await response.json();
    
                    if (count > 0) {
                        cell.innerHTML = `
                            <div class="answer-reveal-container">
                                <span class="player-count">${count}</span>
                                <div class="see-players-btn">See Players</div>
                            </div>
                        `;
                    } else {
                        cell.innerHTML = `<span class="answer-reveal">0</span>`;
                    }
                } catch (error) {
                    cell.innerHTML = `<span class="answer-reveal">!</span>`;
                }
            }
        }
    }
    
    async function showAllAnswersForCell(cell) {
        if (!gridData.rows || !isGameOver) return;
        const { row, col } = cell.dataset;
        const rowCat = gridData.rows[row];
        const colCat = gridData.cols[col];

        openSearchModal(cell);
        searchInput.style.display = 'none';
        searchResults.innerHTML = `<h3>Loading answers for ${rowCat.label} & ${colCat.label}...</h3>`;

        try {
            const response = await fetch(`${API_BASE_URL}/api/get-cell-answers`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ cat1: rowCat, cat2: colCat })
            });
            const { players } = await response.json();

            let answerHTML = `<h3>Answers for ${rowCat.label} & ${colCat.label}:</h3>`;
            if (players && players.length > 0) {
                answerHTML += '<ul>';
                players.forEach(player => { answerHTML += `<li>${player}</li>`; });
                answerHTML += '</ul>';
            } else {
                answerHTML += '<p>No players found for this intersection.</p>';
            }
            searchResults.innerHTML = answerHTML;
        } catch (error) {
            searchResults.innerHTML = '<h3>Error loading answers.</h3>';
        }
    }

    function gameOver(isGiveUp = false) {
        if (isGameOver) return;
        isGameOver = true;
        
        if (isGiveUp) {
            gameState.guesses = 0;
        }
        
        saveGameState();
        renderGridFromState(); 
    }
    
    function openSearchModal(cell) {
        activeCell = cell;
        searchInput.style.display = 'block';
        searchInput.placeholder = "Search for a player...";
        searchModal.classList.remove('modal-hidden');
        searchInput.focus();
    }

    function closeSearchModal() {
        activeCell = null;
        searchInput.value = '';
        searchResults.innerHTML = '';
        searchModal.classList.add('modal-hidden');
    }

    async function handleSearch() {
        const query = searchInput.value;
        if (query.length < 3) {
            searchResults.innerHTML = '';
            return;
        }
        try {
            const response = await fetch(`${API_BASE_URL}/api/player-search?query=${encodeURIComponent(query)}`);
            const players = await response.json();
            searchResults.innerHTML = '';
            if (players.length > 0) {
                players.forEach(player => {
                    const listItem = document.createElement('li');
                    listItem.textContent = `${player.name} (${player.year})`;
                    
                    if (gameState.guessedPlayerIds.includes(player.id)) {
                        listItem.classList.add('used');
                    }
                    listItem.addEventListener('click', () => {
                        handleGuess(activeCell, player);
                    });
                    searchResults.appendChild(listItem);
                });
            } else {
                searchResults.innerHTML = '<li>No players found</li>';
            }
        } catch (error) {
            console.error("Search failed:", error);
            searchResults.innerHTML = '<li>Error searching</li>';
        }
    }

    async function handleGuess(cellElement, player) {
        if (!player || !player.id || isGameOver) return;
    
        const playerName = player.name.trim();
        const playerId = player.id;
        closeSearchModal();
    
        
        if (gameState.guessedPlayerIds.includes(playerId)) {
            alert(`${playerName} is already on the grid.`);
            return;
        }
    
        
        gameState.guesses--;
    
        const { row, col } = cellElement.dataset;
        const rowCategory = gridData.rows[row];
        const colCategory = gridData.cols[col];
    
        try {
            const rowResponse = await fetch(`${API_BASE_URL}/api/validate?playerName=${encodeURIComponent(playerName)}&playerId=${player.id}&categoryType=${rowCategory.type}&categoryValue=${encodeURIComponent(rowCategory.value)}`);
            const rowResult = await rowResponse.json();
            const colResponse = await fetch(`${API_BASE_URL}/api/validate?playerName=${encodeURIComponent(playerName)}&playerId=${player.id}&categoryType=${colCategory.type}&categoryValue=${encodeURIComponent(colCategory.value)}`);
            const colResult = await colResponse.json();
            if (rowResult.isValid && colResult.isValid) {
                
                const cellId = `${row}-${col}`;
                gameState.correctCells[cellId] = { name: playerName }; 
                //gameState.correctCells[cellId] = { name: playerName, image: rowResult.player.image };
                gameState.guessedPlayerIds.push(playerId);
            } else {
                
                cellElement.classList.add('incorrect-shake');
                setTimeout(() => cellElement.classList.remove('incorrect-shake'), 300);
            }
    
            saveGameState();
            renderGridFromState();
    
            if (gameState.guesses <= 0) {
                gameOver();
            }
        } catch (error) {
            console.error("Validation failed:", error);
        }
    }

    async function setupGrid() {
        // The first loadGameState() call has been removed.
        const country = getCountryCode();
    
        document.querySelectorAll('.nav-link').forEach(link => {
            link.classList.toggle('active', link.hash === `#${country}`);
        });
    
        try {
            const response = await fetch(`${API_BASE_URL}/api/grid-of-the-day/${country}`);
    
            if (!response.ok) throw new Error(`Network response was not ok: ${response.statusText}`);
            gridData = await response.json();
            loadGameState(gridData.serverSessionId); 

            
            gridContainer.innerHTML = '';
            for (let i = 0; i < 4; i++) {
                for (let j = 0; j < 4; j++) {
                    const cell = document.createElement('div');
                    if (i === 0 && j === 0) {
                        cell.classList.add('header-cell', 'corner');
                    } else if (i === 0) {
                        const colCat = gridData.cols[j - 1];
                        cell.classList.add('header-cell');
                        if (colCat.image) {
                            cell.innerHTML = `<div class="player-name-cell">${colCat.label}</div>`;

                            //cell.innerHTML = `<img src="${colCat.image}" alt="${colCat.label}" title="${colCat.label}">`;
                        } else {
                            cell.textContent = colCat.label;
                        }
                    } else if (j === 0) {
                        const rowCat = gridData.rows[i - 1];
                        cell.classList.add('header-cell');
                        if (rowCat.image) {
                            cell.innerHTML = `<div class="player-name-cell">${rowCat.label}</div>`;

                            //cell.innerHTML = `<img src="${rowCat.image}" alt="${rowCat.label}" title="${rowCat.label}">`;
                        } else {
                            cell.textContent = rowCat.label;
                        }
                    } else {
                        cell.classList.add('grid-cell');
                        cell.dataset.row = i - 1;
                        cell.dataset.col = j - 1;
                    }
                    gridContainer.appendChild(cell);
                }
            }
            renderGridFromState();
            closeSearchModal(); // ADD THIS LINE AS A SAFEGUARD
        } catch (error) {
            console.error('CRITICAL: Failed to fetch and set up grid:', error);
            gridContainer.innerHTML = `<h2>CRITICAL ERROR: Could not load grid for ${country}. Check console.</h2>`;
        }
    }


    // --- EVENT LISTENERS ---
    window.addEventListener('hashchange', setupGrid);
    setupGrid(); // Initial load

    gridContainer.addEventListener('click', (event) => {
        const cell = event.target.closest('.grid-cell');
        if (isGameOver) {
            if(cell) showAllAnswersForCell(cell);
        } else {
            if (cell && !cell.classList.contains('correct')) {
                openSearchModal(cell);
            }
        }
    });
    
    searchInput.addEventListener('input', handleSearch);
    closeModalBtn.addEventListener('click', closeSearchModal);
    
    searchModal.addEventListener('click', (event) => {
        if (event.target === searchModal) {
            closeSearchModal();
        }
    });

    giveUpBtn.addEventListener('click', () => {
        giveUpModal.classList.remove('modal-hidden');
    });
    
    cancelGiveUpBtn.addEventListener('click', () => {
        giveUpModal.classList.add('modal-hidden');
    });
    
    confirmGiveUpBtn.addEventListener('click', () => {
        giveUpModal.classList.add('modal-hidden');
        gameOver(true); // isGiveUp = true
    });
});
