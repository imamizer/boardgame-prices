import {DEFAULT_FILTERS,LANGUAGE_LABELS,STOCK_LABELS,decorate,feedEvents,filterCatalogue,minor,readState,safeUrl,stateSearch,validateCatalog} from './catalogue.mjs';
const $=id=>document.getElementById(id);
const money=new Intl.NumberFormat('tr-TR',{style:'currency',currency:'TRY',maximumFractionDigits:2});
const time=new Intl.DateTimeFormat('tr-TR',{day:'numeric',month:'long',hour:'2-digit',minute:'2-digit',timeZone:'Europe/Istanbul'});
const shortDate=new Intl.DateTimeFormat('tr-TR',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit',timeZone:'Europe/Istanbul'});
const palette=[['#eaf1f6','#52758d'],['#f1edf7','#826593'],['#edf4ee','#63846b'],['#faf0e8','#b37c50']];
let data=null,state={...DEFAULT_FILTERS,stores:[],view:'home'};const pageSize=24;const feedLimits={new_product:12,price_down:12,unavailable:12};
function element(tag,className,text){const e=document.createElement(tag);if(className)e.className=className;if(text!==undefined)e.textContent=text;return e;}
function formatPrice(value){return value===null?'Fiyat belirtilmemiş':money.format(value/100);}
function dateText(value,short=false){const stamp=Date.parse(value);return Number.isFinite(stamp)?(short?shortDate:time).format(stamp):'Kontrol zamanı bilinmiyor';}
function mark(name,id){const e=element('div','edition-mark',name.split(/\s+/).slice(0,2).map(s=>s[0]).join('').toLocaleUpperCase('tr-TR'));const p=palette[Math.abs(Number(id)||0)%palette.length];e.style.setProperty('--mark-bg',p[0]);e.style.setProperty('--mark-ink',p[1]);e.setAttribute('aria-hidden','true');return e;}
function badge(language){return element('span','language-badge',LANGUAGE_LABELS[language]||'Dil belirtilmemiş');}
function link(label,url){const e=element('a','card-link',label);const safe=safeUrl(url);if(safe){e.href=safe;e.target='_blank';e.rel='noopener noreferrer';}return e;}
function chooseView(view){state.view=view;if(view==='home'){state.query='';$('search').value='';}render();}
function saveState(){const query=stateSearch(state);history.replaceState(null,'',`${location.pathname}${query?'?'+query:''}`);}
function renderSummary(){const inStock=data.rows.filter(row=>decorate(row,data.stores).stockCount>0).length;$('summary').replaceChildren();for(const [n,label] of [[data.rows.length,'oyun sürümü'],[data.stores.length,'mağaza'],[inStock,'stokta']]){const span=element('span');span.append(element('strong','',n.toLocaleString('tr-TR')),document.createTextNode(' '+label));$('summary').append(span);}}
function renderStatus(){
  const stamps=data.stores.map(s=>Date.parse(s.current_observed_at)).filter(Number.isFinite);const oldest=stamps.length?Math.min(...stamps):NaN;const failed=data.stores.filter(s=>s.last_attempt_status!=='success');
  const stale=Number.isFinite(oldest)&&Date.now()-oldest>48*60*60*1000;
  $('status-text').textContent=`Katalog: ${dateText(data.metadata.exported_at)}${failed.length?' · '+failed.length+' mağazanın son kontrolü tamamlanamadı':stale?' · Bazı mağaza verileri 48 saatten eski':' · Her sabah güncellenir'}`;
  $('status').classList.toggle('warning',!!failed.length||stale);
  $('store-status').replaceChildren();for(const store of data.stores){const e=element('article');e.append(element('strong','',store.name),element('time','',dateText(store.current_observed_at)));if(store.last_attempt_status!=='success')e.append(element('small','failed','Son deneme başarısız; son başarılı veri gösteriliyor.'));$('store-status').append(e);}
}
function eventCard(event){
  const card=element('article','feed-card');
  const body=element('div','feed-main');const title=element('div','feed-title-line');
  title.append(element('h3','card-title',event.name),badge(event.language));
  const info=element('p','card-meta',event.store_name);const stock=element('span','small-stock'+(event.availability==='in_stock'&&event.kind!=='removed_from_listing'?'':' unavailable'),event.kind==='removed_from_listing'?'Listeden kaldırıldı':STOCK_LABELS[event.availability]||'Stok belirtilmemiş');
  info.append(document.createTextNode(' · '),stock);
  const bottom=element('div','card-bottom');const stamp=element('time','',dateText(event.detected_at,true));stamp.dateTime=event.detected_at;
  bottom.append(stamp,link('Mağazada incele',event.url));body.append(title,info,bottom);
  const price=element('div','feed-price');
  if(event.kind==='price_down'&&event.old_price_minor>0){
    const percent=Math.round((event.old_price_minor-event.price_minor)/event.old_price_minor*100);
    price.append(element('span','discount-badge',`%${percent} düşüş`),element('span','old-price',formatPrice(event.old_price_minor)));
  }else if(['stock_out','removed_from_listing'].includes(event.kind)){
    price.append(element('span','unavailable-badge',event.kind==='removed_from_listing'?'Listeden kaldırıldı':'Stok tükendi'),element('span','last-price-label','Son görülen fiyat'));
  }else price.append(element('span','new-badge','Yeni eklendi'));
  price.append(element('strong','card-price',formatPrice(event.price_minor)));
  card.append(body,price);return card;
}

function renderFeed(){
  for(const [kind,target,count,empty] of [['new_product','new-products','new-count','Bu kontrollerde yeni bir ürün bulunmadı.'],['price_down','price-drops','deal-count','Bu kontrollerde fiyat düşüşü bulunmadı.'],['unavailable','unavailable-products','unavailable-count','Bu kontrollerde tükenen veya kaldırılan ilan bulunmadı.']]){
    const events=feedEvents(data.updates,kind);$(count).textContent=events.length;$(target).replaceChildren();
    if(events.length){for(const event of events.slice(0,feedLimits[kind]))$(target).append(eventCard(event));if(events.length>feedLimits[kind]){const more=element('button','feed-more','Daha fazla göster');more.type='button';more.addEventListener('click',()=>{feedLimits[kind]+=12;renderFeed();});$(target).append(more);}}
    else{const box=element('div','empty-feed');const content=element('div');content.append(element('strong','',empty),element('p','','Tüm oyunları arayabilir veya kataloğu mağazalara göre filtreleyebilirsin.'));box.append(element('span','empty-symbol','◇'),content);$(target).append(box);}
  }
}
function productCard(row){
  const card=element('article','product-card');const top=element('div','card-top');top.append(mark(row.name,row.edition_id),badge(row.language));
  const button=element('button','compare-button','Fiyatları karşılaştır');button.type='button';button.addEventListener('click',()=>openDetails(row.edition_id));
  const title=element('h3','card-title',row.name);const meta=element('p','card-meta',row.offers.length+' mağazada');
  const prices=element('div','card-price-row');prices.append(element('strong','card-price'+(row.low===null?' small':''),row.low===null?(row.stockCount?'Fiyat belirtilmemiş':'Stokta teklif yok'):formatPrice(row.low)));
  card.append(top,title,meta,prices);if(row.cheapest.length)card.append(element('p','store-name',row.cheapest.map(o=>o.storeName).join(', ')));
  const bottom=element('div','card-bottom');bottom.append(element('span','small-stock'+(row.stockCount?'':' unavailable'),row.stockCount?`${row.stockCount} mağazada stokta`:'Stokta yok'),button);card.append(bottom);return card;
}
function renderCatalogue(){
  const rows=filterCatalogue(data.rows,data.stores,state);const pages=Math.max(1,Math.ceil(rows.length/pageSize));state.page=Math.min(state.page,pages);
  $('result-count').textContent=`${rows.length.toLocaleString('tr-TR')} sonuç`;$('active-query').textContent=state.query?`“${state.query}” için sonuçlar`:'';
  $('products').replaceChildren(...rows.slice((state.page-1)*pageSize,state.page*pageSize).map(productCard));$('no-results').hidden=!!rows.length;$('pagination').replaceChildren();
  if(rows.length>pageSize){for(const [label,disabled,page] of [['Önceki',state.page===1,state.page-1],['Sonraki',state.page===pages,state.page+1]]){const b=element('button','',label);b.type='button';b.disabled=disabled;b.addEventListener('click',()=>{state.page=page;render();$('catalog').scrollIntoView({behavior:'smooth',block:'start'});});if(label==='Sonraki')$('pagination').append(element('span','',`${state.page} / ${pages}`));$('pagination').append(b);}}
}
function syncControls(){for(const [id,key] of [['search','query'],['language','language'],['type','type'],['price-min','min'],['price-max','max'],['sort','sort']]){if($(id).value!==state[key])$(id).value=state[key];}$('in-stock').checked=state.inStock;for(const input of $('store-filters').querySelectorAll('input'))input.checked=state.stores.includes(input.value);}
function render(){if(!data)return;$('home').hidden=state.view!=='home';$('catalog').hidden=state.view!=='catalog';$('nav-home').classList.toggle('active',state.view==='home');$('nav-catalog').classList.toggle('active',state.view==='catalog');$('nav-home').setAttribute('aria-current',state.view==='home'?'page':'false');$('nav-catalog').setAttribute('aria-current',state.view==='catalog'?'page':'false');syncControls();if(state.view==='catalog')renderCatalogue();saveState();}
function openDetails(id){
  const source=data.rows.find(row=>row.edition_id===id);if(!source)return;const row=decorate(source,data.stores);$('dialog-title').textContent=row.name;$('dialog-language').textContent=LANGUAGE_LABELS[row.language]||'Dil belirtilmemiş';$('offer-rows').replaceChildren();
  const offers=[...row.offers].sort((a,b)=>(a.stock!=='in_stock')-(b.stock!=='in_stock')||(a.priceMinor??Infinity)-(b.priceMinor??Infinity));
  for(const offer of offers){const best=offer.stock==='in_stock'&&offer.priceMinor!==null&&offer.priceMinor===row.low;const tr=element('tr',best?'best':'');const shop=element('td','',offer.storeName);shop.append(element('span','offer-time',dateText(offer.observedAt,true)));const stock=element('td','offer-stock '+(offer.stock==='in_stock'?'available':offer.stock==='out_of_stock'?'unavailable':'pending'),STOCK_LABELS[offer.stock]||'Belirtilmemiş');const price=element('td','offer-price',formatPrice(offer.priceMinor));if(best)price.append(element('span','best-label','En düşük fiyat'));const action=element('td');action.append(link('Mağazada aç',offer.url));tr.append(shop,stock,price,action);$('offer-rows').append(tr);}
  $('details').showModal();
}
function updateFilter(key,value){state[key]=value;state.page=1;state.view='catalog';render();}
function resetFilters(){state={...DEFAULT_FILTERS,stores:[],view:'catalog'};render();}
async function load(){
  $('error').hidden=true;$('loading').hidden=false;
  try{const response=await fetch(new URL('./data/catalog.json',import.meta.url),{cache:'no-cache'});if(!response.ok)throw Error('Unavailable');data=validateCatalog(await response.json());
    state=readState(location.search,data.stores.map(s=>s.code));$('store-filters').replaceChildren();for(const store of data.stores){const label=element('label','check');const input=element('input');input.type='checkbox';input.value=store.code;input.addEventListener('change',()=>updateFilter('stores',[...$('store-filters').querySelectorAll('input:checked')].map(i=>i.value)));label.append(input,element('span','',store.name));$('store-filters').append(label);}
    renderSummary();renderStatus();renderFeed();render();
  }catch{$('error').hidden=false;$('home').hidden=true;$('catalog').hidden=true;$('summary').textContent='Katalog şu anda kullanılamıyor.';$('status-text').textContent='Güncel veri alınamadı.';}
  finally{$('loading').hidden=true;}
}
$('search-form').addEventListener('submit',event=>{event.preventDefault();updateFilter('query',$('search').value);});
let timer;$('search').addEventListener('input',()=>{clearTimeout(timer);timer=setTimeout(()=>updateFilter('query',$('search').value),130);});
$('nav-home').addEventListener('click',()=>chooseView('home'));$('nav-catalog').addEventListener('click',()=>chooseView('catalog'));$('browse-all').addEventListener('click',()=>{chooseView('catalog');$('catalog').scrollIntoView({behavior:'smooth'});});
for(const [id,key] of [['language','language'],['type','type'],['sort','sort']])$(id).addEventListener('change',()=>updateFilter(key,$(id).value));
for(const [id,key] of [['price-min','min'],['price-max','max']])$(id).addEventListener('input',()=>updateFilter(key,$(id).value));
$('in-stock').addEventListener('change',()=>updateFilter('inStock',$('in-stock').checked));$('reset').addEventListener('click',resetFilters);$('reset-empty').addEventListener('click',resetFilters);
$('stores-toggle').addEventListener('click',()=>{const open=$('store-status').hidden;$('store-status').hidden=!open;$('stores-toggle').setAttribute('aria-expanded',String(open));});
$('close-dialog').addEventListener('click',()=>$('details').close());$('retry').addEventListener('click',load);
window.addEventListener('popstate',()=>{if(data){state=readState(location.search,data.stores.map(s=>s.code));render();}});
load();
