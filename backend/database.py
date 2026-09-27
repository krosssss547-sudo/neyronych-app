import os
import secrets
import psycopg2
import psycopg2.extras
from datetime import date, datetime, timedelta

DATABASE_URL = os.environ.get("DATABASE_URL", "")
TRIAL_DAYS = 3
REFERRAL_REWARD_DAYS = 2
REFERRAL_XP_THRESHOLD = 400  # 5 уровень
MSK_OFFSET = timedelta(hours=3)
WEEKLY_FREE_FREEZES_MAX = 2   # сколько бесплатных заморозок может накопиться у подписчика
FREEZES_MAX = 10              # общий потолок (с купленными)


def today_msk() -> date:
    """Сегодняшняя дата по Москве — стрик считается по московским дням, а не по UTC."""
    return (datetime.utcnow() + MSK_OFFSET).date()


def effective_streak(current_streak: int, last_active_date, freezes: int = 0) -> int:
    """Стрик, который видит игрок. Если пропущены дни и заморозок не хватит их закрыть — серия прервана, показываем 0."""
    if not last_active_date or not current_streak:
        return 0
    gap = (today_msk() - last_active_date).days
    if gap <= 1 or (freezes or 0) >= gap - 1:
        return current_streak
    return 0


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
    # Заморозки стрика и напоминания
    cursor.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS streak_freezes INTEGER DEFAULT 0")
    cursor.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS freeze_week TEXT")
    cursor.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS reminders_off BOOLEAN DEFAULT FALSE")
    cursor.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS bot_blocked BOOLEAN DEFAULT FALSE")
    cursor.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS last_reminded_date DATE")
    # Испытание дня: засчитывается только первая попытка за день
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS daily_results (
            user_id BIGINT NOT NULL,
            day DATE NOT NULL,
            correct INTEGER NOT NULL,
            time_ms INTEGER NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (user_id, day)
        )
    """)
    # Дуэли: один создаёт и проходит, второй проходит те же задания по ссылке
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS duels (
            id TEXT PRIMARY KEY,
            seed BIGINT NOT NULL,
            creator_id BIGINT NOT NULL,
            creator_correct INTEGER,
            creator_time_ms INTEGER,
            opponent_id BIGINT,
            opponent_correct INTEGER,
            opponent_time_ms INTEGER,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            finished_at TIMESTAMP
        )
    """)

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


def _iso_week(d: date) -> str:
    y, w, _ = d.isocalendar()
    return f"{y}-W{w:02d}"


