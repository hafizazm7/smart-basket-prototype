from pathlib import Path

p = Path('index.html')
s = p.read_text()

if 'tesseract.min.js' not in s:
    s = s.replace('</head>', '<script src="https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js"></script>\n</head>', 1)

old_camera = '<div class="helper" style="margin-top:5px">One product / price at a time</div>'
new_camera = '<div class="helper" id="cameraStatus" style="margin-top:5px">One product / price at a time</div>'
if 'id="cameraStatus"' not in s and old_camera in s:
    s = s.replace(old_camera, new_camera, 1)

# Keep the camera shortcut, but also offer an explicit gallery picker.
camera_input = '<input id="cameraInput" type="file" accept="image/*" capture="environment" hidden />'
gallery_html = camera_input + '\n    <button class="secondary full" id="galleryBtn" style="margin-top:10px">🖼️ Choose from gallery</button>\n    <input id="galleryInput" type="file" accept="image/*" hidden />'
if 'id="galleryInput"' not in s:
    if camera_input not in s:
        raise SystemExit('camera input anchor not found')
    s = s.replace(camera_input, gallery_html, 1)

helper_anchor = "$('#addItemBtn').onclick=()=>{"
photo_helpers_v2 = r'''function cleanOCRLineV2(v){return String(v||'').replace(/\s+/g,' ').trim()}
function parseShelfLabelTextV2(text){
  const lines=String(text||'').split(/\r?\n/).map(cleanOCRLineV2).filter(v=>v.length>1);
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
          if(/bonus|actie|aanbieding|korting|gratis|nu\b/i.test(line))score+=2;
          if(/van\s*[:€]?\s*\d/i.test(line))score-=3;
          if(/losse\s+prijs/i.test(line))score+=5;
          score+=index/Math.max(lines.length,1);
          candidates.push({value,score});
        }
      });
    });
    candidates.sort((a,b)=>b.score-a.score||a.value-b.value);
    if(candidates.length)price=candidates[0].value;
  }

  const ignored=/^(?:bonus|vegan|actie|aanbieding|korting|gratis|combineren\s+mogelijk|prijs|losse\s+prijs|per\b|totaal|inhoud|houdbaar|barcode|ean|nutri[- ]?score|alleen|alle|nu\b)/i;
  const productLines=[];
  lines.forEach((line,index)=>{
    let cleaned=line
      .replace(/\b\d+\s*\+\s*\d+\s*gratis\b/ig,' ')
      .replace(/€\s*\d{1,3}[.,]\d{2}/g,' ')
      .replace(/\b\d{1,3}[.,]\d{2}\b/g,' ')
      .replace(/\b\d+(?:[.,]\d+)?\s*(?:kg|gr|gram|g|mg|ml|cl|l|stuks?|st|pcs?|pack)\b/ig,' ')
      .replace(/\s+/g,' ').trim();
    const letters=(cleaned.match(/[A-Za-zÀ-ÿ]/g)||[]).length;
    const bad=ignored.test(cleaned)||/\b(?:prijs per|per kg|per liter|losse prijs)\b/i.test(cleaned)||/\d{7,}/.test(cleaned);
    if(!bad&&letters>=4&&cleaned.length>=3&&cleaned.length<=55)productLines.push({index,text:cleaned,letters});
  });

  let product='';
  if(productLines.length){
    let best=null;
    for(let i=0;i<productLines.length;i++){
      const a=productLines[i];
      let text=a.text;
      let score=a.letters;
      if(i+1<productLines.length&&productLines[i+1].index-a.index<=1){
        const b=productLines[i+1];
        const combined=(a.text+' '+b.text).trim();
        if(combined.length<=60){text=combined;score+=b.letters+5;}
      }
      if(/^[A-Z][A-Za-zÀ-ÿ'’.-]+\s+/.test(text))score+=3;
      if(!best||score>best.score)best={text,score};
    }
    product=best?best.text:'';
  }

  const promoMatch=full.match(/\b(\d+)\s*\+\s*(\d+)\s*gratis\b/i);
  const promo=promoMatch?promoMatch[1]+'+'+promoMatch[2]+' gratis':'';
  return {product,price,size,promo,raw:text};
}
function cropShelfRegionV2(file){
  return new Promise((resolve,reject)=>{
    const url=URL.createObjectURL(file);const img=new Image();
    img.onload=()=>{
      try{
        const start=Math.floor(img.height*.58);const h=img.height-start;
        const maxW=1600;const scale=Math.min(1,maxW/img.width);
        const canvas=document.createElement('canvas');canvas.width=Math.round(img.width*scale);canvas.height=Math.round(h*scale);
        const ctx=canvas.getContext('2d');ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
        ctx.drawImage(img,0,start,img.width,h,0,0,canvas.width,canvas.height);
        canvas.toBlob(blob=>{URL.revokeObjectURL(url);blob?resolve(blob):reject(new Error('Could not crop photo'))},'image/jpeg',.92);
      }catch(e){URL.revokeObjectURL(url);reject(e)}
    };
    img.onerror=()=>{URL.revokeObjectURL(url);reject(new Error('Could not open photo'))};img.src=url;
  });
}
async function runOCRV2(image,status){
  return Tesseract.recognize(image,'nld+eng',{logger:m=>{
    if(m.status==='recognizing text'&&Number.isFinite(m.progress))status.textContent='Reading shelf label… '+Math.round(m.progress*100)+'%';
    else if(m.status)status.textContent='Focusing on shelf label…';
  }});
}
async function analyzeShelfPhotoV2(file){
  const status=$('#cameraStatus');if(!file)return;status.textContent='Focusing on the shelf label…';$('#cameraBox').style.opacity='.72';
  try{
    if(!window.Tesseract)throw new Error('Photo reader unavailable');
    let cropped=null;try{cropped=await cropShelfRegionV2(file)}catch(e){cropped=file}
    let result=await runOCRV2(cropped,status);
    let parsed=parseShelfLabelTextV2(result?.data?.text||'');
    let found=[!!parsed.product,Number.isFinite(parsed.price),!!parsed.size].filter(Boolean).length;
    if(found<2&&cropped!==file){
      status.textContent='Checking the full photo…';
      const fullResult=await runOCRV2(file,status);const fallback=parseShelfLabelTextV2(fullResult?.data?.text||'');
      parsed={product:parsed.product||fallback.product,price:Number.isFinite(parsed.price)?parsed.price:fallback.price,size:parsed.size||fallback.size,promo:parsed.promo||fallback.promo};
      found=[!!parsed.product,Number.isFinite(parsed.price),!!parsed.size].filter(Boolean).length;
    }
    if(parsed.product){if(!updateContext.id||!$('#detectedProduct').value.trim())$('#detectedProduct').value=parsed.product;}
    if(Number.isFinite(parsed.price))$('#detectedPrice').value=parsed.price.toFixed(2);
    if(parsed.size)$('#detectedSize').value=parsed.size;
    const promoNote=parsed.promo?' Offer detected: '+parsed.promo+'.':'';
    status.textContent=found===3?'Detected product, price and size — please confirm.'+promoNote:found?'Detected '+found+' of 3 details — please check and correct the rest.'+promoNote:'Could not read the shelf label clearly — try a closer photo of the label.';
    toast(found?'Shelf label detected':'Could not read shelf label clearly');
  }catch(err){console.error(err);status.textContent='Could not analyze this photo. Try a closer photo of the shelf label or enter the details manually.';toast('Photo reading failed')}
  finally{$('#cameraBox').style.opacity='1'}
}

'''
if 'function analyzeShelfPhotoV2(file)' not in s:
    if helper_anchor not in s:
        raise SystemExit('JS anchor not found')
    s = s.replace(helper_anchor, photo_helpers_v2 + helper_anchor, 1)

