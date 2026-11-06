import test from 'node:test';
import assert from 'node:assert/strict';
import { installSignalLogRedaction } from '../lib/core/signal-log-redaction.js';

function mockConsole() {
  const records=[];
  const target={};
  for(const name of ['info','warn','log','error']) target[name]=(...args)=>records.push({name,args});
  return {target,records};
}
const fakeKeyRecord=()=>({
  _chains:{abc:{chainKey:'secret-chain'}},
  currentRatchet:{ephemeralKeyPair:{privKey:'secret-private-key'},rootKey:'secret-root-key'},
  indexInfo:{remoteIdentityKey:'secret-identity'}
});

test('redacts upstream Signal session objects without revealing key material',()=>{
  const {target,records}=mockConsole();
  const restore=installSignalLogRedaction(target,{now:()=>1000});
  try{
    target.info('Closing session:',fakeKeyRecord());
    target.info('Opening session:',fakeKeyRecord());
    target.info('Removing old closed session:',fakeKeyRecord());
    target.warn('Session already closed',fakeKeyRecord());
    assert.equal(records.length,4);
    assert.ok(records.every(row=>row.args.length===1));
    assert.equal(JSON.stringify(records).includes('secret-'),false);
  }finally{restore();}
});

test('normal errors, decrypt warnings and ordinary output remain available',()=>{
  const {target,records}=mockConsole();
  const before=target.info;
  const restore=installSignalLogRedaction(target,{now:()=>1000});
  try{
    target.warn('Decrypted message with closed session.');
    target.error('WhatsApp connection closed',401);
    target.log('Startup complete');
    target.info('Closing session:','not-a-session-object');
    assert.deepEqual(records.map(x=>x.args[0]),[
      'Decrypted message with closed session.','WhatsApp connection closed',
      'Startup complete','Closing session:'
    ]);
  }finally{restore()}
  assert.equal(target.info,before);
});

test('repeated ratchet notices are throttled without suppressing genuine warnings',()=>{
  const {target,records}=mockConsole();
  let t=1000;
  const restore=installSignalLogRedaction(target,{now:()=>t,summaryIntervalMs:60000});
  try{
    for(let i=0;i<20;i++)target.info('Closing session:',fakeKeyRecord());
    assert.equal(records.length,1);
    target.warn('Bad MAC: could not decrypt message');
    assert.equal(records.length,2);
    t+=60001;
    target.info('Closing session:',fakeKeyRecord());
    assert.equal(records.length,3);
    assert.equal(JSON.stringify(records).includes('secret-'),false);
  }finally{restore()}
});
