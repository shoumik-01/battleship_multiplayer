// Battleship game logic
document.addEventListener('DOMContentLoaded', initGame);

// Constants
const GRID_SIZE = 10;
const CELL_SIZE = 40;
const SHIP_TYPES = {
    'carrier': { size: 5, label: 'Carrier' },
    'battleship': { size: 4, label: 'Battleship' },
    'cruiser': { size: 3, label: 'Cruiser' },
    'submarine': { size: 3, label: 'Submarine' },
    'destroyer': { size: 2, label: 'Destroyer' }
};

// Game state
let gameState = {
    player: {
        ships: {},
        hits: [],
        misses: [],
        sunkShips: []
    },
    enemy: {
        ships: {},
        hits: [],
        misses: [],
        sunkShips: [],
        nextTargets: [], // AI targeting logic (only used in single player)
        lastHit: null
    },
    currentTurn: 'player',
    gameOver: false,
    isMultiplayer: false,
    playerNumber: null,
    pollingInterval: null
};

// Initialize the game
function initGame() {
    // Check if multiplayer mode
    const urlParams = new URLSearchParams(window.location.search);
    gameState.isMultiplayer = document.body.getAttribute('data-multiplayer') === 'true';

    if (gameState.isMultiplayer) {
        gameState.playerNumber = parseInt(document.body.getAttribute('data-player-number'));
    }

    createGrids();
    setupEventListeners();

    // Check for multiplayer mode
    if (gameState.isMultiplayer) {
        // Create UI enhancements
        createUIEnhancements();

        // Load multiplayer game
        loadMultiplayerGame();

        // Update page title
        document.title = `Battleship - Player ${gameState.playerNumber}`;
    } else {
        loadPlayerShips();
    }
}

// Create DOM elements for visual enhancements
function createUIEnhancements() {
    // Only create these elements if they don't exist yet
    if (!document.getElementById('connection-status')) {
        // Add connection status indicator
        const connectionStatus = document.createElement('div');
        connectionStatus.id = 'connection-status';
        connectionStatus.className = 'connection-status connecting';
        connectionStatus.textContent = 'Connecting...';
        document.body.appendChild(connectionStatus);
    }

    if (!document.getElementById('notification')) {
        // Add notification element
        const notification = document.createElement('div');
        notification.id = 'notification';
        document.body.appendChild(notification);
    }

    if (!document.getElementById('waiting-modal')) {
        // Add waiting modal for opponent
        const waitingModal = document.createElement('div');
        waitingModal.id = 'waiting-modal';
        waitingModal.className = 'waiting-modal';

        const waitingContent = document.createElement('div');
        waitingContent.className = 'waiting-modal-content';

        const waitingTitle = document.createElement('h3');
        waitingTitle.textContent = 'Waiting for Opponent';

        const waitingSpinner = document.createElement('div');
        waitingSpinner.className = 'waiting-spinner';

        const waitingMessage = document.createElement('p');
        waitingMessage.id = 'waiting-message';
        waitingMessage.textContent = 'Please wait while your opponent makes their move...';

        waitingContent.appendChild(waitingTitle);
        waitingContent.appendChild(waitingSpinner);
        waitingContent.appendChild(waitingMessage);
        waitingModal.appendChild(waitingContent);

        document.body.appendChild(waitingModal);
    }

    // Add player number indicator to the game status
    const playerNumber = gameState.playerNumber;
    if (playerNumber && document.getElementById('player-stats')) {
        const playerIndicator = document.createElement('span');
        playerIndicator.className = `player-indicator player-${playerNumber}`;
        playerIndicator.textContent = `P${playerNumber}`;

        const playerStats = document.getElementById('player-stats');
        if (!playerStats.querySelector('.player-indicator')) {
            playerStats.appendChild(playerIndicator);
        }
    }
}

