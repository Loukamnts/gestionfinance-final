/* Read-only dashboard. Its sole input is the recipient's filtered snapshot. */
(function() {
"use strict";
const FR_MONTHS=["Janvier","Février","Mars","Avril","Mai","Juin","Juillet","Août","Septembre","Octobre","Novembre","Décembre"];
const t=value=>window.GFI18n?window.GFI18n.t(value):value;
const cash=value=>window.GFI18n?window.GFI18n.money(value):Number(value||0).toLocaleString("fr-FR",{style:"currency",currency:"EUR"});
const number=value=>Number.isFinite(Number(value))?Number(value):0;
const normal=value=>String(value||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
function kind(label){const name=normal(label);if(/epargne|livret|pea|placement|investissement/.test(name))return"savings";if(/salaire|revenu|prime|allocation|remuneration|paie|paye/.test(name))return"income";if(/depense|loyer|charge|facture|abonnement|course|frais|impot|taxe|assurance|transport|restaurant|achat|credit/.test(name))return"expense";return"other";}
function normalize(data) {
  return (Array.isArray(data&&data.months)?data.months:[]).filter(month=>month&&typeof month==="object").map((month,index)=>{
    const label=String(month.label||""),yearMatches=label.match(/(?:19|20|21)\d{2}/g);
    const monthPart=label.split(" — ").pop();
    let monthIndex=FR_MONTHS.findIndex(name=>normal(monthPart).includes(normal(name)));
    const year=Number(month.year)||(yearMatches?Number(yearMatches[yearMatches.length-1]):0);
    if(Number.isInteger(month.month)&&month.month>=1&&month.month<=12)monthIndex=month.month-1;
    return {id:String(index),label,year,monthIndex,details:(Array.isArray(month.details)?month.details:[]).filter(row=>row&&typeof row==="object").map(row=>({name:String(row.name||""),value:number(row.value)})),salary:number(month.salary),expenses:Math.abs(number(month.expenses)),savingsTotal:Math.abs(number(month.savingsTotal))};
  }).sort((a,b)=>a.year-b.year||a.monthIndex-b.monthIndex||a.id.localeCompare(b.id));
}
function chartModel(months,selected,view) {
  const rows=selected?selected.details:[];
  if(view==="pie")return {type:"doughnut",labels:rows.filter(row=>row.value!==0).map(row=>row.name),datasets:[{label:"Montant",data:rows.filter(row=>row.value!==0).map(row=>Math.abs(row.value))}]};
  const names=Array.from(new Set(months.flatMap(month=>month.details.map(row=>row.name)))).filter(name=>view!=="stacked"||kind(name)==="savings");
  return {type:view==="line"?"line":"bar",labels:months.map(month=>month.label),datasets:names.map(name=>({label:name,data:months.map(month=>month.details.filter(row=>row.name===name).reduce((sum,row)=>sum+row.value,0))}))};
}
function summary(months) {
  const sum=key=>months.reduce((n,m)=>n+m[key],0);
  const expenses=months.filter(m=>m.details.some(row=>kind(row.name)==="expense")||m.expenses!==0);
  const ordered=expenses.slice().sort((a,b)=>a.expenses-b.expenses);
  return {income:months.some(m=>m.details.some(row=>kind(row.name)==="income")||m.salary!==0)?sum("salary")/Math.max(1,months.length):null,
    savings:months.some(m=>m.details.some(row=>kind(row.name)==="savings")||m.savingsTotal!==0)?sum("savingsTotal"):null,
    max:ordered[ordered.length-1]||null,min:ordered[0]||null};
}
function node(tag,cls,text){const item=document.createElement(tag);if(cls)item.className=cls;if(text!==undefined)item.textContent=text;return item;}
function render(container,data) {
  const months=normalize(data),root=node("div","sd-dashboard"),filters=node("div","sd-toolbar"),metrics=node("div","sd-metrics"),card=node("section","sd-chart-card"),title=node("h3"),note=node("p"),holder=node("div","sd-canvas"),canvas=node("canvas"),empty=node("p","sd-empty"),details=node("section","sd-detail");
  root.append(filters,metrics,card,details);container.append(root);
  let chart=null,disposed=false,year=months.length?String(months[months.length-1].year):"0",monthId="",view="line";
  const years=Array.from(new Set(months.map(month=>String(month.year))));
  function field(label){const wrap=node("label","sf-field"),text=node("span","",t(label)),select=node("select");wrap.append(text,select);filters.append(wrap);return {select,text,label};}
  const yearField=field("Année"),monthField=field("Mois"),viewField=field("Vue du graphique");
  canvas.setAttribute("role","img");holder.append(canvas);card.append(title,note,holder,empty);
  function visible(){return months.filter(month=>String(month.year)===year);}
  function monthLabel(month){if(month.monthIndex>=0){const translated=t(FR_MONTHS[month.monthIndex]);return translated+(month.year?" "+month.year:"");}return month.label||t("Mois");}
  function options(select,items,value){select.replaceChildren(...items.map(([key,label])=>{const option=node("option","",label);option.value=key;return option;}));select.value=value;}
  function updateFilters(){
    [yearField,monthField,viewField].forEach(field=>field.text.textContent=t(field.label));
    options(yearField.select,years.map(value=>[value,value==="0"?t("Sans année"):value]),year);
    const allowed=visible();if(!allowed.some(month=>month.id===monthId))monthId=allowed.length?allowed[allowed.length-1].id:"";
    options(monthField.select,allowed.map(month=>[month.id,monthLabel(month)]),monthId);
    options(viewField.select,[["pie",t("Répartition")],["grouped",t("Comparatif annuel")],["stacked",t("Épargne")],["line",t("Évolution")]],view);
    yearField.select.disabled=!years.length;monthField.select.disabled=!allowed.length;
  }
  function update(){
    if(disposed)return;updateFilters();
    const allowed=visible(),selected=allowed.find(month=>month.id===monthId),totals=summary(allowed);
    metrics.replaceChildren();
    [[t("Revenus moyens"),totals.income===null?t("Non partagé"):cash(totals.income),t("Sur les mois partagés")],
     [t("Total épargné"),totals.savings===null?t("Non partagé"):cash(totals.savings),t("Données autorisées")],
     [t("Mois le plus dépensier"),totals.max?monthLabel(totals.max):t("Non partagé"),totals.max?cash(totals.max.expenses):""],
     [t("Mois le moins dépensier"),totals.min?monthLabel(totals.min):t("Non partagé"),totals.min?cash(totals.min.expenses):""]].forEach(([label,value,sub])=>{const metric=node("article","sd-metric");metric.append(node("span","",label),node("strong","",value),node("small","",sub));metrics.append(metric);});
    title.textContent=t({pie:"Répartition des lignes sélectionnées",grouped:"Comparatif mois par mois",stacked:"Épargne par mois",line:"Évolution annuelle"}[view]);
    note.textContent=t(view==="pie"?"Montants absolus du mois sélectionné. Le détail signé figure ci-dessous.":"Clique sur un point ou une barre pour consulter le détail du mois.");
    const model=chartModel(allowed,selected,view);
    if(chart){chart.destroy();chart=null;}
    const hasPoints=model.datasets.some(set=>set.data.some(value=>value!==0));
    holder.hidden=!hasPoints||typeof window.Chart!=="function";empty.hidden=!holder.hidden;
    empty.textContent=t(!months.length?"Aucune donnée partagée.":!hasPoints?"Aucun montant à afficher pour cette sélection.":"Le graphique n’a pas pu être chargé. Le détail reste disponible.");
    if(!holder.hidden) {
      const style=getComputedStyle(document.body),css=(name,fallback)=>style.getPropertyValue(name).trim()||fallback;
      const palette=[css("--chart-salary","#818cf8"),css("--chart-expenses","#fb7185"),css("--chart-savings","#34d399"),css("--accent","#a78bfa"),"#38bdf8","#fbbf24","#c084fc"];
      const config={type:model.type,data:{labels:view==="pie"?model.labels:allowed.map(monthLabel),datasets:model.datasets.map((set,i)=>({...set,label:view==="pie"?t(set.label):set.label,borderColor:palette[i%palette.length],backgroundColor:view==="pie"?model.labels.map((_,i)=>palette[i%palette.length]):palette[i%palette.length],borderWidth:view==="line"?2:0,borderRadius:document.body.dataset.theme==="brutal"?0:5,pointRadius:4,pointHoverRadius:7,pointHitRadius:15,tension:.2,fill:false,maxBarThickness:42}))},options:{responsive:true,maintainAspectRatio:false,animation:window.matchMedia("(prefers-reduced-motion: reduce)").matches?false:{duration:280},locale:window.GFI18n?window.GFI18n.locale():"fr-FR",plugins:{legend:{position:"bottom",labels:{color:css("--text","#fff"),boxWidth:12,padding:18,font:{family:css("--font-body","sans-serif"),size:12}}},tooltip:{backgroundColor:css("--input-focus-bg","#111"),titleColor:css("--text","#fff"),bodyColor:css("--text","#fff"),borderColor:css("--line-strong","#666"),borderWidth:1,callbacks:{label:context=>(context.dataset.label&&view!=="pie"?context.dataset.label:context.label)+": "+cash(view==="pie"?context.parsed:context.parsed.y)}}},onClick:(event,elements)=>{if(view!=="pie"&&elements.length&&allowed[elements[0].index]){monthId=allowed[elements[0].index].id;monthField.select.value=monthId;updateDetails();details.scrollIntoView({block:"nearest",behavior:"auto"});}}}};
      if(view!=="pie")config.options.scales={x:{stacked:view==="stacked",ticks:{color:css("--muted","#aaa"),maxRotation:35},grid:{display:false}},y:{stacked:view==="stacked",beginAtZero:true,ticks:{color:css("--muted","#aaa")},grid:{color:css("--line","#444")}}};
      try{chart=new window.Chart(canvas,config);}catch(error){holder.hidden=true;empty.hidden=false;empty.textContent=t("Le graphique n’a pas pu être chargé. Le détail reste disponible.");}
      canvas.setAttribute("aria-label",title.textContent+" — "+t("Données autorisées"));
    }
    updateDetails();
  }
  function updateDetails(){
    const selected=visible().find(month=>month.id===monthId);details.replaceChildren(node("h3","",t("Détail du mois")+(selected?" — "+monthLabel(selected):"")));
    if(!selected||!selected.details.length){details.append(node("p","sf-muted",t("Aucune donnée partagée.")));return;}
    selected.details.forEach(row=>{const line=node("div","sd-detail-row"),label=node("span","",row.name);label.translate=false;line.append(label,node("strong","",cash(row.value)));details.append(line);});
  }
  yearField.select.addEventListener("change",()=>{year=yearField.select.value;update();});
  monthField.select.addEventListener("change",()=>{monthId=monthField.select.value;if(view==="pie")update();else updateDetails();});
  viewField.select.addEventListener("change",()=>{view=viewField.select.value;update();});
  const themeObserver=new MutationObserver(update);themeObserver.observe(document.body,{attributes:true,attributeFilter:["data-theme","data-mode"]});
  window.addEventListener("gf:languagechange",update);
  update();
  return ()=>{disposed=true;if(chart)chart.destroy();themeObserver.disconnect();window.removeEventListener("gf:languagechange",update);};
}
window.SharedDashboard={render,normalize,chartModel,summary};
})();
