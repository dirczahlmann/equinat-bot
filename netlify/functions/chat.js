const https = require('https');

exports.handler = async function(event) {
  const h = {'Access-Control-Allow-Origin':'*','Content-Type':'application/json'};
  if (event.httpMethod === 'OPTIONS') return {statusCode:200,headers:h,body:''};
  if (event.httpMethod !== 'POST') return {statusCode:405,body:'Method Not Allowed'};
  
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return {statusCode:200,headers:h,body:JSON.stringify({content:[{text:'FEHLER: Kein API Key!'}]})};
  
  let body;
  try { body = JSON.parse(event.body); }
  catch(e) { return {statusCode:200,headers:h,body:JSON.stringify({content:[{text:'FEHLER: '+e.message}]})}; }

  const payload = JSON.stringify({
    model:'claude-haiku-4-5-20251001',
    max_tokens:800,
    system:body.system||'Du bist ein Pferdeexperte.',
    messages:body.messages||[]
  });

  return new Promise((resolve)=>{
    const req = https.request({
      hostname:'api.anthropic.com',port:443,path:'/v1/messages',method:'POST',
      headers:{
        'Content-Type':'application/json',
        'x-api-key':key,
        'anthropic-version':'2023-06-01',
        'Content-Length':Buffer.byteLength(payload)
      }
    },(res)=>{
      let data='';
      res.on('data',(c)=>{data+=c;});
      res.on('end',()=>{
        try {
          const parsed = JSON.parse(data);
          resolve({statusCode:200,headers:h,body:JSON.stringify(parsed)});
        } catch(e) {
          resolve({statusCode:200,headers:h,body:JSON.stringify({content:[{text:'Parse Fehler: '+data.substring(0,200)}]})});
        }
      });
    });
    req.on('error',(e)=>{
      resolve({statusCode:200,headers:h,body:JSON.stringify({content:[{text:'Netzfehler: '+e.message}]})});
    });
    req.write(payload);
    req.end();
  });
};