// Update connection status
function updateConnectionStatus(status) {
    const connectionStatus = document.getElementById('connection-status');
    if (!connectionStatus) return;

    connectionStatus.className = `connection-status ${status}`;

    switch (status) {
        case 'connected':
            connectionStatus.textContent = 'Connected';
            setTimeout(() => {
                connectionStatus.style.opacity = '0';
            }, 3000);
            break;
        case 'disconnected':
            connectionStatus.textContent = 'Disconnected';
            connectionStatus.style.opacity = '1';
            break;
        case 'connecting':
            connectionStatus.textContent = 'Connecting...';
            connectionStatus.style.opacity = '1';
            break;
    }
}

// Show notification
function showNotification(message, duration = 3000) {
    const notification = document.getElementById('notification');
    if (!notification) return;

    notification.textContent = message;
    notification.classList.add('show');

    setTimeout(() => {
        notification.classList.remove('show');
    }, duration);
}

// Toggle waiting modal
function toggleWaitingModal(show, message = null) {
    const modal = document.getElementById('waiting-modal');
    if (!modal) return;

    if (show) {
        modal.style.display = 'flex';
        if (message && document.getElementById('waiting-message')) {
            document.getElementById('waiting-message').textContent = message;
        }
    } else {
        modal.style.display = 'none';
    }
}

// Check if a ship has been sunk
function checkForSunkShip(player, shipType) {
    if (!shipType) return false;

    const grid = player === 'player' ? 'player' : 'enemy';
    const ships = gameState[grid].ships;
    const hits = gameState[player === 'player' ? 'player' : 'enemy'].hits;

    // Check if all cells of the ship have been hit
    const shipCoordinates = ships[shipType];
    const allHit = shipCoordinates.every(coord => {
        return hits.some(hit => hit.row === coord.row && hit.col === coord.col);
    });

    if (allHit && !gameState[grid].sunkShips.includes(shipType)) {
        // Ship is sunk
        gameState[grid].sunkShips.push(shipType);

        // Update UI to show sunk ship
        markShipAsSunk(player, shipType);

        // Add message to log
        const shipName = SHIP_TYPES[shipType].label;

        if (player === 'player') {
            addLogEntry(`Enemy sunk your ${shipName}!`, 'system-message');
        } else {
            addLogEntry(`You sunk the enemy's ${shipName}!`, 'system-message');
        }

        // Update stats
        updateStats();

        // If it's the enemy's ship that was sunk, clear the targeting queue
        if (player === 'enemy') {
            gameState.enemy.nextTargets = [];
            gameState.enemy.lastHit = null;
        }

        return true;
    }

    return false;
}

// Mark a ship as sunk in the UI
function markShipAsSunk(player, shipType) {
    const gridId = player === 'player' ? 'player-grid' : 'enemy-grid';
    const grid = document.getElementById(gridId);
    const ships = gameState[player].ships;

    // Mark all ship cells as sunk
    ships[shipType].forEach(coord => {
        const cell = grid.rows[coord.row].cells[coord.col];
        cell.classList.add('sunk');
    });
}

// Check for game over condition
function checkForGameOver() {
    // For multiplayer, game over is determined by server
    if (gameState.isMultiplayer) {
        return gameState.gameOver;
    }

    // Count sunk ships
    const playerSunkCount = gameState.player.sunkShips.length;
    const enemySunkCount = gameState.enemy.sunkShips.length;

    // Update stats regardless
    updateStats();

    // Check if all ships of either player are sunk
    if (playerSunkCount === Object.keys(SHIP_TYPES).length) {
        // Enemy wins
        gameState.gameOver = true;
        showGameOver(false);
        return true;
    } else if (enemySunkCount === Object.keys(SHIP_TYPES).length) {
        // Player wins
        gameState.gameOver = true;
        showGameOver(true);
        return true;
    }

    return false;
}

// Update game status message
function updateGameStatus(message) {
    document.getElementById('status-message').textContent = message;
}

