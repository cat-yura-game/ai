"""Пример интеграции нового сайта с Telegram-ботом на aiogram 3.

Скопируйте нужные функции в проект бота и подставьте способ получения
текущего тарифа/даты окончания из своей базы.
"""

import os
from datetime import datetime

import aiohttp
from aiogram import Router
from aiogram.filters import Command
from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup, Message


router = Router()

WORKER_URL = os.environ["AI_WEB_WORKER_URL"].rstrip("/")
SERVICE_SECRET = os.environ["AI_WEB_SERVICE_SECRET"]
SITE_URL = os.environ["AI_WEB_SITE_URL"]


async def _worker_post(path: str, payload: dict) -> dict:
    headers = {
        "Authorization": f"Bearer {SERVICE_SECRET}",
        "Content-Type": "application/json",
    }
    timeout = aiohttp.ClientTimeout(total=15)
    async with aiohttp.ClientSession(timeout=timeout) as session:
        async with session.post(f"{WORKER_URL}{path}", headers=headers, json=payload) as response:
            data = await response.json(content_type=None)
            if response.status >= 400:
                raise RuntimeError(data.get("error", f"Worker вернул HTTP {response.status}"))
            return data


def subscription_payload(
    telegram_id: int,
    display_name: str,
    plan: str,
    plan_expires_at: datetime | str | None,
) -> dict:
    """plan: free, go, pro или ultra. Для free дата должна быть None."""
    if isinstance(plan_expires_at, datetime):
        plan_expires_at = plan_expires_at.isoformat()
    return {
        "telegram_id": telegram_id,
        "display_name": display_name,
        "plan": plan.lower(),
        "plan_expires_at": plan_expires_at,
    }


async def request_web_login_code(**subscription) -> dict:
    """Создаёт новый одноразовый код на 10 минут."""
    return await _worker_post("/internal/auth/code", subscription)


async def sync_web_subscription(**subscription) -> dict:
    """Вызывайте после любой смены тарифа или даты его окончания."""
    return await _worker_post("/internal/subscription/sync", subscription)


@router.message(Command("web"))
async def web_login(message: Message) -> None:
    # ЗАМЕНИТЕ эти две строки чтением реальной подписки из базы вашего бота.
    current_plan = "free"
    current_plan_expires_at = None

    payload = subscription_payload(
        telegram_id=message.from_user.id,
        display_name=message.from_user.full_name,
        plan=current_plan,
        plan_expires_at=current_plan_expires_at,
    )

    try:
        result = await request_web_login_code(**payload)
    except Exception:
        await message.answer("Не удалось создать код. Попробуйте ещё раз немного позже.")
        return

    code = result["code"]
    keyboard = InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="Открыть веб-нейросеть", url=SITE_URL)],
    ])
    await message.answer(
        "Ваш одноразовый код для входа на сайт:\n\n"
        f"<code>{code}</code>\n\n"
        "Он действует 10 минут и сработает только один раз.",
        reply_markup=keyboard,
        parse_mode="HTML",
    )


async def example_after_purchase(
    telegram_id: int,
    display_name: str,
    plan: str,
    expires_at: datetime,
) -> None:
    """Вызовите аналогичный код сразу после успешной оплаты/продления."""
    payload = subscription_payload(telegram_id, display_name, plan, expires_at)
    await sync_web_subscription(**payload)


async def example_after_expiry(telegram_id: int, display_name: str) -> None:
    """При явном окончании подписки синхронизируйте тариф Free."""
    payload = subscription_payload(telegram_id, display_name, "free", None)
    await sync_web_subscription(**payload)
