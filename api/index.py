import os
import json
import psycopg2
from psycopg2.extras import RealDictCursor
from datetime import datetime, timedelta
from flask import Flask, request, jsonify
from flask_cors import CORS

# --- Vercel Serverless Boilerplate ---
app = Flask(__name__)
CORS(app)

DATABASE_URL = os.environ.get("DATABASE_URL")

def get_db():
    if not DATABASE_URL:
        raise Exception("System Error: DATABASE_URL environment variable is missing in Vercel settings.")
    conn = psycopg2.connect(DATABASE_URL, cursor_factory=RealDictCursor)
    return conn

@app.route("/api/health")
def health():
    try:
        conn = get_db()
        cur = conn.cursor()
        cur.execute("SELECT 1")
        cur.close()
        conn.close()
        return jsonify({"status": "healthy", "db": "connected"})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route("/api/faces", methods=["GET"])
def list_faces():
    try:
        conn = get_db()
        cur = conn.cursor()
        # Create table if missing (Migration)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS FaceRecord (
                id SERIAL PRIMARY KEY,
                name VARCHAR(255) UNIQUE,
                encoding_json TEXT,
                thumb TEXT,
                registered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                seen_count INTEGER DEFAULT 0
            )
        """)
        cur.execute("SELECT name, registered_at, seen_count as count, thumb FROM FaceRecord")
        recs = cur.fetchall()
        cur.close()
        conn.close()
        # Transform datetime to ISO
        for r in recs:
            r['registered_at'] = r['registered_at'].isoformat() if r['registered_at'] else ""
        return jsonify(recs)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/register", methods=["POST"])
def register():
    data = request.json
    name = data.get("name", "").strip()
    encoding_json = data.get("encoding", "") # Client-side 128-d array
    thumb = data.get("thumb", "")
    
    if not name or not encoding_json:
        return jsonify({"ok": False, "msg": "Missing fields"}), 400

    try:
        conn = get_db()
        cur = conn.cursor()
        cur.execute("INSERT INTO FaceRecord (name, encoding_json, thumb, registered_at, seen_count) VALUES (%s, %s, %s, %s, %s) ON CONFLICT (name) DO UPDATE SET encoding_json = EXCLUDED.encoding_json, thumb = EXCLUDED.thumb",
                   (name, encoding_json, thumb, datetime.utcnow(), 0))
        conn.commit()
        cur.close()
        conn.close()
        return jsonify({"ok": True})
    except Exception as e:
        return jsonify({"ok": False, "msg": str(e)}), 500

@app.route("/api/log_attendance", methods=["POST"])
def log_attendance():
    data = request.json
    name = data.get("name", "").strip()
    if not name: return jsonify({"ok": False})
    
    try:
        conn = get_db()
        cur = conn.cursor()
        # Create table if missing
        cur.execute("""
            CREATE TABLE IF NOT EXISTS AttendanceLog (
                id SERIAL PRIMARY KEY,
                name VARCHAR(255),
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        # Increment seen_count
        cur.execute("UPDATE FaceRecord SET seen_count = seen_count + 1 WHERE name = %s", (name,))
        # Add log entry
        cur.execute("INSERT INTO AttendanceLog (name, timestamp) VALUES (%s, %s)", (name, datetime.utcnow()))
        conn.commit()
        cur.close()
        conn.close()
        return jsonify({"ok": True})
    except Exception as e:
        return jsonify({"ok": False, "msg": str(e)}), 500

@app.route("/api/attendance_logs", methods=["GET"])
def get_logs():
    name = request.args.get('search', '').strip()
    date = request.args.get('date', '').strip()
    
    try:
        conn = get_db()
        cur = conn.cursor()
        # Ensure table exists
        cur.execute("CREATE TABLE IF NOT EXISTS AttendanceLog (id SERIAL PRIMARY KEY, name VARCHAR(255), timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP)")
        query = "SELECT id, name, timestamp FROM AttendanceLog WHERE 1=1"
        params = []
        if name:
            query += " AND name ILIKE %s"
            params.append(f"%{name}%")
        if date:
            query += " AND timestamp >= %s AND timestamp < %s"
            start = datetime.strptime(date, '%Y-%m-%d')
            params.append(start)
            params.append(start + timedelta(days=1))
        
        query += " ORDER BY timestamp DESC LIMIT 100"
        cur.execute(query, params)
        logs = cur.fetchall()
        cur.close()
        conn.close()
        
        for l in logs:
            l['timestamp'] = l['timestamp'].isoformat()
        return jsonify(logs)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/delete/<name>", methods=["DELETE"])
def delete_face(name):
    try:
        conn = get_db()
        cur = conn.cursor()
        cur.execute("DELETE FROM FaceRecord WHERE name = %s", (name,))
        conn.commit()
        cur.close()
        conn.close()
        return jsonify({"ok": True})
    except Exception as e:
        return jsonify({"ok": False, "msg": str(e)}), 500

# Expose as a single Vercel route
# Vercel handles Flask apps automatically if they export 'app'