// Update ship statistics
function updateStats() {
    if (gameState.isMultiplayer) {
        // For multiplayer, stats are updated by the polling function
        return;
    }

    const playerShipsRemaining = Object.keys(SHIP_TYPES).length - gameState.player.sunkShips.length;
    const enemyShipsRemaining = Object.keys(SHIP_TYPES).length - gameState.enemy.sunkShips.length;

    document.getElementById('player-stats').textContent = `Ships remaining: ${playerShipsRemaining}`;
    document.getElementById('opponent-stats').textContent = `Enemy ships remaining: ${enemyShipsRemaining}`;
}

// Add entry to game log
function addLogEntry(message, className) {
    const logContainer = document.getElementById('log-container');
    const entry = document.createElement('div');

    entry.className = `log-entry ${className}`;
    entry.textContent = message;

    logContainer.appendChild(entry);
    logContainer.scrollTop = logContainer.scrollHeight; // Scroll to bottom

    // For important messages, also show a notification
    if (className === 'system-message') {
        showNotification(message);
    }
}

// Show game over modal
function showGameOver(playerWon) {
    const modal = document.getElementById('game-over-modal');
    const resultElement = document.getElementById('game-result');
    const statsElement = document.getElementById('game-stats');

    // Set result message
    if (playerWon) {
        resultElement.textContent = 'Victory! You sunk all enemy ships!';
        resultElement.style.color = '#006400'; // Dark green
    } else {
        resultElement.textContent = 'Defeat! All your ships have been sunk!';
        resultElement.style.color = '#8b0000'; // Dark red
    }

    // Calculate stats
    if (gameState.isMultiplayer) {
        // For multiplayer games
        const myHitsCount = gameState.enemy.hits.length;
        const opponentHitsCount = gameState.player.hits.length;
        const hitPercentage = Math.round((myHitsCount / (myHitsCount + gameState.enemy.misses.length)) * 100) || 0;

        statsElement.innerHTML = `
            <p>Your shots: ${myHitsCount + gameState.enemy.misses.length}</p>
            <p>Hits: ${myHitsCount} (${hitPercentage}% accuracy)</p>
            <p>Opponent hits: ${opponentHitsCount}</p>
        `;
    } else {
        // For single player games
        const totalShots = gameState.enemy.hits.length + gameState.enemy.misses.length;
        const hitPercentage = Math.round((gameState.enemy.hits.length / totalShots) * 100);

        statsElement.innerHTML = `
            <p>Your shots: ${totalShots}</p>
            <p>Hits: ${gameState.enemy.hits.length} (${hitPercentage}% accuracy)</p>
            <p>Enemy ships sunk: ${gameState.enemy.sunkShips.length}</p>
        `;
    }

    // Show modal
    modal.style.display = 'flex';

    // If multiplayer, stop polling
    if (gameState.isMultiplayer && gameState.pollingInterval) {
        clearInterval(gameState.pollingInterval);
    }
}

// Create player and enemy grids
function createGrids() {
    const playerGrid = document.getElementById('player-grid');
    const enemyGrid = document.getElementById('enemy-grid');

    // Create player grid (where player ships are placed and enemy fires)
    for (let r = 0; r < GRID_SIZE; r++) {
        const row = playerGrid.insertRow();
        for (let c = 0; c < GRID_SIZE; c++) {
            const cell = row.insertCell();
            cell.dataset.row = r;
            cell.dataset.col = c;
            // Add coordinate as data attribute for logging
            cell.dataset.coord = `${String.fromCharCode(65 + c)}${r + 1}`;
        }
    }

    // Create enemy grid (where player fires)
    for (let r = 0; r < GRID_SIZE; r++) {
        const row = enemyGrid.insertRow();
        for (let c = 0; c < GRID_SIZE; c++) {
            const cell = row.insertCell();
            cell.dataset.row = r;
            cell.dataset.col = c;
            // Add coordinate as data attribute for logging
            cell.dataset.coord = `${String.fromCharCode(65 + c)}${r + 1}`;
            cell.addEventListener('click', () => handlePlayerShot(r, c));
        }
    }
}

