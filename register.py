"""
register_face.py
================
Registers a face into FaceNet-Node using your phone's IP Webcam camera.
Captures a frame, extracts the face descriptor via face_recognition,
then POSTs it to FaceNet-Node's /api/users endpoint.

Run:
    python register_face.py

Requirements:
    pip install face_recognition requests opencv-python numpy
"""

import requests
import cv2
import numpy as np
import base64
import json
import sys

# ─── Config ───────────────────────────────────────────────────────────────────

CAMERA_URL       = "http://10.273.178.115:8080/shot.jpg"   # ← your phone IP
FACENET_NODE_URL = "http://localhost:3001"                # FaceNet-Node backend

# ─── Try face_recognition ─────────────────────────────────────────────────────

try:
    import face_recognition
    FACE_RECOG = True
except ImportError:
    FACE_RECOG = False
    print("[!] face_recognition not installed")
    print("    Run: pip install cmake dlib face_recognition")
    sys.exit(1)

# ─── Capture frame from phone ─────────────────────────────────────────────────

def capture_frame() -> np.ndarray | None:
    print(f"Capturing from {CAMERA_URL}...")
    try:
        resp  = requests.get(CAMERA_URL, timeout=5)
        arr   = np.frombuffer(resp.content, np.uint8)
        frame = cv2.imdecode(arr, cv2.IMREAD_COLOR)
        if frame is None:
            print("[!] Could not decode image")
            return None
        print(f"Frame captured: {frame.shape[1]}x{frame.shape[0]}")
        return frame
    except Exception as e:
        print(f"[!] Camera error: {e}")
        return None

# ─── Extract face descriptor ──────────────────────────────────────────────────

def get_descriptor(frame_bgr: np.ndarray) -> list[float] | None:
    rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)

    locations = face_recognition.face_locations(rgb, model="hog")
    if not locations:
        print("[!] No face detected in frame")
        print("    Make sure your face is clearly visible and well lit")
        return None

    if len(locations) > 1:
        print(f"[!] {len(locations)} faces detected — please ensure only ONE face is visible")
        return None

    print(f"[OK] Face detected at {locations[0]}")
    encodings = face_recognition.face_encodings(rgb, locations)
    return encodings[0].tolist()   # 128-d float list

# ─── Generate thumbnail ───────────────────────────────────────────────────────

def make_thumb(frame_bgr: np.ndarray) -> str:
    thumb = cv2.resize(frame_bgr, (150, 150))
    _, buf = cv2.imencode(".jpg", thumb, [cv2.IMWRITE_JPEG_QUALITY, 80])
    return "data:image/jpeg;base64," + base64.b64encode(buf).decode()

# ─── Register to FaceNet-Node ─────────────────────────────────────────────────

def register(name: str, descriptor: list[float], thumb: str) -> bool:
    print(f"Registering '{name}' to FaceNet-Node...")
    try:
        resp = requests.post(
            f"{FACENET_NODE_URL}/api/users",
            json={
                "name":       name,
                "descriptor": descriptor,
                "thumb":      thumb,
            },
            timeout=5,
        )
        if resp.ok:
            data = resp.json()
            print(f"[OK] Registered! User ID: {data.get('id')}")
            return True
        else:
            print(f"[!] Server error {resp.status_code}: {resp.text}")
            return False
    except Exception as e:
        print(f"[!] Registration error: {e}")
        return False

# ─── Preview captured frame ───────────────────────────────────────────────────

def preview_frame(frame: np.ndarray, descriptor_found: bool):
    """Show the captured frame so user can confirm their face is visible."""
    display = frame.copy()
    colour  = (0, 255, 0) if descriptor_found else (0, 0, 255)
    label   = "Face detected - press Y to register, N to retake" if descriptor_found else "No face - press N to retake"
    cv2.putText(display, label, (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.6, colour, 2)
    cv2.imshow("Registration Preview", display)

# ─── Main ─────────────────────────────────────────────────────────────────────

def main():
    print("=" * 50)
    print("FaceNet-Node Face Registration")
    print("=" * 50)

    # Check FaceNet-Node is running
    try:
        r = requests.get(f"{FACENET_NODE_URL}/api/users", timeout=3)
        existing = r.json()
        print(f"FaceNet-Node OK | {len(existing)} existing user(s)")
    except:
        print("[!] FaceNet-Node not reachable on port 3001")
        print("    Run: npm run server (in FaceNet-Node folder)")
        return

    # Get name
    name = input("\nEnter name to register: ").strip()
    if not name:
        print("[!] Name cannot be empty")
        return

    # Check if already registered
    existing_names = [u["name"].lower() for u in existing] if isinstance(existing, list) else []
    if name.lower() in existing_names:
        overwrite = input(f"'{name}' already registered. Overwrite? (y/n): ").strip().lower()
        if overwrite != "y":
            print("Cancelled.")
            return

    # Capture loop
    while True:
        frame = capture_frame()
        if frame is None:
            retry = input("Camera failed. Retry? (y/n): ").strip().lower()
            if retry != "y":
                return
            continue

        descriptor = get_descriptor(frame)
        preview_frame(frame, descriptor is not None)
        key = cv2.waitKey(0) & 0xFF
        cv2.destroyAllWindows()

        if key == ord("y") and descriptor:
            thumb = make_thumb(frame)
            success = register(name, descriptor, thumb)
            if success:
                print(f"\n✓ '{name}' registered successfully!")
                print("They will now be identified in live_capture.py")

                # Show all registered users
                users = requests.get(f"{FACENET_NODE_URL}/api/users").json()
                print(f"\nRegistered users ({len(users)}):")
                for u in users:
                    print(f"  - {u['name']} (ID: {u['id']})")
            break

        elif key == ord("n"):
            retry = input("Retake photo? (y/n): ").strip().lower()
            if retry != "y":
                print("Cancelled.")
                break
            print("Retaking...")
            continue

        else:
            if descriptor is None:
                print("No face detected — retaking automatically...")
            else:
                print("Retaking...")

if __name__ == "__main__":
    main()