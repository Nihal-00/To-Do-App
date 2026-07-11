import os
from flask import Flask, request, jsonify, session, render_template, abort
from werkzeug.security import generate_password_hash, check_password_hash
from datetime import datetime, timedelta
from functools import wraps
from config import Config
from database import db, User, Category, Task, Subtask, AuditLog, create_database_if_not_exists

app = Flask(__name__)
app.config.from_object(Config)

db.init_app(app)

# Skip database initialization during GitHub Actions
if os.getenv("GITHUB_ACTIONS") != "true":
    create_database_if_not_exists(app.config)

    with app.app_context():
        try:
            db.create_all()
            print("✅ Database initialized.")
        except Exception as e:
            print(f"Error initializing database tables: {e}")
# Helper decorator for login required routes
def login_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'user_id' not in session:
            return jsonify({"error": "Unauthorized. Please log in."}), 401
        return f(*args, **kwargs)
    return decorated_function

def log_action(user_id, task_id, action, details=None):
    """Log user action to AuditLog table."""
    try:
        log = AuditLog(
            user_id=user_id,
            task_id=task_id,
            action=action,
            details=details,
            created_at=datetime.utcnow()
        )
        db.session.add(log)
        db.session.commit()
    except Exception as e:
        print(f"Error logging action: {e}")
        db.session.rollback()

# --- Auth Routes ---

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/auth/signup', methods=['POST'])
def signup():
    data = request.get_json() or {}
    username = data.get('username', '').strip()
    email = data.get('email', '').strip()
    password = data.get('password', '')

    if not username or not email or not password:
        return jsonify({"error": "Missing username, email, or password"}), 400

    if User.query.filter_by(username=username).first():
        return jsonify({"error": "Username already exists"}), 400

    if User.query.filter_by(email=email).first():
        return jsonify({"error": "Email already exists"}), 400

    hashed_pw = generate_password_hash(password)
    new_user = User(username=username, email=email, password_hash=hashed_pw)
    
    try:
        db.session.add(new_user)
        db.session.commit()
        
        # Auto-create some default categories for the new user
        default_categories = [
            {"name": "Work", "color_hex": "#ef4444"},   # Red
            {"name": "Personal", "color_hex": "#3b82f6"},   # Blue
            {"name": "Shopping", "color_hex": "#10b981"},   # Green
            {"name": "Urgent", "color_hex": "#f59e0b"}      # Yellow
        ]
        for cat in default_categories:
            db.session.add(Category(user_id=new_user.id, name=cat["name"], color_hex=cat["color_hex"]))
        db.session.commit()

        # Log in the user immediately
        session['user_id'] = new_user.id
        session['username'] = new_user.username
        
        return jsonify({"message": "User registered successfully", "user": new_user.to_dict()}), 201
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500

@app.route('/api/auth/login', methods=['POST'])
def login():
    data = request.get_json() or {}
    username_or_email = data.get('username', '').strip() # accepts username or email
    password = data.get('password', '')

    if not username_or_email or not password:
        return jsonify({"error": "Missing username/email or password"}), 400

    # Look up by username or email
    user = User.query.filter((User.username == username_or_email) | (User.email == username_or_email)).first()

    if not user or not check_password_hash(user.password_hash, password):
        return jsonify({"error": "Invalid username/email or password"}), 401

    session['user_id'] = user.id
    session['username'] = user.username
    return jsonify({"message": "Logged in successfully", "user": user.to_dict()})

@app.route('/api/auth/logout', methods=['POST'])
def logout():
    session.clear()
    return jsonify({"message": "Logged out successfully"})

@app.route("/health")
def health():
    return {"status": "healthy"}, 200

@app.route('/api/auth/me', methods=['GET'])
def get_me():
    if 'user_id' in session:
        user = User.query.get(session['user_id'])
        if user:
            return jsonify({"logged_in": True, "user": user.to_dict()})
    return jsonify({"logged_in": False})

