import os
import re
import random
import string
import secrets
import urllib.parse
from datetime import datetime, timedelta
from flask import Flask, request, jsonify, redirect
from sqlalchemy import text
from flask_socketio import SocketIO, emit, join_room
from flask_cors import CORS
from db import db, hash_password, check_password
from models import User, PlayerStats, GameRoom, UserSettings
from game import Table
from strategy import basic_strategy

def load_dotenv(path=None):
    path = path or os.path.join(os.path.dirname(__file__), '.env')
    if not os.path.exists(path):
        return
    with open(path, 'r', encoding='utf-8') as env_file:
        for line in env_file:
            line = line.strip()
            if not line or line.startswith('#') or '=' not in line:
                continue
            key, value = line.split('=', 1)
            os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))

load_dotenv()

app = Flask(__name__)
CORS(app)

app.config['SQLALCHEMY_DATABASE_URI'] = os.environ.get('DATABASE_URL', 'sqlite:///blackjack_dev.db')
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
# Neon (serverless Postgres) drops idle connections; pre-ping + recycle so a
# stale connection is transparently replaced instead of throwing mid-request.
app.config['SQLALCHEMY_ENGINE_OPTIONS'] = {
    'pool_pre_ping': True,
    'pool_recycle': 280,
}
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'dev_secret_change_me')

# --- OAuth / front-end config (all read from backend/.env) ---
FRONTEND_URL = os.environ.get('FRONTEND_URL', 'http://localhost:5173')
BACKEND_URL = os.environ.get('BACKEND_URL', 'http://localhost:5000')
GOOGLE_CLIENT_ID = os.environ.get('GOOGLE_CLIENT_ID', '')
DISCORD_CLIENT_ID = os.environ.get('DISCORD_CLIENT_ID', '')
DISCORD_CLIENT_SECRET = os.environ.get('DISCORD_CLIENT_SECRET', '')
APPLE_CLIENT_ID = os.environ.get('APPLE_CLIENT_ID', '')

db.init_app(app)
socketio = SocketIO(app, cors_allowed_origins="*")

# In-memory active tables — keyed by room code
ACTIVE_ROOMS = {}


USERNAME_RE = re.compile(r'^[A-Za-z0-9 _.\-]{3,20}$')


def _unique_username(base):
    """Turn a raw string into a valid, unused display username."""
    base = re.sub(r'[^A-Za-z0-9_.\-]', '', base or '')[:20] or 'player'
    if len(base) < 3:
        base = (base + 'player')[:20]
    candidate, n = base, 1
    while User.query.filter_by(username=candidate).first():
        n += 1
        suffix = str(n)
        candidate = f"{base[:20 - len(suffix)]}{suffix}"
    return candidate


def get_or_create_social_user(email, balance=5000):
    """Look up (or create) a user by their immutable social identity (email).

    The account is anchored on `auth_email`, so the user can later rename their
    display `username` without a social re-login creating a duplicate account.
    Social-auth users never log in with a password, so we store an unusable
    random hash to satisfy the not-null column without enabling password login.
    """
    email = (email or '').strip()
    user = User.query.filter_by(auth_email=email).first()
    if user:
        return user
    # Legacy social users were keyed by username == email — backfill auth_email.
    legacy = User.query.filter_by(username=email).first()
    if legacy:
        if not legacy.auth_email:
            legacy.auth_email = email
            db.session.commit()
        return legacy
    # New social account: friendly default display name from the email handle.
    username = _unique_username(email.split('@')[0])
    user = User(username=username, auth_email=email,
                password_hash=hash_password(secrets.token_urlsafe(24)))
    db.session.add(user)
    db.session.commit()
    db.session.add(PlayerStats(user_id=user.id))
    db.session.commit()
    return user


def generate_room_code():
    while True:
        code = ''.join(random.choices(string.ascii_uppercase + string.digits, k=6))
        if not GameRoom.query.get(code) and code not in ACTIVE_ROOMS:
            return code


