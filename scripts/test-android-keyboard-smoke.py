#!/usr/bin/env python3
"""Fault-inject optional ADB diagnostics without weakening smoke assertions."""
import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("smoke", Path(__file__).with_name("android-keyboard-smoke.py"))
smoke = importlib.util.module_from_spec(spec)
spec.loader.exec_module(smoke)

PASS = [{"pass": True, "controls": {"input": {"above_keyboard": True}}}]
OVERLAP = [{"pass": False, "controls": {"input": {"above_keyboard": False}}}]


class DiagnosticsTest(unittest.TestCase):
    def invoke(self, results, output, *flags, run_error=None, diagnostics=None):
        with patch.object(smoke.sys, "argv", ["smoke", "test.apk", str(output), *flags]), \
             patch.object(smoke, "run", return_value=results, side_effect=run_error), \
             patch.object(smoke.subprocess, "run", side_effect=diagnostics) as capture:
            smoke.main()
        return capture

    @staticmethod
    def failed_logcat(command, **kwargs):
        if command[1] == "logcat":
            return subprocess.CompletedProcess(command, 255, b"partial log", b"logd closed")
        return subprocess.CompletedProcess(command, 0, b"screenshot", b"")

    def test_expected_overlap_survives_logcat_255_and_still_collects_screenshot(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory)
            capture = self.invoke(OVERLAP, output, "--expect-overlap", diagnostics=self.failed_logcat)
            self.assertEqual(capture.call_count, 2)
            self.assertEqual(json.loads((output / "results.json").read_text()), OVERLAP)
            self.assertEqual((output / "logcat.txt").read_bytes(), b"partial log")
            self.assertEqual((output / "last-screen.png").read_bytes(), b"screenshot")
            status = json.loads((output / "diagnostics-status.json").read_text())
            self.assertEqual(status["logcat.txt"]["returncode"], 255)
            self.assertEqual(status["logcat.txt"]["stderr"], "logd closed")

    def test_real_overlap_still_fails_when_logcat_also_fails(self):
        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaisesRegex(AssertionError, "Composer or send button"):
                self.invoke(OVERLAP, Path(directory), diagnostics=self.failed_logcat)

    def test_baseline_that_does_not_reproduce_overlap_still_fails(self):
        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaisesRegex(AssertionError, "Baseline did not reproduce"):
                self.invoke(PASS, Path(directory), "--expect-overlap", diagnostics=self.failed_logcat)

    def test_original_test_exception_survives_diagnostics_timeout_and_missing_adb(self):
        for error in (subprocess.TimeoutExpired(["adb"], 45), FileNotFoundError("adb missing")):
            with self.subTest(error=type(error).__name__), tempfile.TemporaryDirectory() as directory:
                output = Path(directory)
                with self.assertRaisesRegex(RuntimeError, "draft failed"):
                    self.invoke(None, output, run_error=RuntimeError("draft failed"), diagnostics=error)
                self.assertIn("error", json.loads((output / "diagnostics-status.json").read_text())["last-screen.png"])

    def test_successful_test_survives_optional_screenshot_failure(self):
        def capture(command, **kwargs):
            return subprocess.CompletedProcess(command, 255 if command[1] == "exec-out" else 0, b"data", b"")
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory)
            self.invoke(PASS, output, diagnostics=capture)
            self.assertFalse((output / "last-screen.png").exists())


if __name__ == "__main__":
    unittest.main()
