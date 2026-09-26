import os
import re
import hashlib
import hmac
import logging
from datetime import datetime, timedelta
from urllib.parse import quote
import httpx

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, PlainTextResponse
from pydantic import BaseModel, Field

from database import (
    init_db, seed_tasks_if_empty, add_user_if_not_exists,
    get_random_task, get_task_by_id, save_answer, save_client_answer,
    update_streak, get_user_stats, add_xp, get_leaderboard, get_user_rank,
    get_admin_overview, start_trial_if_needed, get_access_status,
    activate_subscription, grant_premium_topics, get_referral_stats,
    create_payment_invoice, get_invoice, mark_invoice_credited,
    find_user, refresh_username, get_subscription_expiry
)
from tasks_data import TASKS

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

XP_PER_CORRECT_ANSWER = 10
CLIENT_TOPICS = {
    "differences", "speed", "colors", "words", "matrices", "reading",
    "memory", "attention", "logic", "math",
}

BOT_TOKEN = os.environ.get("BOT_TOKEN", "").strip()
ROBOKASSA_LOGIN = os.environ.get("ROBOKASSA_LOGIN", "").strip()
ROBOKASSA_PASSWORD1 = os.environ.get("ROBOKASSA_PASSWORD1", "").strip()
ROBOKASSA_PASSWORD2 = os.environ.get("ROBOKASSA_PASSWORD2", "").strip()
TELEGRAM_WEBHOOK_SECRET = os.environ.get("TELEGRAM_WEBHOOK_SECRET", "").strip()
# ROBOKASSA_TEST=1 — тестовый режим Робокассы (тогда ROBOKASSA_PASSWORD1/2 должны быть тестовыми паролями)
ROBOKASSA_TEST = os.environ.get("ROBOKASSA_TEST", "") == "1"
# Адрес страницы с офертой (например https://<сайт>.vercel.app/oferta.html) — кнопка в ответе на /start
OFFER_URL = os.environ.get("OFFER_URL", "")
# Telegram ID админов через запятую — только им доступны /grant и другие админ-команды (свой ID покажет /myid)
ADMIN_IDS = {int(x) for x in re.findall(r"\d+", os.environ.get("ADMIN_IDS", ""))}

SUBSCRIPTION_STARS = 100
PREMIUM_STARS = 70
# Цены в рублях — должны совпадать с приложением и с офертой
SUBSCRIPTION_RUB = 150
PREMIUM_RUB = 100

# Ссылка на Mini App для кнопки в ответе на /start.
# По умолчанию — прямая ссылка Telegram (та же, что в реферальных ссылках приложения).
# Если задать MINI_APP_URL (адрес сайта на Vercel), кнопка будет открывать его как web_app.
MINI_APP_LINK = os.environ.get("MINI_APP_LINK", "https://t.me/neyronych18_bot/app")
MINI_APP_URL = os.environ.get("MINI_APP_URL", "")

START_TEXT = (
    "Привет! Я Нейроныч 🧠\n\n"
    "Тренажёр мозга прямо в Telegram: память, внимание, логика и счёт — "
    "всего 5 минут в день.\n\n"
    "Первые 3 дня бесплатно. Жми кнопку ниже, чтобы начать 👇"
)
OTHER_TEXT = "Все тренировки — внутри приложения. Жми кнопку ниже 👇"

logger = logging.getLogger("uvicorn.error")


@app.on_event("startup")
async def startup():
    init_db()
    seed_tasks_if_empty(TASKS)


class UserInit(BaseModel):
    user_id: int
    username: str | None = None
    referrer_id: int | None = None


class AnswerSubmit(BaseModel):
    user_id: int
    task_id: int
    answer: str


class ClientAnswerSubmit(BaseModel):
    user_id: int
    category: str
    is_correct: bool
    xp_value: int = Field(default=XP_PER_CORRECT_ANSWER, ge=0, le=100)


class PaySubscribeRequest(BaseModel):
    user_id: int


class PayPremiumRequest(BaseModel):
    user_id: int


@app.get("/")
async def root():
    return {"status": "ok", "message": "Нейроныч API работает"}