@app.route('/api/auth/reset-password', methods=['POST'])
def reset_password():
    data = request.get_json() or {}
    username = data.get('username', '').strip()
    email = data.get('email', '').strip()
    new_password = data.get('new_password', '')

    if not username or not email or not new_password:
        return jsonify({"error": "Missing username, email, or new password"}), 400

    user = User.query.filter_by(username=username, email=email).first()
    if not user:
        return jsonify({"error": "Username and email do not match our records."}), 404

    try:
        user.password_hash = generate_password_hash(new_password)
        db.session.commit()
        
        log = AuditLog(
            user_id=user.id,
            action='updated',
            details="Password reset from recovery page.",
            created_at=datetime.utcnow()
        )
        db.session.add(log)
        db.session.commit()
        
        return jsonify({"message": "Password reset successfully! Please log in."})
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500

@app.route('/api/auth/change-password', methods=['POST'])
@login_required
def change_password():
    data = request.get_json() or {}
    current_password = data.get('current_password', '')
    new_password = data.get('new_password', '')

    if not current_password or not new_password:
        return jsonify({"error": "Missing current password or new password"}), 400

    user = User.query.get(session['user_id'])
    if not check_password_hash(user.password_hash, current_password):
        return jsonify({"error": "Incorrect current password."}), 400

    try:
        user.password_hash = generate_password_hash(new_password)
        db.session.commit()
        
        log_action(user.id, None, 'updated', "Changed account password inside settings.")
        
        return jsonify({"message": "Password updated successfully!"})
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500

# --- Category Routes ---

@app.route('/api/categories', methods=['GET'])
@login_required
def get_categories():
    categories = Category.query.filter_by(user_id=session['user_id']).all()
    return jsonify([cat.to_dict() for cat in categories])

@app.route('/api/categories', methods=['POST'])
@login_required
def create_category():
    data = request.get_json() or {}
    name = data.get('name', '').strip()
    color_hex = data.get('color_hex', '#3b82f6').strip()

    if not name:
        return jsonify({"error": "Category name is required"}), 400

    # Max 10 categories
    count = Category.query.filter_by(user_id=session['user_id']).count()
    if count >= 15:
        return jsonify({"error": "Category limit reached (Max 15)"}), 400

    new_cat = Category(user_id=session['user_id'], name=name, color_hex=color_hex)
    try:
        db.session.add(new_cat)
        db.session.commit()
        return jsonify(new_cat.to_dict()), 201
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500

@app.route('/api/categories/<int:cat_id>', methods=['DELETE'])
@login_required
def delete_category(cat_id):
    cat = Category.query.filter_by(id=cat_id, user_id=session['user_id']).first()
    if not cat:
        return jsonify({"error": "Category not found"}), 404
    
    try:
        # Before deleting, reset category_id in tasks using this category to NULL
        # SQLAlchemy handles this since we set ondelete='SET NULL'
        db.session.delete(cat)
        db.session.commit()
        return jsonify({"message": "Category deleted successfully"})
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500

# --- Todo Task Routes ---

@app.route('/api/todos', methods=['GET'])
@login_required
def get_todos():
    user_id = session['user_id']
    
    # Query parameters
    status_filter = request.args.get('status', 'all') # 'all', 'active', 'completed'
    category_filter = request.args.get('category_id') # category ID or None
    priority_filter = request.args.get('priority') # 'high', 'medium', 'low' or None
    search_query = request.args.get('search', '').strip()
    sort_by = request.args.get('sort_by', 'due_date') # 'due_date', 'priority', 'created_at'
    sort_order = request.args.get('sort_order', 'asc') # 'asc', 'desc'

    query = Task.query.filter_by(user_id=user_id)

    # Filter status
    if status_filter == 'active':
        query = query.filter_by(completed=False)
    elif status_filter == 'completed':
        query = query.filter_by(completed=True)

    # Filter category
    if category_filter and category_filter.isdigit():
        query = query.filter_by(category_id=int(category_filter))

    # Filter priority
    if priority_filter in ['high', 'medium', 'low']:
        query = query.filter_by(priority=priority_filter)

    # Search query
    if search_query:
        query = query.filter((Task.title.ilike(f'%{search_query}%')) | (Task.description.ilike(f'%{search_query}%')))

    # Sorting
    # Create order mapping for priority sort
    if sort_by == 'priority':
        # High=1, Medium=2, Low=3 in ASC, opposite in DESC
        # In SQL database, we can use case expression for sorting
        from sqlalchemy import case
        priority_order = case(
            (Task.priority == 'high', 1),
            (Task.priority == 'medium', 2),
            (Task.priority == 'low', 3),
            else_=4
        )
        if sort_order == 'desc':
            query = query.order_by(priority_order.desc())
        else:
            query = query.order_by(priority_order.asc())
    elif sort_by == 'created_at':
        if sort_order == 'desc':
            query = query.order_by(Task.created_at.desc())
        else:
            query = query.order_by(Task.created_at.asc())
    else: # default: due_date
        if sort_order == 'desc':
            query = query.order_by(Task.due_date.is_(None), Task.due_date.desc())
        else:
            query = query.order_by(Task.due_date.is_(None), Task.due_date.asc())

    todos = query.all()
    return jsonify([todo.to_dict() for todo in todos])

