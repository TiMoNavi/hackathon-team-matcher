"""Characterization probes: PASS confirms current behavior, not production safety.
All scraper, MongoDB, and model operations below use in-memory doubles.
No external accounts, real participant data, or model calls are used.
"""
import contextlib
import io
import json
import os
from pathlib import Path
import sys
import unittest
from unittest.mock import MagicMock, patch

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT.parent / 'Matcha' / 'backend'))
os.environ['GEMINI_API_KEY'] = ''
os.environ['MONGODB_URI'] = 'mongodb://127.0.0.1:27017/?serverSelectionTimeoutMS=1000'
import app as target
from teammate_matcher import TeammateMatcher

class ReviewProbes(unittest.TestCase):
    def setUp(self):
        self.http = target.app.test_client()
        self.mongo = MagicMock()
        self.collection = self.mongo.__getitem__.return_value.__getitem__.return_value

    def test_anonymous_scrape_deletes_entire_collection(self):
        with patch.object(target, 'MongoClient', return_value=self.mongo), patch.object(target.DevpostScraperService, 'scrape_participants', return_value=([{'participant_id': 'synthetic', 'hackathon': 'review'}], 'review', None)):
            response = self.http.post('/api/scrape', json={'url': 'https://review.devpost.com/'})
        self.assertEqual(response.status_code, 200)
        self.collection.delete_many.assert_called_once_with({})

    def test_matching_uses_first_participant_without_identity(self):
        self.collection.find_one.return_value = {'participant_id': 'first-record', 'name': 'Synthetic first participant'}
        matcher = MagicMock()
        matcher.find_teammates.return_value = []
        with patch.object(target, 'GEMINI_API_KEY', 'test-placeholder'), patch.object(target, 'MongoClient', return_value=self.mongo), patch.object(target, 'TeammateMatcher', return_value=matcher):
            response = self.http.post('/api/find-teammates', json={'hackathon': 'review'})
        self.assertEqual(response.status_code, 200)
        matcher.find_teammates.assert_called_once_with(current_user_id='first-record', hackathon='review', top_n=10)

    def test_non_devpost_url_reaches_browser_driver(self):
        driver = MagicMock()
        driver.page_source = 'Please log in'
        with patch.object(target.webdriver, 'Chrome', return_value=driver), patch.object(target.time, 'sleep'), patch.object(target, 'DEVPOST_COOKIES', []):
            response = self.http.post('/api/scrape', json={'url': 'http://127.0.0.1:9/devpost.com'})
        self.assertEqual(response.status_code, 500)
        self.assertEqual(driver.get.call_args_list[0].args[0], 'http://127.0.0.1:9/devpost.com')
        self.assertEqual(response.get_json()['error'], 'Authentication failed - cookies may be expired')

    def test_malformed_json_becomes_500(self):
        response = self.http.post('/api/scrape', data='{', content_type='application/json')
        self.assertEqual(response.status_code, 500)

    def test_model_failure_silently_returns_fallback_matches(self):
        matcher = object.__new__(TeammateMatcher)
        matcher.model = MagicMock()
        matcher.model.generate_content.side_effect = RuntimeError('Synthetic model failure')
        with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
            matches = matcher._analyze_batch('Synthetic user', [{'participant_id': 'peer', 'name': 'Synthetic peer', 'skills': ['Python'], 'stats': {'projects': 2}}])
        self.assertEqual(matches[0]['match_score'], 25)
        self.assertNotIn('fallback', matches[0])

    def test_model_score_out_of_range_not_validated(self):
        matcher = object.__new__(TeammateMatcher)
        matcher.model = MagicMock()
        matcher.model.generate_content.return_value.text = json.dumps([{'candidate_id': 'peer', 'match_score': 10000, 'reason': 'Synthetic response'}])
        with contextlib.redirect_stdout(io.StringIO()):
            matches = matcher._analyze_batch('Synthetic user', [{'participant_id': 'peer', 'name': 'Synthetic peer'}])
        self.assertEqual(matches[0]['match_score'], 10000)

if __name__ == '__main__':
    stream = io.StringIO()
    suite = unittest.defaultTestLoader.loadTestsFromTestCase(ReviewProbes)
    with contextlib.redirect_stdout(io.StringIO()):
        result = unittest.TextTestRunner(stream=stream, verbosity=2).run(suite)
    report = 'PASS means the problematic behavior was reproduced. All external services were mocked.\n\n' + stream.getvalue()
    (ROOT / 'artifacts' / 'backend-review.txt').write_text(report)
    print(report)
    sys.exit(0 if result.wasSuccessful() else 1)
