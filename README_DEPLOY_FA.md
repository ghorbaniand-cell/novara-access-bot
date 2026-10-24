# NOVARA Smart Money AI — V2.5.0 TradingView Bridge (Read-only / Paper)

## هدف و محدودیت مهم
این بسته اتصال NOVARA به هشدارهای TradingView را اضافه می‌کند، اسکن بازار را تا سقف تنظیم‌شده گسترش می‌دهد و Entry/SL/TP دریافتی از TradingView را فقط وقتی استفاده می‌کند که نماد و جهت با کاندید NOVARA منطبق باشند، هشدار تازه باشد، قیمت ورود بیش از حد از قیمت زنده فاصله نگرفته باشد و R:R/risk معتبر باشد.

**وین‌ریت بالا تضمین‌شدنی نیست.** امتیاز 6/10 احتمال برد نیست. برای سنجش واقعی باید paper tracking را حداقل چند هفته اجرا کرد و کارمزد، لغزش و ابهام کندل‌ها را لحاظ کرد.

## ساختار بسته
- `novara_smart_money_ai.mjs` — ورکر سیگنال/پیگیری Paper؛ همچنان بدون ارسال سفارش.
- `vps/tradingview-webhook.mjs` — دریافت‌کننده امن هشدارهای TradingView.
- `tradingview/NOVARA_Market_Structure_Gate.pine` — اندیکاتور Pine که بعد از بسته‌شدن کندل، ساختار، SL/TP و فیلتر BTC را بررسی می‌کند.
- `systemd/` — سرویس Webhook و تایمر اسکن پنج‌دقیقه‌ای روی VPS.
- `.env.novara.example` — نمونه تنظیمات، بدون هیچ راز واقعی.
- `.github/workflows/novara-smart-money-ai.yml` — فقط اعتبارسنجی دستی؛ برای جلوگیری از اجرای هم‌زمان و تداخل state، اسکن زمان‌بندی‌شده GitHub غیرفعال است. اجرای واقعی روی VPS انجام می‌شود.

## نکته درباره تعداد نمادها و TradingView
NOVARA تمام بازارهای Hyperliquid را که از نظر حجم و وضعیت قابل‌معامله واجد شرایط باشند تا `NOVARA_SMART_MAX_MARKETS` بررسی می‌کند (پیش‌فرض 1000؛ تعداد واقعی به تعداد بازارهای فعال و منابع API بستگی دارد). فیلتر حجم پیش‌فرض 2 میلیون دلار است.

TradingView Webhook به‌خودی‌خود کل بازار را اسکن نمی‌کند. برای دریافت سطوح TradingView باید برای هر نماد هدف در TradingView یک Alert بسازید. در نسخه اولیه، اگر هشدار تازه و منطبق برای همان نماد/جهت موجود باشد، سطوح TradingView استفاده می‌شود. اگر موجود نباشد و `NOVARA_TV_REQUIRE_LEVELS=false` باشد، موتور از سطوح محاسبه‌شده از کندل‌های صرافی استفاده می‌کند و منبع قیمت را در تلگرام مشخص می‌کند. برای اجبار به استفاده از TradingView برای تمام سیگنال‌ها، بعد از ساخت Alertهای کافی `NOVARA_TV_REQUIRE_LEVELS=true` کنید؛ در این حالت تعداد سیگنال‌ها ممکن است به‌شدت کمتر شود.

## نصب روی Ubuntu VPS
1. یک کاربر سرویس اختصاصی بسازید و فایل‌ها را در `/opt/novara` قرار دهید.
2. Node.js 22 یا بالاتر نصب باشد.
3. فایل `.env.novara.example` را به `/etc/novara/novara.env` کپی کنید و مقادیر واقعی را وارد کنید. فایل را فقط برای root و کاربر سرویس قابل‌خواندن نگه دارید (`chmod 640`).
4. یک secret تصادفی طولانی برای `NOVARA_TV_WEBHOOK_SECRET` بسازید؛ نمونه: `openssl rand -hex 32`.
5. مطمئن شوید کاربر `novara` اجازه نوشتن در `/opt/novara/production/state` را دارد.
6. فایل‌های `systemd/*.service` و `systemd/*.timer` را در `/etc/systemd/system/` نصب کنید، سپس:
   - `sudo systemctl daemon-reload`
   - `sudo systemctl enable --now novara-tv-webhook.service`
   - `sudo systemctl enable --now novara-scan.timer`
7. Webhook را پشت HTTPS reverse proxy (مثلاً Nginx + TLS) منتشر کنید. پورت 8787 را مستقیم به اینترنت باز نکنید؛ سرویس به localhost bind شده است.
8. سلامت سرویس را روی خود VPS بررسی کنید: `curl http://127.0.0.1:8787/health`

## تنظیم TradingView
1. فایل `tradingview/NOVARA_Market_Structure_Gate.pine` را در Pine Editor قرار دهید و روی چارت نماد موردنظر اجرا کنید.
2. ابتدا روی تایم‌فریم 15m یا 1h و با منبعی که نماد آن با بازار Hyperliquid قابل‌تطبیق است آزمایش کنید.
3. یک Alert بسازید و شرط `Any alert() function call` را انتخاب کنید.
4. Webhook URL: `https://YOUR_DOMAIN/webhook/YOUR_LONG_RANDOM_SECRET`
5. فقط پس از دریافت پاسخ HTTP 200 در لاگ VPS، آن نماد را به فهرست نمادهای تحت پوشش اضافه‌شده در TradingView حساب کنید.

## کنترل‌های ایمنی
- ورکر سفارش ارسال نمی‌کند و معامله واقعی باز نمی‌کند.
- هشدارهای TradingView قدیمی‌تر از 20 دقیقه یا دارای فاصله ورود بیش از 0.65% رد می‌شوند.
- سطوح باید جهت درست و R:R حداقل 1.8 داشته باشند و ریسک SL از 2.5% بیشتر نباشد.
- فیلتر BTC و فیلتر ساختار NOVARA همچنان فعال‌اند؛ TradingView setup به‌تنهایی تضمین‌کننده ارسال سیگنال نیست.
- قبل از اجبار `NOVARA_TV_REQUIRE_LEVELS=true` باید برای بازارهای موردنظر Alertهای TradingView ساخته و لاگ `[TRADINGVIEW][ACCEPT]` تأیید شود.
- Pine Script در این محیط قابل‌کامپایل رسمی نیست؛ آن را در TradingView Pine Editor اجرا کنید و ابتدا در paper mode نتیجه‌ها را بررسی کنید.

## آزمون و پایش
- `node --check novara_smart_money_ai.mjs`
- `node --check vps/tradingview-webhook.mjs`
- `sudo journalctl -u novara-tv-webhook.service -f`
- `sudo journalctl -u novara-scan.service -f`
- `systemctl list-timers novara-scan.timer`

پس از نصب، قبل از تغییر پارامترها یک دوره paper tracking پایدار اجرا کنید. زیادکردن تعداد سیگنال‌ها لزوماً وین‌ریت را بالا نمی‌برد؛ معیار مناسب، Expectancy خالص برحسب R پس از هزینه‌ها و تعداد نمونه کافی است.
