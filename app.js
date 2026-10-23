'use strict';
const $ = (id) => document.getElementById(id);
const MAX_IMAGES = 3;
const MAX_SIZE = 16 * 1024 * 1024;
const files = [];
let latestResults = [];
let working = false;
let ocrWorker = null;
let toastTimer;
const GLOSSARY = [
  ['预售', '예약판매'],['现货','바로 발송 가능한 재고'],['包邮','무료배송'],
  ['运费','배송비'],['发货','발송'],['预计发货','발송 예정'],
  ['定金','예약금(잔금 별도 가능)'],['尾款','잔금'],['补款','추가 결제금'],
  ['缺货','재고 부족'],['无货','품절'],['库存','재고'],['下单','주문하기'],
  ['付款','결제'],['待发货','발송 대기'],['待收货','수령 대기'],
  ['已签收','배송 완료'],['退款','환불'],['退货','반품'],['不支持七天无理由退货','7일 단순변심 반품 불가'],
  ['尺码','사이즈'],['颜色分类','색상/옵션'],['规格','규격'],
  ['优惠券','할인 쿠폰'],['满减','금액 조건부 할인'],['起售','최소 구매 수량'],
  ['正品','정품이라고 표시됨(진위 보증 아님)'],['随机','랜덤'],['盲盒','블라인드 박스'],
  ['一箱','1박스'],['整盒','한 상자'],['单个','낱개'],['拍下','주문하기']
];
function showToast(message){ const t=$('toast'); t.textContent=message; t.classList.add('show'); clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.classList.remove('show'),2600); }
function showProgress(message){$('progressBox').hidden=false;$('progressText').textContent=message;}
function setWorking(val){working=val;$('runButton').disabled=val||files.length===0;$('runButton').textContent=val?'해석 중...':files.length?'한국어로 해석하기':'이미지를 먼저 올려줘';$('fileInput').disabled=val;}
function selectedMode(){return document.querySelector('input[name="mode"]:checked').value;}
function addFiles(list){
  if(working) return;
  let ignored=0;
  for(const file of list){
    if(files.length>=MAX_IMAGES){ignored++;continue;}
    if(!['image/png','image/jpeg','image/webp'].includes(file.type)){ignored++;continue;}
    if(file.size>MAX_SIZE){ignored++;continue;}
    files.push({file,url:URL.createObjectURL(file)});
  }
  renderGallery();setWorking(false);
  if(ignored)showToast('최대 3장, 파일당 16MB 이하의 이미지로 올려줘');
}
function renderGallery(){
  const gallery=$('gallery');gallery.replaceChildren();
  files.forEach((item,index)=>{
    const wrap=document.createElement('div');wrap.className='thumb';
    const image=document.createElement('img');image.src=item.url;image.alt=`선택한 이미지 ${index+1}`;
    const remove=document.createElement('button');remove.type='button';remove.textContent='×';remove.title=`${index+1}번 사진 삭제`;remove.setAttribute('aria-label',remove.title);
    remove.addEventListener('click',()=>{URL.revokeObjectURL(item.url);files.splice(index,1);renderGallery();setWorking(false);});
    const label=document.createElement('small');label.textContent=`사진 ${index+1}`;
    wrap.append(image,remove,label);gallery.append(wrap);
  });
}
function glossaryMatches(original){return GLOSSARY.filter(([cn])=>original.includes(cn)).sort((a,b)=>b[0].length-a[0].length).filter(([cn],_,list)=>!list.some(([longer])=>longer!==cn&&longer.includes(cn)&&original.includes(longer))).slice(0,15);}
function createResultCard(result,index){
  const card=document.createElement('article');card.className='result-card';
  const heading=document.createElement('h3');heading.textContent=`스크린샷 ${index+1} · ${result.mode==='ai'?'AI 해석':'무료 번역'}`;card.append(heading);
  const body=document.createElement('div');body.className='result-body';
  if(result.error){const err=document.createElement('p');err.className='error-panel';err.textContent=result.error;body.append(err);card.append(body);return card;}
  const label=document.createElement('p');label.className='result-label';label.textContent='한국어 해석';
  const translation=document.createElement('p');translation.className='result-text';translation.textContent=result.translated;
  body.append(label,translation);
  const matches=glossaryMatches(result.original||'');
  if(matches.length){const terms=document.createElement('div');terms.className='term-list';
    matches.forEach(([cn,ko])=>{const item=document.createElement('span');item.className='term-chip';const strong=document.createElement('strong');strong.textContent=cn;item.append(strong,` · ${ko}`);terms.append(item);});body.append(terms);
  }
  if(result.original){const details=document.createElement('details');details.className='original-details';const summary=document.createElement('summary');summary.textContent='인식한 중국어 원문 보기';const source=document.createElement('p');source.className='source-text';source.textContent=result.original;details.append(summary,source);body.append(details);}
  if(result.warning){const w=document.createElement('div');w.className='result-warning';w.textContent=result.warning;body.append(w);}
  card.append(body);return card;
}
function renderResults(){
  $('resultsSection').hidden=false;const list=$('results');list.replaceChildren();latestResults.forEach((r,i)=>list.append(createResultCard(r,i)));$('resultsSection').scrollIntoView({behavior:'smooth',block:'start'});
}
function cleanLines(text){return text.split(/\r?\n/).map(x=>x.replace(/\s{2,}/g,' ').trim()).filter(x=>x.length>0).slice(0,50);}
function splitUtf8(text,maxBytes=450){
  const blocks=[];let current='',size=0;
  for(const c of text){const len=new TextEncoder().encode(c).length;if(size+len>maxBytes && current){blocks.push(current);current='';size=0;}current+=c;size+=len;}
  if(current)blocks.push(current);return blocks;
}
async function translateSegment(segment){
  const url=new URL('https://api.mymemory.translated.net/get');url.searchParams.set('q',segment);url.searchParams.set('langpair','zh-CN|ko');
  const response=await fetch(url.toString(),{method:'GET',cache:'no-store'});
  if(!response.ok)throw new Error(`번역 서비스 연결 실패 (${response.status})`);
  const data=await response.json();
  if(data.responseStatus!==200||!data.responseData?.translatedText)throw new Error('무료 번역 사용량을 초과했거나 서비스 응답이 올바르지 않아');
  const output=String(data.responseData.translatedText);
  if(/MYMEMORY WARNING|YOU USED ALL AVAILABLE/i.test(output))throw new Error('무료 번역의 하루 사용량이 끝났어');
  const helper=document.createElement('textarea');helper.innerHTML=output;return helper.value;
}
async function getWorker(){
  if(!window.Tesseract)throw new Error('글자 인식 도구를 불러오지 못했어. 인터넷 연결을 확인하고 다시 시도해 줘.');
  if(!ocrWorker){ocrWorker=await window.Tesseract.createWorker('chi_sim+eng',1,{logger:p=>{
    if(typeof p.progress==='number'&&p.status==='recognizing text')showProgress(`중국어 글자 인식 중… ${Math.round(p.progress*100)}%`);
  }});}
  return ocrWorker;
}
async function basicTranslate(file,index){
  showProgress(`${index+1}/${files.length} · 중국어 인식 준비 중…`);
  const worker=await getWorker();const recognized=await worker.recognize(file);
  const original=recognized.data.text.trim();
  if(!original)throw new Error('이미지에서 글자를 찾지 못했어. 글자가 선명한 스크린샷을 사용해 줘.');
  const lines=cleanLines(original);
  const translated=[];let count=0,warning='',serviceUnavailable=false;
  for(const line of lines){
    if(!/[\u3400-\u9fff]/.test(line) || serviceUnavailable){translated.push(line);continue;}
    const segments=splitUtf8(line);
    let translatedLine='';
    for(const segment of segments){
      if(count>=45){warning='글자가 너무 많아 일부 줄은 번역하지 못했어. 화면을 나누어 다시 올려줘.';translatedLine+=' '+segment;continue;}
      showProgress(`${index+1}/${files.length} · 한국어 번역 중… (${count+1}개 문장)`);
      try{translatedLine+=await translateSegment(segment);}catch(err){warning=`일부 문장을 번역하지 못했어: ${err.message}`;translatedLine+=segment;serviceUnavailable=true;}
      count++;
    }
    translated.push(translatedLine);
  }
  return {mode:'basic',original,translated:translated.join('\n'),warning};
}
async function imageDataForAI(file){
  const bitmap=await createImageBitmap(file);
  try{
    const maxDimension=1850;const scale=Math.min(1,maxDimension/Math.max(bitmap.width,bitmap.height));
    const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
    canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);
    const dataUrl=canvas.toDataURL('image/jpeg',0.88);return {mime_type:'image/jpeg',data:dataUrl.split(',')[1]};
  }finally{bitmap.close();}
}
async function smartTranslate(file,index){
  const endpoint=$('endpointInput').value.trim().replace(/\/+$/,'');
  const pin=$('pinInput').value.trim();
  if(!/^https:\/\//i.test(endpoint))throw new Error('AI 번역 서버 주소를 https://로 시작하게 입력해 줘.');
  if(!pin)throw new Error('AI 번역 서버 접속 암호를 입력해 줘.');
  showProgress(`${index+1}/${files.length} · AI가 쇼핑 화면을 해석하는 중…`);
  const img=await imageDataForAI(file);
  const abort=new AbortController();const timeout=setTimeout(()=>abort.abort(),55000);
  try{
    const res=await fetch(`${endpoint}/translate`,{
      method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${pin}`},
      body:JSON.stringify({image:img}),signal:abort.signal
    });
    const data=await res.json().catch(()=>({}));
    if(!res.ok)throw new Error(data.error||`AI 번역 서버 오류 (${res.status})`);
    if(!data.translation)throw new Error('AI 번역 결과가 비어 있어.');
    return {mode:'ai',original:data.original||'',translated:data.translation,warning:'AI도 숫자·통화 단위·배송 조건을 잘못 읽을 수 있으니 결제 전 확인해 줘.'};
  }catch(err){if(err.name==='AbortError')throw new Error('AI 번역 응답 시간이 초과됐어.');throw err;}
  finally{clearTimeout(timeout);}
}
async function processImages(){
  if(!files.length||working)return;
  setWorking(true);latestResults=[];$('resultsSection').hidden=true;
  const mode=selectedMode();
  for(let index=0;index<files.length;index++){
    try{
      const result=mode==='ai'?await smartTranslate(files[index].file,index):await basicTranslate(files[index].file,index);
      latestResults.push(result);
    }catch(err){latestResults.push({mode,error:err.message||'알 수 없는 오류가 생겼어.'});
      // Missing AI configuration affects every file; stop after the first error.
      if(mode==='ai')break;
    }
  }
  $('progressBox').hidden=true;setWorking(false);renderResults();
}
$('fileInput').addEventListener('change',(e)=>{addFiles(e.target.files);e.target.value='';});
const drop=$('dropzone');
['dragover','dragenter'].forEach(type=>drop.addEventListener(type,e=>{e.preventDefault();drop.classList.add('drag-over');}));
['dragleave','drop'].forEach(type=>drop.addEventListener(type,e=>{e.preventDefault();drop.classList.remove('drag-over');}));
drop.addEventListener('drop',e=>addFiles(e.dataTransfer.files));
document.addEventListener('paste',e=>{if(working)return;const images=[...(e.clipboardData?.items||[])].filter(x=>x.kind==='file'&&x.type.startsWith('image/')).map(x=>x.getAsFile()).filter(Boolean);if(images.length){addFiles(images);e.preventDefault();showToast('클립보드 이미지 추가 완료!');}});
document.querySelectorAll('input[name="mode"]').forEach(r=>r.addEventListener('change',()=>{
  const ai=selectedMode()==='ai';$('aiSettings').hidden=!ai;$('basicModeCard').classList.toggle('active',!ai);$('aiModeCard').classList.toggle('active',ai);
  $('serviceNote').textContent=ai?'AI 모드는 별도로 만든 개인 서버를 사용해. 이미지는 분석을 위해 Google Gemini에 전송될 수 있어.':'무료 모드는 처음 사용할 때 중국어 인식 파일을 내려받고, 인식한 글자를 외부 번역 서비스로 전송해. 사용량 제한과 오역이 있을 수 있어. 개인정보가 표시된 이미지는 피하는 게 좋아.';
}));
$('endpointInput').value=localStorage.getItem('taossok_endpoint')||'';
$('endpointInput').addEventListener('change',()=>localStorage.setItem('taossok_endpoint',$('endpointInput').value.trim()));
$('runButton').addEventListener('click',processImages);
$('copyAllButton').addEventListener('click',async()=>{
  const body=latestResults.map((r,i)=>`[스크린샷 ${i+1}]\n${r.translated||r.error||''}`).join('\n\n');
  try{await navigator.clipboard.writeText(body);showToast('번역 결과를 복사했어!');}
  catch{showToast('복사를 허용하지 않은 브라우저야. 결과를 길게 눌러 복사해 줘.');}
});
$('clearButton').addEventListener('click',()=>{latestResults=[];$('results').replaceChildren();$('resultsSection').hidden=true;showToast('해석 결과를 지웠어.');});
if('serviceWorker' in navigator && /^https?:$/.test(location.protocol))window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));