import os
import logging
import asyncio
import sqlite3
import secrets

from datetime import datetime, timezone, timedelta

from aiogram import Bot, Dispatcher, F
from aiogram.filters import CommandStart, Command
from aiogram.types import (
    Message,
    InlineKeyboardMarkup,
    InlineKeyboardButton,
    CallbackQuery,
)
from aiogram.client.default import DefaultBotProperties
from aiogram.enums import ParseMode
from aiogram.exceptions import TelegramAPIError


# =========================================================
# LOGGING
# =========================================================

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(message)s",
)


# =========================================================
# CONFIGURATION
# =========================================================

BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")
VIP_CHANNEL_ID = os.getenv("VIP_CHANNEL_ID")
ADMIN_TELEGRAM_ID = os.getenv("ADMIN_TELEGRAM_ID")

PUBLIC_CHANNEL = "https://t.me/NovaraSignalsHQ"

PAYMENT_NETWORK = "Arbitrum One"
PAYMENT_TOKEN = "USDT"

PAYMENT_WALLET = (
    "0x7cf02544f66c258ea669bcd89e64bcbd11452b7d"
)

DATABASE_PATH = os.getenv(
    "DATABASE_PATH",
    "novara_orders.db",
)


# =========================================================
# SUBSCRIPTION PLANS
# =========================================================

PLANS = {
    "30": {
        "name": "Starter",
        "days": 30,
        "amount": "30",
    },
    "90": {
        "name": "Pro",
        "days": 90,
        "amount": "75",
    },
    "180": {
        "name": "Elite",
        "days": 180,
        "amount": "135",
    },
}


# =========================================================
# VALIDATE ENVIRONMENT
# =========================================================

if not BOT_TOKEN:
    raise RuntimeError(
        "TELEGRAM_BOT_TOKEN is not configured"
    )

if not VIP_CHANNEL_ID:
    raise RuntimeError(
        "VIP_CHANNEL_ID is not configured"
    )

if not ADMIN_TELEGRAM_ID:
    raise RuntimeError(
        "ADMIN_TELEGRAM_ID is not configured"
    )

VIP_CHANNEL_ID = int(VIP_CHANNEL_ID)
ADMIN_TELEGRAM_ID = int(ADMIN_TELEGRAM_ID)


# =========================================================
# BOT INITIALIZATION
# =========================================================

bot = Bot(
    token=BOT_TOKEN,
    default=DefaultBotProperties(
        parse_mode=ParseMode.HTML
    ),
)

dp = Dispatcher()


# =========================================================
# DATABASE
# =========================================================

def init_database():
    with sqlite3.connect(DATABASE_PATH) as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS orders (
                order_id TEXT PRIMARY KEY,
                user_id INTEGER NOT NULL,
                username TEXT,
                plan_key TEXT NOT NULL,
                plan_name TEXT NOT NULL,
                duration_days INTEGER NOT NULL,
                amount_usdt TEXT NOT NULL,
                network TEXT NOT NULL,
                payment_wallet TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'PENDING',
                created_at TEXT NOT NULL
            )
            """
        )

        conn.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_orders_user_id
            ON orders(user_id)
            """
        )

        conn.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_orders_status
            ON orders(status)
            """
        )

        conn.commit()

    logging.info("NOVARA_DATABASE_READY")


def create_order(
    user_id: int,
    username: str,
    plan_key: str,
) -> dict:
    plan = PLANS[plan_key]

    order_id = (
        "NV-"
        + datetime.now(timezone.utc).strftime("%Y%m%d")
        + "-"
        + secrets.token_hex(4).upper()
    )

    created_at = datetime.now(
        timezone.utc
    ).isoformat()

    with sqlite3.connect(DATABASE_PATH) as conn:
        conn.execute(
            """
            INSERT INTO orders (
                order_id,
                user_id,
                username,
                plan_key,
                plan_name,
                duration_days,
                amount_usdt,
                network,
                payment_wallet,
                status,
                created_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                order_id,
                user_id,
                username,
                plan_key,
                plan["name"],
                plan["days"],
                plan["amount"],
                PAYMENT_NETWORK,
                PAYMENT_WALLET,
                "PENDING",
                created_at,
            ),
        )

        conn.commit()

    return {
        "order_id": order_id,
        "plan": plan,
        "created_at": created_at,
    }