// Set up event listeners
function setupEventListeners() {
    // New game button
    document.getElementById('new-game-btn').addEventListener('click', () => {
        window.location.href = '/'; // Redirect to main menu
    });

    // Play again button
    document.getElementById('play-again-btn').addEventListener('click', () => {
        window.location.href = '/';
    });
}

// Load player ships from session data
function loadPlayerShips() {
    // Fetch player ships from the session
    fetch('/get_player_ships')
        .then(response => response.json())
        .then(data => {
            if (data.ships) {
                gameState.player.ships = data.ships;
                displayPlayerShips();

                // Now load enemy ships
                loadEnemyShips();
            } else {
                // Handle error - redirect to setup
                window.location.href = '/';
            }
        })
        .catch(error => {
            console.error('Error loading player ships:', error);
            window.location.href = '/';
        });
}

// Load enemy ships
function loadEnemyShips() {
    // Fetch enemy (bot) ships from the session
    fetch('/get_enemy_ships')
        .then(response => response.json())
        .then(data => {
            if (data.ships) {
                gameState.enemy.ships = data.ships;

                // Ready to start game
                addLogEntry('Game started. Your turn to fire!', 'system-message');
                updateGameStatus('Your turn - select a target to fire upon');
            } else {
                // Handle error
                window.location.href = '/';
            }
        })
        .catch(error => {
            console.error('Error loading enemy ships:', error);
            window.location.href = '/';
        });
}

// Load multiplayer game state
function loadMultiplayerGame() {
    // First load player ships
    fetch('/multiplayer/get_player_ships')
        .then(response => response.json())
        .then(data => {
            if (data.status === 'success') {
                gameState.player.ships = data.ships;
                displayPlayerShips();

                // Start polling for game state updates
                startPolling();

                // Add initial log entry
                addLogEntry('Multiplayer game started!', 'system-message');
                updateGameStatus('Waiting for game state...');
            } else {
                // Handle error
                console.error('Error loading player ships:', data.message);
                window.location.href = '/multiplayer';
            }
        })
        .catch(error => {
            console.error('Error loading player ships:', error);
            window.location.href = '/multiplayer';
        });
}

// Start polling for game state updates
function startPolling() {
    // Poll every 2 seconds
    gameState.pollingInterval = setInterval(pollGameState, 2000);

    // Initial poll
    pollGameState();
}

// Poll for game state updates
function pollGameState() {
    // Show connecting status
    updateConnectionStatus('connecting');

    fetch('/multiplayer/get_game_state')
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP error! Status: ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            // Update connection status
            updateConnectionStatus('connected');

            if (data.status === 'success') {
                // Reset error counter if successful
                window.pollErrorCount = 0;

                // Process game state
                updateMultiplayerGameState(data);

                // Update game status appearance based on turn
                const gameStatus = document.getElementById('game-status');
                if (gameStatus) {
                    gameStatus.className = 'game-status';

                    if (data.game_status === 'waiting') {
                        gameStatus.classList.add('waiting');
                    } else if (data.is_my_turn) {
                        gameStatus.classList.add('my-turn');
                        toggleWaitingModal(false);
                    } else {
                        gameStatus.classList.add('opponent-turn');

                        // Show waiting modal only if game is in progress
                        if (data.game_status === 'playing' && !gameState.gameOver) {
                            toggleWaitingModal(true, "Waiting for opponent's move...");
                        } else {
                            toggleWaitingModal(false);
                        }
                    }
                }
            } else {
                console.error('Error polling game state:', data.message);

                // Update connection status
                updateConnectionStatus('disconnected');

                // Add visual feedback for the error
                const gameStatus = document.getElementById('game-status');
                if (gameStatus) {
                    gameStatus.className = 'game-status error';
                }

                updateGameStatus('Error syncing game state. Retrying...');
            }
        })
        .catch(error => {
            console.error('Error polling game state:', error);

            // Update connection status
            updateConnectionStatus('disconnected');

            // Add visual feedback and retry counter
            if (!window.pollErrorCount) {
                window.pollErrorCount = 0;
            }

            window.pollErrorCount++;

            if (window.pollErrorCount > 5) {
                updateGameStatus('Connection issues. Please refresh the page.');

                const gameStatus = document.getElementById('game-status');
                if (gameStatus) {
                    gameStatus.className = 'game-status error';
                }

                clearInterval(gameState.pollingInterval);
                showNotification('Connection lost. Please refresh the page.', 10000);
            } else {
                updateGameStatus('Connection issue. Retrying...');
            }
        });
}

