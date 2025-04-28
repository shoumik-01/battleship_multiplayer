// JavaScript file for improved Battleship Setup Phase

// Constants for grid and ships
const GRID_SIZE = 10;
const CELL_SIZE = 40; // Cell size in pixels

// Variables to track current drag operation
let currentShip = null;
let dragOffsetX = 0;
let dragOffsetY = 0;
let placedShips = {};

// Check if this is multiplayer mode
const isMultiplayer = document.body.hasAttribute('data-multiplayer');
const playerNumber = isMultiplayer ? parseInt(document.body.getAttribute('data-player-number')) : null;
const gameId = isMultiplayer ? document.body.getAttribute('data-game-id') : null;

// Create 10x10 player grid
function createGrid() {
    const grid = document.getElementById('player-grid');
    for (let r = 0; r < GRID_SIZE; r++) {
        const row = grid.insertRow();
        for (let c = 0; c < GRID_SIZE; c++) {
            const cell = row.insertCell();
            cell.dataset.row = r;
            cell.dataset.col = c;
            cell.style.width = CELL_SIZE + 'px';
            cell.style.height = CELL_SIZE + 'px';

            // Add event listeners for drag and drop
            cell.addEventListener('dragover', handleDragOver);
            cell.addEventListener('drop', handleDrop);
            cell.addEventListener('dragenter', handleDragEnter);
            cell.addEventListener('dragleave', handleDragLeave);
        }
    }
}

// Handle drop event on grid cells
function handleDrop(e) {
    e.preventDefault();

    if (!currentShip) return;

    // Get drop target
    const cell = e.target;
    if (cell.tagName !== 'TD') return;

    // Get cell coordinates
    const row = parseInt(cell.dataset.row);
    const col = parseInt(cell.dataset.col);

    // Get ship properties
    const shipId = currentShip.id;
    const size = parseInt(currentShip.dataset.size);
    const orientation = currentShip.dataset.orientation;

    // Calculate offset in cells
    let offsetCells = 0;
    if (orientation === 'horizontal') {
        offsetCells = Math.floor(dragOffsetX / CELL_SIZE);
    } else {
        offsetCells = Math.floor(dragOffsetY / CELL_SIZE);
    }

    // Adjust starting position based on drag offset
    let adjustedRow = row;
    let adjustedCol = col;

    if (orientation === 'horizontal') {
        adjustedCol = Math.max(0, col - offsetCells);
    } else {
        adjustedRow = Math.max(0, row - offsetCells);
    }

    // Check if ship can be placed
    if (!canPlaceShip(adjustedRow, adjustedCol, size, orientation, shipId)) {
        return;
    }

    // Place the ship
    placeShip(shipId, adjustedRow, adjustedCol, size, orientation);

    // Update visual feedback
    currentShip.style.opacity = '0.5';
    currentShip = null;

    // Remove drag-over class
    document.querySelectorAll('.drag-over').forEach(cell => {
        cell.classList.remove('drag-over');
    });
}

// Check if ship can be placed
function canPlaceShip(startRow, startCol, size, orientation, shipId) {
    // Check boundaries
    if (orientation === 'horizontal' && startCol + size > GRID_SIZE) {
        alert('Ship does not fit horizontally!');
        return false;
    }
    if (orientation === 'vertical' && startRow + size > GRID_SIZE) {
        alert('Ship does not fit vertically!');
        return false;
    }

    // Check for overlapping ships
    for (let i = 0; i < size; i++) {
        let row = startRow;
        let col = startCol;

        if (orientation === 'horizontal') {
            col += i;
        } else { // vertical
            row += i;
        }

        const cell = document.querySelector(`#player-grid tr:nth-child(${row + 1}) td:nth-child(${col + 1})`);

        if (cell.classList.contains('occupied') &&
            (!cell.dataset.ship || cell.dataset.ship !== shipId)) {
            alert('Space already occupied!');
            return false;
        }
    }

    return true;
}

