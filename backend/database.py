import os
import psycopg2
import psycopg2.extras
from datetime import date, datetime, timedelta

DATABASE_URL = os.environ.get("DATABASE_URL", "")
TRIAL_DAYS = 3
REFERRAL_REWARD_DAYS = 2
REFERRAL_XP_THRESHOLD = 400  # 5 уровень


def get_conn():
    conn = psycopg2.connect(DATABASE_URL, cursor_factory=psycopg2.extras.RealDictCursor)
    return conn


def ensure_payment_invoices_table(cursor):
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS payment_invoices (
            id SERIAL PRIMARY KEY,
            user_id BIGINT NOT NULL,
            kind TEXT NOT NULL,
            amount NUMERIC NOT NULL,
            credited BOOLEAN DEFAULT FALSE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)


def init_db():
    conn = get_conn()
    cursor = conn.cursor()

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS users (
            user_id BIGINT PRIMARY KEY,
            username TEXT,
            current_streak INTEGER DEFAULT 0,
            longest_streak INTEGER DEFAULT 0,
            last_active_date DATE,
            total_xp INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS tasks (
            task_id SERIAL PRIMARY KEY,
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
            id SERIAL PRIMARY KEY,
            user_id BIGINT NOT NULL,
            task_id INTEGER,
            category TEXT,
            is_correct BOOLEAN,
            answered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS referrals (
            id SERIAL PRIMARY KEY,
            referrer_id BIGINT NOT NULL,
            referred_id BIGINT UNIQUE NOT NULL,
            reward_days INTEGER,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    ensure_payment_invoices_table(cursor)

    cursor.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS total_xp INTEGER DEFAULT 0")
    cursor.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS trial_started_at TIMESTAMP")
    cursor.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_expires_at TIMESTAMP")
    cursor.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS owns_premium_topics INTEGER DEFAULT 0")
    cursor.execute("ALTER TABLE user_answers ADD COLUMN IF NOT EXISTS category TEXT")
    cursor.execute("ALTER TABLE referrals ADD COLUMN IF NOT EXISTS credited BOOLEAN DEFAULT FALSE")

    conn.commit()
    cursor.close()
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
                VALUES (%s, %s, %s, %s, %s, %s)
            """, (t["category"], t["difficulty"], t["question"], t["options"], t["correct_answer"], t["explanation"]))
        conn.commit()
    cursor.close()
    conn.close()


def add_user_if_not_exists(user_id: int, username: str | None, referrer_id: int | None = None):
    conn = get_conn()
    cursor = conn.cursor()
    cursor.execute("SELECT user_id FROM users WHERE user_id = %s", (user_id,))
    is_new = cursor.fetchone() is None
    if is_new:
        cursor.execute("INSERT INTO users (user_id, username) VALUES (%s, %s)", (user_id, username))
        conn.commit()
    cursor.close()
    conn.close()
    if is_new and referrer_id:
        register_referral(referrer_id, user_id)


def get_random_task(category: str | None, difficulty: int | None):
    conn = get_conn()
    cursor = conn.cursor()
    query = "SELECT * FROM tasks WHERE 1=1"
    params = []
    if category:
        query += " AND category = %s"
        params.append(category)
    if difficulty:
        query += " AND difficulty = %s"
        params.append(difficulty)
    query += " ORDER BY RANDOM() LIMIT 1"
    cursor.execute(query, params)
    row = cursor.fetchone()
    cursor.close()
    conn.close()
    return dict(row) if row else None


def get_task_by_id(task_id: int):
    conn = get_conn()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM tasks WHERE task_id = %s", (task_id,))
    row = cursor.fetchone()
    cursor.close()
    conn.close()
    return dict(row) if row else None


def save_answer(user_id: int, task_id: int, category: str, is_correct: bool):
    conn = get_conn()
    cursor = conn.cursor()
    cursor.execute(
        "INSERT INTO user_answers (user_id, task_id, category, is_correct) VALUES (%s, %s, %s, %s)",
        (user_id, task_id, category, is_correct)
    )
    conn.commit()
    cursor.close()
    conn.close()


def save_client_answer(user_id: int, category: str, is_correct: bool):
    conn = get_conn()
    cursor = conn.cursor()
    cursor.execute(
        "INSERT INTO user_answers (user_id, task_id, category, is_correct) VALUES (%s, NULL, %s, %s)",
        (user_id, category, is_correct)
    )
    conn.commit()
    cursor.close()
    conn.close()


def add_xp(user_id: int, amount: int):
    conn = get_conn()
    cursor = conn.cursor()
    cursor.execute("UPDATE users SET total_xp = total_xp + %s WHERE user_id = %s", (amount, user_id))
    conn.commit()
    cursor.close()
    conn.close()
    check_referral_reward(user_id)


def update_streak(user_id: int):
    conn = get_conn()
    cursor = conn.cursor()
    cursor.execute("SELECT last_active_date, current_streak, longest_streak FROM users WHERE user_id = %s", (user_id,))
    row = cursor.fetchone()
    if not row:
        cursor.close()
        conn.close()
        return

    last_date = row["last_active_date"]
    current_streak = row["current_streak"]
    longest_streak = row["longest_streak"]
    today = date.today()

    if last_date:
        if last_date == today:
            cursor.close()
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
        "UPDATE users SET current_streak = %s, longest_streak = %s, last_active_date = %s WHERE user_id = %s",
        (current_streak, longest_streak, today, user_id)
    )
    conn.commit()
    cursor.close()
    conn.close()


def get_user_stats(user_id: int):
    conn = get_conn()
    cursor = conn.cursor()

    cursor.execute("SELECT current_streak, longest_streak, total_xp FROM users WHERE user_id = %s", (user_id,))
    user_row = cursor.fetchone()

    cursor.execute(
        "SELECT COUNT(*) as total, SUM(CASE WHEN is_correct THEN 1 ELSE 0 END) as correct FROM user_answers WHERE user_id = %s",
        (user_id,)
    )
    overall = cursor.fetchone()

    cursor.execute("""
        SELECT category, COUNT(*) as total, SUM(CASE WHEN is_correct THEN 1 ELSE 0 END) as correct
        FROM user_answers
        WHERE user_id = %s AND category IS NOT NULL
        GROUP BY category
    """, (user_id,))
    by_category = cursor.fetchall()

    cursor.close()
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
        LIMIT %s
    """, (limit,))
    rows = cursor.fetchall()
    cursor.close()
    conn.close()
    return [dict(r) for r in rows]


def get_user_rank(user_id: int):
    conn = get_conn()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT COUNT(*) + 1 as rank
        FROM users
        WHERE total_xp > (SELECT total_xp FROM users WHERE user_id = %s)
    """, (user_id,))
    row = cursor.fetchone()
    cursor.close()
    conn.close()
    return row["rank"] if row else None


def get_admin_overview():
    conn = get_conn()
    cursor = conn.cursor()

    cursor.execute("SELECT COUNT(*) as cnt FROM users")
    total_users = cursor.fetchone()["cnt"]

    cursor.execute("SELECT COUNT(*) as cnt FROM users WHERE last_active_date = CURRENT_DATE")
    active_today = cursor.fetchone()["cnt"]

    cursor.execute("SELECT COUNT(*) as cnt FROM users WHERE last_active_date >= CURRENT_DATE - INTERVAL '7 days'")
    active_7d = cursor.fetchone()["cnt"]

    cursor.execute("SELECT COUNT(*) as cnt, SUM(CASE WHEN is_correct THEN 1 ELSE 0 END) as correct FROM user_answers")
    row = cursor.fetchone()
    total_answers = row["cnt"] or 0
    total_correct = row["correct"] or 0

    cursor.execute("""
        SELECT user_id, username, total_xp, current_streak
        FROM users ORDER BY total_xp DESC LIMIT 10
    """)
    top_users = [dict(r) for r in cursor.fetchall()]

    cursor.close()
    conn.close()
    return {
        "total_users": total_users,
        "active_today": active_today,
        "active_7d": active_7d,
        "total_answers": total_answers,
        "total_correct": total_correct,
        "top_users": top_users,
    }


# ===== Подписка / пробный период / премиум-темы =====

def start_trial_if_needed(user_id: int):
    conn = get_conn()
    cursor = conn.cursor()
    cursor.execute("SELECT trial_started_at FROM users WHERE user_id = %s", (user_id,))
    row = cursor.fetchone()
    if row and row["trial_started_at"] is None:
        cursor.execute(
            "UPDATE users SET trial_started_at = %s WHERE user_id = %s",
            (datetime.utcnow(), user_id)
        )
        conn.commit()
    cursor.close()
    conn.close()


def get_access_status(user_id: int):
    conn = get_conn()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT trial_started_at, subscription_expires_at, owns_premium_topics
        FROM users WHERE user_id = %s
    """, (user_id,))
    row = cursor.fetchone()
    cursor.close()
    conn.close()

    if not row:
        return {"trial_active": True, "trial_seconds_left": TRIAL_DAYS * 86400,
                "subscription_active": False, "owns_premium_topics": False}

    now = datetime.utcnow()

    trial_seconds_left = 0
    if row["trial_started_at"]:
        elapsed = (now - row["trial_started_at"]).total_seconds()
        trial_seconds_left = max(0, TRIAL_DAYS * 86400 - int(elapsed))

    subscription_active = False
    if row["subscription_expires_at"]:
        subscription_active = row["subscription_expires_at"] > now

    return {
        "trial_active": trial_seconds_left > 0,
        "trial_seconds_left": trial_seconds_left,
        "subscription_active": subscription_active,
        "owns_premium_topics": bool(row["owns_premium_topics"]),
    }


def activate_subscription(user_id: int, days: int = 30):
    conn = get_conn()
    cursor = conn.cursor()
    cursor.execute("SELECT subscription_expires_at FROM users WHERE user_id = %s", (user_id,))
    row = cursor.fetchone()
    now = datetime.utcnow()
    base = now
    if row and row["subscription_expires_at"] and row["subscription_expires_at"] > now:
        base = row["subscription_expires_at"]
    new_expiry = base + timedelta(days=days)
    cursor.execute(
        "UPDATE users SET subscription_expires_at = %s WHERE user_id = %s",
        (new_expiry, user_id)
    )
    conn.commit()
    cursor.close()
    conn.close()


def grant_premium_topics(user_id: int):
    conn = get_conn()
    cursor = conn.cursor()
    cursor.execute("UPDATE users SET owns_premium_topics = 1 WHERE user_id = %s", (user_id,))
    conn.commit()
    cursor.close()
    conn.close()


# ===== Реферальная программа =====

def register_referral(referrer_id: int, referred_id: int):
    """Сохраняет связь сразу, но НЕ начисляет награду — та придёт позже, когда друг дойдёт до 5 уровня."""
    if referrer_id == referred_id:
        return
    conn = get_conn()
    cursor = conn.cursor()
    cursor.execute("SELECT user_id FROM users WHERE user_id = %s", (referrer_id,))
    if cursor.fetchone() is None:
        cursor.close()
        conn.close()
        return
    try:
        cursor.execute(
            "INSERT INTO referrals (referrer_id, referred_id, reward_days, credited) VALUES (%s, %s, %s, FALSE)",
            (referrer_id, referred_id, REFERRAL_REWARD_DAYS)
        )
        conn.commit()
    except psycopg2.errors.UniqueViolation:
        conn.rollback()
    cursor.close()
    conn.close()


def check_referral_reward(user_id: int):
    """Вызывается при каждом начислении XP — проверяет, не пора ли наградить того, кто пригласил этого игрока."""
    conn = get_conn()
    cursor = conn.cursor()
    cursor.execute("SELECT total_xp FROM users WHERE user_id = %s", (user_id,))
    row = cursor.fetchone()
    if not row or row["total_xp"] < REFERRAL_XP_THRESHOLD:
        cursor.close()
        conn.close()
        return

    cursor.execute(
        "SELECT referrer_id, reward_days FROM referrals WHERE referred_id = %s AND credited = FALSE",
        (user_id,)
    )
    ref = cursor.fetchone()
    if not ref:
        cursor.close()
        conn.close()
        return

    cursor.execute("UPDATE referrals SET credited = TRUE WHERE referred_id = %s", (user_id,))
    conn.commit()
    cursor.close()
    conn.close()
    activate_subscription(ref["referrer_id"], days=ref["reward_days"])


def get_referral_stats(user_id: int):
    conn = get_conn()
    cursor = conn.cursor()
    cursor.execute("SELECT COUNT(*) as cnt FROM referrals WHERE referrer_id = %s AND credited = TRUE", (user_id,))
    credited = cursor.fetchone()["cnt"]
    cursor.execute("SELECT COUNT(*) as cnt FROM referrals WHERE referrer_id = %s AND credited = FALSE", (user_id,))
    pending = cursor.fetchone()["cnt"]
    cursor.close()
    conn.close()
    return {"referrals_count": credited, "days_earned": credited * REFERRAL_REWARD_DAYS, "pending_count": pending}


# ===== Робокасса =====

def create_payment_invoice(user_id: int, kind: str, amount: float) -> int:
    conn = get_conn()
    cursor = conn.cursor()
    cursor.execute(
        "INSERT INTO payment_invoices (user_id, kind, amount) VALUES (%s, %s, %s) RETURNING id",
        (user_id, kind, amount)
    )
    inv_id = cursor.fetchone()["id"]
    conn.commit()
    cursor.close()
    conn.close()
    return inv_id


def get_invoice(inv_id: int):
    conn = get_conn()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM payment_invoices WHERE id = %s", (inv_id,))
    row = cursor.fetchone()
    cursor.close()
    conn.close()
    return dict(row) if row else None


def mark_invoice_credited(inv_id: int):
    conn = get_conn()
    cursor = conn.cursor()
    cursor.execute("UPDATE payment_invoices SET credited = TRUE WHERE id = %s", (inv_id,))
    conn.commit()
    cursor.close()
    conn.close()

# ===== Админ-команды бота (/grant и т.п.) =====

def find_user(ref: str):
    """Ищет пользователя по @username (без учёта регистра) или по числовому Telegram ID."""
    ref = ref.strip()
    conn = get_conn()
    cursor = conn.cursor()
    fields = "user_id, username, subscription_expires_at, owns_premium_topics"
    if ref.isdigit():
        cursor.execute(f"SELECT {fields} FROM users WHERE user_id = %s", (int(ref),))
    else:
        cursor.execute(
            f"SELECT {fields} FROM users WHERE LOWER(username) = LOWER(%s) ORDER BY created_at DESC LIMIT 1",
            (ref.lstrip("@"),)
        )
    row = cursor.fetchone()
    cursor.close()
    conn.close()
    return dict(row) if row else None


def refresh_username(user_id: int, username: str | None):
    """Обновляет username, если человек его сменил (чтобы /grant @username находил его по новому)."""
    if not username:
        return
    conn = get_conn()
    cursor = conn.cursor()
    cursor.execute(
        "UPDATE users SET username = %s WHERE user_id = %s AND username IS DISTINCT FROM %s",
        (username, user_id, username)
    )
    conn.commit()
    cursor.close()
    conn.close()


def get_subscription_expiry(user_id: int):
    conn = get_conn()
    cursor = conn.cursor()
    cursor.execute("SELECT subscription_expires_at FROM users WHERE user_id = %s", (user_id,))
    row = cursor.fetchone()
    cursor.close()
    conn.close()
    return row["subscription_expires_at"] if row else None