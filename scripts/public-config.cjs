// Seules les clés explicitement prévues pour le navigateur sont admises au build.
module.exports=function validatePublicConfig(config){
  if(!config||typeof config!=='object'||Array.isArray(config))throw new Error('Invalid public configuration');
  if(Object.keys(config).some(key=>!['url','anonKey'].includes(key)))throw new Error('Unexpected public configuration field');
  if(typeof config.url!=='string'||!/^https:\/\/[a-z0-9]+\.supabase\.co$/.test(config.url))throw new Error('Unexpected Supabase origin');
  const key=config.anonKey;
  if(typeof key!=='string')throw new Error('Missing public API key');
  if(/^sb_publishable_[A-Za-z0-9_-]+$/.test(key))return config;
  const parts=key.split('.');
  if(parts.length===3){
    try{
      const payload=JSON.parse(Buffer.from(parts[1],'base64url').toString('utf8'));
      if(payload.role==='anon'&&typeof payload.exp==='number'&&payload.exp>Date.now()/1000)return config;
    }catch{}
  }
  throw new Error('Only a publishable key or unexpired legacy anon key may be deployed');
};
