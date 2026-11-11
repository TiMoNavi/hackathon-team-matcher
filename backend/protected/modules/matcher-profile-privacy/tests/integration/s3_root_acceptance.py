#!/usr/bin/env python3
"""Independent end-to-end acceptance of real relationship facts and profile privacy APIs."""
import http.cookiejar
import json
from pathlib import Path
import re
import subprocess
import sys
import urllib.error
import urllib.request
import uuid

base, database = sys.argv[1:3]
assert re.fullmatch(r'http://127[.]0[.]0[.]1:[0-9]+', base)
assert re.fullmatch(r'humhub_profile_s3_test_[a-z0-9_]+', database)
backend = Path(__file__).resolve().parents[5]
fixture = json.loads((backend / '.runtime/profile-s3' / database / 'root-fixture.json').read_text())
checks = []

def check(name, value):
    assert value, name
    checks.append(name)

class Client:
    def __init__(self, user_id=None):
        self.http = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
        self.csrf = None
        if user_id is not None:
            status, body, _ = self.call('GET', '/__s3_test/login?id=' + str(user_id))
            assert status == 200
            self.csrf = body['csrf']

    def call(self, method, path, data=None, key=None, csrf=True):
        headers = {'Accept': 'application/json'}
        if csrf and self.csrf:
            headers['X-CSRF-Token'] = self.csrf
        if key:
            headers['Idempotency-Key'] = key
        raw = None
        if data is not None:
            headers['Content-Type'] = 'application/json'
            raw = json.dumps(data).encode()
        request = urllib.request.Request(base + path, method=method, data=raw, headers=headers)
        try:
            response = self.http.open(request, timeout=20)
        except urllib.error.HTTPError as error:
            response = error
        body = response.read()
        if 'application/json' in response.headers.get('Content-Type', ''):
            body = json.loads(body)
        return response.status, body, dict(response.headers)

    def data(self, method, path, data=None, key=None):
        status, body, headers = self.call(method, path, data, key)
        assert status in (200, 201), (path, status, body)
        assert body['meta']['request_id'] and 'no-store' in headers.get('Cache-Control', '')
        return body['data']

def transition(action):
    result = subprocess.run([str(backend / '.runtime/php-mysql/bin/php'), '-c', str(backend / '.runtime/php.ini'),
                             str(Path(__file__).with_name('s3_root_fixture.php')), database, action], capture_output=True, text=True)
    assert result.returncode == 0, ('fixture transition failed', action, result.stderr)

def keys(profile):
    return {item['key'] for item in profile['attributes']}

owner_id = fixture['users']['owner']
owner = Client(owner_id)
viewer = Client(fixture['users']['viewer'])
friend = Client(fixture['users']['friend'])
public_reader = Client(fixture['users']['public_reader'])
legacy = Client(fixture['users']['legacy'])
anonymous = Client()
space_a, space_b = fixture['spaces']
profile_path = '/api/v1/profiles/' + str(owner_id)
space_path = '/api/v1/spaces/' + str(space_a) + '/profiles/' + str(owner_id)
contacts_path = space_path + '/contacts'
post_query = '?entry_type=public_post&post_id=' + str(fixture['post_id'])
media = '/api/v1/profile-media/' + fixture['qr_ref']
me = '/api/v1/me/profile'

