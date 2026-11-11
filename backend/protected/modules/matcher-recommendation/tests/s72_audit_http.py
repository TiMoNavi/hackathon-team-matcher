#!/usr/bin/env python3
"""Independent real HTTP + allocated MySQL audit. Only synthetic users and loopback 8101."""
import datetime as dt
import http.cookiejar
import json
import os
from pathlib import Path
import subprocess
import time
import urllib.error
import urllib.parse
import urllib.request

ROOT = Path(__file__).resolve().parents[5]
DB = 'humhub_profile_s72_test_audit_b0c7d9a2'
ORIGIN = 'http://127.0.0.1:8101'
PHP = ROOT / 'backend/.runtime/php-mysql/bin/php'
PHP_INI = ROOT / 'backend/.runtime/php.ini'
SQL = Path(__file__).with_name('s72_audit_sql.php')
DATA = json.loads((ROOT / 'docs/用户画像收集/examples/s7-people_2026-11-12.json').read_text())
CHECKS = []
REQUESTS = 0
def check(ok, name):
    if not ok: raise AssertionError(name)
    CHECKS.append(name)
def sql(action='metadata', value=''):
    run = subprocess.run([str(PHP), '-c', str(PHP_INI), str(SQL), DB, action, value], cwd=ROOT, env={**os.environ, 'MATCHER_S72_TEST_DB': DB}, capture_output=True, text=True)
    if run.returncode: raise AssertionError('Independent SQL fixture command failed: ' + action + '; ' + (run.stdout + run.stderr)[-1500:])
    return json.loads(run.stdout)
class Client:
    def __init__(self, user_id=None):
        self.opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
        self.csrf = None
        if user_id is not None:
            status, payload, _ = self.request('/__s72_test/login', query={'id': user_id})
            if status != 200 or payload.get('user_id') != user_id: raise AssertionError('Synthetic fixture login failed')
            self.csrf = payload['csrf']
    def request(self, path, method='GET', body=None, query=None, csrf=True):
        global REQUESTS
        REQUESTS += 1
        if not path.startswith('/') or path.startswith('//'): raise AssertionError('Only explicit loopback paths are allowed')
        url = ORIGIN + path + (('?' + urllib.parse.urlencode(query)) if query else '')
        headers = {'Accept': 'application/json'}
        raw = None
        if body is not None:
            raw = json.dumps(body).encode(); headers['Content-Type'] = 'application/json'
        if csrf and self.csrf: headers['X-CSRF-Token'] = self.csrf
        request = urllib.request.Request(url, data=raw, headers=headers, method=method)
        try: response = self.opener.open(request, timeout=60)
        except urllib.error.HTTPError as error: response = error
        raw_response = response.read().decode()
        try: payload = json.loads(raw_response)
        except json.JSONDecodeError: raise AssertionError('Expected JSON from local API, status=' + str(response.status) + '; snippet=' + raw_response[:400])
        return response.status, payload, dict(response.headers)
    def ok(self, path, method='GET', body=None, query=None):
        status, payload, headers = self.request(path, method, body, query)
        if status not in (200, 201): raise AssertionError('Expected 200 for ' + path + ': ' + json.dumps(payload, ensure_ascii=False))
        if not isinstance(payload.get('meta', {}).get('request_id'), str): raise AssertionError('Missing request_id')
        if 'no-store' not in headers.get('Cache-Control', ''): raise AssertionError('Missing no-store')
        return payload['data']
    def error(self, path, expected, code=None, **kwargs):
        status, payload, _ = self.request(path, **kwargs)
        valid = status == expected and 'data' not in payload and isinstance(payload.get('error'), dict) and (code is None or payload['error']['code'] == code)
        if not valid: raise AssertionError('HTTP mismatch for ' + path + ': expected ' + str(expected) + '/' + str(code) + ', actual ' + str(status) + '/' + str(payload.get('error', {}).get('code')))
        check(valid, 'HTTP rejects ' + path + ' with ' + str(expected) + (('/' + code) if code else ''))
        check(isinstance(payload.get('meta', {}).get('request_id'), str) and {'code','message','retryable','details'} <= payload['error'].keys(), 'error uses the complete documented envelope')
    def select(self, space_id):
        status, payload, _ = self.request('/api/v1/me/current-event')
        revision = payload['data']['selection_revision'] if status == 200 else None
        return self.ok('/api/v1/me/current-event', 'PUT', {'space_id': space_id, 'expected_revision': revision})
    def all(self, space, filters=None, sort='recent', limit=24):
        query = {'sort': sort, 'limit': limit}
        if filters is not None: query['filters'] = json.dumps(filters)
        people = []; pages = 0
        while True:
            result = self.ok('/api/v1/events/' + str(space) + '/discovery', query=query)
            people += result['items']; pages += 1
            if pages > 10: raise AssertionError('Unexpected endless pagination')
            if not result['has_more']:
                if result['next_cursor'] is not None or not result['exhausted']: raise AssertionError('Bad final-page state')
                return people, pages
            query['cursor'] = result['next_cursor']