@app.get("/api/ping")
async def ping():
    return {"pong": True}


@app.post("/api/user/init")
async def init_user(payload: UserInit):
    add_user_if_not_exists(payload.user_id, payload.username, payload.referrer_id)
    return {"ok": True}


@app.get("/api/task")
async def get_task(category: str | None = None, difficulty: int | None = None):
    cat = None if category in (None, "any") else category
    diff = None if difficulty in (None, 0) else difficulty

    task = get_random_task(cat, diff)
    if not task:
        raise HTTPException(status_code=404, detail="No tasks found for these filters")

    return {
        "task_id": task["task_id"],
        "category": task["category"],
        "difficulty": task["difficulty"],
        "question": task["question"],
        "options": task["options"],
    }


@app.post("/api/answer")
async def submit_answer(payload: AnswerSubmit):
    task = get_task_by_id(payload.task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    is_correct = (payload.answer == task["correct_answer"])

    save_answer(payload.user_id, payload.task_id, task["category"], is_correct)
    if is_correct:
        update_streak(payload.user_id)
        add_xp(payload.user_id, XP_PER_CORRECT_ANSWER)

    return {
        "is_correct": is_correct,
        "correct_answer": task["correct_answer"],
        "explanation": task["explanation"],
        "xp_earned": XP_PER_CORRECT_ANSWER if is_correct else 0,
    }


@app.post("/api/answer/client")
async def submit_client_answer(payload: ClientAnswerSubmit):
    if payload.category not in CLIENT_TOPICS:
        raise HTTPException(status_code=400, detail="Unknown client topic")

    save_client_answer(payload.user_id, payload.category, payload.is_correct)
    if payload.is_correct:
        update_streak(payload.user_id)
        add_xp(payload.user_id, payload.xp_value)

    return {"ok": True, "xp_earned": payload.xp_value if payload.is_correct else 0}


@app.get("/api/stats/{user_id}")
async def stats(user_id: int):
    return get_user_stats(user_id)


@app.get("/api/leaderboard")
async def leaderboard(user_id: int | None = None):
    top = get_leaderboard(10)
    my_rank = get_user_rank(user_id) if user_id else None
    return {
        "top": top,
        "my_rank": my_rank,
    }


@app.get("/api/admin/overview", response_class=HTMLResponse)
async def admin_overview():
    s = get_admin_overview()
    rows = "".join(
        f"<tr><td>{u['username'] or u['user_id']}</td><td>{u['total_xp']}</td><td>{u['current_streak']}</td></tr>"
        for u in s["top_users"]
    )
    return f"""
    <html><head><meta charset="utf-8"><title>Нейроныч — статистика</title>
    <style>
        body {{ font-family: sans-serif; background: #0a0a12; color: #fff; padding: 2rem; }}
        h1 {{ margin-bottom: 0.5rem; }}
        .cards {{ display: flex; gap: 1rem; margin: 1.5rem 0; flex-wrap: wrap; }}
        .card {{ background: #16161f; border: 1px solid #333; border-radius: 12px; padding: 1rem 1.5rem; }}
        .card b {{ font-size: 1.5rem; display: block; }}
        table {{ border-collapse: collapse; margin-top: 1rem; }}
        td {{ padding: 0.5rem 1rem; border-bottom: 1px solid #333; }}
    </style></head>
    <body>
        <h1>🧠 Нейроныч — статистика</h1>
        <div class="cards">
            <div class="card"><b>{s['total_users']}</b>Всего пользователей</div>
            <div class="card"><b>{s['active_today']}</b>Активны сегодня</div>
            <div class="card"><b>{s['active_7d']}</b>Активны за 7 дней</div>
            <div class="card"><b>{s['total_answers']}</b>Всего ответов</div>
            <div class="card"><b>{s['total_correct']}</b>Правильных ответов</div>
        </div>
        <h2>Топ-10 по XP</h2>
        <table><tr><td><b>Игрок</b></td><td><b>XP</b></td><td><b>Стрик</b></td></tr>{rows}</table>
    </body></html>
    """


@app.get("/api/access/{user_id}")
async def check_access(user_id: int):
    start_trial_if_needed(user_id)
    return get_access_status(user_id)


@app.get("/api/referrals/{user_id}")
async def referrals(user_id: int):
    return get_referral_stats(user_id)


# ===== Telegram Stars =====

@app.post("/api/pay/stars/subscription")
async def create_stars_subscription_invoice(payload: PaySubscribeRequest):
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"https://api.telegram.org/bot{BOT_TOKEN}/createInvoiceLink",
            json={
                "title": "Подписка Нейроныч",
                "description": "Доступ к премиум-темам на 30 дней",
                "payload": f"subscription:{payload.user_id}",
                "currency": "XTR",
                "prices": [{"label": "Подписка на месяц", "amount": SUBSCRIPTION_STARS}],
                "subscription_period": 2592000,
            },
        )
    data = resp.json()
    if not data.get("ok"):
        raise HTTPException(status_code=400, detail=data.get("description", "Telegram error"))
    return {"invoice_link": data["result"]}