// Update game state based on server data
function updateMultiplayerGameState(data) {
    // Clear existing hits/misses
    clearBoardMarkers();

    // Update whose turn it is
    if (data.is_my_turn) {
        gameState.currentTurn = 'player';
        updateGameStatus('Your turn - select a target to fire upon');
    } else {
        gameState.currentTurn = 'enemy';
        updateGameStatus("Opponent's turn - waiting for their move...");
    }

    // Check if opponent is connected
    if (data.opponent_ready) {
        document.getElementById('opponent-stats').textContent = `Opponent is connected`;
    } else {
        document.getElementById('opponent-stats').textContent = `Waiting for opponent to connect...`;
    }

    // Check for game over
    if (data.game_status === 'game_over') {
        gameState.gameOver = true;
        clearInterval(gameState.pollingInterval); // Stop polling

        // Determine if player won
        const playerWon = data.winner === gameState.playerNumber;
        showGameOver(playerWon);
    }

    // Update hits and misses on both boards
    // Make sure hits and misses arrays exist before trying to iterate
    if (Array.isArray(data.my_hits)) {
        data.my_hits.forEach(hit => {
            markCellAsHit('enemy', hit.row, hit.col);
        });
    }

    if (Array.isArray(data.my_misses)) {
        data.my_misses.forEach(miss => {
            markCellAsMiss('enemy', miss.row, miss.col);
        });
    }

    if (Array.isArray(data.opponent_hits)) {
        data.opponent_hits.forEach(hit => {
            markCellAsHit('player', hit.row, hit.col);
        });
    }

    if (Array.isArray(data.opponent_misses)) {
        data.opponent_misses.forEach(miss => {
            markCellAsMiss('player', miss.row, miss.col);
        });
    }

    // Update stats
    const myHits = Array.isArray(data.my_hits) ? data.my_hits.length : 0;
    const opponentHits = Array.isArray(data.opponent_hits) ? data.opponent_hits.length : 0;
    updateMultiplayerStats(myHits, opponentHits);
}

// Clear all hit/miss markers from the board
function clearBoardMarkers() {
    const playerGrid = document.getElementById('player-grid');
    const enemyGrid = document.getElementById('enemy-grid');

    // Clear player grid markers
    for (let r = 0; r < GRID_SIZE; r++) {
        for (let c = 0; c < GRID_SIZE; c++) {
            const cell = playerGrid.rows[r].cells[c];
            cell.classList.remove('hit', 'miss');
        }
    }

    // Clear enemy grid markers
    for (let r = 0; r < GRID_SIZE; r++) {
        for (let c = 0; c < GRID_SIZE; c++) {
            const cell = enemyGrid.rows[r].cells[c];
            cell.classList.remove('hit', 'miss');
        }
    }
}

// Mark a cell as hit
function markCellAsHit(grid, row, col) {
    const gridElement = document.getElementById(grid + '-grid');
    const cell = gridElement.rows[row].cells[col];
    cell.classList.add('hit');
}

// Mark a cell as miss
function markCellAsMiss(grid, row, col) {
    const gridElement = document.getElementById(grid + '-grid');
    const cell = gridElement.rows[row].cells[col];
    cell.classList.add('miss');
}

