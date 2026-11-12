import fs from 'node:fs';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
const base=process.cwd()+'/frontend/用户画像收集——前端/integration/src/';
const c=await import(pathToFileURL(base+'contracts.ts'));
const d=await import(pathToFileURL(base+'document-mapping.ts'));
const input=JSON.parse(fs.readFileSync(0,'utf8'));
const parsed={};const cases=[];
for(const [key,value] of Object.entries(input)){
 const parser=key.startsWith('owner_')?c.parseOwnerProfile:key.startsWith('draft_')?c.parseDraft:key.startsWith('preview_')?c.parsePreview:key.startsWith('progress_')?c.parseLegacySessionProgress:key.startsWith('capabilities_')?c.parseSourceCapabilities:c.parseSources;
 parsed[key]=parser(value);cases.push(key+'_actual_php_dto_accepted');
}
const check=(name,fn)=>{fn();cases.push(name);};
check('actual_full_global_catalog_is_27',()=>assert.equal(parsed.owner_confirmed.field_definitions.length,27));
check('actual_full_space_catalog_is_10',()=>assert.equal(parsed.owner_space.field_definitions.length,10));
check('actual_private_text_retains_bytes',()=>assert.equal(d.ownerProfileDocument(parsed.owner_confirmed).profile.find(x=>x.fieldKey==='bio').text,'  合成内容\n保留空格🙂  '));
check('pending_draft_remains_pending',()=>assert.ok(d.ownerDraftDocument(parsed.draft_pending).profile.every(x=>x.confirmation==='pending')));
check('confirmed_read_does_not_admit_pending',()=>assert.ok(d.ownerProfileDocument(parsed.owner_confirmed).profile.every(x=>x.confirmation==='confirmed')));
check('server_authenticated_hides_private_bio_and_friend_contact',()=>{const p=d.simulatedDocument(parsed.preview_confirmed_authenticated);assert.deepEqual(p.profile.map(x=>x.fieldKey),['headline']);assert.equal(p.contacts.length,0);});
check('server_friend_contact_stays_independent',()=>{const p=d.simulatedDocument(parsed.preview_confirmed_friends);assert.deepEqual(p.contacts.map(x=>x.fieldKey),['contact_other']);assert.ok(p.profile.every(x=>!x.fieldKey.startsWith('contact_')));});
check('pending_preview_not_formal',()=>{const p=d.simulatedDocument(parsed.preview_pending_friends);assert.equal(p.simulated,true);assert.ok(p.contacts.every(x=>x.confirmation==='pending'));});
check('actual_space_projection_retains_scope',()=>assert.ok(d.simulatedDocument(parsed.preview_space).profile.every(x=>x.storageScope==='space:7'&&x.category==='activity')));
check('disabled_source_readers_remain_disabled',()=>assert.ok(Object.values(parsed.capabilities_disabled.readers).every(x=>x.enabled===false&&x.available===false)));
const result={kind:'N06_owner_read_contract_cross_language_audit',date:'2026-11-12',status:'passed',checks:cases.length,cases,method:'Production PHP P1/P8/P2 services with in-memory adapters -> JSON -> actual TypeScript parsers and document mapping',database_calls:0,http_calls:0,external_calls:0,model_calls:0,real_identity_access:false,runtime_configuration_read:false,limits:['No UI mount or browser acceptance','No native SQL or actual HTTP acceptance','No new G03/G05 or long-text storage contract']};
console.log(JSON.stringify(result));
