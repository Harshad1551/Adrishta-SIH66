"""
User Authentication and Research Workspace Router (Phase 17)
"""

from pathlib import Path
import sqlite3
import hashlib
import json
from typing import Dict, Any, List, Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter()
import os

def _resolve_db_path() -> Path:
    candidates = [
        Path(os.getenv("WORKSPACE_DB_PATH", "")),
        Path("G:/My Drive/oceanembed_data/workspace.db"),
        Path("c:/adrishta-66/data/workspace.db"),
    ]
    for c in candidates:
        if c.is_file():
            return c
    return Path("G:/My Drive/oceanembed_data/workspace.db")

DB_PATH = _resolve_db_path()

class UserAuthRequest(BaseModel):
    username: str
    password: str

class BookmarkCreateRequest(BaseModel):
    title: str
    lat: float
    lon: float
    date: str
    temperatures: List[float]
    depths: Optional[List[float]] = None
    mld_m: Optional[float] = None
    thermocline_m: Optional[float] = None
    notes: Optional[str] = None

def hash_pw(pw: str) -> str:
    return hashlib.sha256(pw.encode("utf-8")).hexdigest()

@router.post("/auth/register")
def register_user(req: UserAuthRequest):
    if len(req.username.strip()) < 3 or len(req.password) < 4:
        raise HTTPException(status_code=400, detail="Username (>=3 chars) and password (>=4 chars) required")
    try:
        with sqlite3.connect(DB_PATH) as conn:
            cursor = conn.cursor()
            cursor.execute(
                "INSERT INTO users (username, password_hash) VALUES (?, ?)",
                (req.username.strip(), hash_pw(req.password))
            )
            conn.commit()
            return {
                "status": "success",
                "message": f"Researcher account {req.username.strip()} created successfully.",
                "token": f"token-{req.username.strip()}",
            }
    except sqlite3.IntegrityError:
        raise HTTPException(status_code=400, detail="Username already exists. Please login instead.")

@router.post("/auth/login")
def login_user(req: UserAuthRequest):
    with sqlite3.connect(DB_PATH) as conn:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT id, username FROM users WHERE username = ? AND password_hash = ?",
            (req.username.strip(), hash_pw(req.password))
        )
        row = cursor.fetchone()
        if not row:
            raise HTTPException(status_code=401, detail="Invalid username or password")
        return {
            "status": "success",
            "username": row[1],
            "token": f"token-{row[1]}",
            "message": "Authenticated to ADRISHTA Research Workspace",
        }

@router.get("/workspace/bookmarks")
def get_user_bookmarks(username: str = "guest_researcher"):
    with sqlite3.connect(DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM bookmarks WHERE username = ? ORDER BY id DESC", (username,))
        rows = cursor.fetchall()
        bookmarks = []
        for r in rows:
            bookmarks.append({
                "id": r["id"],
                "title": r["title"],
                "lat": r["lat"],
                "lon": r["lon"],
                "date": r["date"],
                "temperatures": json.loads(r["temperatures_json"]),
                "depths": json.loads(r["depths_json"]),
                "mld_m": r["mld_m"],
                "thermocline_m": r["thermocline_m"],
                "notes": r["notes"],
                "created_at": r["created_at"],
            })
        return {"count": len(bookmarks), "username": username, "bookmarks": bookmarks}

@router.post("/workspace/bookmarks")
def save_profile_bookmark(req: BookmarkCreateRequest, username: str = "guest_researcher"):
    depths = req.depths or [0, 5, 10, 20, 30, 50, 75, 100, 125, 150, 200, 300, 500, 700, 1000]
    with sqlite3.connect(DB_PATH) as conn:
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO bookmarks (username, title, lat, lon, date, temperatures_json, depths_json, mld_m, thermocline_m, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (username, req.title, req.lat, req.lon, req.date, json.dumps(req.temperatures), json.dumps(depths), req.mld_m, req.thermocline_m, req.notes or "")
        )
        conn.commit()
        bookmark_id = cursor.lastrowid
    return {"status": "saved", "bookmark_id": bookmark_id, "message": f"Profile {req.title} bookmarked successfully."}

@router.delete("/workspace/bookmarks/{bookmark_id}")
def delete_bookmark(bookmark_id: int, username: str = "guest_researcher"):
    with sqlite3.connect(DB_PATH) as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM bookmarks WHERE id = ? AND username = ?", (bookmark_id, username))
        conn.commit()
        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="Bookmark not found or access denied")
        return {"status": "deleted", "bookmark_id": bookmark_id}