def run():
    started = time.monotonic(); manifest = sql(); fixtures = sql('fixtures'); users = manifest['users']; primary = manifest['spaces']['primary']; secondary = manifest['spaces']['secondary']
    outdir = ROOT / 'docs/用户画像收集/sources'
    (outdir / 's72_audit_sql_before_2026-11-12.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
    before_effects = sql('side_effects')
    check(manifest['counts'] == {'primary': {'members':100,'optin':90}, 'secondary': {'members':20,'optin':18}}, 'allocated MySQL clone retains exact 100/20 synthetic members and 90/18 opt-ins')
    guest = Client(); viewer = Client(users['81']); owner = Client(users['82']); author = Client(users['83'])
    base = f'/api/v1/events/{primary}/profiles/{users["82"]}'
    overview = base + '/overview'; relation = base + '/relations'; presentation = '/api/v1/me/profile/presentation'; sharing = '/api/v1/me/profile/relation-sharing'
    guest.error(overview, 401, 'AUTHENTICATION_REQUIRED'); guest.error(presentation, 401, 'AUTHENTICATION_REQUIRED')
    viewer.select(primary); owner.select(primary); author.select(primary)
    check(viewer.ok(overview)['owner_id'] == users['82'], 'normal overview route accepts server path parameters without query')
    check(viewer.ok(relation)['items'] == [], 'uninitialized activity relation is private to its owner')
    for path in [overview, relation]:
        for key in ['spaceId','ownerId','actor_id','space_id']:
            viewer.error(path, 422, 'UNKNOWN_QUERY_FIELD', query={key:users['81']})
    viewer.error(presentation, 422, 'UNKNOWN_QUERY_FIELD', query={'owner_id': users['82']})
    viewer.error('/api/v1/me/profile/presentation/extra', 404, 'NOT_FOUND')
    school, school2 = fixtures['education']; link, link2 = fixtures['portfolio']; old_presentation = owner.ok(presentation)
    selection = {'expected_version':old_presentation['version'], 'education_attribute_id':school, 'primary_portfolio_attribute_id':link, 'confirmation_intent':'confirm'}
    owner.error(presentation, 400, 'INVALID_REQUEST', method='PUT', body=selection, csrf=False)
    owner.error(presentation, 422, 'CONFIRMATION_REQUIRED', method='PUT', body={k:v for k,v in selection.items() if k != 'confirmation_intent'})
    other_profile = author.ok('/api/v1/me/profile'); other_school = next(a['attribute_id'] for a in other_profile['attributes'] if a['key'] == 'education')
    owner.error(presentation, 422, 'INVALID_PRESENTATION_SELECTION', method='PUT', body={**selection, 'education_attribute_id':other_school})
    p = owner.ok(presentation, 'PUT', selection)
    owner.error(presentation, 409, 'PRESENTATION_CONFLICT', method='PUT', body=selection)
    pview = viewer.ok(overview)
    check(pview['school_overview']['attribute_id'] == school and pview['primary_portfolio_link']['attribute_id'] == link, 'overview selects exact confirmed school and primary portfolio references')
    check(link2 in [a['attribute_id'] for a in pview['additional_portfolio_links']], 'additional work remains separate from selected primary')
    check(pview['global']['scope'] == 'global' and pview['space']['space_id'] == primary, 'overview clearly separates global and current-Space sections')
    check(all(not a['key'].startswith('event_') for a in pview['global']['attributes']) and all(a['key'].startswith('event_') for a in pview['space']['attributes']), 'Space intentions never merge into global capabilities')
    check('"key": "contact_' not in json.dumps(pview) and 'editing_draft' not in json.dumps(pview) and 'legacy_candidates' not in json.dumps(pview), 'overview excludes contacts draft state and legacy source candidates in every section')
    primary_intent = pview['space']['attributes']
    def visibility(value):
        current = owner.ok('/api/v1/me/profile')
        live = {a['attribute_id'] for a in current['attributes']}; changes = [{'attribute_id':aid,'visibility':value} for aid in [school,link] if aid in live]
        if not changes: return current
        return owner.ok('/api/v1/me/profile/visibility', 'PATCH', {'expected_version':current['revision'], 'changes':changes, 'confirmation_intent':'confirm'})
    def share(kind, object_id, visibility, expected=0):
        return owner.ok(sharing, 'PUT', {'expected_version':expected, 'kind':kind, 'object_id':str(object_id), 'visibility':visibility, 'confirmation_intent':'confirm'}, {'space_id':primary})
    activity_state = None; activities = []; changed_presentation = p
    try:
        for vis in ['private','friends']:
            visibility(vis); read = viewer.ok(overview)
            check(read['school_overview'] is None and read['primary_portfolio_link'] is None, 'selected hidden '+vis+' references become null without fallback')
            check(link2 in [a['attribute_id'] for a in read['additional_portfolio_links']], 'alternative visible work does not become primary after '+vis+' restriction')
        sql('relationship','friend'); read = viewer.ok(overview)
        check(read['school_overview']['attribute_id'] == school and read['primary_portfolio_link']['attribute_id'] == link, 'real mutual friendship reveals selected friends-only school and work')
        sql('relationship','pending_out'); check(viewer.ok(overview)['school_overview'] is None, 'pending request is not equivalent to effective friendship')
        sql('relationship','none'); visibility('authenticated')
        changed_presentation = owner.ok(presentation, 'PUT', {'expected_version':p['version'], 'education_attribute_id':None, 'primary_portfolio_attribute_id':None, 'confirmation_intent':'confirm'})
        check(viewer.ok(overview)['primary_portfolio_link'] is None and viewer.ok(overview)['school_overview'] is None, 'explicit null selection persists without native or first-visible fallback')
        changed_presentation = owner.ok(presentation, 'PUT', {'expected_version':changed_presentation['version'], 'education_attribute_id':school,'primary_portfolio_attribute_id':link,'confirmation_intent':'confirm'})
        own = owner.ok(sharing, query={'space_id':primary})
        check(len(own['items']) == 1 and own['items'][0]['id'] == str(primary) and own['items'][0]['visibility'] == 'private' and own['items'][0]['sharing_version'] == 0, 'own activity relation defaults private and refers only to current Space')
        sharebody = {'expected_version':0,'kind':'activities','object_id':str(primary),'visibility':'authenticated','confirmation_intent':'confirm'}
        owner.error(sharing, 400, 'INVALID_REQUEST', method='PUT', body=sharebody, query={'space_id':primary}, csrf=False)
        owner.error(sharing, 422, 'CONFIRMATION_REQUIRED', method='PUT', body={k:v for k,v in sharebody.items() if k != 'confirmation_intent'}, query={'space_id':primary})
        activity_state = share('activities',primary,'authenticated')
        owner.error(sharing,409,'RELATION_SHARING_CONFLICT',method='PUT',body=sharebody,query={'space_id':primary})
        check([a['id'] for a in viewer.ok(relation)['items']] == [str(primary)], 'explicit per-activity sharing exposes only currently selected activity')
        owner.error(sharing,404,'RELATION_NOT_FOUND',method='PUT',body={**sharebody,'object_id':str(secondary)},query={'space_id':primary})
        sql('hide_members','hide'); check(viewer.ok(relation)['items'] == [], 'native Space hideMembers revokes even explicitly shared activity'); sql('hide_members','show')
        activity_state = share('activities',primary,'friends',activity_state['version']); check(viewer.ok(relation)['items'] == [], 'friends activity relation remains hidden from nonfriend')
        sql('relationship','friend'); check(len(viewer.ok(relation)['items']) == 1,'new friend can dynamically read friends activity relation'); sql('relationship','none')
        activity_state = share('activities',primary,'authenticated',activity_state['version'])
        viewer.select(secondary)
        viewer.error(overview,403,'PROFILE_ACCESS_DENIED'); viewer.error(relation,403,'PROFILE_ACCESS_DENIED')
        secondary_view = viewer.ok(f'/api/v1/events/{secondary}/profiles/{users["82"]}/overview')
        check(secondary_view['space']['attributes'] != primary_intent and secondary_view['space']['space_id'] == secondary, 'switching Space loads separately stored intentions')
        check(viewer.ok(f'/api/v1/events/{secondary}/profiles/{users["82"]}/relations')['items'] == [], 'second Space does not inherit first Space relation opt-in')
        viewer.select(primary)
        for block in ['outgoing','incoming','space']:
            sql('owner_block',block); viewer.error(overview,403,'PROFILE_ACCESS_DENIED'); viewer.error(relation,403,'PROFILE_ACCESS_DENIED')
        sql('owner_block','none'); sql('owner_membership','remove'); viewer.error(overview,403,'PROFILE_ACCESS_DENIED'); viewer.error(relation,403,'PROFILE_ACCESS_DENIED'); sql('owner_membership','restore')
        sql('viewer_membership','remove'); viewer.error(overview,403,'PROFILE_ACCESS_DENIED'); viewer.error(relation,403,'PROFILE_ACCESS_DENIED'); sql('viewer_membership','restore')
        settings = f'/api/v1/me/events/{primary}/discovery-settings'; os = owner.ok(settings)
        owner.ok(settings,'PUT',{'expected_version':os['version'],'discoverable':False})
        viewer.error(overview,403,'PROFILE_ACCESS_DENIED'); viewer.error(relation,403,'PROFILE_ACCESS_DENIED')
        check(owner.ok(f'/api/v1/events/{primary}/profiles/{users["82"]}/overview')['owner_id'] == users['82'], 'owner can read self overview while discovery is off')
        ns=owner.ok(settings); owner.ok(settings,'PUT',{'expected_version':ns['version'],'discoverable':True})
        vs=viewer.ok(settings); viewer.ok(settings,'PUT',{'expected_version':vs['version'],'discoverable':False}); check(viewer.ok(overview)['owner_id']==users['82'],'viewer discovery opt-out does not remove browse eligibility'); ns=viewer.ok(settings); viewer.ok(settings,'PUT',{'expected_version':ns['version'],'discoverable':vs['discoverable']})
        draft_path='/api/v1/me/ideas/drafts'; fields={'title':'s72_audit Formal Synthetic Idea','summary':'s72_audit Explicit formal summary; no chat content.'}
        author.error(draft_path,400,'INVALID_REQUEST',method='POST',body={'fields':fields},csrf=False)
        author.error(draft_path,422,'UNKNOWN_FIELD',method='POST',body={'fields':fields,'owner_id':users['82']})
        draft=author.ok(draft_path,'POST',{'fields':fields,'raw_text':'s72_audit Private draft sentinel'})
        owner.error(draft_path+'/'+str(draft['id']),404,'IDEA_DRAFT_NOT_FOUND')
        author.error(draft_path+'/'+str(draft['id']),422,'UNKNOWN_QUERY_FIELD',query={'draftId':1})
        confirmation=author.ok(draft_path+'/'+str(draft['id'])+'/confirm','POST',{'expected_version':draft['version']}); idea_id=confirmation['idea_id']
        author.error(draft_path+'/'+str(draft['id'])+'/confirm',409,'IDEA_VERSION_CONFLICT',method='POST',body={'expected_version':draft['version']})
        owner.error(f'/api/v1/ideas/{idea_id}/activities',404,'IDEA_NOT_FOUND',method='POST',body={'event_id':primary,'expected_version':confirmation['version']})
        activity=author.ok(f'/api/v1/ideas/{idea_id}/activities','POST',{'event_id':primary,'expected_version':confirmation['version']}); activities.append(activity)
        check(activity['members_visible'] is False and not activity['conversation_bound'] and not activity['open_to_discussion'],'formal publication defaults hidden members and creates no discussion')
        detail_path=f'/api/v1/ideas/{idea_id}'; detail_query={'idea_activity_id':activity['id']}
        detail=viewer.ok(detail_path,query=detail_query); check(detail['title']==fields['title'] and detail['summary']==fields['summary'] and not detail['conversation_available'],'unbound formal metadata is available to legal Space viewer without chat access')
        viewer.error(detail_path,422,'UNKNOWN_QUERY_FIELD',query={**detail_query,'ideaId':999})
        binding={'expected_version':activity['version'],'message_id':fixtures['messages']['legal'],'confirmation_intent':'bind_existing_conversation'}
        author.error(f'/api/v1/idea-activities/{activity["id"]}/messenger',400,'INVALID_REQUEST',method='PUT',body=binding,csrf=False)
        author.error(f'/api/v1/idea-activities/{activity["id"]}/messenger',422,'IDEA_BINDING_CONFIRMATION_REQUIRED',method='PUT',body={k:v for k,v in binding.items() if k!='confirmation_intent'})
        author.error(f'/api/v1/idea-activities/{activity["id"]}/messenger',403,'IDEA_CONVERSATION_DENIED',method='PUT',body={**binding,'message_id':fixtures['messages']['wrong_creator']})
        activity=author.ok(f'/api/v1/idea-activities/{activity["id"]}/messenger','PUT',binding); activities[-1]=activity
        check(viewer.ok(relation,query={'kind':'idea_groups'})['items']==[],'binding cannot bypass both author and owner disclosure defaults')
        activity=author.ok(f'/api/v1/idea-activities/{activity["id"]}','PUT',{'expected_version':activity['version'],'members_visible':True}); activities[-1]=activity
        check(viewer.ok(relation,query={'kind':'idea_groups'})['items']==[],'author permits member display but owner default private still hides relation')
        candidates=owner.ok(sharing,query={'space_id':primary,'kind':'idea_groups'}); selected=next(a for a in candidates['items'] if a['id']==str(activity['id']))
        check(selected['visibility']=='private' and selected['sharing_version']==0,'participating owner sees default-private candidate with version zero')
        share('idea_groups',activity['id'],'authenticated')
        items=viewer.ok(relation,query={'kind':'idea_groups'})['items']; match=next(a for a in items if a['id']==str(activity['id']))
        check(match['title']==fields['title'] and match['summary']==fields['summary'] and not match['conversation_available'],'both parties allow formal participant metadata without giving viewer chat access')
        check('message_id' not in json.dumps(items) and 'private conversation' not in json.dumps(items) and 'Private draft sentinel' not in json.dumps(items),'public relation payload excludes raw conversation id chat title and private draft')
        check(owner.ok(detail_path,query=detail_query)['conversation_available'] is True,'actual participant retains native conversation availability')
        sql('conversation_author','remove'); check(viewer.ok(relation,query={'kind':'idea_groups'})['items']==[],'creator leaving existing conversation immediately revokes relation'); sql('conversation_author','restore')
        second=author.ok(draft_path,'POST',{'fields':{'title':'s72_audit Second Formal Idea','summary':'s72_audit Second formal summary'}}); second=author.ok(draft_path+'/'+str(second['id'])+'/confirm','POST',{'expected_version':second['version']})
        a2=author.ok(f'/api/v1/ideas/{second["idea_id"]}/activities','POST',{'event_id':primary,'expected_version':second['version'],'members_visible':True}); activities.append(a2)
        author.error(f'/api/v1/idea-activities/{a2["id"]}/messenger',409,'IDEA_CONVERSATION_ALREADY_BOUND',method='PUT',body={**binding,'expected_version':a2['version']})
        a2=author.ok(f'/api/v1/idea-activities/{a2["id"]}/messenger','PUT',{**binding,'expected_version':a2['version'],'message_id':fixtures['messages']['second']}); activities[-1]=a2; share('idea_groups',a2['id'],'authenticated')
        first=viewer.ok(relation,query={'kind':'idea_groups','limit':1}); token=first['next_cursor']; last=viewer.ok(relation,query={'kind':'idea_groups','limit':1,'cursor':token})
        check(len(first['items'])==1 and last['items'][0]['id']!=first['items'][0]['id'] and not last['has_more'],'real relation cursor paginates two authorized objects without duplication')
        viewer.error(relation,409,'RELATION_CURSOR_INVALID',query={'kind':'idea_groups','limit':2,'cursor':token})
        owner.error(relation,409,'RELATION_CURSOR_INVALID',query={'kind':'idea_groups','limit':1,'cursor':token})
        for state in ['private','pending']:
            sql('nickname',state); viewer.error(overview,403,'PROFILE_ACCESS_DENIED'); viewer.error(relation,403,'PROFILE_ACCESS_DENIED',query={'kind':'idea_groups','limit':1,'cursor':token})
            check(owner.ok(f'/api/v1/events/{primary}/profiles/{users["82"]}/overview')['owner_id']==users['82'],'self overview remains available when nickname is '+state)
            sql('nickname','restore')
        activity=author.ok(f'/api/v1/idea-activities/{activity["id"]}','PUT',{'expected_version':activity['version'],'members_visible':False}); activities[0]=activity
        viewer.error(relation,409,'RELATION_CURSOR_INVALID',query={'kind':'idea_groups','limit':1,'cursor':token})
        check(str(activity['id']) not in [a['id'] for a in viewer.ok(relation,query={'kind':'idea_groups'})['items']],'author withdrawing member display revokes shared relationship')
        author.select(secondary); a3=author.ok(f'/api/v1/ideas/{idea_id}/activities','POST',{'event_id':secondary,'expected_version':confirmation['version']}); activities.append(a3)
        author.error(f'/api/v1/idea-activities/{a3["id"]}/messenger',409,'IDEA_CONVERSATION_ALREADY_BOUND',method='PUT',body={**binding,'expected_version':a3['version']})
        author.error(f'/api/v1/idea-activities/{a3["id"]}/messenger',403,'IDEA_SPACE_DENIED',method='PUT',body={**binding,'expected_version':a3['version'],'message_id':fixtures['messages']['outside_secondary']})
        author.select(primary); viewer.select(secondary); viewer.error(detail_path,404,'IDEA_NOT_FOUND',query=detail_query); viewer.select(primary)
        for key in ['kind','limit','cursor']:
            viewer.error(relation,422,None,query={key+'[]':'x'})
        sql('delete_selection'); deleted=viewer.ok(overview)
        check(deleted['school_overview'] is None and deleted['primary_portfolio_link'] is None, 'deleting selected confirmed education and portfolio yields null without fallback')
        check(link2 in [a['attribute_id'] for a in deleted['additional_portfolio_links']], 'unselected portfolio remains additional after selected link deletion')
        check(sql('side_effects')==before_effects,'all profile idea publish binding and summary APIs create no messages members notifications queues or AI jobs')
    finally:
        for action,value in [('relationship','none'),('owner_block','none'),('owner_membership','restore'),('viewer_membership','restore'),('hide_members','show'),('conversation_author','restore'),('nickname','restore')]:
            sql(action,value)
        viewer.select(primary); owner.select(primary); author.select(primary)
        visibility('authenticated')
        current=owner.ok(presentation); owner.ok(presentation,'PUT',{'expected_version':current['version'],'education_attribute_id':old_presentation['education_attribute_id'],'primary_portfolio_attribute_id':old_presentation['primary_portfolio_attribute_id'],'confirmation_intent':'confirm'})
        if activity_state is not None: share('activities',primary,'private',activity_state['version'])
        for activity in activities:
            author.select(activity['event_id'])
            author.ok(f'/api/v1/idea-activities/{activity["id"]}','PUT',{'expected_version':activity['version'],'status':'archived'})
        author.select(primary)
        for client in [owner,viewer]:
            settings=f'/api/v1/me/events/{primary}/discovery-settings'; current=client.ok(settings)
            if current['discoverable'] is not True: client.ok(settings,'PUT',{'expected_version':current['version'],'discoverable':True})
    final=sql(); check(final['counts']==manifest['counts'],'final synthetic membership and discovery counts restored')
    report={'status':'passed','checks':len(CHECKS),'checks_passed':CHECKS,'http_requests':REQUESTS,'elapsed_seconds':round(time.monotonic()-started,3),'database':DB,'origin':ORIGIN,'side_effects_before':before_effects,'side_effects_after':sql('side_effects'),'model_calls':0}
    (outdir/'s72_audit_http_2026-11-12.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n'); (outdir/'s72_audit_sql_after_2026-11-12.json').write_text(json.dumps(final,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({k:v for k,v in report.items() if k!='checks_passed'},ensure_ascii=False,indent=2))

if __name__=='__main__':
    run()

