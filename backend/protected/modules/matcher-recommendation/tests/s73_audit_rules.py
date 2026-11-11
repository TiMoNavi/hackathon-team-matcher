"""Exhaustive structured-code domain checks; explicitly not a database load test."""
import json
import subprocess
from pathlib import Path
import s73_audit_oracle as oracle

data,digest=oracle.load();probes,_=oracle.cases(data)
terms={key:set() for key in oracle.CODE_KEYS};seeking={'role_codes':set(),'skill_codes':set()}
for person in data['people']:
    for section in [person['global'],*person['spaces'].values()]:
        for attr in section['attributes']+section.get('draft_attributes',[]):
            if attr['key'] in terms:terms[attr['key']].add(attr['value']['code'])
            if attr['key']=='event_seeking':
                for part in seeking:seeking[part].update(attr['value'].get(part,[]))
for field,codes in terms.items():
    for code in sorted(codes):probes.append((f'exhaustive_{field}_{code}',{field:[code]}))
for part,codes in seeking.items():
    for code in sorted(codes):probes.append((f'exhaustive_seeking_{part}_{code}',{'event_seeking':{part:[code]}}))
cards=[]
for person in data['people']:
    if person['number']==oracle.VIEWER_NUMBER or not person['spaces']['primary']['discoverable']:continue
    cards.append({'owner_id':person['number'],'global':{'attributes':oracle.public_attrs(person,'primary')},'space':{'attributes':[]}})
manifest={'users':{str(n):n for n in range(1,401)}}
proc=subprocess.run([str(oracle.ROOT/'backend/.runtime/php-mysql/bin/php'),'-c',str(oracle.ROOT/'backend/.runtime/php.ini'),str(Path(__file__).with_suffix('.php'))],input=json.dumps({'cards':cards,'cases':[{'name':n,'filters':f} for n,f in probes]}),text=True,capture_output=True,check=True)
actual=json.loads(proc.stdout);results=[]
for name,filters in probes:
    expected=oracle.expected(data,manifest,filters=filters,sort='relevance')
    assert actual[name]==expected,name
    results.append({'name':name,'expected_numbers':expected,'actual_numbers':actual[name]})
result={'status':'passed','scope':'Pure-domain exhaustive structured-code match checks on JSON-authorized synthetic cards; not actual MySQL or load evidence.','dataset_sha256':digest,'checks':len(results),'cards':len(cards),'ordinary_code_counts':{k:len(v) for k,v in terms.items()},'seeking_code_counts':{k:len(v) for k,v in seeking.items()},'results':results}
(oracle.ROOT/'docs/用户画像收集/sources/s73_audit_rules_2026-11-12.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({k:v for k,v in result.items() if k!='results'},ensure_ascii=False,indent=2))
