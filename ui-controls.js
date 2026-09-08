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
window.GFUI={withBusy};
document.querySelectorAll(".sheet-status-info").forEach(node=>{
  node.tabIndex=0;node.setAttribute("aria-label","État du tableur");
});
})();
