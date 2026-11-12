#!/usr/bin/env python3
"""Independent N05 HTTP checks for root-owned synthetic 8113 fixtures only.

Input is private JSON on stdin, never command arguments. Root prepares identities,
starts the reviewed server, removes fixture memberships between phases, and owns
all SQL assertions. This script neither connects to a database nor authenticates
through an OAuth/email provider. It never prints credentials, tokens, or payloads.
"""
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
import json
import os
from pathlib import Path
import re
import secrets
import stat
import sys
import threading
import urllib.error
import urllib.parse
import urllib.request

BASE = 'http://127.0.0.1:8113'
ROLES = {'owner', 'member', 'target', 'outsider', 'racer_a', 'racer_b'}
TOKEN = re.compile(r'^[A-Za-z0-9_-]{43}$')
RESOURCE = re.compile(r'^(?:inv|receipt)-[a-f0-9]{32}$')
SAFE_CODE = re.compile(r'^[A-Z][A-Z0-9_]{0,63}$')
MAX_INPUT = 131072


class Refusal(Exception):
    pass


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise Refusal('redirect')


def require(condition):
    if not condition:
        raise Refusal('guard')


def valid_id(value):
    return type(value) is int and 0 < value <= 2147483647


def load_input():
    raw = sys.stdin.buffer.read(MAX_INPUT + 1)
    require(0 < len(raw) <= MAX_INPUT)
    value = json.loads(raw)
    require(isinstance(value, dict) and value.get('base_url') == BASE)
    require(value.get('fixture_kind') == 'n05-synthetic-v1')
    require(value.get('phase') in {'initial', 'revoked'})
    require(isinstance(value.get('actors'), dict) and set(value['actors']) == ROLES)
    for actor in value['actors'].values():
        require(isinstance(actor, dict))
        for field in ['cookie', 'csrf']:
            require(isinstance(actor.get(field), str) and 0 < len(actor[field]) <= 16384)
            require(not any(c in actor[field] for c in '\r\n\x00'))
    spaces = value.get('spaces')
    require(isinstance(spaces, dict) and set(spaces) == {'a', 'b'})
    require(all(valid_id(v) for v in spaces.values()) and spaces['a'] != spaces['b'])
    require(value.get('csrf_header', 'X-CSRF-Token') in {'X-CSRF-Token', 'X-Csrf-Token'})
    return value


def write_private(path, value):
    target = Path(path)
    require(target.is_absolute() and not target.is_symlink())
    parent = target.parent
    require(parent.is_dir() and parent.resolve() == parent)
    metadata = parent.stat()
    require(metadata.st_uid == os.getuid() and stat.S_IMODE(metadata.st_mode) & 0o077 == 0)
    flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW
    descriptor = os.open(target, flags, 0o600)
    with os.fdopen(descriptor, 'w', encoding='utf-8') as stream:
        json.dump(value, stream, separators=(',', ':'))
        stream.flush()
        os.fsync(stream.fileno())