check('anonymous_privacy_api_denied', anonymous.call('GET', me + '/preview')[0] == 401)
check('visibility_route_requires_patch', owner.call('GET', me + '/visibility')[0] == 405)
own = owner.data('GET', me)
check('owner_retains_all_37_type_catalog_scoped_to_27_globals', len(own['field_definitions']) == 27)
check('ordinary_fields_optional', all(not item['required_when'] for item in own['field_definitions']))
check('confirmed_native_values_really_persist', next(item['value'] for item in own['attributes'] if item['key'] == 'real_name') == 'Private Root Name')
check('identity_uses_persisted_confirmed_nickname', owner.data('GET', '/api/v1/me')['nickname'] == 'Synthetic teammate')
shown = viewer.data('GET', space_path)
check('one_way_friend_request_is_not_friendship', keys(shown['global']) == {'headline', 'project'})
check('hidden_field_definitions_are_absent', {item['key'] for item in shown['global']['field_definitions']} == keys(shown['global']))
check('current_space_context_is_only_current_space', keys(shown['space']) == {'event_goal'} and 'space-1-root-goal' not in json.dumps(shown))
check('native_private_name_never_leaks_through_profile', 'Private Root Name' not in json.dumps(shown))
check('contacts_use_separate_projection', all(not key.startswith('contact_') for key in keys(shown['global'])))
shown_contacts = viewer.data('GET', contacts_path)
check('new_confirmed_contacts_visible_by_default', keys(shown_contacts) == {'contact_wechat', 'contact_wechat_qr'})
check('same_space_qr_resource_visible_with_context', viewer.call('GET', media + '?space_id=' + str(space_a))[0] == 200)
check('qr_requires_valid_entry', public_reader.call('GET', media)[0] == 403)
check('cross_space_route_rejected', viewer.call('GET', '/api/v1/spaces/' + str(space_b) + '/profiles/' + str(owner_id))[0] == 403)
check('route_query_space_mismatch_rejected', viewer.call('GET', space_path + '?space_id=' + str(space_b))[0] == 422)
check('contact_route_query_space_mismatch_rejected', viewer.call('GET', contacts_path + '?space_id=' + str(space_b))[0] == 422)
friend_profile = friend.data('GET', profile_path + '?entry_type=friendship')
check('friends_keep_global_access_without_shared_space', keys(friend_profile['global']) == {'headline', 'bio', 'skill', 'project'} and friend_profile['space'] is None)
check('friend_contacts_include_friends_visible_email', 'contact_email' in keys(friend.data('GET', profile_path + '/contacts?entry_type=friendship')))
check('friendship_does_not_grant_space_membership', friend.call('GET', space_path + '?entry_type=friendship')[0] == 403)
check('arbitrary_profile_id_without_entry_denied', public_reader.call('GET', profile_path)[0] == 403)
check('public_post_author_entry_works_without_shared_space', keys(public_reader.data('GET', profile_path + post_query)['global']) == {'headline', 'project'})
check('public_post_contact_entry_uses_same_policy', keys(public_reader.data('GET', profile_path + '/contacts' + post_query)) == {'contact_wechat', 'contact_wechat_qr'})
check('public_post_qr_entry_works', public_reader.call('GET', media + post_query)[0] == 200)
check('post_author_must_match_target', public_reader.call('GET', '/api/v1/profiles/' + str(fixture['users']['viewer']) + post_query)[0] == 403)

owner_preview = owner.data('GET', me + '/preview?perspective=owner')
auth_preview = owner.data('GET', me + '/preview?perspective=authenticated')
friend_preview = owner.data('GET', me + '/preview?perspective=friends')
check('owner_preview_includes_private_fields', {'real_name', 'personality'} <= keys(owner_preview['profile']))
check('authenticated_preview_matches_actual_view', keys(auth_preview['profile']) == keys(shown['global']))
check('friend_preview_matches_actual_view', keys(friend_preview['profile']) == keys(friend_profile['global']))
check('preview_is_explicitly_simulated', owner_preview['simulated'] is True and friend_preview['simulated'] is True)
spoofed_preview = viewer.data('GET', me + '/preview?perspective=owner&owner_id=' + str(owner_id))
check('viewer_cannot_simulate_another_owners_private_profile', not spoofed_preview['profile']['attributes'])

draft = owner.data('POST', me + '/drafts', {}, uuid.uuid4().hex)
draft_path = me + '/drafts/' + draft['id']
pending = {'key': 'direction', 'value': {'code': 'pending', 'label': 'Unconfirmed research direction'}}
previous = next((item for item in draft['preview_attributes'] if item['key'] == 'direction' and item['value']['code'] == 'pending'), None)
if previous is not None:
    pending['attribute_id'] = previous['attribute_id']