// Update multiplayer stats
function updateMultiplayerStats(myHitsCount, opponentHitsCount) {
    const playerShipsHit = opponentHitsCount;
    const enemyShipsHit = myHitsCount;

    document.getElementById('player-stats').textContent = `Hits taken: ${playerShipsHit}`;
    document.getElementById('opponent-stats').textContent = `Hits on opponent: ${enemyShipsHit}`;
}

// Display player ships on grid
function displayPlayerShips() {
    const playerGrid = document.getElementById('player-grid');

    // For each ship type
    Object.entries(gameState.player.ships).forEach(([shipType, coordinates]) => {
        // For each cell occupied by this ship
        coordinates.forEach(coord => {
            const row = coord.row;
            const col = coord.col;
            const cell = playerGrid.rows[row].cells[col];

            cell.classList.add('ship');
            cell.classList.add(shipType);
        });
    });
}

// Handle player's shot
function handlePlayerShot(row, col) {
    // Don't allow shots if it's not player's turn or game is over
    if (gameState.currentTurn !== 'player' || gameState.gameOver) {
        return;
    }

    const enemyGrid = document.getElementById('enemy-grid');
    const cell = enemyGrid.rows[row].cells[col];

    // Check if cell has already been targeted
    if (cell.classList.contains('hit') || cell.classList.contains('miss')) {
        return; // Cell already targeted
    }

    if (gameState.isMultiplayer) {
        // Multiplayer shot handling
        handleMultiplayerShot(row, col, cell);
    } else {
        // Single player shot handling
        handleSinglePlayerShot(row, col, cell);
    }
}

// Handle shot in multiplayer mode
function handleMultiplayerShot(row, col, cell) {
    // Temporarily disable further shots
    gameState.currentTurn = 'enemy';
    updateGameStatus("Processing your shot...");

    // Add a loading indicator to the cell
    cell.classList.add('processing');

    // Send shot to server
    fetch('/multiplayer/make_shot', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ row: row, col: col })
    })
    .then(response => {
        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }
        return response.json();
    })
    .then(data => {
        // Remove the loading indicator
        cell.classList.remove('processing');

        if (data.status === 'success') {
            // Mark cell based on hit/miss
            if (data.hit) {
                cell.classList.add('hit');
                // Get coordinate name for log
                const coordName = cell.dataset.coord;
                addLogEntry(`You fired at ${coordName} - HIT!`, 'player-action');

                // Play hit animation
                cell.classList.add('hit-animation');
                setTimeout(() => cell.classList.remove('hit-animation'), 500);

                // Check if ship was sunk
                if (data.sunk) {
                    addLogEntry(`You sunk the enemy's ${SHIP_TYPES[data.ship_type].label}!`, 'system-message');
                    // Add visual indication of sunk ships
                    if (data.ship_type) {
                        // Future enhancement: mark all cells of this ship type as sunk
                    }
                }
            } else {
                cell.classList.add('miss');
                // Get coordinate name for log
                const coordName = cell.dataset.coord;
                addLogEntry(`You fired at ${coordName} - miss.`, 'player-action');
            }

            // Check for game over
            if (data.game_over) {
                gameState.gameOver = true;
                showGameOver(true);
                clearInterval(gameState.pollingInterval); // Stop polling
            } else {
                // Switch turns immediately in UI
                gameState.currentTurn = 'enemy';
                updateGameStatus("Opponent's turn - waiting for their move...");
            }
        } else {
            console.error('Error making shot:', data.message);

            // Show user-friendly error message
            addLogEntry(`Error: ${data.message}`, 'system-message');

            // Restore player's turn if there was an error
            gameState.currentTurn = 'player';
            updateGameStatus('Your turn - select a target to fire upon');
        }
    })
    .catch(error => {
        // Remove the loading indicator
        cell.classList.remove('processing');

        console.error('Error:', error);

        // Show user-friendly error message
        addLogEntry('Connection error. Please try again.', 'system-message');

        // Restore player's turn if there was an error
        gameState.currentTurn = 'player';
        updateGameStatus('Your turn - select a target to fire upon');
    });
}

