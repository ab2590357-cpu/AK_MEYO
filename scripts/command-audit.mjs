import fs from 'node:fs/promises';
import {loadPlugins} from '../lib/core/plugin-loader.js';
import {allCommands,commandKeyCount} from '../lib/core/registry.js';
// Registration only: no WhatsApp login, real messages, or external publishing.
const result=await loadPlugins({logger:{info(){},warn(){},error(){}}});
const commands=allCommands().map(c=>({
 name:String(c.name),aliases:Array.isArray(c.aliases)?c.aliases:[],
 category:String(c.category||'general'),description:String(c.description||''),
 usage:String(c.usage||''),ownerOnly:Boolean(c.ownerOnly),
 masterOnly:Boolean(c.masterOnly),groupOnly:Boolean(c.groupOnly),
 adminOnly:Boolean(c.adminOnly),botAdminRequired:Boolean(c.botAdminRequired),
 verification:'registered_not_live_tested'
})).sort((a,b)=>a.name.localeCompare(b.name));
if(result.failures.length)throw new Error('Plugin loading failures: '+JSON.stringify(result.failures));
if(!commands.length)throw new Error('No commands registered');
const forbidden=['important','importantchat','importantchats','alertdigest','alerts','importantalerts'];
const present=forbidden.filter(n=>commands.some(c=>c.name===n||c.aliases.includes(n)));
if(present.length)throw new Error('Retired alerts still registered: '+present.join(','));
const categories={};
for(const c of commands)categories[c.category]=(categories[c.category]||0)+1;
const summary={pluginsDiscovered:result.discovered,pluginsLoaded:result.loaded,pluginFailures:result.failures.length,
 registeredCommands:commands.length,aliasKeys:commandKeyCount()-commands.length,
 commandKeys:commandKeyCount(),categories:Object.keys(categories).length,
 ownerOnly:commands.filter(c=>c.ownerOnly).length,
 groupOnly:commands.filter(c=>c.groupOnly).length,
 liveVerifiedByThisAudit:0};
await fs.mkdir('artifacts',{recursive:true});
await fs.writeFile('artifacts/command-inventory.json',JSON.stringify({
 generatedAt:new Date().toISOString(),summary,categories,commands
},null,2)+'\n');
console.log('COMMAND_AUDIT_SUMMARY='+JSON.stringify(summary));
console.log('COMMAND_AUDIT_CATEGORIES='+JSON.stringify(categories));
console.log('COMMAND_AUDIT_NAMES='+commands.map(c=>c.name).join(','));
