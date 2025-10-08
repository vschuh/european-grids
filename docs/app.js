document.addEventListener('DOMContentLoaded', () => {
    const API_BASE_URL = 'https://european-grids-api.onrender.com';
    const gridContainer = document.getElementById('grid-container');
    const livesCountSpan = document.getElementById('lives-count');
    const attemptCountSpan = document.getElementById('attempt-count');
    const controlsContainer = document.getElementById('controls');
    const searchModal = document.getElementById('search-modal');
    const searchInput = document.getElementById('search-input');
    const searchResults = document.getElementById('search-results');
    const closeModalBtn = document.getElementById('close-modal-btn');
    const giveUpModal = document.getElementById('give-up-modal');
    const confirmGiveUpBtn = document.getElementById('confirm-give-up-btn');
    const cancelGiveUpBtn = document.getElementById('cancel-give-up-btn');

    let gridData = {};
    let currentIdentifier = 'daily';
    let gameState = {};
    let isGameOver = false;
    let activeCell = null;

    // --- State Management ---

    function loadGameState(newSessionId, identifier) {
        const savedStateJSON = localStorage.getItem(`gridGameState_${identifier}`);
        const savedState = savedStateJSON ? JSON.parse(savedStateJSON) : null;
        const today = new Date().toISOString().split('T')[0];
    
        if (!savedState || savedState.serverSessionId !== newSessionId || savedState.date !== today) {
            // Start a fresh state
            gameState = {
                guesses: 9,
                attempt: 1,
                guessedPlayerIds: [],
                correctCells: {},
                serverSessionId: newSessionId,
                date: today 
            };
        } else {
            gameState = savedState;
            // Ensure new properties exist for older saved states
            if (!gameState.guessedPlayerIds) gameState.guessedPlayerIds = [];
            if (!gameState.attempt) gameState.attempt = 1;
        }
        isGameOver = gameState.guesses <= 0;
    }

    function saveGameState() {
        gameState.date = new Date().toISOString().split('T')[0];
        localStorage.setItem(`gridGameState_${currentIdentifier}`, JSON.stringify(gameState));
    }

    function updateUIDisplay() {
        livesCountSpan.textContent = gameState.guesses;
        attemptCountSpan.textContent = gameState.attempt;

        const mainButton = controlsContainer.querySelector('button');
        if (isGameOver) {
            mainButton.textContent = 'Retry';
            mainButton.id = 'retry-btn';
            mainButton.classList.remove('btn-danger'); // Optional: change style for retry
        } else {
            mainButton.textContent = 'Give Up';
            mainButton.id = 'give-up-btn';
            mainButton.classList.add('btn-danger');
        }
    }
    
    // --- Grid Rendering & Game Over Logic ---

    async function renderGridFromState() {
        updateUIDisplay();
        document.querySelectorAll('.grid-cell').forEach(cell => {
            const cellId = `${cell.dataset.row}-${cell.dataset.col}`;
            if (gameState.correctCells[cellId]) {
                const data = gameState.correctCells[cellId];
                cell.innerHTML = `<div class="player-name-cell">${data.name}</div>`;
                cell.classList.add('correct');
            } else {
                // Clear cells that aren't correct for this attempt
                cell.innerHTML = '';
                cell.classList.remove('correct', 'game-over-cell');
            }
        });
    
        if (isGameOver) {
            for (const cell of document.querySelectorAll('.grid-cell:not(.correct)')) {
                const { row, col } = cell.dataset;
                const cellId = `${row}-${col}`;
                cell.classList.add('game-over-cell');

                // Use pre-calculated answer counts if they exist
                if (gridData.answers && gridData.answers[cellId] !== undefined) {
                    const count = gridData.answers[cellId];
                    cell.innerHTML = `
                        <div class="answer-reveal-container">
                            <span class="player-count">${count}</span>
                            ${count > 0 ? '<div class="see-players-btn">See Players</div>' : ''}
                        </div>`;
                } else {
                    // Fallback for older grids without pre-calculated answers
                    const rowCat = gridData.rows[row];
                    const colCat = gridData.cols[col];
                    // Setting a placeholder, and fetching in the background
                    cell.innerHTML = `<div class="answer-reveal-container"><span class="player-count">...</span></div>`;
                    fetch(`${API_BASE_URL}/api/get-cell-answers`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ cat1: rowCat, cat2: colCat })
                    }).then(res => res.json()).then(data => {
                        cell.innerHTML = `
                            <div class="answer-reveal-container">
                                <span class="player-count">${data.count}</span>
                                ${data.count > 0 ? '<div class="see-players-btn">See Players</div>' : ''}
                            </div>`;
                    }).catch(() => {
                        cell.innerHTML = `<span class="answer-reveal">!</span>`;
                    });
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
        if (isGiveUp) gameState.guesses = 0;
        saveGameState();
        renderGridFromState(); 
    }

    function handleRetry() {
        gameState.attempt++;
        gameState.guesses = 9;
        gameState.guessedPlayerIds = [];
        gameState.correctCells = {};
        isGameOver = false;
        saveGameState();
        renderGridFromState(); // Re-render the same grid for the new attempt
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
            players.forEach(player => {
                const li = document.createElement('li');
                li.textContent = `${player.name} (${player.year})`;
                if (gameState.guessedPlayerIds.includes(player.id)) {
                    li.classList.add('used');
                }
                li.addEventListener('click', () => handleGuess(activeCell, player));
                searchResults.appendChild(li);
            });
        } catch (error) {
            console.error("Search failed:", error);
            searchResults.innerHTML = '<li>Error searching</li>';
        }
    }
    
    async function handleGuess(cellElement, player) {
        if (!player || !player.id || isGameOver) return;
        if (gameState.guessedPlayerIds.includes(player.id)) {
            alert(`${player.name.trim()} is already on the grid.`);
            return;
        }
    
        closeSearchModal();
        gameState.guesses--;
    
        const { row, col } = cellElement.dataset;
        const rowCategory = gridData.rows[row];
        const colCategory = gridData.cols[col];
        
        try {
            const rowResponse = await fetch(`${API_BASE_URL}/api/validate?playerName=${encodeURIComponent(player.name.trim())}&playerId=${player.id}&categoryValue=${encodeURIComponent(JSON.stringify(rowCategory))}`);
            const rowResult = await rowResponse.json();
            const colResponse = await fetch(`${API_BASE_URL}/api/validate?playerName=${encodeURIComponent(player.name.trim())}&playerId=${player.id}&categoryValue=${encodeURIComponent(JSON.stringify(colCategory))}`);
            const colResult = await colResponse.json();
            
            if (rowResult.isValid && colResult.isValid) {
                const cellId = `${row}-${col}`;
                gameState.correctCells[cellId] = { name: player.name.trim() };
                gameState.guessedPlayerIds.push(player.id);
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
            gameState.guesses++; // Restore guess on error
        }
    }
    
    async function setupGrid(identifier) {
        currentIdentifier = identifier || 'daily';
        
        try {
            const response = await fetch(`${API_BASE_URL}/api/grid/${currentIdentifier}`);
            if (!response.ok) throw new Error(`API failed with status ${response.status}`);
            gridData = await response.json();
        } catch (apiError) {
            console.error('CRITICAL: API fetch failed:', apiError);
            gridContainer.innerHTML = `<h2>Grid not available. Please check back later.</h2>`;
            return;
        }

        if (gridData) {
            loadGameState(gridData.serverSessionId, currentIdentifier); 
            
            const gridTitle = document.querySelector('header h1');
            gridTitle.textContent = gridData.name || 'Euro Zones';
    
            gridContainer.innerHTML = '';
            for (let i = 0; i < 4; i++) {
                for (let j = 0; j < 4; j++) {
                    const cell = document.createElement('div');
                    if (i === 0 && j === 0) {
                        cell.classList.add('header-cell', 'corner');
                    } else if (i === 0) {
                        cell.classList.add('header-cell');
                        cell.innerHTML = gridData.cols[j - 1].label;
                    } else if (j === 0) {
                        cell.classList.add('header-cell');
                        cell.innerHTML = gridData.rows[i - 1].label;
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
        
        document.querySelectorAll('.nav-link').forEach(link => {
            link.classList.toggle('active', link.getAttribute('href') === (path === '/' ? '/daily' : path));
        });
        
        setupGrid(identifier);
    }

    // --- Event Listeners ---

    document.getElementById('country-nav').addEventListener('click', (e) => {
        if (e.target.matches('.nav-link') && !e.target.matches('.create-link')) {
            e.preventDefault(); 
            history.pushState({}, '', e.target.getAttribute('href')); 
            router(); 
        }
    });
    
    window.addEventListener('popstate', router);
    router();

    gridContainer.addEventListener('click', (event) => {
        const cell = event.target.closest('.grid-cell');
        if (!cell) return;

        if (isGameOver) {
            showAllAnswersForCell(cell);
        } else if (!cell.classList.contains('correct')) {
            openSearchModal(cell);
        }
    });
    
    controlsContainer.addEventListener('click', (e) => {
        if (e.target.id === 'give-up-btn') {
            giveUpModal.classList.remove('modal-hidden');
        } else if (e.target.id === 'retry-btn') {
            handleRetry();
        }
    });

    confirmGiveUpBtn.addEventListener('click', () => {
        giveUpModal.classList.add('modal-hidden');
        gameOver(true);
    });

    cancelGiveUpBtn.addEventListener('click', () => giveUpModal.classList.add('modal-hidden'));
    searchInput.addEventListener('input', handleSearch);
    closeModalBtn.addEventListener('click', closeSearchModal);
    searchModal.addEventListener('click', (e) => { if (e.target === searchModal) closeSearchModal(); });
});