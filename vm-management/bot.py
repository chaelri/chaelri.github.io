import io
import logging
import requests
import qrcode
from PIL import Image, ImageDraw, ImageFont
from telegram import Update
from telegram.ext import ApplicationBuilder, CommandHandler, MessageHandler, filters, ContextTypes

# Enable logging
logging.basicConfig(
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    level=logging.INFO
)

# Configuration
BOT_TOKEN = "8475801439:AAEGVxZImAOBf-wuyxepvr_xOHnsZ28JUsE"
FIREBASE_DB_URL = "https://test-database-55379-default-rtdb.asia-southeast1.firebasedatabase.app"

def fetch_all_volunteers():
    """Fetch all volunteers from Firebase Realtime Database."""
    try:
        resp = requests.get(f"{FIREBASE_DB_URL}/volunteers.json", timeout=10)
        if resp.status_code == 200 and resp.json():
            return resp.json()
    except Exception as e:
        logging.error(f"Error fetching volunteers: {e}")
    return {}

def generate_qr_pass(volunteer_id, volunteer_name):
    """Generate a pass card with a QR Code and volunteer details."""
    qr = qrcode.QRCode(
        version=1,
        error_correction=qrcode.constants.ERROR_CORRECT_H,
        box_size=10,
        border=2,
    )
    qr.add_data(volunteer_id)
    qr.make(fit=True)
    qr_img = qr.make_image(fill_color="black", back_color="white").convert('RGB')

    # Card canvas setup
    card_w, card_h = 500, 650
    card = Image.new('RGB', (card_w, card_h), color='#0a0a0a')  # Dark theme matching monitor UI
    draw = ImageDraw.Draw(card)

    # Header title
    draw.text((card_w // 2, 40), "LIVE PRODUCTION", fill="#ffffff", anchor="mm")
    draw.text((card_w // 2, 70), "Volunteer Checkpoint Pass", fill="#737373", anchor="mm")

    # Paste QR Code in center
    qr_w, qr_h = qr_img.size
    card.paste(qr_img, ((card_w - qr_w) // 2, 110))

    # Volunteer Info
    draw.text((card_w // 2, 530), str(volunteer_name), fill="#ffffff", anchor="mm")
    draw.text((card_w // 2, 570), f"ID: {volunteer_id}", fill="#4ade80", anchor="mm")  # Green ID tag
    draw.text((card_w // 2, 610), "Scan this at the checkpoint camera", fill="#a3a3a3", anchor="mm")

    img_byte_arr = io.BytesIO()
    card.save(img_byte_arr, format='PNG')
    img_byte_arr.seek(0)
    return img_byte_arr

async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    welcome_text = (
        "👋 *Welcome to the Live Production Volunteer Checkpoint Bot\\!*\n\n"
        "To receive your personal QR Check\\-in Pass, please reply with your *Full Name* or *Volunteer ID* \\(e\\.g\\., `V-1001` or `VOL-...`\\)\\."
    )
    await update.message.reply_text(welcome_text, parse_mode="MarkdownV2")

async def handle_lookup(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.message.text.strip()
    if not query:
        return

    query_lower = query.lower()
    await update.message.reply_text("🔍 Searching registered volunteers...")

    volunteers = fetch_all_volunteers()
    matches = []

    query_tokens = query_lower.split()

    for v_id, v_data in volunteers.items():
        if not isinstance(v_data, dict):
            continue
        v_name = str(v_data.get("name", "")).strip()
        v_name_lower = v_name.lower()
        v_id_lower = str(v_id).lower()

        # Token-based match (e.g. "Charles Cayno" matches "Charles Michael Cayno")
        all_tokens_match = len(query_tokens) > 0 and all(token in v_name_lower for token in query_tokens)
        id_match = query_lower in v_id_lower or v_id_lower in query_lower

        if all_tokens_match or id_match:
            matches.append((v_id, v_name))

    if not matches:
        await update.message.reply_text(
            f"❌ No registered volunteer found for *'{query}'*\\.\n\n"
            "Please check the spelling of your name or contact an administrator\\.",
            parse_mode="MarkdownV2"
        )
        return

    # Send QR pass for matched volunteers (up to 3 matches if multiple names match)
    user_chat_id = update.effective_chat.id
    user_handle = update.effective_user.username or ""

    for v_id, v_name in matches[:3]:
        # Save chat_id to Firebase for future automated DM broadcasts (Method B)
        try:
            requests.patch(
                f"{FIREBASE_DB_URL}/volunteers/{v_id}.json",
                json={"chat_id": user_chat_id, "telegram_username": user_handle},
                timeout=5
            )
        except Exception as err:
            logging.warning(f"Could not save chat_id for {v_id}: {err}")

        qr_pass_img = generate_qr_pass(v_id, v_name)
        caption = (
            f"✅ *Registration Verified\\!*\n\n"
            f"👤 *Name:* {v_name}\n"
            f"🆔 *Volunteer ID:* `{v_id}`\n\n"
            f"📱 Show this QR code at the checkpoint camera when arriving\\."
        )
        await update.message.reply_photo(
            photo=qr_pass_img,
            caption=caption,
            parse_mode="MarkdownV2"
        )

def main():
    app = ApplicationBuilder().token(BOT_TOKEN).build()
    app.add_handler(CommandHandler("start", start))
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_lookup))
    
    print("[+] Telegram Volunteer QR Distribution Bot is active and listening...")
    app.run_polling()

if __name__ == "__main__":
    main()