// Handle shot in single player mode
function handleSinglePlayerShot(row, col, cell) {
    // Check if the shot is a hit
    let isHit = false;
    let hitShipType = null;

    // Check all enemy ships
    Object.entries(gameState.enemy.ships).forEach(([shipType, coordinates]) => {
        coordinates.forEach(coord => {
            if (coord.row === row && coord.col === col) {
                isHit = true;
                hitShipType = shipType;
            }
        });
    });

    if (isHit) {
        // Record hit
        gameState.enemy.hits.push({ row, col, shipType: hitShipType });
        cell.classList.add('hit');
        // Get coordinate name for log (e.g., "A1")
        const coordName = cell.dataset.coord;
        addLogEntry(`You fired at ${coordName} - HIT!`, 'player-action');

        // Play hit sound or animation
        cell.classList.add('hit-animation');
        setTimeout(() => cell.classList.remove('hit-animation'), 500);

        // Check if ship is sunk
        checkForSunkShip('enemy', hitShipType);
    } else {
        // Record miss
        gameState.enemy.misses.push({ row, col });
        cell.classList.add('miss');
        // Get coordinate name for log
        const coordName = cell.dataset.coord;
        addLogEntry(`You fired at ${coordName} - miss.`, 'player-action');
    }

    // Check for game over
    if (checkForGameOver()) {
        return;
    }

    // Switch turns
    gameState.currentTurn = 'enemy';
    updateGameStatus('Enemy turn - they are choosing a target...');

    // Enemy will take their turn after a delay
    setTimeout(handleEnemyTurn, 1500);
}

// Handle enemy's turn
function handleEnemyTurn() {
    if (gameState.gameOver) return;

    const playerGrid = document.getElementById('player-grid');
    let row, col;

    // AI targeting logic
    if (gameState.enemy.nextTargets.length > 0) {
        // Target adjacent to previous hits
        const nextTarget = gameState.enemy.nextTargets.shift();
        row = nextTarget.row;
        col = nextTarget.col;
    } else {
        // Choose a random unattacked cell
        let validTarget = false;
        while (!validTarget) {
            row = Math.floor(Math.random() * GRID_SIZE);
            col = Math.floor(Math.random() * GRID_SIZE);

            // Check if the cell has already been targeted
            const cell = playerGrid.rows[row].cells[col];
            if (!cell.classList.contains('hit') && !cell.classList.contains('miss')) {
                validTarget = true;
            }
        }
    }

    // Display "thinking" animation
    updateGameStatus('Enemy is taking aim...');

    // Add a delay to simulate "thinking"
    setTimeout(() => {
        const cell = playerGrid.rows[row].cells[col];

        // Check if the shot is a hit
        let isHit = false;
        let hitShipType = null;

        if (cell.classList.contains('ship')) {
            isHit = true;
            // Find which ship was hit
            Object.entries(SHIP_TYPES).forEach(([type, _]) => {
                if (cell.classList.contains(type)) {
                    hitShipType = type;
                }
            });
        }

        if (isHit) {
            // Record hit
            gameState.player.hits.push({ row, col, shipType: hitShipType });
            cell.classList.add('hit');
            // Get coordinate name for log
            const coordName = cell.dataset.coord;
            addLogEntry(`Enemy fired at ${coordName} - HIT!`, 'enemy-action');
            // Add adjacent cells to the targeting queue
            updateEnemyTargeting(row, col);

            // Remember this as the last hit for targeting
            gameState.enemy.lastHit = { row, col };

            // Play hit animation
            cell.classList.add('hit-animation');
            setTimeout(() => cell.classList.remove('hit-animation'), 500);

            // Check if ship is sunk
            checkForSunkShip('player', hitShipType);
        } else {
            // Record miss
            gameState.player.misses.push({ row, col });
            cell.classList.add('miss');
            // Get coordinate name for log
            const coordName = cell.dataset.coord;
            addLogEntry(`Enemy fired at ${coordName} - miss.`, 'enemy-action');
        }

        // Check for game over
        if (checkForGameOver()) {
            return;
        }

        // Switch turns
        gameState.currentTurn = 'player';
        updateGameStatus('Your turn - select a target to fire upon');
    }, 1000); // Delay for "thinking"
}

