import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {enforceAwayPolicy} from '../lib/core/database.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
test('Important Note Saved handler is completely detached',async()=>{
 const source=await fs.readFile(path.join(root,'lib/core/dispatcher.js'),'utf8');
 assert.doesNotMatch(source,/maybeSendImportantAlert|important-alerts\.js|IMPORTANT NOTE SAVED/);
 assert.match(source,/async function maybeDirectAutomation\(ctx\)/);
 assert.match(source,/const parsed = parseCommand\(ctx\.text, ctx\.prefix\)/);
});
test('retired command plugin and triage service no longer exist',async()=>{
 for(const p of ['plugins/core/important-alerts.js','lib/services/important-alerts.js']){
  await assert.rejects(fs.access(path.join(root,p)),{code:'ENOENT'});
 }
});
test('legacy flag is off without deleting stored history',()=>{
 assert.equal(enforceAwayPolicy({importantAlerts:true}).importantAlerts,false);
 const oldData={importantAlerts:[{summary:'Historical note'}]};
 assert.equal(oldData.importantAlerts.length,1);
});
