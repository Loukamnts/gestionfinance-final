const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'..','store-shim.js'),'utf8');
const A='10000000-0000-4000-8000-000000000001';
const B='10000000-0000-4000-8000-000000000002';
function store(initial={}){
  const values=new Map(Object.entries(initial));
  const localStorage={getItem:k=>values.has(k)?values.get(k):null,setItem:(k,v)=>values.set(k,String(v)),removeItem:k=>values.delete(k)};
  const window={localStorage};
  vm.runInNewContext(source,{window});
  return {safe:window.safeStore,values};
}
test('Legacy unscoped financial data is quarantined, not assigned to a new account',()=>{
  const {safe,values}=store({'finance_sheet_v3':'A private sheet'});
  assert.equal(safe.getItem('finance_sheet_v3'),null);
  safe.setFinancialOwner(B);
  assert.equal(safe.getItem('finance_sheet_v3'),null);
  assert.equal(values.get('finance_sheet_v3'),'A private sheet');
  assert.equal(safe.hasLegacyFinancialData(),true);
});
test('Financial sheet, goals and rules remain separate after logout and another sign-in',()=>{
  const {safe}=store();
  safe.setFinancialOwner(A);
  safe.setItem('finance_sheet_v3','A sheet');
  safe.setItem('personalFinanceDashboard.setupProfile','A notes');
  safe.setItem('personalFinanceDashboard.categoryRules','A rules');
  safe.setFinancialOwner(null);
  assert.equal(safe.getItem('finance_sheet_v3'),null);
  safe.setFinancialOwner(B);
  for(const key of ['finance_sheet_v3','personalFinanceDashboard.setupProfile','personalFinanceDashboard.categoryRules'])
    assert.equal(safe.getItem(key),null);
  safe.setItem('finance_sheet_v3','B sheet');
  safe.setFinancialOwner(A);
  assert.equal(safe.getItem('finance_sheet_v3'),'A sheet');
  assert.equal(safe.getItem('personalFinanceDashboard.setupProfile'),'A notes');
});
test('Only the first account can claim a fresh anonymous draft',()=>{
  const {safe}=store();
  safe.setItem('finance_sheet_v3','fresh anonymous draft');
  safe.setFinancialOwner(A);
  assert.equal(safe.claimAnonymousFor(A),true);
  assert.equal(safe.getItem('finance_sheet_v3'),'fresh anonymous draft');
  safe.setFinancialOwner(null);
  assert.equal(safe.getItem('finance_sheet_v3'),null);
  safe.setFinancialOwner(B);
  assert.equal(safe.claimAnonymousFor(B),false);
  assert.equal(safe.getItem('finance_sheet_v3'),null);
});
test('Reset removes only the selected account cache and leaves cloud-independent peers untouched',()=>{
  const {safe,values}=store();
  safe.setFinancialOwner(A);
  safe.setItem('finance_sheet_v3','A sheet');
  safe.setFinancialSyncPending(true);
  assert.equal(safe.getFinancialSyncPending(),true);
  safe.setFinancialOwner(B);
  safe.setItem('finance_sheet_v3','B sheet');
  assert.equal(safe.getFinancialSyncPending(),false);
  assert.equal(safe.clearFinancialOwnerData(A),true);
  assert.equal(values.has('gf-private-v1:'+A+':sync-pending'),false);
  assert.equal(safe.getItem('finance_sheet_v3'),'B sheet');
  safe.setFinancialOwner(A);
  assert.equal(safe.getItem('finance_sheet_v3'),null);
  assert.equal(safe.clearFinancialOwnerData('anonymous'),false);
});
