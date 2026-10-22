# NOVARA SMART MONEY AI V1.0.0

نسخه مستقل و read-only برای تحلیل بازار فیوچرز Hyperliquid؛ این نسخه ۲۸ کیف پول را نمی‌خواند و سفارش ثبت نمی‌کند.

## الگوهای ورود
1. Liquidity Sweep + Reclaim
2. Breakout + Retest
3. Trend Pullback + Continuation

## داده‌ها و تحلیل‌ها
- بازارهای پرپچوال واجد شرایط بر اساس حجم ۲۴ ساعته؛ سقف پیش‌فرض ۳۰۰ بازار نقدشونده، نه فهرست ثابت ۱۰ یا ۲۸ ارز.
- کندل‌های بسته‌شده 15m و 1h، ساختار قیمت، پیوت‌ها، حمایت/مقاومت، EMA20/EMA50، ATR، حجم نسبی و VWAP تقریبی.
- داده‌های Hyperliquid: funding، open interest، L2 order book و recent trades؛ CVD تقریبی از معاملات اخیر و book imbalance.
- فیلتر spread، جلوگیری از chase کردن قیمت دور از VWAP، امتیاز متعادل 5.8/10، حد ضرر بر مبنای ATR/ساختار و هدف اولیه 1.9R.
- paper tracking: سیگنال‌های ارسال‌شده در وضعیت ذخیره‌شده پیگیری می‌شوند و رسیدن mark price به SL/TP ثبت می‌شود.
- هر نماد/جهت/الگو پس از ارسال ۹۰ دقیقه cooldown دارد؛ در هر چرخه حداکثر ۸ سیگنال.
- ارسال VIP بدون سقف روزانه؛ Free به‌طور پیش‌فرض حداکثر ۵ سیگنال در روز.

## نصب
1. فایل `novara_smart_money_ai.mjs` را در ریشه مخزن قرار بده.
2. فایل workflow یعنی `.github/workflows/novara_smart_money_ai.yml` را در همان مسیر قرار بده.
3. فایل را روی branch اصلی (main) commit کن؛ workflow مستقل است و نام/رفتار workflow فعلی `GFTSH 10 Wallet Observer` را تغییر نمی‌دهد.
4. در GitHub Actions یک بار `NOVARA Smart Money AI` را دستی اجرا کن.
5. بررسی کن که `TELEGRAM_TOKEN` (یا `TELEGRAM_BOT_TOKEN`)، `NOVARA_FREE_CHAT_ID` و `NOVARA_VIP_CHAT_ID` به‌درستی در Repository/Environment secrets یا variables موجود باشند.

## تنظیمات پیش‌فرض
- اجرا: هر ۵ دقیقه، به‌علاوه `workflow_dispatch`
- حداقل حجم ۲۴ ساعته: 2,000,000 USD
- سقف بازارهای بررسی‌شده: 300
- حد امتیاز: 5.8/10 (متعادل؛ این امتیاز احتمال برد نیست)
- حداقل R:R: 1.65
- حداکثر spread قابل‌قبول: 0.25%
- حداکثر سیگنال در هر چرخه: 8

## محدودیت‌های آگاهانه
- هیچ منبع داده‌ای نرخ برد 70–80٪ را تضمین نمی‌کند.
- CVD از recent trades و OI change بین دو اسکن، تخمینی/نقطه‌ای است؛ داده تاریخی دقیق OI و نقشه لیکوییدیشن چندصرافی در این نسخه از API پولی CoinGlass وابسته نیست.
- paper outcomeها بر اساس mark price هنگام اسکن ارزیابی می‌شوند؛ اگر قیمت بین دو اسکن هم SL و هم TP را رد کند، مسیر دقیق داخل کندل از این روش مشخص نمی‌شود.
- این نسخه به‌طور پیش‌فرض سفارش نمی‌گذارد و فقط سیگنال/ثبت نتیجه کاغذی تولید می‌کند.
- زمان‌بندی GitHub Actions best-effort است؛ cron هر ۵ دقیقه تعریف شده ولی زمان‌بندی عمومی GitHub تضمین ثانیه‌ای ندارد.

## بررسی پس از چند روز
در لاگ Actions برای هر چرخه این‌ها را بررسی کن: `markets`, `checked`, `dataErrors`, `candidates`, `selected`, `sent`, `deliveryErrors`, `paperOpen`, `paperClosed`, `paperWinRate`, `paperNetR`.
اول از همه خطاهای ارسال تلگرام را بررسی کن؛ اگر token/chat ID تنظیم نشده باشد، هیچ سیگنالی به کانال نمی‌رسد.


### تنظیم ارسال تلگرام

این نسخه فقط پیام‌های سیگنال را به کانال‌ها ارسال می‌کند. پیام وضعیت `NOVARA SMART MONEY AI / WATCHING` به تلگرام ارسال نمی‌شود؛ گزارش چرخه و خطاها همچنان در لاگ GitHub Actions قابل مشاهده‌اند.
