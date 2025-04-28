from flask import Flask, render_template, request, jsonify, session, redirect, url_for
import random
import string
import time
import logging
import json
import os
import tempfile
from datetime import datetime, timedelta

# Configure logging
logging.basicConfig(level=logging.DEBUG,
                    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

app = Flask(__name__)
app.secret_key = 'battleship_secure_key_2025'  # Use a fixed secret key
# Add session lifetime configuration (30 minutes)
app.config['PERMANENT_SESSION_LIFETIME'] = timedelta(minutes=30)

GRID_SIZE = 10
SHIP_SIZES = {
    'carrier': 5,
    'battleship': 4,
    'cruiser': 3,
    'submarine': 3,
    'destroyer': 2
}

# Create a directory for game storage
GAME_STORAGE_DIR = os.path.join(tempfile.gettempdir(), 'battleship_games')
os.makedirs(GAME_STORAGE_DIR, exist_ok=True)
logger.debug(f"Game storage directory: {GAME_STORAGE_DIR}")

# Functions for file-based game storage
def save_game(game_id, game_data):
    try:
        file_path = os.path.join(GAME_STORAGE_DIR, f"{game_id}.json")
        with open(file_path, 'w') as f:
            json.dump(game_data, f)
        logger.debug(f"Game saved: {game_id}")
        return True
    except Exception as e:
        logger.error(f"Error saving game {game_id}: {e}")
        return False

def load_game(game_id):
    try:
        file_path = os.path.join(GAME_STORAGE_DIR, f"{game_id}.json")
        if os.path.exists(file_path):
            with open(file_path, 'r') as f:
                game_data = json.load(f)
            logger.debug(f"Game loaded: {game_id}")
            return game_data
        else:
            logger.debug(f"Game not found: {game_id}")
            return None
    except Exception as e:
        logger.error(f"Error loading game {game_id}: {e}")
        return None

def delete_game(game_id):
    try:
        file_path = os.path.join(GAME_STORAGE_DIR, f"{game_id}.json")
        if os.path.exists(file_path):
            os.remove(file_path)
            logger.debug(f"Game deleted: {game_id}")
        return True
    except Exception as e:
        logger.error(f"Error deleting game {game_id}: {e}")
        return False

def list_games():
    try:
        games = []
        for filename in os.listdir(GAME_STORAGE_DIR):
            if filename.endswith('.json'):
                games.append(filename[:-5])  # Remove .json extension
        return games
    except Exception as e:
        logger.error(f"Error listing games: {e}")
        return []

def random_bot_ships():
    ships = {}
    occupied = set()

    for ship, size in SHIP_SIZES.items():
        placed = False
        while not placed:
            orientation = random.choice(['horizontal', 'vertical'])
            row = random.randint(0, GRID_SIZE - 1)
            col = random.randint(0, GRID_SIZE - 1)
            coords = []

            if orientation == 'horizontal' and col + size <= GRID_SIZE:
                coords = [(row, c) for c in range(col, col + size)]
            elif orientation == 'vertical' and row + size <= GRID_SIZE:
                coords = [(r, col) for r in range(row, row + size)]

            if coords and all((r, c) not in occupied for r, c in coords):
                for coord in coords:
                    occupied.add(coord)
                ships[ship] = [{'row': r, 'col': c} for r, c in coords]
                placed = True

    return ships

# Main menu - new home page
@app.route('/')
def home():
    return render_template('home.html')

# Single player routes
@app.route('/single-player')
def setup():
    # Reset game state when starting a new setup
    if 'game_started' in session:
        del session['game_started']
    if 'player_ships' in session:
        del session['player_ships']
    if 'enemy_ships' in session:
        del session['enemy_ships']

    return render_template('setup.html')

@app.route('/submit_ships', methods=['POST'])
def submit_ships():
    data = request.get_json()
    session['player_ships'] = data.get('ships', {})
    session['enemy_ships'] = random_bot_ships()
    session['game_started'] = True

    # Return success with redirect URL instead of simple status
    return jsonify({
        'status': 'success',
        'redirect': url_for('game_page')
    })

@app.route('/game')
def game_page():
    # Check if ships have been placed
    if not session.get('game_started'):
        return redirect(url_for('setup'))

    return render_template('game.html', game_mode='single')

@app.route('/get_player_ships')
def get_player_ships():
    if not session.get('player_ships'):
        return jsonify({'status': 'error', 'message': 'No ships found'})

    return jsonify({'status': 'success', 'ships': session.get('player_ships')})

@app.route('/get_enemy_ships')
def get_enemy_ships():
    if not session.get('enemy_ships'):
        return jsonify({'status': 'error', 'message': 'No enemy ships found'})

    return jsonify({'status': 'success', 'ships': session.get('enemy_ships')})

@app.route('/reset_game')
def reset_game():
    # Get the game_id before clearing the session
    game_id = session.get('game_id')
    
    # Clear game data from session
    if 'player_ships' in session:
        del session['player_ships']
    if 'enemy_ships' in session:
        del session['enemy_ships']
    if 'game_started' in session:
        del session['game_started']
    if 'game_id' in session:
        del session['game_id']

    # If it was a multiplayer game and it's over, mark it as such
    if game_id:
        game = load_game(game_id)
        if game and game.get('status') != 'game_over':
            game['status'] = 'abandoned'
            game['last_activity'] = time.time()
            save_game(game_id, game)
            logger.debug(f"Game {game_id} marked as abandoned during reset")

    return redirect(url_for('home'))

# Multiplayer routes
@app.route('/multiplayer')
def multiplayer_select():
    return render_template('multiplayer_select.html')

@app.route('/multiplayer/player/<int:player_number>')
def multiplayer_setup(player_number):
    if player_number not in [1, 2]:
        return redirect(url_for('multiplayer_select'))

    # Make session permanent to use the PERMANENT_SESSION_LIFETIME setting
    session.permanent = True
    
    # Store player number as integer in session
    session['player_number'] = player_number
    logger.debug(f"Setting player_number in session to {player_number}")
    
    # IMPORTANT: Check if we're coming from a completed game
    # If the stored game_id is for a 'game_over' state game, clear it to force new game creation
    game_id = session.get('game_id')
    if game_id:
        game = load_game(game_id)
        if game and game.get('status') == 'game_over':
            # Clear the game_id since the game is over
            logger.debug(f"Clearing completed game: {game_id}")
            session.pop('game_id', None)
            game_id = None

    # Create or join a game
    logger.debug(f"Current game_id in session: {game_id}")

    # If no game_id in session or game doesn't exist anymore, create/join one
    if not game_id or not load_game(game_id):
        # Check if there's an open game (player 1 waiting for player 2)
        open_game_id = None
        for gid in list_games():
            game = load_game(gid)
            if (player_number == 2 and
                game and game['status'] == 'waiting' and
                '1' in game['players']):
                open_game_id = gid
                break

        if open_game_id:
            # Join the open game as player 2
            game_id = open_game_id
            game = load_game(game_id)

            # Ensure the players dictionary exists
            if 'players' not in game:
                game['players'] = {}

            game['players'][str(player_number)] = {'ready': False}
            game['last_activity'] = time.time()
            save_game(game_id, game)
            logger.debug(f"Player 2 joined existing game: {game_id}")
        else:
            # Create a new game
            game_id = ''.join(random.choices(string.ascii_uppercase + string.digits, k=6))
            game = {
                'players': {str(player_number): {'ready': False}},
                'status': 'waiting',
                'current_turn': None,
                'player_ships': {},
                'shots': {'1': {'hits': [], 'misses': []}, '2': {'hits': [], 'misses': []}},
                'created_at': time.time(),
                'last_activity': time.time()
            }
            save_game(game_id, game)
            logger.debug(f"Created new game: {game_id} for player {player_number}")

        session['game_id'] = game_id
    else:
        logger.debug(f"Using existing game: {game_id}")
        # Make sure this player is in the game
        game = load_game(game_id)

        # Ensure the players dictionary exists
        if 'players' not in game:
            game['players'] = {}

        if str(player_number) not in game['players']:
            game['players'][str(player_number)] = {'ready': False}
            
        # Always update last_activity when player connects
        game['last_activity'] = time.time()
        save_game(game_id, game)

    return render_template('setup.html', multiplayer=True, player_number=player_number, game_id=game_id)

@app.route('/multiplayer/submit_ships', methods=['POST'])
def multiplayer_submit_ships():
    try:
        # Make session permanent to use the PERMANENT_SESSION_LIFETIME setting
        session.permanent = True
        
        data = request.get_json()
        game_id = session.get('game_id')
        # Ensure player_number is always an integer in the session
        player_number = int(session.get('player_number', 0))

        # Enhanced debug logging
        logger.debug(f"Submit ships - game_id: {game_id}, player_number: {player_number}")
        logger.debug(f"Submit ships - session: {dict(session)}")

        # Validate session data
        if not game_id or player_number not in [1, 2]:
            logger.error(f"Invalid game session: game_id={game_id}, player_number={player_number}")
            return jsonify({'status': 'error', 'message': 'Invalid game session'})

        # Load the game data
        game = load_game(game_id)
        if not game:
            logger.error(f"Game not found: {game_id}")
            return jsonify({'status': 'error', 'message': 'Game not found'})

        # Convert player_number to string for consistent dictionary keys
        player_number_str = str(player_number)
        logger.debug(f"Player {player_number_str} submitting ships")

        # Initialize player_ships dict if it doesn't exist
        if 'player_ships' not in game:
            game['player_ships'] = {}

        # Save ships using the correct player number
        game['player_ships'][player_number_str] = data.get('ships', {})

        # Ensure players dict is properly structured
        if 'players' not in game:
            game['players'] = {}
        if player_number_str not in game['players']:
            game['players'][player_number_str] = {}

        game['players'][player_number_str]['ready'] = True
        game['last_activity'] = time.time()

        logger.debug(f"After saving - Player {player_number_str} ships: {game['player_ships'].get(player_number_str)}")
        logger.debug(f"After saving - Players data: {game['players']}")

        # Check if both players are ready
        both_ready = False
        if '1' in game['players'] and '2' in game['players']:
            player1_ready = game['players']['1'].get('ready', False)
            player2_ready = game['players']['2'].get('ready', False)
            both_ready = player1_ready and player2_ready

            logger.debug(f"Readiness check: Player 1 ready: {player1_ready}, Player 2 ready: {player2_ready}")

            # If both players exist and have submitted ships, check if game can start
            if '1' in game['player_ships'] and '2' in game['player_ships']:
                if player1_ready and player2_ready:
                    both_ready = True
                    logger.debug("Both players have ships and are ready, starting game")

        if both_ready:
            game['status'] = 'playing'
            game['current_turn'] = 1  # Player 1 goes first
            # Initialize game stats
            game['stats'] = {
                '1': {'shots': 0, 'hits': 0, 'misses': 0},
                '2': {'shots': 0, 'hits': 0, 'misses': 0}
            }
            logger.debug(f"Game status changed to playing, current turn: {game['current_turn']}")

        # Save the updated game data
        save_game(game_id, game)

        return jsonify({
            'status': 'success',
            'both_ready': both_ready,
            'redirect': url_for('multiplayer_game') if both_ready else None
        })
    except Exception as e:
        logger.exception(f"Error in multiplayer_submit_ships: {e}")
        return jsonify({'status': 'error', 'message': f'Server error: {str(e)}'})

@app.route('/multiplayer/game')
def multiplayer_game():
    # Make session permanent to use the PERMANENT_SESSION_LIFETIME setting
    session.permanent = True
    
    game_id = session.get('game_id')
    player_number = session.get('player_number')

    logger.debug(f"Accessing multiplayer game: player={player_number}, game={game_id}")

    # Load the game data
    game = load_game(game_id)

    if not game_id or not player_number or not game:
        logger.error(f"Invalid game session for multiplayer_game")
        return redirect(url_for('multiplayer_select'))

    player_number_str = str(player_number)

    # If player isn't part of this game, redirect
    if player_number_str not in game['players']:
        logger.error(f"Player {player_number} not in game {game_id}")
        return redirect(url_for('multiplayer_select'))

    # If both players aren't ready, redirect to setup
    if game['status'] != 'playing':
        logger.debug(f"Game not in playing state, redirecting to setup")
        return redirect(url_for('multiplayer_setup', player_number=player_number))

    # Update last activity timestamp
    game['last_activity'] = time.time()
    save_game(game_id, game)

    return render_template('game.html',
                          multiplayer=True,
                          player_number=player_number,
                          game_id=game_id)

@app.route('/multiplayer/get_player_ships')
def multiplayer_get_player_ships():
    # Make session permanent to use the PERMANENT_SESSION_LIFETIME setting
    session.permanent = True
    
    game_id = session.get('game_id')
    player_number = session.get('player_number')

    # Load the game data
    game = load_game(game_id)

    if not game_id or not player_number or not game:
        logger.error(f"Invalid game session for multiplayer_get_player_ships")
        return jsonify({'status': 'error', 'message': 'Invalid game session'})

    player_number_str = str(player_number)

    if 'player_ships' not in game or player_number_str not in game['player_ships']:
        logger.error(f"No ships found for player {player_number} in game {game_id}")
        return jsonify({'status': 'error', 'message': 'No ships found'})

    # Debug log to see which ships are being sent
    logger.debug(f"Sending ships for player {player_number_str}: {game['player_ships'][player_number_str]}")

    # Update last activity timestamp
    game['last_activity'] = time.time()
    save_game(game_id, game)

    return jsonify({'status': 'success', 'ships': game['player_ships'][player_number_str]})

@app.route('/multiplayer/get_game_state')
def multiplayer_get_game_state():
    # Make session permanent to use the PERMANENT_SESSION_LIFETIME setting
    session.permanent = True
    
    game_id = session.get('game_id')
    player_number = session.get('player_number')

    # Enhanced logging
    logger.debug(f"Getting game state - game_id: {game_id}, player_number: {player_number}")

    # Load the game data
    game = load_game(game_id)

    if not game_id or not player_number or not game:
        logger.error(f"Invalid game session for multiplayer_get_game_state: game_id={game_id}, player_number={player_number}, game exists={bool(game)}")
        return jsonify({'status': 'error', 'message': 'Invalid game session'})

    # Ensure player_number is a string for consistent dictionary keys
    player_number_str = str(player_number)
    opponent_number_str = '2' if player_number_str == '1' else '1'

    # Update last activity timestamp
    game['last_activity'] = time.time()
    save_game(game_id, game)

    # Ensure shots structure exists for both players
    if 'shots' not in game:
        game['shots'] = {
            '1': {'hits': [], 'misses': []},
            '2': {'hits': [], 'misses': []}
        }
    elif player_number_str not in game['shots']:
        game['shots'][player_number_str] = {'hits': [], 'misses': []}
    elif opponent_number_str not in game['shots']:
        game['shots'][opponent_number_str] = {'hits': [], 'misses': []}

    # Check for valid shots data structure
    for player in ['1', '2']:
        if player not in game['shots']:
            game['shots'][player] = {'hits': [], 'misses': []}
        else:
            if 'hits' not in game['shots'][player]:
                game['shots'][player]['hits'] = []
            if 'misses' not in game['shots'][player]:
                game['shots'][player]['misses'] = []
                
    # Ensure game stats structure exists
    if 'stats' not in game:
        game['stats'] = {
            '1': {'shots': 0, 'hits': 0, 'misses': 0},
            '2': {'shots': 0, 'hits': 0, 'misses': 0}
        }
    for player in ['1', '2']:
        if player not in game['stats']:
            game['stats'][player] = {'shots': 0, 'hits': 0, 'misses': 0}

    # Check for winner
    winner = game.get('winner', None)

    # Create game state response with relevant info for this player
    response = {
        'status': 'success',
        'game_status': game['status'],
        'current_turn': game.get('current_turn'),
        'is_my_turn': game.get('current_turn') == int(player_number_str),
        'opponent_ready': opponent_number_str in game.get('players', {}),
        'my_hits': game['shots'][player_number_str]['hits'],
        'my_misses': game['shots'][player_number_str]['misses'],
        'opponent_hits': game['shots'][opponent_number_str]['hits'],
        'opponent_misses': game['shots'][opponent_number_str]['misses'],
        'winner': winner,
        'stats': {
            'my_stats': game['stats'][player_number_str],
            'opponent_stats': game['stats'][opponent_number_str]
        }
    }

    logger.debug(f"Game state for player {player_number}: {response}")

    return jsonify(response)

@app.route('/multiplayer/make_shot', methods=['POST'])
def multiplayer_make_shot():
    try:
        # Make session permanent to use the PERMANENT_SESSION_LIFETIME setting
        session.permanent = True
        
        game_id = session.get('game_id')
        player_number = session.get('player_number')
        data = request.get_json()
        shot_row = data.get('row')
        shot_col = data.get('col')

        logger.debug(f"Player {player_number} shot at ({shot_row}, {shot_col}) in game {game_id}")

        # Validate inputs
        if not game_id or not player_number:
            logger.error(f"Missing session data: game_id={game_id}, player_number={player_number}")
            return jsonify({'status': 'error', 'message': 'Invalid session'})

        if shot_row is None or shot_col is None:
            logger.error(f"Invalid shot coordinates: ({shot_row}, {shot_col})")
            return jsonify({'status': 'error', 'message': 'Invalid shot coordinates'})

        # Load the game data
        game = load_game(game_id)
        if not game:
            logger.error(f"Game not found: {game_id}")
            return jsonify({'status': 'error', 'message': 'Game not found'})

        # Ensure player_number is a string for consistent dictionary keys
        player_number_str = str(player_number)
        opponent_number_str = '2' if player_number_str == '1' else '1'

        # Validate game is in playing state
        if game.get('status') != 'playing':
            logger.error(f"Game not in playing state: {game.get('status')}")
            return jsonify({'status': 'error', 'message': 'Game not in playing state'})

        # Validate it's this player's turn
        current_turn = game.get('current_turn')
        if current_turn != int(player_number):
            logger.error(f"Not player {player_number}'s turn. Current turn: {current_turn}")
            return jsonify({'status': 'error', 'message': 'Not your turn'})

        # Ensure shots structure exists
        if 'shots' not in game:
            game['shots'] = {
                '1': {'hits': [], 'misses': []},
                '2': {'hits': [], 'misses': []}
            }
        elif player_number_str not in game['shots']:
            game['shots'][player_number_str] = {'hits': [], 'misses': []}
            
        # Ensure stats structure exists
        if 'stats' not in game:
            game['stats'] = {
                '1': {'shots': 0, 'hits': 0, 'misses': 0},
                '2': {'shots': 0, 'hits': 0, 'misses': 0}
            }
        elif player_number_str not in game['stats']:
            game['stats'][player_number_str] = {'shots': 0, 'hits': 0, 'misses': 0}

        # Check if shot is valid (not already fired at this location)
        for shot in game['shots'][player_number_str].get('hits', []) + game['shots'][player_number_str].get('misses', []):
            if shot.get('row') == shot_row and shot.get('col') == shot_col:
                logger.error(f"Player already fired at location ({shot_row}, {shot_col})")
                return jsonify({'status': 'error', 'message': 'Already fired at this location'})

        # Validate opponent has placed ships
        if 'player_ships' not in game or opponent_number_str not in game['player_ships']:
            logger.error(f"Opponent ships not found: player_ships={bool('player_ships' in game)}, opponent={opponent_number_str in game.get('player_ships', {})}")
            return jsonify({'status': 'error', 'message': 'Opponent ships not found'})

        # Check if the shot hits an opponent ship
        hit = False
        hit_ship_type = None

        opponent_ships = game['player_ships'][opponent_number_str]

        for ship_type, coords in opponent_ships.items():
            for coord in coords:
                if coord.get('row') == shot_row and coord.get('col') == shot_col:
                    hit = True
                    hit_ship_type = ship_type
                    break
            if hit:
                break

        # Ensure 'hits' and 'misses' arrays exist
        if 'hits' not in game['shots'][player_number_str]:
            game['shots'][player_number_str]['hits'] = []
        if 'misses' not in game['shots'][player_number_str]:
            game['shots'][player_number_str]['misses'] = []

        # Increment total shots count
        game['stats'][player_number_str]['shots'] = game['stats'][player_number_str].get('shots', 0) + 1
            
        # Record the shot
        if hit:
            game['shots'][player_number_str]['hits'].append({
                'row': shot_row,
                'col': shot_col,
                'ship_type': hit_ship_type
            })
            # Increment hits count
            game['stats'][player_number_str]['hits'] = game['stats'][player_number_str].get('hits', 0) + 1
            logger.debug(f"Hit! Ship type: {hit_ship_type}")
        else:
            game['shots'][player_number_str]['misses'].append({
                'row': shot_row,
                'col': shot_col
            })
            # Increment misses count
            game['stats'][player_number_str]['misses'] = game['stats'][player_number_str].get('misses', 0) + 1
            logger.debug(f"Miss!")

        # Check if ship is sunk
        sunk = False
        if hit:
            ship_coords = game['player_ships'][opponent_number_str][hit_ship_type]
            all_hit = True

            for coord in ship_coords:
                coord_hit = False
                for hit_record in game['shots'][player_number_str]['hits']:
                    if hit_record.get('row') == coord.get('row') and hit_record.get('col') == coord.get('col'):
                        coord_hit = True
                        break
                if not coord_hit:
                    all_hit = False
                    break

            sunk = all_hit
            logger.debug(f"Ship sunk: {sunk}")

        # Check for game over (all ships sunk)
        game_over = False
        if hit:
            all_ships_sunk = True

            for ship_type, coords in game['player_ships'][opponent_number_str].items():
                ship_sunk = True

                for coord in coords:
                    coord_hit = False
                    for hit_record in game['shots'][player_number_str]['hits']:
                        if hit_record.get('row') == coord.get('row') and hit_record.get('col') == coord.get('col'):
                            coord_hit = True
                            break
                    if not coord_hit:
                        ship_sunk = False
                        break

                if not ship_sunk:
                    all_ships_sunk = False
                    break

            if all_ships_sunk:
                game_over = True
                game['status'] = 'game_over'
                game['winner'] = int(player_number)
                logger.debug(f"Game over! Player {player_number} wins!")

        # Update turn if game not over
        if not game_over:
            game['current_turn'] = int(opponent_number_str)

        # Update last activity timestamp
        game['last_activity'] = time.time()

        # Save the updated game data
        save_game(game_id, game)

        return jsonify({
            'status': 'success',
            'hit': hit,
            'sunk': sunk,
            'ship_type': hit_ship_type if hit else None,
            'game_over': game_over
        })
    except Exception as e:
        logger.exception(f"Error in multiplayer_make_shot: {e}")
        return jsonify({'status': 'error', 'message': f'Server error: {str(e)}'})

@app.route('/debug/game/<game_id>')
def debug_game(game_id):
    game = load_game(game_id)
    if game:
        return jsonify(game)
    return jsonify({'message': 'Game not found'})

# Utility function to debug sessions
@app.route('/debug/session')
def debug_session():
    return jsonify(dict(session))

# Utility function to debug game state
@app.route('/debug/games')
def debug_games():
    # Get a list of all game IDs
    game_ids = list_games()

    # Load each game and create a sanitized version
    debug_games = {}
    for game_id in game_ids:
        game = load_game(game_id)
        if game:
            debug_games[game_id] = {
                'status': game['status'],
                'players': game['players'],
                'current_turn': game['current_turn'],
                'has_player_ships': bool(game.get('player_ships')),
                'created_at': game['created_at'],
                'last_activity': game['last_activity']
            }
    return jsonify(debug_games)

# Clean up inactive games - improved version
def cleanup_inactive_games():
    current_time = time.time()
    # Increase inactive threshold to 60 minutes instead of 30
    inactive_threshold = 60 * 60  # 60 minutes
    
    # Keep track of number of games cleaned up
    cleaned_count = 0

    for game_id in list_games():
        game = load_game(game_id)
        if game and (current_time - game['last_activity'] > inactive_threshold):
            logger.info(f"Cleaning up inactive game: {game_id}, last activity: {datetime.fromtimestamp(game['last_activity']).strftime('%Y-%m-%d %H:%M:%S')}")
            delete_game(game_id)
            cleaned_count += 1
            
    if cleaned_count > 0:
        logger.info(f"Cleaned up {cleaned_count} inactive games")

# Set a consistent cleanup interval - once per 15 minutes
last_cleanup_time = 0
# Set a consistent cleanup interval - once per 15 minutes
last_cleanup_time = 0
cleanup_interval = 15 * 60  # 15 minutes

@app.before_request
def before_request():
    global last_cleanup_time
    current_time = time.time()
    
    # Run cleanup if it's been more than cleanup_interval since last cleanup
    if current_time - last_cleanup_time > cleanup_interval:
        cleanup_inactive_games()
        last_cleanup_time = current_time
        
    # Always mark session as permanent to use the configured lifetime
    session.permanent = True

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)
