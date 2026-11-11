#!/usr/bin/env python3
"""Parent-agent acceptance of optional contacts, partial confirmation and Space contexts."""
import http.cookiejar
import json
import sys
import urllib.error
import urllib.request
import uuid

base, fixture_text = sys.argv[1:3]
assert base.startswith('http://127.0.0.1:')
fixture = json.loads(fixture_text)
checks = []

def check(name, condition):
    if not condition:
        raise AssertionError(name)
    checks.append(name)

class Client:
    def __init__(self, user_id):
        self.http = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
        self.csrf = None
        status, body = self.call('GET', '/__s2_test/login?id=' + str(user_id))
        assert status == 200
        self.csrf = body['csrf']

    def call(self, method, path, data=None, key=None):
        headers = {'Accept': 'application/json'}
        if self.csrf:
            headers['X-CSRF-Token'] = self.csrf
        if key:
            headers['Idempotency-Key'] = key
        raw = None
        if data is not None:
            headers['Content-Type'] = 'application/json'
            raw = json.dumps(data).encode()
        request = urllib.request.Request(base + path, method=method, data=raw, headers=headers)
        try:
            response = self.http.open(request)
        except urllib.error.HTTPError as error:
            response = error
        return response.status, json.loads(response.read())

    def data(self, method, path, data=None, key=None):
        status, body = self.call(method, path, data, key)
        assert status in (200, 201), (path, status, body)
        assert isinstance(body['meta']['request_id'], str)
        return body['data']

owner = Client(fixture['users']['owner'])
viewer = Client(fixture['users']['viewer'])
space_a, space_b = fixture['spaces']
p = '/api/v1/me/profile'
initial = owner.data('GET', p)
check('new_profile_has_no_required_ordinary_field', all(f['required_when'] == [] for f in initial['field_definitions']))
check('global_catalog_has_27_field_types', len(initial['field_definitions']) == 27)
check('all_six_contacts_optional', len([f for f in initial['field_definitions'] if f['key'].startswith('contact_')]) == 6)

draft = owner.data('POST', p + '/drafts', {}, uuid.uuid4().hex)
dp = p + '/drafts/' + draft['id']
draft = owner.data('PUT', dp, {'expected_version': draft['draft_version'], 'fields': [
    {'key': 'personality', 'value': {'self_description': '先明确目标，再分工协作'}},
    {'key': 'communication_preference', 'value': {'codes': ['written_first'], 'free_text': '喜欢先写清思路'}},
    {'key': 'contact_qq', 'value': '123456789'},
    {'key': 'contact_email', 'value': 'synthetic@example.invalid'},
    {'key': 'contact_other', 'value': {'label': 'Matrix', 'value': '@synthetic:example.invalid'}},
]})
personality_id = next(x['attribute_id'] for x in draft['fields'] if x.get('key') == 'personality')
confirm = {'expected_version': draft['draft_version'], 'base_revision': draft['base_revision'], 'attribute_ids': [personality_id], 'confirmation_intent': 'confirm'}
result = owner.data('POST', dp + '/confirm', confirm)
check('partial_confirmation_publishes_only_selected_item', [x['key'] for x in result['profile']['attributes']] == ['personality'])
check('partial_confirm_replay_returns_same_result', owner.data('POST', dp + '/confirm', confirm) == result)
check('partial_confirm_other_fields_stay_unpublished', len(viewer.data('GET', '/api/v1/spaces/' + str(space_a) + '/profiles/' + str(fixture['users']['owner']))['global']['attributes']) == 1)
remaining = owner.data('GET', dp)
check('unselected_items_remain_editable', remaining['status'] == 'editing' and len(remaining['fields']) == 4 and remaining['base_revision'] == result['confirmed_revision'])
result = owner.data('POST', dp + '/confirm', {'expected_version': remaining['draft_version'], 'base_revision': remaining['base_revision'], 'confirmation_intent': 'confirm'})
global_before = owner.data('GET', p)
check('contacts_can_be_confirmed_without_other_profile_fields', len(global_before['attributes']) == 5)
check('new_confirmed_contacts_visible_by_default', all(a['visibility'] == 'authenticated' for a in global_before['attributes']))

