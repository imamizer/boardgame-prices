export const STOCK_LABELS={in_stock:'Stokta',out_of_stock:'Stokta yok',preorder:'Ön sipariş',coming_soon:'Yakında',unknown:'Belirtilmemiş'};
export const LANGUAGE_LABELS={TR:'Türkçe',EN:'İngilizce'};
export const DEFAULT_FILTERS={query:'',language:'',type:'',stores:[],inStock:true,min:'',max:'',sort:'name',page:1};
export function fold(value){return String(value??'').toLocaleLowerCase('tr-TR').replace(/ı/g,'i').normalize('NFD').replace(/[\u0300-\u036f]/g,'');}
export function minor(value){
  if(value===null||value===undefined||value==='')return null;
  if(!['string','number'].includes(typeof value))return null;
  const amount=Number(value);const result=Math.round(amount*100);
  return Number.isFinite(amount)&&amount>=0&&Number.isSafeInteger(result)?result:null;
}
export function safeUrl(value){try{const url=new URL(value);return ['https:','http:'].includes(url.protocol)?url.href:null;}catch{return null;}}
export function offersFor(row,stores){return stores.flatMap(store=>{
  const url=safeUrl(row[`${store.code}_url`]);
  if(!url)return [];
  return [{store:store.code,storeName:store.name,url,priceMinor:minor(row[`${store.code}_price`]),stock:row[`${store.code}_stock`]||'unknown',observedAt:store.current_observed_at,lastStatus:store.last_attempt_status}];
});}
export function decorate(row,stores,selected=[]){
  const offers=offersFor(row,stores).filter(o=>!selected.length||selected.includes(o.store));
  const eligible=offers.filter(o=>o.stock==='in_stock'&&o.priceMinor!==null);
  const low=eligible.length?Math.min(...eligible.map(o=>o.priceMinor)):null;
  return {...row,offers,low,cheapest:eligible.filter(o=>o.priceMinor===low),stockCount:offers.filter(o=>o.stock==='in_stock').length};
}
export function filterCatalogue(rows,stores,filters){
  const f={...DEFAULT_FILTERS,...filters};const query=fold(f.query.trim());
  const minimum=f.min===''?null:minor(f.min);const maximum=f.max===''?null:minor(f.max);
  const result=rows.map(row=>decorate(row,stores,f.stores)).filter(row=>
    (!query||fold(row.name).includes(query))&&(!f.language||row.language===f.language)&&
    (!f.type||row.product_type===f.type)&&row.offers.length&&(!f.inStock||row.stockCount>0)&&
    (minimum===null||(row.low!==null&&row.low>=minimum))&&(maximum===null||(row.low!==null&&row.low<=maximum)));
  const collator=new Intl.Collator('tr',{sensitivity:'base',numeric:true});
  result.sort((a,b)=>{
    if(f.sort==='price_asc'||f.sort==='price_desc'){
      if(a.low===null&&b.low!==null)return 1;if(b.low===null&&a.low!==null)return -1;
      if(a.low!==null&&a.low!==b.low)return (a.low-b.low)*(f.sort==='price_desc'?-1:1);
    }
    if(f.sort==='stores'&&a.offers.length!==b.offers.length)return b.offers.length-a.offers.length;
    return collator.compare(a.name,b.name)||collator.compare(a.language,b.language)||a.edition_id-b.edition_id;
  });return result;
}
export function readState(search,storeCodes){
  const p=new URLSearchParams(search);const number=v=>/^\d+(\.\d+)?$/.test(v??'')?v:'';
  return {...DEFAULT_FILTERS,query:p.get('q')||'',language:['TR','EN'].includes(p.get('lang'))?p.get('lang'):'',
    type:['game','expansion','bundle','unknown'].includes(p.get('type'))?p.get('type'):'',
    stores:(p.get('stores')||'').split(',').filter(s=>storeCodes.includes(s)),inStock:p.get('stock')!=='0',
    min:number(p.get('min')),max:number(p.get('max')),sort:['name','price_asc','price_desc','stores'].includes(p.get('sort'))?p.get('sort'):'name',
    page:Math.max(1,Number.parseInt(p.get('page'),10)||1),view:p.get('view')==='catalog'||p.get('q')?'catalog':'home'};
}
export function stateSearch(state){
  const p=new URLSearchParams();if(state.view==='catalog')p.set('view','catalog');
  if(state.query)p.set('q',state.query);if(state.language)p.set('lang',state.language);if(state.type)p.set('type',state.type);
  if(state.stores.length)p.set('stores',state.stores.join(','));if(!state.inStock)p.set('stock','0');
  if(state.min!=='')p.set('min',state.min);if(state.max!=='')p.set('max',state.max);if(state.sort!=='name')p.set('sort',state.sort);
  if(state.page>1)p.set('page',String(state.page));return p.toString();
}
export function validateCatalog(data){
  if(data?.metadata?.schema_version!==1||!Array.isArray(data.rows)||!Array.isArray(data.stores)||!Array.isArray(data.updates))throw Error('Invalid catalog format');
  if(!Number.isFinite(Date.parse(data.metadata.exported_at)))throw Error('Invalid export date');
  const ids=new Set();const codes=new Set();
  for(const s of data.stores){if(!/^[a-z][a-z0-9_]*$/.test(s.code)||typeof s.name!=='string'||codes.has(s.code))throw Error('Invalid store');codes.add(s.code);}
  for(const row of data.rows){if(!Number.isSafeInteger(row.edition_id)||!row.name||ids.has(row.edition_id)||row.currency!=='TRY')throw Error('Invalid edition');ids.add(row.edition_id);}
  for(const event of data.updates){if(!['new_product','price_down','stock_out','removed_from_listing'].includes(event.kind)||!codes.has(event.store)||!safeUrl(event.url)||!event.name||!Number.isFinite(Date.parse(event.detected_at)))throw Error('Invalid event');}
  return data;
}

export function feedEvents(updates,group){
  const kinds=group==='unavailable'?['stock_out','removed_from_listing']:[group];
  const seen=new Set();
  return updates.filter(event=>kinds.includes(event.kind)).sort((a,b)=>Date.parse(b.detected_at)-Date.parse(a.detected_at)||Number(b.kind==='removed_from_listing')-Number(a.kind==='removed_from_listing')).filter(event=>{
    // A disappearing listing can generate both stock and removal events in one run.
    const key=`${event.store}:${event.product_id}`;
    if(seen.has(key))return false;seen.add(key);return true;
  });
}
