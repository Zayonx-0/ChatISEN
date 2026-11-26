import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {matches,startApp,type Who} from '../helpers.js';
import {signedUrl} from '../../../apps/api/src/modules/files/adapters/out/gcs.js';

test('files: signed upload, server-side verification, membership and single use',async t=>{
  if(!process.env.DATABASE_URL)return t.skip('DATABASE_URL not set');
  const bucket=new Map<string,{bytes:Buffer;mediaType:string}>();
  const objects={
    signUpload:async(key:string,mediaType:string,size:number)=>({url:`https://storage.test/${key}?put`,headers:{'content-type':mediaType,'x-goog-content-length-range':`${size},${size}`}}),
    signDownload:async(key:string,fileName:string)=>`https://storage.test/${key}?get=${encodeURIComponent(fileName)}`,
    inspect:async(key:string)=>{const o=bucket.get(key);return o&&{size:o.bytes.length,mediaType:o.mediaType,sha256:createHash('sha256').update(o.bytes).digest('hex'),head:o.bytes.subarray(0,4096)};},
    remove:async(key:string)=>{bucket.delete(key);},
  };
  const h=await startApp({objects});
  try{
    const alice=await h.register('alice'),bob=await h.register('bob'),eve=await h.register('eve');
    const cid=await h.direct(alice,bob),url=`/conversations/${cid}/files`;
    const pdf=Buffer.from('%PDF-1.7\nbonjour');
    const declare=(bytes:Buffer,mediaType='application/pdf',fileName='cours.pdf')=>({fileName,mediaType,size:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});
    assert.equal((await h.call(eve,'POST',url,declare(pdf))).statusCode,404);
    assert.equal((await h.call(alice,'POST',url,declare(pdf,'application/x-msdownload'))).statusCode,415);
    assert.equal((await h.call(alice,'POST',url,{...declare(pdf),size:26_214_401})).statusCode,413);
    for(const fileName of ['../secret','a/b.pdf','x\u0000.pdf',''])assert.equal((await h.call(alice,'POST',url,{...declare(pdf),fileName})).statusCode,400,JSON.stringify(fileName));

    const upload=async(who:Who,declared:ReturnType<typeof declare>,content?:Buffer,storedType=declared.mediaType)=>{
      const prepared=await h.call(who,'POST',url,declared);assert.equal(prepared.statusCode,201,prepared.body);matches('FileUpload',prepared.json());
      const key=new URL(prepared.json().uploadUrl).pathname.slice(1);
      if(content)bucket.set(key,{bytes:content,mediaType:storedType});
      return {id:prepared.json().file.id as string,key};
    };
    const complete=(who:Who,id:string)=>h.call(who,'PATCH',`/files/${id}`,{state:'available'});
    const missing=await upload(alice,declare(pdf));
    assert.equal((await complete(alice,missing.id)).json().code,'UPLOAD_MISSING');
    const good=await upload(alice,declare(pdf),pdf);
    assert.equal((await h.call(bob,'GET',`/files/${good.id}`)).statusCode,404,'a pending file is not served');
    assert.equal((await h.call(alice,'POST',`/conversations/${cid}/messages`,{clientId:randomUUID(),fileId:good.id})).statusCode,409);
    assert.equal((await complete(bob,good.id)).statusCode,404,'only the sender confirms');
    const available=await complete(alice,good.id);assert.equal(available.statusCode,200,available.body);matches('File',available.json());assert.equal(available.json().state,'available');
    assert.equal((await complete(alice,good.id)).statusCode,200,'confirming twice is idempotent');

    // Empreinte, taille, type MIME et signature du contenu sont tous contrôlés.
    const exe=Buffer.from('MZ\u0000\u0000executable');
    for(const [label,declared,content,type] of [
      ['other bytes',declare(pdf),Buffer.from('%PDF-1.7\nautre !'),undefined],
      ['not a PDF',declare(exe),exe,undefined],
      ['binary as text',declare(exe,'text/plain','note.txt'),exe,undefined],
      ['other MIME',declare(pdf),pdf,'text/html'],
    ] as const){
      const file=await upload(alice,declared,content,type??declared.mediaType);
      assert.equal((await complete(alice,file.id)).json().code,'FILE_REJECTED',label);
      assert.ok(!bucket.has(file.key),`${label}: the object is removed`);
    }

    const command={clientId:randomUUID(),text:'Le cours',fileId:good.id};
    const message=await h.call(alice,'POST',`/conversations/${cid}/messages`,command);assert.equal(message.statusCode,201,message.body);matches('Message',message.json());assert.equal(message.json().fileId,good.id);
    assert.equal((await h.call(alice,'POST',`/conversations/${cid}/messages`,command)).statusCode,200);
    assert.equal((await h.call(alice,'POST',`/conversations/${cid}/messages`,{clientId:randomUUID(),fileId:good.id})).statusCode,409,'one message per file');
    assert.equal((await h.call(bob,'POST',`/conversations/${cid}/messages`,{clientId:randomUUID(),fileId:good.id})).statusCode,409,'only the owner attaches it');

    const download=await h.call(bob,'GET',`/files/${good.id}`);assert.equal(download.statusCode,200);matches('FileDownload',download.json());assert.equal(download.headers['cache-control'],'no-store');
    assert.equal((await h.call(eve,'GET',`/files/${good.id}`)).statusCode,404);

    // Un envoi abandonné est effacé du stockage et de la base.
    const abandoned=await upload(alice,declare(pdf),pdf);
    await h.pool.query("update files.files set created_at=now()-interval '2 hours' where id=$1",[abandoned.id]);
    await h.services.files.sweep();
    assert.ok(!bucket.has(abandoned.key));assert.ok(bucket.has(good.key));

    const without=await startApp();
    try{const user=await without.register('solo'),peer=await without.register('peer');const other=await without.direct(user,peer);
      assert.equal((await without.call(user,'POST',`/conversations/${other}/files`,declare(pdf))).statusCode,503);}finally{await without.close();}
  }finally{await h.close();}
});

test('files: V4 signed URL canonical form',()=>{
  const request=signedUrl({method:'PUT',bucket:'seau',key:'conversations/a b/é.pdf',email:'app@projet.iam.gserviceaccount.com',headers:{'content-type':'application/pdf','x-goog-content-length-range':'5,5'},seconds:600,now:new Date('2026-11-26T10:20:30.456Z')});
  const url=new URL(request.url(Buffer.from([0xab,0xcd])));
  assert.equal(url.origin+url.pathname,'https://storage.googleapis.com/seau/conversations/a%20b/%C3%A9.pdf');
  assert.equal(url.searchParams.get('X-Goog-Date'),'20261126T102030Z');
  assert.equal(url.searchParams.get('X-Goog-Expires'),'600');
  assert.equal(url.searchParams.get('X-Goog-SignedHeaders'),'content-type;host;x-goog-content-length-range');
  assert.equal(url.searchParams.get('X-Goog-Credential'),'app@projet.iam.gserviceaccount.com/20261126/auto/storage/goog4_request');
  assert.equal(url.searchParams.get('X-Goog-Signature'),'abcd');
  assert.match(request.stringToSign,/^GOOG4-RSA-SHA256\n20261126T102030Z\n20261126\/auto\/storage\/goog4_request\n[0-9a-f]{64}$/);
});
