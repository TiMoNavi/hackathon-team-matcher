#!/usr/bin/env python3
"""Independent 400-person real HTTP/MySQL verification, exclusively loopback 8103."""
import collections
import http.cookiejar
import json
import os
from pathlib import Path
import statistics
import sys
import subprocess
import time
import urllib.error
import urllib.parse
import urllib.request
import s73_audit_oracle as oracle

ROOT = oracle.ROOT
DB = 'humhub_profile_s73_test_audit_b7a2c940'
ORIGIN = 'http://127.0.0.1:8103'
PHP = ROOT / 'backend/.runtime/php-mysql/bin/php'
INI = ROOT / 'backend/.runtime/php.ini'
SQL = Path(__file__).with_name('s73_audit_sql.php')
SOURCES = ROOT / 'docs/用户画像收集/sources'
CHECKS, REQUESTS, CASE_RESULTS = [], [], []

def check(condition, name):
    if not condition: raise AssertionError(name)
    CHECKS.append(name)
    if name.startswith(('recent ', '48-page exact', 'independent ordered HTTP filter oracle:', 'all 359 real', 'actual secondary', 'cleanup restores')):
        save('checkpoint', {'status':'running', 'last_check':name, 'checks':len(CHECKS), 'requests':len(REQUESTS)})
        print(name, file=sys.stderr, flush=True)

def sql(action='metadata', value=''):
    proc = subprocess.run([str(PHP), '-c', str(INI), str(SQL), DB, action, value], cwd=ROOT,
        env={**os.environ, 'MATCHER_S73_TEST_DB':DB}, capture_output=True, text=True)
    if proc.returncode: raise AssertionError('Synthetic-only SQL helper failed for ' + action + ': ' + (proc.stdout+proc.stderr)[-1200:])
    return json.loads(proc.stdout)

def save(name, obj):
    (SOURCES / ('s73_audit_' + name + '_2026-11-12.json')).write_text(json.dumps(obj,ensure_ascii=False,indent=2)+'\n')

class Client:
    def __init__(self, uid=None):
        self.csrf = None
        self.opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
        if uid is not None:
            status, payload, _ = self.request('/__s73_test/login', query={'id':uid})
            if status != 200 or payload.get('user_id') != uid: raise AssertionError('Synthetic session login failed')
            self.csrf=payload['csrf']
    def request(self,path,method='GET',body=None,query=None,csrf=True):
        assert path.startswith('/') and not path.startswith('//')
        url=ORIGIN+path+('?' + urllib.parse.urlencode(query) if query else '')
        headers={'Accept':'application/json'}; raw=None
        if body is not None: raw=json.dumps(body).encode(); headers['Content-Type']='application/json'
        if csrf and self.csrf: headers['X-CSRF-Token']=self.csrf
        request=urllib.request.Request(url,data=raw,headers=headers,method=method); started=time.perf_counter()
        try: response=self.opener.open(request,timeout=90)
        except urllib.error.HTTPError as error: response=error
        payload_raw=response.read(); elapsed=(time.perf_counter()-started)*1000
        REQUESTS.append({'method':method,'path':path,'status':response.status,'elapsed_ms':round(elapsed,3),'response_bytes':len(payload_raw),'filtered':bool(query and 'filters' in query),'continued':bool(query and 'cursor' in query)})
        try: payload=json.loads(payload_raw)
        except json.JSONDecodeError: raise AssertionError('Expected JSON response, status='+str(response.status)+' path='+path)
        return response.status,payload,dict(response.headers)
    def ok(self,path,method='GET',body=None,query=None):
        status,payload,headers=self.request(path,method,body,query)
        if status!=200: raise AssertionError('Unexpected HTTP '+str(status)+' '+path+' '+str(payload.get('error')))
        assert 'no-store' in headers.get('Cache-Control','')
        assert isinstance(payload.get('meta',{}).get('request_id'),str)
        return payload['data']
    def error(self,path,status,code=None,**kwargs):
        actual,payload,_=self.request(path,**kwargs)
        check(actual==status and isinstance(payload.get('error'),dict) and 'data' not in payload and (code is None or payload['error']['code']==code),f'HTTP {status}/{code}: {path}')
        check(isinstance(payload.get('meta',{}).get('request_id'),str) and {'code','message','retryable','details'}<=payload['error'].keys(),'complete error envelope '+str(payload['error']['code']))
    def select(self,space):
        status,payload,_=self.request('/api/v1/me/current-event')
        revision=payload['data']['selection_revision'] if status==200 else None
        return self.ok('/api/v1/me/current-event','PUT',{'space_id':space,'expected_revision':revision})
    def all(self,space,filters=None,sort='recent',limit=48):
        query={'sort':sort,'limit':limit}; cards=[]; sizes=[]; cursors=set()
        if filters is not None: query['filters']=json.dumps(filters)
        while True:
            page=self.ok(f'/api/v1/events/{space}/discovery',query=query)
            assert page['limit']==limit and len(page['items'])<=limit
            sizes.append(len(page['items']));cards.extend(page['items'])
            if not page['has_more']:
                assert page['exhausted'] and page['next_cursor'] is None
                return cards,sizes
            assert len(page['items'])==limit and page['next_cursor'] not in cursors and len(sizes)<30
            cursors.add(page['next_cursor']);query['cursor']=page['next_cursor']

