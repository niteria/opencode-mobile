#!/usr/bin/env python3
"""Check real composer/IME bounds using adb, with an optional broken baseline.

Requires a fixture or isolated OpenCode server and a running Android emulator.
Use --server-port and, for authentication, the OPENCODE_TEST_PASSWORD environment variable.
No model, real server, or device-specific dimensions are used.
"""

import argparse
import json
import os
from pathlib import Path
import re
import shlex
import subprocess
import struct
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


def capture(output, phase, minimum_height, bottom_gap):
    root = hierarchy()
    dump = adb("shell", "dumpsys", "window").decode()
    top = keyboard_top(dump)
    (output / f"{phase}.xml").write_bytes(ET.tostring(root))
    (output / f"{phase}-window.txt").write_text(dump)
    (output / f"{phase}.png").write_bytes(adb("exec-out", "screencap", "-p"))
    # Ensure a missing composer is not merely an app launch/crash failure.
    assert any(node.get("package") == PACKAGE for node in root.iter("node")), "App not visible"
    result = {"phase": phase, "keyboard_top": top, "expected_gap": bottom_gap, "controls": {}}
    for name in ("chat-message-input", "chat-send-button"):
        node = find(root, name)
        rect = bounds(node) if node is not None else None
        above = rect is not None and rect[3] <= top and rect[3] > rect[1]
        visible = above
        if name == "chat-message-input" and rect is not None:
            # Layout-to-pixel rounding can change a row's height by one pixel
            # when it moves to a different Y coordinate.
            visible = visible and rect[3] - rect[1] + 2 >= minimum_height
            # IME root insets remove the navigation bar's safe-area padding.
            # Allow that smaller gap, but reject overlap or excessive lifting.
            visible = visible and -2 <= top - rect[3] <= bottom_gap + 2
        result["controls"][name] = {"bounds": rect, "above_keyboard": above, "correctly_positioned": visible}
    result["pass"] = all(control["correctly_positioned"] for control in result["controls"].values())
    print(json.dumps(result), flush=True)
    return result


def run(apk, output, server_port):
    adb("install", "-r", apk)
    adb("shell", "pm", "clear", PACKAGE)
    adb("reverse", "tcp:4096", f"tcp:{server_port}")
    adb("shell", "settings", "put", "secure", "show_ime_with_hard_keyboard", "1")
    adb("shell", "am", "start", "-W", "-n", f"{PACKAGE}/cc.agentlabs.opencode.MainActivity")
    tap(wait("telemetry-decline-button"))
    tap(wait("add-connection-button"))
    tap(wait("connect-ip-input"))
    adb("shell", "input", "text", "127.0.0.1:4096")
    adb("shell", "input", "keyevent", "KEYCODE_BACK")
    password = os.environ.get("OPENCODE_TEST_PASSWORD")
    if password:
        field = wait("connect-password-input")
        minimum = bounds(field)[3] - bounds(field)[1]
        tap(field)
        adb("shell", "input", "text", shlex.quote(password))
        field = wait("connect-password-input")
        rect = bounds(field)
        top = keyboard_top(adb("shell", "dumpsys", "window").decode())
        assert rect[3] <= top and rect[3] - rect[1] + 2 >= minimum, "Connection password field is covered"
        (output / "connection-password.png").write_bytes(adb("exec-out", "screencap", "-p"))
        adb("shell", "input", "keyevent", "KEYCODE_BACK")
    tap(wait("connect-submit-button"))
    wait("connection-status-dot")
    tap(wait("new-session-fab"))
    node = wait("chat-message-input")
    closed = bounds(node)
    screenshot = adb("exec-out", "screencap", "-p")
    (output / "closed.png").write_bytes(screenshot)
    height = struct.unpack(">II", screenshot[16:24])[1]
    gap = height - closed[3]
    tap(node)
    adb("shell", "input", "text", "Keyboard-check")
    time.sleep(2)
    results = [capture(output, "single-line", closed[3] - closed[1], gap)]
    if not results[-1]["pass"]:
        return results

    for _ in range(3):
        adb("shell", "input", "keyevent", "KEYCODE_ENTER")
        adb("shell", "input", "text", "Another-line-of-composer-text")
    time.sleep(1)
    results.append(capture(output, "multiline", closed[3] - closed[1], gap))
    adb("shell", "input", "keyevent", "KEYCODE_BACK")
    time.sleep(1)
    node = wait("chat-message-input")
    restored = bounds(node)
    (output / "dismissed.png").write_bytes(adb("exec-out", "screencap", "-p"))
    assert abs(restored[3] - closed[3]) <= 2, f"Composer did not return after dismissal: {restored} vs {closed}"
    tap(node)
    time.sleep(2)
    results.append(capture(output, "reopened", closed[3] - closed[1], gap))

    # Verify actual encrypted draft persistence across process recreation,
    # beyond the in-memory draft-storage unit tests.
    expected = wait("chat-message-input").get("text")
    assert expected and "Keyboard-check" in expected
    adb("shell", "input", "keyevent", "KEYCODE_BACK")
    tap(wait("chat-sessions-button"))
    wait("session-search")
    # The newly created empty session is the newest row. Capture its stable ID
    # and verify its draft before using that same ID after process recreation.
    row = next(node for node in hierarchy().iter("node")
               if "session-item-" in node.get("resource-id", ""))
    session_row = row.get("resource-id").rsplit("/", 1)[-1]
    tap(row)
    assert wait("chat-message-input").get("text") == expected
    adb("shell", "input", "keyevent", "KEYCODE_HOME")
    time.sleep(1)
    adb("shell", "am", "force-stop", PACKAGE)
    adb("shell", "am", "start", "-W", "-n", f"{PACKAGE}/cc.agentlabs.opencode.MainActivity")
    wait("session-search")
    tap(wait(session_row))
    deadline = time.monotonic() + 30
    while time.monotonic() < deadline:
        node = wait("chat-message-input")
        if node.get("text") == expected:
            break
        time.sleep(1)
    assert node.get("text") == expected, "Draft did not survive process recreation exactly"
    (output / "draft-restored.png").write_bytes(adb("exec-out", "screencap", "-p"))
    (output / "draft-restored.json").write_text(json.dumps({"pass": True, "characters": len(expected)}) + "\n")
    return results


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("apk")
    parser.add_argument("output", type=Path)
    parser.add_argument("--expect-overlap", action="store_true")
    parser.add_argument("--server-port", type=int, default=4096)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    try:
        results = run(args.apk, args.output, args.server_port)
        (args.output / "results.json").write_text(json.dumps(results, indent=2) + "\n")
        passed = all(result["pass"] for result in results)
        if args.expect_overlap:
            assert any(not control["above_keyboard"] for result in results
                       for control in result["controls"].values()), "Baseline did not reproduce the overlap"
        else:
            assert passed, "Composer or send button is not positioned correctly above the keyboard"
    finally:
        (args.output / "logcat.txt").write_bytes(adb("logcat", "-d"))
        (args.output / "last-screen.png").write_bytes(adb("exec-out", "screencap", "-p"))


if __name__ == "__main__":
    main()
