import importlib.util
import os
import sys
import unittest
from pathlib import Path

runner_path = Path(__file__).resolve().with_name("runner.py")
runner_spec = importlib.util.spec_from_file_location("newsreel_runner", runner_path)
if runner_spec is None or runner_spec.loader is None:
    raise ImportError(f"Cannot load runner module from {runner_path}")
runner_module = importlib.util.module_from_spec(runner_spec)
sys.modules[runner_spec.name] = runner_module
runner_spec.loader.exec_module(runner_module)
run_cmd = runner_module.run_cmd


@unittest.skipUnless(os.name == "nt", "The encoding mismatch is Windows-specific")
class RunCmdEncodingTests(unittest.TestCase):
    def test_run_cmd_replaces_unexpected_utf8_bytes_in_child_output(self):
        result = run_cmd(
            [
                sys.executable,
                "-c",
                "import sys; sys.stdout.buffer.write(bytes([0xEF]))",
            ],
            cwd=Path(__file__).resolve().parent,
        )

        self.assertEqual(result.returncode, 0)
        self.assertEqual(result.stdout, "\ufffd")


if __name__ == "__main__":
    unittest.main()
