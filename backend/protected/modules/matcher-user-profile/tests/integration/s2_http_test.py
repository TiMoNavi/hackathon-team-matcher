#!/usr/bin/env python3
"""Real loopback HTTP checks against s2_http_router.php and synthetic fixtures only."""
import http.cookiejar
import json
import struct
import sys
import urllib.error
import urllib.request
import uuid
import zlib

base = sys.argv[1]
fixture = json.loads(sys.argv[2])
assert base.startswith('http://127.0.0.1:')
passed = []

class Client:
    def __init__(self, user=None):
        self.opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
        self.csrf = None
        if user:
            status, body, _ = self.request('GET', '/__s2_test/login?id=' + str(user))
            assert status == 200
            self.csrf = body['csrf']

    def request(self, method, path, data=None, key=None, csrf=True, raw=None, content_type=None):
        headers = {}
        if csrf and self.csrf:
            headers['X-CSRF-Token'] = self.csrf
        if key:
            headers['Idempotency-Key'] = key
        if data is not None:
            raw = json.dumps(data).encode()
            content_type = 'application/json'
        if content_type:
            headers['Content-Type'] = content_type
        req = urllib.request.Request(base + path, data=raw, method=method, headers=headers)
        try:
            response = self.opener.open(req)
        except urllib.error.HTTPError as error:
            response = error
        payload = response.read()
        if 'application/json' in response.headers.get('Content-Type', ''):
            payload = json.loads(payload)
        return response.status, payload, response.headers

    def image(self, path, image, key=None):
        boundary = 'S2Boundary' + uuid.uuid4().hex
        body = ('--' + boundary + '\r\nContent-Disposition: form-data; name="file"; filename="test.png"\r\nContent-Type: image/png\r\n\r\n').encode() + image + ('\r\n--' + boundary + '--\r\n').encode()
        return self.request('POST', path, key=key or uuid.uuid4().hex, raw=body, content_type='multipart/form-data; boundary=' + boundary)

def check(label, condition):
    if not condition:
        raise AssertionError(label)
    passed.append(label)

def png(width, height):
    def chunk(kind, payload):
        return struct.pack('>I', len(payload)) + kind + payload + struct.pack('>I', zlib.crc32(kind + payload) & 0xffffffff)
    return b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', width, height, 8, 2, 0, 0, 0)) + chunk(b'IDAT', zlib.compress((b'\x00' + b'\x11\x99\xee' * width) * height)) + chunk(b'IEND', b'')

owner = Client(fixture['users']['owner'])
viewer = Client(fixture['users']['viewer'])
stranger = Client(fixture['users']['stranger'])
space = fixture['spaces'][0]
profile_path = '/api/v1/me/profile'

check('unauthenticated_json', Client().request('GET', profile_path)[0] == 401)
check('csrf_required', owner.request('POST', profile_path + '/drafts', {}, uuid.uuid4().hex, csrf=False)[0] == 400)
check('idempotency_key_required', owner.request('POST', profile_path + '/drafts', {})[0] == 400)
key = uuid.uuid4().hex
status, response, _ = owner.request('POST', profile_path + '/drafts', {}, key)
check('create_profile_draft', status == 201)
draft = response['data']
check('create_replay_same_resource', owner.request('POST', profile_path + '/drafts', {}, key)[1]['data']['id'] == draft['id'])
check('create_reject_key_reuse_payload', owner.request('POST', profile_path + '/drafts', {'base_profile_version': 0}, key)[0] == 409)
draft_path = profile_path + '/drafts/' + draft['id']
check('other_user_cannot_read_draft', viewer.request('GET', draft_path)[0] in [403, 404])
fields = [{'key': 'contact_wechat', 'value': 'synthetic_wechat'}, {'key': 'contact_phone', 'value': '+86 13800000000'}, {'key': 'personality', 'value': {'self_description': '喜欢先确认目标再分工'}}, {'key': 'project', 'value': {'title': '合成项目 A'}}, {'key': 'project', 'value': {'title': '合成项目 B'}}]
status, response, _ = owner.request('PUT', draft_path, {'expected_version': draft['draft_version'], 'fields': fields})
check('update_draft', status == 200)
draft = response['data']
confirm = {'expected_version': draft['draft_version'], 'base_revision': draft['base_revision'], 'confirmation_intent': 'confirm'}
status, response, _ = owner.request('POST', draft_path + '/confirm', confirm)
check('confirm_draft', status == 200)
profile = response['data']['profile']
check('default_authenticated_contacts', all(a['visibility'] == 'authenticated' for a in profile['attributes']))
check('independent_projects', len([a for a in profile['attributes'] if a['key'] == 'project']) == 2)
check('confirmation_exact_replay', owner.request('POST', draft_path + '/confirm', confirm)[1]['data']['confirmed_revision'] == profile['revision'])
check('history_read', owner.request('GET', profile_path + '/revisions/' + str(profile['revision']))[0] == 200)
check('space_member_profile_read', viewer.request('GET', '/api/v1/spaces/' + str(space) + '/profiles/' + str(fixture['users']['owner']))[0] == 200)
check('nonmember_profile_rejected', stranger.request('GET', '/api/v1/spaces/' + str(space) + '/profiles/' + str(fixture['users']['owner']))[0] == 403)
check('malformed_scope_array', owner.request('GET', profile_path + '?space_id[]=1')[0] == 422)
check('json_error_is_sanitized', owner.request('PUT', draft_path, raw=b'{', content_type='application/json')[1]['error']['code'] == 'INVALID_JSON')