@app.route('/api/todos', methods=['POST'])
@login_required
def create_todo():
    data = request.get_json() or {}
    title = data.get('title', '').strip()
    description = data.get('description', '').strip()
    priority = data.get('priority', 'medium').lower()
    category_id = data.get('category_id')
    recurrence = data.get('recurrence', 'none').lower()
    
    due_date_str = data.get('due_date')
    due_date = None
    if due_date_str:
        try:
            # Expect ISO format: YYYY-MM-DDTHH:MM
            due_date = datetime.fromisoformat(due_date_str)
        except ValueError:
            return jsonify({"error": "Invalid due date format. Use ISO format."}), 400

    if not title:
        return jsonify({"error": "Title is required"}), 400

    if priority not in ['high', 'medium', 'low']:
        priority = 'medium'

    if recurrence not in ['none', 'daily', 'weekly', 'monthly']:
        recurrence = 'none'

    # Check category ownership
    if category_id:
        cat = Category.query.filter_by(id=category_id, user_id=session['user_id']).first()
        if not cat:
            category_id = None

    new_todo = Task(
        user_id=session['user_id'],
        category_id=category_id,
        title=title,
        description=description,
        due_date=due_date,
        priority=priority,
        completed=False,
        recurrence=recurrence,
        created_at=datetime.utcnow()
    )

    try:
        db.session.add(new_todo)
        db.session.commit()
        
        log_action(session['user_id'], new_todo.id, 'created', f"Task: {title}")
        
        return jsonify(new_todo.to_dict()), 201
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500

@app.route('/api/todos/<int:todo_id>', methods=['PUT'])
@login_required
def update_todo(todo_id):
    todo = Task.query.filter_by(id=todo_id, user_id=session['user_id']).first()
    if not todo:
        return jsonify({"error": "Task not found"}), 404

    data = request.get_json() or {}
    title = data.get('title', '').strip()
    description = data.get('description', '').strip()
    priority = data.get('priority', 'medium').lower()
    category_id = data.get('category_id')
    recurrence = data.get('recurrence', 'none').lower()
    
    due_date_str = data.get('due_date')
    due_date = None
    if due_date_str:
        try:
            due_date = datetime.fromisoformat(due_date_str)
        except ValueError:
            return jsonify({"error": "Invalid due date format. Use ISO format."}), 400

    if not title:
        return jsonify({"error": "Title is required"}), 400

    if priority not in ['high', 'medium', 'low']:
        priority = 'medium'

    if recurrence not in ['none', 'daily', 'weekly', 'monthly']:
        recurrence = 'none'

    # Check category ownership
    if category_id:
        cat = Category.query.filter_by(id=category_id, user_id=session['user_id']).first()
        if not cat:
            category_id = None
    else:
        category_id = None

    todo.title = title
    todo.description = description
    todo.due_date = due_date
    todo.priority = priority
    todo.category_id = category_id
    todo.recurrence = recurrence
    todo.updated_at = datetime.utcnow()

    try:
        db.session.commit()
        log_action(session['user_id'], todo.id, 'updated', f"Updated values: {title}")
        return jsonify(todo.to_dict())
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500