def get_user_orders(user_id: int, limit: int = 5):
    with sqlite3.connect(DATABASE_PATH) as conn:
        conn.row_factory = sqlite3.Row

        rows = conn.execute(
            """
            SELECT
                order_id,
                plan_name,
                duration_days,
                amount_usdt,
                status,
                created_at
            FROM orders
            WHERE user_id = ?
            ORDER BY created_at DESC
            LIMIT ?
            """,
            (user_id, limit),
        ).fetchall()

    return [dict(row) for row in rows]


def get_pending_orders(limit: int = 10):
    with sqlite3.connect(DATABASE_PATH) as conn:
        conn.row_factory = sqlite3.Row

        rows = conn.execute(
            """
            SELECT
                order_id,
                user_id,
                username,
                plan_name,
                amount_usdt,
                created_at
            FROM orders
            WHERE status = 'PENDING'
            ORDER BY created_at DESC
            LIMIT ?
            """,
            (limit,),
        ).fetchall()

    return [dict(row) for row in rows]


# =========================================================
# KEYBOARDS
# =========================================================

def main_menu():
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text="📡 Free Signals",
                    url=PUBLIC_CHANNEL,
                )
            ],
            [
                InlineKeyboardButton(
                    text="💎 VIP Membership",
                    callback_data="vip",
                )
            ],
            [
                InlineKeyboardButton(
                    text="💳 Subscription Plans",
                    callback_data="plans",
                )
            ],
            [
                InlineKeyboardButton(
                    text="🔎 Verify Payment",
                    callback_data="verify",
                )
            ],
            [
                InlineKeyboardButton(
                    text="👤 My Subscription",
                    callback_data="subscription",
                )
            ],
            [
                InlineKeyboardButton(
                    text="🆘 Support",
                    callback_data="support",
                )
            ],
        ]
    )


def plans_keyboard():
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text="🥉 Starter — 30 Days | 30 USDT",
                    callback_data="plan_30",
                )
            ],
            [
                InlineKeyboardButton(
                    text="🥈 Pro — 90 Days | 75 USDT",
                    callback_data="plan_90",
                )
            ],
            [
                InlineKeyboardButton(
                    text="🥇 Elite — 180 Days | 135 USDT",
                    callback_data="plan_180",
                )
            ],
            [
                InlineKeyboardButton(
                    text="⬅️ Main Menu",
                    callback_data="main_menu",
                )
            ],
        ]
    )


# =========================================================
# /START
# =========================================================

@dp.message(CommandStart())
async def start_handler(message: Message):
    await message.answer(
        "✨ <b>WELCOME TO NOVARA</b>\n\n"
        "Your gateway to premium trading signals.\n\n"
        "📡 Access free signals\n"
        "💎 Explore VIP membership\n"
        "🔐 Manage your membership\n\n"
        "Choose an option below:",
        reply_markup=main_menu(),
    )


# =========================================================
# /MYID
# =========================================================

@dp.message(Command("myid"))
async def myid_handler(message: Message):
    if not message.from_user:
        return

    await message.answer(
        f"Your Telegram ID: "
        f"<code>{message.from_user.id}</code>"
    )


# =========================================================
# /VIPLINK — ADMIN ONLY
# =========================================================

@dp.message(Command("viplink"))
async def viplink_handler(message: Message):
    if not message.from_user:
        await message.answer(
            "Unable to identify the sender."
        )
        return

    if message.from_user.id != ADMIN_TELEGRAM_ID:
        await message.answer(
            "⛔ You are not authorized to use this command."
        )
        return

    try:
        invite = await bot.create_chat_invite_link(
            chat_id=VIP_CHANNEL_ID,
            name="NOVARA VIP - Admin Generated",
            expire_date=(
                datetime.now(timezone.utc)
                + timedelta(hours=1)
            ),
            member_limit=1,
        )

        await message.answer(
            "✅ <b>VIP INVITE CREATED</b>\n\n"
            f"🔗 <a href=\"{invite.invite_link}\">"
            "Join NOVARA VIP</a>\n\n"
            "⏳ Expires in: 1 hour\n"
            "👤 Maximum uses: 1\n\n"
            "⚠️ This administrative link does not "
            "confirm payment or grant a paid subscription."
        )

    except TelegramAPIError:
        logging.exception(
            "Failed to create VIP invite link"
        )

        await message.answer(
            "❌ Could not create the invite link. "
            "Check that the bot is an administrator "
            "with permission to invite users."
        )


