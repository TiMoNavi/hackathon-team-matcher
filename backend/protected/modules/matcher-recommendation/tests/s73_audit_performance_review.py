"""Independent evidence review; does not execute queries or remeasure benchmarks."""
import hashlib
import json
import statistics
from pathlib import Path
ROOT=Path(__file__).resolve().parents[5];S=ROOT/'docs/用户画像收集/sources'
b=json.loads((S/'s73-performance-baseline_2026-11-12.json').read_text());f=json.loads((S/'s73-performance-final_2026-11-12.json').read_text())
checks=[]
def check(ok,name):
    assert ok,name
    checks.append(name)
check(b['database']==f['database']=='humhub_profile_s73_test_root_4a70f3d1','same explicitly allocated benchmark clone')
check(b['scenarios'].keys()==f['scenarios'].keys(),'same six scenario names')
check([k for k,v in b['source_sha256'].items() if v!=f['source_sha256'][k]]==['p1_field_catalog'],'only catalog source hash changes among five measured components')
scenarios={}
for name,base in b['scenarios'].items():
    final=f['scenarios'][name];bs=base['samples'];fs=final['samples'];check(len(bs)==len(fs)==3,name+' preserves all three samples')
    check({s['query_count'] for s in bs+fs}=={66},name+' keeps 66 queries')
    check({s['returned_rows'] for s in bs+fs}=={47644},name+' keeps 47644 returned rows including repeated reads')
    check(len({s['owner_id_order_sha256'] for s in bs+fs})==1,name+' identical ordered owner IDs')
    for s in bs+fs:
        check([x['requested_owners'] for x in s['batch_calls']['p8_profiles']]==[200,159,200,159],name+' two complete batched permission passes')
    bm=statistics.median(s['use_case_elapsed_ms'] for s in bs);fm=statistics.median(s['use_case_elapsed_ms'] for s in fs)
    scenarios[name]={'baseline_median_ms':bm,'final_median_ms':fm,'final_slower':fm>bm,'baseline_samples_ms':[s['use_case_elapsed_ms'] for s in bs],'final_samples_ms':[s['use_case_elapsed_ms'] for s in fs]}
index=f['index_comparison'];check(index['same_result_for_all_variants'] is True,'same raw result for index hints')
index_observations={}
for name,v in index['variants'].items():
    plans=[p for p in v['explain_estimated'] if p['table']=='a'];check(len(plans)==1 and plans[0]['type']=='ALL' and plans[0]['key'] is None,name+' attribute plan is scan without chosen index')
    nodes=[n for n in v['explain_analyze_actual']['nodes'] if n.get('table')=='matcher_profile_attribute' and n['operation']=='table_scan']
    check(len(nodes)==1 and nodes[0]['rows_per_loop']==20559 and nodes[0]['loops']==1,name+' actual observed attribute iterator rows are labelled')
    index_observations[name]={'estimated_rows':plans[0]['estimated_rows'],'actual_iterator_rows_per_loop':nodes[0]['rows_per_loop'],'loops':nodes[0]['loops'],'client_samples_ms':v['client_query_elapsed_ms']}
check(sum(x['final_slower'] for x in scenarios.values())==4,'four of six use-case median samples get slower, preventing uniform-improvement claim')
source=ROOT/'backend/protected/modules/matcher-user-profile/domain/FieldCatalog.php'
check(hashlib.sha256(source.read_bytes()).hexdigest()==f['source_sha256']['p1_field_catalog'],'reviewed current catalog matches measured final code')
result={'status':'passed','checks':len(checks),'checks_passed':checks,'scope':'Independent read-only review of benchmark code/evidence, not independent database benchmark rerun.','scenarios':scenarios,'query_count':66,'returned_rows_including_rechecks':47644,'index_observations':index_observations,'conclusion':'Correctness/result invariants preserved; no consistent end-to-end speedup established. Existing state-index hints do not alter the observed attribute scan.','limits':['Single local development setup, three sequential samples per scenario; no production capacity inference.','20559 actual iterator rows is one observed 200-person attribute SELECT, not per-request rows_examined.','Handler_read are engine read operations and repeated returned rows are not exact scanned-row counts.','Initial unparsed EXPLAIN tree estimates were invalid; refreshed FORMAT=TRADITIONAL evidence is used.']}
(S/'s73_audit_performance_review_2026-11-12.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n');print(json.dumps({k:v for k,v in result.items() if k not in ('checks_passed','scenarios','index_observations')},ensure_ascii=False,indent=2))
