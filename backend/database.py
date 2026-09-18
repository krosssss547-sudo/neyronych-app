import sqlite3
import json
from datetime import date

DB_NAME = "neyronych.db"


def get_conn():
    conn = sqlite3.connect(DB_NAME)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    conn = get_conn()
    cursor = conn.cursor()

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS users (
            user_id INTEGER PRIMARY KEY,
            username TEXT,
            current_streak INTEGER DEFAULT 0,
            longest_streak INTEGER DEFAULT 0,
            last_active_date DATE,
            total_xp INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    """)

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS tasks (
            task_id INTEGER PRIMARY KEY AUTOINCREMENT,
            category TEXT NOT NULL,
            difficulty INTEGER DEFAULT 1,
            question TEXT NOT NULL,
            options TEXT,
            correct_answer TEXT NOT NULL,
            explanation TEXT
        )
    """)

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS user_answers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            task_id INTEGER,
            category TEXT,
            is_correct BOOLEAN,
            answered_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # Миграции для существующей базы
    cursor.execute("PRAGMA table_info(users)")
    user_columns = [row["name"] for row in cursor.fetchall()]
    if "total_xp" not in user_columns:
        cursor.execute("ALTER TABLE users ADD COLUMN total_xp INTEGER DEFAULT 0")

    cursor.execute("PRAGMA table_info(user_answers)")
    answer_columns = [row["name"] for row in cursor.fetchall()]
    if "category" not in answer_columns:
        cursor.execute("ALTER TABLE user_answers ADD COLUMN category TEXT")
        cursor.execute("""
            UPDATE user_answers
            SET category = (SELECT category FROM tasks WHERE tasks.task_id = user_answers.task_id)
            WHERE category IS NULL AND task_id IS NOT NULL
        """)

    conn.commit()
    conn.close()


def seed_tasks_if_empty(tasks: list[dict]):
    conn = get_conn()
    cursor = conn.cursor()
    cursor.execute("SELECT COUNT(*) as cnt FROM tasks")
    count = cursor.fetchone()["cnt"]
    if count == 0:
        for t in tasks:
            cursor.execute("""
                INSERT INTO tasks (category, difficulty, question, options, correct_answer, explanation)
                VALUES (?, ?, ?, ?, ?, ?)
            """, (t["category"], t["difficulty"], t["question"], t["options"], t["correct_answer"], t["explanation"]))
        conn.commit()
    conn.close()


def add_user_if_not_exists(user_id: int, username: str | None):
    conn = get_conn()
    cursor = conn.cursor()
    cursor.execute("SELECT user_id FROM users WHERE user_id = ?", (user_id,))
    if cursor.fetchone() is None:
        cursor.execute("INSERT INTO users (user_id, username) VALUES (?, ?)", (user_id, username))
        conn.commit()
    conn.close()


def get_random_task(category: str | None, difficulty: int | None):
    conn = get_conn()
    cursor = conn.cursor()
    query = "SELECT * FROM tasks WHERE 1=1"
    params = []
    if category:
        query += " AND category = ?"
        params.append(category)
    if difficulty:
        query += " AND difficulty = ?"
        params.append(difficulty)
    query += " ORDER BY RANDOM() LIMIT 1"
    cursor.execute(query, params)
    row = cursor.fetchone()
    conn.close()
    return dict(row) if row else None


def get_task_by_id(task_id: int):
    conn = get_conn()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM tasks WHERE task_id = ?", (task_id,))
    row = cursor.fetchone()
    conn.close()
    return dict(row) if row else None


def save_answer(user_id: int, task_id: int, category: str, is_correct: bool):
    conn = get_conn()
    cursor = conn.cursor()
    cursor.execute(
        "INSERT INTO user_answers (user_id, task_id, category, is_correct) VALUES (?, ?, ?, ?)",
        (user_id, task_id, category, is_correct)
    )
    conn.commit()
    conn.close()


def save_client_answer(user_id: int, category: str, is_correct: bool):
    conn = get_conn()
    cursor = conn.cursor()
    cursor.execute(
        "INSERT INTO user_answers (user_id, task_id, category, is_correct) VALUES (?, NULL, ?, ?)",
        (user_id, category, is_correct)
    )
    conn.commit()
    conn.close()


