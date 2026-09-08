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
  function notice(text,kind){var node=el("p","sf-notice"+(kind?" is-"+kind:""),text);node.setAttribute("role","status");return node;}
  function defaults(){return{can_view_dashboard:false,can_view_sheet:false,can_view_categories:false};}
  function money(value){if(window.GFI18n)return window.GFI18n.money(value);return Number(value||0).toLocaleString("fr-FR",{style:"currency",currency:"EUR"});}
  function normal(value){return String(value||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();}
  function snapshot(){try{return window.FinanceSheet&&window.FinanceSheet.getSnapshot?window.FinanceSheet.getSnapshot():null;}catch(e){return null;}}
  function yearOf(sheet){var match=String(sheet&&sheet.name||"").match(/(19\d{2}|20\d{2}|21\d{2})/);return match?Number(match[1]):0;}
  function idOf(sheet,index){return String(sheet&&sheet.id||("sheet-"+index));}
  function labelOf(sheet,row){var value=String(sheet&&sheet.rowHeaders&&sheet.rowHeaders[row]||"").trim();return "Ligne "+(row+1)+(value?" — "+value:"");}
  function headerOf(sheet,column){return String(sheet&&sheet.headers&&sheet.headers[column]||MONTHS[column]||column+1);}
  function rowHasData(sheet,row){if(String(sheet.rowHeaders&&sheet.rowHeaders[row]||"").trim())return true;return Object.keys(sheet.cells||{}).some(function(key){return key.indexOf(row+",")===0;});}
  function usefulRows(sheet){var rows=[],count=Math.max(Number(sheet&&sheet.rows||0),(sheet&&sheet.rowHeaders&&sheet.rowHeaders.length)||0);for(var row=0;row<count;row++)if(rowHasData(sheet,row))rows.push(row);return rows;}
  function invalidate(){cache={userId:"",data:null,pending:null};}
  function errorText(error,step){var message=String(error&&error.message||error||"").toLowerCase(),where=step?" pour "+step:"";if(/user_not_found/.test(message))return"Aucun utilisateur trouvé avec cet e-mail.";if(/cannot_add_self/.test(message))return"Tu ne peux pas t’ajouter toi-même.";if(/request_already_sent/.test(message))return"La demande a déjà été envoyée.";if(/request_already_received/.test(message))return"Cette personne t’a déjà envoyé une demande.";if(/already_friends/.test(message))return"Vous êtes déjà amis.";if(/friendship_not_accepted/.test(message))return"Cet accès ne peut être configuré qu’après acceptation réciproque de l’amitié.";if(/share_selection_required/.test(message))return"Choisis au moins un mois et une ligne avant d’activer le partage.";if(/save_friend_share_config|function .* does not exist/.test(message))return"La mise à jour sécurisée du partage doit être appliquée dans Supabase avant de continuer.";if(/row-level security|permission denied/.test(message))return"La base a refusé l’action"+where+". Applique le correctif de partage sécurisé dans Supabase.";if(/finance_shared_(sheet|dashboard)_snapshots|relation .* does not exist/.test(message))return"La migration Supabase du partage sécurisé n’est pas encore appliquée.";return"Impossible d’enregistrer cette action"+where+". Réessaie dans un instant.";}

  async function loadFriends(options){
    options=options||{};var client=sb(),me=user();if(!client||!me)return{friends:[],pending:[],sent:[]};
    if(!options.force&&cache.data&&cache.userId===me.id&&Date.now()-cache.loadedAt<30000)return cache.data;
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
            if(checks[0].error||checks[1].error)throw checks[0].error||checks[1].error;
            friend.permissions=checks[0].data||defaults();friend.receivedPermissions=checks[1].data||defaults();friends.push(friend);
          }else if(relation.status==="pending"){if(friend.isRequester)sent.push(friend);else pending.push(friend);}
        }));
        friends.sort(function(a,b){return a.displayName.localeCompare(b.displayName,"fr");});
        var data={friends:friends,pending:pending,sent:sent};friendsList=friends;pendingRequests=pending;sentRequests=sent;cache={userId:me.id,data:data,pending:null,loadedAt:Date.now()};return data;
      }catch(e){console.warn("loadFriends",e);return{friends:[],pending:[],sent:[],error:errorText(e)};}
    })();
    cache={userId:me.id,data:null,pending:work};var loaded=await work;if(loaded.error)invalidate();return loaded;
  }
  async function sendRequest(email){var client=sb(),me=user();if(!client||!me)return{error:"Connecte-toi pour envoyer une invitation."};if(!email||email.length<5||email.indexOf("@")===-1)return{error:"Saisis une adresse e-mail valide."};try{var result=await client.rpc("send_friend_request_by_email",{p_email:email.trim().toLowerCase()});if(result.error)return{error:errorText(result.error)};invalidate();return{success:true};}catch(e){return{error:errorText(e)};}}
  async function respond(id,accepted){var client=sb(),me=user();if(!client||!me)return{error:"Non connecté"};try{var result=await client.rpc("respond_to_friend_request",{p_friendship_id:id,p_accept:accepted});if(result.error)return{error:errorText(result.error)};invalidate();return{success:true};}catch(e){return{error:errorText(e)};}}
  async function removeFriend(id){
    var client=sb(),me=user(),relation=friendsList.concat(pendingRequests,sentRequests).find(function(item){return item.friendshipId===id;});if(!client||!me)return{error:"Non connecté"};if(!relation)return{error:"Relation introuvable"};
    try{var cleanup=await Promise.all([client.from("share_permissions").delete().eq("owner_id",me.id).eq("friend_id",relation.friendId),client.from("finance_shared_sheet_snapshots").delete().eq("owner_id",me.id).eq("friend_id",relation.friendId),client.from("finance_shared_dashboard_snapshots").delete().eq("owner_id",me.id).eq("friend_id",relation.friendId)]);if(cleanup.some(function(result){return result.error;}))return{error:"Impossible de retirer les autorisations de partage."};var result=await client.from("friendships").delete().eq("id",id);if(result.error)return{error:errorText(result.error)};invalidate();return{success:true};}catch(e){return{error:errorText(e)};}
  }
  async function loadRules(friendId){var client=sb(),me=user();if(!client||!me)throw new Error("Non connecté");var result=await client.from("share_permissions").select("year,month,row_key,allowed").eq("owner_id",me.id).eq("friend_id",friendId);if(result.error)throw result.error;return(result.data||[]).filter(function(rule){return rule.year!==null||rule.month!==null||rule.row_key!==null;});}
  function selectionFromRules(data,rules){var selection={};((data&&data.sheets)||[]).forEach(function(sheet,index){var id=idOf(sheet,index),year=yearOf(sheet);selection[id]={months:new Set(),rows:new Set()};(rules||[]).forEach(function(rule){if(!rule.allowed||Number(rule.year||0)!==year||String(rule.row_key||"").indexOf(id+":")!==0)return;selection[id].months.add(Number(rule.month)-1);var row=Number(String(rule.row_key).slice((id+":").length));if(Number.isInteger(row)&&row>=0)selection[id].rows.add(row);});});return selection;}
  function ruleCount(selection){return Object.keys(selection||{}).reduce(function(total,key){return total+selection[key].months.size*selection[key].rows.size;},0);}
  function buildRules(data,selection){var rules=[];((data&&data.sheets)||[]).forEach(function(sheet,index){var chosen=selection[idOf(sheet,index)];if(!chosen||!chosen.months.size||!chosen.rows.size)return;chosen.rows.forEach(function(row){chosen.months.forEach(function(column){rules.push({year:yearOf(sheet),month:column+1,row_key:idOf(sheet,index)+":"+row,allowed:true});});});});return rules;}
  function recompute(sheet){try{return window.FinanceSheet&&window.FinanceSheet.recompute?window.FinanceSheet.recompute(sheet.cells||{}):{};}catch(e){return{};}}
  function cellValue(result){if(!result||result.error||result.value===undefined||result.value===null)return"";var value=result.value;if(typeof value==="number"&&Number.isFinite(value))return value;return String(value).slice(0,500);}
  function buildTablePayload(data,selection){var sheets=[];((data&&data.sheets)||[]).forEach(function(sheet,index){var chosen=selection[idOf(sheet,index)];if(!chosen||!chosen.months.size||!chosen.rows.size)return;var columns=Array.from(chosen.months).sort(function(a,b){return a-b;}),rows=Array.from(chosen.rows).sort(function(a,b){return a-b;}),values=recompute(sheet),shared={name:String(sheet.name||"Feuille"),headers:columns.map(function(c){return headerOf(sheet,c);}),rowHeaders:rows.map(function(r){return labelOf(sheet,r);}),rows:rows.length,cols:columns.length,cells:{}};rows.forEach(function(sourceRow,localRow){columns.forEach(function(sourceCol,localCol){var value=cellValue(values[sourceRow+","+sourceCol]);if(value!=="")shared.cells[localRow+","+localCol]={raw:String(value)};});});sheets.push(shared);});return{v:"shared-sheet-v2",updatedAt:Date.now(),sheets:sheets};}
  function lineType(label){var value=normal(label);if(/epargne|livret|pea|placement|investissement/.test(value))return"savings";if(/salaire|revenu|prime|allocation|remuneration|paie|paye/.test(value))return"income";if(/depense|loyer|charge|facture|abonnement|course|frais|impot|taxe|assurance|transport|restaurant|achat|credit/.test(value))return"expense";return"other";}
  function numberValue(value){var result=typeof value==="number"?value:parseFloat(String(value).replace(",",".").replace(/[^0-9.-]/g,""));return Number.isFinite(result)?result:0;}
  function buildDashboardPayload(table){var months=[];(table.sheets||[]).forEach(function(sheet){for(var column=0;column<Number(sheet.cols||0);column++){var month={label:String(sheet.name||"Feuille")+" — "+String(sheet.headers&&sheet.headers[column]||MONTHS[column]||"Mois"),salary:0,expenses:0,savingsTotal:0,details:[]};for(var row=0;row<Number(sheet.rows||0);row++){var cell=sheet.cells&&sheet.cells[row+","+column];if(!cell)continue;var value=numberValue(cell.raw),label=String(sheet.rowHeaders&&sheet.rowHeaders[row]||("Ligne "+(row+1))),kind=lineType(label);month.details.push({name:label,value:value});if(kind==="income")month.salary+=value;else if(kind==="expense")month.expenses+=Math.abs(value);else if(kind==="savings")month.savingsTotal+=Math.abs(value);}if(month.details.length)months.push(month);}});return{v:"shared-dashboard-v2",updatedAt:Date.now(),months:months};}
  async function saveShare(friend,permissions,selection){
    var client=sb(),me=user(),data=snapshot();if(!client||!me)return{error:"Non connecté"};if((permissions.can_view_dashboard||permissions.can_view_sheet)&&(!data||!data.sheets||!data.sheets.length))return{error:"Ajoute d’abord des données à ton tableur."};
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
  var syncPending=null;
  async function refreshMySharedSnapshots(){
    if(syncPending)return syncPending;
    syncPending=(async function(){
      var data=snapshot(),client=sb(),me=user();if(!data||!client||!me)return;
      var friends=await loadFriends({force:true});
      for(var i=0;i<friends.friends.length;i++){
        try{
          var friend=friends.friends[i];if(!friend.permissions.can_view_sheet&&!friend.permissions.can_view_dashboard)continue;
          var rules=await loadRules(friend.friendId),selection=selectionFromRules(data,rules),table=buildTablePayload(data,selection);
          if(!user()||user().id!==me.id)return;
          var result=await client.rpc("refresh_friend_share_snapshots",{p_friend_id:friend.friendId,p_rules:buildRules(data,selection),p_sheet_payload:table,p_dashboard_payload:buildDashboardPayload(table)});
          if(result.error)console.warn("Synchronisation du partage différée",result.error.code||"");
        }catch(e){console.warn("Synchronisation du partage différée",e);}
      }
    })();
    try{return await syncPending;}finally{syncPending=null;}
  }
  async function loadShared(friendId,kind){var client=sb(),me=user();if(!client||!me)return{error:"Non connecté"};var table=kind==="dashboard"?"finance_shared_dashboard_snapshots":"finance_shared_sheet_snapshots";try{var result=await client.from(table).select("payload").eq("owner_id",friendId).eq("friend_id",me.id).maybeSingle();if(result.error)return{error:"Le chargement a échoué. Vérifie ta connexion puis réessaie."};if(!result.data||!result.data.payload)return{error:"Cet accès a peut-être été retiré, ou ton ami doit enregistrer à nouveau son partage."};return{payload:typeof result.data.payload==="string"?JSON.parse(result.data.payload):result.data.payload};}catch(e){return{error:errorText(e)};}}
  // Interface de partage : aucune écriture tant que l'accès n'est pas enregistré.
  var renderVersion=0,viewVersion=0,selectedTab="friends",nextMessage="",sharedDashboardDispose=null;
  function disposeSharedDashboard(){if(sharedDashboardDispose){sharedDashboardDispose();sharedDashboardDispose=null;}}
  function icon(name){
    var paths={
      people:'<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M22 21v-2a4 4 0 0 0-3-3.87"/><circle cx="9" cy="7" r="4"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
      plus:'<path d="M12 5v14M5 12h14"/>',
      arrow:'<path d="m9 18 6-6-6-6"/>',
      back:'<path d="m12 19-7-7 7-7M5 12h14"/>',
      lock:'<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3"/>',
      sheet:'<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18"/>',
      chart:'<path d="M3 3v18h18M7 14l4-5 4 3 5-7"/>',
      mail:'<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 6 9 7 9-7"/>',
      check:'<path d="m5 12 4 4L19 6"/>',
      close:'<path d="m6 6 12 12M6 18 18 6"/>',
      more:'<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
      refresh:'<path d="M20 7v5h-5M4 17v-5h5"/><path d="M6 6a8 8 0 0 1 13 2l1 4M4 12l1 4a8 8 0 0 0 13 2"/>'
    };
    var span=el("span","sf-icon");span.setAttribute("aria-hidden","true");
    span.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">'+(paths[name]||paths.arrow)+'</svg>';return span;
  }
  function action(text,handler,style,graphic){var node=button(text,handler);node.className="sf-button"+(style?" sf-"+style:"");if(graphic)node.prepend(icon(graphic));return node;}
  function tag(text,graphic,active){var node=el("span","sf-tag"+(active?" is-active":""),text);if(graphic)node.prepend(icon(graphic));return node;}
  function identity(friend,level){
    var root=el("div","sf-identity"),avatar=el("span","sf-avatar",String(friend.displayName||"A").trim().slice(0,2).toLocaleUpperCase("fr")),copy=el("div","sf-identity-copy");
    avatar.setAttribute("aria-hidden","true");copy.setAttribute("translate","no");copy.append(el(level||"h3","",friend.displayName),el("p","",friend.email));root.append(avatar,copy);return root;
  }
  function emptyState(title,description,graphic,cta){
    var root=el("div","sf-empty");root.append(icon(graphic||"people"),el("h3","",title),el("p","",description));if(cta)root.append(cta);return root;
  }
  function openDialog(title,description){
    var dialog=el("dialog","sf-dialog"),header=el("div","sf-dialog-head"),heading=el("h2","",title);
    heading.id="sharing-dialog-title";dialog.setAttribute("aria-labelledby",heading.id);
    header.append(heading,action("Fermer",function(){dialog.close();},"icon-button","close"));dialog.append(header,el("p","sf-muted",description));document.body.append(dialog);
    var previousOverflow=document.body.style.overflow;document.body.style.overflow="hidden";
    dialog.addEventListener("close",function(){document.body.style.overflow=previousOverflow;dialog.remove();},{once:true});dialog.showModal();return dialog;
  }
  function inviteDialog(container){
    var dialog=openDialog("Inviter un ami","Il doit déjà avoir un compte Gestion Finance. L’invitation apparaîtra dans son espace.");
    var form=el("form","sf-invite-form"),label=el("label","sf-field","Son adresse e-mail"),input=document.createElement("input"),feedback=el("div"),submit=action("Envoyer l’invitation",function(){},"primary","mail");
    input.type="email";input.required=true;input.placeholder="nom@exemple.fr";input.autocomplete="off";label.append(input);submit.type="submit";form.append(label,feedback,submit);
    form.addEventListener("submit",async function(event){event.preventDefault();submit.disabled=true;feedback.replaceChildren();var result=await sendRequest(input.value.trim());if(result.error){feedback.append(notice(result.error,"error"));submit.disabled=false;return;}dialog.close();selectedTab="invitations";nextMessage="Invitation envoyée.";renderSharing(container,{force:true});});
    dialog.append(form,el("p","sf-dialog-foot","Accepter une invitation ne donne accès à aucune donnée."));input.focus();
  }
  function confirmRemoval(friend,container,sent){
    var dialog=openDialog(sent?"Annuler cette invitation ?":"Retirer "+friend.displayName+" ?",sent?"Cette personne ne pourra plus accepter cette invitation.":"Les accès partagés entre vous seront retirés.");
    var feedback=el("div"),actions=el("div","sf-inline-actions"),confirm=action(sent?"Annuler l’invitation":"Retirer cet ami",async function(){
      confirm.disabled=true;var result=await removeFriend(friend.friendshipId);
      if(result.error){feedback.replaceChildren(notice(result.error,"error"));confirm.disabled=false;return;}
      dialog.close();nextMessage=sent?"Invitation annulée.":"Ami retiré.";renderSharing(container,{force:true});
    },"danger");
    actions.append(action("Conserver",function(){dialog.close();},"secondary"),confirm);dialog.append(feedback,actions);
  }
  function openAccess(friend){if(window.setPage)window.setPage("sharingAccess");renderSharingAccess(friend.friendId);}
  function friendCard(friend,container){
    var card=el("article","sf-friend"),head=el("header","sf-friend-head"),menu=el("details","sf-menu"),summary=el("summary","sf-icon-button");
    summary.setAttribute("aria-label","Options pour "+friend.displayName);summary.append(icon("more"));
    var popover=el("div","sf-menu-popover");popover.append(action("Retirer cet ami",function(){menu.open=false;confirmRemoval(friend,container,false);},"danger"));menu.append(summary,popover);head.append(identity(friend),menu);
    var outgoing=friend.permissions||defaults(),incoming=friend.receivedPermissions||defaults(),active=outgoing.can_view_sheet||outgoing.can_view_dashboard;
    var mine=el("div","sf-friend-mine"),label=el("div","sf-label-row"),chips=el("div","sf-inline-tags");label.append(el("span","sf-label","Ce que je partage"),tag(active?"Accès ouvert":"Privé",active?"check":"lock",active));
    if(outgoing.can_view_sheet)chips.append(tag("Tableur","sheet"));if(outgoing.can_view_dashboard)chips.append(tag("Tableau de bord","chart"));
    if(!active)chips.append(el("p","sf-muted","Aucune de tes données n’est visible."));
    mine.append(label,chips,action(active?"Modifier mon partage":"Choisir mon partage",function(){openAccess(friend);},"secondary","arrow"));
    var received=el("div","sf-friend-received");received.append(el("span","sf-label","Partagé avec moi"));
    var links=el("div","sf-view-links");
    if(incoming.can_view_sheet)links.append(action("Tableur",function(){viewShared(friend,"sheet");},"view-link","sheet"));
    if(incoming.can_view_dashboard)links.append(action("Tableau de bord",function(){viewShared(friend,"dashboard");},"view-link","chart"));
    if(!links.childElementCount)received.append(el("p","sf-muted","Pas encore de partage de sa part."));else received.append(links);
    card.append(head,mine,received);return card;
  }
  function closeSharedView(){
    disposeSharedDashboard();viewVersion++;var target=document.getElementById("sharedView"),home=document.getElementById("sharingContainer");
    if(target){target.hidden=true;target.replaceChildren();}if(home)home.hidden=false;
  }
  function viewHeader(container,friend,title){
    container.className="sf-shared";container.replaceChildren(action("Mes amis",closeSharedView,"back","back"));
    var header=el("header","sf-view-header"),copy=el("div");copy.append(el("p","sf-kicker",friend.displayName),el("h2","",title));header.append(copy,tag("Lecture seule","lock"));container.append(header);
  }
  function formatValue(value){return typeof value==="number"?value.toLocaleString("fr-FR",{maximumFractionDigits:2}):String(value||"—");}
  function renderSharedTable(container,data,friend){
    viewHeader(container,friend,"Tableur partagé");container.append(el("p","sf-muted","Seules les lignes et les mois autorisés par ton ami sont affichés."));
    var sheets=data&&data.sheets||[];
    if(!sheets.length){container.append(emptyState("Rien à afficher","Ton ami peut mettre à jour son partage depuis son espace.","sheet"));return;}
    sheets.forEach(function(sheet){
      var wrap=el("div","sf-table-scroll"),table=el("table","sf-table sf-read-table"),head=el("thead"),headRow=el("tr");
      table.append(el("caption","sf-sr-only","Tableur partagé : "+sheet.name));headRow.append(el("th","","Ligne"));for(var c=0;c<sheet.cols;c++)headRow.append(el("th","",sheet.headers[c]||MONTHS[c]));head.append(headRow);table.append(head);
      var body=el("tbody");for(var row=0;row<sheet.rows;row++){var line=el("tr"),label=el("th","",sheet.rowHeaders[row]||("Ligne "+(row+1)));label.scope="row";line.append(label);for(var col=0;col<sheet.cols;col++){var cell=sheet.cells&&sheet.cells[row+","+col];line.append(el("td","",cell&&cell.raw!==undefined?String(cell.raw):"—"));}body.append(line);}
      table.append(body);wrap.tabIndex=0;wrap.setAttribute("aria-label","Tableau défilant "+sheet.name);wrap.append(table);container.append(el("h3","sf-sheet-heading",sheet.name),wrap);
    });
  }
  function renderSharedDashboard(container,data,friend){
    viewHeader(container,friend,"Tableau de bord partagé");
    container.append(el("p","sf-muted","Les graphiques et les montants portent uniquement sur les données autorisées."));
    if(window.SharedDashboard)sharedDashboardDispose=window.SharedDashboard.render(container,data);
  }
  async function viewShared(friend,kind){
    disposeSharedDashboard();var version=++viewVersion,target=document.getElementById("sharedView"),home=document.getElementById("sharingContainer");if(!target)return;
    if(home)home.hidden=true;target.className="sf-shared";target.hidden=false;target.replaceChildren(action("Mes amis",closeSharedView,"back","back"),notice("Ouverture du partage…"));
    var result=await loadShared(friend.friendId,kind);if(version!==viewVersion)return;
    if(result.error){target.replaceChildren(action("Mes amis",closeSharedView,"back","back"),emptyState("Ce partage n’est pas disponible",result.error,"lock",action("Réessayer",function(){viewShared(friend,kind);},"secondary","refresh")));return;}
    if(kind==="dashboard")renderSharedDashboard(target,result.payload,friend);else renderSharedTable(target,result.payload,friend);target.tabIndex=-1;target.focus({preventScroll:true});target.scrollIntoView({block:"start"});
  }
  function describeColumns(sheet,columns){
    var cols=Array.from(columns).sort(function(a,b){return a-b;});
    if(cols.length>2&&cols.every(function(c,i){return !i||c===cols[i-1]+1;}))return headerOf(sheet,cols[0])+" à "+headerOf(sheet,cols[cols.length-1]);
    return cols.map(function(c){return headerOf(sheet,c);}).join(", ");
  }
  async function renderSharingAccess(friendId){
    var target=document.getElementById("sharingAccessContainer");if(!target)return;
    var version=++renderVersion;target.replaceChildren(notice("Chargement des autorisations…"));
    var data=await loadFriends(),friend=data.friends.find(function(item){return item.friendId===friendId;}),table=snapshot();if(version!==renderVersion)return;
    if(!friend){target.replaceChildren(emptyState("Ami indisponible","Retourne dans la liste de tes amis et réessaie.","people"));return;}
    var rules;try{rules=await loadRules(friend.friendId);}catch(error){target.replaceChildren(notice(errorText(error),"error"),action("Réessayer",function(){renderSharingAccess(friendId);},"secondary"));return;}
    if(version!==renderVersion)return;
    var selection=selectionFromRules(table,rules),permissions=Object.assign(defaults(),friend.permissions||{}),sheets=table&&table.sheets||[];
    // Les anciens numéros devenus absents ne doivent pas être réenregistrés.
    sheets.forEach(function(sheet,i){var chosen=selection[idOf(sheet,i)],rows=usefulRows(sheet);chosen.rows=new Set(Array.from(chosen.rows).filter(function(r){return rows.includes(r);}));chosen.months=new Set(Array.from(chosen.months).filter(function(c){return c>=0&&c<Math.min(12,Number(sheet.cols||12));}));});
    var fingerprint=function(){return JSON.stringify({sheet:!!permissions.can_view_sheet,dashboard:!!permissions.can_view_dashboard,rules:buildRules(table,selection).sort(function(a,b){return a.row_key.localeCompare(b.row_key)||a.month-b.month;})});};
    var initial=fingerprint(),saving=false,root=el("div","sf-access"),main=el("div","sf-access-main"),aside=el("aside","sf-summary"),feedback=el("div","sf-feedback-slot");
    var hero=el("header","sf-access-head");hero.append(identity(friend,"h2"),tag("Lecture seule","lock"));root.append(hero);
    function step(number,title,description){var header=el("div","sf-step-head"),copy=el("div");copy.append(el("h3","",title),el("p","sf-muted",description));header.append(el("span","sf-step-num",String(number)),copy);return header;}
    var scope=el("section","sf-section"),choices=el("div","sf-scope-options");scope.append(step(1,"Les écrans accessibles","Choisis ce que ton ami pourra ouvrir."));
    [["can_view_sheet","Tableur","Les cellules sélectionnées.","sheet"],["can_view_dashboard","Tableau de bord","Une synthèse de ces mêmes données.","chart"]].forEach(function(item){
      var label=el("label","sf-scope"),input=document.createElement("input"),copy=el("span","sf-scope-content"),texts=el("span");
      input.type="checkbox";input.checked=!!permissions[item[0]];texts.append(el("strong","",item[1]),el("small","",item[2]));copy.append(icon(item[3]),texts);label.append(input,copy);
      input.addEventListener("change",function(){permissions[item[0]]=input.checked;updateSummary();});choices.append(label);
    });scope.append(choices);main.append(scope);
    var dataset=el("section","sf-section sf-dataset");dataset.append(step(2,"Les données visibles","Coche les mois en haut et les lignes à gauche. Les cellules colorées seront partagées."));
    var tools=el("div","sf-table-tools"),pickerLabel=el("label","sf-field","Année / feuille"),picker=document.createElement("select"),host=el("div","sf-dataset-host");picker.setAttribute("aria-label","Année ou feuille à partager");
    sheets.forEach(function(sheet,i){var option=el("option","",sheet.name||("Feuille "+(i+1)));option.value=String(i);picker.append(option);});pickerLabel.append(picker);
    var clear=action("Effacer la sélection",function(){var state=selection[idOf(sheets[Number(picker.value)],Number(picker.value))];state.rows.clear();state.months.clear();syncDataset();},"clear","close");
    tools.append(pickerLabel,clear);dataset.append(tools,host);main.append(dataset);
    var summaryTitle=el("h3","","Résumé de l’accès"),summaryText=el("p","sf-summary-text"),summaryItems=el("div","sf-summary-items"),summaryStatus=tag("Aucun partage","lock"),countText=el("p","sf-summary-count"),save=action("Enregistrer l’accès",async function(){
      if(saving)return;saving=true;feedback.replaceChildren();updateSummary();root.querySelectorAll("input,select").forEach(function(n){n.disabled=true;});
      var result=await saveShare(friend,permissions,selection);saving=false;root.querySelectorAll("input,select").forEach(function(n){n.disabled=false;});
      if(result.error){feedback.append(notice(result.error,"error"));updateSummary();return;}
      nextMessage="L’accès de "+friend.displayName+" a été enregistré.";if(window.setPage)window.setPage("sharing");
    },"primary","check");
    var revoke=action("Retirer tous les accès",function(){permissions.can_view_sheet=false;permissions.can_view_dashboard=false;choices.querySelectorAll("input").forEach(function(input){input.checked=false;});updateSummary();},"text-danger","lock");
    aside.append(summaryStatus,summaryTitle,summaryText,summaryItems,countText,feedback,save,revoke,el("p","sf-footnote","Tes modifications s’appliquent après l’enregistrement."));
    var layout=el("div","sf-access-layout");layout.append(main,aside);root.append(layout);
    var cellEntries=[],rowInputs=[],colInputs=[],allRows,allCols,datasetCount;
    function updateSummary(){
      var active=permissions.can_view_sheet||permissions.can_view_dashboard,cells=ruleCount(selection),configured=[];
      sheets.forEach(function(sheet,i){var state=selection[idOf(sheet,i)];if(state&&state.rows.size&&state.months.size)configured.push({sheet:sheet,state:state});});
      summaryStatus.replaceChildren(icon(active&&cells?"check":"lock"),document.createTextNode(active&&cells?"Sélection prête":"Aucun partage"));summaryStatus.classList.toggle("is-active",!!active&&!!cells);
      summaryText.textContent=!active?friend.displayName+" ne pourra consulter aucune de tes données.":!cells?"Choisis au moins un mois et une ligne à partager.":friend.displayName+" pourra consulter :";
      summaryItems.replaceChildren();
      if(active)configured.forEach(function(item){var entry=el("div","sf-summary-item");entry.append(el("strong","",item.sheet.name||"Feuille"),el("span","",item.state.rows.size+" ligne"+(item.state.rows.size>1?"s":"")+" · "+describeColumns(item.sheet,item.state.months)));summaryItems.append(entry);});
      countText.textContent=active&&cells?(permissions.can_view_sheet&&permissions.can_view_dashboard?"Tableur et tableau de bord":permissions.can_view_sheet?"Tableur":"Tableau de bord")+" · lecture seule":"";
      save.disabled=saving||!!(active&&!cells)||fingerprint()===initial;save.lastChild.textContent=saving?"Enregistrement…":"Enregistrer l’accès";
      revoke.hidden=!active;revoke.disabled=saving;clear.disabled=saving||!sheets.length;
      dataset.classList.toggle("is-inactive",!active);cellEntries.forEach(function(item){item.node.classList.toggle("is-shared",!!active&&item.state.rows.has(item.row)&&item.state.months.has(item.col));});
    }
    function syncDataset(){
      if(!sheets.length){updateSummary();return;}var index=Number(picker.value),sheet=sheets[index],state=selection[idOf(sheet,index)];
      rowInputs.forEach(function(entry){entry.input.checked=state.rows.has(entry.value);entry.label.classList.toggle("is-picked",entry.input.checked);});
      colInputs.forEach(function(entry){entry.input.checked=state.months.has(entry.value);entry.label.classList.toggle("is-picked",entry.input.checked);});
      allRows.checked=!!rowInputs.length&&state.rows.size===rowInputs.length;allRows.indeterminate=state.rows.size>0&&!allRows.checked;
      allCols.checked=!!colInputs.length&&state.months.size===colInputs.length;allCols.indeterminate=state.months.size>0&&!allCols.checked;
      datasetCount.textContent=state.rows.size+" ligne"+(state.rows.size>1?"s":"")+" · "+state.months.size+" mois";updateSummary();
    }
    function renderDataset(){
      var index=Number(picker.value),sheet=sheets[index];cellEntries=[];rowInputs=[];colInputs=[];
      if(!sheet){host.replaceChildren(emptyState("Ton tableur est vide","Ajoute tes données dans le tableur avant de choisir celles à partager.","sheet"));tools.hidden=true;updateSummary();return;}
      var state=selection[idOf(sheet,index)],available=usefulRows(sheet),cols=Math.min(12,Number(sheet.cols||12)),values=recompute(sheet);
      var bulk=el("div","sf-table-bulk");function bulkCheck(text,change){var label=el("label","sf-check-label"),input=document.createElement("input");input.type="checkbox";input.addEventListener("change",function(){change(input.checked);syncDataset();});label.append(input,document.createTextNode(text));bulk.append(label);return input;}
      allRows=bulkCheck("Toutes les lignes",function(checked){state.rows=checked?new Set(available):new Set();});
      allCols=bulkCheck("Tous les mois",function(checked){state.months=checked?new Set(Array.from({length:cols},function(_,i){return i;})):new Set();});
      datasetCount=el("span","sf-table-count");bulk.append(datasetCount);
      var scroll=el("div","sf-table-scroll"),grid=el("table","sf-table sf-picker-table"),head=el("thead"),tr=el("tr"),corner=el("th","sf-corner","Lignes / mois");
      grid.append(el("caption","sf-sr-only","Sélection des lignes et des mois de "+sheet.name));tr.append(corner);
      for(var column=0;column<cols;column++){(function(c){var th=el("th"),label=el("label","sf-col-check"),input=document.createElement("input");th.scope="col";input.type="checkbox";input.setAttribute("aria-label","Partager le mois "+headerOf(sheet,c));
        label.append(input,el("span","",headerOf(sheet,c)));th.append(label);input.addEventListener("change",function(){if(input.checked)state.months.add(c);else state.months.delete(c);syncDataset();});colInputs.push({input:input,label:th,value:c});tr.append(th);})(column);}
      head.append(tr);grid.append(head);var body=el("tbody");
      available.forEach(function(r){var line=el("tr"),th=el("th"),label=el("label","sf-row-check"),input=document.createElement("input");th.scope="row";input.type="checkbox";input.setAttribute("aria-label","Partager "+labelOf(sheet,r));input.addEventListener("change",function(){if(input.checked)state.rows.add(r);else state.rows.delete(r);syncDataset();});
        label.append(input,el("span","sf-row-number",String(r+1)),el("span","sf-user-label",String(sheet.rowHeaders&&sheet.rowHeaders[r]||("Ligne "+(r+1)))));th.append(label);line.append(th);rowInputs.push({input:input,label:th,value:r});
        for(var c=0;c<cols;c++){var value=cellValue(values[r+","+c]),td=el("td","",value===""?"—":formatValue(value));cellEntries.push({node:td,row:r,col:c,state:state});line.append(td);}body.append(line);
      });
      grid.append(body);scroll.append(grid);scroll.tabIndex=0;scroll.setAttribute("aria-label","Aperçu du tableur, défilement horizontal et vertical");
      var legend=el("p","sf-table-legend");legend.append(el("span","sf-legend-swatch"),document.createTextNode("Cellules partagées"),el("span","sf-scroll-hint","Fais défiler pour voir les autres mois →"));
      host.replaceChildren(bulk,available.length?scroll:emptyState("Aucune ligne renseignée","Cette feuille ne contient pas encore de données.","sheet"),legend);syncDataset();
    }
    picker.addEventListener("change",renderDataset);target.replaceChildren(root);renderDataset();
  }
  async function renderSharing(container,options){
    options=options||{};if(!container)return;container.hidden=false;closeSharedView();var me=user();
    if(!me){container.dataset.sharingReady="";container.replaceChildren(emptyState("Tes finances, à partager avec tes proches","Connecte-toi pour inviter un ami et choisir ce qu’il peut consulter.","people",action("Se connecter",function(){if(window.setPage)window.setPage("settings");},"primary")));return;}
    if(!options.force&&container.dataset.sharingReady===me.id&&container._sharingData===cache.data&&cache.data&&Date.now()-cache.loadedAt<30000)return;
    var version=++renderVersion,started=Date.now();if(!container.childElementCount)container.replaceChildren(notice("Chargement de tes amis…"));
    var data=await loadFriends({force:!!options.force});
    if(options.animated&&Date.now()-started<450)await new Promise(function(resolve){setTimeout(resolve,450-(Date.now()-started));});
    if(version!==renderVersion||!user()||user().id!==me.id)return;
    var shell=el("div","sf-shell"),toolbar=el("div","sf-toolbar"),tabs=el("div","sf-tabs"),content=el("div","sf-tab-content"),refresh=action("Actualiser",function(){window.GFUI.withBusy(refresh,function(){return renderSharing(container,{force:true,animated:true});});},"icon-button","refresh");tabs.setAttribute("role","tablist");tabs.setAttribute("aria-label","Amis et invitations");
    var friendsTab=action("Mes amis",function(){chooseTab("friends");}),invitesTab=action("Invitations",function(){chooseTab("invitations");});
    [[friendsTab,"friends",data.friends.length],[invitesTab,"invitations",data.pending.length+data.sent.length]].forEach(function(item){item[0].className="sf-tab";item[0].id="sf-tab-"+item[1];item[0].setAttribute("role","tab");item[0].setAttribute("aria-controls","sf-panel-"+item[1]);item[0].append(el("span","sf-tab-count",String(item[2])));tabs.append(item[0]);});
    tabs.addEventListener("keydown",function(event){if(["ArrowLeft","ArrowRight","Home","End"].includes(event.key)){event.preventDefault();var next=event.key==="Home"?"friends":event.key==="End"?"invitations":selectedTab==="friends"?"invitations":"friends";chooseTab(next);(next==="friends"?friendsTab:invitesTab).focus();}});
    var buttons=el("div","sf-toolbar-actions");buttons.append(refresh,action("Inviter un ami",function(){inviteDialog(container);},"primary","plus"));toolbar.append(tabs,buttons);shell.append(toolbar);
    if(nextMessage){shell.append(notice(nextMessage,"success"));nextMessage="";}
    if(data.error)shell.append(notice(data.error,"error"));
    var friendPanel=el("section","sf-friend-grid"),invitationPanel=el("section","sf-invitations");
    friendPanel.id="sf-panel-friends";invitationPanel.id="sf-panel-invitations";[friendPanel,invitationPanel].forEach(function(panel){panel.setAttribute("role","tabpanel");panel.setAttribute("aria-labelledby",panel.id.replace("panel","tab"));});
    data.friends.forEach(function(friend){friendPanel.append(friendCard(friend,container));});
    if(!data.friends.length)friendPanel.append(emptyState("Un premier ami, quand tu veux","Partage quelques lignes ou plusieurs mois. Tu choisis, et tu peux changer d’avis à tout moment.","people",action("Inviter un ami",function(){inviteDialog(container);},"secondary","plus")));
    function requestSection(title,items,sent){
      var section=el("section","sf-request-section");section.append(el("h3","sf-section-title",title));
      items.forEach(function(friend){var row=el("article","sf-request"),actions=el("div","sf-inline-actions"),feedback=el("div");
        if(sent){actions.append(tag("En attente"),action("Annuler",function(){confirmRemoval(friend,container,true);},"text"));}
        else{
          async function respondOnce(accepted){actions.querySelectorAll("button").forEach(function(b){b.disabled=true;});var result=await respond(friend.friendshipId,accepted);if(result.error){feedback.replaceChildren(notice(result.error,"error"));actions.querySelectorAll("button").forEach(function(b){b.disabled=false;});return;}nextMessage=accepted?"Invitation acceptée. Tu peux maintenant choisir ton partage.":"Invitation refusée.";renderSharing(container,{force:true});}
          actions.append(action("Accepter",function(){respondOnce(true);},"primary","check"),action("Refuser",function(){respondOnce(false);},"text"));
        }row.append(identity(friend),actions,feedback);section.append(row);
      });return section;
    }
    if(data.pending.length)invitationPanel.append(requestSection("À toi de répondre",data.pending,false));if(data.sent.length)invitationPanel.append(requestSection("Invitations envoyées",data.sent,true));
    if(!data.pending.length&&!data.sent.length)invitationPanel.append(emptyState("Tu es à jour","Les nouvelles invitations apparaîtront ici.","mail"));
    content.append(friendPanel,invitationPanel);shell.append(content);
    var privacy=el("p","sf-privacy");privacy.append(icon("lock"),document.createTextNode("Aucun partage par défaut. Tes amis peuvent consulter uniquement ce que tu autorises."));shell.append(privacy);
    function chooseTab(name){selectedTab=name;friendPanel.hidden=name!=="friends";invitationPanel.hidden=name!=="invitations";[[friendsTab,"friends"],[invitesTab,"invitations"]].forEach(function(item){var active=item[1]===name;item[0].setAttribute("aria-selected",String(active));item[0].tabIndex=active?0:-1;});}
    chooseTab(selectedTab);container.replaceChildren(shell);container.dataset.sharingReady=me.id;container._sharingData=data;
  }
  window.FriendsSystem={loadFriends:loadFriends,renderSharing:renderSharing,renderSharingAccess:renderSharingAccess,sendFriendRequest:sendRequest,acceptFriend:function(id){return respond(id,true);},declineFriend:function(id){return respond(id,false);},removeFriend:removeFriend,loadFriendSnapshot:function(id){return loadShared(id,"sheet");},refreshMySharedSnapshots:refreshMySharedSnapshots};
})();