# =========================================================
# /ORDERS — ADMIN ONLY
# =========================================================

@dp.message(Command("orders"))
async def orders_handler(message: Message):
    if not message.from_user:
        return

    if message.from_user.id != ADMIN_TELEGRAM_ID:
        await message.answer(
            "⛔ You are not authorized to use this command."
        )
        return

    try:
        orders = get_pending_orders()

        if not orders:
            await message.answer(
                "📋 <b>PENDING ORDERS</b>\n\n"
                "No pending orders were found."
            )
            return

        lines = [
            "📋 <b>PENDING ORDERS</b>\n"
        ]

        for order in orders:
            username = (
                f"@{order['username']}"
                if order["username"]
                else "No username"
            )

            lines.append(
                f"🧾 <code>{order['order_id']}</code>\n"
                f"👤 User: {order['user_id']}\n"
                f"🔹 Username: {username}\n"
                f"💎 Plan: {order['plan_name']}\n"
                f"💰 Amount: {order['amount_usdt']} USDT\n"
                f"🕒 Created: {order['created_at']}\n"
            )

        await message.answer(
            "\n".join(lines)
        )

    except Exception:
        logging.exception(
            "Failed to retrieve pending orders"
        )

        await message.answer(
            "❌ Could not retrieve orders."
        )


# =========================================================
# VIP MEMBERSHIP
# =========================================================

@dp.callback_query(F.data == "vip")
async def vip_handler(callback: CallbackQuery):
    await callback.message.answer(
        "💎 <b>NOVARA VIP MEMBERSHIP</b>\n\n"
        "Unlock access to our private VIP signals channel.\n\n"
        "Choose a subscription plan to continue.",
        reply_markup=plans_keyboard(),
    )

    await callback.answer()


# =========================================================
# SUBSCRIPTION PLANS
# =========================================================

@dp.callback_query(F.data == "plans")
async def plans_handler(callback: CallbackQuery):
    await callback.message.answer(
        "💳 <b>NOVARA SUBSCRIPTION PLANS</b>\n\n"
        "🥉 <b>Starter</b>\n"
        "30 days — 30 USDT\n\n"
        "🥈 <b>Pro</b>\n"
        "90 days — 75 USDT\n\n"
        "🥇 <b>Elite</b>\n"
        "180 days — 135 USDT\n\n"
        "Select your preferred plan below.",
        reply_markup=plans_keyboard(),
    )

    await callback.answer()


# =========================================================
# CREATE ORDER
# =========================================================

@dp.callback_query(F.data.startswith("plan_"))
async def create_order_handler(
    callback: CallbackQuery,
):
    if not callback.from_user:
        await callback.answer(
            "Unable to identify your account.",
            show_alert=True,
        )
        return

    plan_key = callback.data.replace(
        "plan_",
        "",
        1,
    )

    if plan_key not in PLANS:
        await callback.answer(
            "Invalid subscription plan.",
            show_alert=True,
        )
        return

    user = callback.from_user

    try:
        order = create_order(
            user_id=user.id,
            username=user.username or "",
            plan_key=plan_key,
        )

        plan = order["plan"]

        await callback.message.answer(
            "🧾 <b>NOVARA ORDER CREATED</b>\n\n"
            f"🆔 Order ID:\n"
            f"<code>{order['order_id']}</code>\n\n"
            f"💎 Plan: <b>{plan['name']}</b>\n"
            f"⏳ Duration: <b>{plan['days']} days</b>\n"
            f"💰 Amount: <b>{plan['amount']} USDT</b>\n\n"
            f"🌐 Network: <b>{PAYMENT_NETWORK}</b>\n"
            f"🪙 Token: <b>{PAYMENT_TOKEN}</b>\n\n"
            "👛 <b>Payment Wallet</b>\n"
            f"<code>{PAYMENT_WALLET}</code>\n\n"
            "⚠️ <b>IMPORTANT</b>\n"
            "This order is currently <b>PENDING</b>.\n\n"
            "Payment verification is not enabled yet. "
            "Do not treat this order as paid until "
            "the transaction has been independently verified.\n\n"
            "🔐 Always select the Arbitrum One network "
            "when sending funds."
        )

        logging.info(
            "NOVARA_ORDER_CREATED | order_id=%s | "
            "user_id=%s | plan=%s | amount=%s",
            order["order_id"],
            user.id,
            plan_key,
            plan["amount"],
        )

        await callback.answer(
            "Your order has been created."
        )

    except Exception:
        logging.exception(
            "Failed to create order for user %s",
            user.id,
        )

        await callback.answer(
            "Could not create your order. Please try again.",
            show_alert=True,
        )


