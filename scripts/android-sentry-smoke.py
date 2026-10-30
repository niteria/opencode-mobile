#!/usr/bin/env python3
"""Exercise opt-in and submit one synthetic JS error from an isolated emulator.

Requires a Sentry-configured release APK and no real server/session data.
The returned event ID must also be checked in Sentry for source-map resolution.
"""
import argparse
import importlib.util
import json
from pathlib import Path
import re
import time

spec = importlib.util.spec_from_file_location("keyboard", Path(__file__).with_name("android-keyboard-smoke.py"))
ui = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ui)


def settings():
    root = ui.hierarchy()
    node = next(n for n in root.iter("node") if n.get("content-desc", "").endswith("Settings"))
    ui.tap(node)
    for _ in range(6):
        root = ui.hierarchy()
        if ui.find(root, "crash-reporting-toggle") is not None:
            return root
        width, height = map(int, re.findall(r"(\d+)x(\d+)", ui.adb("shell", "wm", "size").decode())[0])
        ui.adb("shell", "input", "swipe", str(width // 2), str(height * 3 // 4),
               str(width // 2), str(height // 3), "400")
    raise AssertionError("Crash reporting setting not found")


def reveal(name):
    for _ in range(6):
        root = ui.hierarchy()
        node = ui.find(root, name)
        if node is not None:
            return node
        content = next(n for n in root.iter("node") if n.get("resource-id") == "android:id/content")
        left, top, right, bottom = ui.bounds(content)
        ui.adb("shell", "input", "swipe", str((left + right) // 2), str(bottom * 3 // 4),
               str((left + right) // 2), str((top + bottom) // 3), "400")
    raise AssertionError(f"Setting not visible: {name}")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("apk")
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    ui.adb("install", "-r", args.apk)
    ui.adb("shell", "pm", "clear", ui.PACKAGE)
    ui.adb("shell", "am", "start", "-W", "-n", f"{ui.PACKAGE}/cc.agentlabs.opencode.MainActivity")
    ui.tap(ui.wait("telemetry-decline-button"))
    ui.wait("add-connection-button")
    root = settings()
    assert ui.find(root, "crash-reporting-toggle").get("checked") == "false"
    assert ui.find(root, "sentry-test-report") is None
    ui.tap(ui.find(root, "crash-reporting-toggle"))
    ui.tap(reveal("sentry-test-report"))
    deadline = time.monotonic() + 40
    event = None
    while time.monotonic() < deadline:
        root = ui.hierarchy()
        event = next((n.get("text") for n in root.iter("node") if re.fullmatch(r"[a-f0-9]{32}", n.get("text", ""))), None)
        if event:
            break
        time.sleep(1)
    assert event, "Test error was not queued"
    (args.output / "test-report.png").write_bytes(ui.adb("exec-out", "screencap", "-p"))
    (args.output / "event.json").write_text(json.dumps({"event_id": event, "queued": True}) + "\n")
    # Allow the native background transport to finish before revoking consent.
    time.sleep(20)
    ui.tap(ui.wait("button1"))
    ui.tap(ui.wait("crash-reporting-toggle"))
    root = ui.hierarchy()
    assert ui.find(root, "crash-reporting-toggle").get("checked") == "false"
    assert ui.find(root, "sentry-test-report") is None
    print(json.dumps({"event_id": event, "queued": True, "consent_ui_checks": "pass", "server_verification": "pending"}))


if __name__ == "__main__":
    main()
