import os
from urllib.parse import quote_plus
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

class Config:
    SECRET_KEY = os.getenv("FLASK_SECRET_KEY", "default_secret_key_change_me")
    
    # DB configuration
    DB_HOST = os.getenv("DB_HOST", "localhost")
    DB_PORT = os.getenv("DB_PORT", "3306")
    DB_USER = os.getenv("DB_USER", "root")
    DB_PASSWORD = os.getenv("DB_PASSWORD", "")
    DB_NAME = os.getenv("DB_NAME", "todo_db")
    
    # Construct SQLAlchemy URI
    # Format: mysql+pymysql://user:password@host:port/dbname
    encoded_password = quote_plus(DB_PASSWORD)

    SQLALCHEMY_DATABASE_URI = (
        f"mysql+pymysql://{DB_USER}:{encoded_password}@{DB_HOST}:{DB_PORT}/{DB_NAME}"
    )

    SQLALCHEMY_TRACK_MODIFICATIONS = False