status, image, _ = owner.image('/api/v1/me/avatar', png(1300, 900))
check('avatar_candidate_upload', status == 201 and image['data']['width'] == 1024)
avatar = image['data']['file_ref']
media_url = '/api/v1/profile-media/' + avatar
check('avatar_candidate_owner_only', viewer.request('GET', media_url)[0] == 404)
identity_version = owner.request('GET', '/api/v1/me')[1]['data']['identity_version']
status, response, _ = owner.request('PATCH', '/api/v1/me', {'expected_version': identity_version, 'nickname': '合成昵称', 'avatar_ref': avatar})
check('identity_confirm_avatar', status == 200)
check('identity_stale_conflict', owner.request('PATCH', '/api/v1/me', {'expected_version': identity_version, 'nickname': '旧版昵称'})[0] == 409)
status, image_bytes, headers = viewer.request('GET', media_url)
check('confirmed_avatar_read', status == 200 and isinstance(image_bytes, bytes) and image_bytes.startswith(b'\x89PNG'))
check('media_no_store', 'no-store' in headers.get('Cache-Control', ''))
check('avatar_disguised_image_rejected', owner.image('/api/v1/me/avatar', b'<?php echo 1; ?>')[0] == 422)
check('foreign_avatar_reference_rejected', viewer.request('PATCH', '/api/v1/me', {'expected_version': 0, 'avatar_ref': avatar})[0] == 422)

key = uuid.uuid4().hex
status, image, _ = owner.image('/api/v1/me/contact-qr', png(64, 64), key)
check('qr_upload', status == 201)
qr = image['data']['file_ref']
check('qr_upload_replay', owner.image('/api/v1/me/contact-qr', png(64, 64), key)[1]['data']['file_ref'] == qr)
qr_path = '/api/v1/profile-media/' + qr + '?space_id=' + str(space)
check('qr_candidate_hidden', viewer.request('GET', qr_path)[0] == 404)
status, response, _ = owner.request('POST', profile_path + '/drafts', {}, uuid.uuid4().hex)
draft = response['data']; draft_path = profile_path + '/drafts/' + draft['id']
status, response, _ = owner.request('PUT', draft_path, {'expected_version': draft['draft_version'], 'fields': [{'key': 'contact_wechat_qr', 'value': {'file_ref': qr}}]})
check('qr_reference_accepted', status == 200)
draft = response['data']
status, response, _ = owner.request('POST', draft_path + '/confirm', {'expected_version': draft['draft_version'], 'base_revision': draft['base_revision'], 'confirmation_intent': 'confirm'})
check('qr_confirmation', status == 200)
qr_attribute = next(a for a in response['data']['profile']['attributes'] if a['key'] == 'contact_wechat_qr')
check('qr_visible_after_confirmation', viewer.request('GET', qr_path)[0] == 200)
check('qr_requires_legal_space_entry', viewer.request('GET', '/api/v1/profile-media/' + qr)[0] == 403)
check('qr_stranger_denied', stranger.request('GET', qr_path)[0] == 403)
draft = owner.request('POST', profile_path + '/drafts', {}, uuid.uuid4().hex)[1]['data']; draft_path = profile_path + '/drafts/' + draft['id']
draft = owner.request('PUT', draft_path, {'expected_version': draft['draft_version'], 'fields': [{'op': 'delete', 'attribute_id': qr_attribute['attribute_id']} ]})[1]['data']
check('qr_delete_confirmation', owner.request('POST', draft_path + '/confirm', {'expected_version': draft['draft_version'], 'base_revision': draft['base_revision'], 'confirmation_intent': 'confirm'})[0] == 200)
check('deleted_qr_immediately_hidden', viewer.request('GET', qr_path)[0] == 404)
print(json.dumps({'passed': len(passed), 'checks': passed}, ensure_ascii=False))
