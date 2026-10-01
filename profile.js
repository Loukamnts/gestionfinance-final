/* Identite personnelle. Les regles de securite sont appliquees par Supabase. */
(function(){
  "use strict";
  const byId=id=>document.getElementById(id);
  let request=0;
  let profile=null;
  function account(){return window.__account||{};}
  function tr(fr,en){return window.GFI18n?.getLanguage?.()==="en"?en:fr;}
  function date(value){if(!value)return "—";const parsed=new Date(value);return Number.isNaN(parsed.getTime())?"—":new Intl.DateTimeFormat(window.GFI18n?.locale?.()||"fr-FR",{year:"numeric",month:"long",day:"numeric"}).format(parsed);}
  function feedback(message,ok){const node=byId("identityFeedback");if(node){node.textContent=message;node.dataset.kind=ok?"success":"error";}}
  function render(){
    const user=account().user,connected=!!user;
    byId("identitySignedOut").hidden=connected;
    byId("identityDetails").hidden=!connected;
    if(!connected){profile=null;byId("identityUsername").value="";feedback("",true);return;}
    const name=profile?.username||"";
    byId("identityCurrentUsername").textContent=name?"@"+name:tr("À choisir","Not set yet");
    byId("identityAvatar").textContent=(name||user.email||"?").charAt(0).toUpperCase();
    byId("identityCreated").textContent=date(profile?.created_at||user.created_at);
    byId("identityPlan").textContent=profile?.plan==="premium"?"Premium":profile?.plan==="plus"?"Plus":tr("Gratuit","Free");
    byId("identitySubscriptionDate").textContent=profile?.subscription_started_at?date(profile.subscription_started_at):tr("Aucun abonnement payant","No paid subscription");
    const changed=profile?.username_changed_at?new Date(profile.username_changed_at):null;
    const next=changed?new Date(changed.getTime()+30*86400000):null;
    const waiting=next&&next>Date.now();
    byId("identityUsername").disabled=!!waiting;
    byId("identityForm").querySelector("button[type=submit]").disabled=!!waiting;
    byId("identityChangeDate").textContent=waiting?tr("Prochain changement possible le ","Next change available on ")+date(next):name?tr("Tu peux modifier ton pseudo maintenant.","You can change your username now."):tr("Tu peux choisir ton premier pseudo maintenant.","You can choose your first username now.");
    const menuAvatar=byId("profileAvatar");if(menuAvatar&&name)menuAvatar.textContent=name.charAt(0).toUpperCase();
  }
  async function load(){
    const current=++request,user=account().user;
    if(!user){render();return;}
    try{
      const result=await account().client.rpc("get_my_profile");
      if(current!==request||account().user?.id!==user.id)return;
      if(result.error)throw result.error;
      profile=Array.isArray(result.data)?result.data[0]:result.data;
      render();
    }catch(error){
      if(current!==request)return;
      profile=null;render();
      feedback(tr("Le profil n’est pas encore disponible. Applique la migration Supabase du profil.","Profile is not available yet. Apply the Supabase profile migration."),false);
    }
  }
  async function save(event){
    event.preventDefault();
    const user=account().user,form=byId("identityForm"),button=form.querySelector("button[type=submit]"),value=byId("identityUsername").value.trim().toLowerCase();
    if(!user)return;
    if(!/^[a-z0-9][a-z0-9._-]{2,23}$/.test(value)){feedback(tr("Utilise 3 à 24 caractères sans espace ni accent.","Use 3 to 24 characters without spaces or accents."),false);return;}
    button.disabled=true;feedback(tr("Enregistrement…","Saving…"),true);
    try{
      const result=await account().client.rpc("set_my_username",{p_username:value});
      if(result.error)throw result.error;
      await load();
      byId("identityUsername").value="";
      feedback(tr("Pseudo enregistré. Tes amis le verront dans leur liste.","Username saved. Your friends will see it in their list."),true);
      window.FriendsSystem?.loadFriends?.({force:true});
    }catch(error){
      const code=String(error?.message||"").toLowerCase();
      feedback(code.includes("username_taken")?tr("Ce pseudo est déjà utilisé.","This username is already taken."):code.includes("username_cooldown")?tr("Tu peux changer ton pseudo une fois tous les 30 jours.","You can change your username every 30 days."):tr("Impossible d’enregistrer ce pseudo. Réessaie.","Could not save this username. Try again."),false);
      button.disabled=false;
    }
  }
  function start(){byId("identityForm")?.addEventListener("submit",save);window.addEventListener("authStateChanged",load);window.addEventListener("gf:languagechange",render);render();if(account().user)load();}
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",start);else start();
  window.GFProfile={reload:load};
})();
