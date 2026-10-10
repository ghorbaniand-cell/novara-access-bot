import os
import logging
import asyncio

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

logging.basicConfig(level=logging.INFO)

BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")
VIP_CHANNEL_ID = os.getenv("VIP_CHANNEL_ID")
ADMIN_TELEGRAM_ID = os.getenv("ADMIN_TELEGRAM_ID")

PUBLIC_CHANNEL = "https://t.me/NovaraSignalsHQ"

if not BOT_TOKEN:
    raise RuntimeError("TELEGRAM_BOT_TOKEN is not configured")

if not VIP_CHANNEL_ID:
    raise RuntimeError("VIP_CHANNEL_ID is not configured")

if not ADMIN_TELEGRAM_ID:
    raise RuntimeError("ADMIN_TELEGRAM_ID is not configured")

VIP_CHANNEL_ID = int(VIP_CHANNEL_ID)
ADMIN_TELEGRAM_ID = int(ADMIN_TELEGRAM_ID)

bot = Bot(
    token=BOT_TOKEN,
    default=DefaultBotProperties(parse_mode=ParseMode.HTML),
)

dp = Dispatcher()


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


@dp.message(Command("myid"))
async def myid_handler(message: Message):
    await message.answer(
        f"Your Telegram ID: <code>{message.from_user.id}</code>"
    )


@dp.message(Command("viplink"))
async def viplink_handler(message: Message):
    if not message.from_user:
        await message.answer("Unable to identify the sender.")
        return

    if message.from_user.id != ADMIN_TELEGRAM_ID:
        await message.answer("⛔ You are not authorized to use this command.")
        return

    try:
        invite = await bot.create_chat_invite_link(
            chat_id=VIP_CHANNEL_ID,
            name="NOVARA VIP - Admin Generated",
            expire_date=__import__("datetime").datetime.now(
                __import__("datetime").timezone.utc
            ) + __import__("datetime").timedelta(hours=1),
            member_limit=1,
        )

        await message.answer(
            "✅ <b>VIP INVITE CREATED</b>\n\n"
            f"🔗 <a href=\"{invite.invite_link}\">Join NOVARA VIP</a>\n\n"
            "⏳ Expires in: 1 hour\n"
            "👤 Maximum uses: 1\n\n"
            "⚠️ This link does not confirm payment or grant a paid subscription."
        )

    except TelegramAPIError:
        logging.exception("Failed to create VIP invite link")
        await message.answer(
            "❌ Could not create the invite link. "
            "Check that the bot is an administrator with permission "
            "to invite users to the VIP channel."
        )


@dp.callback_query(F.data == "vip")
async def vip_handler(callback: CallbackQuery):
    await callback.message.answer(
        "💎 <b>NOVARA VIP MEMBERSHIP</b>\n\n"
        "Unlock access to our private VIP signals channel.\n\n"
        "Contact the administrator for membership information."
    )
    await callback.answer()


@dp.callback_query(F.data == "plans")
async def plans_handler(callback: CallbackQuery):
    await callback.message.answer(
        "💳 <b>SUBSCRIPTION PLANS</b>\n\n"
        "Subscription plans will be announced here.\n"
        "Payments are not enabled yet."
    )
    await callback.answer()


@dp.callback_query(F.data == "verify")
async def verify_handler(callback: CallbackQuery):
    await callback.message.answer(
        "🔎 <b>PAYMENT VERIFICATION</b>\n\n"
        "Automated payment verification is not enabled yet."
    )
    await callback.answer()


@dp.callback_query(F.data == "subscription")
async def subscription_handler(callback: CallbackQuery):
    await callback.message.answer(
        "👤 <b>MY SUBSCRIPTION</b>\n\n"
        "Subscription records are not enabled yet."
    )
    await callback.answer()


@dp.callback_query(F.data == "support")
async def support_handler(callback: CallbackQuery):
    await callback.message.answer(
        "🆘 <b>NOVARA SUPPORT</b>\n\n"
        "Support contact details will be added here."
    )
    await callback.answer()


@dp.channel_post()
async def detect_channel_id(message: Message):
    logging.info(
        "NOVARA_CHANNEL_DETECTED | "
        "chat_id=%s | title=%s",
        message.chat.id,
        message.chat.title,
    )


async def main():
    try:
        await dp.start_polling(bot)
    finally:
        await bot.session.close()


if __name__ == "__main__":
    asyncio.run(main())
