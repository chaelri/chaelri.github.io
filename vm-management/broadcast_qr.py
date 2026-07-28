import io
import time
import requests
import qrcode
from PIL import Image, ImageDraw

# =========================================
# CONFIGURATION
# =========================================
BOT_TOKEN = "8475801439:AAEGVxZImAOBf-wuyxepvr_xOHnsZ28JUsE"
FIREBASE_DB_URL = "https://test-database-55379-default-rtdb.asia-southeast1.firebasedatabase.app"

# Target Group/Channel Chat ID (e.g., -100123456789 or @your_channel_name)
# Replace with your group chat ID or individual chat ID
TARGET_CHAT_ID = "" 

def fetch_all_volunteers():
    """Fetch all 218 registered volunteers from Firebase."""
    try:
        resp = requests.get(f"{FIREBASE_DB_URL}/volunteers.json", timeout=10)
        if resp.status_code == 200 and resp.json():
            return resp.json()
    except Exception as e:
        print(f"Error fetching volunteers: {e}")
    return {}

def generate_qr_pass(volunteer_id, volunteer_name):
    """Generate a pass card image in memory."""
    qr = qrcode.QRCode(
        version=1,
        error_correction=qrcode.constants.ERROR_CORRECT_H,
        box_size=10,
        border=2,
    )
    qr.add_data(volunteer_id)
    qr.make(fit=True)
    qr_img = qr.make_image(fill_color="black", back_color="white").convert('RGB')

    card_w, card_h = 500, 650
    card = Image.new('RGB', (card_w, card_h), color='#0a0a0a')
    draw = ImageDraw.Draw(card)

    draw.text((card_w // 2, 40), "LIVE PRODUCTION", fill="#ffffff", anchor="mm")
    draw.text((card_w // 2, 70), "Volunteer Checkpoint Pass", fill="#737373", anchor="mm")

    qr_w, qr_h = qr_img.size
    card.paste(qr_img, ((card_w - qr_w) // 2, 110))

    draw.text((card_w // 2, 530), str(volunteer_name), fill="#ffffff", anchor="mm")
    draw.text((card_w // 2, 570), f"ID: {volunteer_id}", fill="#4ade80", anchor="mm")
    draw.text((card_w // 2, 610), "Scan this at the checkpoint camera", fill="#a3a3a3", anchor="mm")

    img_byte_arr = io.BytesIO()
    card.save(img_byte_arr, format='PNG')
    img_byte_arr.seek(0)
    return img_byte_arr

def send_photo_via_telegram(chat_id, photo_bytes, caption):
    """Send a photo via Telegram Bot API HTTP POST."""
    url = f"https://api.telegram.org/bot{BOT_TOKEN}/sendPhoto"
    files = {'photo': ('pass.png', photo_bytes, 'image/png')}
    data = {
        'chat_id': chat_id,
        'caption': caption,
        'parse_mode': 'Markdown'
    }
    resp = requests.post(url, data=data, files=files)
    return resp.json()

def run_batch_broadcast(chat_id_target=None):
    volunteers = fetch_all_volunteers()
    print(f"Total volunteers loaded from Firebase: {len(volunteers)}")

    success_count = 0
    fail_count = 0

    for idx, (v_id, v_data) in enumerate(volunteers.items(), start=1):
        if not isinstance(v_data, dict):
            continue

        name = v_data.get("name", "Volunteer")
        team = v_data.get("team", "")
        # Check if individual volunteer has a saved chat_id in Firebase or use default target
        target = v_data.get("chat_id") or chat_id_target

        if not target:
            print(f"[{idx}/{len(volunteers)}] Skipping {name} ({v_id}): No chat_id target specified.")
            continue

        print(f"[{idx}/{len(volunteers)}] Sending QR Pass to {name} ({v_id})...")
        photo_bytes = generate_qr_pass(v_id, name)
        
        caption = (
            f"✅ *Checkpoint Pass Ready*\n\n"
            f"👤 *Name:* {name}\n"
            f"👥 *Team:* {team if team else 'General'}\n"
            f"🆔 *ID:* `{v_id}`\n\n"
            f"📱 Show this QR pass at the checkpoint camera to clock in."
        )

        res = send_photo_via_telegram(target, photo_bytes, caption)
        if res.get("ok"):
            success_count += 1
            print(f"  -> Sent successfully to {target}")
        else:
            fail_count += 1
            print(f"  -> Failed to send: {res.get('description')}")

        # Telegram rate limit delay (prevent spam blocking)
        time.sleep(1)

    print(f"\nBatch Broadcast Completed: {success_count} succeeded, {fail_count} failed.")

if __name__ == "__main__":
    import sys
    target = sys.argv[1] if len(sys.argv) > 1 else TARGET_CHAT_ID
    if not target:
        print("Usage: python broadcast_qr.py <TARGET_CHAT_ID>")
        print("Provide a Group Chat ID, Channel username (@channel), or Telegram User Chat ID.")
    else:
        run_batch_broadcast(target)
