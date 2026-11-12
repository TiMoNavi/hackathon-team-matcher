"""Independent reproducible review. Creates and owns a fresh temporary fixture directory.
Only fixture SQLite, loopback HTTP, and fully intercepted browser requests are used.
Never reads .local, runtime application config, the main preview, or real OAuth.
Run with python3 docs/推荐模块/sources/recommendation-page-live-integration-independent_2026-11-12/run.py
"""
from pathlib import Path
from datetime import datetime
from zoneinfo import ZoneInfo
import os,sys,tempfile,shutil,subprocess,json,hashlib
package=Path(__file__).resolve().parent
root=Path(os.environ.get('MATCHER_REVIEW_ROOT',package.parents[3])).resolve()
work=Path(tempfile.mkdtemp(prefix='recommendation-independent-replay-'));(work/'sessions').mkdir();(work/'runtime').mkdir()
for name in ['bootstrap.php','init.php','router.php','ports-review.php','risk-probes-fixed.php','http-review.py','browser-review.mjs','recommendation-browser-races.mjs']:shutil.copy2(package/name,work/name)
env=os.environ.copy();env['MATCHER_REVIEW_ROOT']=str(root)
rec=root/'backend/protected/modules/matcher-recommendation';paths=set()
for rel in ['application/analysis','contracts/analysis','adapters/analysis','domain/analysis']:
 paths.update((rec/rel).glob('*.php'))
for rel in ['Module.php','config.php','module.json','adapters/composition/NativeCooperationFactory.php','adapters/composition/ReviewedCooperationConfiguration.php','controllers/AnalysisController.php','adapters/profile/P1CooperationPurposePolicy.php','adapters/profile/P1CooperationProjectionMapper.php','adapters/profile/P1CooperationProjectionReader.php','adapters/profile/P1SelfAnalysisProfileReader.php','adapters/profile/P1SelectedSelfProjectionReader.php','adapters/profile/P1FieldCatalogAdapter.php','adapters/profile/P1SourcePurposePolicy.php','contracts/ports/SelfSelectionStore.php','contracts/ports/SelfAnalysisProfileReader.php','contracts/ports/SelectedSelfProjectionReader.php','adapters/native/YiiActorSessionSource.php','adapters/native/SqlCurrentEventSelectionStore.php','adapters/native/NativeCurrentEventAccess.php','adapters/native/NativeEligibilityQuery.php','adapters/native/CurrentEventSelectionSchema.php','contracts/CandidateProjection.php','contracts/ProjectionVersions.php','contracts/EvidenceRef.php','contracts/CurrentEventContext.php','contracts/ContractShape.php','domain/config/Fingerprint.php','domain/config/PolicyValidator.php','domain/config/ValueSchema.php','migrations/m261112_220000_self_analysis_selection.php']:
 paths.add(rec/rel)
for rel in ['backend/protected/modules/matcher-user-profile/Module.php','backend/protected/modules/matcher-user-profile/module.json','backend/protected/modules/matcher-user-profile/application/SelectedSelfProfileReader.php','backend/protected/modules/matcher-user-profile/application/DiscoveryProfileBatchReader.php','backend/protected/modules/matcher-user-profile/application/ProfileSourceService.php','backend/protected/modules/matcher-user-profile/adapters/persistence/SqlDiscoveryProfileBatchSource.php','backend/protected/modules/matcher-user-profile/adapters/persistence/SqlProfileSourceRepository.php','backend/protected/modules/matcher-user-profile/adapters/persistence/NativeProfileAccessPolicy.php','backend/protected/modules/matcher-user-profile/domain/DiscoveryProfileBatchRequest.php','backend/protected/modules/matcher-user-profile/domain/FieldCatalog.php','backend/protected/modules/matcher-user-profile/domain/ValueValidator.php','backend/protected/modules/matcher-profile-privacy/module.json','backend/protected/modules/matcher-profile-privacy/Module.php','backend/protected/modules/matcher-profile-privacy/application/DiscoveryBatchService.php','backend/protected/modules/matcher-profile-privacy/domain/DiscoveryFieldPolicy.php','backend/protected/modules/matcher-profile-privacy/adapters/native/NativeDiscoveryRelations.php','backend/protected/modules/matcher-auth/Module.php','backend/protected/modules/matcher-auth/config.php','backend/protected/modules/matcher-auth/module.json','backend/protected/modules/matcher-auth/controllers/GithubImportStatusController.php','backend/protected/modules/matcher-auth/adapters/native/GithubImportStatusReader.php','backend/protected/modules/matcher-auth/domain/GithubImportStatus.php','frontend/integration/src/github-import.ts','frontend/integration/src/http.ts','frontend/integration/src/contracts.ts','frontend/integration/src/session.ts','frontend/首页/integration/github-import-notice.tsx','frontend/首页/integration/auth-panel.tsx','frontend/首页/integration/webapp-entry.tsx','frontend/推荐/components/recommendation-connected.tsx','frontend/推荐/components/recommendation-analysis.tsx','frontend/推荐/integration/recommendation-entry.tsx']:
 paths.add(root/rel)
