// Run with: node --test tests/catalog.test.cjs
const test=require('node:test');
const assert=require('node:assert/strict');
function match(input,products){
 const norm=v=>String(v||'').toLocaleLowerCase().normalize('NFKC').replace(/[^\p{L}\p{N}]+/gu,' ').trim().replace(/\s+/g,' ');
 const target=norm(input);
 const found=products.filter(p=>p&&p.name&&(norm(p.name)===target||norm([p.name,p.size].filter(Boolean).join(' '))===target));
 return found.length===1?found[0]:null;
}
test('50 catalog matching simulations',()=>{
 const catalog=[{name:'Volle Melk',size:'1 L',store:'ALDI',price:1.29},{name:'Dreft',size:'520 ml',store:'Kruidvat',price:2.49},{name:'Baby wipes',size:'72 stuks',store:'Albert Heijn',price:1.79}];
 for(let i=0;i<50;i++){
  const product=catalog[i%3];
  const input=(i%2?product.name:[product.name,product.size].join(' '));
  assert.equal(match(input,catalog)?.name,product.name);
 }
});
test('unknown and ambiguous products do not silently match',()=>{
 assert.equal(match('Cheese',[{name:'Milk'}]),null);
 assert.equal(match('Milk',[{name:'Milk',size:'1 L'},{name:'Milk',size:'2 L'}]),null);
});
test('case and whitespace differences normalize',()=>{
 assert.equal(match('  volle   MELK 1 l ',[{name:'Volle Melk',size:'1 L'}])?.name,'Volle Melk');
});
