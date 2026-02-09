"""
AFRO STORM - REAL-TIME VERIFICATION
Checks that the backend is live (not mock) by sampling multiple snapshots.
"""

import time
import requests
from datetime import datetime

BASE = "http://localhost:8000"


def check_health():
    r = requests.get(f"{BASE}/health", timeout=5)
    r.raise_for_status()
    data = r.json()
    print("Health:", data)
    if "REAL-TIME" not in str(data):
        print("⚠️ Backend not in real-time mode")
    return True


def snapshots(n=3, wait=15):
    snaps = []
    for i in range(n):
        r = requests.get(f"{BASE}/api/v1/threats", timeout=5)
        r.raise_for_status()
        data = r.json()
        snaps.append(data)
        print(f"Snapshot {i+1}: count={data.get('count')} at {data.get('timestamp')}")
        if i < n - 1:
            time.sleep(wait)
    return snaps


def analyze(snaps):
    ts = [s.get("timestamp") for s in snaps]
    print("Unique timestamps:", len(set(ts)), "/", len(ts))
    moved = False
    for i in range(1, len(snaps)):
        prev = snaps[i - 1].get("threats", [])
        curr = snaps[i].get("threats", [])
        if prev and curr:
            p = (prev[0]["center_lat"], prev[0]["center_lng"])
            c = (curr[0]["center_lat"], curr[0]["center_lng"])
            if p != c:
                moved = True
                print(f"Coords moved between snap {i} -> {i+1}: {p} -> {c}")
                break
    print("Movement detected:", moved)
    return moved


def main():
    print("=== AFRO STORM Real-Time Verification ===")
    check_health()
    snaps = snapshots()
    moved = analyze(snaps)
    if moved:
        print("✅ Real-time behavior confirmed")
    else:
        print("⚠️ Data appears static")


if __name__ == "__main__":
    main()