paths.update((root/'frontend/推荐/lib/recommendation-runtime').glob('*.ts'))
def hashes():return {str(p.relative_to(root)):hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(paths)}
before=hashes();commands=[]
def execute(args,cwd=root):
 result=subprocess.run([str(x) for x in args],cwd=cwd,env=env,text=True,capture_output=True)
 commands.append({'argv':[str(x) for x in args],'cwd':str(cwd),'exit_code':result.returncode})
 if result.returncode:raise RuntimeError(result.stdout+'\n'+result.stderr)
 return result.stdout
php=root/'backend/.runtime/php-mysql/bin/php'
risk=json.loads(execute([php,'-n',work/'risk-probes-fixed.php']));risk['status']='passed' if all(c['passed'] for c in risk['checks']) else 'failed';risk['checks_detail']=risk.pop('checks');risk['checks']=len(risk['checks_detail']);(work/'risk-result.json').write_text(json.dumps(risk,ensure_ascii=False,indent=2)+'\n')
ports=json.loads(execute([php,'-n',work/'ports-review.php']));(work/'ports-result.json').write_text(json.dumps(ports,ensure_ascii=False,indent=2)+'\n')
execute([sys.executable,work/'http-review.py']);http=json.loads((work/'http-result.json').read_text())
execute(['node','node_modules/vite/bin/vite.js','build','--outDir',work/'browser-build','--emptyOutDir'],cwd=root/'frontend/integration')
execute(['node',work/'browser-review.mjs']);login=json.loads((work/'browser-result.json').read_text())
execute(['node',work/'recommendation-browser-races.mjs']);recommendation=json.loads((work/'recommendation-browser-result.json').read_text())
after=hashes();suites={'risk_fix_regressions':risk,'purpose_and_sql_ports':ports,'isolated_http':http,'login_browser':login,'recommendation_browser':recommendation}
passed=all(s['status']=='passed' for s in suites.values());stable=before==after
report={'reviewed_at':datetime.now(ZoneInfo('Asia/Shanghai')).isoformat(),'status':'passed' if passed and stable else 'failed','total_independent_checks':sum(s['checks'] for s in suites.values()),'suite_checks':{k:s['checks'] for k,s in suites.items()},'suites':suites,'http_requests':http['http_requests'],'source_hashes_before':before,'source_hashes_after':after,'sources_stable_during_run':stable,'script_hashes_sha256':{p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(package.iterdir()) if p.is_file()},'build_hashes_sha256':{str(p.relative_to(work/'browser-build')):hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted((work/'browser-build').rglob('*')) if p.is_file()},'commands':commands,'work_directory':str(work),'external_network_requests':0,'model_calls':0,'real_oauth':False,'main_preview_connections':0}
(work/'complete-result.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'status':report['status'],'total_independent_checks':report['total_independent_checks'],'suite_checks':report['suite_checks'],'http_requests':report['http_requests'],'source_hash_count':len(after),'sources_stable':stable,'result':str(work/'complete-result.json')},ensure_ascii=False,indent=2))
if not passed:
 for name,s in suites.items():
  if s['status']!='passed':print(json.dumps({'suite':name,'failures':[c for c in s['checks_detail'] if not c['passed']]},ensure_ascii=False,indent=2))
if not stable:print(json.dumps({'source_changes':[k for k in before if before[k]!=after[k]]},ensure_ascii=False))
sys.exit(0 if passed and stable else 1)
