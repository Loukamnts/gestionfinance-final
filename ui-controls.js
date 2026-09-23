(function() {
"use strict";
async function withBusy(button,task) {
  if(!button || button.dataset.busy==="true") return;
  const wasDisabled=button.disabled,started=Date.now();
  button.dataset.busy="true";button.disabled=true;button.classList.add("is-refreshing");button.setAttribute("aria-busy","true");
  try {
    // Let the feedback paint before a synchronous table recalculation.
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    return await task();
  } finally {
    const remaining=450-(Date.now()-started);
    if(remaining>0)await new Promise(resolve=>setTimeout(resolve,remaining));
    button.disabled=wasDisabled;button.classList.remove("is-refreshing");button.removeAttribute("aria-busy");delete button.dataset.busy;
  }
}
let modalScrollY=0,modalStyles=null,modalFrame=0;
const modalSelectors=[
  ".modal-overlay.is-visible",
  ".chart-detail-modal:not([hidden])",
  ".personal-notes-overlay:not([hidden])",
  "dialog[open]",
  ".onboarding-overlay:not(.hidden)",
  ".tutorial-overlay:not(.hidden)",
  ".wizard-blocker:not(.hidden)",
  ".tutorial-blocker:not(.hidden)",
  ".studio-sidebar.is-mobile-open"
];
function hasOpenAppModal(){return modalSelectors.some(selector=>document.querySelector(selector));}
function lockModalScroll(){
  const root=document.documentElement,body=document.body;
  if(!body||root.dataset.appModalOpen==="true"||root.dataset.sheetModalOpen==="true")return;
  modalScrollY=window.scrollY||document.documentElement.scrollTop||0;
  modalStyles={body:{position:body.style.position,top:body.style.top,left:body.style.left,right:body.style.right,width:body.style.width,overflow:body.style.overflow},root:{overflow:root.style.overflow,overscrollBehavior:root.style.overscrollBehavior,scrollBehavior:root.style.scrollBehavior}};
  root.dataset.appModalOpen="true";body.dataset.appModalOpen="true";
  root.style.overflow="hidden";root.style.overscrollBehavior="none";
  body.style.position="fixed";body.style.top=`-${modalScrollY}px`;body.style.left="0";body.style.right="0";body.style.width="100%";body.style.overflow="hidden";
}
function unlockModalScroll(){
  const root=document.documentElement,body=document.body;
  if(!body||root.dataset.appModalOpen!=="true")return;
  const saved=modalStyles;delete root.dataset.appModalOpen;delete body.dataset.appModalOpen;
  if(saved){Object.assign(body.style,saved.body);root.style.overflow=saved.root.overflow;root.style.overscrollBehavior=saved.root.overscrollBehavior;root.style.scrollBehavior="auto";}
  window.scrollTo(0,modalScrollY);
  modalStyles=null;requestAnimationFrame(()=>{if(saved)root.style.scrollBehavior=saved.root.scrollBehavior;});
}
function syncModalLock(){
  modalFrame=0;
  if(hasOpenAppModal())lockModalScroll();else if(document.documentElement.dataset.sheetModalOpen!=="true")unlockModalScroll();
}
function queueModalLock(){if(!modalFrame)modalFrame=requestAnimationFrame(syncModalLock);}
window.GFUI={withBusy,syncModalLock};
document.querySelectorAll(".sheet-status-info").forEach(node=>{
  node.tabIndex=0;node.setAttribute("aria-label","État du tableur");
});
new MutationObserver(queueModalLock).observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:["class","hidden","open","data-sheet-modal-open"]});
queueModalLock();
})();
