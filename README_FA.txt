NOVARA — Complete 24-hour VIP trial fix
========================================

Contents
--------
bot.py: complete replacement for the source file provided in this conversation.

Changes included
----------------
1. A trial invitation is single-use (member_limit=1), but no longer expires 24 hours
   after creation. The 24-hour trial clock starts when the reserved Telegram account
   actually joins the VIP channel.
2. If the user has an INVITED trial reservation and taps the trial button again, the
   bot returns the same invitation rather than blocking the user permanently.
3. A paid subscription is checked again when the invitation is used, preventing the
   trial from starting for a user who bought a paid plan after requesting the link.
4. VIP revocation returns an explicit success/failure result. The expiry worker marks
   a trial EXPIRED only after Telegram confirms ban/unban; failures remain retryable.
5. The expiry worker checks every 60 seconds, preserves active paid subscribers, and
   logs failures without silently marking revocation as successful.
6. Existing menu, order, plans, database tables, and handlers are preserved from the
   supplied source file.

Install into the repository
---------------------------
Replace the repository's existing bot.py with this bot.py and commit the change.
No VPS installer script is included or required for the repository change.

Required runtime configuration
------------------------------
TELEGRAM_BOT_TOKEN, VIP_CHANNEL_ID, and ADMIN_TELEGRAM_ID must remain configured.
The bot must be an administrator of the VIP channel with permission to create invite
links and ban/unban members. Telegram must deliver chat_member updates to the bot.

Validation performed
--------------------
The complete Python source parses successfully with Python's AST parser. Runtime
Telegram behavior still depends on channel permissions, configured environment values,
and the deployed aiogram version. Payment verification is not added by this patch;
only orders explicitly marked PAID count as active paid subscriptions, as in the source.
