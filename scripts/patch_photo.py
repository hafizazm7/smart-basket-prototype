from pathlib import Path

p = Path('index.html')
s = p.read_text()

# Client-side OCR for the static prototype.
if 'tesseract.min.js' not in s:
    s = s.replace('</head>', '<script src="https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js"></script>\n</head>', 1)

# Live scan status.
old_camera = '<div class="helper" style="margin-top:5px">One product / price at a time</div>'
new_camera = '<div class="helper" id="cameraStatus" style="margin-top:5px">One product / price at a time</div>'
if 'id="cameraStatus"' not in s and old_camera in s:
    s = s.replace(old_camera, new_camera, 1)

# Keep camera capture and provide a separate gallery picker.
camera_input = '<input id="cameraInput" type="file" accept="image/*" capture="environment" hidden />'
gallery_html = camera_input + '\n    <button class="secondary full" id="galleryBtn" style="margin-top:10px">🖼️ Choose from gallery</button>\n    <input id="galleryInput" type="file" accept="image/*" hidden />'
if 'id="galleryInput"' not in s:
    if camera_input not in s:
        raise SystemExit('camera input anchor not found')
    s = s.replace(camera_input, gallery_html, 1)

helper_anchor = "$('#addItemBtn').onclick=()=>{"
photo_helpers_v3 = r'''function cleanOCRLineV3(v){return String(v||'').replace(/\s+/g,' ').trim()}
function parseShelfLabelTextV3(text){
  const lines=String(text||'').split(/\r?\n/).map(cleanOCRLineV3).filter(v=>v.length>1);
  const full=lines.join('\n');

  let size='';
  const sizeMatch=full.match(/\b(\d+(?:[.,]\d+)?)\s*(kg|gr|gram|g|mg|ml|cl|l|stuks?|st|pcs?|pack)\b/i);
  if(sizeMatch){
    let unit=sizeMatch[2].toLowerCase();
    if(unit==='gr'||unit==='gram')unit='g';
    if(unit==='st')unit='stuks';
    size=sizeMatch[1].replace(',','.')+' '+unit;
  }

  const loose=full.match(/(?:losse\s+prijs|stukprijs|per\s+stuk)\s*[:€]?\s*(\d{1,3}[.,]\d{2})/i);
  let price=loose?Number(loose[1].replace(',','.')):null;
  if(!Number.isFinite(price)){
    const candidates=[];
    lines.forEach((line,index)=>{
      const lower=line.toLowerCase();
      if(/(?:per\s*kg|per\s*l(?:iter)?|\/\s*kg|\/\s*l|100\s*(?:g|ml))/.test(lower))return;
      const matches=line.match(/(?:€\s*)?(\d{1,3}[.,]\d{2})\b/g)||[];
      matches.forEach(raw=>{
        const m=raw.match(/(\d{1,3}[.,]\d{2})/);if(!m)return;
        const value=Number(m[1].replace(',','.'));
        if(value>0&&value<100){
          let score=0;
          if(/€/.test(raw)||/€/.test(line))score+=4;
          if(/losse\s+prijs|stukprijs/i.test(line))score+=7;
          if(/bonus|actie|aanbieding|korting|gratis|nu\b/i.test(line))score+=1;
          if(/per\s*(?:kg|l|liter)|100\s*(?:g|ml)/i.test(line))score-=7;
          score+=index/Math.max(lines.length,1);
          candidates.push({value,score});
        }
      });
    });
    candidates.sort((a,b)=>b.score-a.score||a.value-b.value);
    if(candidates.length)price=candidates[0].value;
  }

  const promoMatch=full.match(/\b(\d+)\s*\+\s*(\d+)\s*gratis\b/i);
  const promo=promoMatch?promoMatch[1]+'+'+promoMatch[2]+' gratis':'';
  return {price,size,promo,raw:text};
}
function parseTSVLinesV3(tsv){
  const raw=String(tsv||'').trim().split(/\r?\n/);
  if(raw.length<2)return [];
  const head=raw[0].split('\t');
  const col=name=>head.indexOf(name);
  const ix={level:col('level'),block:col('block_num'),par:col('par_num'),line:col('line_num'),left:col('left'),top:col('top'),width:col('width'),height:col('height'),conf:col('conf'),text:col('text')};
  if(ix.text<0||ix.left<0||ix.top<0)return [];
  const groups=new Map();
  raw.slice(1).forEach(row=>{
    const a=row.split('\t');
    if(Number(a[ix.level])!==5)return;
    const text=cleanOCRLineV3(a[ix.text]);
    const conf=Number(a[ix.conf]);
    if(!text||(!Number.isNaN(conf)&&conf<12))return;
    const key=[a[ix.block],a[ix.par],a[ix.line]].join('|');
    const w={text,left:Number(a[ix.left])||0,top:Number(a[ix.top])||0,width:Number(a[ix.width])||0,height:Number(a[ix.height])||0,block:a[ix.block],par:a[ix.par],line:a[ix.line]};
    if(!groups.has(key))groups.set(key,[]);
    groups.get(key).push(w);
  });
  return [...groups.entries()].map(([key,words])=>{
    words.sort((a,b)=>a.left-b.left);
    const left=Math.min(...words.map(w=>w.left)),top=Math.min(...words.map(w=>w.top));
    const right=Math.max(...words.map(w=>w.left+w.width)),bottom=Math.max(...words.map(w=>w.top+w.height));
    return {key,text:cleanOCRLineV3(words.map(w=>w.text).join(' ')),left,top,right,bottom,height:Math.max(1,bottom-top),block:words[0].block,par:words[0].par};
  }).sort((a,b)=>a.top-b.top||a.left-b.left);
}
function productFromTSVV3(tsv,fallbackText=''){
  const lines=parseTSVLinesV3(tsv);
  const anchorRe=/(?:\b\d+(?:[.,]\d+)?\s*(?:kg|gr|gram|g|mg|ml|cl|l|stuks?|st|pcs?|pack)\b|\blosse\s+prijs\b|\bstukprijs\b|\b\d{1,3}[.,]\d{2}\b)/i;
  const anchors=lines.filter(l=>anchorRe.test(l.text));
  const ignore=/\b(?:bonus|vegan|actie|aanbieding|korting|gratis|combineren|mogelijk|prijs|losse|stukprijs|per\s+kg|per\s+liter|barcode|ean|nutri|houdbaar|totaal|inhoud)\b/i;
  const candidates=[];
  lines.forEach((line,index)=>{
    let text=line.text
      .replace(/\b\d+\s*\+\s*\d+\s*gratis\b/ig,' ')
      .replace(/€\s*\d{1,3}[.,]\d{2}/g,' ')
      .replace(/\b\d{1,3}[.,]\d{2}\b/g,' ')
      .replace(/\b\d+(?:[.,]\d+)?\s*(?:kg|gr|gram|g|mg|ml|cl|l|stuks?|st|pcs?|pack)\b/ig,' ')
      .replace(/\s+/g,' ').trim();
    const letters=(text.match(/[A-Za-zÀ-ÿ]/g)||[]).length;
    const words=text.split(/\s+/).filter(Boolean);
    const oneLetter=words.filter(w=>/^[A-Za-z]$/.test(w)).length;
    const symbolCount=(text.match(/[^A-Za-zÀ-ÿ0-9 '&().,+\-]/g)||[]).length;
    const bad=ignore.test(text)||/\d{7,}/.test(text)||oneLetter>1||symbolCount>Math.max(2,Math.floor(text.length*.12));
    if(bad||letters<6||text.length<4||text.length>62||words.length<1||words.length>8)return;
    let score=letters*.25;
    if(words.length>=2&&words.length<=5)score+=6;
    if(/^[A-ZÀ-Ý][A-Za-zÀ-ÿ'’.-]+/.test(text))score+=2;
    if(/^[A-Z0-9][A-Z0-9'’.-]{2,}\b/.test(text))score+=2;
    anchors.forEach(anchor=>{
      const dy=(anchor.top-line.bottom)/Math.max(anchor.height,line.height,1);
      const sameBlock=anchor.block===line.block;
      const samePar=sameBlock&&anchor.par===line.par;
      if(dy>=-0.5&&dy<=5){
        score+=Math.max(0,18-dy*3);
        if(sameBlock)score+=7;
        if(samePar)score+=4;
      }
      if(index>0&&lines[index+1]===anchor)score+=10;
    });
    candidates.push({text,score,line});
  });
  candidates.sort((a,b)=>b.score-a.score);
  if(candidates.length&&candidates[0].score>=10)return candidates[0].text;

  // Fallback only if it looks like normal product wording; never fill obvious OCR garbage.
  const fallback=String(fallbackText||'').split(/\r?\n/).map(cleanOCRLineV3).filter(line=>{
    const letters=(line.match(/[A-Za-zÀ-ÿ]/g)||[]).length;
    const symbols=(line.match(/[^A-Za-zÀ-ÿ0-9 '&().,+\-]/g)||[]).length;
    return letters>=7&&line.length<=55&&!ignore.test(line)&&symbols<=2&&!/\d{7,}/.test(line);
  });
  return fallback[0]||'';
}
function cropShelfBandV3(file){
  return new Promise((resolve,reject)=>{
    const url=URL.createObjectURL(file);const img=new Image();
    img.onload=()=>{
      try{
        const start=Math.floor(img.height*.54),end=Math.floor(img.height*.90),h=Math.max(1,end-start);
        const maxW=1700,scale=Math.min(1,maxW/img.width);
        const canvas=document.createElement('canvas');canvas.width=Math.round(img.width*scale);canvas.height=Math.round(h*scale);
        const ctx=canvas.getContext('2d');ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.drawImage(img,0,start,img.width,h,0,0,canvas.width,canvas.height);
        canvas.toBlob(blob=>{URL.revokeObjectURL(url);blob?resolve(blob):reject(new Error('Could not crop photo'))},'image/jpeg',.94);
      }catch(e){URL.revokeObjectURL(url);reject(e)}
    };
    img.onerror=()=>{URL.revokeObjectURL(url);reject(new Error('Could not open photo'))};img.src=url;
  });
}
function cropAroundAnchorV3(imageBlob,tsv){
  return new Promise((resolve,reject)=>{
    const lines=parseTSVLinesV3(tsv);
    const anchors=lines.filter(l=>/(?:\b\d+(?:[.,]\d+)?\s*(?:kg|gr|gram|g|ml|cl|l)\b|\blosse\s+prijs\b|\b\d{1,3}[.,]\d{2}\b)/i.test(l.text));
    if(!anchors.length){resolve(null);return}
    const url=URL.createObjectURL(imageBlob);const img=new Image();
    img.onload=()=>{
      try{
        const a=anchors.sort((x,y)=>((/losse\s+prijs/i.test(y.text)?1:0)-(/losse\s+prijs/i.test(x.text)?1:0))||y.top-x.top)[0];
        const x0=Math.max(0,a.left-520),x1=Math.min(img.width,a.right+360),y0=Math.max(0,a.top-190),y1=Math.min(img.height,a.bottom+150);
        const w=Math.max(1,x1-x0),h=Math.max(1,y1-y0);
        const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;const ctx=canvas.getContext('2d');ctx.drawImage(img,x0,y0,w,h,0,0,w,h);
        canvas.toBlob(blob=>{URL.revokeObjectURL(url);blob?resolve(blob):reject(new Error('Could not focus label'))},'image/jpeg',.96);
      }catch(e){URL.revokeObjectURL(url);reject(e)}
    };
    img.onerror=()=>{URL.revokeObjectURL(url);resolve(null)};img.src=url;
  });
}
async function runOCRV3(image,status,label='Reading shelf label'){
  return Tesseract.recognize(image,'nld+eng',{logger:m=>{
    if(m.status==='recognizing text'&&Number.isFinite(m.progress))status.textContent=label+'… '+Math.round(m.progress*100)+'%';
    else if(m.status)status.textContent=label+'…';
  }});
}
async function analyzeShelfPhotoV3(file){
  const status=$('#cameraStatus');if(!file)return;status.textContent='Finding the shelf label…';$('#cameraBox').style.opacity='.72';
  try{
    if(!window.Tesseract)throw new Error('Photo reader unavailable');
    let band;try{band=await cropShelfBandV3(file)}catch(e){band=file}
    const broad=await runOCRV3(band,status,'Reading shelf area');
    let best=broad;
    try{
      const focused=await cropAroundAnchorV3(band,broad?.data?.tsv||'');
      if(focused){status.textContent='Focusing on the price label…';best=await runOCRV3(focused,status,'Reading price label')}
    }catch(e){console.warn('Focused label scan skipped',e)}

    const broadParsed=parseShelfLabelTextV3(broad?.data?.text||'');
    const bestParsed=parseShelfLabelTextV3(best?.data?.text||'');
    const parsed={
      product:productFromTSVV3(best?.data?.tsv||'',best?.data?.text||'')||productFromTSVV3(broad?.data?.tsv||'',broad?.data?.text||''),
      price:Number.isFinite(bestParsed.price)?bestParsed.price:broadParsed.price,
      size:bestParsed.size||broadParsed.size,
      promo:bestParsed.promo||broadParsed.promo
    };
    let found=[!!parsed.product,Number.isFinite(parsed.price),!!parsed.size].filter(Boolean).length;
    if(parsed.product){if(!updateContext.id||!$('#detectedProduct').value.trim())$('#detectedProduct').value=parsed.product}
    if(Number.isFinite(parsed.price))$('#detectedPrice').value=parsed.price.toFixed(2);
    if(parsed.size)$('#detectedSize').value=parsed.size;
    const promoNote=parsed.promo?' Offer detected: '+parsed.promo+'.':'';
    status.textContent=found===3?'Detected product, price and size — please confirm.'+promoNote:found?'Detected '+found+' of 3 details — please check and correct the rest.'+promoNote:'Could not read the shelf label clearly — try a closer photo of the label.';
    toast(found?'Shelf label detected':'Could not read shelf label clearly');
  }catch(err){console.error(err);status.textContent='Could not analyze this photo. Try a closer photo of the shelf label or enter the details manually.';toast('Photo reading failed')}
  finally{$('#cameraBox').style.opacity='1'}
}

'''
if 'function analyzeShelfPhotoV3(file)' not in s:
    if helper_anchor not in s:
        raise SystemExit('JS anchor not found')
    s = s.replace(helper_anchor, photo_helpers_v3 + helper_anchor, 1)