@app.route('/api/todos/<int:todo_id>', methods=['DELETE'])
@login_required
def delete_todo(todo_id):
    todo = Task.query.filter_by(id=todo_id, user_id=session['user_id']).first()
    if not todo:
        return jsonify({"error": "Task not found"}), 404

    title = todo.title
    try:
        # Capture for audit log before delete
        log_action(session['user_id'], None, 'deleted', f"Deleted task: {title}")
        db.session.delete(todo)
        db.session.commit()
        return jsonify({"message": "Task deleted successfully"})
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500

@app.route('/api/todos/<int:todo_id>/toggle', methods=['PUT'])
@login_required
def toggle_todo(todo_id):
    todo = Task.query.filter_by(id=todo_id, user_id=session['user_id']).first()
    if not todo:
        return jsonify({"error": "Task not found"}), 404

    original_completed = todo.completed
    target_completed = not original_completed
    
    try:
        # Check for recurrence logic
        if target_completed and todo.recurrence != 'none' and todo.due_date:
            # 1. Log completion of this instance
            log_action(session['user_id'], todo.id, 'completed', f"Completed recurring task: {todo.title}")
            
            # 2. Advance the due date for the task based on recurrence rule
            old_due = todo.due_date
            if todo.recurrence == 'daily':
                next_due = old_due + timedelta(days=1)
            elif todo.recurrence == 'weekly':
                next_due = old_due + timedelta(weeks=1)
            elif todo.recurrence == 'monthly':
                # Shift roughly by 30 days
                next_due = old_due + timedelta(days=30)
            else:
                next_due = old_due
            
            todo.due_date = next_due
            todo.snooze_until = None
            todo.completed = False  # Stays active for next recurrence
            todo.updated_at = datetime.utcnow()
        else:
            # Standard toggle
            todo.completed = target_completed
            todo.snooze_until = None
            todo.updated_at = datetime.utcnow()
            action = 'completed' if target_completed else 'uncompleted'
            log_action(session['user_id'], todo.id, action, f"Task: {todo.title}")

        db.session.commit()
        return jsonify(todo.to_dict())
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500

@app.route('/api/todos/<int:todo_id>/snooze', methods=['POST'])
@login_required
def snooze_todo(todo_id):
    todo = Task.query.filter_by(id=todo_id, user_id=session['user_id']).first()
    if not todo:
        return jsonify({"error": "Task not found"}), 404

    data = request.get_json() or {}
    minutes = int(data.get('minutes', 5))

    todo.snooze_until = datetime.utcnow() + timedelta(minutes=minutes)
    try:
        db.session.commit()
        log_action(session['user_id'], todo.id, 'snoozed', f"Snoozed for {minutes} mins")
        return jsonify(todo.to_dict())
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500

# --- Subtask Routes ---

@app.route('/api/todos/<int:todo_id>/subtasks', methods=['POST'])
@login_required
def add_subtask(todo_id):
    todo = Task.query.filter_by(id=todo_id, user_id=session['user_id']).first()
    if not todo:
        return jsonify({"error": "Task not found"}), 404

    data = request.get_json() or {}
    title = data.get('title', '').strip()

    if not title:
        return jsonify({"error": "Subtask title is required"}), 400

    new_sub = Subtask(task_id=todo.id, title=title, completed=False)
    try:
        db.session.add(new_sub)
        db.session.commit()
        log_action(session['user_id'], todo.id, 'updated', f"Added subtask: {title}")
        return jsonify(new_sub.to_dict()), 201
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500