// Remove ship from grid
function removeShipFromGrid(shipId) {
    if (!placedShips[shipId]) return;

    // Remove ship from grid
    document.querySelectorAll(`#player-grid td[data-ship="${shipId}"]`).forEach(cell => {
        cell.classList.remove('occupied');
        cell.style.backgroundColor = '';
        delete cell.dataset.ship;
    });

    // Remove from placed ships
    delete placedShips[shipId];
}

// Place ship on grid
function placeShip(shipId, startRow, startCol, size, orientation) {
    // First remove ship from previous position if it was placed
    removeShipFromGrid(shipId);

    // Record placement
    placedShips[shipId] = {
        row: startRow,
        col: startCol,
        size: size,
        orientation: orientation
    };

    // Get ship color
    const ship = document.getElementById(shipId);
    const shipColor = ship.style.backgroundColor;

    // Place the ship
    for (let i = 0; i < size; i++) {
        let row = startRow;
        let col = startCol;

        if (orientation === 'horizontal') {
            col += i;
        } else { // vertical
            row += i;
        }

        const cell = document.querySelector(`#player-grid tr:nth-child(${row + 1}) td:nth-child(${col + 1})`);
        cell.classList.add('occupied');
        cell.style.backgroundColor = shipColor;
        cell.dataset.ship = shipId;
    }
}

// Handle Rotate button click
function handleRotateClick(e) {
    const shipId = e.target.dataset.target;
    const ship = document.getElementById(shipId);
    if (!ship) return;

    const orientation = ship.dataset.orientation;
    const size = parseInt(ship.dataset.size);

    // Toggle orientation
    if (orientation === 'horizontal') {
        ship.dataset.orientation = 'vertical';
        ship.classList.add('vertical');
        ship.style.width = CELL_SIZE + 'px';
        ship.style.height = (CELL_SIZE * size) + 'px';
    } else {
        ship.dataset.orientation = 'horizontal';
        ship.classList.remove('vertical');
        ship.style.width = (CELL_SIZE * size) + 'px';
        ship.style.height = CELL_SIZE + 'px';
    }

    // If ship is already placed, reposition it
    if (placedShips[shipId]) {
        const placement = placedShips[shipId];

        // Check if new orientation fits
        if (canPlaceShip(placement.row, placement.col, size, ship.dataset.orientation, shipId)) {
            placeShip(shipId, placement.row, placement.col, size, ship.dataset.orientation);
        } else {
            // Reset orientation if cannot place in new orientation
            handleRotateClick(e); // Toggle back
            alert('Cannot rotate ship in current position!');
        }
    }
}

// Handle Confirm button click
function submitSetup() {
    // Check if all ships are placed
    const expectedShips = ['carrier', 'battleship', 'cruiser', 'submarine', 'destroyer'];
    const missingShips = expectedShips.filter(ship => !placedShips[ship]);

    if (missingShips.length > 0) {
        alert(`Please place all ships before confirming! Missing: ${missingShips.join(', ')}`);
        return;
    }

    // Convert placed ships to format for server
    const shipsData = {};
    Object.entries(placedShips).forEach(([shipId, placement]) => {
        shipsData[shipId] = [];
        const size = parseInt(document.getElementById(shipId).dataset.size);

        for (let i = 0; i < size; i++) {
            let row = placement.row;
            let col = placement.col;

            if (placement.orientation === 'horizontal') {
                col += i;
            } else {
                row += i;
            }

            shipsData[shipId].push({ row, col });
        }
    });

    // Submit to server - different endpoint for multiplayer
    const endpoint = isMultiplayer ? '/multiplayer/submit_ships' : '/submit_ships';

    fetch(endpoint, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ ships: shipsData })
    }).then(response => response.json())
      .then(data => {
          if (data.status === 'success') {
              if (isMultiplayer) {
                  if (data.both_ready) {
                      alert('Both players are ready! Game starts now!');
                      window.location.href = data.redirect;
                  } else {
                      alert('Ships submitted! Waiting for opponent to place their ships...');
                      document.getElementById('confirm-btn').disabled = true;
                      document.getElementById('confirm-btn').textContent = 'Waiting for opponent...';

                      // Start polling for opponent readiness
                      startReadinessPolling();
                  }
              } else {
                  alert('Ships submitted! Game starts now!');
                  window.location.href = data.redirect;
              }
          } else {
              alert('Error submitting ships. Please try again.');
          }
      })
      .catch(error => {
          console.error('Error:', error);
          alert('An error occurred. Please try again.');
      });
}