@app.post("/api/pay/stars/premium")
async def create_stars_premium_invoice(payload: PayPremiumRequest):
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"https://api.telegram.org/bot{BOT_TOKEN}/createInvoiceLink",
            json={
                "title": "Премиум-темы Нейроныч",
                "description": "Матрицы и Скорочтение — навсегда (при активной подписке)",
                "payload": f"premium:{payload.user_id}",
                "currency": "XTR",
                "prices": [{"label": "Премиум-темы", "amount": PREMIUM_STARS}],
            },
        )
    data = resp.json()
    if not data.get("ok"):
        raise HTTPException(status_code=400, detail=data.get("description", "Telegram error"))
    return {"invoice_link": data["result"]}


@app.post("/api/telegram/webhook")
async def telegram_webhook(request: Request):
    # Проверяем секрет, который Telegram присылает в заголовке (задаётся в setWebhook через secret_token),
    # чтобы никто посторонний не мог прислать поддельное уведомление об оплате.
    secret = request.headers.get("x-telegram-bot-api-secret-token", "")
    if not TELEGRAM_WEBHOOK_SECRET or not hmac.compare_digest(secret, TELEGRAM_WEBHOOK_SECRET):
        raise HTTPException(status_code=403, detail="Forbidden")

    update = await request.json()

    if "pre_checkout_query" in update:
        query_id = update["pre_checkout_query"]["id"]
        async with httpx.AsyncClient() as client:
            await client.post(
                f"https://api.telegram.org/bot{BOT_TOKEN}/answerPreCheckoutQuery",
                json={"pre_checkout_query_id": query_id, "ok": True},
            )
        return {"ok": True}

    message = update.get("message", {})
    payment = message.get("successful_payment")
    if payment:
        payload = payment["invoice_payload"]
        kind, user_id_str = payload.split(":")
        user_id = int(user_id_str)
        if kind == "subscription":
            activate_subscription(user_id, days=30)
        elif kind == "premium":
            grant_premium_topics(user_id)
        return {"ok": True}

    # Текстовые сообщения в личке: админ-команды, /myid, а на всё остальное (/start, "привет") —
    # приветствие и кнопка, которая открывает Mini App.
    chat = message.get("chat", {})
    text = (message.get("text") or "").strip()
    sender = message.get("from") or {}
    if chat.get("type") == "private" and chat.get("id") and text:
        command = text.split()[0].split("@")[0].lower()
        if sender.get("id") and sender.get("username"):
            try:
                refresh_username(sender["id"], sender["username"])
            except Exception:
                logger.exception("refresh_username error")
        if command == "/myid":
            await _send_message(chat["id"], f"Твой Telegram ID: {sender.get('id')}")
        elif command in ADMIN_COMMANDS and sender.get("id") in ADMIN_IDS:
            await _handle_admin_command(chat["id"], command, text)
        else:
            await _reply_with_app_button(chat["id"], text)

    return {"ok": True}