class Audit:
    def __init__(self, config):
        self.config = config
        self.cases = []
        self.request_count = 0
        self.lock = threading.Lock()
        self.private_values = [v[f] for v in config['actors'].values() for f in ['cookie', 'csrf']]
        self.state = {'kind': 'n05-audit-state-v1', 'spaces': config['spaces']}

    def check(self, name, passed, result=None):
        row = {'case_id': name, 'pass': bool(passed)}
        if result is not None:
            row['http_status'] = result['status']
            if result['code']:
                row['safe_error_code'] = result['code']
        with self.lock:
            self.cases.append(row)
        return bool(passed)

    def request(self, role, method, path, body=None, key=None, csrf=True, raw=None, media='application/json'):
        require(path.startswith('/api/v1/') and not any(c in path for c in '\r\n\x00'))
        headers = {'Accept': 'application/json', 'Content-Type': media}
        if role is not None:
            actor = self.config['actors'][role]
            headers['Cookie'] = actor['cookie']
            if csrf:
                headers[self.config.get('csrf_header', 'X-CSRF-Token')] = actor['csrf']
        if key is not None:
            headers['Idempotency-Key'] = key
        data = raw if raw is not None else None if body is None else json.dumps(body, separators=(',', ':')).encode()
        request = urllib.request.Request(BASE + path, data=data, headers=headers, method=method)
        with self.lock:
            self.request_count += 1
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())
        try:
            try:
                response = opener.open(request, timeout=25)
            except urllib.error.HTTPError as error:
                response = error
            with response:
                status = response.code
                content = response.read(1048577)
                content_type = response.headers.get('Content-Type', '')
                cache = response.headers.get('Cache-Control', '')
            require(len(content) <= 1048576)
            text_value = content.decode('utf-8')
            payload = json.loads(text_value)
            require(isinstance(payload, dict))
            candidate_code = payload.get('error', {}).get('code', '') if isinstance(payload.get('error'), dict) else ''
            code = candidate_code if isinstance(candidate_code, str) and SAFE_CODE.fullmatch(candidate_code) and not any(value and value in candidate_code for value in self.private_values) else ''
            error_safe = status < 400 or not any(value and value in text_value for value in self.private_values)
            return {'status': status, 'code': code, 'payload': payload,
                    'json': 'application/json' in content_type.lower(), 'no_store': 'no-store' in cache.lower(),
                    'safe': error_safe and not any(marker in text_value for marker in ['SQLSTATE', '/Users/', 'Stack trace:'])}
        except Exception:
            return {'status': 0, 'code': 'TRANSPORT_OR_RESPONSE_FAILURE', 'payload': {}, 'json': False, 'no_store': False, 'safe': False}

    def expect(self, name, result, statuses, code=None):
        if isinstance(statuses, int):
            statuses = {statuses}
        ok = result['status'] in statuses and result['json'] and result['safe'] and result['no_store']
        if code is not None:
            ok = ok and result['code'] == code
        return self.check(name, ok, result)

    @staticmethod
    def data(result):
        value = result['payload'].get('data')
        return value if isinstance(value, dict) else {}

    @staticmethod
    def key():
        return 'audit-' + secrets.token_hex(16)

    def create(self, label, uses=3, space='a'):
        expires = (datetime.now(timezone.utc) + timedelta(hours=1)).strftime('%Y-%m-%dT%H:%M:%SZ')
        body = {'expires_at': expires, 'max_uses': uses, 'confirmation_intent': 'create_invitation'}
        key = self.key()
        result = self.request('owner', 'POST', f"/api/v1/events/{self.config['spaces'][space]}/invitation-codes", body, key)
        self.expect(label + '_created', result, 201)
        row = self.data(result)
        require(isinstance(row.get('token'), str) and TOKEN.fullmatch(row['token']))
        require(isinstance(row.get('invitation_id'), str) and RESOURCE.fullmatch(row['invitation_id']))
        self.private_values.append(row['token'])
        self.check(label + '_one_time_token', row.get('token_revealed') is True and row.get('uses') == 0 and row.get('version') == 1)
        return row, body, key

    def redeem(self, role, token, key=None):
        return self.request(role, 'POST', '/api/v1/event-invitations/redeem', {'token': token, 'confirmation_intent': 'join'}, key or self.key())

    def initial(self):
        a, b = self.config['spaces']['a'], self.config['spaces']['b']
        self.expect('guest_denied', self.request(None, 'GET', '/api/v1/me/events'), 401, 'AUTHENTICATION_REQUIRED')
        baseline = {}
        for role in ['owner', 'member', 'target', 'outsider', 'racer_a', 'racer_b']:
            result = self.request(role, 'GET', '/api/v1/me/events')
            self.expect(role + '_native_session', result, 200)
            rows = self.data(result).get('items', [])
            baseline[role] = {row.get('space_id') for row in rows if isinstance(row, dict)}
        require(self.check('synthetic_membership_baseline', baseline['owner'] == {a, b} and baseline['member'] == {a, b} and all(not baseline[r] for r in ['target', 'outsider', 'racer_a', 'racer_b'])))
        for role in ['member', 'target']:
            require(self.expect(role + '_initially_unselected', self.request(role, 'GET', '/api/v1/me/current-event'), 409, 'CURRENT_EVENT_REQUIRED'))
        page = self.request('member', 'GET', '/api/v1/me/events?limit=1')
        self.expect('member_first_page', page, 200)
        first = self.data(page)
        cursor = first.get('next_cursor')
        require(isinstance(cursor, str) and 0 < len(cursor) <= 4096)
        next_page = self.request('member', 'GET', '/api/v1/me/events?limit=1&cursor=' + urllib.parse.quote(cursor, safe=''))
        self.expect('member_second_page', next_page, 200)
        second = self.data(next_page)
        ids = [r.get('space_id') for r in first.get('items', []) + second.get('items', [])]
        self.check('pagination_exact_memberships', len(ids) == 2 and set(ids) == {a, b} and second.get('has_more') is False and second.get('next_cursor') is None)
        self.expect('foreign_cursor_denied', self.request('outsider', 'GET', '/api/v1/me/events?limit=1&cursor=' + urllib.parse.quote(cursor, safe='')), {400, 409, 422})
        self.expect('invalid_limit_denied', self.request('member', 'GET', '/api/v1/me/events?limit=49'), 422)
        self.expect('unknown_query_denied', self.request('member', 'GET', '/api/v1/me/events?actor_id=1'), 422)
        self.expect('read_method_denied', self.request('member', 'POST', '/api/v1/me/events', {}), 405)
        token = secrets.token_urlsafe(32)
        body = {'token': token, 'confirmation_intent': 'join'}
        self.private_values.append(token)
        self.expect('missing_csrf_denied', self.request('target', 'POST', '/api/v1/event-invitations/redeem', body, self.key(), csrf=False), {400, 403})
        self.expect('missing_key_denied', self.request('target', 'POST', '/api/v1/event-invitations/redeem', body), 400, 'IDEMPOTENCY_KEY_REQUIRED')
        self.expect('invalid_token_unavailable', self.redeem('target', token), 409, 'INVITATION_UNAVAILABLE')
        self.expect('malformed_token_denied', self.redeem('target', 'invalid token'), 422, 'INVALID_REQUEST')
        self.expect('unconfirmed_join_denied', self.request('target', 'POST', '/api/v1/event-invitations/redeem', {**body, 'confirmation_intent': 'preview'}, self.key()), 422, 'INVALID_REQUEST')
        self.expect('role_injection_denied', self.request('target', 'POST', '/api/v1/event-invitations/redeem', {**body, 'role': 'admin'}, self.key()), 422)
        self.expect('target_injection_denied', self.request('target', 'POST', '/api/v1/event-invitations/redeem', {**body, 'space_id': b}, self.key()), 422)
        for label, raw, media in [('array_body', b'[]', 'application/json'), ('invalid_json', b'{', 'application/json'), ('non_json', b'token=x', 'text/plain'), ('oversized_body', b'{' + b' ' * 20000 + b'}', 'application/json')]:
            self.expect(label + '_denied', self.request('target', 'POST', '/api/v1/event-invitations/redeem', key=self.key(), raw=raw, media=media), {400, 413, 415, 422})

        inv, create_body, create_key = self.create('primary')
        create_path = f'/api/v1/events/{a}/invitation-codes'
        self.expect('outsider_cannot_issue', self.request('outsider', 'POST', create_path, create_body, self.key()), 403, 'ACCESS_DENIED')
        replay = self.request('owner', 'POST', create_path, create_body, create_key)
        self.expect('create_replay', replay, 200)
        self.check('create_replay_no_token', self.data(replay).get('token') is None and self.data(replay).get('token_revealed') is False and self.data(replay).get('invitation_id') == inv['invitation_id'])
        self.expect('create_key_conflict', self.request('owner', 'POST', create_path, {**create_body, 'max_uses': 4}, create_key), 409, 'IDEMPOTENCY_CONFLICT')
        join_key = self.key()
        joined = self.redeem('target', inv['token'], join_key)
        self.expect('target_joined', joined, 200)
        receipt = self.data(joined)
        require(isinstance(receipt.get('receipt_id'), str) and RESOURCE.fullmatch(receipt['receipt_id']))
        self.check('target_join_effect', receipt.get('space_id') == a and receipt.get('outcome') == 'joined' and receipt.get('consumed_use') is True and receipt.get('membership_current') is True)
        self.expect('join_does_not_select', self.request('target', 'GET', '/api/v1/me/current-event'), 409, 'CURRENT_EVENT_REQUIRED')
        for label, key in [('same_key', join_key), ('new_key', self.key())]:
            repeated = self.redeem('target', inv['token'], key)
            self.expect('join_' + label + '_replay', repeated, 200)
            self.check('join_' + label + '_same_receipt', self.data(repeated) == receipt)
        self.expect('redeem_key_conflict', self.redeem('target', token, join_key), 409, 'IDEMPOTENCY_CONFLICT')
        self.expect('receipt_owner_read', self.request('target', 'GET', '/api/v1/event-invitation-receipts/' + receipt['receipt_id']), 200)
        self.expect('receipt_third_party_denied', self.request('outsider', 'GET', '/api/v1/event-invitation-receipts/' + receipt['receipt_id']), 404, 'RECEIPT_NOT_FOUND')
        existing = self.redeem('member', inv['token'])
        self.expect('existing_member_receipt', existing, 200)
        self.check('existing_member_zero_use', self.data(existing).get('outcome') == 'already_member' and self.data(existing).get('consumed_use') is False)
        count = self.request('owner', 'POST', create_path, create_body, create_key)
        self.expect('primary_usage_read', count, 200)
        self.check('primary_exactly_one_use', self.data(count).get('uses') == 1)

        revoked, _, _ = self.create('revocable', 1)
        revoke_path = '/api/v1/event-invitations/' + revoked['invitation_id'] + '/revoke'
        revoke_body = {'expected_version': 1, 'confirmation_intent': 'revoke_invitation'}
        self.expect('outsider_cannot_revoke', self.request('outsider', 'POST', revoke_path, revoke_body), 403, 'ACCESS_DENIED')
        self.expect('revoke_stale_cas', self.request('owner', 'POST', revoke_path, {**revoke_body, 'expected_version': 2}), 409, 'INVITATION_VERSION_CONFLICT')
        revoked_result = self.request('owner', 'POST', revoke_path, revoke_body)
        self.expect('revoke_success', revoked_result, 200)
        self.check('revoke_safe_dto', self.data(revoked_result).get('status') == 'revoked' and self.data(revoked_result).get('version') == 2 and 'token' not in self.data(revoked_result))
        self.expect('revoke_replay', self.request('owner', 'POST', revoke_path, revoke_body), 200)
        self.expect('revoked_token_unavailable', self.redeem('outsider', revoked['token']), 409, 'INVITATION_UNAVAILABLE')

        race, race_body, race_key = self.create('last_allowance', 1, 'b')
        barrier = threading.Barrier(2)
        def contender(role):
            barrier.wait(timeout=5)
            return role, self.redeem(role, race['token'])
        with ThreadPoolExecutor(max_workers=2) as pool:
            race_results = list(pool.map(contender, ['racer_a', 'racer_b']))
        self.check('last_allowance_exactly_one_winner', sorted(r['status'] for _, r in race_results) == [200, 409])
        for role, result in race_results:
            self.expect(role + '_race_response', result, {200, 409})
            if result['status'] == 409:
                self.check(role + '_loser_unavailable', result['code'] == 'INVITATION_UNAVAILABLE')
            else:
                self.check(role + '_winner_joined', self.data(result).get('outcome') == 'joined' and self.data(result).get('consumed_use') is True)
        race_view = self.request('owner', 'POST', f'/api/v1/events/{b}/invitation-codes', race_body, race_key)
        self.expect('race_usage_read', race_view, 200)
        self.check('race_exactly_one_use', self.data(race_view).get('uses') == 1)
        self.expect('exhausted_token_unavailable', self.redeem('outsider', race['token']), 409, 'INVITATION_UNAVAILABLE')

        current_path = '/api/v1/me/current-event'
        self.expect('nonmember_select_denied', self.request('outsider', 'PUT', current_path, {'space_id': a, 'expected_revision': None}), 403)
        selected = self.request('member', 'PUT', current_path, {'space_id': a, 'expected_revision': None})
        self.expect('member_select_a', selected, 200)
        first_revision = self.data(selected).get('selection_revision')
        require(isinstance(first_revision, str))
        to_b = self.request('member', 'PUT', current_path, {'space_id': b, 'expected_revision': first_revision})
        self.expect('member_select_b', to_b, 200)
        back = self.request('member', 'PUT', current_path, {'space_id': a, 'expected_revision': self.data(to_b).get('selection_revision')})
        self.expect('member_select_a_again', back, 200)
        self.check('selection_revision_changes_on_aba', len({first_revision, self.data(to_b).get('selection_revision'), self.data(back).get('selection_revision')}) == 3)
        self.expect('aba_old_request_rejected', self.request('member', 'PUT', current_path, {'space_id': b, 'expected_revision': first_revision}), 409, 'CONTEXT_CHANGED')
        target_selection = self.request('target', 'PUT', current_path, {'space_id': a, 'expected_revision': None})
        self.expect('target_explicit_select', target_selection, 200)
        self.state.update({'primary_token': inv['token'], 'primary_invitation_id': inv['invitation_id'], 'primary_create_body': create_body, 'primary_create_key': create_key, 'target_join_key': join_key, 'target_receipt_id': receipt['receipt_id'], 'target_membership_id': receipt.get('membership_id'), 'member_selection_revision': self.data(back).get('selection_revision'), 'target_selection_revision': self.data(target_selection).get('selection_revision')})

    def revoked(self):
        state = self.config.get('state')
        require(isinstance(state, dict) and state.get('kind') == 'n05-audit-state-v1' and state.get('spaces') == self.config['spaces'])
        require(isinstance(state.get('primary_token'), str) and TOKEN.fullmatch(state['primary_token']))
        require(isinstance(state.get('target_receipt_id'), str) and RESOURCE.fullmatch(state['target_receipt_id']))
        self.private_values.append(state['primary_token'])
        a, b = self.config['spaces']['a'], self.config['spaces']['b']
        recovery_revisions = {}
        for role, expected in [('target', set()), ('member', {b})]:
            result = self.request(role, 'GET', '/api/v1/me/events')
            self.expect(role + '_revoked_list', result, 200)
            self.check(role + '_revoked_membership_absent', {row.get('space_id') for row in self.data(result).get('items', [])} == expected)
            current = self.request(role, 'GET', '/api/v1/me/current-event')
            self.expect(role + '_old_current_denied', current, 403, 'CURRENT_EVENT_ACCESS_REVOKED')
            details = current['payload'].get('error', {}).get('details')
            valid_revision = isinstance(details, dict) and set(details) == {'selection_revision'} and isinstance(details.get('selection_revision'), str) and re.fullmatch(r'selection-[a-f0-9]{32}', details['selection_revision']) is not None
            self.check(role + '_revoked_response_only_own_revision', valid_revision and 'data' not in current['payload'])
            require(valid_revision)
            recovery_revisions[role] = details['selection_revision']
        result = self.request('target', 'GET', '/api/v1/event-invitation-receipts/' + state['target_receipt_id'])
        self.expect('revoked_receipt_historical_read', result, 200)
        self.check('revoked_receipt_not_current', self.data(result).get('membership_current') is False)
        for label, key in [('same_key', state['target_join_key']), ('new_key', self.key())]:
            result = self.redeem('target', state['primary_token'], key)
            self.expect('removed_' + label + '_replay', result, 200)
            self.check('removed_' + label + '_does_not_rejoin', self.data(result).get('membership_current') is False and self.data(result).get('receipt_id') == state['target_receipt_id'])
        self.expect('removed_selection_denied', self.request('target', 'PUT', '/api/v1/me/current-event', {'space_id': a, 'expected_revision': state['target_selection_revision']}), {403, 409})
        result = self.request('target', 'GET', '/api/v1/me/events')
        self.expect('post_replay_memberships_read', result, 200)
        self.check('post_replay_still_no_membership', self.data(result).get('items') == [])
        result = self.request('owner', 'POST', f'/api/v1/events/{a}/invitation-codes', state['primary_create_body'], state['primary_create_key'])
        self.expect('post_removal_invitation_read', result, 200)
        self.check('post_removal_uses_unchanged', self.data(result).get('uses') == 1)
        self.expect('recovery_null_revision_rejected', self.request('member', 'PUT', '/api/v1/me/current-event', {'space_id': b, 'expected_revision': None}), 409, 'CONTEXT_CHANGED')
        self.expect('recovery_stale_revision_rejected', self.request('member', 'PUT', '/api/v1/me/current-event', {'space_id': b, 'expected_revision': 'selection-' + '0' * 32}), 409, 'CONTEXT_CHANGED')
        recovered = self.request('member', 'PUT', '/api/v1/me/current-event', {'space_id': b, 'expected_revision': recovery_revisions['member']})
        self.expect('revoked_a_recover_to_legal_b', recovered, 200)
        self.check('recovery_new_selected_context', self.data(recovered).get('space_id') == b and self.data(recovered).get('selection_revision') != recovery_revisions['member'])
        self.expect('recovery_read_current_b', self.request('member', 'GET', '/api/v1/me/current-event'), 200)
        self.state = state

    def result(self):
        return {'kind': 'n05-independent-http-audit-v1', 'phase': self.config['phase'],
                'status': 'passed' if self.cases and all(c['pass'] for c in self.cases) else 'failed',
                'checks': len(self.cases), 'http_requests': self.request_count, 'cases': self.cases,
                'synthetic_native_sessions': True, 'real_provider_authentication': False,
                'database_access': False, 'external_network_calls': 0,
                'limits': ['DB atomicity and durable native side effects require root assertions.', 'Concurrent HTTP submissions do not prove transaction overlap on a single-worker server.', 'No real user, OAuth, mail, model or chat acceptance.']}


def main():
    audit = None
    try:
        config = load_input()
        audit = Audit(config)
        getattr(audit, config['phase'])()
        if config.get('state_output'):
            write_private(config['state_output'], audit.state)
        result = audit.result()
    except Exception:
        if audit is None:
            result = {'status': 'refused', 'reason': 'Input guard failed; private details suppressed.'}
        else:
            audit.check('execution_guard_or_required_precondition', False)
            result = audit.result()
    print(json.dumps(result, ensure_ascii=False, separators=(',', ':')))
    return 0 if result['status'] == 'passed' else 1


if __name__ == '__main__':
    sys.exit(main())
