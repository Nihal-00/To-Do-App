import os
from app import app
from database import db, User, Category, Task, Subtask, AuditLog

def run_diagnostics():
    print("--- AuraTask DB Diagnostics ---")
    with app.app_context():
        # 1. Test database connection & models
        try:
            users = User.query.all()
            print(f"Users found in DB: {len(users)}")
            for u in users:
                print(f" - User ID: {u.id}, Username: {u.username}, Email: {u.email}")
        except Exception as e:
            print(f"Error querying Users: {e}")
            return
            
        try:
            categories = Category.query.all()
            print(f"Categories found in DB: {len(categories)}")
            for c in categories:
                print(f" - Category ID: {c.id}, Name: {c.name}, Owner ID: {c.user_id}")
        except Exception as e:
            print(f"Error querying Categories: {e}")
            
        try:
            tasks = Task.query.all()
            print(f"Tasks found in DB: {len(tasks)}")
            for t in tasks:
                print(f" - Task ID: {t.id}, Title: {t.title}, Completed: {t.completed}, Owner ID: {t.user_id}")
        except Exception as e:
            print(f"Error querying Tasks: {e}")

        # 2. Try creating a dummy task for user #1
        if users:
            first_user = users[0]
            print(f"\nAttempting to insert a test task for user '{first_user.username}'...")
            try:
                test_task = Task(
                    user_id=first_user.id,
                    title="Diagnostics Test Task",
                    description="Successfully inserted from test_db.py",
                    priority="medium",
                    completed=False
                )
                db.session.add(test_task)
                db.session.commit()
                print("-> Success! Test task committed.")
                
                # Query it back
                db_task = Task.query.filter_by(title="Diagnostics Test Task").first()
                if db_task:
                    print(f"-> Verified! Task found in database (ID: {db_task.id})")
                    # Clean up
                    db.session.delete(db_task)
                    db.session.commit()
                    print("-> Success! Test task cleaned up/deleted.")
            except Exception as e:
                db.session.rollback()
                print(f"-> Failed! Error inserting/cleaning up task: {e}")
        else:
            print("\nNo users found in database. Please register a user in the web UI first.")

if __name__ == "__main__":
    run_diagnostics()
