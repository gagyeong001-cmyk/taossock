/** Cloudflare Worker: deploy separately. Bind Gemini secret as GEMINI_API_KEY, personal passphrase as APP_PIN.
 * Optional ALLOWED_ORIGIN = https://USERNAME.github.io  (exact origin, no path)
 */
const MODEL = 'gemini-3.5-flash-lite';
const PROMPT = `너는 타오바오, 티몰, 중국 쇼핑몰 스크린샷 번역 전문가다.
이미지에서 실제 확인되는 정보만 한국어로 해석한다. 화면 맨 위 시계/배터리, 음악 재생 알림, 한국어 시스템 UI, 불필요한 영어 잡음은 무시한다.
상품·주문·옵션·결제·환불·배송과 관계된 중국어 안내를 우선해라.
동일 문구가 반복되면 반복 횟수를 알리되, 서로 다른 주문이라고 단정하지 마라.
제목이나 중요 내용부터 짧게 정리하고, 원문의 가격, 통화(위안), 수량, 할인 조건과 날짜를 임의로 변경하지 마라.
캡처만으로 추정할 수 없는 정품 여부, 발송 가능 재고, 배송 예정일 등은 단정하지 마라.
중국어가 모호하거나 판독 불가능하면 솔직히 [읽기 어려움]으로 표시해라.
반드시 다음 JSON 객체만 반환한다. 마크다운 코드 블록 없이:
{"original":"관련된 중국어 원문만, 줄바꿈으로 구분","summary":["가장 중요한 내용 1","필요한 경우 내용 2"],"details":[{"cn":"실제 중국어 원문","ko":"해당 문구의 자연스러운 한국어 번역"}],"translation":"한국어 요약과 상세 정보를 읽기 좋게 합친 텍스트"}
summary는 최대 5개, details는 최대 20개. 중국어가 없으면 이를 명시하고 없는 내용을 지어내지 마라.`;
function cors(origin,allowed){
 const okay = !allowed || origin===allowed;
 return {'Access-Control-Allow-Origin':okay?(allowed||origin||'*'):'null','Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type, Authorization','Vary':'Origin','Cache-Control':'no-store'};
}
function reply(obj,status,headers){return new Response(JSON.stringify(obj),{status,headers:{...headers,'Content-Type':'application/json; charset=utf-8'}});}
export default {
 async fetch(request, env){
   const origin=request.headers.get('Origin')||'';const headers=cors(origin,env.ALLOWED_ORIGIN);
   if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
   const url=new URL(request.url);
   if(request.method!=='POST'||url.pathname!=='/translate')return reply({error:'POST /translate 만 지원해.'},404,headers);
   if(env.ALLOWED_ORIGIN && origin!==env.ALLOWED_ORIGIN)return reply({error:'허용하지 않은 웹사이트야.'},403,headers);
   if(!env.GEMINI_API_KEY || !env.APP_PIN) return reply({error:'서버 비밀키 설정이 아직 필요해.'},503,headers);
   if(request.headers.get('Authorization')!==`Bearer ${env.APP_PIN}`)return reply({error:'서버 접속 암호가 달라.'},401,headers);
   const contentLength=Number(request.headers.get('Content-Length')||0);
   if(contentLength>6_000_000)return reply({error:'이미지가 너무 커. 줄여서 다시 시도해 줘.'},413,headers);
   let payload;
   try{payload=await request.json();}catch{return reply({error:'이미지 데이터가 올바르지 않아.'},400,headers);}
   const image=payload?.image;
   if(!image || image.mime_type!=='image/jpeg'|| typeof image.data!=='string'|| image.data.length>5_800_000||!/^[A-Za-z0-9+/=]+$/.test(image.data))return reply({error:'JPG 이미지가 필요해.'},400,headers);
   let response,output;
   try{
     response=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,{
       method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':env.GEMINI_API_KEY},
       body:JSON.stringify({contents:[{role:'user',parts:[{text:PROMPT},{inline_data:{mime_type:'image/jpeg',data:image.data}}]}],generationConfig:{temperature:0.1,responseMimeType:'application/json',maxOutputTokens:2800}})
     });
     const json=await response.json();
     if(!response.ok){const msg=String(json?.error?.message||'');return reply({error:`AI 서비스 오류 (${response.status}): ${msg.slice(0,180)}`},502,headers);}
     const raw=(json.candidates?.[0]?.content?.parts||[]).map(p=>p.text||'').join('');
     output=JSON.parse(raw);
   }catch{return reply({error:'AI 서비스에 연결할 수 없거나 번역 응답을 읽지 못했어.'},502,headers);}
   if(typeof output?.translation!=='string')return reply({error:'AI 결과에 번역 문장이 없었어.'},502,headers);
   const summary=Array.isArray(output.summary)?output.summary.filter(x=>typeof x==='string').slice(0,5):[];
   const details=Array.isArray(output.details)?output.details.filter(x=>typeof x?.cn==='string'&&typeof x?.ko==='string').slice(0,20):[];
   return reply({original:String(output.original||''),translation:output.translation,summary,details},200,headers);
 }
};