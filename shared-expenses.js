/* Dépenses partagées entre amis : qui doit combien à qui.
   - Sur chaque carte d'ami (page Partage) : le solde, « Ajouter une dépense », « Historique », « Marquer comme remboursé ».
   - Dans la barre d'outils : une dépense partagée avec plusieurs amis à la fois.
   Les montants passent uniquement par les fonctions sécurisées de Supabase (amis acceptés seulement).
   Meuniance ne fait aucun paiement : c'est un carnet de comptes entre amis. */
(function(){
  "use strict";
  var MAX_CENTS=1000000,cache={at:0,user:"",data:null,pending:null};

  /* ── Calculs (testés) ─────────────────────────── */
  function parseCents(value){
    var s=String(value==null?"":value).replace(/[\s  €]/g,"");
    if(!/^\d{1,5}([.,]\d{0,2})?$/.test(s))return 0;
    var parts=s.replace(",",".").split("."),cents=Number(parts[0])*100+Number(((parts[1]||"")+"00").slice(0,2));
    return cents>=1&&cents<=MAX_CENTS?cents:0;
  }
  // Part de chaque ami : à parts égales (moi compris) ou la totalité (un seul ami).
  function shareOf(total,count,split){if(!total||count<1)return 0;return split==="full"?total:Math.round(total/(count+1));}
  // Effet sur mon solde (positif = on me doit).
  function effect(total,count,payer,split){var share=shareOf(total,count,split);return payer==="friend"?-share:share*count;}

  /* ── Accès aux données ────────────────────────── */
  function sb(){try{return window.__account&&window.__account.client||null;}catch(e){return null;}}
  function me(){try{return window.__account&&window.__account.user||null;}catch(e){return null;}}
  function ui(){return window.FriendsSystem&&window.FriendsSystem.ui;}
  // Textes FR/EN dans le code : les phrases contiennent des noms d'amis (translate="no"), le dictionnaire de i18n.js ne les voit pas.
  function en(){return !!(window.GFI18n&&window.GFI18n.getLanguage&&window.GFI18n.getLanguage()==="en");}
  function t2(fr,eng){return en()?eng:fr;}
  // Petit grain qui cherche, posé dans une ligne de texte (meuni-loader.js) ; « … » si le script manque.
  function spinner(label){var L=window.MeuniLoader;if(L&&L.inline)return L.inline(label,{size:"sm"});var n=document.createElement("span");n.textContent="…";n.setAttribute("aria-label",label);return n;}
  function money(cents){var v=Number(cents||0)/100;if(window.GFI18n&&window.GFI18n.money)return window.GFI18n.money(v);return v.toLocaleString("fr-FR",{style:"currency",currency:"EUR"});}
  function errorText(error){
    var m=String(error&&error.message||error||"").toLowerCase();
    if(/not_friends/.test(m))return t2("Vous devez être amis pour partager une dépense.","You need to be friends to share an expense.");
    if(/invalid_label/.test(m))return t2("Donne un nom à la dépense (60 caractères au plus).","Give the expense a name (60 characters max).");
    if(/invalid_amount/.test(m))return t2("Le montant doit être compris entre 0,01 € et 10 000 €.","The amount must be between €0.01 and €10,000.");
    if(/too_many/.test(m))return t2("Beaucoup de dépenses ajoutées aujourd’hui. Réessaie demain.","Lots of expenses added today. Try again tomorrow.");
    if(/nothing_to_settle/.test(m))return t2("Vous êtes déjà quittes.","You’re already even.");
    if(/only_creditor/.test(m))return t2("C’est la personne remboursée qui confirme le remboursement.","The person who was paid back confirms the repayment.");
    if(/does not exist|could not find the function|pgrst202/.test(m))return t2("Les dépenses partagées ne sont pas encore disponibles. Réessaie plus tard.","Shared expenses aren’t available yet. Try again later.");
    return t2("L’action n’a pas abouti. Vérifie ta connexion puis réessaie.","That didn’t work. Check your connection and try again.");
  }
  function balances(force){
    var client=sb(),u=me();if(!client||!u)return Promise.resolve({});
    if(!force&&cache.user===u.id&&cache.data&&Date.now()-cache.at<20000)return Promise.resolve(cache.data);
    if(!force&&cache.pending&&cache.user===u.id)return cache.pending;
    cache.user=u.id;
    cache.pending=client.rpc("get_shared_balances").then(function(res){
      var map={};if(res.error)throw res.error;
      (res.data||[]).forEach(function(r){map[r.friend_id]={net:Number(r.net_cents)||0,entries:Number(r.entries)||0,last:r.last_at};});
      cache.data=map;cache.at=Date.now();cache.pending=null;return map;
    }).catch(function(e){cache.pending=null;return{__error:errorText(e)};});
    return cache.pending;
  }
  function changed(){cache.at=0;cache.data=null;refreshAll();}

  /* ── Bloc « Comptes » sur la carte d'un ami ────── */
  var mounted=[];
  function mount(slot,friend){
    var u=ui();if(!u||!slot||!friend||!friend.friendId)return;
    slot.className="sf-friend-split";slot.dataset.friendId=friend.friendId;
    track(slot,friend);
    if(!slot.childElementCount){var head=u.el("div","sf-label-row");head.append(u.el("span","sf-label",t2("Comptes entre vous","Your balance together")));var wait=u.el("p","sfx-status sfx-loading");wait.append(spinner(t2("Chargement des comptes…","Loading balances…")));slot.append(head,wait);}
    balances(false).then(function(map){fill(slot,friend,map);});
  }
  // Les cartes sont créées avant d'être mises dans la page : on ne trie les anciennes qu'au rafraîchissement.
  function track(slot,data){mounted=mounted.filter(function(m){return m.slot!==slot;});mounted.push({slot:slot,friend:data});if(mounted.length>60)mounted=mounted.filter(function(m){return m.slot.isConnected;});}
  function refreshAll(){balances(true).then(function(map){mounted=mounted.filter(function(m){return m.slot.isConnected;});mounted.forEach(function(m){if(Array.isArray(m.friend))fillOverview(m.slot,m.friend,map);else fill(m.slot,m.friend,map);});});}

  /* ── Bandeau récapitulatif en haut de la liste d'amis ── */
  function overview(friends){
    var u=ui();if(!u||!friends||!friends.length)return null;
    var root=u.el("section","sfx-overview");root.setAttribute("aria-label",t2("Dépenses entre amis","Expenses with friends"));
    track(root,friends);fillOverview(root,friends,null);
    balances(false).then(function(map){fillOverview(root,friends,map);});
    return root;
  }
  function fillOverview(root,friends,map){
    var u=ui();if(!u)return;
    var copy=u.el("div","sfx-overview-copy"),title=u.el("h3","",t2("Dépenses entre amis","Expenses with friends")),line=u.el("p","sfx-overview-line");
    var ids={};friends.forEach(function(f){ids[f.friendId]=1;});
    var owed=0,owe=0,any=false;
    if(map&&!map.__error)Object.keys(map).forEach(function(id){if(!ids[id])return;var n=map[id].net;if(map[id].entries)any=true;if(n>0)owed+=n;else owe-=n;});
    if(!map)line.append(spinner(t2("Chargement des comptes…","Loading balances…")));
    else if(map.__error)line.textContent=map.__error;
    else if(owed||owe){
      if(owed){var a=u.el("span","sfx-pill is-plus");a.append(document.createTextNode(t2("On te doit ","You’re owed ")),u.el("strong","",money(owed)));line.append(a);}
      if(owe){var b=u.el("span","sfx-pill is-minus");b.append(document.createTextNode(t2("Tu dois ","You owe ")),u.el("strong","",money(owe)));line.append(b);}
    }
    else line.textContent=any?t2("Tout est réglé entre vous.","You’re all settled up."):t2("Une addition, des courses, des vacances : note qui a payé, Meuniance calcule qui doit combien.","A bill, groceries, a trip: note who paid, Meuniance works out who owes what.");
    copy.append(title,line);
    root.replaceChildren(copy,u.action(t2("Nouvelle dépense","New expense"),function(){openAdd(friends,null);},"primary","plus"));
  }
  function fill(slot,friend,map){
    var u=ui();if(!u||!slot.isConnected)return;
    var name=friend.displayName||t2("Ton ami","Your friend"),head=u.el("div","sf-label-row"),status=u.el("p","sfx-status"),acts=u.el("div","sfx-actions");
    head.append(u.el("span","sf-label",t2("Comptes entre vous","Your balance together")));
    if(map&&map.__error){slot.replaceChildren(head,u.el("p","sf-muted",map.__error));return;}
    var b=map&&map[friend.friendId]||{net:0,entries:0},net=b.net,amount=u.el("strong","sfx-amount",money(Math.abs(net)));
    if(net>0){status.classList.add("is-plus");status.append(document.createTextNode(name+t2(" te doit "," owes you ")),amount);}
    else if(net<0){status.classList.add("is-minus");status.append(document.createTextNode(t2("Tu dois ","You owe ")),amount,document.createTextNode(t2(" à "," to ")+name));}
    else{status.classList.add("is-even");status.textContent=b.entries?t2("Vous êtes quittes","You’re even"):t2("Aucune dépense partagée pour l’instant","No shared expenses yet");}
    status.setAttribute("translate","no");
    acts.append(u.action(t2("Ajouter une dépense","Add an expense"),function(){openAdd([friend],friend);},"secondary","plus"));
    if(b.entries)acts.append(u.action(t2("Historique","History"),function(){openHistory(friend);},"text"));
    // Seule la personne remboursée confirme le remboursement (celle qui doit ne peut pas effacer sa dette).
    if(net>0)acts.append(u.action(t2("Marquer comme remboursé","Mark as paid back"),function(){openSettle(friend,net);},"text"));
    else if(net<0){var hint=u.el("small","sfx-hint",t2("Quand tu l’auras remboursé, "+name+" le marquera de son côté.","Once you’ve paid them back, "+name+" will mark it on their side."));hint.setAttribute("translate","no");acts.append(hint);}
    slot.replaceChildren(head,status,acts);
  }

  /* ── Ajouter une dépense ──────────────────────── */
  function seg(u,name,options,value,onChange){
    var root=u.el("div","sfx-seg");root.setAttribute("role","radiogroup");
    options.forEach(function(o){var b=u.el("button","sfx-seg-btn",o[1]);b.type="button";b.setAttribute("role","radio");b.dataset.value=o[0];b.addEventListener("click",function(){set(o[0]);onChange(o[0]);});root.append(b);});
    function set(v){root.dataset.value=v;root.querySelectorAll(".sfx-seg-btn").forEach(function(b){b.setAttribute("aria-checked",String(b.dataset.value===v));});}
    set(value);root.set=set;root.setAttribute("aria-label",name);return root;
  }
  function openAdd(friends,preset){
    var u=ui();if(!u||!friends||!friends.length)return;
    var dlg=u.openDialog(t2("Nouvelle dépense partagée","New shared expense"),t2("Note qui a payé : Meuniance calcule qui doit combien. Ton ami voit la même dépense de son côté.","Note who paid: Meuniance works out who owes what. Your friend sees the same expense on their side."));
    dlg.classList.add("sfx-dialog");
    var form=u.el("form","sfx-form"),state={payer:"me",split:"equal",chosen:new Set(preset?[preset.friendId]:(friends.length===1?[friends[0].friendId]:[]))};
    var what=u.el("label","sf-field",t2("Pour quoi ?","What for?")),label=document.createElement("input");label.type="text";label.maxLength=60;label.required=true;label.placeholder=t2("Restaurant, courses, vacances…","Restaurant, groceries, holiday…");label.autocomplete="off";what.append(label);
    var howMuch=u.el("label","sf-field",t2("Montant total","Total amount")),amountWrap=u.el("span","sfx-money"),amount=document.createElement("input");amount.type="text";amount.inputMode="decimal";amount.required=true;amount.placeholder=t2("0,00","0.00");amount.autocomplete="off";amountWrap.append(amount,u.el("span","sfx-euro","€"));howMuch.append(amountWrap);
    var who=u.el("fieldset","sfx-who"),whoLegend=u.el("legend","sf-field",t2("Avec qui ?","With whom?")),list=u.el("div","sfx-people");who.append(whoLegend,list);
    friends.forEach(function(f){
      var lab=u.el("label","sfx-person"),box=document.createElement("input");box.type="checkbox";box.value=f.friendId;box.checked=state.chosen.has(f.friendId);
      box.addEventListener("change",function(){if(box.checked)state.chosen.add(f.friendId);else state.chosen.delete(f.friendId);sync();});
      var nm=u.el("span","",f.displayName||t2("Ami","Friend"));nm.setAttribute("translate","no");lab.append(box,nm);list.append(lab);
    });
    if(friends.length===1)who.hidden=true;
    var payerRow=u.el("div","sfx-row"),splitRow=u.el("div","sfx-row");
    var payer=seg(u,t2("Qui a payé ?","Who paid?"),[["me",t2("Moi","Me")],["friend",t2("Mon ami","My friend")]],"me",function(v){state.payer=v;sync();});
    var split=seg(u,t2("Comment partager ?","How to split?"),[["equal",t2("Moitié chacun","Half each")],["full",t2("Tout pour l’autre","All for the other")]],"equal",function(v){state.split=v;sync();});
    payerRow.append(u.el("span","sf-field",t2("Qui a payé ?","Who paid?")),payer);splitRow.append(u.el("span","sf-field",t2("Comment partager ?","How to split?")),split);
    var summary=u.el("p","sfx-summary"),feedback=u.el("div"),submit=u.action(t2("Ajouter","Add"),function(){},"primary","check");submit.type="submit";
    summary.setAttribute("aria-live","polite");
    function chosenFriends(){return friends.filter(function(f){return state.chosen.has(f.friendId);});}
    function sync(){
      var picked=chosenFriends(),one=picked.length===1,other=one?picked[0].displayName||t2("Mon ami","My friend"):t2("Mon ami","My friend");
      payer.querySelector('[data-value="friend"]').textContent=one?other:t2("Un ami","A friend");
      split.querySelector('[data-value="full"]').textContent=state.payer==="me"?(one?t2("Tout pour ","All for ")+other:t2("Tout pour l’autre","All for the other")):t2("Tout pour moi","All for me");
      payerRow.hidden=splitRow.hidden=!one;
      if(!one){state.payer="me";state.split="equal";payer.set("me");split.set("equal");}
      var total=parseCents(amount.value),n=picked.length;
      if(!n){summary.textContent=t2("Choisis au moins un ami.","Pick at least one friend.");}
      else if(!total){summary.textContent=n>1?t2("Le montant sera partagé entre vous "+(n+1)+".","The amount will be split between the "+(n+1)+" of you."):"";}
      else{
        var share=shareOf(total,n,state.split);
        if(state.payer==="friend")summary.textContent=t2("Tu devras "+money(share)+" à "+other+".","You’ll owe "+other+" "+money(share)+".");
        else if(n===1)summary.textContent=other+t2(" te devra "," will owe you ")+money(share)+(state.split==="equal"?t2(" (la moitié)."," (half)."):".");
        else summary.textContent=t2("Chacun te devra "+money(share)+", soit "+money(share*n)+" au total.","Each will owe you "+money(share)+", "+money(share*n)+" in total.");
      }
      submit.disabled=!n;
    }
    amount.addEventListener("input",sync);
    form.append(what,howMuch,who,payerRow,splitRow,summary,feedback,submit);dlg.append(form);
    form.addEventListener("submit",async function(e){
      e.preventDefault();feedback.replaceChildren();
      var picked=chosenFriends(),total=parseCents(amount.value),text=label.value.trim();
      if(!text){feedback.append(u.notice(t2("Donne un nom à la dépense.","Give the expense a name."),"error"));label.focus();return;}
      if(!total){feedback.append(u.notice(t2("Saisis un montant entre 0,01 € et 10 000 €.","Enter an amount between €0.01 and €10,000."),"error"));amount.focus();return;}
      if(!picked.length)return;
      var client=sb();if(!client||!me()){feedback.append(u.notice(t2("Connecte-toi pour partager une dépense.","Sign in to share an expense."),"error"));return;}
      submit.disabled=true;
      try{
        var res=await client.rpc("add_shared_expense",{p_friend_ids:picked.map(function(f){return f.friendId;}),p_total_cents:total,p_label:text,p_payer:state.payer,p_split:state.split});
        if(res.error)throw res.error;
        dlg.close();toast(t2("Dépense ajoutée","Expense added"));changed();
      }catch(err){feedback.append(u.notice(errorText(err),"error"));submit.disabled=false;}
    });
    sync();setTimeout(function(){label.focus();},50);
  }

  /* ── Historique ───────────────────────────────── */
  function dateText(iso){try{return new Date(iso).toLocaleDateString(document.documentElement.lang==="en"?"en-GB":"fr-FR",{day:"numeric",month:"short"});}catch(e){return"";}}
  async function openHistory(friend){
    var u=ui(),client=sb();if(!u||!client)return;
    var name=friend.displayName||t2("ton ami","your friend"),dlg=u.openDialog(t2("Avec ","With ")+name,t2("Les 50 dernières lignes. Tu peux retirer une dépense que tu as ajoutée pendant 30 jours.","The last 50 entries. You can remove an expense you added for 30 days."));
    dlg.classList.add("sfx-dialog");dlg.querySelector("h2").setAttribute("translate","no");// contient le nom de l’ami
    var box=u.el("div","sfx-history");box.append(u.loading?u.loading(t2("Chargement de l’historique…","Loading history…"),{height:160}):u.notice(t2("Chargement…","Loading…")));dlg.append(box);
    async function load(){
      var res;try{res=await client.rpc("get_shared_entries",{p_friend_id:friend.friendId});}catch(e){res={error:e};}
      if(!dlg.isConnected)return;
      if(res.error){box.replaceChildren(u.notice(errorText(res.error),"error"));return;}
      var rows=res.data||[];if(!rows.length){box.replaceChildren(u.el("p","sf-muted",t2("Rien pour l’instant.","Nothing yet.")));return;}
      var ul=u.el("ul","sfx-list");
      rows.forEach(function(r){
        var li=u.el("li","sfx-line"+(r.kind==="remboursement"?" is-settle":"")),main=u.el("div","sfx-line-main"),title=u.el("strong","",r.label),sub=u.el("small","");
        title.setAttribute("translate","no");
        var who=r.kind==="remboursement"?t2("Remboursement","Repayment"):(r.owes_me?t2("Tu as payé","You paid"):name+t2(" a payé"," paid"))+(r.total_cents?" "+money(r.total_cents):"");
        sub.textContent=dateText(r.created_at)+" · "+who;sub.setAttribute("translate","no");
        main.append(title,sub);
        var val=u.el("span","sfx-line-amt "+(r.owes_me?"is-plus":"is-minus"),(r.owes_me?"+":"−")+money(r.amount_cents));val.title=r.owes_me?name+t2(" te doit ce montant"," owes you this amount"):t2("Tu dois ce montant","You owe this amount");
        li.append(main,val);
        var age=Date.now()-new Date(r.created_at).getTime();
        if(r.mine&&age<30*864e5){
          var rm=u.action(t2("Retirer","Remove"),async function(){
            if(rm.dataset.confirm!=="1"){rm.dataset.confirm="1";rm.lastChild.textContent=t2("Confirmer","Confirm");rm.classList.add("sf-text-danger");return;}
            rm.disabled=true;var out;try{out=await client.rpc("remove_shared_entry",{p_id:r.id});}catch(e){out={error:e};}
            if(out.error||!out.data){rm.disabled=false;box.prepend(u.notice(out.error?errorText(out.error):t2("Cette ligne ne peut plus être retirée.","This entry can no longer be removed."),"error"));return;}
            changed();load();
          },"text");
          rm.classList.add("sfx-remove");li.append(rm);
        }
        ul.append(li);
      });
      box.replaceChildren(ul);
    }
    load();
  }

  /* ── Remboursement ────────────────────────────── */
  function openSettle(friend,net){
    var u=ui(),client=sb();if(!u||!client)return;
    var name=friend.displayName||t2("ton ami","your friend");
    var dlg=u.openDialog(t2("Marquer comme remboursé ?","Mark as paid back?"),net>0?t2(name+" t’a rendu "+money(net)+" ? Le compte entre vous repassera à zéro.","Did "+name+" pay you back "+money(net)+"? Your balance will go back to zero."):t2("Tu as rendu "+money(-net)+" à "+name+" ? Le compte entre vous repassera à zéro.","Did you pay "+name+" back "+money(-net)+"? Your balance will go back to zero."));
    dlg.classList.add("sfx-dialog");var lead=dlg.querySelector(".sf-muted");if(lead)lead.setAttribute("translate","no");// contient le nom de l’ami
    var feedback=u.el("div"),acts=u.el("div","sf-inline-actions"),ok=u.action(t2("Oui, c’est réglé","Yes, we’re even"),async function(){
      ok.disabled=true;var res;try{res=await client.rpc("settle_shared",{p_friend_id:friend.friendId});}catch(e){res={error:e};}
      if(res.error){feedback.replaceChildren(u.notice(errorText(res.error),"error"));ok.disabled=false;return;}
      dlg.close();toast(t2("Compte remis à zéro","Balance reset to zero"));changed();
    },"primary","check");
    acts.append(u.action(t2("Annuler","Cancel"),function(){dlg.close();},"secondary"),ok);dlg.append(feedback,acts);
  }

  function toast(text){if(window.GFNotify)window.GFNotify.toast(text);}
  if(window.addEventListener){window.addEventListener("authStateChanged",function(){cache={at:0,user:"",data:null,pending:null};mounted=[];});
    // Les cartes déjà affichées reprennent la langue choisie.
    window.addEventListener("gf:languagechange",function(){if(mounted.length)refreshAll();});}

  window.GFSplit={mount:mount,overview:overview,openAdd:openAdd,openHistory:openHistory,refresh:refreshAll,_calc:{parseCents:parseCents,shareOf:shareOf,effect:effect}};
})();
