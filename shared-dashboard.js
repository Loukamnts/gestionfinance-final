/* Read-only adapter: only a recipient's filtered snapshot enters this view. */
(function(){
"use strict";
const FR_MONTHS=["Janvier","Février","Mars","Avril","Mai","Juin","Juillet","Août","Septembre","Octobre","Novembre","Décembre"];
const t=value=>window.GFI18n?window.GFI18n.t(value):value;
const cash=value=>window.GFI18n?window.GFI18n.money(value):Number(value||0).toLocaleString("fr-FR",{style:"currency",currency:"EUR"});
const number=value=>Number.isFinite(Number(value))?Number(value):0;
const normal=value=>String(value||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
function legacyRule(label){
  const name=normal(label);
  if(/epargne|livret|pea|placement|investissement|revolut|bourse/.test(name))return"Épargne";
  if(/depense|loyer|charge|facture|abonnement|course|frais|impot|taxe|assurance|transport|restaurant|achat|credit|prime video/.test(name))return"Dépense";
  if(/salaire|revenu|prime|allocation|remuneration|paie|paye/.test(name))return"Salaire";
  return"Ignorer";
}
function normalize(data){
  const months=(Array.isArray(data&&data.months)?data.months:[]).filter(month=>month&&typeof month==="object").map((month,index)=>{
    const sourceLabel=String(month.label||""),yearMatches=sourceLabel.match(/(?:19|20|21)\d{2}/g),monthPart=sourceLabel.split(" — ").pop();
    let monthIndex=FR_MONTHS.findIndex(name=>normal(monthPart).includes(normal(name)));
    const year=Number(month.year)||(yearMatches?Number(yearMatches.at(-1)):0);
    if(Number.isInteger(month.month)&&month.month>=1&&month.month<=12)monthIndex=month.month-1;
    const details=(Array.isArray(month.details)?month.details:[]).filter(row=>row&&typeof row==="object").map(row=>{
      const name=String(row.name||"").replace(/^Ligne \d+ — /,"");
      return {name,value:number(row.value),rule:typeof row.rule==="string"?row.rule:legacyRule(name)};
    });
    return {id:String(index),label:monthIndex>=0?FR_MONTHS[monthIndex]+(year?" "+year:""):sourceLabel,year,monthIndex,details};
  });
  const grouped=new Map();
  months.forEach(month=>{
    const key=month.year&&month.monthIndex>=0?month.year+"-"+month.monthIndex:month.id;
    if(grouped.has(key))grouped.get(key).details.push(...month.details);else grouped.set(key,month);
  });
  return [...grouped.values()].map(month=>{
    const totals=new Map();month.details.forEach(row=>totals.set(row.rule,(totals.get(row.rule)||0)+row.value));
    return {...month,salary:totals.get("Salaire")||0,expenses:totals.get("Dépense")||0,savingsTotal:totals.get("Épargne")||0,
      hasIncome:totals.has("Salaire"),hasExpenses:totals.has("Dépense"),hasSavings:totals.has("Épargne"),
      ruleBreakdown:[...totals].filter(([name])=>name!=="Salaire"&&name!=="Ignorer").map(([name,value])=>({name,value}))};
  }).sort((a,b)=>a.year-b.year||a.monthIndex-b.monthIndex||a.id.localeCompare(b.id));
}
function summary(months){
  const sum=key=>months.reduce((n,m)=>n+m[key],0),income=months.filter(month=>month.hasIncome),expenses=months.filter(month=>month.hasExpenses),ordered=expenses.slice().sort((a,b)=>Math.abs(a.expenses)-Math.abs(b.expenses));
  return {income:income.length?income.reduce((total,month)=>total+month.salary,0)/income.length:null,savings:months.some(m=>m.hasSavings)?Math.abs(sum("savingsTotal")):null,max:ordered.at(-1)||null,min:ordered[0]||null};
}
function node(tag,cls,text){const item=document.createElement(tag);if(cls)item.className=cls;if(text!==undefined)item.textContent=text;return item;}
function render(container,data){
  const presentation=window.DashboardPresentation,months=normalize(data),root=node("div","shared-dashboard content");
  if(!presentation){container.append(node("p","sf-notice","Le tableau de bord n’a pas pu être chargé. Recharge la page."));return()=>{};}
  let chart=null,disposed=false,year=months.length?String(months.at(-1).year):"0",monthId="",view="pie";
  const toolbar=node("section","home-toolbar"),top=node("div","home-toolbar-top"),heading=node("h2","","Tableau de bord"),readOnly=node("span","sf-tag","Lecture seule"),filters=node("div","home-filter-grid"),metrics=node("section","metrics"),card=node("section","panel chart-panel"),chartHead=node("div","chart-head"),chartText=node("div"),title=node("h2"),subtitle=node("p"),holder=node("div","chart-wrap"),canvas=node("canvas"),empty=node("div","empty-state"),legend=node("div","custom-legend"),details=node("section","month-details");
  top.append(heading,readOnly);toolbar.append(top,filters);root.append(toolbar,metrics,card,details);container.append(root);
  chartText.append(title,subtitle);chartHead.append(chartText);holder.append(canvas,empty);card.append(chartHead,holder,legend);canvas.setAttribute("aria-label","Graphique financier");
  metrics.setAttribute("aria-label","Résumé");details.setAttribute("aria-label","Détail du mois");
  const years=[...new Set(months.map(month=>String(month.year)))].reverse();
  function field(label){const wrap=node("label","home-filter"),text=node("span","",label),select=node("select");wrap.append(text,select);filters.append(wrap);return select;}
  const yearSelect=field("Année"),monthSelect=field("Mois"),viewSelect=field("Vue du graphique");
  function visible(){return months.filter(month=>String(month.year)===year);}
  function options(select,items,value){select.replaceChildren(...items.map(([key,label])=>{const option=node("option","",label);option.value=key;return option;}));select.value=value;presentation.dropdown(select);}
  function updateFilters(){
    const allowed=visible();if(!allowed.some(month=>month.id===monthId))monthId=allowed.length?allowed.at(-1).id:"";
    yearSelect.disabled=!years.length;monthSelect.disabled=!allowed.length;
    options(yearSelect,years.length?years.map(value=>[value,value==="0"?"Sans année":value]):[["0","Aucune année disponible"]],year);
    options(monthSelect,allowed.length?allowed.map(month=>[month.id,month.label]):[["","Aucun mois disponible"]],monthId);
    options(viewSelect,[["pie","Répartition"],["grouped","Comparatif annuel"],["stacked","Épargne"],["line","Évolution"]],view);
  }
  function detailRow(label,value,color,isUserText){
    const row=node("div","detail-row"),name=node("span","",isUserText?label:t(label));if(isUserText)name.translate=false;if(color)name.style.color=color;
    row.append(name,node("strong","",cash(value)));return row;
  }
  function updateDetails(){
    const selected=visible().find(month=>month.id===monthId),rules=node("article","detail-panel"),expenses=node("article","detail-panel"),ruleList=node("div","detail-list"),expenseList=node("div","detail-list");
    rules.append(node("h3","","Détail épargne"),ruleList);expenses.append(node("h3","","Détail dépenses"),expenseList);details.replaceChildren(rules,expenses);
    const breakdown=selected?(selected.ruleBreakdown||[]).filter(row=>row.value!==0):[];
    if(!breakdown.length)ruleList.append(node("p","expense-note",selected&&selected.ruleBreakdown.length?"Aucun montant pour ce mois.":"Non partagé"));
    breakdown.forEach(row=>ruleList.append(detailRow(row.name,row.value,presentation.colorForRule(row.name),!["Dépense","Épargne"].includes(row.name))));
    const expenseRows=selected?selected.details.filter(row=>row.rule==="Dépense"):[];
    if(!expenseRows.length)expenseList.append(node("p","expense-note","Non partagé"));
    expenseRows.forEach(row=>expenseList.append(detailRow(row.name,Math.abs(row.value),null,true)));
  }
  function update(){
    if(disposed)return;updateFilters();
    const allowed=visible(),selected=allowed.find(month=>month.id===monthId),totals=summary(allowed),sameMetrics=presentation.metrics(allowed),salaryTotal=allowed.reduce((sum,month)=>sum+month.salary,0);
    metrics.replaceChildren();
    [["Salaire moyen",totals.income===null?"Non partagé":cash(sameMetrics.avgSalary),totals.income===null?"Données autorisées":sameMetrics.incomeMonthCount+" mois avec salaire"],
     ["Total épargné",totals.savings===null?"Non partagé":cash(Math.abs(sameMetrics.totalSavings)),totals.savings!==null&&totals.income!==null?(salaryTotal?Math.round(totals.savings/salaryTotal*100):0)+" % du salaire total":"Données autorisées"],
     ["Mois le plus dépensier",totals.max?totals.max.label:"Non partagé",totals.max?cash(Math.abs(totals.max.expenses)):"Données autorisées"],
     ["Mois le moins dépensier",totals.min?totals.min.label:"Non partagé",totals.min?cash(Math.abs(totals.min.expenses)):"Données autorisées"]].forEach(([label,value,note])=>{
      const metric=node("article","metric-card");metric.append(node("span","metric-label",label),node("strong","metric-value",value),node("span","metric-note",note));metrics.append(metric);
    });
    if(chart){clearTimeout(chart.__legendRefreshTimer);chart.destroy();chart=null;}legend.replaceChildren();
    const config=presentation.chartConfig({view,months:allowed,selected,hideSalary:totals.income===null,onMonthClick:index=>{
      const month=allowed[index];if(!month)return;monthId=month.id;monthSelect.value=monthId;presentation.syncDropdown(monthSelect);updateDetails();presentation.openMonth(month);
    }});
    title.textContent=config.title;subtitle.textContent=config.subtitle;
    const hasData=config.chart.data.datasets.some(dataset=>dataset.data.some(value=>Number(value)!==0));
    const unavailable=typeof window.Chart!=="function";
    empty.classList.toggle("is-visible",!hasData||unavailable);canvas.hidden=!hasData||unavailable;
    empty.textContent=!months.length?"Aucune donnée partagée.":unavailable?"Le graphique n’a pas pu être chargé. Le détail reste disponible.":"Aucun montant à afficher pour cette sélection.";
    if(hasData&&!unavailable){
      try{chart=new window.Chart(canvas,config.chart);presentation.legend(chart,legend);}catch(error){canvas.hidden=true;empty.classList.add("is-visible");empty.textContent="Le graphique n’a pas pu être chargé. Le détail reste disponible.";}
    }
    updateDetails();if(window.GFI18n)window.GFI18n.apply(root);
  }
  yearSelect.addEventListener("change",()=>{year=yearSelect.value;update();});
  monthSelect.addEventListener("change",()=>{monthId=monthSelect.value;update();});
  viewSelect.addEventListener("change",()=>{view=viewSelect.value;update();});
  const themeObserver=new MutationObserver(update);themeObserver.observe(document.body,{attributes:true,attributeFilter:["data-theme","data-mode"]});
  window.addEventListener("gf:languagechange",update);update();
  return()=>{disposed=true;if(chart){clearTimeout(chart.__legendRefreshTimer);chart.destroy();}themeObserver.disconnect();window.removeEventListener("gf:languagechange",update);};
}
window.SharedDashboard={render,normalize,summary};
})();