# Route both camera and gallery through the improved shelf-label-focused extractor.
s = s.replace("$('#cameraInput').onchange=async()=>{const file=$('#cameraInput').files[0];if(file)await analyzeShelfPhoto(file)};", "$('#cameraInput').onchange=async()=>{const file=$('#cameraInput').files[0];if(file)await analyzeShelfPhotoV2(file)};")
s = s.replace("$('#cameraInput').onchange=async()=>{const file=$('#cameraInput').files[0];if(file)await analyzeShelfPhotoV2(file)};", "$('#cameraInput').onchange=async()=>{const file=$('#cameraInput').files[0];if(file)await analyzeShelfPhotoV2(file)};")

camera_click = "$('#cameraBox').onclick=()=>$('#cameraInput').click();"
gallery_handlers = camera_click + "\n$('#galleryBtn').onclick=()=>$('#galleryInput').click();\n$('#galleryInput').onchange=async()=>{const file=$('#galleryInput').files[0];if(file)await analyzeShelfPhotoV2(file)};"
if "$('#galleryBtn').onclick" not in s:
    if camera_click not in s:
        raise SystemExit('camera click handler not found')
    s = s.replace(camera_click, gallery_handlers, 1)
else:
    s = s.replace("$('#galleryInput').onchange=async()=>{const file=$('#galleryInput').files[0];if(file)await analyzeShelfPhoto(file)};", "$('#galleryInput').onchange=async()=>{const file=$('#galleryInput').files[0];if(file)await analyzeShelfPhotoV2(file)};")

p.write_text(s)
