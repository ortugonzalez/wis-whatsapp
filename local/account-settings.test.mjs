import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import {normalizeAccountSetting,attachAccountSettings} from './account-settings.mjs';

test('account settings preserve explicit false and reject unknown, absent or coercible values',()=>{
 for(const [setting,key] of Object.entries({timeFormat:'isTwentyFourHourFormatEnabled',privacySettingRelayAllCalls:'isEnabled',disableLinkPreviews:'isPreviewsDisabled',channelsPersonalisedRecommendation:'isUserOptedOut'})){
  assert.equal(normalizeAccountSetting({setting,value:{[key]:false,secret:'x'}}).value,false);
  for(const value of [{},{[key]:null},{[key]:0},{[key]:'true'},Object.create({[key]:true})])assert.equal(normalizeAccountSetting({setting,value}),null);
 }
 assert.equal(normalizeAccountSetting({setting:'locale',value:'es_AR'}).value,'es_AR');
 assert.equal(normalizeAccountSetting({setting:'locale',value:'<script>'}),null);
 assert.equal(normalizeAccountSetting({setting:'statusPrivacy',value:{list:['private']}}),null);
 assert.equal(normalizeAccountSetting({setting:'unarchiveChats',value:false}).value,false);
});

test('passive account observer never persists credentials, updates independent fields and stops without ownership',()=>{
 const ev=new EventEmitter(),rows=new Map();let owns=true;
 attachAccountSettings(ev,{guarded:fn=>x=>{if(owns)fn(x);},snapshot:(kind,key,data)=>rows.set(key,{kind,...data})});
 ev.emit('creds.update',{noiseKey:'SECRET',accountSettings:{unarchiveChats:false,secret:'SECRET'}});
 ev.emit('settings.update',{setting:'locale',value:'es'});
 ev.emit('creds.update',{noiseKey:'OTHER_SECRET'});
 assert.equal(rows.size,2);assert.equal(rows.get('unarchiveChats').value,false);
 assert.equal(JSON.stringify([...rows.values()]).includes('SECRET'),false);
 ev.emit('settings.update',{setting:'locale',value:'en'});assert.equal(rows.size,2);assert.equal(rows.get('locale').value,'en');
 owns=false;ev.emit('settings.update',{setting:'locale',value:'fr'});assert.equal(rows.get('locale').value,'en');
});
