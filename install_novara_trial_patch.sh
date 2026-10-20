#!/usr/bin/env bash
set -Eeuo pipefail
cd /opt/novara-access
FILE=/opt/novara-access/bot.py
BACKUP="${FILE}.backup-$(date -u +%Y%m%dT%H%M%SZ)"
test -f "$FILE" || { echo "ERROR: $FILE not found"; exit 1; }
cp -a "$FILE" "$BACKUP"
echo "Backup created: $BACKUP"
python3 - <<'PY'
from pathlib import Path
path = Path('/opt/novara-access/bot.py')
s = path.read_text()

def replace_once(old, new, label):
    global s
    n = s.count(old)
    if n != 1:
        raise RuntimeError(f'{label}: expected exactly one match, got {n}; live file not written')
    s = s.replace(old, new, 1)

replace_once('''        conn.commit()
    logging.info("NOVARA_DATABASE_READY")''', '''        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS trial_users (
                user_id INTEGER PRIMARY KEY,
                username TEXT,
                invite_link TEXT UNIQUE NOT NULL,
                status TEXT NOT NULL DEFAULT 'INVITED',
                invited_at TEXT NOT NULL,
                started_at TEXT,
                expires_at TEXT
            )
            """
        )
        conn.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_trial_status_expiry
            ON trial_users(status, expires_at)
            """
        )
        conn.commit()
    logging.info("NOVARA_DATABASE_READY")''', 'trial database table')

replace_once('''            [
                InlineKeyboardButton(
                    text="💎 VIP Membership",
                    callback_data="vip",
                )
            ],''', '''            [
                InlineKeyboardButton(
                    text="🎁 Start 24-Hour VIP Trial",
                    callback_data="trial",
                )
            ],
            [
                InlineKeyboardButton(
                    text="💎 VIP Membership",
                    callback_data="vip",
                )
            ],''', 'trial menu button')