// For multiplayer: poll to check if opponent is ready
function startReadinessPolling() {
    const pollingInterval = setInterval(() => {
        fetch('/multiplayer/get_game_state')
            .then(response => response.json())
            .then(data => {
                if (data.status === 'success') {
                    if (data.game_status === 'playing') {
                        clearInterval(pollingInterval);
                        alert('Opponent is ready! Game starts now!');
                        window.location.href = '/multiplayer/game';
                    }
                }
            })
            .catch(error => {
                console.error('Error checking opponent readiness:', error);
            });
    }, 3000); // Check every 3 seconds
}

// Timer function
function startTimer(seconds) {
    let timeLeft = seconds;
    const timerDisplay = document.getElementById('timer');

    const timer = setInterval(() => {
        if (timeLeft <= 0) {
            clearInterval(timer);
            alert('Time is up! Auto-submitting ships...');
            submitSetup();
        } else {
            timeLeft--;
            const minutes = Math.floor(timeLeft / 60);
            const seconds = timeLeft % 60;
            timerDisplay.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
        }
    }, 1000);
}

// Initialize the game
function initGame() {
    createGrid();
    initializeShips();

    // Set up confirm button
    const confirmButton = document.getElementById('confirm-btn');
    confirmButton.addEventListener('click', submitSetup);

    // Set up timer
    startTimer(300); // 5 minutes

    // Update page title for multiplayer mode
    if (isMultiplayer) {
        document.title = `Battleship - Player ${playerNumber} Setup`;
        const headingElement = document.querySelector('h1');
        if (headingElement) {
            headingElement.textContent = `Battleship: Player ${playerNumber} - Place Your Ships`;
        }
    }
}

// Start the game when DOM is loaded
document.addEventListener('DOMContentLoaded', initGame);

// Initialize ships with correct sizes
function initializeShips() {
    const shipConfigs = {
        'carrier': { size: 5, color: 'blue', label: 'Ca' },
        'battleship': { size: 4, color: 'red', label: 'B' },
        'cruiser': { size: 3, color: 'green', label: 'Cr' },
        'submarine': { size: 3, color: 'purple', label: 'S' },
        'destroyer': { size: 2, color: 'orange', label: 'D' }
    };

    // Set up each ship
    Object.entries(shipConfigs).forEach(([shipId, config]) => {
        const ship = document.getElementById(shipId);
        if (!ship) return;

        ship.dataset.size = config.size;
        ship.dataset.orientation = 'horizontal';
        ship.style.backgroundColor = config.color;
        ship.style.width = (config.size * CELL_SIZE) + 'px';
        ship.style.height = CELL_SIZE + 'px';
        ship.style.display = 'flex';
        ship.style.alignItems = 'center';
        ship.style.justifyContent = 'center';
        ship.textContent = config.label;

        // Add drag event listeners
        ship.addEventListener('dragstart', handleDragStart);
        ship.addEventListener('dragend', handleDragEnd);
    });

    // Set up rotation buttons
    document.querySelectorAll('.rotate-btn').forEach(button => {
        button.addEventListener('click', handleRotateClick);
    });
}

