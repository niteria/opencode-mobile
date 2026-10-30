#!/usr/bin/env python3
"""Verify nested tool output with native swipes and OCR, using --seed-tool-output.

Requires an isolated Android emulator, adb and tesseract. Clears the fork app.
Checks visible output progression, stationary chat, edge ownership and diffs.
"""
import argparse
import importlib.util
import json
from pathlib import Path
import re
import subprocess
import time

spec = importlib.util.spec_from_file_location("keyboard", Path(__file__).with_name("android-keyboard-smoke.py"))
ui = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ui)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("apk")
    parser.add_argument("output", type=Path)
    parser.add_argument("--server-port", type=int, default=4197)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
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
    results = []

    def capture(name):
        path = args.output / f"{name}.png"
        path.write_bytes(ui.adb("exec-out", "screencap", "-p"))
        text = subprocess.check_output(["tesseract", str(path), "stdout", "--psm", "6"], stderr=subprocess.DEVNULL, text=True)
        (args.output / f"{name}.txt").write_text(text)
        numbers = [int(n) for n in re.findall(r"LINE\s+(\d{3})\b", text, re.I)]
        return numbers, text

    for tool in ("bash", "custom", "edit"):
        sid = f"seed-output-{tool}"
        toggle = f"tool-toggle-{sid}-tool"
        output = f"tool-output-{sid}-tool"
        ui.tap(ui.wait(f"session-item-{sid}"))
        ui.tap(ui.wait(toggle))
        time.sleep(.5)
        anchor = ui.bounds(ui.wait(toggle))
        left, top, right, bottom = ui.bounds(ui.wait(output))
        x = (left + right) // 2
        high = top + (bottom - top) // 5
        low = bottom - (bottom - top) // 5

        def swipe(up=True, drift=0, horizontal=False):
            if horizontal:
                points = (right - 30, bottom - 60, left + 30, bottom - 60)
            else:
                points = (x, low if up else high, x + drift, high if up else low)
            ui.adb("shell", "input", "swipe", *map(str, points), "240")
            time.sleep(.4)
            assert ui.bounds(ui.wait(toggle)) == anchor, f"{tool}: inner swipe moved the chat"

        initial, _ = capture(f"{tool}-initial")
        assert 1 in initial, (tool, initial)
        swipe(drift=20)
        advanced, _ = capture(f"{tool}-advanced")
        assert advanced and min(advanced) > min(initial), f"{tool}: output did not scroll"
        for i in range(20):
            swipe(drift=(-20 if i % 2 else 20))
            numbers, text = capture(f"{tool}-down-{i}")
            if 120 in numbers:
                break
        assert 120 in numbers, f"{tool}: final output line was cut off"
        swipe()
        assert 120 in capture(f"{tool}-bottom-edge")[0]

        if tool == "edit":
            for i in range(10):
                swipe(horizontal=True)
                _, text = capture(f"edit-horizontal-{i}")
                if "HORIZONTAL_TARGET" in text:
                    break
            assert "HORIZONTAL_TARGET" in text, "Nested diff lost horizontal scrolling"
            # Restore horizontal position before checking numbered lines again.
            for _ in range(10):
                ui.adb("shell", "input", "swipe", str(left + 30), str(bottom - 60), str(right - 30), str(bottom - 60), "180")
            time.sleep(.5)

        for i in range(20):
            swipe(up=False)
            numbers, _ = capture(f"{tool}-up-{i}")
            if 1 in numbers:
                break
        assert 1 in numbers, f"{tool}: could not return to start"
        swipe(up=False)
        assert 1 in capture(f"{tool}-top-edge")[0]
        ui.tap(ui.wait(output))
        assert ui.find(ui.hierarchy(), output) is not None, "Tapping output collapsed it"

        # A swipe outside the box must still move the surrounding conversation.
        ui.adb("shell", "input", "swipe", str(max(10, left // 3)), str(high),
               str(max(10, left // 3)), str(low), "400")
        time.sleep(.5)
        current = ui.find(ui.hierarchy(), toggle)
        assert current is None or ui.bounds(current) != anchor, "Outside swipe could not scroll chat"
        ui.tap(ui.wait("chat-sessions-button"))
        results.append({"tool": tool, "pass": True, "last_line": 120})
    (args.output / "results.json").write_text(json.dumps(results, indent=2) + "\n")
    print(json.dumps(results))


if __name__ == "__main__":
    main()