trial_code = r'''# =========================================================
# ONE-TIME 24-HOUR VIP TRIAL
# =========================================================
def has_active_paid_subscription(user_id: int) -> bool:
    now_iso = datetime.now(timezone.utc).isoformat()
    with sqlite3.connect(DATABASE_PATH, timeout=30) as conn:
        row = conn.execute(
            """
            SELECT 1 FROM subscriptions
            WHERE user_id = ? AND status = 'ACTIVE' AND expires_at > ?
            LIMIT 1
            """,
            (user_id, now_iso),
        ).fetchone()
    return row is not None


async def revoke_vip_access(user_id: int):
    await bot.ban_chat_member(chat_id=VIP_CHANNEL_ID, user_id=user_id)
    await bot.unban_chat_member(
        chat_id=VIP_CHANNEL_ID, user_id=user_id, only_if_banned=True
    )


@dp.callback_query(F.data == "trial")
async def trial_handler(callback: CallbackQuery):
    user = callback.from_user
    now_iso = datetime.now(timezone.utc).isoformat()
    try:
        with sqlite3.connect(DATABASE_PATH, timeout=30) as conn:
            conn.row_factory = sqlite3.Row
            existing = conn.execute(
                "SELECT * FROM trial_users WHERE user_id = ?", (user.id,)
            ).fetchone()
        if existing:
            if existing["status"] == "INVITED" and existing["invite_link"]:
                await callback.message.answer(
                    "🎁 <b>Your VIP trial invitation is ready.</b>\n\n"
                    "Your 24 hours start when you join the VIP channel:\n\n"
                    f"<a href=\"{existing['invite_link']}\">Join NOVARA VIP</a>"
                )
                await callback.answer()
                return
            await callback.answer(
                "The free trial is limited to one use per account.", show_alert=True
            )
            return

        if has_active_paid_subscription(user.id):
            await callback.answer(
                "You already have an active paid subscription.", show_alert=True
            )
            return

        invite = await bot.create_chat_invite_link(
            chat_id=VIP_CHANNEL_ID,
            name=f"NOVARA-TRIAL-{user.id}",
            member_limit=1,
        )
        try:
            with sqlite3.connect(DATABASE_PATH, timeout=30) as conn:
                conn.execute(
                    """
                    INSERT INTO trial_users
                        (user_id, username, invite_link, status, invited_at)
                    VALUES (?, ?, ?, 'INVITED', ?)
                    """,
                    (user.id, user.username or "", invite.invite_link, now_iso),
                )
                conn.commit()
        except sqlite3.IntegrityError:
            await callback.answer(
                "A trial has already been issued for this account.", show_alert=True
            )
            return

        await callback.message.answer(
            "🎁 <b>NOVARA — 24-HOUR VIP TRIAL</b>\n\n"
            "Your one-time invitation is ready.\n"
            "⏱️ The 24-hour period starts only when you join the VIP channel.\n"
            "🔒 Access is automatically removed when the trial ends.\n"
            "💎 If you purchase an active subscription, your paid access is preserved.\n\n"
            f"<a href=\"{invite.invite_link}\">Join NOVARA VIP</a>\n\n"
            "⚠️ This trial can be used only once per Telegram account."
        )
        logging.info("NOVARA_TRIAL_INVITED | user_id=%s", user.id)
        await callback.answer()
    except Exception:
        logging.exception("NOVARA_TRIAL_CREATE_FAILED | user_id=%s", user.id)
        await callback.answer(
            "Could not create a trial invitation. Please contact support.",
            show_alert=True,
        )


@dp.chat_member()
async def track_trial_join(event):
    if event.chat.id != VIP_CHANNEL_ID:
        return
    if getattr(event.new_chat_member, "status", "") not in (
        "member", "administrator", "creator"
    ):
        return
    used_link_obj = getattr(event, "invite_link", None)
    used_link = getattr(used_link_obj, "invite_link", None) if used_link_obj else None
    if not used_link:
        return
    user_id = event.new_chat_member.user.id
    now = datetime.now(timezone.utc)
    now_iso = now.isoformat()
    expires_iso = (now + timedelta(hours=24)).isoformat()
    try:
        with sqlite3.connect(DATABASE_PATH, timeout=30) as conn:
            conn.row_factory = sqlite3.Row
            row = conn.execute(
                "SELECT status FROM trial_users WHERE user_id = ? AND invite_link = ?",
                (user_id, used_link),
            ).fetchone()
            if not row or row["status"] != "INVITED":
                return
            if has_active_paid_subscription(user_id):
                conn.execute(
                    "UPDATE trial_users SET status = 'CONVERTED' WHERE user_id = ? AND status = 'INVITED'",
                    (user_id,),
                )
                conn.commit()
                return
            conn.execute(
                """
                UPDATE trial_users SET status = 'ACTIVE', started_at = ?, expires_at = ?
                WHERE user_id = ? AND status = 'INVITED'
                """,
                (now_iso, expires_iso, user_id),
            )
            conn.commit()
        await bot.send_message(
            user_id,
            "✅ <b>Your NOVARA VIP trial has started!</b>\n\n"
            "⏱️ Access expires 24 hours after your join time.\n"
            f"🕒 Expiry: {datetime.fromisoformat(expires_iso).strftime('%Y-%m-%d %H:%M UTC')}\n"
            "Purchase a subscription before expiry to keep VIP access.",
        )
        logging.info("NOVARA_TRIAL_STARTED | user_id=%s | expires_at=%s", user_id, expires_iso)
    except Exception:
        logging.exception("NOVARA_TRIAL_JOIN_TRACKING_FAILED | user_id=%s", user_id)


async def trial_expiry_worker():
    while True:
        try:
            now_iso = datetime.now(timezone.utc).isoformat()
            with sqlite3.connect(DATABASE_PATH, timeout=30) as conn:
                conn.row_factory = sqlite3.Row
                expired_trials = conn.execute(
                    """
                    SELECT user_id FROM trial_users
                    WHERE status = 'ACTIVE' AND expires_at IS NOT NULL AND expires_at <= ?
                    """,
                    (now_iso,),
                ).fetchall()
            for item in expired_trials:
                user_id = item["user_id"]
                try:
                    if has_active_paid_subscription(user_id):
                        with sqlite3.connect(DATABASE_PATH, timeout=30) as conn:
                            conn.execute(
                                "UPDATE trial_users SET status = 'CONVERTED' WHERE user_id = ? AND status = 'ACTIVE'",
                                (user_id,),
                            )
                            conn.commit()
                        logging.info("NOVARA_TRIAL_CONVERTED | user_id=%s", user_id)
                        continue
                    await revoke_vip_access(user_id)
                    with sqlite3.connect(DATABASE_PATH, timeout=30) as conn:
                        conn.execute(
                            "UPDATE trial_users SET status = 'EXPIRED' WHERE user_id = ? AND status = 'ACTIVE' AND expires_at <= ?",
                            (user_id, datetime.now(timezone.utc).isoformat()),
                        )
                        conn.commit()
                    logging.info("NOVARA_TRIAL_EXPIRED | user_id=%s", user_id)
                except TelegramAPIError:
                    logging.exception("NOVARA_TRIAL_REVOKE_FAILED | user_id=%s", user_id)
                except Exception:
                    logging.exception("NOVARA_TRIAL_EXPIRY_ERROR | user_id=%s", user_id)
        except Exception:
            logging.exception("NOVARA_TRIAL_WORKER_ERROR")
        await asyncio.sleep(60)

'''
replace_once('''# =========================================================
# VIP CHANNEL DETECTION
# =========================================================''', trial_code + '''# =========================================================
# VIP CHANNEL DETECTION
# =========================================================''', 'trial handlers insertion')