// Handle drag start event
function handleDragStart(e) {
    currentShip = e.target;

    // Calculate offset within the ship element where the drag started
    const rect = currentShip.getBoundingClientRect();
    dragOffsetX = e.clientX - rect.left;
    dragOffsetY = e.clientY - rect.top;

    // Store the drag offset as a data transfer value
    e.dataTransfer.setData('text/plain', `${dragOffsetX},${dragOffsetY}`);

    // For better visual feedback during drag
    if (currentShip.dataset.orientation === 'horizontal') {
        // Set drag image position based on where user clicked
        const cellOffset = Math.floor(dragOffsetX / CELL_SIZE);
        e.dataTransfer.setDragImage(currentShip, cellOffset * CELL_SIZE + (CELL_SIZE / 2), CELL_SIZE / 2);
    } else {
        // For vertical ships
        const cellOffset = Math.floor(dragOffsetY / CELL_SIZE);
        e.dataTransfer.setDragImage(currentShip, CELL_SIZE / 2, cellOffset * CELL_SIZE + (CELL_SIZE / 2));
    }

    // Add visual feedback
    setTimeout(() => {
        currentShip.style.opacity = '0.7';
    }, 0);

    // Remove ship from previous position if already placed
    removeShipFromGrid(currentShip.id);
}

// Handle drag end event
function handleDragEnd(e) {
    if (currentShip) {
        currentShip.style.opacity = '1';
    }

    // Clear preview cells
    clearPreviewCells();

    // Reset current ship if not placed
    if (!placedShips[currentShip?.id]) {
        currentShip = null;
    }
}

// Handle drag over
function handleDragOver(e) {
    e.preventDefault(); // Allow drop

    if (currentShip) {
        // Calculate potential position based on the cell
        if (e.target.tagName === 'TD') {
            const cell = e.target;
            const row = parseInt(cell.dataset.row);
            const col = parseInt(cell.dataset.col);

            // Account for where the user grabbed the ship
            const size = parseInt(currentShip.dataset.size);
            const orientation = currentShip.dataset.orientation;

            // Calculate offset in cells (not pixels)
            let offsetCells = 0;
            if (orientation === 'horizontal') {
                offsetCells = Math.floor(dragOffsetX / CELL_SIZE);
            } else {
                offsetCells = Math.floor(dragOffsetY / CELL_SIZE);
            }

            // Adjust starting position based on where ship was grabbed
            let adjustedRow = row;
            let adjustedCol = col;

            if (orientation === 'horizontal') {
                adjustedCol = Math.max(0, col - offsetCells);
            } else {
                adjustedRow = Math.max(0, row - offsetCells);
            }

            // Update preview
            updatePreview(adjustedRow, adjustedCol);
        }
    }
}

// Show preview of ship placement
function updatePreview(startRow, startCol) {
    if (!currentShip) return;

    // Get ship properties
    const size = parseInt(currentShip.dataset.size);
    const orientation = currentShip.dataset.orientation;

    // Clear previous preview
    clearPreviewCells();

    // Calculate cells that would be occupied
    const cells = [];
    let isValid = true;

    for (let i = 0; i < size; i++) {
        let row = startRow;
        let col = startCol;

        if (orientation === 'horizontal') {
            col += i;
        } else { // vertical
            row += i;
        }

        // Check if position is valid
        if (row < 0 || row >= GRID_SIZE || col < 0 || col >= GRID_SIZE) {
            isValid = false;
            break;
        }

        const cell = document.querySelector(`#player-grid tr:nth-child(${row + 1}) td:nth-child(${col + 1})`);

        // Check if cell is already occupied by another ship
        if (cell.classList.contains('occupied') &&
            (!cell.dataset.ship || cell.dataset.ship !== currentShip.id)) {
            isValid = false;
            break;
        }

        cells.push(cell);
    }

    // Update preview
    cells.forEach(cell => {
        if (isValid) {
            cell.classList.add('preview-valid');
        } else {
            cell.classList.add('preview-invalid');
        }
    });
}

// Clear preview styling
function clearPreviewCells() {
    document.querySelectorAll('.preview-valid, .preview-invalid').forEach(cell => {
        cell.classList.remove('preview-valid', 'preview-invalid');
    });
}

// Handle drag enter
function handleDragEnter(e) {
    if (e.target.tagName === 'TD') {
        e.target.classList.add('drag-over');
    }
}

// Handle drag leave
function handleDragLeave(e) {
    if (e.target.tagName === 'TD') {
        e.target.classList.remove('drag-over');
    }
}
