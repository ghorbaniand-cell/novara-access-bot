import os
import logging
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

logging.basicConfig(level=logging.INFO)

BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")

PUBLIC_CHANNEL = "https://t.me/NovaraSignalsHQ"

if not BOT_TOKEN:
    raise RuntimeError("TELEGRAM_BOT_TOKEN is not configured")

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


@dp.channel_post()
async def detect_channel_id(message: Message):
    logging.info(
        "NOVARA_CHANNEL_DETECTED | "
        f"chat_id={message.chat.id} | "
        f"title={message.chat.title}"
    )
@dp.message(CommandStart())
async def start_handler(message: Message):
    text = (
        "✨ <b>WELCOME TO NOVARA</b>\n\n"
        "Your gateway to premium trading signals.\n\n"
        "📡 Access free signals\n"
        "💎 Explore VIP membership\n"
        "💳 View subscription plans\n"
        "🔐 Manage your membership\n\n"
        "Choose an option below:"
    )

    await message.answer(
        text,
        reply_markup=main_menu(),
    )


@dp.message(Command("help"))
async def help_handler(message: Message):
    await message.answer(
        "🆘 <b>NOVARA Support</b>\n\n"
        "Select Support from the main menu "
        "to learn how to contact our team.",
        reply_markup=main_menu(),
    )


@dp.callback_query(F.data == "vip")
async def vip_handler(callback: CallbackQuery):
    await callback.message.answer(
        "💎 <b>NOVARA VIP MEMBERSHIP</b>\n\n"
        "Unlock access to our private VIP signals channel.\n\n"
        "Choose Subscription Plans to view available options."
    )
    await callback.answer()


@dp.callback_query(F.data == "plans")
async def plans_handler(callback: CallbackQuery):
    await callback.message.answer(
        "💳 <b>SUBSCRIPTION PLANS</b>\n\n"
        "Available plans will be announced here.\n\n"
        "⚠️ Payments are not enabled yet. "
        "No payment address or transaction has been configured."
    )
    await callback.answer()


@dp.callback_query(F.data == "verify")
async def verify_handler(callback: CallbackQuery):
    await callback.message.answer(
        "🔎 <b>PAYMENT VERIFICATION</b>\n\n"
        "Automated USDT transaction verification "
        "will be implemented in the next stage.\n\n"
        "Please do not send payment until the official "
        "payment instructions are available."
    )
    await callback.answer()


@dp.callback_query(F.data == "subscription")
async def subscription_handler(callback: CallbackQuery):
    await callback.message.answer(
        "👤 <b>MY SUBSCRIPTION</b>\n\n"
        "Your membership status will appear here "
        "after the subscription database is configured."
    )
    await callback.answer()


@dp.callback_query(F.data == "support")
async def support_handler(callback: CallbackQuery):
    await callback.message.answer(
        "🆘 <b>NOVARA SUPPORT</b>\n\n"
        "Support contact details will be added here."
    )
    await callback.answer()


async def main():
    await dp.start_polling(bot)


if __name__ == "__main__":
    import asyncio
    asyncio.run(main())