def card_values(card,scope):
    return collections.Counter(json.dumps({'key':a['key'],'value':a['value']},sort_keys=True,ensure_ascii=False) for a in card[scope]['attributes'])

def run():
    started=time.monotonic();data,digest=oracle.load(); probes,rare_code=oracle.cases(data)
    before=sql();save('sql_before',before);effects=sql('side_effects')
    users=before['users']; spaces=before['spaces'];primary=spaces['primary'];secondary=spaces['secondary']
    id_numbers={uid:int(n) for n,uid in users.items()}
    check(before['database']==DB and len(users)==400,'exact isolated MySQL contains 400 actual accounts')
    check(before['counts']=={'primary':{'members':400,'optin':360},'secondary':{'members':80,'optin':72}},'actual MySQL 400/80 memberships and 360/72 opt-ins')
    expected_attributes=sum(len(p['global']['attributes'])+sum(len(s['attributes']) for s in p['spaces'].values())+1 for p in data['people'])
    check(before['profile_counts']['states']==880 and before['profile_counts']['confirmed_attributes']==expected_attributes,'actual persisted 880 scopes and all JSON confirmed attributes plus 400 nicknames')
    check(effects['synthetic_ai_jobs']==0,'400-person namespace has zero AI jobs before HTTP')
    check(before['fixture_baseline']=={'enabled_accounts':400,'audit_friendships':0,'audit_blocks':0},'planned fault-injection pairs begin empty and all accounts enabled')
    listing=f'/api/v1/events/{primary}/discovery'
    guest=Client();guest.error(listing,401,'AUTHENTICATION_REQUIRED')
    viewer=Client(users['321']);other=Client(users['322']);candidate=Client(users['400'])
    viewer.error(listing,409,'CURRENT_EVENT_REQUIRED')
    viewer.error('/api/v1/me/current-event',400,'INVALID_REQUEST',method='PUT',body={'space_id':primary,'expected_revision':None},csrf=False)
    viewer.select(primary);other.select(primary);candidate.select(primary)
    default=viewer.ok(listing);token=default['next_cursor']
    check(default['limit']==24 and len(default['items'])==24 and default['has_more'],'real default 24-item page has signed continuation')
    all_cards=None
    for limit in (24,48):
        cards,sizes=viewer.all(primary,limit=limit);ids=[c['owner_id'] for c in cards]
        check(ids==oracle.expected(data,before),f'recent {limit}-page complete ordered oracle equality across 200-member boundary')
        check(len(ids)==359 and len(set(ids))==359 and sum(sizes)==359,f'{limit}-page has exactly 359 eligible others with no duplicates or omissions')
        check(sizes==([24]*14+[23] if limit==24 else [48]*7+[23]),f'{limit}-page exact page shape')
        CASE_RESULTS.append({'name':f'all_recent_{limit}','sort':'recent','limit':limit,'page_sizes':sizes,'expected_numbers':[id_numbers[i] for i in oracle.expected(data,before)],'actual_numbers':[id_numbers[i] for i in ids]})
        all_cards=cards
    for card in all_cards:
        person=data['people'][id_numbers[card['owner_id']]-1]
        assert card['space_id']==primary and '模拟' in card['display_name']
        for scope,key in [('global','global'),('space','primary')]:
            source=person['global']['attributes'] if scope=='global' else person['spaces'][key]['attributes']
            expected=collections.Counter(json.dumps({'key':a['key'],'value':a['value']},sort_keys=True,ensure_ascii=False) for a in source if a['key'] in oracle.PUBLIC_KEYS and a['visibility']=='authenticated' and a.get('confirmation','confirmed')=='confirmed')
            assert card_values(card,scope)==expected, 'actual whitelist projection differs from raw JSON'
            assert all(a['confirmation']=='confirmed' and a['visibility']=='authenticated' and not a['key'].startswith('contact_') for a in card[scope]['attributes'])
    check(True,'all 359 real cards exactly match independent JSON public projections and exclude contact/private/friends/draft')
    for name,filters in probes:
        cards,sizes=viewer.all(primary,filters,sort='relevance',limit=48);ids=[c['owner_id'] for c in cards];want=oracle.expected(data,before,filters=filters,sort='relevance')
        check(ids==want and len(ids)==len(set(ids)),'independent ordered HTTP filter oracle: '+name)
        CASE_RESULTS.append({'name':name,'filters':filters,'sort':'relevance','limit':48,'page_sizes':sizes,'expected_numbers':[id_numbers[i] for i in want],'actual_numbers':[id_numbers[i] for i in ids]})
    check(next(r for r in CASE_RESULTS if r['name']=='last_person_rare')['actual_numbers']==[400],'400th real account uniquely found after candidate batch boundary')
    # Recent and relevance are validated under the same multivalue OR query.
    ranking=next(filters for name,filters in probes if name=='skill_or')
    cards,_=viewer.all(primary,ranking,sort='recent')
    check([c['owner_id'] for c in cards]==oracle.expected(data,before,filters=ranking),'filtered recent ordering equals independent SQL-confirmation oracle')
    for query in [{'limit':49},{'limit':0},{'sort':'id'},{'target_type':'idea'},{'filters':'[]'},{'filters':'{'},{'filters':json.dumps({'unknown':['x']})},{'ownerId':users['322']},{'spaceId':secondary},{'viewer_id':users['322']}]: viewer.error(listing,422,query=query)
    for filters in [{'skill':{'0':'php'}},{'event_seeking':[]},{'event_seeking':{'role_codes':{'0':'backend'}}},{'event_availability':{'0':{'starts_at':'2026-11-28T04:00:00Z','ends_at':'2026-11-28T06:00:00Z'}}},{'event_availability':[{'starts_at':'2026-11-28T04:00:00','ends_at':'2026-11-28T06:00:00'}]}]: viewer.error(listing,422,query={'filters':json.dumps(filters)})
    for query in [{'cursor':token,'limit':48},{'cursor':token,'sort':'relevance'},{'cursor':token,'filters':json.dumps({'skill':[rare_code]})},{'cursor':token[:-2]+'AA'}]: viewer.error(listing,409,'DISCOVERY_CURSOR_INVALID',query=query)
    other.error(listing,409,'DISCOVERY_CURSOR_INVALID',query={'cursor':token})
    settings=f'/api/v1/me/events/{primary}/discovery-settings';rare_detail=listing+'/people/'+str(users['400']);peer_detail=listing+'/people/'+str(users['322']);candidate_detail=listing+'/people/'+str(users['323'])
    check(viewer.ok(rare_detail)['owner_id']==users['400'],'real detail resolves final account')
    viewer_setting=viewer.ok(settings);rare_setting=candidate.ok(settings)
    try:
        viewer.ok(settings,'PUT',{'expected_version':viewer_setting['version'],'discoverable':False})
        check(len(viewer.all(primary)[0])==359,'viewer opt-out leaves authorized browsing and 359 other candidates')
        current=viewer.ok(settings);viewer.ok(settings,'PUT',{'expected_version':current['version'],'discoverable':viewer_setting['discoverable']})
        old=viewer.ok(listing)['next_cursor'];candidate.ok(settings,'PUT',{'expected_version':rare_setting['version'],'discoverable':False})
        viewer.error(rare_detail,404,'DISCOVERY_PERSON_NOT_FOUND');viewer.error(listing,409,'DISCOVERY_CURSOR_INVALID',query={'cursor':old})
        check(viewer.all(primary,{'skill':[rare_code]})[0]==[],'opted-out rare person produces actual empty list without refill')
        current=candidate.ok(settings);candidate.ok(settings,'PUT',{'expected_version':current['version'],'discoverable':rare_setting['discoverable']})
        for state in ('pending_out','pending_in','friend'):
            sql('relationship',state);card=viewer.ok(peer_detail)
            check(card['relationship']['state']==state and card['relationship'][state] is True,'real native relationship retained: '+state)
        hidden=sql('hidden_friend','friend');hidden_card=viewer.ok(listing+'/people/'+str(hidden['peer_id']))
        check(hidden_card['relationship']['friend'] and 'friends-sentinel' not in json.dumps(hidden_card),'friends remain eligible but friends-only values stay outside discovery')
        check(viewer.all(primary,{'skill':['s73-friends-sentinel-skill']})[0]==[],'friends-only skill cannot filter even for actual friend')
        for visibility in ('private','friends'):
            old=viewer.ok(listing)['next_cursor'];sql('rare_visibility',visibility)
            viewer.error(listing,409,'DISCOVERY_CURSOR_INVALID',query={'cursor':old})
            check(viewer.all(primary,{'skill':[rare_code]})[0]==[],'changed '+visibility+' rare skill cannot filter')
            check(rare_code not in json.dumps(viewer.ok(rare_detail)),'detail immediately removes '+visibility+' rare skill')
        sql('rare_visibility','authenticated')
        for visibility in ('private','friends','draft'):
            old=viewer.ok(listing)['next_cursor'];sql('nickname',visibility)
            viewer.error(peer_detail,404,'DISCOVERY_PERSON_NOT_FOUND');viewer.error(listing,409,'DISCOVERY_CURSOR_INVALID',query={'cursor':old})
            sql('nickname','restore')
        for direction in ('outgoing','incoming','space'):
            old=viewer.ok(listing)['next_cursor'];sql('block',direction)
            viewer.error(candidate_detail,404,'DISCOVERY_PERSON_NOT_FOUND');viewer.error(listing,409,'DISCOVERY_CURSOR_INVALID',query={'cursor':old});sql('block','none')
        for action,value,restore in [('membership','candidate_remove','candidate_restore'),('account','disable','restore')]:
            old=viewer.ok(listing)['next_cursor'];sql(action,value)
            viewer.error(candidate_detail,404,'DISCOVERY_PERSON_NOT_FOUND');viewer.error(listing,409,'DISCOVERY_CURSOR_INVALID',query={'cursor':old});sql(action,restore)
        sql('membership','viewer_remove');viewer.error(listing,403,'ACCESS_DENIED');viewer.error(rare_detail,403,'ACCESS_DENIED');viewer.error(listing,403,'ACCESS_DENIED',query={'filters':json.dumps({'skill':['definitely-absent-s73-code']})});sql('membership','viewer_restore')
    finally:
        sql('relationship','none');sql('hidden_friend','none');sql('block','none');sql('membership','candidate_restore');sql('membership','viewer_restore');sql('account','restore');sql('nickname','restore');sql('rare_visibility','authenticated')
        for client,original in ((viewer,viewer_setting),(candidate,rare_setting)):
            current=client.ok(settings)
            if current['discoverable']!=original['discoverable']: client.ok(settings,'PUT',{'expected_version':current['version'],'discoverable':original['discoverable']})
    old=viewer.ok(listing)['next_cursor'];viewer.select(secondary);viewer.error(listing,409,'CURRENT_EVENT_MISMATCH');viewer.error(rare_detail,409,'CURRENT_EVENT_MISMATCH')
    current=sql();secondary_cards,sizes=viewer.all(secondary)
    check([c['owner_id'] for c in secondary_cards]==oracle.expected(data,current,space='secondary') and len(secondary_cards)==71,'actual secondary Space returns independent exact 71 others')
    viewer.error(f'/api/v1/events/{secondary}/discovery/people/'+str(users['1']),404,'DISCOVERY_PERSON_NOT_FOUND')
    secondary_rare=viewer.ok(f'/api/v1/events/{secondary}/discovery/people/'+str(users['400']))
    expected_space=collections.Counter(json.dumps({'key':a['key'],'value':a['value']},sort_keys=True,ensure_ascii=False) for a in data['people'][399]['spaces']['secondary']['attributes'] if a['key'] in oracle.PUBLIC_KEYS and a['visibility']=='authenticated')
    check(card_values(secondary_rare,'space')==expected_space,'second Space final-person context exactly matches independent raw JSON')
    # Pick a publicly available primary event-role that is absent in secondary.
    primary_roles={a['value']['code'] for p in data['people'] for a in oracle.public_attrs(p,'primary') if a['key']=='event_role'}
    secondary_roles={a['value']['code'] for p in data['people'] if 'secondary' in p['spaces'] for a in oracle.public_attrs(p,'secondary') if a['key']=='event_role'}
    absent=sorted(primary_roles-secondary_roles)
    if absent: check(viewer.all(secondary,{'event_role':[absent[0]]})[0]==[],'secondary empty event-role result never borrows primary candidates')
    else: check(viewer.all(secondary,{'skill':['definitely-absent-s73-code']})[0]==[],'secondary absent filter returns empty without cross-Space fill')
    viewer.select(primary);viewer.error(listing,409,'DISCOVERY_CURSOR_INVALID',query={'cursor':old})
    final=sql();save('sql_after',final);final_effects=sql('side_effects')
    check(final['counts']==before['counts'] and final['profile_counts']==before['profile_counts'] and final['fixture_baseline']==before['fixture_baseline'],'cleanup restores membership, settings, relationships, status and confirmed/draft counts')
    check(all(final['versions'][key][field]>=version for key,versions in before['versions'].items() for field,version in versions.items()),'restoration never moves revision permission_version or identity_version backwards')
    check(effects==final_effects,'HTTP and audit mutations produce zero AIJob message participant notification queue delta')
    check(oracle.load()[1]==digest,'raw synthetic JSON remains unchanged')
    save('cases',{'dataset_sha256':digest,'oracle':'independent Python endpoint sweep, normalized set intersections, raw JSON, independent SQL confirmation dates','cases':CASE_RESULTS})
    save('requests',{'origin':ORIGIN,'requests':REQUESTS})
    durations=[r['elapsed_ms'] for r in REQUESTS if r['method']=='GET' and r['path']==listing and r['status']==200]
    return {'status':'passed','checks':len(CHECKS),'checks_passed':CHECKS,'database':DB,'origin':ORIGIN,'dataset_sha256':digest,'synthetic_people':400,'memberships':final['counts'],'profile_counts':final['profile_counts'],'filter_cases':len(probes),'http_requests':len(REQUESTS),'elapsed_seconds':round(time.monotonic()-started,3),'model_calls':0,'side_effects_before':effects,'side_effects_after':final_effects,'ordinary_list_observation':{'samples':len(durations),'min_ms':min(durations),'median_ms':statistics.median(durations),'max_ms':max(durations)},'limitations':['Local single-process PHP development server with real MySQL; not production concurrency or capacity.','Latency samples include different filters and permission transitions; descriptive functional-run observation, not a controlled before/after benchmark.','15-minute cursor expiry remains covered by existing injected-clock use-case tests, not a 15-minute HTTP sleep.']}

if __name__=='__main__':
    try:
        result=run();save('http',result);print(json.dumps({k:v for k,v in result.items() if k!='checks_passed'},ensure_ascii=False,indent=2))
    except Exception as error:
        save('failure',{'status':'failed','error':str(error),'completed_checks':CHECKS,'request_count':len(REQUESTS)})
        raise