def add_xp(user_id: int, amount: int):
    conn = get_conn()
    cursor = conn.cursor()
    cursor.execute("UPDATE users SET total_xp = total_xp + ? WHERE user_id = ?", (amount, user_id))
    conn.commit()
    conn.close()


def update_streak(user_id: int):
    conn = get_conn()
    cursor = conn.cursor()
    cursor.execute("SELECT last_active_date, current_streak, longest_streak FROM users WHERE user_id = ?", (user_id,))
    row = cursor.fetchone()
    if not row:
        conn.close()
        return

    last_date_str = row["last_active_date"]
    current_streak = row["current_streak"]
    longest_streak = row["longest_streak"]
    today = date.today()

    if last_date_str:
        last_date = date.fromisoformat(last_date_str)
        if last_date == today:
            conn.close()
            return
        elif (today - last_date).days == 1:
            current_streak += 1
        else:
            current_streak = 1
    else:
        current_streak = 1

    longest_streak = max(longest_streak, current_streak)

    cursor.execute(
        "UPDATE users SET current_streak = ?, longest_streak = ?, last_active_date = ? WHERE user_id = ?",
        (current_streak, longest_streak, today.isoformat(), user_id)
    )
    conn.commit()
    conn.close()


def get_user_stats(user_id: int):
    conn = get_conn()
    cursor = conn.cursor()

    cursor.execute("SELECT current_streak, longest_streak, total_xp FROM users WHERE user_id = ?", (user_id,))
    user_row = cursor.fetchone()

    cursor.execute(
        "SELECT COUNT(*) as total, SUM(is_correct) as correct FROM user_answers WHERE user_id = ?",
        (user_id,)
    )
    overall = cursor.fetchone()

    cursor.execute("""
        SELECT category, COUNT(*) as total, SUM(is_correct) as correct
        FROM user_answers
        WHERE user_id = ? AND category IS NOT NULL
        GROUP BY category
    """, (user_id,))
    by_category = cursor.fetchall()

    conn.close()

    total_xp = user_row["total_xp"] if user_row else 0
    level = 1 + total_xp // 100
    xp_into_level = total_xp % 100

    return {
        "current_streak": user_row["current_streak"] if user_row else 0,
        "longest_streak": user_row["longest_streak"] if user_row else 0,
        "total_xp": total_xp,
        "level": level,
        "xp_into_level": xp_into_level,
        "xp_for_next_level": 100,
        "total": overall["total"] or 0,
        "correct": overall["correct"] or 0,
        "by_category": [dict(r) for r in by_category],
    }


def get_leaderboard(limit: int = 10):
    conn = get_conn()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT user_id, username, total_xp, current_streak
        FROM users
        ORDER BY total_xp DESC
        LIMIT ?
    """, (limit,))
    rows = cursor.fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_user_rank(user_id: int):
    conn = get_conn()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT COUNT(*) + 1 as rank
        FROM users
        WHERE total_xp > (SELECT total_xp FROM users WHERE user_id = ?)
    """, (user_id,))
    row = cursor.fetchone()
    conn.close()
    return row["rank"] if row else None


def get_admin_overview():
    conn = get_conn()
    cursor = conn.cursor()

    cursor.execute("SELECT COUNT(*) as cnt FROM users")
    total_users = cursor.fetchone()["cnt"]

    cursor.execute("SELECT COUNT(*) as cnt FROM users WHERE last_active_date = date('now')")
    active_today = cursor.fetchone()["cnt"]

    cursor.execute("SELECT COUNT(*) as cnt FROM users WHERE last_active_date >= date('now', '-7 days')")
    active_7d = cursor.fetchone()["cnt"]

    cursor.execute("SELECT COUNT(*) as cnt, SUM(is_correct) as correct FROM user_answers")
    row = cursor.fetchone()
    total_answers = row["cnt"] or 0
    total_correct = row["correct"] or 0

    cursor.execute("""
        SELECT user_id, username, total_xp, current_streak
        FROM users ORDER BY total_xp DESC LIMIT 10
    """)
    top_users = [dict(r) for r in cursor.fetchall()]

    conn.close()
    return {
        "total_users": total_users,
        "active_today": active_today,
        "active_7d": active_7d,
        "total_answers": total_answers,
        "total_correct": total_correct,
        "top_users": top_users,
    }