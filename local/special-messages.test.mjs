import {test} from 'node:test';
import assert from 'node:assert/strict';
import {proto} from 'baileys';
import {normalizeContent} from './worker.mjs';
test('product/order/event preserve exact integers and exclude secrets and absent protobuf defaults',()=>{
 const product=proto.Message.ProductMessage.fromObject({product:{productId:'p',title:'Item',priceAmount1000:'9007199254740993',salePriceAmount1000:'0',url:'SECRET',signedUrl:'SECRET',productImage:{mediaKey:Buffer.from('SECRET')}},body:'Offer'});
 const result=normalizeContent({productMessage:product});assert.equal(result.type,'product');assert.equal(result.details.product.priceAmount1000,'9007199254740993');assert.equal(result.details.product.salePriceAmount1000,'0');assert.equal(JSON.stringify(result).includes('SECRET'),false);assert.equal(Object.hasOwn(result.details.product,'productImageCount'),false);
 const order=normalizeContent({orderMessage:proto.Message.OrderMessage.fromObject({orderId:'o',totalAmount1000:'9223372036854775807',status:2,token:'SECRET',thumbnail:Buffer.from('SECRET')})});assert.equal(order.details.totalAmount1000,'9223372036854775807');assert.equal(order.details.status,2);assert.equal(JSON.stringify(order).includes('SECRET'),false);
 const event=normalizeContent({eventMessage:proto.Message.EventMessage.fromObject({name:'Meeting',startTime:'1900000000',isCanceled:false,joinLink:'SECRET',contextInfo:{messageSecret:Buffer.from('SECRET')}})});assert.equal(event.details.startTime,'1900000000');assert.equal(event.details.isCanceled,false);assert.equal(Object.hasOwn(event.details,'hasReminder'),false);assert.equal(JSON.stringify(event).includes('SECRET'),false);
 assert.equal(normalizeContent({orderMessage:{totalAmount1000:9007199254740992,status:99}}).details.totalAmount1000,undefined);
 assert.deepEqual(normalizeContent({eventMessage:new proto.Message.EventMessage()}).details,{});
 const answer=normalizeContent({eventResponseMessage:proto.Message.EventResponseMessage.fromObject({response:0,timestampMs:'1900000000123',extraGuestCount:0})});assert.equal(answer.type,'event_response');assert.deepEqual(answer.details,{response:0,timestampMs:'1900000000123',extraGuestCount:0});
 assert.deepEqual(normalizeContent({eventResponseMessage:new proto.Message.EventResponseMessage()}).details,{});
});
