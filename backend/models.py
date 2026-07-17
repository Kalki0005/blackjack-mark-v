from db import db
from datetime import datetime

class User(db.Model):
    __tablename__ = 'users'
    id = db.Column(db.Integer, primary_key=True)
    # `username` is the DISPLAY name (shown at the table) and, for password
    # accounts, the login. It can be changed from the profile.
    username = db.Column(db.String(80), unique=True, nullable=False)
    # `auth_email` anchors a social (Google/Discord) account to an immutable
    # identity so changing the display username never orphans the account.
    auth_email = db.Column(db.String(255), unique=True, nullable=True)
    password_hash = db.Column(db.String(255), nullable=False)
    balance = db.Column(db.Integer, default=5000)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    # Links a user to their stats
    stats = db.relationship('PlayerStats', backref='user', uselist=False, cascade="all, delete-orphan")

class PlayerStats(db.Model):
    __tablename__ = 'player_stats'
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id', ondelete='CASCADE'), nullable=False)
    hands_won = db.Column(db.Integer, default=0)
    hands_lost = db.Column(db.Integer, default=0)
    hands_push = db.Column(db.Integer, default=0)
    blackjacks = db.Column(db.Integer, default=0)
    total_earned = db.Column(db.Integer, default=0)
    mistakes_count = db.Column(db.Integer, default=0)
    lucky_mistakes_count = db.Column(db.Integer, default=0)
    
    # Stores mistake logs as a JSON list array
    mistakes_history = db.Column(db.JSON, default=list)

class UserSettings(db.Model):
    __tablename__ = 'user_settings'
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id', ondelete='CASCADE'), nullable=False, unique=True)
    settings = db.Column(db.JSON, default=dict, nullable=False)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user = db.relationship('User', backref=db.backref('settings_record', uselist=False, cascade="all, delete-orphan"))

class GameRoom(db.Model):
    __tablename__ = 'game_rooms'
    id = db.Column(db.String(6), primary_key=True) # E.g., room code 'XJ92A4'
    state = db.Column(db.JSON, nullable=False)     # Serialized game state
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