context_a = '/api/v1/me/spaces/' + str(space_a) + '/profile-context'
context_b = '/api/v1/me/spaces/' + str(space_b) + '/profile-context'
check('new_space_context_is_empty', owner.data('GET', context_b)['attributes'] == [])
check('space_catalog_has_10_field_types', len(owner.data('GET', context_a)['field_definitions']) == 10)
pending = owner.data('POST', p + '/drafts', {'scope': 'space', 'space_id': space_a}, uuid.uuid4().hex)
pending_path = p + '/drafts/' + pending['id'] + '?space_id=' + str(space_a)
pending = owner.data('PUT', pending_path, {'expected_version': pending['draft_version'], 'fields': [{'key': 'event_constraint', 'value': '尚未确认的安排'}]})
result_a = owner.data('PUT', context_a, {'expected_version': 0, 'confirmation_intent': 'confirm', 'attributes': [
    {'key': 'event_goal', 'value': {'free_text': '做出可演示原型'}},
    {'key': 'event_time_commitment', 'value': {'hours_min': 10, 'hours_max': 20, 'period': 'event'}},
    {'key': 'event_collaboration_mode', 'value': {'mode': 'onsite'}},
]})
check('direct_context_save_does_not_confirm_old_draft', 'event_constraint' not in [x['key'] for x in result_a['profile']['attributes']])
check('old_space_draft_preserved', owner.data('GET', pending_path)['status'] == 'editing')
check('space_a_save_leaves_space_b_empty', owner.data('GET', context_b)['attributes'] == [])
result_b = owner.data('PUT', context_b, {'expected_version': 0, 'confirmation_intent': 'confirm', 'attributes': [{'key': 'event_goal', 'value': {'free_text': '找到长期合作者'}}]})
check('each_space_keeps_its_own_goal', result_a['profile']['attributes'][0]['value'] != result_b['profile']['attributes'][0]['value'])
check('space_compatibility_alias_maps_to_same_space', owner.data('GET', '/api/v1/me/events/' + str(space_a) + '/profile-context') == owner.data('GET', context_a))
check('space_changes_preserve_global_habits_and_contacts', owner.data('GET', p) == global_before)
view_a = viewer.data('GET', '/api/v1/spaces/' + str(space_a) + '/profiles/' + str(fixture['users']['owner']))
view_b = viewer.data('GET', '/api/v1/spaces/' + str(space_b) + '/profiles/' + str(fixture['users']['owner']))
check('same_global_profile_read_from_both_spaces', view_a['global']['attributes'] == view_b['global']['attributes'])
check('space_response_is_bound_to_requested_space', view_a['space']['space_id'] == space_a and view_b['space']['space_id'] == space_b)
check('stale_context_save_conflicts', owner.call('PUT', context_a, {'expected_version': 0, 'confirmation_intent': 'confirm', 'attributes': [{'key': 'event_goal', 'value': {'free_text': '旧内容'}}]})[0] == 409)
status, invalid = owner.call('PUT', context_a, {'expected_version': 1, 'confirmation_intent': 'confirm', 'attributes': [{'key': 'personality', 'value': {'self_description': '属于全局的习惯'}}]})
check('global_habit_cannot_be_saved_as_space_field', status == 422)
check('validation_error_has_request_id_and_retryable', invalid['error']['retryable'] is False and bool(invalid['meta']['request_id']))
check('failed_context_update_does_not_advance_revision', owner.data('GET', context_a)['revision'] == 1)
check('non_admin_cannot_create_proposals', viewer.call('POST', '/api/v1/admin/users/' + str(fixture['users']['owner']) + '/profile/proposals', {'fields': [{'key': 'bio', 'value': '待采纳文字'}]}, uuid.uuid4().hex)[0] == 403)

before = owner.data('GET', p)
qq = next(x for x in before['attributes'] if x['key'] == 'contact_qq')
draft = owner.data('POST', p + '/drafts', {}, uuid.uuid4().hex)
dp = p + '/drafts/' + draft['id']
draft = owner.data('PUT', dp, {'expected_version': draft['draft_version'], 'fields': [{'op': 'delete', 'attribute_id': qq['attribute_id']}]})
deleted = owner.data('POST', dp + '/confirm', {'expected_version': draft['draft_version'], 'base_revision': draft['base_revision'], 'confirmation_intent': 'confirm'})['profile']
check('optional_contact_can_be_explicitly_removed', 'contact_qq' not in [x['key'] for x in deleted['attributes']])
check('deleting_one_contact_preserves_other_values_and_ids', [x for x in before['attributes'] if x['key'] != 'contact_qq'] == deleted['attributes'])
historical = owner.data('GET', p + '/revisions/' + str(before['revision']))
check('prior_contact_remains_only_in_owner_history', any(x['key'] == 'contact_qq' for x in historical['attributes']))
print(json.dumps({'status': 'passed', 'checks': len(checks), 'passed': checks, 'preview_database_connected': False}, ensure_ascii=False, indent=2))
