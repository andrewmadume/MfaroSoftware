const MAX_UPLOAD_BYTES=5_000_000;
const ALLOWED_EXTENSIONS=new Set(['pdf','docx','xlsx','csv','txt','jpg','jpeg','png']);
const form=document.querySelector('#contact-form');
const fileInput=document.querySelector('#contact-files');
const fileError=document.querySelector('#file-error');
const fileList=document.querySelector('#file-list');
const submitButton=document.querySelector('#contact-submit');
const submitStatus=document.querySelector('#submit-status');
const clearButton=document.querySelector('#clear-files');
const endpoint=window.MFARO_CONTACT?.endpoint||'';
let deliveryReady=false,busy=false,requestId=crypto.randomUUID();
function validateFiles(){
  const files=[...fileInput.files];
  const total=files.reduce((sum,file)=>sum+file.size,0);
  const invalid=files.find(file=>!ALLOWED_EXTENSIONS.has(file.name.split('.').pop().toLowerCase()));
  let message='';
  if(total>MAX_UPLOAD_BYTES)message='These files exceed the 5 MB combined limit. Please choose smaller files.';
  else if(invalid)message='Please choose PDF, DOCX, XLSX, CSV, TXT, JPG or PNG files.';
  fileInput.setCustomValidity(message);
  fileInput.setAttribute('aria-invalid',String(Boolean(message)));
  fileError.textContent=message;
  fileList.replaceChildren();
  for(const file of files){const li=document.createElement('li');li.textContent=file.name+' · '+(file.size/1_000_000).toFixed(2)+' MB';fileList.append(li);}
  clearButton.hidden=files.length===0;
  submitButton.disabled=!deliveryReady||busy||Boolean(message);
  return !message;
}
fileInput.addEventListener('change',validateFiles);
clearButton.onclick=()=>{fileInput.value='';requestId=crypto.randomUUID();validateFiles();};
form.addEventListener('input',()=>{requestId=crypto.randomUUID();});
const uploadArea=document.querySelector('#upload-area');
uploadArea.addEventListener('dragover',event=>{event.preventDefault();uploadArea.classList.add('drag-over');});
uploadArea.addEventListener('dragleave',()=>uploadArea.classList.remove('drag-over'));
uploadArea.addEventListener('drop',event=>{event.preventDefault();uploadArea.classList.remove('drag-over');if(busy)return;fileInput.files=event.dataTransfer.files;requestId=crypto.randomUUID();validateFiles();});
async function checkDelivery(){
  if(!endpoint)return;
  try{
    const url=new URL(endpoint);if(url.protocol!=='https:')return;
    const response=await fetch(endpoint.replace(/\/$/,'')+'/status',{signal:AbortSignal.timeout(8000)});
    const status=await response.json();deliveryReady=response.ok&&status.configured===true;
  }catch{deliveryReady=false;}
  if(deliveryReady){document.querySelector('#delivery-status').hidden=true;submitButton.innerHTML='Send enquiry <span aria-hidden="true">↗</span>';}
  validateFiles();
}
form.addEventListener('submit',async event=>{
  event.preventDefault();
  if(busy||!validateFiles()||!form.reportValidity())return;
  if(!deliveryReady){submitStatus.textContent='Online enquiries are not available yet. Please email or WhatsApp us using the contact links.';submitStatus.focus();return;}
  busy=true;submitButton.disabled=true;submitButton.textContent='Submitting…';submitStatus.textContent='';
  const payload=new FormData(form);payload.set('requestId',requestId);
  try{
    const response=await fetch(endpoint,{method:'POST',body:payload,signal:AbortSignal.timeout(30000)});
    const result=await response.json();
    if(response.ok&&result.email==='accepted'&&result.whatsapp==='accepted'){
      submitStatus.textContent='Thank you. Your enquiry has been submitted to our email and WhatsApp team. Reference: '+result.reference+'.';
      form.reset();requestId=crypto.randomUUID();validateFiles();
    }else if(result.email==='accepted'||result.whatsapp==='accepted'){
      submitStatus.textContent='Your enquiry was submitted through '+(result.email==='accepted'?'email':'WhatsApp')+', but the other channel needs attention. Please don’t submit again. Reference: '+result.reference+'. You can also use our direct contact links.';
    }else{submitStatus.textContent=result.message||'We couldn’t submit your enquiry. Please try our email or WhatsApp link.';}
  }catch{submitStatus.textContent='We couldn’t confirm submission. Please contact us directly before trying again so we can avoid a duplicate enquiry.';}
  finally{busy=false;submitButton.innerHTML='Send enquiry <span aria-hidden="true">↗</span>';validateFiles();submitStatus.focus();}
});
const menu=document.querySelector('.menu-toggle'),nav=document.querySelector('.header nav');
menu.onclick=()=>{const open=nav.classList.toggle('open');menu.setAttribute('aria-expanded',String(open));menu.textContent=open?'×':'☰';};
nav.querySelectorAll('a').forEach(a=>a.onclick=()=>{nav.classList.remove('open');menu.setAttribute('aria-expanded','false');menu.textContent='☰';});
document.querySelector('#year').textContent=new Date().getFullYear();
checkDelivery();