def update_streak(user_id: int) -> dict:
    """Засчитывает сегодняшний день в стрик. Подписчикам раз в неделю даёт бесплатную заморозку.
    Если пропущены дни, а заморозок хватает — тратит их и сохраняет серию. Возвращает {"freeze_used": N}."""
    conn = get_conn()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT last_active_date, current_streak, longest_streak, streak_freezes, freeze_week, subscription_expires_at
        FROM users WHERE user_id = %s
    """, (user_id,))
    row = cursor.fetchone()
    if not row:
        cursor.close()
        conn.close()
        return {"freeze_used": 0}

    today = today_msk()
    last_date = row["last_active_date"]
    current = row["current_streak"] or 0
    longest = row["longest_streak"] or 0
    freezes = row["streak_freezes"] or 0
    freeze_week = row["freeze_week"]
    changed = False

    sub = row["subscription_expires_at"]
    week = _iso_week(today)
    if sub and sub > datetime.utcnow() and freeze_week != week:
        freeze_week = week
        freezes = max(freezes, min(freezes + 1, WEEKLY_FREE_FREEZES_MAX))
        changed = True

    used = 0
    gap = (today - last_date).days if last_date else None
    if gap is None:
        current, changed = 1, True
    elif gap >= 1:
        if gap == 1:
            current += 1
        elif current > 0 and freezes >= gap - 1:
            used = gap - 1
            freezes -= used
            current += 1
        else:
            current = 1
        changed = True

    if changed:
        longest = max(longest, current)
        cursor.execute("""
            UPDATE users SET current_streak = %s, longest_streak = %s, last_active_date = %s,
                             streak_freezes = %s, freeze_week = %s
            WHERE user_id = %s
        """, (current, longest, max(today, last_date) if last_date else today, freezes, freeze_week, user_id))
        conn.commit()
    cursor.close()
    conn.close()
    return {"freeze_used": used}


def add_streak_freeze(user_id: int, count: int = 1):
    conn = get_conn()
    cursor = conn.cursor()
    cursor.execute(
        "UPDATE users SET streak_freezes = LEAST(COALESCE(streak_freezes, 0) + %s, %s) WHERE user_id = %s",
        (count, FREEZES_MAX, user_id)
    )
    conn.commit()
    cursor.close()
    conn.close()


def get_user_stats(user_id: int):
    conn = get_conn()
    cursor = conn.cursor()

    cursor.execute("SELECT current_streak, longest_streak, last_active_date, total_xp, streak_freezes FROM users WHERE user_id = %s", (user_id,))
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
        "current_streak": effective_streak(user_row["current_streak"], user_row["last_active_date"], user_row["streak_freezes"]) if user_row else 0,
        "streak_freezes": (user_row["streak_freezes"] or 0) if user_row else 0,
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
        SELECT user_id, username, total_xp,
               CASE WHEN last_active_date + 1 + COALESCE(streak_freezes, 0) >= %s THEN current_streak ELSE 0 END AS current_streak
        FROM users
        ORDER BY total_xp DESC
        LIMIT %s
    """, (today_msk(), limit))
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

    today = today_msk()
    cursor.execute("SELECT COUNT(*) as cnt FROM users WHERE last_active_date = %s", (today,))
    active_today = cursor.fetchone()["cnt"]

    cursor.execute("SELECT COUNT(*) as cnt FROM users WHERE last_active_date >= %s", (today - timedelta(days=7),))
    active_7d = cursor.fetchone()["cnt"]

    cursor.execute("SELECT COUNT(*) as cnt, SUM(CASE WHEN is_correct THEN 1 ELSE 0 END) as correct FROM user_answers")
    row = cursor.fetchone()
    total_answers = row["cnt"] or 0
    total_correct = row["correct"] or 0

    cursor.execute("""
        SELECT user_id, username, total_xp,
               CASE WHEN last_active_date + 1 + COALESCE(streak_freezes, 0) >= %s THEN current_streak ELSE 0 END AS current_streak
        FROM users ORDER BY total_xp DESC LIMIT 10
    """, (today,))
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


# ===== Испытание дня =====

def _daily_standing(cursor, user_id: int, day: date) -> dict:
    cursor.execute("SELECT correct, time_ms FROM daily_results WHERE user_id = %s AND day = %s", (user_id, day))
    mine = cursor.fetchone()
    cursor.execute("SELECT COUNT(*) AS cnt FROM daily_results WHERE day = %s", (day,))
    participants = cursor.fetchone()["cnt"]
    cursor.execute("""
        SELECT u.username, d.correct, d.time_ms
        FROM daily_results d LEFT JOIN users u ON u.user_id = d.user_id
        WHERE d.day = %s ORDER BY d.correct DESC, d.time_ms ASC LIMIT 5
    """, (day,))
    top = [dict(r) for r in cursor.fetchall()]
    result = {"day": day.isoformat(), "played": mine is not None, "participants": participants, "top": top}
    if mine:
        cursor.execute("""
            SELECT COUNT(*) AS cnt FROM daily_results
            WHERE day = %s AND (correct > %s OR (correct = %s AND time_ms < %s))
        """, (day, mine["correct"], mine["correct"], mine["time_ms"]))
        better = cursor.fetchone()["cnt"]
        cursor.execute("""
            SELECT COUNT(*) AS cnt FROM daily_results
            WHERE day = %s AND (correct < %s OR (correct = %s AND time_ms > %s))
        """, (day, mine["correct"], mine["correct"], mine["time_ms"]))
        worse = cursor.fetchone()["cnt"]
        others = participants - 1
        result.update({
            "correct": mine["correct"],
            "time_ms": mine["time_ms"],
            "rank": better + 1,
            "better_than_pct": round(worse / others * 100) if others > 0 else 100,
        })
    return result


