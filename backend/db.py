import os
from flask_sqlalchemy import SQLAlchemy
import bcrypt

db = SQLAlchemy()

def init_db(app):
    # Connection string is read from the environment (see backend/.env).
    # Never hard-code credentials here.
    app.config['SQLALCHEMY_DATABASE_URI'] = os.environ.get(
        'DATABASE_URL', 'sqlite:///blackjack_dev.db'
    )
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
    db.init_app(app)

def hash_password(password):
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

def check_password(password, hashed):
    return bcrypt.checkpw(password.encode('utf-8'), hashed.encode('utf-8'))