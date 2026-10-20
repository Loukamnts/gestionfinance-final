const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const appSource=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8').replace(/\r\n/g,'\n');
test('The destructive cloud-account action is shown only to an authenticated user',()=>{
  const renderAuth=appSource.match(/function renderAuth\(\)\{[\s\S]*?\n  \}\n\n  function msg/);
  assert(renderAuth,'renderAuth must remain present');
  const code=renderAuth[0];
  assert.match(code,/deleteButton\.hidden = true; deleteButton\.style\.display = "none"/);
  assert.match(code,/if\(sb\.user\)[\s\S]*deleteButton\.hidden = false; deleteButton\.style\.display = "inline-flex"/);
  assert.match(code,/\}else\{[\s\S]*deleteButton\.hidden = true; deleteButton\.style\.display = "none"/);
});
