import os
import hashlib
import hmac
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
    create_payment_invoice, get_invoice, mark_invoice_credited
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

BOT_TOKEN = os.environ.get("BOT_TOKEN", "")
CRYPTOBOT_TOKEN = os.environ.get("CRYPTOBOT_TOKEN", "")
ROBOKASSA_LOGIN = os.environ.get("ROBOKASSA_LOGIN", "")
ROBOKASSA_PASSWORD1 = os.environ.get("ROBOKASSA_PASSWORD1", "")
ROBOKASSA_PASSWORD2 = os.environ.get("ROBOKASSA_PASSWORD2", "")
TELEGRAM_WEBHOOK_SECRET = os.environ.get("TELEGRAM_WEBHOOK_SECRET", "")

SUBSCRIPTION_STARS = 100
PREMIUM_STARS = 70


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

    return {"ok": True}


# ===== CryptoBot (крипта) =====

@app.post("/api/pay/crypto/subscription")
async def create_crypto_subscription_invoice(payload: PaySubscribeRequest):
    return await _create_crypto_invoice(payload.user_id, "subscription", 150, "Подписка Нейроныч на 30 дней")


@app.post("/api/pay/crypto/premium")
async def create_crypto_premium_invoice(payload: PayPremiumRequest):
    return await _create_crypto_invoice(payload.user_id, "premium", 100, "Премиум-темы Нейроныч")


async def _create_crypto_invoice(user_id: int, kind: str, amount_rub: int, description: str):
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            "https://pay.crypt.bot/api/createInvoice",
            headers={"Crypto-Pay-API-Token": CRYPTOBOT_TOKEN},
            json={
                "currency_type": "fiat",
                "fiat": "RUB",
                "amount": str(amount_rub),
                "accepted_assets": "USDT,TON,BTC",
                "description": description,
                "payload": f"{kind}:{user_id}",
                "expires_in": 1800,
            },
        )
    data = resp.json()
    if not data.get("ok"):
        raise HTTPException(status_code=400, detail=data.get("error", "CryptoBot error"))
    return {"pay_url": data["result"]["bot_invoice_url"]}


@app.post("/api/pay/crypto/webhook")
async def crypto_webhook(request: Request):
    body = await request.body()
    signature = request.headers.get("crypto-pay-api-signature", "")

    check = hmac.new(
        hashlib.sha256(CRYPTOBOT_TOKEN.encode()).digest(),
        body,
        hashlib.sha256,
    ).hexdigest()
    if not hmac.compare_digest(check, signature):
        raise HTTPException(status_code=403, detail="Invalid signature")

    update = await request.json()
    if update.get("update_type") == "invoice_paid":
        invoice = update["payload"]
        kind, user_id_str = invoice["payload"].split(":")
        user_id = int(user_id_str)
        if kind == "subscription":
            activate_subscription(user_id, days=30)
        elif kind == "premium":
            grant_premium_topics(user_id)

    return {"ok": True}


# ===== Робокасса =====

@app.post("/api/pay/robokassa/subscription")
async def create_robokassa_subscription(payload: PaySubscribeRequest):
    return _create_robokassa_link(payload.user_id, "subscription", 150, "Подписка Нейроныч на 30 дней")


@app.post("/api/pay/robokassa/premium")
async def create_robokassa_premium(payload: PayPremiumRequest):
    return _create_robokassa_link(payload.user_id, "premium", 100, "Премиум-темы Нейроныч")


def _create_robokassa_link(user_id: int, kind: str, amount: int, description: str):
    inv_id = create_payment_invoice(user_id, kind, amount)
    out_sum = f"{amount:.2f}"
    signature = hashlib.md5(
        f"{ROBOKASSA_LOGIN}:{out_sum}:{inv_id}:{ROBOKASSA_PASSWORD1}".encode()
    ).hexdigest()
    pay_url = (
        f"https://auth.robokassa.ru/Merchant/Index.aspx"
        f"?MerchantLogin={ROBOKASSA_LOGIN}&OutSum={out_sum}&InvId={inv_id}"
        f"&Description={description}&SignatureValue={signature}"
    )
    return {"pay_url": pay_url}


@app.post("/api/pay/robokassa/result", response_class=PlainTextResponse)
async def robokassa_result(request: Request):
    form = await request.form()
    out_sum = form.get("OutSum", "")
    inv_id = form.get("InvId", "")
    signature = form.get("SignatureValue", "")

    check = hashlib.md5(f"{out_sum}:{inv_id}:{ROBOKASSA_PASSWORD2}".encode()).hexdigest()
    if check.lower() != signature.lower():
        return "bad sign"

    invoice = get_invoice(int(inv_id))
    if not invoice or invoice["credited"]:
        return f"OK{inv_id}"

    if invoice["kind"] == "subscription":
        activate_subscription(invoice["user_id"], days=30)
    elif invoice["kind"] == "premium":
        grant_premium_topics(invoice["user_id"])

    mark_invoice_credited(int(inv_id))
    return f"OK{inv_id}"