# =========================================================
# VERIFY PAYMENT — NOT IMPLEMENTED YET
# =========================================================

@dp.callback_query(F.data == "verify")
async def verify_handler(callback: CallbackQuery):
    await callback.message.answer(
        "🔎 <b>PAYMENT VERIFICATION</b>\n\n"
        "Automated on-chain verification is not enabled yet.\n\n"
        "Your order will remain PENDING until "
        "a secure verification system is implemented.\n\n"
        "Please do not submit another payment "
        "just because verification is unavailable."
    )

    await callback.answer()


# =========================================================
# MY SUBSCRIPTION
# =========================================================

@dp.callback_query(F.data == "subscription")
async def subscription_handler(
    callback: CallbackQuery,
):
    user_id = callback.from_user.id

    try:
        orders = get_user_orders(user_id)

        if not orders:
            await callback.message.answer(
                "👤 <b>MY SUBSCRIPTION</b>\n\n"
                "No orders were found for your account."
            )

        else:
            lines = [
                "👤 <b>MY ORDERS</b>\n"
            ]

            for order in orders:
                lines.append(
                    f"🧾 <code>{order['order_id']}</code>\n"
                    f"💎 Plan: {order['plan_name']}\n"
                    f"⏳ Duration: "
                    f"{order['duration_days']} days\n"
                    f"💰 Amount: {order['amount_usdt']} USDT\n"
                    f"📌 Status: <b>{order['status']}</b>\n"
                )

            lines.append(
                "ℹ️ A pending order is not an active subscription."
            )

            await callback.message.answer(
                "\n".join(lines)
            )

    except Exception:
        logging.exception(
            "Failed to retrieve user orders"
        )

        await callback.message.answer(
            "❌ Could not retrieve your orders."
        )

    await callback.answer()


# =========================================================
# SUPPORT
# =========================================================

@dp.callback_query(F.data == "support")
async def support_handler(
    callback: CallbackQuery,
):
    await callback.message.answer(
        "🆘 <b>NOVARA SUPPORT</b>\n\n"
        "For support, please contact the administrator."
    )

    await callback.answer()


# =========================================================
# MAIN MENU CALLBACK
# =========================================================

@dp.callback_query(F.data == "main_menu")
async def main_menu_handler(
    callback: CallbackQuery,
):
    await callback.message.answer(
        "✨ <b>NOVARA ACCESS</b>\n\n"
        "Choose an option below:",
        reply_markup=main_menu(),
    )

    await callback.answer()


# =========================================================
# VIP CHANNEL DETECTION
# =========================================================

@dp.channel_post()
async def detect_channel_id(message: Message):
    logging.info(
        "NOVARA_CHANNEL_DETECTED | "
        "chat_id=%s | title=%s",
        message.chat.id,
        message.chat.title,
    )


# =========================================================
# STARTUP
# =========================================================

async def main():
    init_database()

    logging.info("NOVARA_BOT_STARTING")

    try:
        await dp.start_polling(bot)

    finally:
        await bot.session.close()


if __name__ == "__main__":
    asyncio.run(main())
