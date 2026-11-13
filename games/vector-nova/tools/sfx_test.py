"""CPU-only regressions for the pinned SFX runtime compatibility fix."""

from contextlib import ExitStack, redirect_stdout
from io import StringIO
import math
from pathlib import Path
import sys
from tempfile import TemporaryDirectory
from types import SimpleNamespace
import unittest
from unittest.mock import patch

sys.dont_write_bytecode = True
import sfx


class DurationConditioningTests(unittest.TestCase):
    def setUp(self):
        self.stack = ExitStack()
        self.addCleanup(self.stack.close)
        root = Path(self.stack.enter_context(TemporaryDirectory()))
        self.entry = root / "optimized/mlx/scripts/sa3_mlx.py"
        self.entry.parent.mkdir(parents=True)
        self.pristine = (
            "seconds_embed = secs_embedder(args.seconds).astype(dtype)\n"
            "requested_samples = int(round(args.seconds * 44100))\n"
        )
        self.entry.write_text(self.pristine)
        self.stack.enter_context(patch.object(sfx, "ROOT", root))
        self.stack.enter_context(patch.object(sfx, "LOCK", {"runtimeRevision": "pin"}))
        self.stack.enter_context(patch.object(
            sfx.subprocess, "check_output", return_value=self.pristine,
        ))
        self.stack.enter_context(redirect_stdout(StringIO()))

    def test_conditioning_matches_training_without_changing_output_length(self):
        sfx.ensure_runtime_compatibility()
        for duration in (0.7, 1.2, 4.2, 4):
            with self.subTest(duration=duration):
                namespace = {
                    "math": math,
                    "args": SimpleNamespace(seconds=duration),
                    "dtype": None,
                    "secs_embedder": lambda value: SimpleNamespace(astype=lambda _: value),
                }
                exec(self.entry.read_text(), namespace)
                self.assertEqual(namespace["seconds_embed"], math.ceil(duration))
                self.assertEqual(namespace["requested_samples"], round(duration * 44100))
                self.assertEqual(namespace["args"].seconds, duration)

    def test_repeat_checks_leave_an_already_corrected_runtime_untouched(self):
        sfx.ensure_runtime_compatibility()
        corrected = self.entry.read_bytes()
        modified = self.entry.stat().st_mtime_ns
        sfx.ensure_runtime_compatibility()
        self.assertEqual(self.entry.read_bytes(), corrected)
        self.assertEqual(self.entry.stat().st_mtime_ns, modified)

    def test_unrecognized_local_runtime_edits_are_preserved(self):
        changed = self.pristine + "# local edit\n"
        self.entry.write_text(changed)
        with self.assertRaisesRegex(ValueError, "local changes"):
            sfx.ensure_runtime_compatibility()
        self.assertEqual(self.entry.read_text(), changed)


if __name__ == "__main__":
    unittest.main()