replace_once('''                    await bot.ban_chat_member(
                        chat_id=VIP_CHANNEL_ID,
                        user_id=user_id,
                    )
                    await bot.unban_chat_member(
                        chat_id=VIP_CHANNEL_ID,
                        user_id=user_id,
                        only_if_banned=True,
                    )
                    now_iso = datetime.now(timezone.utc).isoformat()''', '''                    with sqlite3.connect(DATABASE_PATH, timeout=30) as conn:
                        active_trial = conn.execute(
                            """
                            SELECT 1 FROM trial_users
                            WHERE user_id = ? AND status = 'ACTIVE' AND expires_at > ?
                            LIMIT 1
                            """,
                            (user_id, datetime.now(timezone.utc).isoformat()),
                        ).fetchone()
                    if not active_trial:
                        await revoke_vip_access(user_id)
                    now_iso = datetime.now(timezone.utc).isoformat()''', 'paid expiry respects active trial')

replace_once('''async def main():
    init_database()
    logging.info("NOVARA_BOT_STARTING")
    try:
        await dp.start_polling(bot)
    finally:
        await bot.session.close()''', '''async def main():
    init_database()
    logging.info("NOVARA_BOT_STARTING")
    subscription_task = asyncio.create_task(subscription_expiry_worker())
    trial_task = asyncio.create_task(trial_expiry_worker())
    try:
        await dp.start_polling(bot)
    finally:
        for task in (subscription_task, trial_task):
            task.cancel()
        await asyncio.gather(subscription_task, trial_task, return_exceptions=True)
        await bot.session.close()''', 'start expiry workers')

for required in (
    'CREATE TABLE IF NOT EXISTS trial_users',
    'text="🎁 Start 24-Hour VIP Trial"',
    '@dp.callback_query(F.data == "trial")',
    '@dp.chat_member()',
    'async def trial_expiry_worker()',
    'subscription_task = asyncio.create_task(subscription_expiry_worker())',
):
    if required not in s:
        raise RuntimeError(f'Validation failed: missing {required}')
compile(s, str(path), 'exec')
path.write_text(s)
print('PATCH_APPLIED')
print('Python syntax validation: PASS')
PY

/opt/novara-access/venv/bin/python -m py_compile "$FILE"
echo
echo "Patch and syntax check completed. Backup: $BACKUP"
echo "Before restart, verify the bot is admin in the VIP channel with invite and ban/unban permissions."