draft = owner.data('PUT', draft_path, {'expected_version': draft['draft_version'], 'fields': [pending]})
check('pending_draft_does_not_publish_to_viewers', 'direction' not in keys(viewer.data('GET', space_path)['global']))
check('draft_preview_is_available_only_to_owner', owner.data('GET', me + '/preview?draft_id=' + draft['id'] + '&perspective=authenticated')['draft_id'] == draft['id'] and viewer.call('GET', me + '/preview?draft_id=' + draft['id'])[0] in (403, 404))
before_draft = owner.data('GET', draft_path)
changes = [{'attribute_id': fixture['attribute_ids'][key], 'visibility': 'private'} for key in ['contact_wechat', 'contact_wechat_qr']]
payload = {'expected_version': own['revision'], 'changes': changes, 'confirmation_intent': 'confirm'}
check('privacy_write_requires_csrf', owner.call('PATCH', me + '/visibility', payload, csrf=False)[0] == 400)
result = owner.data('PATCH', me + '/visibility', payload)
after = owner.data('GET', me)
check('privacy_change_advances_profile_revision', after['revision'] == own['revision'] + 1)
check('privacy_change_advances_permission_version', after['permission_version'] == own['permission_version'] + 1)
check('privacy_change_preserves_content_confirmation_times', {a['attribute_id']: a['last_confirmed_at'] for a in after['attributes']} == {a['attribute_id']: a['last_confirmed_at'] for a in own['attributes']})
after_draft = owner.data('GET', draft_path)
check('privacy_change_does_not_edit_or_confirm_pending_draft', all(after_draft[key] == before_draft[key] for key in ['id', 'draft_version', 'base_revision', 'fields', 'status']))
check('privacy_update_rejects_stale_revision', owner.call('PATCH', me + '/visibility', payload)[0] == 409)
check('contacts_revoked_immediately', not viewer.data('GET', contacts_path)['attributes'])
check('qr_revoked_immediately', viewer.call('GET', media + '?space_id=' + str(space_a))[0] == 404)
check('owner_keeps_private_qr_access', owner.call('GET', media)[0] == 200)
restore = {'expected_version': after['revision'], 'changes': [{**item, 'visibility': 'authenticated'} for item in changes], 'confirmation_intent': 'confirm'}
owner.data('PATCH', me + '/visibility', restore)

transition('friendship_remove')
check('removed_friend_loses_friend_entry_immediately', friend.call('GET', profile_path + '?entry_type=friendship')[0] == 403)
check('removed_friend_loses_contact_entry_immediately', friend.call('GET', profile_path + '/contacts?entry_type=friendship')[0] == 403)
transition('friendship_restore')
check('future_effective_friend_gets_dynamic_friends_fields', 'bio' in keys(friend.data('GET', profile_path + '?entry_type=friendship')['global']))
transition('block')
check('block_denies_same_space_profile', viewer.call('GET', space_path)[0] == 403)
check('block_denies_contacts', viewer.call('GET', contacts_path)[0] == 403)
check('block_denies_media', viewer.call('GET', media + '?space_id=' + str(space_a))[0] == 403)
transition('unblock')
transition('member_remove')
check('removed_member_loses_space_profile', viewer.call('GET', space_path)[0] == 403)
check('removed_member_can_use_independent_public_post_entry', viewer.call('GET', profile_path + post_query)[0] == 200)
transition('member_restore')
transition('post_private')
check('post_visibility_change_revokes_author_entry', public_reader.call('GET', profile_path + post_query)[0] == 403)
check('post_visibility_change_revokes_contact_media', public_reader.call('GET', media + post_query)[0] == 403)
transition('post_public')

legacy_own = legacy.data('GET', me)
check('unconfirmed_native_values_remain_owner_candidates', any(item['key'] == 'real_name' for item in legacy_own['legacy_candidates']))
legacy_view = viewer.data('GET', '/api/v1/spaces/' + str(space_a) + '/profiles/' + str(fixture['users']['legacy']))
check('unconfirmed_legacy_values_are_not_public', not legacy_view['global']['attributes'] and 'Legacy secret' not in json.dumps(legacy_view))
print(json.dumps({'status': 'passed', 'passed': len(checks), 'checks': checks}, ensure_ascii=False))