# Route both camera and gallery through V3. Handle whichever earlier prototype version is present.
for old in [
    "$('#cameraInput').onchange=async()=>{const file=$('#cameraInput').files[0];if(file)await analyzeShelfPhoto(file)};",
    "$('#cameraInput').onchange=async()=>{const file=$('#cameraInput').files[0];if(file)await analyzeShelfPhotoV2(file)};"
]:
    s = s.replace(old, "$('#cameraInput').onchange=async()=>{const file=$('#cameraInput').files[0];if(file)await analyzeShelfPhotoV3(file)};")

camera_click = "$('#cameraBox').onclick=()=>$('#cameraInput').click();"
if "$('#galleryBtn').onclick" not in s:
    handlers = camera_click + "\n$('#galleryBtn').onclick=()=>$('#galleryInput').click();\n$('#galleryInput').onchange=async()=>{const file=$('#galleryInput').files[0];if(file)await analyzeShelfPhotoV3(file)};"
    if camera_click not in s:
        raise SystemExit('camera click handler not found')
    s = s.replace(camera_click, handlers, 1)
else:
    for old in [
        "$('#galleryInput').onchange=async()=>{const file=$('#galleryInput').files[0];if(file)await analyzeShelfPhoto(file)};",
        "$('#galleryInput').onchange=async()=>{const file=$('#galleryInput').files[0];if(file)await analyzeShelfPhotoV2(file)};"
    ]:
        s = s.replace(old, "$('#galleryInput').onchange=async()=>{const file=$('#galleryInput').files[0];if(file)await analyzeShelfPhotoV3(file)};")

p.write_text(s)
