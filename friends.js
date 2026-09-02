/* Partage entre amis : mois × lignes, lecture seule par défaut. */
(function () {
  "use strict";

  var MONTHS=["Janvier","Février","Mars","Avril","Mai","Juin","Juillet","Août","Septembre","Octobre","Novembre","Décembre"];
  var friendsList=[],pendingRequests=[],sentRequests=[];
  var cache={userId:"",data:null,pending:null};

  function sb(){try{return window.__account&&window.__account.client||null;}catch(e){return null;}}
  function user(){try{return window.__account&&window.__account.user||null;}catch(e){return null;}}
  function el(tag,cls,text){var node=document.createElement(tag);if(cls)node.className=cls;if(text!==undefined)node.textContent=text;return node;}
  function button(text,handler,cls){var node=el("button","sharing-action"+(cls?" "+cls:""),text);node.type="button";node.addEventListener("click",handler);return node;}
  function notice(text,kind){var node=el("p","sharing-feedback"+(kind?" is-"+kind:""),text);node.setAttribute("role","status");return node;}
  function defaults(){return{can_view_dashboard:false,can_view_sheet:false,can_view_categories:false};}
  function money(value){return Number(value||0).toLocaleString("fr-FR",{style:"currency",currency:"EUR"});}
  function normal(value){return String(value||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();}
  function snapshot(){try{return window.FinanceSheet&&window.FinanceSheet.getSnapshot?window.FinanceSheet.getSnapshot():null;}catch(e){return null;}}
  function yearOf(sheet){var match=String(sheet&&sheet.name||"").match(/(19\d{2}|20\d{2}|21\d{2})/);return match?Number(match[1]):0;}
  function idOf(sheet,index){return String(sheet&&sheet.id||("sheet-"+index));}
  function labelOf(sheet,row){var value=String(sheet&&sheet.rowHeaders&&sheet.rowHeaders[row]||"").trim();return "Ligne "+(row+1)+(value?" — "+value:"");}
  function headerOf(sheet,column){return String(sheet&&sheet.headers&&sheet.headers[column]||MONTHS[column]||column+1);}
  function rowHasData(sheet,row){if(String(sheet.rowHeaders&&sheet.rowHeaders[row]||"").trim())return true;return Object.keys(sheet.cells||{}).some(function(key){return key.indexOf(row+",")===0;});}
  function usefulRows(sheet){var rows=[],count=Math.max(Number(sheet&&sheet.rows||0),(sheet&&sheet.rowHeaders&&sheet.rowHeaders.length)||0);for(var row=0;row<count;row++)if(rowHasData(sheet,row))rows.push(row);return rows;}
  function accessLabel(p){if(p.can_view_dashboard&&p.can_view_sheet)return"Dashboard et tableur autorisés";if(p.can_view_dashboard)return"Dashboard autorisé";if(p.can_view_sheet)return"Tableur autorisé";return"Aucun accès accordé";}
  function invalidate(){cache={userId:"",data:null,pending:null};}
  function errorText(error,step){var message=String(error&&error.message||error||"").toLowerCase(),where=step?" pour "+step:"";if(/user_not_found/.test(message))return"Aucun utilisateur trouvé avec cet e-mail.";if(/cannot_add_self/.test(message))return"Tu ne peux pas t’ajouter toi-même.";if(/request_already_sent/.test(message))return"La demande a déjà été envoyée.";if(/request_already_received/.test(message))return"Cette personne t’a déjà envoyé une demande.";if(/already_friends/.test(message))return"Vous êtes déjà amis.";if(/friendship_not_accepted/.test(message))return"Cet accès ne peut être configuré qu’après acceptation réciproque de l’amitié.";if(/share_selection_required/.test(message))return"Choisis au moins un mois et une ligne avant d’activer le partage.";if(/save_friend_share_config|function .* does not exist/.test(message))return"La mise à jour sécurisée du partage doit être appliquée dans Supabase avant de continuer.";if(/row-level security|permission denied/.test(message))return"La base a refusé l’action"+where+". Applique le correctif de partage sécurisé dans Supabase.";if(/finance_shared_(sheet|dashboard)_snapshots|relation .* does not exist/.test(message))return"La migration Supabase du partage sécurisé n’est pas encore appliquée.";return"Impossible d’enregistrer cette action"+where+". Réessaie dans un instant.";}

  async function loadFriends(options){
    options=options||{};var client=sb(),me=user();if(!client||!me)return{friends:[],pending:[],sent:[]};
    if(!options.force&&cache.data&&cache.userId===me.id)return cache.data;
    if(!options.force&&cache.pending&&cache.userId===me.id)return cache.pending;
    var work=(async function(){
      try{
        var result=await client.rpc("get_my_friendships");if(result.error||!result.data)return{friends:[],pending:[],sent:[],error:result.error?errorText(result.error):""};
        var friends=[],pending=[],sent=[];
        await Promise.all(result.data.map(async function(relation){
          var friendId=relation.owner_id===me.id?relation.friend_id:relation.owner_id;
          var friend={friendshipId:relation.friendship_id,friendId:friendId,displayName:relation.other_display_name||(relation.other_email?relation.other_email.split("@")[0]:"Ami"),email:relation.other_email||"",isRequester:relation.owner_id===me.id};
          if(relation.status==="accepted"){
            var checks=await Promise.all([
              client.from("share_permissions").select("can_view_dashboard,can_view_sheet,can_view_categories").eq("owner_id",me.id).eq("friend_id",friendId).is("year",null).is("month",null).is("row_key",null).maybeSingle(),
              client.from("share_permissions").select("can_view_dashboard,can_view_sheet,can_view_categories").eq("owner_id",friendId).eq("friend_id",me.id).is("year",null).is("month",null).is("row_key",null).maybeSingle()
            ]);
            friend.permissions=checks[0].data&&!checks[0].error?checks[0].data:defaults();friend.receivedPermissions=checks[1].data&&!checks[1].error?checks[1].data:defaults();friends.push(friend);
          }else if(relation.status==="pending"){if(friend.isRequester)sent.push(friend);else pending.push(friend);}
        }));
        friends.sort(function(a,b){return a.displayName.localeCompare(b.displayName,"fr");});
        var data={friends:friends,pending:pending,sent:sent};friendsList=friends;pendingRequests=pending;sentRequests=sent;cache={userId:me.id,data:data,pending:null};return data;
      }catch(e){console.warn("loadFriends",e);return{friends:[],pending:[],sent:[],error:errorText(e)};}
    })();
    cache={userId:me.id,data:null,pending:work};return work;
  }
  async function sendRequest(email){var client=sb(),me=user();if(!client||!me)return{error:"Connecte-toi pour envoyer une invitation."};if(!email||email.length<5||email.indexOf("@")===-1)return{error:"Saisis une adresse e-mail valide."};try{var result=await client.rpc("send_friend_request_by_email",{p_email:email.trim().toLowerCase()});if(result.error)return{error:errorText(result.error)};invalidate();return{success:true};}catch(e){return{error:errorText(e)};}}
  async function respond(id,accepted){var client=sb(),me=user();if(!client||!me)return{error:"Non connecté"};try{var result=await client.rpc("respond_to_friend_request",{p_friendship_id:id,p_accept:accepted});if(result.error)return{error:errorText(result.error)};invalidate();return{success:true};}catch(e){return{error:errorText(e)};}}
  async function removeFriend(id){
    var client=sb(),me=user(),relation=friendsList.concat(pendingRequests,sentRequests).find(function(item){return item.friendshipId===id;});if(!client||!me)return{error:"Non connecté"};if(!relation)return{error:"Relation introuvable"};
    try{var cleanup=await Promise.all([client.from("share_permissions").delete().eq("owner_id",me.id).eq("friend_id",relation.friendId),client.from("finance_shared_sheet_snapshots").delete().eq("owner_id",me.id).eq("friend_id",relation.friendId),client.from("finance_shared_dashboard_snapshots").delete().eq("owner_id",me.id).eq("friend_id",relation.friendId)]);if(cleanup.some(function(result){return result.error;}))return{error:"Impossible de retirer les autorisations de partage."};var result=await client.from("friendships").delete().eq("id",id);if(result.error)return{error:errorText(result.error)};invalidate();return{success:true};}catch(e){return{error:errorText(e)};}
  }
  async function loadRules(friendId){var client=sb(),me=user();if(!client||!me)return[];try{var result=await client.from("share_permissions").select("year,month,row_key,allowed").eq("owner_id",me.id).eq("friend_id",friendId);return result.error?[]:(result.data||[]).filter(function(rule){return rule.year!==null||rule.month!==null||rule.row_key!==null;});}catch(e){return[];}}
  function selectionFromRules(data,rules){var selection={};((data&&data.sheets)||[]).forEach(function(sheet,index){var id=idOf(sheet,index),year=yearOf(sheet);selection[id]={months:new Set(),rows:new Set()};(rules||[]).forEach(function(rule){if(!rule.allowed||Number(rule.year||0)!==year||String(rule.row_key||"").indexOf(id+":")!==0)return;selection[id].months.add(Number(rule.month)-1);var row=Number(String(rule.row_key).slice((id+":").length));if(Number.isInteger(row)&&row>=0)selection[id].rows.add(row);});});return selection;}
  function ruleCount(selection){return Object.keys(selection||{}).reduce(function(total,key){return total+selection[key].months.size*selection[key].rows.size;},0);}
  function buildRules(data,selection){var rules=[];((data&&data.sheets)||[]).forEach(function(sheet,index){var chosen=selection[idOf(sheet,index)];if(!chosen||!chosen.months.size||!chosen.rows.size)return;chosen.rows.forEach(function(row){chosen.months.forEach(function(column){rules.push({year:yearOf(sheet),month:column+1,row_key:idOf(sheet,index)+":"+row,allowed:true});});});});return rules;}
  function recompute(sheet){try{return window.FinanceSheet&&window.FinanceSheet.recompute?window.FinanceSheet.recompute(sheet.cells||{}):{};}catch(e){return{};}}
  function cellValue(result){if(!result||result.error||result.value===undefined||result.value===null)return"";var value=result.value;if(typeof value==="number"&&Number.isFinite(value))return value;return String(value).slice(0,500);}
  function buildTablePayload(data,selection){var sheets=[];((data&&data.sheets)||[]).forEach(function(sheet,index){var chosen=selection[idOf(sheet,index)];if(!chosen||!chosen.months.size||!chosen.rows.size)return;var columns=Array.from(chosen.months).sort(function(a,b){return a-b;}),rows=Array.from(chosen.rows).sort(function(a,b){return a-b;}),values=recompute(sheet),shared={name:String(sheet.name||"Feuille"),headers:columns.map(function(c){return headerOf(sheet,c);}),rowHeaders:rows.map(function(r){return labelOf(sheet,r);}),rows:rows.length,cols:columns.length,cells:{}};rows.forEach(function(sourceRow,localRow){columns.forEach(function(sourceCol,localCol){var value=cellValue(values[sourceRow+","+sourceCol]);if(value!=="")shared.cells[localRow+","+localCol]={raw:String(value)};});});sheets.push(shared);});return{v:"shared-sheet-v2",updatedAt:Date.now(),sheets:sheets};}
  function lineType(label){var value=normal(label);if(/epargne|livret|pea|placement|investissement/.test(value))return"savings";if(/salaire|revenu|prime|allocation|remuneration|paie|paye/.test(value))return"income";if(/depense|loyer|charge|facture|abonnement|course|frais|impot|taxe|assurance|transport|restaurant|achat|credit/.test(value))return"expense";return"other";}
  function numberValue(value){var result=typeof value==="number"?value:parseFloat(String(value).replace(",",".").replace(/[^0-9.-]/g,""));return Number.isFinite(result)?result:0;}
  function buildDashboardPayload(table){var months=[];(table.sheets||[]).forEach(function(sheet){for(var column=0;column<Number(sheet.cols||0);column++){var month={label:String(sheet.name||"Feuille")+" — "+String(sheet.headers&&sheet.headers[column]||MONTHS[column]||"Mois"),salary:0,expenses:0,savingsTotal:0,details:[]};for(var row=0;row<Number(sheet.rows||0);row++){var cell=sheet.cells&&sheet.cells[row+","+column];if(!cell)continue;var value=numberValue(cell.raw),label=String(sheet.rowHeaders&&sheet.rowHeaders[row]||("Ligne "+(row+1))),kind=lineType(label);month.details.push({name:label,value:value});if(kind==="income")month.salary+=value;else if(kind==="expense")month.expenses+=Math.abs(value);else if(kind==="savings")month.savingsTotal+=Math.abs(value);}if(month.details.length)months.push(month);}});return{v:"shared-dashboard-v2",updatedAt:Date.now(),months:months};}
  async function deleteShared(table,friendId){var client=sb(),me=user();if(client&&me)return client.from(table).delete().eq("owner_id",me.id).eq("friend_id",friendId);}
  async function publish(friendId,permissions,selection,data){
    var client=sb(),me=user();if(!client||!me)return{error:"Non connecté"};var table=buildTablePayload(data,selection),hasData=table.sheets.length>0;if(!hasData){await Promise.all([deleteShared("finance_shared_sheet_snapshots",friendId),deleteShared("finance_shared_dashboard_snapshots",friendId)]);return{success:true};}
    if(permissions.can_view_sheet){var sheetResult=await client.from("finance_shared_sheet_snapshots").upsert({owner_id:me.id,friend_id:friendId,payload:table,updated_at:new Date().toISOString()},{onConflict:"owner_id,friend_id"});if(sheetResult.error)return{error:errorText(sheetResult.error)};}else await deleteShared("finance_shared_sheet_snapshots",friendId);
    if(permissions.can_view_dashboard){var dashboardResult=await client.from("finance_shared_dashboard_snapshots").upsert({owner_id:me.id,friend_id:friendId,payload:buildDashboardPayload(table),updated_at:new Date().toISOString()},{onConflict:"owner_id,friend_id"});if(dashboardResult.error)return{error:errorText(dashboardResult.error)};}else await deleteShared("finance_shared_dashboard_snapshots",friendId);return{success:true};
  }
  async function saveShare(friend,permissions,selection){
    var client=sb(),me=user(),data=snapshot();if(!client||!me)return{error:"Non connecté"};if(!data||!data.sheets||!data.sheets.length)return{error:"Ajoute d’abord des données à ton tableur."};
    var active=!!(permissions.can_view_dashboard||permissions.can_view_sheet),rules=active?buildRules(data,selection):[];
    if(active&&!rules.length)return{error:"Choisis au moins un mois et une ligne avant d’activer le partage."};
    var table=buildTablePayload(data,selection),dashboard=buildDashboardPayload(table);
    try{
      // Une RPC transactionnelle : les anciennes autorisations restent intactes
      // si une vérification de sécurité échoue pendant l’enregistrement.
      var result=await client.rpc("save_friend_share_config",{
        p_friend_id:friend.friendId,
        p_can_view_dashboard:!!permissions.can_view_dashboard,
        p_can_view_sheet:!!permissions.can_view_sheet,
        p_rules:rules,
        p_sheet_payload:permissions.can_view_sheet?table:null,
        p_dashboard_payload:permissions.can_view_dashboard?dashboard:null
      });
      if(result.error)return{error:errorText(result.error,"l’enregistrement de cet accès")};
      invalidate();return{success:true};
    }catch(e){return{error:errorText(e,"l’enregistrement de cet accès")};}
  }
  async function refreshMySharedSnapshots(){var data=snapshot(),friends=await loadFriends();if(!data)return;for(var i=0;i<friends.friends.length;i++){var friend=friends.friends[i],rules=await loadRules(friend.friendId),selection=selectionFromRules(data,rules),result=await saveShare(friend,friend.permissions||defaults(),selection);if(result.error)console.warn("Impossible de synchroniser le partage",result.error);}}
  async function loadShared(friendId,kind){var client=sb(),me=user();if(!client||!me)return{error:"Non connecté"};var table=kind==="dashboard"?"finance_shared_dashboard_snapshots":"finance_shared_sheet_snapshots";try{var result=await client.from(table).select("payload").eq("owner_id",friendId).eq("friend_id",me.id).maybeSingle();if(result.error||!result.data||!result.data.payload)return{error:kind==="dashboard"?"Dashboard non disponible":"Tableur non disponible"};return{payload:typeof result.data.payload==="string"?JSON.parse(result.data.payload):result.data.payload};}catch(e){return{error:errorText(e)};}}
  function renderSharedTable(container,data,friend){container.replaceChildren();container.hidden=false;container.append(el("h3","","Tableur partagé — "+friend.displayName),el("p","","Consultation seule : seules les lignes et les mois autorisés sont affichés."),button("Revenir à mon tableur",function(){if(window.setPage)window.setPage("sheet");}));var sheets=data&&data.sheets||[];if(!sheets.length){container.append(el("div","sharing-empty","Aucune donnée de tableur n’est disponible."));return;}sheets.forEach(function(sheet){var wrap=el("div","shared-table-wrap"),table=el("table","shared-table"),head=document.createElement("thead"),headRow=document.createElement("tr");headRow.append(el("th","","Ligne"));for(var c=0;c<sheet.cols;c++)headRow.append(el("th","",sheet.headers[c]||MONTHS[c]));head.append(headRow);table.append(head);var body=document.createElement("tbody");for(var row=0;row<sheet.rows;row++){var line=document.createElement("tr");line.append(el("th","",sheet.rowHeaders[row]||("Ligne "+(row+1))));for(var col=0;col<sheet.cols;col++){var cell=sheet.cells&&sheet.cells[row+","+col];line.append(el("td","",cell&&cell.raw!==undefined?String(cell.raw):"—"));}body.append(line);}table.append(body);wrap.append(table);container.append(el("h4","shared-sheet-title",sheet.name),wrap);});}
  function renderSharedDashboard(container,data,friend){container.replaceChildren();container.hidden=false;container.append(el("h3","","Dashboard partagé — "+friend.displayName),el("p","","Synthèse calculée uniquement à partir des lignes et mois autorisés."));var months=data&&data.months||[];if(!months.length){container.append(el("div","sharing-empty","Aucune donnée de dashboard n’est disponible."));return;}var income=months.reduce(function(sum,item){return sum+Number(item.salary||0);},0),expenses=months.reduce(function(sum,item){return sum+Math.abs(Number(item.expenses||0));},0),savings=months.reduce(function(sum,item){return sum+Math.abs(Number(item.savingsTotal||0));},0),grid=el("div","chart-detail-grid");[["Mois analysés",String(months.length)],["Revenus",money(income)],["Dépenses",money(expenses)],["Épargne",money(savings)]].forEach(function(metric){var card=el("div"),title=el("span","",metric[0]),value=el("strong","",metric[1]);card.append(title,value);grid.append(card);});container.append(grid);var list=el("div","shared-month-list");months.forEach(function(month){var line=el("div","shared-month-row"),title=el("strong","",month.label),total=el("span","",money(Number(month.salary||0)-Math.abs(Number(month.expenses||0))));line.append(title,total);list.append(line);});container.append(list);}
  async function viewShared(friend,kind){var target=document.getElementById("sharedView");if(!target)return;target.hidden=false;target.replaceChildren(el("p","","Chargement du contenu partagé…"));var result=await loadShared(friend.friendId,kind);if(result.error){target.replaceChildren(notice(result.error,"error"));return;}if(kind==="dashboard")renderSharedDashboard(target,result.payload,friend);else renderSharedTable(target,result.payload,friend);target.scrollIntoView({behavior:"smooth",block:"start"});}
  function person(friend,subtitle,actions){var row=el("article","sharing-person"),copy=el("div","sharing-person-copy"),buttons=el("div","sharing-actions");copy.append(el("h4","",friend.displayName),el("p","",subtitle));actions.forEach(function(action){buttons.append(action);});row.append(copy,buttons);return row;}

  async function renderSharingAccess(friendId){
    var target=document.getElementById("sharingAccessContainer");
    if(!target)return;
    target.replaceChildren(el("div","sharing-empty","Préparation des autorisations…"));
    var data=await loadFriends(),friend=data.friends.find(function(item){return item.friendId===friendId;}),table=snapshot();
    if(!friend){target.replaceChildren(el("div","sharing-empty","Cet ami n’est plus disponible."));return;}
    if(!table||!table.sheets||!table.sheets.length){target.replaceChildren(el("div","sharing-empty","Ajoute des données au tableur avant de définir un partage."));return;}

    var selection=selectionFromRules(table,await loadRules(friend.friendId));
    var permissions=Object.assign(defaults(),friend.permissions||{});
    var root=el("section","sharing-access-card sharing-access-redesign");
    var hero=el("header","sharing-access-hero");
    var avatar=el("span","sharing-access-avatar",String(friend.displayName||"A").trim().slice(0,1).toLocaleUpperCase("fr"));
    var heroCopy=el("div","sharing-access-hero-copy");
    heroCopy.append(el("span","eyebrow","Partage en lecture seule"),el("h3","","Accès de "+friend.displayName),el("p","","Tu restes propriétaire de tes données. Rien n’est visible tant que tu n’as pas enregistré une sélection."));
    hero.append(avatar,heroCopy);root.append(hero);

    var scopes=el("section","sharing-step sharing-scope-step");
    scopes.append(el("div","sharing-step-heading",""));
    scopes.firstChild.append(el("span","sharing-step-number","1"),el("div","",undefined));
    scopes.firstChild.lastChild.append(el("h4","","Choisir ce qui peut être ouvert"),el("p","","Active seulement les écrans que tu veux rendre consultables."));
    var scopeGrid=el("div","sharing-scope-grid");
    function makeScope(key,title,description){
      var label=el("label","sharing-scope-card"),input=document.createElement("input"),copy=el("span","sharing-scope-copy"),top=el("span","sharing-scope-title");
      input.type="checkbox";input.checked=!!permissions[key];
      input.addEventListener("change",function(){permissions[key]=input.checked;updateSummary();});
      top.append(el("strong","",title),el("span","sharing-scope-switch","") );
      copy.append(top,el("small","",description));label.append(input,copy);return label;
    }
    scopeGrid.append(
      makeScope("can_view_sheet","Tableur","Les lignes et mois précis que tu coches ci-dessous."),
      makeScope("can_view_dashboard","Dashboard","Une synthèse calculée uniquement avec cette même sélection.")
    );
    scopes.append(scopeGrid,el("p","sharing-security-note","Aucun droit de modification n’est accordé. Tu peux retirer l’accès quand tu veux."));
    root.append(scopes);

    var dataStep=el("section","sharing-step sharing-data-step");
    var dataHeading=el("div","sharing-step-heading");
    dataHeading.append(el("span","sharing-step-number","2"));
    var dataHeadingCopy=el("div");dataHeadingCopy.append(el("h4","","Choisir les données visibles"),el("p","","La sélection se fait feuille par feuille : mois × lignes."));dataHeading.append(dataHeadingCopy);dataStep.append(dataHeading);
    var sheetList=el("div","sharing-dataset-list");
    var save;
    var summary=el("p","sharing-editor-summary","");
    var sheetStatus={};
    function updateSummary(){
      var cells=ruleCount(selection),active=permissions.can_view_sheet||permissions.can_view_dashboard;
      Object.keys(sheetStatus).forEach(function(id){var state=selection[id],status=sheetStatus[id];if(!state||!status)return;status.textContent=state.months.size+" mois · "+state.rows.size+" ligne"+(state.rows.size>1?"s":"");});
      if(!active)summary.textContent="Aucun écran activé : aucune donnée ne sera partagée.";
      else if(!cells)summary.textContent="Choisis au moins un mois et une ligne avant d’enregistrer.";
      else summary.textContent=cells+" cellule"+(cells>1?"s":"")+" seront visibles par "+friend.displayName+" en lecture seule.";
      if(save){save.disabled=active&&!cells;save.textContent=active?"Enregistrer l’accès":"Désactiver tout partage";save.title=save.disabled?"Sélectionne au moins un mois et une ligne":"";}
    }
    table.sheets.forEach(function(sheet,index){
      var id=idOf(sheet,index),available=usefulRows(sheet),monthCount=Math.min(12,Number(sheet.cols||12));
      if(!selection[id])selection[id]={months:new Set(),rows:new Set()};
      var card=el("section","sharing-dataset-card"),head=el("div","sharing-dataset-head"),headCopy=el("div"),status=el("span","sharing-dataset-status","");
      headCopy.append(el("h5","",String(sheet.name||("Feuille "+(index+1)))),el("p","",available.length+" ligne"+(available.length>1?"s":"")+" disponible"+(available.length>1?"s":"")));head.append(headCopy,status);sheetStatus[id]=status;
      var quick=el("div","sharing-quick-actions"),months=el("div","sharing-month-grid"),rows=el("div","sharing-row-list");
      function syncInputs(){months.querySelectorAll("input").forEach(function(input){input.checked=selection[id].months.has(Number(input.value));});rows.querySelectorAll("input").forEach(function(input){input.checked=selection[id].rows.has(Number(input.value));});updateSummary();}
      quick.append(
        button("Tout sélectionner",function(){for(var m=0;m<monthCount;m++)selection[id].months.add(m);available.forEach(function(row){selection[id].rows.add(row);});syncInputs();}),
        button("Tout effacer",function(){selection[id].months.clear();selection[id].rows.clear();syncInputs();})
      );
      card.append(head,quick,el("p","sharing-selection-label","Mois autorisés"));
      for(var month=0;month<monthCount;month++){(function(column){var label=el("label","sharing-month-choice"),input=document.createElement("input");input.type="checkbox";input.value=String(column);input.checked=selection[id].months.has(column);input.addEventListener("change",function(){if(input.checked)selection[id].months.add(column);else selection[id].months.delete(column);updateSummary();});label.append(input,document.createTextNode(headerOf(sheet,column)));months.append(label);})(month);}
      card.append(months,el("p","sharing-selection-label","Lignes autorisées"));
      if(!available.length)rows.append(el("div","sharing-empty","Aucune ligne renseignée dans cette feuille."));
      available.forEach(function(row){var label=el("label","sharing-row-choice"),input=document.createElement("input");input.type="checkbox";input.value=String(row);input.checked=selection[id].rows.has(row);input.addEventListener("change",function(){if(input.checked)selection[id].rows.add(row);else selection[id].rows.delete(row);updateSummary();});label.append(input,document.createTextNode(labelOf(sheet,row)));rows.append(label);});
      card.append(rows);sheetList.append(card);
    });
    dataStep.append(sheetList);root.append(dataStep);

    var footer=el("div","sharing-editor-footer sharing-save-bar");
    var feedback=el("div","sharing-feedback-slot");
    save=button("Enregistrer l’accès",async function(){
      feedback.replaceChildren();save.disabled=true;
      var result=await saveShare(friend,permissions,selection);
      if(result.error){feedback.append(notice(result.error,"error"));updateSummary();return;}
      if(window.setPage)window.setPage("sharing");
    },"button-primary");
    var footerCopy=el("div","sharing-save-copy");footerCopy.append(summary,feedback);footer.append(footerCopy,save);root.append(footer);
    target.replaceChildren(root);updateSummary();
  }
  async function renderSharing(container,options){
    options=options||{};if(!container)return;var me=user();if(!me){container.replaceChildren(el("div","sharing-empty","Connecte-toi pour gérer les invitations et les accès."));return;}if(!options.force&&container.dataset.sharingReady==="true")return;if(!container.childElementCount)container.replaceChildren(el("div","sharing-empty","Chargement de tes partages…"));
    var data=await loadFriends({force:!!options.force}),layout=el("div","sharing-layout"),overview=el("section","sharing-overview sharing-card wide"),copy=el("div","sharing-overview-copy");copy.append(el("span","eyebrow","Partage et amis"),el("h3","","Garde le contrôle de tes données"),el("p","","Les accès sont privés par défaut. Chaque partage est en lecture seule et peut être retiré à tout moment."));var stats=el("div","sharing-stats"),receivedCount=data.friends.filter(function(friend){var permissions=friend.receivedPermissions||defaults();return permissions.can_view_dashboard||permissions.can_view_sheet;}).length;[["Amis",data.friends.length],["Demandes",data.pending.length],["Accès reçus",receivedCount]].forEach(function(item){var stat=el("div","sharing-stat");stat.append(el("strong","",String(item[1])),el("span","",item[0]));stats.append(stat);});overview.append(copy,stats);layout.append(overview);if(data.error)layout.append(el("div","sharing-empty",data.error));
    var invite=el("section","sharing-card sharing-invite");invite.append(el("h3","","Inviter un proche"),el("p","","Entre son adresse e-mail. Il devra accepter avant que l’un de vous puisse partager quoi que ce soit."));var email=document.createElement("input");email.type="email";email.placeholder="nom@exemple.com";email.autocomplete="email";var inviteFeedback=el("div","sharing-feedback-slot"),send=button("Envoyer",async function(){inviteFeedback.replaceChildren();send.disabled=true;var result=await sendRequest(email.value.trim());if(result.error){inviteFeedback.append(notice(result.error,"error"));send.disabled=false;return;}email.value="";await renderSharing(container,{force:true});});var inputRow=el("div","sharing-email");inputRow.append(email,send);invite.append(inputRow,inviteFeedback);layout.append(invite);
    var requests=el("section","sharing-card sharing-requests");requests.append(el("h3","","Demandes reçues"),el("p","","Accepte uniquement les personnes que tu connais."));if(!data.pending.length)requests.append(el("div","sharing-empty","Aucune demande en attente."));data.pending.forEach(function(friend){requests.append(person(friend,friend.email,[button("Accepter",async function(){var result=await respond(friend.friendshipId,true);if(result.error){requests.append(notice(result.error,"error"));return;}renderSharing(container,{force:true});},"button-primary"),button("Refuser",async function(){var result=await respond(friend.friendshipId,false);if(result.error){requests.append(notice(result.error,"error"));return;}renderSharing(container,{force:true});})]));});if(data.sent.length)requests.append(el("p","sharing-sent-note","En attente : "+data.sent.map(function(friend){return friend.displayName;}).join(", ")+"."));layout.append(requests);
    var manage=el("section","sharing-card wide sharing-manage");manage.append(el("h3","","Ce que tu partages"),el("p","","Choisis un ami, puis les mois et les lignes visibles. Sans sélection, aucun contenu n’est partagé."));if(!data.friends.length)manage.append(el("div","sharing-empty","Ajoute un ami pour ouvrir les réglages de partage."));data.friends.forEach(function(friend){manage.append(person(friend,accessLabel(friend.permissions||defaults()),[button("Gérer l’accès",function(){if(window.setPage)window.setPage("sharingAccess");setTimeout(function(){renderSharingAccess(friend.friendId);},0);},"button-primary"),button("Retirer",async function(){if(!window.confirm("Retirer "+friend.displayName+" de tes amis ?"))return;var result=await removeFriend(friend.friendshipId);if(result.error){manage.append(notice(result.error,"error"));return;}renderSharing(container,{force:true});},"sharing-action-danger")]));});layout.append(manage);
    var received=el("section","sharing-card wide sharing-received");received.append(el("h3","","Partagé avec moi"),el("p","","Tu peux seulement consulter ce que tes amis t’ont explicitement autorisé."));var hasAccess=false;data.friends.forEach(function(friend){var permissions=friend.receivedPermissions||defaults();if(!permissions.can_view_dashboard&&!permissions.can_view_sheet)return;hasAccess=true;var actions=[];if(permissions.can_view_dashboard)actions.push(button("Voir son dashboard",function(){viewShared(friend,"dashboard");}));if(permissions.can_view_sheet)actions.push(button("Voir son tableur",function(){viewShared(friend,"sheet");},"button-primary"));received.append(person(friend,accessLabel(permissions),actions));});if(!hasAccess)received.append(el("div","sharing-empty","Aucun ami ne partage encore de contenu avec toi."));layout.append(received);container.replaceChildren(layout);container.dataset.sharingReady="true";
  }
  window.FriendsSystem={loadFriends:loadFriends,renderSharing:renderSharing,renderSharingAccess:renderSharingAccess,sendFriendRequest:sendRequest,acceptFriend:function(id){return respond(id,true);},declineFriend:function(id){return respond(id,false);},removeFriend:removeFriend,loadFriendSnapshot:function(id){return loadShared(id,"sheet");},refreshMySharedSnapshots:refreshMySharedSnapshots};
})();

