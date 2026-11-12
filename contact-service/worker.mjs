// Prepared email/WhatsApp delivery service. Not deployed or configured yet.
// Deploy separately on a public Cloudflare Worker with the D1 schema provided.
export const MAX_UPLOAD_BYTES=5_000_000;
const REQUEST_LIMIT=MAX_UPLOAD_BYTES+65_536;
const recipient='info@mfarosoftware.africa';
const whatsappRecipient='whatsapp:+27694676511';
const extensions=new Set(['pdf','docx','xlsx','csv','txt','jpg','jpeg','png']);
const required=['RESEND_API_KEY','CONTACT_FROM_EMAIL','TWILIO_ACCOUNT_SID','TWILIO_API_KEY','TWILIO_API_SECRET','TWILIO_WHATSAPP_FROM','TWILIO_CONTENT_SID','RATE_LIMIT_SALT'];
const ready=env=>Boolean(env.DB&&required.every(key=>env[key]));
const digest=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),byte=>byte.toString(16).padStart(2,'0')).join('');
function base64(bytes){let s='';for(let offset=0;offset<bytes.length;offset+=8192)s+=String.fromCharCode(...bytes.subarray(offset,offset+8192));return btoa(s);}
function statusCode(result){if(result.email==='accepted'&&result.whatsapp==='accepted')return 200;if(result.email==='accepted'||result.whatsapp==='accepted')return 207;return 502;}
export async function validateSubmission(data){
  const values={};
  for(const [field,max] of Object.entries({name:80,email:254,phone:40,company:120,product:80,subject:120,message:2000})){
    const value=data.get(field);if(value!==null&&typeof value!=='string')throw Error('Invalid form field.');
    values[field]=(value||'').trim();if(values[field].length>max)throw Error('One of the fields is too long.');
  }
  if(!values.name||!values.subject||values.message.length<10||!/^\S+@\S+\.\S+$/.test(values.email))throw Error('Please provide your name, a valid email address, a subject and a message.');
  if(data.get('consent')!=='yes')throw Error('Please agree to being contacted about your enquiry.');
  if(data.get('website'))throw Error('We couldn’t validate this submission.');
  values.requestId=data.get('requestId');
  if(typeof values.requestId!=='string'||!/^[a-f\d]{8}-[a-f\d]{4}-4[a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i.test(values.requestId))throw Error('Invalid enquiry reference. Please reload the page.');
  const files=data.getAll('attachments').filter(file=>typeof file!=='string'&&file.name);
  if(files.reduce((sum,file)=>sum+file.size,0)>MAX_UPLOAD_BYTES)throw Error('Files must not exceed 5 MB combined.');
  if(files.some(file=>!extensions.has(file.name.split('.').pop().toLowerCase())))throw Error('Choose PDF, DOCX, XLSX, CSV, TXT, JPG or PNG files.');
  values.attachments=[];
  for(const file of files){values.attachments.push({filename:file.name.replace(/[\r\n/\\\x00-\x1f]/g,'_').slice(0,180),content:base64(new Uint8Array(await file.arrayBuffer()))});}
  return values;
}
async function readLimited(request){
  if(Number(request.headers.get('content-length'))>REQUEST_LIMIT)throw Error('The upload is too large. Files must not exceed 5 MB combined.');
  const reader=request.body?.getReader();if(!reader)throw Error('The form is empty.');
  const parts=[];let size=0;
  while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>REQUEST_LIMIT){await reader.cancel();throw Error('The upload is too large. Files must not exceed 5 MB combined.');}parts.push(value);}
  const bytes=new Uint8Array(size);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length;}
  return new Response(bytes,{headers:{'Content-Type':request.headers.get('content-type')||''}}).formData();
}
export async function handleContact(request,env,fetcher=fetch){
  const origin=request.headers.get('origin');
  const allowed=(env.CONTACT_ALLOWED_ORIGINS||'https://andrewmadume.github.io,https://mfaro-software.the-tasseoma-1204.chatgpt.site').split(',').map(value=>value.trim());
  const headers={'Content-Type':'application/json','Cache-Control':'no-store','Vary':'Origin','Access-Control-Allow-Methods':'POST, GET, OPTIONS','Access-Control-Allow-Headers':'Content-Type'};
  if(origin&&allowed.includes(origin))headers['Access-Control-Allow-Origin']=origin;
  const respond=(value,status=200)=>new Response(JSON.stringify(value),{status,headers});
  if(!origin||!allowed.includes(origin))return respond({message:'This origin is not allowed.'},403);
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
  if(request.method==='GET'&&new URL(request.url).pathname.endsWith('/status'))return respond({configured:ready(env)});
  if(request.method!=='POST')return respond({message:'Method not allowed.'},405);
  if(!ready(env))return respond({message:'Online enquiries are not available yet. Please use our email or WhatsApp link.'},503);
  if(!request.headers.get('content-type')?.startsWith('multipart/form-data'))return respond({message:'Please submit the contact form.'},415);
  let values;
  try{values=await validateSubmission(await readLimited(request));}catch(error){return respond({message:error.message},400);}
  const reference=values.requestId;
  const payloadHash=await digest(JSON.stringify(values));
  // Atomic claim prevents duplicate sends, including after a browser timeout.
  const claim=await env.DB.prepare('INSERT OR IGNORE INTO contact_requests (id,payload_hash,email_state,whatsapp_state,created_at) VALUES (?,?,\'processing\',\'processing\',?)').bind(reference,payloadHash,Date.now()).run();
  if(!claim.meta.changes){
    const previous=await env.DB.prepare('SELECT payload_hash,email_state,whatsapp_state FROM contact_requests WHERE id=?').bind(reference).first();
    if(!previous||previous.payload_hash!==payloadHash)return respond({reference,message:'This reference was already used. Please reload the page.'},409);
    const result={reference,email:previous.email_state,whatsapp:previous.whatsapp_state};
    if(Object.values(result).includes('processing'))return respond({...result,message:'This enquiry is still being processed. Please contact us directly before submitting again.'},409);
    return respond(result,statusCode(result));
  }
  // Salted IP counters reduce abuse without storing raw visitor IP addresses.
  const bucket=Math.floor(Date.now()/3_600_000);
  const rateKey=await digest(env.RATE_LIMIT_SALT+':'+(request.headers.get('cf-connecting-ip')||'unknown')+':'+bucket);
  const rate=await env.DB.prepare('INSERT INTO contact_rate_limits (key,hits,created_at) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET hits=hits+1 RETURNING hits').bind(rateKey,Date.now()).first();
  if(rate.hits>10){await env.DB.prepare('DELETE FROM contact_requests WHERE id=?').bind(reference).run();return respond({message:'Too many enquiries. Please contact us by email or WhatsApp.'},429);}
  const text=['Mfaro Software website enquiry','Reference: '+reference,'Name: '+values.name,'Email: '+values.email,'Phone: '+(values.phone||'Not supplied'),'Business: '+(values.company||'Not supplied'),'Product: '+values.product,'Subject: '+values.subject,'','Message:',values.message,'','Files: '+(values.attachments.map(file=>file.filename).join(', ')||'None')].join('\n');
  const emailPayload={from:env.CONTACT_FROM_EMAIL,to:[recipient],reply_to:values.email,subject:'Website enquiry: '+values.subject.replace(/[\r\n]/g,' '),text,attachments:values.attachments};
  const singleLine=value=>value.replace(/\s+/g,' ').trim();
  // The full enquiry and attachments go by email. WhatsApp carries a concise
  // notification through an approved template, rather than an unapproved chat.
  const variables={'1':reference,'2':singleLine(values.name),'3':singleLine(values.email),'4':singleLine(values.product),'5':singleLine(values.subject),'6':singleLine(values.message).slice(0,600)+(values.message.length>600?'… (full message emailed)':''),'7':String(values.attachments.length)};
  const twilioBody=new URLSearchParams({To:whatsappRecipient,From:env.TWILIO_WHATSAPP_FROM,ContentSid:env.TWILIO_CONTENT_SID,ContentVariables:JSON.stringify(variables)});
  const result={reference,email:'processing',whatsapp:'processing'};
  async function deliver(channel,url,options){
    let state='unknown';
    try{const response=await fetcher(url,{...options,signal:AbortSignal.timeout(15000)});state=response.ok?'accepted':'failed';await response.arrayBuffer();}catch{state='unknown';}
    result[channel]=state;
    const column=channel==='email'?'email_state':'whatsapp_state';
    await env.DB.prepare('UPDATE contact_requests SET '+column+'=? WHERE id=?').bind(state,reference).run();
  }
  await Promise.all([
    deliver('email','https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+env.RESEND_API_KEY,'Content-Type':'application/json','Idempotency-Key':'contact/'+reference},body:JSON.stringify(emailPayload)}),
    deliver('whatsapp','https://api.twilio.com/2010-04-01/Accounts/'+env.TWILIO_ACCOUNT_SID+'/Messages.json',{method:'POST',headers:{Authorization:'Basic '+btoa(env.TWILIO_API_KEY+':'+env.TWILIO_API_SECRET),'Content-Type':'application/x-www-form-urlencoded'},body:twilioBody})
  ]);
  return respond(result,statusCode(result));
}
export default{async fetch(request,env){try{return await handleContact(request,env);}catch{return new Response(JSON.stringify({message:'We couldn’t confirm submission. Please use our direct contact links.'}),{status:503,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});}}};
