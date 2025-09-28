document.addEventListener('DOMContentLoaded', () => {
    const API_BASE_URL = 'https://european-grids-api.onrender.com';
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
    (function() {
        const redirect = sessionStorage.redirect;
        delete sessionStorage.redirect;
        if (redirect && redirect != location.pathname) {
          history.replaceState(null, null, redirect);
        }
      })();
    
    function getCountryCode() {
        return window.location.hash.substring(1) || 'daily';
    }

    function loadGameState(newSessionId, identifier) {
        const savedStateJSON = localStorage.getItem(`gridGameState_${identifier}`);
        const savedState = savedStateJSON ? JSON.parse(savedStateJSON) : null;
        const today = new Date().toISOString().split('T')[0];
    
        
        if (!savedState || savedState.serverSessionId !== newSessionId || savedState.date !== today) {
            gameState = {
                guesses: 9,
                guessedPlayerIds: [],
                correctCells: {},
                serverSessionId: newSessionId,
                date: today 
            };
        } else {
            gameState = savedState;
            if (!gameState.guessedPlayerIds) {
                gameState.guessedPlayerIds = [];
            }
        }
        isGameOver = gameState.guesses <= 0;
    }

    function saveGameState() {
        const identifier = window.location.hash.substring(1) || 'daily';
        gameState.date = new Date().toISOString().split('T')[0];
        localStorage.setItem(`gridGameState_${identifier}`, JSON.stringify(gameState));
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
    
        
        if (!gridData || !gridData.rows || !gridData.cols) {
            console.error("CRITICAL: Grid data is incomplete or missing.", gridData);
            alert("A critical error occurred: Grid data is missing. Cannot validate guess.");
            return;
        }
        
    
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
        
        if (!rowCategory || !colCategory) {
            console.error("CRITICAL: A specific row or column category is missing.", { rowCategory, colCategory });
            alert("A critical error occurred: Category data is missing. Cannot validate guess.");
            gameState.guesses++; 
            return;
        }
    
        try {
            const rowResponse = await fetch(`${API_BASE_URL}/api/validate?playerName=${encodeURIComponent(playerName)}&playerId=${player.id}&categoryValue=${encodeURIComponent(JSON.stringify(rowCategory))}`);
            const rowResult = await rowResponse.json();
            const colResponse = await fetch(`${API_BASE_URL}/api/validate?playerName=${encodeURIComponent(playerName)}&playerId=${player.id}&categoryValue=${encodeURIComponent(JSON.stringify(colCategory))}`);
            const colResult = await colResponse.json();
            
            if (rowResult.isValid && colResult.isValid) {
                const cellId = `${row}-${col}`;
                gameState.correctCells[cellId] = { name: playerName };
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

    let lastProcessedIdentifier = null;


    async function setupGrid(identifier) {
        identifier = identifier || 'daily';
        const isCustomGrid = !isNaN(identifier) && identifier !== '';
        const gridIdentifier = isCustomGrid ? `custom_${identifier}` : identifier;
    
        if (identifier === lastProcessedIdentifier) {
            return;
        }
        lastProcessedIdentifier = identifier;
    
        document.querySelectorAll('.nav-link').forEach(link => {
            
            const linkPath = link.getAttribute('href'); 
            link.classList.toggle('active', linkPath === `/${identifier}`);
        });
    
    
        try {
            let fetchUrl;
            if (isCustomGrid) {
                fetchUrl = `${API_BASE_URL}/api/grid/${identifier}`; 
            } else {
                const today = new Date().toISOString().split('T')[0];
                const gridType = identifier || 'daily';
                fetchUrl = `grids/${gridType}_${today}.json`;
            }
            
            const response = await fetch(fetchUrl);
            if (!response.ok) {
                if (response.status === 404 && !isCustomGrid) {
                    throw new Error('Static grid file not found, trying API fallback.');
                }
                gridContainer.innerHTML = `<h2>Grid not found. It may have expired or the link is incorrect.</h2>`;
                return;
            }
            
            gridData = await response.json();
    
        } catch (error) {
            console.warn(error.message);
            console.log('Attempting to fetch grid from the server API as a fallback...');
            try {
                const apiIdentifier = isCustomGrid ? identifier : (identifier || 'daily');
                const apiResponse = await fetch(`${API_BASE_URL}/api/grid/${apiIdentifier}`);
                if (!apiResponse.ok) {
                    gridContainer.innerHTML = `<h2>Grid for today not available. Please check back later.</h2>`;
                    return;
                }
                gridData = await apiResponse.json();
            } catch (apiError) {
                console.error('CRITICAL: Fallback API fetch also failed:', apiError);
                gridContainer.innerHTML = `<h2>CRITICAL ERROR: Could not load grid.</h2>`;
                return;
            }
        }
    
    
        
        if (gridData) {
            loadGameState(gridData.serverSessionId, identifier); 
            
            const gridTitle = document.querySelector('header h1');
            if (gridData.name) {
                gridTitle.textContent = gridData.name;
            } else {
                gridTitle.textContent = 'Euro Zones';
            }
    
            gridContainer.innerHTML = '';
            for (let i = 0; i < 4; i++) {
                for (let j = 0; j < 4; j++) {
                    const cell = document.createElement('div');
                    if (i === 0 && j === 0) {
                        cell.classList.add('header-cell', 'corner');
                    } else if (i === 0) {
                        const colCat = gridData.cols[j - 1];
                        cell.classList.add('header-cell');
                        cell.innerHTML = colCat.label;
                    } else if (j === 0) {
                        const rowCat = gridData.rows[i - 1];
                        cell.classList.add('header-cell');
                        cell.innerHTML = rowCat.label;
                    } else {
                        cell.classList.add('grid-cell');
                        cell.dataset.row = i - 1;
                        cell.dataset.col = j - 1;
                    }
                    gridContainer.appendChild(cell);
                }
            }
            renderGridFromState();
        }
    }

    

    function router() {
        const path = window.location.pathname;
        const identifier = path === '/' ? 'daily' : path.substring(1);
        setupGrid(identifier);
    }

    document.getElementById('country-nav').addEventListener('click', (e) => {
        
        if (e.target.matches('.nav-link') && !e.target.matches('.create-link')) {
            e.preventDefault(); 
            const href = e.target.getAttribute('href');
            history.pushState({}, '', href); 
            router(); 
        }
    });

    
    window.addEventListener('popstate', router);

    
    router();

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
        gameOver(true);
    });
});