with app.app_context():
    try:
        db.create_all()
    except Exception as e:
        print(f"DB init warning: {e}")
    # Self-migrate: add the auth_email column to pre-existing tables (no Alembic).
    # Idempotent — safe to run on every boot.
    try:
        db.session.execute(text(
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_email VARCHAR(255)"))
        db.session.execute(text(
            "CREATE UNIQUE INDEX IF NOT EXISTS ix_users_auth_email ON users (auth_email)"))
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        print(f"auth_email migration note: {e}")


# =====================================================================
# REST: AUTH
# =====================================================================

@app.route('/api/register', methods=['POST'])
def register():
    data = request.json or {}
    username = data.get('username', '').strip()
    password = data.get('password', '').strip()

    if not username or not password:
        return jsonify({"error": "Fields cannot be blank."}), 400
    if User.query.filter_by(username=username).first():
        return jsonify({"error": "Username already taken."}), 400

    new_user = User(username=username, password_hash=hash_password(password))
    db.session.add(new_user)
    db.session.commit()

    stats = PlayerStats(user_id=new_user.id)
    db.session.add(stats)
    db.session.commit()

    return jsonify({"success": "Account created. Please log in."}), 201


@app.route('/api/login', methods=['POST'])
def login():
    data = request.json or {}
    username = data.get('username', '').strip()
    password = data.get('password', '').strip()

    user = User.query.filter_by(username=username).first()
    if not user or not check_password(password, user.password_hash):
        return jsonify({"error": "Invalid credentials."}), 401

    return jsonify({
        "username": user.username,
        "balance": user.balance
    }), 200


# =====================================================================
# REST: SOCIAL AUTH (Google / Discord / Apple)
# =====================================================================

@app.route('/api/auth/config', methods=['GET'])
def auth_config():
    """Tells the front-end which social providers are configured."""
    return jsonify({
        "google": bool(GOOGLE_CLIENT_ID),
        "discord": bool(DISCORD_CLIENT_ID and DISCORD_CLIENT_SECRET),
        "apple": bool(APPLE_CLIENT_ID),
        "googleClientId": GOOGLE_CLIENT_ID,
    }), 200


@app.route('/api/auth/google', methods=['POST'])
def auth_google():
    """Verify a Google Identity Services ID token and log the user in."""
    if not GOOGLE_CLIENT_ID:
        return jsonify({"error": "Google sign-in is not configured."}), 503

    credential = (request.json or {}).get('credential', '')
    if not credential:
        return jsonify({"error": "Missing Google credential."}), 400

    try:
        from google.oauth2 import id_token
        from google.auth.transport import requests as google_requests
        info = id_token.verify_oauth2_token(
            credential, google_requests.Request(), GOOGLE_CLIENT_ID
        )
    except Exception as e:
        print(f"Google token verify failed: {e}")
        return jsonify({"error": "Invalid Google credential."}), 401

    email = info.get('email')
    if not email:
        return jsonify({"error": "Google account has no email."}), 400

    user = get_or_create_social_user(email)
    return jsonify({"username": user.username, "balance": user.balance}), 200


@app.route('/api/auth/discord/login', methods=['GET'])
def auth_discord_login():
    if not (DISCORD_CLIENT_ID and DISCORD_CLIENT_SECRET):
        return redirect(f"{FRONTEND_URL}/?auth_error=discord_not_configured")
    redirect_uri = f"{BACKEND_URL}/api/auth/discord/callback"
    params = urllib.parse.urlencode({
        "client_id": DISCORD_CLIENT_ID,
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": "identify email",
    })
    return redirect(f"https://discord.com/api/oauth2/authorize?{params}")


@app.route('/api/auth/discord/callback', methods=['GET'])
def auth_discord_callback():
    import requests as http
    code = request.args.get('code')
    if not code:
        return redirect(f"{FRONTEND_URL}/?auth_error=discord_denied")
    redirect_uri = f"{BACKEND_URL}/api/auth/discord/callback"
    try:
        token_res = http.post("https://discord.com/api/oauth2/token", data={
            "client_id": DISCORD_CLIENT_ID,
            "client_secret": DISCORD_CLIENT_SECRET,
            "grant_type": "authorization_code",
            "code": code,
            "redirect_uri": redirect_uri,
        }, headers={"Content-Type": "application/x-www-form-urlencoded"}, timeout=10)
        token_res.raise_for_status()
        access = token_res.json()["access_token"]
        me = http.get("https://discord.com/api/users/@me",
                      headers={"Authorization": f"Bearer {access}"}, timeout=10).json()
    except Exception as e:
        print(f"Discord OAuth failed: {e}")
        return redirect(f"{FRONTEND_URL}/?auth_error=discord_failed")

    handle = me.get('email') or f"{me.get('username','player')}#{me.get('id','')}"
    user = get_or_create_social_user(handle)
    qs = urllib.parse.urlencode({"social_user": user.username, "social_balance": user.balance})
    return redirect(f"{FRONTEND_URL}/?{qs}")


@app.route('/api/auth/apple/login', methods=['GET', 'POST'])
def auth_apple_login():
    # Apple Sign In requires an Apple Developer account, a Services ID, and a
    # signed client-secret JWT. Scaffolded here; returns a clear status until
    # APPLE_CLIENT_ID (+ key material) are configured.
    if not APPLE_CLIENT_ID:
        return redirect(f"{FRONTEND_URL}/?auth_error=apple_not_configured")
    return redirect(f"{FRONTEND_URL}/?auth_error=apple_pending_setup")


@app.route('/api/account/rename', methods=['POST'])
def rename_account():
    """Change a user's display username. Stats/settings are keyed by user id,
    and social login is anchored on auth_email, so a rename is fully safe."""
    data = request.json or {}
    current = (data.get('username') or '').strip()
    new = (data.get('new_username') or '').strip()

    if not current or not new:
        return jsonify({"error": "Missing username."}), 400
    if new == current:
        return jsonify({"username": current}), 200
    if not USERNAME_RE.match(new):
        return jsonify({"error": "3–20 characters: letters, numbers, spaces, . _ -"}), 400

    user = User.query.filter_by(username=current).first()
    if not user:
        return jsonify({"error": "Account not found."}), 404
    clash = User.query.filter(User.username.ilike(new), User.id != user.id).first()
    if clash:
        return jsonify({"error": "That username is already taken."}), 409

    user.username = new
    db.session.commit()
    return jsonify({"username": new}), 200


@app.route('/api/stats/<username>', methods=['GET'])
def get_stats(username):
    user = User.query.filter_by(username=username).first()
    if not user:
        return jsonify({"error": "User not found."}), 404

    stats = PlayerStats.query.filter_by(user_id=user.id).first()
    if not stats:
        return jsonify({
            "hands_won": 0, "hands_lost": 0, "hands_push": 0,
            "blackjacks": 0, "total_earned": 0,
            "mistakes_count": 0, "lucky_mistakes_count": 0,
            "mistakes_history": []
        }), 200

    return jsonify({
        "hands_won": stats.hands_won,
        "hands_lost": stats.hands_lost,
        "hands_push": stats.hands_push,
        "blackjacks": stats.blackjacks,
        "total_earned": stats.total_earned,
        "mistakes_count": stats.mistakes_count,
        "lucky_mistakes_count": stats.lucky_mistakes_count,
        "mistakes_history": stats.mistakes_history or []
    }), 200


@app.route('/api/settings/<username>', methods=['GET'])
def get_settings(username):
    user = User.query.filter_by(username=username).first()
    if not user:
        return jsonify({"error": "User not found."}), 404

    record = UserSettings.query.filter_by(user_id=user.id).first()
    defaults = Table._normalize_settings({})
    saved = record.settings if record and record.settings else {}
    return jsonify({**defaults, **saved}), 200


@app.route('/api/settings/<username>', methods=['PUT'])
def update_settings(username):
    user = User.query.filter_by(username=username).first()
    if not user:
        return jsonify({"error": "User not found."}), 404

    next_settings = Table._normalize_settings(request.json or {})
    record = UserSettings.query.filter_by(user_id=user.id).first()
    if not record:
        record = UserSettings(user_id=user.id, settings=next_settings)
        db.session.add(record)
    else:
        record.settings = next_settings
    db.session.commit()
    return jsonify(next_settings), 200


@app.route('/api/rooms/public', methods=['GET'])
def get_public_rooms():
    """List joinable public rooms (active in the last 3 hours) with live counts."""
    cutoff = datetime.utcnow() - timedelta(hours=3)
    rooms = GameRoom.query.order_by(GameRoom.updated_at.desc()).limit(60).all()
    result = []
    for room in rooms:
        state = room.state or {}
        if not state.get("isPublic"):
            continue
        if room.updated_at and room.updated_at < cutoff:
            continue
        players = state.get("players", [])
        bots = state.get("botNames", []) or []
        seats_taken = sum(1 for s in state.get("seats", []) if s.get("isOccupied"))
        result.append({
            "id": room.id,
            "name": state.get("roomName") or f"Table {room.id}",
            "host": state.get("hostName"),
            "playerCount": len([p for p in players if p.get("name") not in bots]),
            "botCount": len(bots),
            "seatsTaken": seats_taken,
            "theme": (state.get("settings") or {}).get("tableTheme", "green"),
            "decks": (state.get("settings") or {}).get("numDecks", 6),
            "gameState": state.get("gameState", "betting"),
            "updated_at": room.updated_at.isoformat() if room.updated_at else None,
        })
    return jsonify({"rooms": result}), 200


@app.route('/api/rooms/<username>', methods=['GET'])
def get_user_rooms(username):
    rooms = GameRoom.query.order_by(GameRoom.updated_at.desc()).limit(20).all()
    result = []
    for room in rooms:
        state = room.state or {}
        players = state.get("players", [])
        if any(p.get("name") == username for p in players):
            result.append({
                "id": room.id,
                "state": Table.public_view(state),  # never leak the shoe order
                "created_at": room.created_at.isoformat() if room.created_at else None,
                "updated_at": room.updated_at.isoformat() if room.updated_at else None,
            })
    return jsonify({"rooms": result}), 200


# =====================================================================
# BOTS — computer players driven entirely through the Table's public
# methods (add_player / execute_action / buy_insurance). The engine's
# rules and math are untouched; bots are just automated seat-holders.
# =====================================================================

BOT_POOL = ['Vegas Vic', 'Lucky Lou', 'Monte', 'Duchess', 'Ace Malone',
            'Ruby Diamond', 'Slick Eddie', 'Countess']
BOT_SEAT_ORDER = [1, 7, 2, 6, 3, 5, 4]  # outer seats first, center kept for humans
BOT_BET_CHOICES = [10, 25, 25, 50, 50, 100]


def _seed_bots(table, count):
    """Seat `count` bots (max 3) on a fresh table and place their first bets."""
    count = max(0, min(3, int(count or 0)))
    if count == 0:
        return
    names = random.sample(BOT_POOL, count)
    free = [n for n in BOT_SEAT_ORDER if not table.seats[n - 1].occupied]
    for name in names:
        if not free:
            break
        seat_num = free.pop(0)
        table.bot_names.append(name)
        table.add_player(name, [seat_num], random.choice(BOT_BET_CHOICES),
                         random.choice([0, 0, 0, 10]), random.choice([0, 0, 0, 10]),
                         current_balance=5000)


def _bot_rebet(table):
    """During betting, refresh every bot's wager (keeps the table lively)."""
    for name in table.bot_names:
        held = [s.number for s in table.seats if s.occupied and s.player.name == name]
        if not held:
            continue
        player = next((p for p in table.get_unique_players() if p.name == name), None)
        bal = player.balance if player else 5000
        if bal < 500:
            table.reload_player_bankroll(name)
            bal = table.RELOAD_TO
        if name in table.ready_players:
            continue  # already re-bet this round
        bet = random.choice([b for b in BOT_BET_CHOICES if b <= bal] or [10])
        table.add_player(name, held, bet,
                         random.choice([0, 0, 0, 10]), random.choice([0, 0, 0, 10]),
                         current_balance=bal)


def _active_seat_is_bot(table):
    if table.game_state != 'playing':
        return False
    if table.current_seat_turn_idx >= len(table.active_seat_numbers):
        return False
    seat = table.seats[table.active_seat_numbers[table.current_seat_turn_idx] - 1]
    return seat.occupied and seat.player.name in table.bot_names


def _bots_act(table):
    """Answer insurance and play out bot turns until a human is up (or over)."""
    guard = 0
    while guard < 80:
        guard += 1
        if table.game_state == 'insurance':
            pending = [n for n in table.active_seat_numbers
                       if str(n) not in table.insurance_responses
                       and table.seats[n - 1].occupied
                       and table.seats[n - 1].player.name in table.bot_names]
            if not pending:
                return  # waiting on human decisions
            for n in pending:
                table.buy_insurance(n, False)  # bots always decline
            continue
        if not _active_seat_is_bot(table):
            return
        seat = table.seats[table.active_seat_numbers[table.current_seat_turn_idx] - 1]
        hand = seat.hands[table.current_hand_idx]
        action = basic_strategy(hand, table.dealer_hand.cards[0])
        # Fall back when the book play isn't available right now.
        if action == 'double' and (len(hand.cards) != 2 or hand.from_split_aces
                                   or not seat.player.can_afford(hand.bet)):
            action = 'hit' if hand.total() < 17 else 'stand'
        if action == 'split' and (len(seat.hands) >= 4 or not hand.can_split()
                                  or not seat.player.can_afford(hand.bet)):
            action = 'stand' if hand.total() >= 17 else 'hit'
        table.execute_action(seat.player.name, action)


def _run_bots(table):
    """Advance all bot behavior appropriate to the current phase."""
    if not getattr(table, 'bot_names', None):
        return
    if table.game_state == 'betting':
        _bot_rebet(table)
    else:
        _bots_act(table)


# =====================================================================
# WEBSOCKET: ROOM MANAGEMENT
# =====================================================================

@socketio.on('create_room')
def on_create_room(data):
    username = data.get('username', '')
    settings = data.get('settings')
    is_public = bool(data.get('is_public', False))
    is_solo = bool(data.get('solo', False))
    room_name = (data.get('room_name') or '').strip() or None
    user = User.query.filter_by(username=username).first() if username else None
    if user:
        record = UserSettings.query.filter_by(user_id=user.id).first()
        if record and record.settings:
            # Saved account settings are the base; explicit per-room
            # customizations from the create screen override them.
            settings = {**record.settings, **(settings or {})}

    room_code = generate_room_code()
    new_table = Table(settings=settings, is_public=is_public, is_solo=is_solo,
                      host_name=username or None, room_name=room_name)
    if not is_solo:
        _seed_bots(new_table, data.get('bots', 0))
    ACTIVE_ROOMS[room_code] = new_table

    new_room = GameRoom(id=room_code, state=new_table.to_snapshot())
    db.session.add(new_room)
    db.session.commit()

    join_room(room_code)
    emit('room_created', {"room": room_code, "state": new_table.to_json()})


@socketio.on('join_room')
def on_join_room(data):
    room_code = data.get('room', '').upper().strip()

    room_record = GameRoom.query.get(room_code)
    if not room_record:
        emit('error', {"message": f"Room {room_code} not found."})
        return

    if room_code not in ACTIVE_ROOMS:
        ACTIVE_ROOMS[room_code] = Table.from_snapshot(room_record.state)

    join_room(room_code)
    table = ACTIVE_ROOMS[room_code]
    emit('room_joined', {"room": room_code, "state": table.to_json()})
    socketio.emit('state_update', table.to_json(), to=room_code)


# =====================================================================
# WEBSOCKET: GAME ACTIONS
# =====================================================================

@socketio.on('sit_player')
def on_sit_player(data):
    room_code = data.get('room', '').upper()
    username = data.get('username', '')
    seats = data.get('seats', [])
    main_bet = int(data.get('main_bet', 100))
    pp_bet = int(data.get('pp_bet', 0))
    t3_bet = int(data.get('t3_bet', 0))

    if room_code not in ACTIVE_ROOMS:
        return

    user = User.query.filter_by(username=username).first()
    if not user:
        return

    table = ACTIVE_ROOMS[room_code]
    table.add_player(username, seats, main_bet, pp_bet, t3_bet, current_balance=user.balance)

    # Sync balance back to DB
    for p in table.get_unique_players():
        if p.name == username:
            user.balance = p.balance
            db.session.commit()

    _persist_state(room_code, table)
    socketio.emit('state_update', table.to_json(), to=room_code)


@socketio.on('leave_table')
def on_leave_table(data):
    room_code = data.get('room', '').upper()
    username = data.get('username', '')

    if room_code not in ACTIVE_ROOMS:
        return

    table = ACTIVE_ROOMS[room_code]
    table.leave_player(username)

    user = User.query.filter_by(username=username).first()
    if user:
        for p in table.get_unique_players():
            if p.name == username:
                user.balance = p.balance
        db.session.commit()

    _persist_state(room_code, table)
    socketio.emit('state_update', table.to_json(), to=room_code)


@socketio.on('execute_deal')
def on_execute_deal(data):
    room_code = data.get('room', '').upper()
    if room_code not in ACTIVE_ROOMS:
        return

    table = ACTIVE_ROOMS[room_code]
    cut = data.get('cut')
    try:
        cut = float(cut) if cut is not None else None
    except (TypeError, ValueError):
        cut = None
    table.deal_initial(cut_fraction=cut)
    _run_bots(table)  # bots answer insurance / play if they're up first

    if table.game_state == "game_over":
        _flush_round_to_db(table)

    _persist_state(room_code, table)
    socketio.emit('state_update', table.to_json(), to=room_code)


@socketio.on('submit_action')
def on_submit_action(data):
    room_code = data.get('room', '').upper()
    action = data.get('action', '')
    username = data.get('username', '')

    if room_code not in ACTIVE_ROOMS:
        return

    table = ACTIVE_ROOMS[room_code]
    table.execute_action(username, action)
    _run_bots(table)  # let any bot turns after this human play out

    # If hand ended, flush balances + stats to DB
    if table.game_state == "game_over":
        _flush_round_to_db(table)

    _persist_state(room_code, table)
    socketio.emit('state_update', table.to_json(), to=room_code)


@socketio.on('buy_insurance')
def on_buy_insurance(data):
    room_code = data.get('room', '').upper()
    wants_insurance = data.get('wants_insurance', False)
    try:
        seat_number = int(data.get('seat_number', 0))
    except (TypeError, ValueError):
        return

    if room_code not in ACTIVE_ROOMS:
        return

    table = ACTIVE_ROOMS[room_code]
    table.buy_insurance(seat_number, wants_insurance)
    _run_bots(table)

    if table.game_state == "game_over":
        _flush_round_to_db(table)

    _persist_state(room_code, table)
    socketio.emit('state_update', table.to_json(), to=room_code)


@socketio.on('clear_round')
def on_clear_round(data):
    room_code = data.get('room', '').upper()
    if room_code not in ACTIVE_ROOMS:
        return

    table = ACTIVE_ROOMS[room_code]
    table.reset_round()
    _run_bots(table)  # bots place fresh wagers for the next round

    _persist_state(room_code, table)
    socketio.emit('state_update', table.to_json(), to=room_code)


@socketio.on('reload_bankroll')
def on_reload_bankroll(data):
    room_code = data.get('room', '').upper()
    username = data.get('username', '')

    if room_code not in ACTIVE_ROOMS:
        return

    table = ACTIVE_ROOMS[room_code]
    reloaded = table.reload_player_bankroll(username)

    if reloaded:
        user = User.query.filter_by(username=username).first()
        if user:
            user.balance = table.RELOAD_TO
            db.session.commit()

    _persist_state(room_code, table)
    socketio.emit('state_update', table.to_json(), to=room_code)


# =====================================================================
# HELPERS
# =====================================================================

def _persist_state(room_code, table):
    try:
        room_record = GameRoom.query.get(room_code)
        if room_record:
            # Full snapshot incl. the private shoe block (REVIEW E4 / QA B4).
            room_record.state = table.to_snapshot()
            db.session.commit()
    except Exception as e:
        print(f"State persist error: {e}")


def _flush_round_to_db(table):
    try:
        for sim_p in table.get_unique_players():
            user = User.query.filter_by(username=sim_p.name).first()
            if not user:
                continue
            user.balance = sim_p.balance

            stats = PlayerStats.query.filter_by(user_id=user.id).first()
            if stats and sim_p.name in table.player_stats:
                ps = table.player_stats[sim_p.name]
                stats.hands_won += ps.get("hands_won", 0)
                stats.hands_lost += ps.get("hands_lost", 0)
                stats.hands_push += ps.get("hands_push", 0)
                stats.blackjacks += ps.get("blackjacks", 0)
                stats.total_earned += ps.get("total_earned", 0)
                stats.mistakes_count += ps.get("mistakes_count", 0)
                stats.lucky_mistakes_count += ps.get("lucky_mistakes_count", 0)
                if ps.get("mistakes_history"):
                    existing = list(stats.mistakes_history or [])
                    stats.mistakes_history = existing + ps["mistakes_history"]

        db.session.commit()
        table.player_stats.clear()
        # round_mistakes is intentionally NOT cleared here: the game_over
        # state_update serializes it (roundMistakes) for the assessment
        # review; deal_initial resets it at the start of the next round.
    except Exception as e:
        print(f"DB flush error: {e}")
        try:
            db.session.rollback()
        except Exception:
            pass


if __name__ == '__main__':
    socketio.run(app, debug=True, port=5000, allow_unsafe_werkzeug=True)
