#!/usr/bin/env python3
"""Native session navigation regression against mock-opencode-server --seed-sessions.

Requires an isolated emulator; clears ONLY the fork app's data on that emulator.
Run with --apk PATH --server-port PORT --output DIRECTORY.
"""
import argparse
import importlib.util
import json
from pathlib import Path
import time
import urllib.request

spec = importlib.util.spec_from_file_location("keyboard", Path(__file__).with_name("android-keyboard-smoke.py"))
ui = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ui)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--apk", required=True)
    parser.add_argument("--server-port", type=int, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    base = f"http://127.0.0.1:{args.server_port}"

    def api(path, method="GET", data=None, directory="/mock/project"):
        request = urllib.request.Request(base + path, method=method,
            data=None if data is None else json.dumps(data).encode(),
            headers={"content-type": "application/json", "x-opencode-directory": directory})
        with urllib.request.urlopen(request, timeout=10) as response:
            return json.load(response)

    sessions = api("/experimental/session")
    assert {s["id"] for s in sessions} == {"seed-default", "seed-other"}, "Use a fresh seeded mock"
    assert all(s["version"] == "0.0.0-mock" for s in sessions)
    directories = {s["id"]: s["directory"] for s in sessions}

    def prompt(sid):
        api(f"/session/{sid}/prompt_async", "POST", {"parts": [{"type": "text", "text": "navigation test"}]}, directories[sid])
        time.sleep(2)

    def order(expected):
        deadline = time.monotonic() + 30
        while time.monotonic() < deadline:
            root = ui.hierarchy()
            ids = [n.get("resource-id", "").rsplit("/", 1)[-1].removeprefix("session-item-")
                   for n in root.iter("node") if "session-item-" in n.get("resource-id", "")]
            if ids == expected:
                return root
            time.sleep(1)
        raise AssertionError(f"Expected {expected}, saw {ids}")

    def capture(name):
        (args.output / f"{name}.png").write_bytes(ui.adb("exec-out", "screencap", "-p"))

    prompt("seed-default")
    ui.adb("install", "-r", args.apk)
    ui.adb("shell", "pm", "clear", ui.PACKAGE)
    ui.adb("reverse", "tcp:4096", f"tcp:{args.server_port}")
    ui.adb("shell", "am", "start", "-W", "-n", f"{ui.PACKAGE}/cc.agentlabs.opencode.MainActivity")
    ui.tap(ui.wait("telemetry-decline-button"))
    ui.tap(ui.wait("add-connection-button"))
    ui.tap(ui.wait("connect-ip-input"))
    ui.adb("shell", "input", "text", "127.0.0.1:4096")
    ui.adb("shell", "input", "keyevent", "KEYCODE_BACK")
    ui.tap(ui.wait("connect-submit-button"))
    ui.wait("session-search")
    order(["seed-default", "seed-other"])
    capture("flat-recency")

    # No transcript has been selected: global message events must reorder home.
    prompt("seed-other")
    order(["seed-other", "seed-default"])
    api("/session/seed-default", "PATCH", {"title": "Renamed CAD"})
    order(["seed-other", "seed-default"])
    assert any(n.get("text") == "Renamed CAD" for n in ui.hierarchy().iter("node"))

    ui.tap(ui.wait("session-group-toggle"))
    deadline = time.monotonic() + 10
    while ui.wait("session-group-toggle").get("checked") != "true":
        assert time.monotonic() < deadline, "Grouping did not turn on"
        time.sleep(0.2)
    capture("grouped")
    ui.adb("shell", "am", "force-stop", ui.PACKAGE)
    ui.adb("shell", "am", "start", "-W", "-n", f"{ui.PACKAGE}/cc.agentlabs.opencode.MainActivity")
    ui.wait("session-search")
    order(["seed-other", "seed-default"])
    toggle = ui.wait("session-group-toggle")
    assert toggle.get("checked") == "true", toggle.attrib

    # Collapse the project containing the renamed session, then search for it.
    root = ui.hierarchy()
    header = next(n for n in root.iter("node") if n.get("text") == "project")
    ui.tap(header)
    order(["seed-other"])
    ui.tap(ui.wait("session-search"))
    ui.adb("shell", "input", "text", "cAd")
    ui.adb("shell", "input", "keyevent", "KEYCODE_BACK")
    order(["seed-default"])
    capture("search-collapsed-project")
    ui.tap(ui.wait("session-search-clear"))
    order(["seed-other"])
    ui.tap(ui.wait("session-group-toggle"))
    order(["seed-other", "seed-default"])
    ui.tap(ui.wait("session-search"))
    ui.adb("shell", "input", "text", "nomatchxyz")
    ui.adb("shell", "input", "keyevent", "KEYCODE_BACK")
    root = order([])
    assert any(n.get("text") == "No sessions match your search" for n in root.iter("node"))
    capture("no-matches")
    ui.tap(ui.wait("session-search-clear"))
    ui.tap(ui.wait("session-item-seed-other"))
    ui.wait("chat-message-input")
    ui.tap(ui.wait("chat-sessions-button"))
    order(["seed-other", "seed-default"])
    ui.tap(ui.wait("session-item-seed-other"))
    ui.wait("chat-message-input")
    ui.adb("shell", "am", "force-stop", ui.PACKAGE)
    ui.adb("shell", "am", "start", "-W", "-n", f"{ui.PACKAGE}/cc.agentlabs.opencode.MainActivity")
    ui.wait("session-search")
    order(["seed-other", "seed-default"])
    # Direct entry has no list beneath it; the explicit button must still work.
    ui.adb("shell", "am", "force-stop", ui.PACKAGE)
    ui.adb("shell", "am", "start", "-W", "-a", "android.intent.action.VIEW", "-d",
           "opencode-pr182://session/seed-other?directory=%2Fmock%2Fproject%2Fother-dir", ui.PACKAGE)
    ui.wait("chat-message-input")
    capture("chat-sessions-button")
    ui.tap(ui.wait("chat-sessions-button"))
    ui.wait("session-search")
    order(["seed-other", "seed-default"])
    print(json.dumps({"pass": True, "checks": ["message-recency", "live-reorder-without-open-chat", "rename-no-bump", "grouping", "restart-persistence", "collapsed-search", "clear-search", "empty-results", "cross-project-open", "chat-sessions-button", "cold-start-list-after-chat", "deep-link-return"]}))


if __name__ == "__main__":
    main()
