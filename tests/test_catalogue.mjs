import test from 'node:test';import assert from 'node:assert/strict';
import {decorate,feedEvents,filterCatalogue,imageSources,fold,minor,readState,safeUrl,stateSearch,validateCatalog} from '../catalogue.mjs';
const stores=[{code:'a',name:'A'},{code:'b',name:'B'}];
const rows=[{edition_id:1,name:'İstanbul Alhambra',language:'TR',currency:'TRY',product_type:'game',a_price:'100.00',a_stock:'in_stock',a_url:'https://a.example/1',b_price:'50.00',b_stock:'out_of_stock',b_url:'https://b.example/1'},
{edition_id:2,name:'İstanbul Alhambra',language:'EN',currency:'TRY',product_type:'game',a_price:'80.00',a_stock:'out_of_stock',a_url:'https://a.example/2'},
{edition_id:3,name:'Wingspan',language:'EN',currency:'TRY',product_type:'game',a_price:'120.00',a_stock:'in_stock',a_url:'https://a.example/3'}];
test('Turkish and English spellings can be searched',()=>{assert.equal(fold('İSTANBUL'),'istanbul');assert.equal(filterCatalogue(rows,stores,{query:'ISTANBUL',inStock:false}).length,2);});
test('out-of-stock prices never determine cheapest',()=>{const result=decorate(rows[0],stores);assert.equal(result.low,10000);assert.equal(result.cheapest[0].store,'a');});
test('selected store changes stock filter and comparison',()=>{assert.equal(filterCatalogue(rows,stores,{stores:['b']}).length,0);const result=filterCatalogue(rows,stores,{stores:['b'],inStock:false});assert.equal(result.length,1);assert.equal(result[0].low,null);});
test('languages remain separate',()=>{const result=filterCatalogue(rows,stores,{language:'EN',inStock:false});assert.deepEqual(result.map(r=>r.edition_id),[2,3]);});
test('price ranges and descending sort use eligible offers',()=>{assert.deepEqual(filterCatalogue(rows,stores,{min:'110',max:'130'}).map(r=>r.edition_id),[3]);assert.deepEqual(filterCatalogue(rows,stores,{inStock:false,sort:'price_desc'}).map(r=>r.edition_id),[3,1,2]);});
test('price parsing rejects missing and invalid values',()=>{assert.equal(minor(null),null);assert.equal(minor('1999.92'),199992);assert.equal(minor(-1),null);assert.equal(minor('not a price'),null);});
test('external URLs cannot execute scripts',()=>{assert.equal(safeUrl('javascript:alert(1)'),null);assert.equal(safeUrl('data:text/html,hello'),null);assert.equal(safeUrl('https://a.example/'), 'https://a.example/');});
test('URL state round-trips and drops unsupported values',()=>{const state=readState('?q=İstanbul&lang=TR&stores=a,evil&stock=0&sort=price_asc&view=catalog',['a']);assert.deepEqual(state.stores,['a']);assert.equal(state.inStock,false);assert.equal(readState('?'+stateSearch(state),['a']).query,'İstanbul');assert.equal(readState('?sort=evil&min=nan',[]).sort,'name');});
test('catalogue validation rejects duplicate editions and unsupported events',()=>{const data={rows,stores,updates:[],metadata:{schema_version:1,exported_at:'2026-11-23T06:00:00Z'}};assert.equal(validateCatalog(data),data);assert.throws(()=>validateCatalog({...data,rows:[rows[0],rows[0]]}));assert.throws(()=>validateCatalog({...data,updates:[{kind:'password'}]}));});

test('stock-out and removed listings form a dedicated feed without duplicate listings',()=>{
  const base={store:'a',store_name:'A',name:'Game',url:'https://a.example/1',detected_at:'2026-11-23T06:00:00Z',product_id:1};
  const updates=[{...base,kind:'stock_out'},{...base,kind:'removed_from_listing'},{...base,kind:'new_product',product_id:2}];
  const data={rows,stores,updates,metadata:{schema_version:1,exported_at:base.detected_at}};
  assert.equal(validateCatalog(data),data);
  assert.equal(feedEvents(updates,'unavailable').length,1);
  assert.equal(feedEvents(updates,'unavailable')[0].kind,'removed_from_listing');
  assert.equal(feedEvents(updates,'new_product').length,1);
  assert.equal(feedEvents(updates,'price_down').length,0);
});

test('deal feed excludes unavailable offers even in older JSON snapshots',()=>{
  const base={store:'a',product_id:1,kind:'price_down',detected_at:'2026-11-23T06:00:00Z'};
  const result=feedEvents([{...base,availability:'out_of_stock'},{...base,product_id:2,availability:'in_stock'}],'price_down');
  assert.deepEqual(result.map(event=>event.product_id),[2]);
});

test('image sources reject unsafe/mixed-content URLs and deduplicate fallbacks',()=>{
  assert.deepEqual(imageSources({image_url:'https://cdn.example/cover.webp',image_fallback_urls:['https://cdn.example/cover.webp','javascript:bad','http://insecure.example/a','https://other.example/cover.webp']}),['https://cdn.example/cover.webp','https://other.example/cover.webp']);
  assert.deepEqual(imageSources({image_url:'data:image/svg+xml,bad',image_fallback_urls:'invalid'}),[]);
});

test('arrivals include sales releases and restocks without treating them as new listings',()=>{
  const base={store:'a',url:'https://a.example/game',name:'Ark Nova',detected_at:'2026-11-24T16:33:54Z',availability:'in_stock'};
  const updates=[{...base,product_id:1,kind:'became_available'},{...base,product_id:2,kind:'back_in_stock'},{...base,product_id:3,kind:'new_product'}];
  assert.equal(validateCatalog({rows,stores,updates,metadata:{schema_version:1,exported_at:base.detected_at}}).updates.length,3);
  assert.deepEqual(new Set(feedEvents(updates,'new_product').map(e=>e.kind)),new Set(['became_available','back_in_stock','new_product']));
  assert.equal(feedEvents([{...updates[0],availability:'coming_soon'}],'new_product').length,0);
});