// Update enemy targeting strategy
function updateEnemyTargeting(hitRow, hitCol) {
    // Add adjacent cells to the targeting queue if they haven't been targeted yet
    const potentialTargets = [
        { row: hitRow - 1, col: hitCol }, // Up
        { row: hitRow + 1, col: hitCol }, // Down
        { row: hitRow, col: hitCol - 1 }, // Left
        { row: hitRow, col: hitCol + 1 }  // Right
    ];

    const playerGrid = document.getElementById('player-grid');

    potentialTargets.forEach(target => {
        // Check if target is within grid bounds
        if (target.row >= 0 && target.row < GRID_SIZE &&
            target.col >= 0 && target.col < GRID_SIZE) {

            // Check if this cell has already been attacked
            const cell = playerGrid.rows[target.row].cells[target.col];
            if (!cell.classList.contains('hit') && !cell.classList.contains('miss')) {
                // Add to targeting queue if not already in it
                if (!gameState.enemy.nextTargets.some(t =>
                    t.row === target.row && t.col === target.col)) {
                    gameState.enemy.nextTargets.push(target);
                }
            }
        }
    });

    // Prioritize targets that are in line with multiple hits
    if (gameState.enemy.lastHit) {
        const lastHit = gameState.enemy.lastHit;

        // Check if we have two hits in a row, which indicates ship direction
        if (Math.abs(lastHit.row - hitRow) === 1 && lastHit.col === hitCol) {
            // Vertical alignment - prioritize targets in this direction
            const direction = hitRow - lastHit.row;  // -1 for up, 1 for down

            // Clear non-aligned targets
            gameState.enemy.nextTargets = gameState.enemy.nextTargets.filter(t =>
                t.col === hitCol
            );

            // Add extended targets in the same direction
            const extendedRow = hitRow + direction;
            if (extendedRow >= 0 && extendedRow < GRID_SIZE) {
                const extendedCell = playerGrid.rows[extendedRow].cells[hitCol];
                if (!extendedCell.classList.contains('hit') && !extendedCell.classList.contains('miss')) {
                    if (!gameState.enemy.nextTargets.some(t =>
                        t.row === extendedRow && t.col === hitCol)) {
                        gameState.enemy.nextTargets.unshift({ row: extendedRow, col: hitCol });
                    }
                }
            }

        } else if (Math.abs(lastHit.col - hitCol) === 1 && lastHit.row === hitRow) {
            // Horizontal alignment - prioritize targets in this direction
            const direction = hitCol - lastHit.col;  // -1 for left, 1 for right

            // Clear non-aligned targets
            gameState.enemy.nextTargets = gameState.enemy.nextTargets.filter(t =>
                t.row === hitRow
            );

            // Add extended targets in the same direction
            const extendedCol = hitCol + direction;
            if (extendedCol >= 0 && extendedCol < GRID_SIZE) {
                const extendedCell = playerGrid.rows[hitRow].cells[extendedCol];
                if (!extendedCell.classList.contains('hit') && !extendedCell.classList.contains('miss')) {
                    if (!gameState.enemy.nextTargets.some(t =>
                        t.row === hitRow && t.col === extendedCol)) {
                        gameState.enemy.nextTargets.unshift({ row: hitRow, col: extendedCol });
                    }
                }
            }
        }
    }
}
