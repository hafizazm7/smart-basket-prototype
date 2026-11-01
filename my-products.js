/* Smart Basket My Products — isolated catalog, existing shopping flows unchanged */
(()=>{
'use strict';
const KEY='smart-basket-my-products-v1';
const root=document.getElementById('productsScreen');
if(!root)return;
const q=id=>document.getElementById(id);
const clean=v=>String(v||'').trim();
const escape=v=>clean(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let products=[];
try{const saved=JSON.parse(localStorage.getItem(KEY)||'[]');if(Array.isArray(saved))products=saved.filter(p=>p&&typeof p.name==='string')}catch(e){console.warn('Catalog could not be loaded',e)}
let editing=null;
function save(){try{localStorage.setItem(KEY,JSON.stringify(products));return true}catch(e){alert('Unable to save products on this device. Check browser storage.');return false}}
function render(){
 const search=clean(q('productSearch').value).toLowerCase();
 const list=q('productsList');list.replaceChildren();
 const filtered=products.filter(p=>(p.name+' '+(p.brand||'')+' '+(p.size||'')).toLowerCase().includes(search));
 q('productCount').textContent=products.length+' saved products';
 if(!filtered.length){list.innerHTML='<p class="helper">No saved products found. Add your first product above.</p>';return}
 filtered.forEach(p=>{
 const el=document.createElement('div');el.className='card';el.style.marginBottom='10px';
 el.innerHTML='<div class="row space"><div><strong>'+escape(p.name)+'</strong><div class="helper">'+escape([p.brand,p.size].filter(Boolean).join(' · '))+'</div><div class="helper">'+escape(p.store||'')+(p.price!==''&&p.price!=null?' · €'+Number(p.price).toFixed(2):'')+'</div></div><button class="secondary" data-edit>Edit</button></div><div class="row" style="margin-top:10px"><button class="secondary" data-add>Add to list</button><button class="danger-ghost" data-delete>Delete</button></div>';
 el.querySelector('[data-edit]').onclick=()=>open(p);
 el.querySelector('[data-add]').onclick=()=>{if(typeof addItem==='function'){addItem(p.name+(p.size?' '+p.size:''));toast('Added to shopping list')}else alert('Shopping list unavailable')};
 el.querySelector('[data-delete]').onclick=()=>{if(!confirm('Delete '+p.name+' from My Products?'))return;products=products.filter(x=>x.id!==p.id);if(save())render()};
 list.appendChild(el);
 });
}
function open(p){
 editing=p?.id||null;q('productForm').reset();
 q('productFormTitle').textContent=p?'Edit product':'Add product';
 for(const field of ['name','brand','size','store','price','notes'])q('product_'+field).value=p?.[field]??'';
 q('productPhotoStatus').textContent='Photo optional — scan to suggest details, then confirm.';
 q('productFormPanel').hidden=false;
 q('product_name').focus();
}
q('newProduct').onclick=()=>open();
q('cancelProduct').onclick=()=>{q('productFormPanel').hidden=true;editing=null};
q('productSearch').oninput=render;
q('productForm').onsubmit=e=>{
 e.preventDefault();
 const p={id:editing||('p_'+Date.now()+'_'+Math.random().toString(36).slice(2,7))};
 for(const field of ['name','brand','size','store','notes'])p[field]=clean(q('product_'+field).value);
 const price=clean(q('product_price').value).replace(',','.');
 if(!p.name){q('product_name').focus();return}
 if(price&&!/^\d+(\.\d{1,2})?$/.test(price)){alert('Enter a valid non-negative price, e.g. 2.49');return}
 p.price=price===''?'':Number(price);
 if(editing){const i=products.findIndex(x=>x.id===editing);if(i>=0)products[i]={...products[i],...p};else products.unshift(p)}
 else products.unshift(p);
 if(save()){q('productFormPanel').hidden=true;editing=null;render();toast('Product saved')}
};
q('productPhoto').onchange=async e=>{
 const file=e.target.files?.[0];if(!file)return;
 const status=q('productPhotoStatus');status.textContent='Reading image…';
 try{
  if(!window.Tesseract)throw Error('Photo reader is not available');
  const result=await Tesseract.recognize(file,'nld+eng');
  const raw=result?.data?.text||'';
  const parsed=typeof parseShelfLabelTextV2==='function'?parseShelfLabelTextV2(raw):typeof parseShelfPhotoText==='function'?parseShelfPhotoText(raw):{};
  if(parsed.product&&!q('product_name').value)q('product_name').value=parsed.product;
  if(parsed.size&&!q('product_size').value)q('product_size').value=parsed.size;
  if(Number.isFinite(parsed.price)&&!q('product_price').value)q('product_price').value=parsed.price.toFixed(2);
  status.textContent='Scan complete. Check and edit all details before saving.';
 }catch(err){console.warn(err);status.textContent='Scan unavailable. Enter product details manually.'}
 e.target.value='';
};
const originalShow=window.showScreen;
if(typeof originalShow==='function')window.showScreen=function(name){originalShow(name);if(name==='products')render()};
render();
})();