def submit_daily(user_id: int, day: date, correct: int, time_ms: int) -> dict:
    conn = get_conn()
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO daily_results (user_id, day, correct, time_ms) VALUES (%s, %s, %s, %s)
        ON CONFLICT (user_id, day) DO NOTHING
    """, (user_id, day, correct, time_ms))
    first_attempt = cursor.rowcount == 1
    conn.commit()
    result = _daily_standing(cursor, user_id, day)
    result["first_attempt"] = first_attempt
    cursor.close()
    conn.close()
    return result


def get_daily_status(user_id: int, day: date) -> dict:
    conn = get_conn()
    cursor = conn.cursor()
    result = _daily_standing(cursor, user_id, day)
    cursor.close()
    conn.close()
    return result


# ===== Дуэли =====

def create_duel(creator_id: int) -> dict:
    conn = get_conn()
    cursor = conn.cursor()
    duel_id = secrets.token_urlsafe(6).replace("-", "a").replace("_", "b")
    seed = secrets.randbelow(2**31 - 1) + 1
    cursor.execute("INSERT INTO duels (id, seed, creator_id) VALUES (%s, %s, %s)", (duel_id, seed, creator_id))
    conn.commit()
    cursor.close()
    conn.close()
    return {"id": duel_id, "seed": seed}


def get_duel(duel_id: str):
    conn = get_conn()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT d.*, cu.username AS creator_username, ou.username AS opponent_username
        FROM duels d
        LEFT JOIN users cu ON cu.user_id = d.creator_id
        LEFT JOIN users ou ON ou.user_id = d.opponent_id
        WHERE d.id = %s
    """, (duel_id,))
    row = cursor.fetchone()
    cursor.close()
    conn.close()
    return dict(row) if row else None


def save_duel_result(duel_id: str, user_id: int, correct: int, time_ms: int) -> str:
    """Возвращает роль игрока: 'creator', 'opponent' или ошибку: 'not_found', 'taken', 'own', 'not_ready'."""
    conn = get_conn()
    cursor = conn.cursor()
    cursor.execute("SELECT creator_id, creator_correct, opponent_id FROM duels WHERE id = %s FOR UPDATE", (duel_id,))
    row = cursor.fetchone()
    role = "not_found"
    if row:
        if row["creator_id"] == user_id:
            if row["creator_correct"] is None:
                cursor.execute("UPDATE duels SET creator_correct = %s, creator_time_ms = %s WHERE id = %s",
                               (correct, time_ms, duel_id))
                role = "creator"
            else:
                role = "own"
        elif row["creator_correct"] is None:
            role = "not_ready"
        elif row["opponent_id"] is None:
            cursor.execute("""
                UPDATE duels SET opponent_id = %s, opponent_correct = %s, opponent_time_ms = %s, finished_at = %s
                WHERE id = %s
            """, (user_id, correct, time_ms, datetime.utcnow(), duel_id))
            role = "opponent"
        else:
            role = "taken"
    conn.commit()
    cursor.close()
    conn.close()
    return role


# ===== Напоминания =====

