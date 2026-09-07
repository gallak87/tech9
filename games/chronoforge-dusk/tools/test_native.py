"""Regression checks for rejecting stale/interrupted native test evidence."""
import copy
import json
from pathlib import Path
import tempfile
import unittest
from native import verify_test_report


class NativeReportChecks(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.path = Path(self.temp.name) / 'report.json'
        self.report = {'identity': {'test_run_id': 'fresh', 'source_sha256': 'tested-source', 'native_export': True, 'test_interference': False}, 'checks': [{'pass': True}], 'failures': 0}

    def verify(self, report):
        self.path.write_text(json.dumps(report))
        verify_test_report(self.path, 'fresh', 'tested-source', True)

    def test_completed_current_run(self):
        self.verify(self.report)

    def test_stale_wrong_build_or_interfered_run(self):
        for field, value in [('test_run_id', 'older-run'), ('source_sha256', 'older-source'), ('native_export', False), ('test_interference', True)]:
            with self.subTest(field=field), self.assertRaises(SystemExit):
                report = copy.deepcopy(self.report)
                report['identity'][field] = value
                self.verify(report)

    def test_missing_report_after_early_exit(self):
        with self.assertRaises(SystemExit):
            verify_test_report(self.path, 'fresh', 'tested-source', True)

    def test_empty_or_failed_result(self):
        for checks, failures in [([], 0), ([{'pass': False}], 0), ([{'pass': True}], 1)]:
            with self.subTest(checks=checks, failures=failures), self.assertRaises(SystemExit):
                report = dict(self.report, checks=checks, failures=failures)
                self.verify(report)


if __name__ == '__main__':
    unittest.main()
