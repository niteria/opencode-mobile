#!/usr/bin/env python3
"""Check real composer/IME bounds using adb, with an optional broken baseline.

Requires the fixture server on host port 4096 and a running Android emulator.
No model, real server, or device-specific dimensions are used.
"""

import argparse
import json
from pathlib import Path
import re
import subprocess
import time
import xml.etree.ElementTree as ET


PACKAGE = "cc.agentlabs.opencode.pr182"


def adb(*args):
    return subprocess.check_output(["adb", *args], timeout=45)


def hierarchy():
    adb("shell", "uiautomator", "dump", "/sdcard/keyboard-smoke.xml")
    return ET.fromstring(adb("exec-out", "cat", "/sdcard/keyboard-smoke.xml"))


def bounds(node):
    return tuple(map(int, re.findall(r"\d+", node.attrib["bounds"])))


def find(root, name):
    return next((node for node in root.iter("node")
                 if node.get("resource-id", "").rsplit("/", 1)[-1] == name), None)


def tap(node):
    left, top, right, bottom = bounds(node)
    adb("shell", "input", "tap", str((left + right) // 2), str((top + bottom) // 2))


def wait(name):
    deadline = time.monotonic() + 45
    while time.monotonic() < deadline:
        root = hierarchy()
        permission = find(root, "permission_allow_button")
        if permission is not None:
            tap(permission)
            continue
        node = find(root, name)
        if node is not None:
            return node
        time.sleep(1)
    raise RuntimeError(f"UI element did not appear: {name}")


def keyboard_top(dump):
    # Android's actual IME insets, not the keyboard package or its UI hierarchy.
    sources = []
    for line in dump.splitlines():
        if not re.search(r"(?:mType|type)=ime\b", line):
            continue
        if not re.search(r"(?:mVisible|visible)=true\b", line):
            continue
        frame = re.search(r"(?:mFrame|frame)=\[(\d+),(\d+)\]\[(\d+),(\d+)\]", line)
        if frame and 0 < int(frame[2]) < int(frame[4]):
            sources.append(int(frame[2]))
    if not sources:
        raise RuntimeError("No visible IME frame in WindowManager diagnostics")
    return min(sources)


def capture(output, phase, minimum_height):
    root = hierarchy()
    dump = adb("shell", "dumpsys", "window").decode()
    top = keyboard_top(dump)
    (output / f"{phase}.xml").write_bytes(ET.tostring(root))
    (output / f"{phase}-window.txt").write_text(dump)
    (output / f"{phase}.png").write_bytes(adb("exec-out", "screencap", "-p"))
    # Ensure a missing composer is not merely an app launch/crash failure.
    assert any(node.get("package") == PACKAGE for node in root.iter("node")), "App not visible"
    result = {"phase": phase, "keyboard_top": top, "controls": {}}
    for name in ("chat-message-input", "chat-send-button"):
        node = find(root, name)
        rect = bounds(node) if node is not None else None
        visible = rect is not None and rect[3] <= top and rect[3] > rect[1]
        if name == "chat-message-input" and rect is not None:
            visible = visible and rect[3] - rect[1] >= minimum_height
        result["controls"][name] = {"bounds": rect, "above_keyboard": visible}
    result["pass"] = all(control["above_keyboard"] for control in result["controls"].values())
    print(json.dumps(result), flush=True)
    return result


def run(apk, output):
    adb("install", "-r", apk)
    adb("shell", "pm", "clear", PACKAGE)
    adb("reverse", "tcp:4096", "tcp:4096")
    adb("shell", "settings", "put", "secure", "show_ime_with_hard_keyboard", "1")
    adb("shell", "am", "start", "-W", "-n", f"{PACKAGE}/cc.agentlabs.opencode.MainActivity")
    tap(wait("telemetry-decline-button"))
    tap(wait("add-connection-button"))
    tap(wait("connect-ip-input"))
    adb("shell", "input", "text", "127.0.0.1:4096")
    adb("shell", "input", "keyevent", "KEYCODE_BACK")
    tap(wait("connect-submit-button"))
    wait("connection-status-dot")
    tap(wait("new-session-fab"))
    node = wait("chat-message-input")
    closed = bounds(node)
    (output / "closed.png").write_bytes(adb("exec-out", "screencap", "-p"))
    tap(node)
    adb("shell", "input", "text", "Keyboard-check")
    time.sleep(2)
    results = [capture(output, "single-line", closed[3] - closed[1])]
    if not results[-1]["pass"]:
        return results

    for _ in range(3):
        adb("shell", "input", "keyevent", "KEYCODE_ENTER")
        adb("shell", "input", "text", "Another-line-of-composer-text")
    time.sleep(1)
    results.append(capture(output, "multiline", closed[3] - closed[1]))
    adb("shell", "input", "keyevent", "KEYCODE_BACK")
    time.sleep(1)
    node = wait("chat-message-input")
    assert abs(bounds(node)[3] - closed[3]) <= 2, "Composer did not return after keyboard dismissal"
    tap(node)
    time.sleep(2)
    results.append(capture(output, "reopened", closed[3] - closed[1]))
    return results


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("apk")
    parser.add_argument("output", type=Path)
    parser.add_argument("--expect-overlap", action="store_true")
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    try:
        results = run(args.apk, args.output)
        (args.output / "results.json").write_text(json.dumps(results, indent=2) + "\n")
        passed = all(result["pass"] for result in results)
        assert passed != args.expect_overlap, (
            "Baseline did not reproduce the overlap" if args.expect_overlap
            else "Composer or send button overlaps the keyboard"
        )
    finally:
        (args.output / "logcat.txt").write_bytes(adb("logcat", "-d"))
        (args.output / "last-screen.png").write_bytes(adb("exec-out", "screencap", "-p"))


if __name__ == "__main__":
    main()
