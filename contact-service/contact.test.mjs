import assert from 'node:assert/strict';
import {handleContact,validateSubmission,MAX_UPLOAD_BYTES} from './worker.mjs';
function data(files=[]){const form=new FormData();for(const [key,value] of Object.entries({name:'Test Visitor',email:'test@example.com',phone:'+27000000000',company:'Test Company',product:'Mfaro HR & Payroll',subject:'Validation test',message:'This is a local test only.',consent:'yes',requestId:crypto.randomUUID()}))form.set(key,value);for(const file of files)form.append('attachments',file);return form;}
await validateSubmission(data([new File([new Uint8Array(MAX_UPLOAD_BYTES)],'boundary.txt')]));
await assert.rejects(()=>validateSubmission(data([new File([new Uint8Array(MAX_UPLOAD_BYTES+1)],'too-large.txt')])) ,/5 MB/);
await assert.rejects(()=>validateSubmission(data([new File([new Uint8Array(3_000_000)],'one.txt'),new File([new Uint8Array(3_000_000)],'two.txt')])) ,/5 MB/);
await assert.rejects(()=>validateSubmission(data([new File(['no'],'run.exe')])),/Choose PDF/);
const missingConsent=data();missingConsent.delete('consent');await assert.rejects(()=>validateSubmission(missingConsent),/agree/);
let calls=[];
const fetcher=async(url,options)=>{calls.push({url,options});return new Response('{}',{status:200});};
const origin='https://andrewmadume.github.io';
const request=form=>new Request('https://contact.example.test/contact',{method:'POST',headers:{Origin:origin},body:form});
let response=await handleContact(request(data()),{},fetcher);assert.equal(response.status,503);assert.equal(calls.length,0);
const env={DB:{prepare(sql){return{bind(){return{async run(){return{meta:{changes:1}}},async first(){return{hits:1}}}}}}},RESEND_API_KEY:'fake-test-key',CONTACT_FROM_EMAIL:'Mfaro <website@example.test>',TWILIO_ACCOUNT_SID:'fake-account',TWILIO_API_KEY:'fake-key',TWILIO_API_SECRET:'fake-secret',TWILIO_WHATSAPP_FROM:'whatsapp:+27000000001',TWILIO_CONTENT_SID:'fake-template',RATE_LIMIT_SALT:'fake-test-salt'};
response=await handleContact(request(data([new File(['test attachment'],'details.txt')])),env,fetcher);assert.equal(response.status,200);const result=await response.json();assert.equal(result.email,'accepted');assert.equal(result.whatsapp,'accepted');assert.equal(calls.length,2);
const email=JSON.parse(calls.find(call=>call.url.includes('resend')).options.body);assert.deepEqual(email.to,['info@mfarosoftware.africa']);assert.equal(email.reply_to,'test@example.com');assert.equal(atob(email.attachments[0].content),'test attachment');
const whatsapp=calls.find(call=>call.url.includes('twilio')).options.body;assert.equal(whatsapp.get('To'),'whatsapp:+27694676511');assert.equal(whatsapp.get('ContentSid'),'fake-template');assert.equal(JSON.parse(whatsapp.get('ContentVariables'))['7'],'1');
calls=[];response=await handleContact(request(data([new File([new Uint8Array(MAX_UPLOAD_BYTES+1)],'large.txt')])),env,fetcher);assert.equal(response.status,400);assert.equal(calls.length,0);
response=await handleContact(new Request('https://contact.example.test/contact',{method:'POST',headers:{Origin:'https://untrusted.example'},body:data()}),env,fetcher);assert.equal(response.status,403);assert.equal(calls.length,0);
console.log('Passed: exact 5 MB boundary, oversized/combined uploads, file types, consent, unconfigured sender, origin restriction, email attachments and both intended destinations. No real messages sent.');

