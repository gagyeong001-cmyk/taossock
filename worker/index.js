/** Cloudflare Worker: deploy separately. Bind Gemini secret as GEMINI_API_KEY, personal passphrase as APP_PIN.
 * Optional ALLOWED_ORIGIN = https://USERNAME.github.io  (exact origin, no path)
 */
const MODEL = 'gemini-3.5-flash-lite';
const PROMPT = `당신은 타오바오/티몰 상품 구매 화면의 전문 중→한 통역사다.
이미지에 실제 보이는 중국어 텍스트만 읽어서 한국어로 해석해라. 보이지 않는 재고, 배송 시기, 가격을 추정하거나 꾸미지 마라.
출력은 **반드시 JSON 객체만** 반환한다. {"original":"화면에서 읽힌 중요한 중국어 문구를 줄바꿈으로 기록", "translation":"한국어 해석"}
translation은 (1) 화면의 핵심 내용 요약 (2) 상품명·옵션·가격/쿠폰·배송 조건·예약금/잔금·환불 관련 표기 등 보이는 정보를 줄바꿈으로 정리한다.
중국 위안(¥/元), 수량, 통화, 배송비는 원문과 구분하고 숫자를 그대로 보존한다. 불분명한 글자는 [읽기 어려움]으로 표시한다.
주문 가능, 재고 있음, 정품 여부를 이미지에서 확인되지 않는데 단정하지 않는다.
중국어에만 응답하지 말고 번역은 친절하고 간단한 자연스러운 한국어로 작성한다.`;
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
   return reply({original:String(output.original||''),translation:output.translation},200,headers);
 }
};