from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from database import (
    init_db, seed_tasks_if_empty, add_user_if_not_exists,
    get_random_task, get_task_by_id, save_answer, save_client_answer,
    update_streak, get_user_stats, add_xp, get_leaderboard, get_user_rank
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
CLIENT_TOPICS = {"differences", "speed", "colors", "words"}


@app.on_event("startup")
async def startup():
    init_db()
    seed_tasks_if_empty(TASKS)


class UserInit(BaseModel):
    user_id: int
    username: str | None = None


class AnswerSubmit(BaseModel):
    user_id: int
    task_id: int
    answer: str


class ClientAnswerSubmit(BaseModel):
    user_id: int
    category: str
    is_correct: bool
    xp_value: int = XP_PER_CORRECT_ANSWER


@app.get("/")
async def root():
    return {"status": "ok", "message": "Нейроныч API работает"}


@app.get("/api/ping")
async def ping():
    return {"pong": True}


@app.post("/api/user/init")
async def init_user(payload: UserInit):
    add_user_if_not_exists(payload.user_id, payload.username)
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
    """Для тем, которые генерируются и проверяются в браузере
    (Отличия/Скорость/Цвета/Слова). Клиент сам сообщает, правильно ли ответил —
    подсматривать тут нечего (ответ и так вычисляется на клиенте), но это
    осознанный компромисс: технически результат можно подделать через консоль."""
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