def get_reminder_targets() -> list[dict]:
    """Кому сегодня напомнить: вчера заходил (стрик под угрозой) или не заходил 3 дня."""
    today = today_msk()
    conn = get_conn()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT user_id, current_streak, last_active_date, COALESCE(streak_freezes, 0) AS streak_freezes
        FROM users
        WHERE COALESCE(reminders_off, FALSE) = FALSE
          AND COALESCE(bot_blocked, FALSE) = FALSE
          AND (last_reminded_date IS NULL OR last_reminded_date < %s)
          AND last_active_date IN (%s, %s)
    """, (today, today - timedelta(days=1), today - timedelta(days=3)))
    rows = [dict(r) for r in cursor.fetchall()]
    cursor.close()
    conn.close()
    return rows


def mark_reminded(user_id: int):
    conn = get_conn()
    cursor = conn.cursor()
    cursor.execute("UPDATE users SET last_reminded_date = %s WHERE user_id = %s", (today_msk(), user_id))
    conn.commit()
    cursor.close()
    conn.close()


def set_user_flag(user_id: int, flag: str, value: bool):
    if flag not in ("reminders_off", "bot_blocked"):
        raise ValueError(flag)
    conn = get_conn()
    cursor = conn.cursor()
    cursor.execute(f"UPDATE users SET {flag} = %s WHERE user_id = %s", (value, user_id))
    conn.commit()
    cursor.close()
    conn.close()


# ===== Сводка для админа (/stats в боте) =====

def get_bot_stats() -> dict:
    today = today_msk()
    week_ago = today - timedelta(days=6)
    now = datetime.utcnow()
    conn = get_conn()
    cursor = conn.cursor()

    def one(query, params=()):
        cursor.execute(query, params)
        row = cursor.fetchone()
        return list(row.values())[0] if row else 0

    msk_day = "(created_at + INTERVAL '3 hours')::date"
    stats = {
        "total_users": one("SELECT COUNT(*) AS c FROM users"),
        "new_today": one(f"SELECT COUNT(*) AS c FROM users WHERE {msk_day} = %s", (today,)),
        "new_week": one(f"SELECT COUNT(*) AS c FROM users WHERE {msk_day} >= %s", (week_ago,)),
        "active_today": one("SELECT COUNT(*) AS c FROM users WHERE last_active_date = %s", (today,)),
        "active_week": one("SELECT COUNT(*) AS c FROM users WHERE last_active_date >= %s", (week_ago,)),
        "subscriptions": one("SELECT COUNT(*) AS c FROM users WHERE subscription_expires_at > %s", (now,)),
        "daily_today": one("SELECT COUNT(*) AS c FROM daily_results WHERE day = %s", (today,)),
        "duels_today": one(f"SELECT COUNT(*) AS c FROM duels WHERE finished_at IS NOT NULL AND (finished_at + INTERVAL '3 hours')::date = %s", (today,)),
        "card_payments_week": one(f"SELECT COUNT(*) AS c FROM payment_invoices WHERE credited = TRUE AND {msk_day} >= %s", (week_ago,)),
        "card_revenue_week": one(f"SELECT COALESCE(SUM(amount), 0) AS c FROM payment_invoices WHERE credited = TRUE AND {msk_day} >= %s", (week_ago,)),
    }
    cursor.close()
    conn.close()
    return stats


def list_users(offset: int = 0, limit: int = 25) -> dict:
    """Все пользователи для админ-команды /users (сначала новые). user_id = 0 — не человек, а заход без Telegram."""
    conn = get_conn()
    cursor = conn.cursor()
    cursor.execute("SELECT COUNT(*) AS c FROM users WHERE user_id <> 0")
    total = cursor.fetchone()["c"]
    cursor.execute("""
        SELECT user_id, username, total_xp, current_streak, last_active_date, streak_freezes,
               subscription_expires_at, owns_premium_topics, created_at
        FROM users WHERE user_id <> 0
        ORDER BY created_at DESC, user_id DESC
        LIMIT %s OFFSET %s
    """, (limit, offset))
    rows = [dict(r) for r in cursor.fetchall()]
    cursor.close()
    conn.close()
    for r in rows:
        r["streak"] = effective_streak(r["current_streak"], r["last_active_date"], r["streak_freezes"])
    return {"total": total, "rows": rows}