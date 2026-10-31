#!/usr/bin/env python3
"""Reproduce the phantom user bubble using --seed-message-updates (no model).

The fixture revises an existing old prompt's metadata without sending a prompt.
Then a genuine new prompt verifies that SSE message delivery still works.
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
    parser.add_argument("apk")
    parser.add_argument("output", type=Path)
    parser.add_argument("--server-port", type=int, default=4197)
    parser.add_argument("--expect-ghost", action="store_true")
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)

    def api(path, body=None):
        request = urllib.request.Request(f"http://127.0.0.1:{args.server_port}" + path,
            data=None if body is None else json.dumps(body).encode(), headers={"content-type": "application/json"})
        with urllib.request.urlopen(request, timeout=10) as response:
            return json.load(response)

    sessions = api("/experimental/session")
    assert len(sessions) == 1 and sessions[0]["id"] == "seed-metadata" and sessions[0]["version"] == "0.0.0-mock"
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
    ui.tap(ui.wait("session-item-seed-metadata"))
    ui.wait("chat-message-input")
    assert ui.find(ui.hierarchy(), "chat-bubble-user") is None, "Old prompt unexpectedly loaded in the initial tail"
    assert api("/test/old-user-update", {})["clients"] > 0, "No live event connection"
    time.sleep(2)
    ghost = ui.find(ui.hierarchy(), "chat-bubble-user") is not None
    (args.output / "metadata-update.png").write_bytes(ui.adb("exec-out", "screencap", "-p"))
    if args.expect_ghost:
        assert ghost, "Baseline did not reproduce a phantom user bubble"
        print(json.dumps({"expected_ghost_reproduced": True}))
        return
    assert not ghost, "Old metadata created an empty user bubble"
    api("/session/seed-metadata/prompt_async", {"parts": [{"type": "text", "text": "GENUINE NEW PROMPT"}]})
    deadline = time.monotonic() + 20
    while time.monotonic() < deadline:
        root = ui.hierarchy()
        if any(n.get("text") == "GENUINE NEW PROMPT" for n in root.iter("node")):
            break
        time.sleep(.5)
    assert any(n.get("text") == "GENUINE NEW PROMPT" for n in root.iter("node")), "Real new prompt was lost"
    users = [n for n in root.iter("node") if n.get("resource-id", "").rsplit("/", 1)[-1] == "chat-bubble-user"]
    assert len(users) == 1, "An extra user bubble appeared"
    (args.output / "genuine-message.png").write_bytes(ui.adb("exec-out", "screencap", "-p"))
    print(json.dumps({"pass": True, "old_metadata_ignored": True, "new_prompt_visible": True}))


if __name__ == "__main__":
    main()
