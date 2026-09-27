import {test} from 'node:test';
import assert from 'node:assert/strict';
import {proto} from 'baileys';
import {normalizeContent} from './worker.mjs';
test('media metadata contains only explicit typed values and never URLs or keys',()=>{
 for(const [kind,ctor] of [['audio','AudioMessage'],['image','ImageMessage'],['video','VideoMessage'],['document','DocumentMessage'],['sticker','StickerMessage']])assert.deepEqual(normalizeContent({[kind+'Message']:new proto.Message[ctor]()}),{type:kind,body:'',details:{}});
 const audio=normalizeContent({audioMessage:proto.Message.AudioMessage.fromObject({seconds:0,ptt:false,url:'SECRET',mediaKey:Buffer.from('SECRET')})});assert.deepEqual(audio.details,{seconds:0,ptt:false});assert.equal(JSON.stringify(audio).includes('SECRET'),false);
 assert.deepEqual(normalizeContent({documentMessage:{caption:9,fileName:[],seconds:Infinity,ptt:0}}),{type:'document',body:'',details:{}});
});
test('structured protobuf messages omit inherited defaults but retain explicit zero and false',()=>{
 assert.deepEqual(normalizeContent({locationMessage:new proto.Message.LocationMessage()}).details,{location_kind:'fixed'});
 assert.deepEqual(normalizeContent({liveLocationMessage:new proto.Message.LiveLocationMessage()}).details,{location_kind:'live'});
 const location=normalizeContent({locationMessage:proto.Message.LocationMessage.fromObject({degreesLatitude:0,degreesLongitude:0,name:'Place',url:'SECRET',jpegThumbnail:Buffer.from('SECRET')})});assert.deepEqual(location.details,{name:'Place',degreesLatitude:0,degreesLongitude:0,location_kind:'fixed'});
 assert.deepEqual(normalizeContent({contactMessage:new proto.Message.ContactMessage()}).details,{contacts:[{}]});
 assert.deepEqual(normalizeContent({pollCreationMessage:new proto.Message.PollCreationMessage()}).details,{options:[]});
 const poll=normalizeContent({pollCreationMessage:proto.Message.PollCreationMessage.fromObject({selectableOptionsCount:0,name:'Poll',options:[{optionName:'A'}],encKey:Buffer.from('SECRET')})});assert.equal(poll.details.selectableOptionsCount,0);assert.equal(JSON.stringify(poll).includes('SECRET'),false);
 assert.deepEqual(normalizeContent({buttonsResponseMessage:new proto.Message.ButtonsResponseMessage()}).details,{});
 assert.equal(normalizeContent({buttonsResponseMessage:proto.Message.ButtonsResponseMessage.fromObject({type:0})}).details.type,0);
 assert.deepEqual(normalizeContent({listResponseMessage:new proto.Message.ListResponseMessage()}).details,{});
 const update=normalizeContent({pollUpdateMessage:proto.Message.PollUpdateMessage.fromObject({pollCreationMessageKey:{id:'a',fromMe:false},vote:{encPayload:Buffer.from('SECRET'),encIv:Buffer.from('SECRET')}})});assert.deepEqual(update.details.key,{id:'a',fromMe:false});assert.equal(JSON.stringify(update).includes('SECRET'),false);
 assert.deepEqual(normalizeContent({pollUpdateMessage:proto.Message.PollUpdateMessage.fromObject({pollCreationMessageKey:{}})}).details.key,{});
});
test('malformed structured fields never escape scalar body contract and arrays remain bounded',()=>{
 for(const input of [{locationMessage:{name:9,address:[]}}, {contactsArrayMessage:{contacts:{}}}, {contactsArrayMessage:{contacts:[null,8,[],{displayName:99}]}}, {pollCreationMessage:{name:88,options:{}}}, {pollCreationMessage:{options:[null,4,[]]}}, {buttonsResponseMessage:{selectedDisplayText:1,type:9}}, {listResponseMessage:{title:{},singleSelectReply:{selectedRowId:4}}}, {pollUpdateMessage:{pollCreationMessageKey:{id:8,fromMe:0,remoteJid:[]}}}]){const result=normalizeContent(input);assert.equal(typeof result.body,'string');}
 const contacts=normalizeContent({contactsArrayMessage:{contacts:Array.from({length:101},(_,i)=>({displayName:String(i),url:'SECRET'}))}});assert.equal(contacts.details.contacts.length,100);assert.equal(contacts.body.includes('100'),false);assert.equal(JSON.stringify(contacts).includes('SECRET'),false);
 const poll=normalizeContent({pollCreationMessage:{options:Array.from({length:101},()=>({optionName:'a'}))}});assert.equal(poll.details.options.length,100);
});
