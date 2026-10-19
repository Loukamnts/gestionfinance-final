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
  function money(cents){var v=Number(cents||0)/100;if(window.GFI18n&&window.GFI18n.money)return window.GFI18n.money(v);return v.toLocaleString("fr-FR",{style:"currency",currency:"EUR"});}
  function errorText(error){
    var m=String(error&&error.message||error||"").toLowerCase();
    if(/not_friends/.test(m))return"Vous devez être amis pour partager une dépense.";
    if(/invalid_label/.test(m))return"Donne un nom à la dépense (60 caractères au plus).";
    if(/invalid_amount/.test(m))return"Le montant doit être compris entre 0,01 € et 10 000 €.";
    if(/too_many/.test(m))return"Beaucoup de dépenses ajoutées aujourd’hui. Réessaie demain.";
    if(/nothing_to_settle/.test(m))return"Vous êtes déjà quittes.";
    if(/only_creditor/.test(m))return"C’est la personne remboursée qui confirme le remboursement.";
    if(/does not exist|could not find the function|pgrst202/.test(m))return"Les dépenses partagées ne sont pas encore disponibles. Réessaie plus tard.";
    return"L’action n’a pas abouti. Vérifie ta connexion puis réessaie.";
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
    if(!slot.childElementCount){var head=u.el("div","sf-label-row");head.append(u.el("span","sf-label","Comptes entre vous"));slot.append(head,u.el("p","sfx-status sfx-loading","…"));}
    balances(false).then(function(map){fill(slot,friend,map);});
  }
  // Les cartes sont créées avant d'être mises dans la page : on ne trie les anciennes qu'au rafraîchissement.
  function track(slot,data){mounted=mounted.filter(function(m){return m.slot!==slot;});mounted.push({slot:slot,friend:data});if(mounted.length>60)mounted=mounted.filter(function(m){return m.slot.isConnected;});}
  function refreshAll(){balances(true).then(function(map){mounted=mounted.filter(function(m){return m.slot.isConnected;});mounted.forEach(function(m){if(Array.isArray(m.friend))fillOverview(m.slot,m.friend,map);else fill(m.slot,m.friend,map);});});}

  /* ── Bandeau récapitulatif en haut de la liste d'amis ── */
  function overview(friends){
    var u=ui();if(!u||!friends||!friends.length)return null;
    var root=u.el("section","sfx-overview");root.setAttribute("aria-label","Dépenses entre amis");
    track(root,friends);fillOverview(root,friends,null);
    balances(false).then(function(map){fillOverview(root,friends,map);});
    return root;
  }
  function fillOverview(root,friends,map){
    var u=ui();if(!u)return;
    var copy=u.el("div","sfx-overview-copy"),title=u.el("h3","","Dépenses entre amis"),line=u.el("p","sfx-overview-line");
    var ids={};friends.forEach(function(f){ids[f.friendId]=1;});
    var owed=0,owe=0,any=false;
    if(map&&!map.__error)Object.keys(map).forEach(function(id){if(!ids[id])return;var n=map[id].net;if(map[id].entries)any=true;if(n>0)owed+=n;else owe-=n;});
    if(!map)line.textContent="…";
    else if(map.__error)line.textContent=map.__error;
    else if(owed||owe){
      if(owed){var a=u.el("span","sfx-pill is-plus");a.append(document.createTextNode("On te doit "),u.el("strong","",money(owed)));line.append(a);}
      if(owe){var b=u.el("span","sfx-pill is-minus");b.append(document.createTextNode("Tu dois "),u.el("strong","",money(owe)));line.append(b);}
    }
    else line.textContent=any?"Tout est réglé entre vous.":"Une addition, des courses, des vacances : note qui a payé, Meuniance calcule qui doit combien.";
    copy.append(title,line);
    root.replaceChildren(copy,u.action("Nouvelle dépense",function(){openAdd(friends,null);},"primary","plus"));
  }
  function fill(slot,friend,map){
    var u=ui();if(!u||!slot.isConnected)return;
    var name=friend.displayName||"Ton ami",head=u.el("div","sf-label-row"),status=u.el("p","sfx-status"),acts=u.el("div","sfx-actions");
    head.append(u.el("span","sf-label","Comptes entre vous"));
    if(map&&map.__error){slot.replaceChildren(head,u.el("p","sf-muted",map.__error));return;}
    var b=map&&map[friend.friendId]||{net:0,entries:0},net=b.net,amount=u.el("strong","sfx-amount",money(Math.abs(net)));
    if(net>0){status.classList.add("is-plus");status.append(document.createTextNode(name+" te doit "),amount);}
    else if(net<0){status.classList.add("is-minus");status.append(document.createTextNode("Tu dois "),amount,document.createTextNode(" à "+name));}
    else{status.classList.add("is-even");status.textContent=b.entries?"Vous êtes quittes":"Aucune dépense partagée pour l’instant";}
    status.setAttribute("translate","no");
    acts.append(u.action("Ajouter une dépense",function(){openAdd([friend],friend);},"secondary","plus"));
    if(b.entries)acts.append(u.action("Historique",function(){openHistory(friend);},"text"));
    // Seule la personne remboursée confirme le remboursement (celle qui doit ne peut pas effacer sa dette).
    if(net>0)acts.append(u.action("Marquer comme remboursé",function(){openSettle(friend,net);},"text"));
    else if(net<0){var hint=u.el("small","sfx-hint","Quand tu l’auras remboursé, "+name+" le marquera de son côté.");hint.setAttribute("translate","no");acts.append(hint);}
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
    var dlg=u.openDialog("Nouvelle dépense partagée","Note qui a payé : Meuniance calcule qui doit combien. Ton ami voit la même dépense de son côté.");
    dlg.classList.add("sfx-dialog");
    var form=u.el("form","sfx-form"),state={payer:"me",split:"equal",chosen:new Set(preset?[preset.friendId]:(friends.length===1?[friends[0].friendId]:[]))};
    var what=u.el("label","sf-field","Pour quoi ?"),label=document.createElement("input");label.type="text";label.maxLength=60;label.required=true;label.placeholder="Restaurant, courses, vacances…";label.autocomplete="off";what.append(label);
    var howMuch=u.el("label","sf-field","Montant total"),amountWrap=u.el("span","sfx-money"),amount=document.createElement("input");amount.type="text";amount.inputMode="decimal";amount.required=true;amount.placeholder="0,00";amount.autocomplete="off";amountWrap.append(amount,u.el("span","sfx-euro","€"));howMuch.append(amountWrap);
    var who=u.el("fieldset","sfx-who"),whoLegend=u.el("legend","sf-field","Avec qui ?"),list=u.el("div","sfx-people");who.append(whoLegend,list);
    friends.forEach(function(f){
      var lab=u.el("label","sfx-person"),box=document.createElement("input");box.type="checkbox";box.value=f.friendId;box.checked=state.chosen.has(f.friendId);
      box.addEventListener("change",function(){if(box.checked)state.chosen.add(f.friendId);else state.chosen.delete(f.friendId);sync();});
      var nm=u.el("span","",f.displayName||"Ami");nm.setAttribute("translate","no");lab.append(box,nm);list.append(lab);
    });
    if(friends.length===1)who.hidden=true;
    var payerRow=u.el("div","sfx-row"),splitRow=u.el("div","sfx-row");
    var payer=seg(u,"Qui a payé ?",[["me","Moi"],["friend","Mon ami"]],"me",function(v){state.payer=v;sync();});
    var split=seg(u,"Comment partager ?",[["equal","Moitié chacun"],["full","Tout pour l’autre"]],"equal",function(v){state.split=v;sync();});
    payerRow.append(u.el("span","sf-field","Qui a payé ?"),payer);splitRow.append(u.el("span","sf-field","Comment partager ?"),split);
    var summary=u.el("p","sfx-summary"),feedback=u.el("div"),submit=u.action("Ajouter",function(){},"primary","check");submit.type="submit";
    summary.setAttribute("aria-live","polite");
    function chosenFriends(){return friends.filter(function(f){return state.chosen.has(f.friendId);});}
    function sync(){
      var picked=chosenFriends(),one=picked.length===1,other=one?picked[0].displayName||"Mon ami":"Mon ami";
      payer.querySelector('[data-value="friend"]').textContent=one?other:"Un ami";
      split.querySelector('[data-value="full"]').textContent=state.payer==="me"?(one?"Tout pour "+other:"Tout pour l’autre"):"Tout pour moi";
      payerRow.hidden=splitRow.hidden=!one;
      if(!one){state.payer="me";state.split="equal";payer.set("me");split.set("equal");}
      var total=parseCents(amount.value),n=picked.length;
      if(!n){summary.textContent="Choisis au moins un ami.";}
      else if(!total){summary.textContent=n>1?"Le montant sera partagé entre vous "+(n+1)+".":"";}
      else{
        var share=shareOf(total,n,state.split);
        if(state.payer==="friend")summary.textContent="Tu devras "+money(share)+" à "+other+".";
        else if(n===1)summary.textContent=other+" te devra "+money(share)+(state.split==="equal"?" (la moitié).":".");
        else summary.textContent="Chacun te devra "+money(share)+", soit "+money(share*n)+" au total.";
      }
      submit.disabled=!n;
    }
    amount.addEventListener("input",sync);
    form.append(what,howMuch,who,payerRow,splitRow,summary,feedback,submit);dlg.append(form);
    form.addEventListener("submit",async function(e){
      e.preventDefault();feedback.replaceChildren();
      var picked=chosenFriends(),total=parseCents(amount.value),text=label.value.trim();
      if(!text){feedback.append(u.notice("Donne un nom à la dépense.","error"));label.focus();return;}
      if(!total){feedback.append(u.notice("Saisis un montant entre 0,01 € et 10 000 €.","error"));amount.focus();return;}
      if(!picked.length)return;
      var client=sb();if(!client||!me()){feedback.append(u.notice("Connecte-toi pour partager une dépense.","error"));return;}
      submit.disabled=true;
      try{
        var res=await client.rpc("add_shared_expense",{p_friend_ids:picked.map(function(f){return f.friendId;}),p_total_cents:total,p_label:text,p_payer:state.payer,p_split:state.split});
        if(res.error)throw res.error;
        dlg.close();toast("Dépense ajoutée");changed();
      }catch(err){feedback.append(u.notice(errorText(err),"error"));submit.disabled=false;}
    });
    sync();setTimeout(function(){label.focus();},50);
  }

  /* ── Historique ───────────────────────────────── */
  function dateText(iso){try{return new Date(iso).toLocaleDateString(document.documentElement.lang==="en"?"en-GB":"fr-FR",{day:"numeric",month:"short"});}catch(e){return"";}}
  async function openHistory(friend){
    var u=ui(),client=sb();if(!u||!client)return;
    var name=friend.displayName||"ton ami",dlg=u.openDialog("Avec "+name,"Les 50 dernières lignes. Tu peux retirer une dépense que tu as ajoutée pendant 30 jours.");
    dlg.classList.add("sfx-dialog");
    var box=u.el("div","sfx-history");box.append(u.notice("Chargement…"));dlg.append(box);
    async function load(){
      var res;try{res=await client.rpc("get_shared_entries",{p_friend_id:friend.friendId});}catch(e){res={error:e};}
      if(!dlg.isConnected)return;
      if(res.error){box.replaceChildren(u.notice(errorText(res.error),"error"));return;}
      var rows=res.data||[];if(!rows.length){box.replaceChildren(u.el("p","sf-muted","Rien pour l’instant."));return;}
      var ul=u.el("ul","sfx-list");
      rows.forEach(function(r){
        var li=u.el("li","sfx-line"+(r.kind==="remboursement"?" is-settle":"")),main=u.el("div","sfx-line-main"),title=u.el("strong","",r.label),sub=u.el("small","");
        title.setAttribute("translate","no");
        var who=r.kind==="remboursement"?"Remboursement":(r.owes_me?"Tu as payé":name+" a payé")+(r.total_cents?" "+money(r.total_cents):"");
        sub.textContent=dateText(r.created_at)+" · "+who;
        main.append(title,sub);
        var val=u.el("span","sfx-line-amt "+(r.owes_me?"is-plus":"is-minus"),(r.owes_me?"+":"−")+money(r.amount_cents));val.title=r.owes_me?name+" te doit ce montant":"Tu dois ce montant";
        li.append(main,val);
        var age=Date.now()-new Date(r.created_at).getTime();
        if(r.mine&&age<30*864e5){
          var rm=u.action("Retirer",async function(){
            if(rm.dataset.confirm!=="1"){rm.dataset.confirm="1";rm.lastChild.textContent="Confirmer";rm.classList.add("sf-text-danger");return;}
            rm.disabled=true;var out;try{out=await client.rpc("remove_shared_entry",{p_id:r.id});}catch(e){out={error:e};}
            if(out.error||!out.data){rm.disabled=false;box.prepend(u.notice(out.error?errorText(out.error):"Cette ligne ne peut plus être retirée.","error"));return;}
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
    var name=friend.displayName||"ton ami";
    var dlg=u.openDialog("Marquer comme remboursé ?",net>0?name+" t’a rendu "+money(net)+" ? Le compte entre vous repassera à zéro.":"Tu as rendu "+money(-net)+" à "+name+" ? Le compte entre vous repassera à zéro.");
    dlg.classList.add("sfx-dialog");
    var feedback=u.el("div"),acts=u.el("div","sf-inline-actions"),ok=u.action("Oui, c’est réglé",async function(){
      ok.disabled=true;var res;try{res=await client.rpc("settle_shared",{p_friend_id:friend.friendId});}catch(e){res={error:e};}
      if(res.error){feedback.replaceChildren(u.notice(errorText(res.error),"error"));ok.disabled=false;return;}
      dlg.close();toast("Compte remis à zéro");changed();
    },"primary","check");
    acts.append(u.action("Annuler",function(){dlg.close();},"secondary"),ok);dlg.append(feedback,acts);
  }

  function toast(text){var t=document.getElementById("gfhToast");if(!t){t=document.createElement("div");t.className="gfh-toast";t.id="gfhToast";t.setAttribute("role","status");t.setAttribute("aria-live","polite");document.body.append(t);}t.textContent=text;t.classList.add("is-on");clearTimeout(toast.t);toast.t=setTimeout(function(){t.classList.remove("is-on");},3200);}
  if(window.addEventListener)window.addEventListener("authStateChanged",function(){cache={at:0,user:"",data:null,pending:null};mounted=[];});

  window.GFSplit={mount:mount,overview:overview,openAdd:openAdd,openHistory:openHistory,refresh:refreshAll,_calc:{parseCents:parseCents,shareOf:shareOf,effect:effect}};
})();
