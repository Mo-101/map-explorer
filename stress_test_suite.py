"""
AFRO STORM - COMPREHENSIVE STRESS TEST SUITE
Runs quick HTTP load + WebSocket fan-out to validate real-time backend.
"""

import asyncio
import aiohttp
import time
import statistics
import json
from datetime import datetime

BASE_URL = "http://localhost:8000"
WS_URL = "ws://localhost:8000/ws/threats"

LOAD_REQUESTS = 200
CONCURRENCY = 40
WS_CONNECTIONS = 20
STABILITY_SECONDS = 20


async def health():
    async with aiohttp.ClientSession() as s:
        async with s.get(f"{BASE_URL}/health") as r:
            print("Health", r.status, await r.json())


async def hit(session, url):
    start = time.time()
    try:
        async with session.get(url) as resp:
            await resp.text()
            return (resp.status == 200, (time.time() - start) * 1000)
    except Exception:
        return (False, (time.time() - start) * 1000)


async def load_test():
    url = f"{BASE_URL}/api/v1/threats"
    results = []
    async with aiohttp.ClientSession() as s:
        for i in range(0, LOAD_REQUESTS, CONCURRENCY):
            batch = [hit(s, url) for _ in range(CONCURRENCY)]
            results.extend(await asyncio.gather(*batch))
            print(f"Progress {len(results)}/{LOAD_REQUESTS}", end="\r")
    ok = [d for ok, d in results if ok]
    if ok:
        print("\nLoad avg ms:", statistics.mean(ok))
        print("p95 ms:", statistics.quantiles(ok, n=20)[18])
    else:
        print("\nNo successful requests")


async def ws_client(idx, duration=15):
    import websockets

    msgs = 0
    try:
        async with websockets.connect(WS_URL) as ws:
            start = time.time()
            while time.time() - start < duration:
                try:
                    msg = await asyncio.wait_for(ws.recv(), timeout=5)
                    data = json.loads(msg)
                    msgs += 1
                except asyncio.TimeoutError:
                    continue
    except Exception as exc:
        print(f"WS {idx} failed: {exc}")
    return msgs


async def ws_stress():
    print("Starting WS fan-out...")
    tasks = [ws_client(i) for i in range(WS_CONNECTIONS)]
    results = await asyncio.gather(*tasks)
    print("WS messages per client avg:", sum(results) / len(results))


async def stability():
    url = f"{BASE_URL}/api/v1/threats"
    async with aiohttp.ClientSession() as s:
        start = time.time()
        count = 0
        while time.time() - start < STABILITY_SECONDS:
            await hit(s, url)
            count += 1
            await asyncio.sleep(0.1)
        print("Stability requests:", count)


async def main():
    print("=== AFRO STORM Stress Suite ===")
    await health()
    await load_test()
    await ws_stress()
    await stability()
    print("Done", datetime.utcnow().isoformat())


if __name__ == "__main__":
    asyncio.run(main())