@app.route('/api/subtasks/<int:sub_id>/toggle', methods=['PUT'])
@login_required
def toggle_subtask(sub_id):
    # Verify subtask ownership via task
    sub = Subtask.query.join(Task).filter(Subtask.id == sub_id, Task.user_id == session['user_id']).first()
    if not sub:
        return jsonify({"error": "Subtask not found"}), 404

    sub.completed = not sub.completed
    try:
        db.session.commit()
        action = 'subtask_completed' if sub.completed else 'subtask_uncompleted'
        log_action(session['user_id'], sub.task_id, 'updated', f"Toggled subtask: {sub.title} to {sub.completed}")
        return jsonify(sub.to_dict())
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500

@app.route('/api/subtasks/<int:sub_id>', methods=['DELETE'])
@login_required
def delete_subtask(sub_id):
    # Verify subtask ownership
    sub = Subtask.query.join(Task).filter(Subtask.id == sub_id, Task.user_id == session['user_id']).first()
    if not sub:
        return jsonify({"error": "Subtask not found"}), 404

    try:
        task_id = sub.task_id
        db.session.delete(sub)
        db.session.commit()
        log_action(session['user_id'], task_id, 'updated', f"Deleted subtask")
        return jsonify({"message": "Subtask deleted successfully"})
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500

# --- Analytics Endpoint ---

@app.route('/api/analytics', methods=['GET'])
@login_required
def get_analytics():
    user_id = session['user_id']
    
    # Simple aggregations
    total_tasks = Task.query.filter_by(user_id=user_id).count()
    completed_tasks = Task.query.filter_by(user_id=user_id, completed=True).count()
    pending_tasks = Task.query.filter_by(user_id=user_id, completed=False).count()
    
    # Priority Distribution
    priorities = db.session.query(
        Task.priority, db.func.count(Task.id)
    ).filter_by(user_id=user_id).group_by(Task.priority).all()
    priority_dist = {p[0]: p[1] for p in priorities}
    for p_key in ['high', 'medium', 'low']:
        if p_key not in priority_dist:
            priority_dist[p_key] = 0

    # Category Distribution
    categories_data = db.session.query(
        Category.name, Category.color_hex, db.func.count(Task.id)
    ).join(Task, Task.category_id == Category.id, isouter=True)\
     .filter(Category.user_id == user_id)\
     .group_by(Category.id).all()
     
    category_dist = [{"name": c[0], "color": c[1], "count": c[2]} for c in categories_data]

    # Completed tasks trend (last 7 days)
    # Fetch from AuditLogs where action='completed'
    today = datetime.utcnow().date()
    start_date = today - timedelta(days=6)
    
    # Build list of 7 days
    days_list = [start_date + timedelta(days=i) for i in range(7)]
    days_str = [d.strftime('%a') for d in days_list] # e.g. Mon, Tue
    
    completion_counts = {d.strftime('%Y-%m-%d'): 0 for d in days_list}
    
    logs = AuditLog.query.filter(
        AuditLog.user_id == user_id,
        AuditLog.action == 'completed',
        AuditLog.created_at >= datetime.combine(start_date, datetime.min.time())
    ).all()

    for log in logs:
        log_date_str = log.created_at.strftime('%Y-%m-%d')
        if log_date_str in completion_counts:
            completion_counts[log_date_str] += 1
            
    completed_trend = [completion_counts[d.strftime('%Y-%m-%d')] for d in days_list]

    return jsonify({
        "stats": {
            "total": total_tasks,
            "completed": completed_tasks,
            "pending": pending_tasks,
            "rate": round((completed_tasks / total_tasks * 100), 1) if total_tasks > 0 else 0
        },
        "priority_distribution": priority_dist,
        "category_distribution": category_dist,
        "completed_trend": {
            "labels": days_str,
            "data": completed_trend
        }
    })

# --- Audit Logs / History ---

@app.route('/api/audit-logs', methods=['GET'])
@login_required
def get_audit_logs():
    # Return last 50 actions
    logs = AuditLog.query.filter_by(user_id=session['user_id'])\
        .order_by(AuditLog.created_at.desc())\
        .limit(50).all()
        
    return jsonify([log.to_dict() for log in logs])


if __name__ == "__main__":
    if os.getenv("GITHUB_ACTIONS") != "true":
        app.run(host="0.0.0.0", port=5000, debug=True)