def _app_button(start_arg: str) -> dict:
    if MINI_APP_URL:
        return {"text": "🧠 Открыть Нейроныч", "web_app": {"url": MINI_APP_URL}}
    link = MINI_APP_LINK
    # Реферальный код из /start ref_123 пробрасываем в Mini App.
    if re.fullmatch(r"ref_\d+", start_arg):
        link = f"{MINI_APP_LINK}?startapp={start_arg}"
    return {"text": "🧠 Открыть Нейроныч", "url": link}


def _keyboard(start_arg: str) -> list:
    rows = [[_app_button(start_arg)]]
    if OFFER_URL:
        rows.append([{"text": "📄 Оферта, оплата и возврат", "url": OFFER_URL}])
    return rows


async def _reply_with_app_button(chat_id: int, text: str):
    if text.startswith("/start"):
        parts = text.split(maxsplit=1)
        start_arg = parts[1] if len(parts) > 1 else ""
        reply = START_TEXT
    else:
        start_arg = ""
        reply = OTHER_TEXT

    await _send_message(chat_id, reply, _keyboard(start_arg))


async def _send_message(chat_id: int, text: str, keyboard: list | None = None) -> bool:
    body: dict = {"chat_id": chat_id, "text": text}
    if keyboard:
        body["reply_markup"] = {"inline_keyboard": keyboard}
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(f"https://api.telegram.org/bot{BOT_TOKEN}/sendMessage", json=body)
        if resp.json().get("ok"):
            return True
        logger.warning("sendMessage failed: %s", resp.text)
    except Exception:
        # Telegram-у всё равно отвечаем 200, иначе он будет присылать это сообщение повторно.
        logger.exception("sendMessage error")
    return False


# ===== Админ-команды: бесплатная выдача подписки и премиум-тем =====

ADMIN_COMMANDS = {"/admin", "/grant", "/grant_premium", "/user"}

ADMIN_HELP = (
    "Админ-команды:\n\n"
    "/grant @username 30 — выдать подписку на 30 дней (дни прибавляются к остатку)\n"
    "/grant_premium @username — выдать премиум-темы\n"
    "/user @username — посмотреть подписку пользователя\n\n"
    "Вместо @username можно указать Telegram ID. Человек должен хотя бы раз открыть Нейроныч."
)


def _days_word(n: int) -> str:
    if n % 10 == 1 and n % 100 != 11:
        return "день"
    if n % 10 in (2, 3, 4) and n % 100 not in (12, 13, 14):
        return "дня"
    return "дней"


def _fmt_date(dt) -> str:
    # В базе время в UTC — показываем дату по Москве
    return (dt + timedelta(hours=3)).strftime("%d.%m.%Y") if dt else "—"


