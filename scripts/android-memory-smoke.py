#!/usr/bin/env python3
"""Exercise large synthetic transcripts on an isolated emulator (--seed-memory).

Collects Java/native heap and view counts; never connects to a real server.
"""
import argparse
import importlib.util
import json
from pathlib import Path
import re
import time
import urllib.request

spec = importlib.util.spec_from_file_location("keyboard", Path(__file__).with_name("android-keyboard-smoke.py"))
ui = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ui)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("apk")
    parser.add_argument("output", type=Path)
    parser.add_argument("--scenario", choices=["table", "history"], default="table")
    parser.add_argument("--server-port", type=int, default=4197)
    parser.add_argument("--expect-oom", action="store_true")
    parser.add_argument("--max-java-mib", type=int)
    parser.add_argument("--max-views", type=int)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    with urllib.request.urlopen(f"http://127.0.0.1:{args.server_port}/experimental/session", timeout=10) as response:
        sessions = json.load(response)
    assert {s["id"] for s in sessions} == {"seed-memory", "seed-table"}
    assert all(s["version"] == "0.0.0-mock" for s in sessions)

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
    sid = "seed-table" if args.scenario == "table" else "seed-memory"
    target = ui.wait(f"session-item-{sid}")
    ui.adb("logcat", "-c")
    heap_limit = ui.adb("shell", "getprop", "dalvik.vm.heapgrowthlimit").decode().strip()
    ui.tap(target)
    samples = []
    for i in range(16):
        if args.scenario == "history" and i == 4:
            ui.adb("shell", "input", "keyevent", "KEYCODE_HOME")
            time.sleep(1)
            ui.adb("shell", "am", "start", "-W", "-n", f"{ui.PACKAGE}/cc.agentlabs.opencode.MainActivity")
        data = ui.adb("shell", "dumpsys", "meminfo", ui.PACKAGE).decode(errors="replace")
        (args.output / f"meminfo-{i}.txt").write_text(data)
        sample = {"sample": i}
        for label in ("Dalvik Heap", "Native Heap"):
            match = re.search(r"^\s*" + label + r"\s+([\d\s]+)$", data, re.M)
            if match:
                numbers = [int(n) for n in match.group(1).split()]
                sample[label] = numbers[-2] * 1024
        views = re.search(r"Views:\s+(\d+)", data)
        if views:
            sample["views"] = int(views[1])
        samples.append(sample)
        time.sleep(2)
    logs = ui.adb("logcat", "-d", "-s", "AndroidRuntime:E", "libc:F").decode(errors="replace")
    (args.output / "crashes.txt").write_text(logs)
    (args.output / "screen.png").write_bytes(ui.adb("exec-out", "screencap", "-p"))
    result = {"scenario": args.scenario, "heap_limit": heap_limit, "oom": "OutOfMemoryError" in logs,
              "peak_java_allocated": max((s.get("Dalvik Heap", 0) for s in samples), default=0),
              "peak_views": max((s.get("views", 0) for s in samples), default=0), "samples": samples}
    (args.output / "results.json").write_text(json.dumps(result, indent=2) + "\n")
    print(json.dumps(result))
    if args.expect_oom:
        assert result["oom"], "Baseline did not reproduce an OOM"
    else:
        assert not result["oom"], "Memory scenario crashed"
        ui.wait("chat-message-input")
        if args.max_java_mib is not None:
            assert 0 < result["peak_java_allocated"] < args.max_java_mib * 1024 * 1024, "Java heap budget exceeded"
        if args.max_views is not None:
            assert 0 < result["peak_views"] < args.max_views, "Native view budget exceeded"


if __name__ == "__main__":
    main()
