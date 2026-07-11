import time
import pymysql
from flask_sqlalchemy import SQLAlchemy
from datetime import datetime

db = SQLAlchemy()


def create_database_if_not_exists(config_obj):
    """
    Wait for MySQL to start, then create the database if it doesn't exist.
    """

    host = config_obj.get("DB_HOST", "mysql")
    port = int(config_obj.get("DB_PORT", 3306))
    user = config_obj.get("DB_USER", "root")
    password = config_obj.get("DB_PASSWORD", "")
    database = config_obj.get("DB_NAME", "todo_db")

    for i in range(30):
        try:
            connection = pymysql.connect(
                host=host,
                port=port,
                user=user,
                password=password,
                charset="utf8mb4"
            )

            with connection.cursor() as cursor:
                cursor.execute(
                    f"CREATE DATABASE IF NOT EXISTS {database} "
                    "CHARACTER SET utf8mb4 "
                    "COLLATE utf8mb4_unicode_ci"
                )

            connection.commit()
            connection.close()

            print("✅ Database is ready.")
            return

        except Exception:
            print(f"⏳ Waiting for MySQL... ({i + 1}/30)")
            time.sleep(2)

    print("❌ MySQL did not become ready.")
    return
        # We don't raise here, we let SQLAlchemy try to connect and raise its own error if it fails

class User(db.Model):
    __tablename__ = 'users'
    
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False)
    password_hash = db.Column(db.String(255), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    # Relationships
    tasks = db.relationship('Task', backref='user', lazy=True, cascade="all, delete-orphan")
    categories = db.relationship('Category', backref='user', lazy=True, cascade="all, delete-orphan")
    audit_logs = db.relationship('AuditLog', backref='user', lazy=True, cascade="all, delete-orphan")

    def to_dict(self):
        return {
            "id": self.id,
            "username": self.username,
            "email": self.email,
            "created_at": self.created_at.isoformat()
        }

class Category(db.Model):
    __tablename__ = 'categories'
    
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    name = db.Column(db.String(50), nullable=False)
    color_hex = db.Column(db.String(7), default="#3b82f6") # Default blue hex
    
    # Relationships
    tasks = db.relationship('Task', backref='category', lazy=True)

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "color_hex": self.color_hex
        }

class Task(db.Model):
    __tablename__ = 'tasks'
    
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    category_id = db.Column(db.Integer, db.ForeignKey('categories.id', ondelete='SET NULL'), nullable=True)
    title = db.Column(db.String(200), nullable=False)
    description = db.Column(db.Text, nullable=True)
    due_date = db.Column(db.DateTime, nullable=True)
    priority = db.Column(db.String(10), default='medium') # 'high', 'medium', 'low'
    completed = db.Column(db.Boolean, default=False)
    recurrence = db.Column(db.String(15), default='none') # 'none', 'daily', 'weekly', 'monthly'
    snooze_until = db.Column(db.DateTime, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    subtasks = db.relationship('Subtask', backref='task', lazy=True, cascade="all, delete-orphan")
    audit_logs = db.relationship('AuditLog', backref='task', lazy=True, cascade="all, delete-orphan")

    def to_dict(self):
        return {
            "id": self.id,
            "user_id": self.user_id,
            "category_id": self.category_id,
            "category": self.category.to_dict() if self.category else None,
            "title": self.title,
            "description": self.description,
            "due_date": self.due_date.isoformat() if self.due_date else None,
            "priority": self.priority,
            "completed": self.completed,
            "recurrence": self.recurrence,
            "snooze_until": self.snooze_until.isoformat() if self.snooze_until else None,
            "subtasks": [subtask.to_dict() for subtask in self.subtasks],
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat()
        }

class Subtask(db.Model):
    __tablename__ = 'subtasks'
    
    id = db.Column(db.Integer, primary_key=True)
    task_id = db.Column(db.Integer, db.ForeignKey('tasks.id', ondelete='CASCADE'), nullable=False)
    title = db.Column(db.String(200), nullable=False)
    completed = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            "id": self.id,
            "task_id": self.task_id,
            "title": self.title,
            "completed": self.completed,
            "created_at": self.created_at.isoformat()
        }

class AuditLog(db.Model):
    __tablename__ = 'audit_logs'
    
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    task_id = db.Column(db.Integer, db.ForeignKey('tasks.id', ondelete='SET NULL'), nullable=True)
    action = db.Column(db.String(20), nullable=False) # 'created', 'completed', 'uncompleted', 'updated', 'deleted', 'snoozed'
    details = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            "id": self.id,
            "user_id": self.user_id,
            "task_id": self.task_id,
            "action": self.action,
            "details": self.details,
            "created_at": self.created_at.isoformat()
        }