async def _handle_admin_command(chat_id: int, command: str, text: str):
    args = text.split()[1:]
    if command == "/admin" or not args:
        await _send_message(chat_id, ADMIN_HELP)
        return

    try:
        user = find_user(args[0])
    except Exception:
        logger.exception("find_user error")
        await _send_message(chat_id, "⚠️ Ошибка базы данных, попробуй ещё раз.")
        return
    if not user:
        await _send_message(
            chat_id,
            f"Не нашёл пользователя {args[0]}. Он должен хотя бы раз открыть Нейроныч. "
            "Если он менял username, попроси его написать боту /myid и укажи ID.",
        )
        return

    uid = user["user_id"]
    who = f"@{user['username']}" if user.get("username") else f"ID {uid}"
    app_kb = [[_app_button("")]]

    try:
        if command == "/grant":
            if len(args) < 2 or not args[1].isdigit() or not 1 <= int(args[1]) <= 3650:
                await _send_message(chat_id, "Укажи число дней от 1 до 3650, например: /grant @username 30")
                return
            days = int(args[1])
            activate_subscription(uid, days=days)
            until = _fmt_date(get_subscription_expiry(uid))
            await _send_message(chat_id, f"✅ {who}: подписка +{days} {_days_word(days)}, действует до {until}.")
            gift = f"🎁 Тебе подарили подписку на {days} {_days_word(days)}! Она действует до {until}. Приятных тренировок 🧠"
            if not await _send_message(uid, gift, app_kb):
                await _send_message(chat_id, "ℹ️ Подписка выдана, но уведомить человека не получилось: скорее всего, он ни разу не писал боту.")

        elif command == "/grant_premium":
            if user.get("owns_premium_topics"):
                await _send_message(chat_id, f"У {who} премиум-темы уже есть.")
                return
            grant_premium_topics(uid)
            expiry = get_subscription_expiry(uid)
            note = "" if expiry and expiry > datetime.utcnow() else "\n⚠️ Подписки у него сейчас нет, а премиум-темы работают только при активной подписке."
            await _send_message(chat_id, f"✅ {who}: премиум-темы выданы.{note}")
            gift = "🎁 Тебе подарили премиум-темы «Матрицы» и «Скорочтение»! Они открыты навсегда при активной подписке."
            if not await _send_message(uid, gift, app_kb):
                await _send_message(chat_id, "ℹ️ Премиум выдан, но уведомить человека не получилось: скорее всего, он ни разу не писал боту.")

        elif command == "/user":
            expiry = user.get("subscription_expires_at")
            sub = f"до {_fmt_date(expiry)}" if expiry and expiry > datetime.utcnow() else "нет"
            premium = "есть" if user.get("owns_premium_topics") else "нет"
            await _send_message(chat_id, f"{who} (ID {uid})\nПодписка: {sub}\nПремиум-темы: {premium}")
    except Exception:
        logger.exception("admin command error")
        await _send_message(chat_id, "⚠️ Ошибка базы данных, попробуй ещё раз.")



# ===== Робокасса =====

@app.post("/api/pay/robokassa/subscription")
async def create_robokassa_subscription(payload: PaySubscribeRequest):
    return _create_robokassa_link(payload.user_id, "subscription", SUBSCRIPTION_RUB, "Подписка Нейроныч на 30 дней")


@app.post("/api/pay/robokassa/premium")
async def create_robokassa_premium(payload: PayPremiumRequest):
    return _create_robokassa_link(payload.user_id, "premium", PREMIUM_RUB, "Премиум-темы Нейроныч")


def _create_robokassa_link(user_id: int, kind: str, amount: int, description: str):
    inv_id = create_payment_invoice(user_id, kind, amount)
    out_sum = f"{amount:.2f}"
    signature = hashlib.md5(
        f"{ROBOKASSA_LOGIN}:{out_sum}:{inv_id}:{ROBOKASSA_PASSWORD1}".encode()
    ).hexdigest()
    pay_url = (
        f"https://auth.robokassa.ru/Merchant/Index.aspx"
        f"?MerchantLogin={ROBOKASSA_LOGIN}&OutSum={out_sum}&InvId={inv_id}"
        f"&Description={quote(description)}&SignatureValue={signature}"
    )
    if ROBOKASSA_TEST:
        pay_url += "&IsTest=1"
    return {"pay_url": pay_url}


@app.post("/api/pay/robokassa/result", response_class=PlainTextResponse)
async def robokassa_result(request: Request):
    form = await request.form()
    out_sum = form.get("OutSum", "")
    inv_id = form.get("InvId", "")
    signature = form.get("SignatureValue", "")

    check = hashlib.md5(f"{out_sum}:{inv_id}:{ROBOKASSA_PASSWORD2}".encode()).hexdigest()
    if check.lower() != signature.lower():
        logger.warning("Robokassa result: BAD SIGN for InvId=%s OutSum=%s — проверь ROBOKASSA_PASSWORD2", inv_id, out_sum)
        return "bad sign"

    invoice = get_invoice(int(inv_id))
    if not invoice or invoice["credited"]:
        return f"OK{inv_id}"

    if invoice["kind"] == "subscription":
        activate_subscription(invoice["user_id"], days=30)
    elif invoice["kind"] == "premium":
        grant_premium_topics(invoice["user_id"])

    mark_invoice_credited(int(inv_id))
    logger.info("Robokassa result: оплата InvId=%s (%s) зачислена пользователю %s", inv_id, invoice["kind"], invoice["user_id"])
    return f"OK{inv_id}"