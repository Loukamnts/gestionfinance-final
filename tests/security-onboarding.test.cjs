const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../onboarding.js'),'utf8');
test('Every dynamic onboarding step is free of inline handlers and interpolated input values',()=>{
  const code=source.slice(source.indexOf('  function renderStepConnexion()'),source.indexOf('  function finishWizard()'));
  const context={wizardData:{currentAmount:'" onfocus="alert(1)',startingMonth:'"><script>bad</script>',theme:'glass',mode:'light'},
    THEMES:[{id:'glass',name:'Glass',preview:'#fff'}]};
  vm.createContext(context);vm.runInContext(code,context);
  for(const name of ['renderStepConnexion','renderStep1','renderStep2','renderStep4']){
    const html=context[name]();assert(!/\son[a-z]+\s*=/.test(html),name);
    assert(!html.includes('alert(1)'));assert(!html.includes('<script>bad'));
  }
});
test('External wizard bindings preserve authentication, inputs, import, theme and keyboard actions',()=>{
  const nodes=new Map(),calls=[];
  const node=key=>{if(!nodes.has(key))nodes.set(key,{id:key.slice(1),value:'',dataset:{},events:{},
    addEventListener(event,fn){this.events[event]=fn;},click(){calls.push('click:'+key);}});return nodes.get(key);};
  const context={wizardData:{currentAmount:'1200',startingMonth:'2026-09'},$:id=>node('#'+id),window:{}};
  for(const name of ['onbShowAuth','onbTogglePw','onbSubmitAuth','onbHandleImport','onbSkipImport','onbSelectTheme','onbSelectMode'])
    context.window[name]=arg=>calls.push([name,arg]);
  vm.createContext(context);
  vm.runInContext(source.slice(source.indexOf('  function wireWizardControls('),source.indexOf('  // === Étape 0')),context);
  context.wireWizardControls({querySelectorAll:selector=>[node(selector)]});
  assert.equal(node('#wbCurrentAmount').value,'1200');
  assert.equal(node('#wbStartingMonth').value,'2026-09');
  for(const [selector,data] of [['[data-onb-auth]',{onbAuth:'login'}],['[data-onb-theme]',{onbTheme:'editorial'}],['[data-onb-mode]',{onbMode:'dark'}]]){
    const n=node(selector);n.dataset=data;n.events.click({currentTarget:n});
  }
  node('#wbPwToggle').events.click();node('#wbAuthSubmit').events.click();node('[data-onb-empty]').events.click();
  const amount=node('#wbCurrentAmount');amount.value='1450';amount.events.input({currentTarget:amount});
  assert.equal(context.wizardData.currentAmount,'1450');
  node('#wbImportFile').events.change({currentTarget:node('#wbImportFile')});
  node('[data-onb-import]').events.click({target:{id:'choice'}});
  node('[data-onb-import]').events.click({target:node('#wbImportFile')});
  assert.equal(calls.filter(x=>x==='click:#wbImportFile').length,1);
  const keyboard=node('[role="button"][tabindex="0"]');let prevented=false;
  keyboard.events.keydown({target:keyboard,currentTarget:keyboard,key:'Enter',preventDefault(){prevented=true;}});
  assert(prevented);
  for(const expected of ['onbShowAuth','onbTogglePw','onbSubmitAuth','onbHandleImport','onbSkipImport','onbSelectTheme','onbSelectMode'])
    assert(calls.some(call=>Array.isArray(call)&&call[0]===expected),expected);
});
