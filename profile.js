/* Identite personnelle. Les regles de securite sont appliquees par Supabase. */
(function(){
  "use strict";
  const byId=id=>document.getElementById(id);
  let request=0;
  let profile=null;
  const welcomeKey=userId=>"gf.welcome.dismissed."+userId;
  function closeWelcome(userId){const dialog=byId("accountWelcomeDialog");if(dialog?.open)dialog.close();if(userId)try{localStorage.setItem(welcomeKey(userId),"1");}catch(e){}}
  async function showPlanStep(user){
    const api=window.GFSubscriptions;
    if(!api||typeof api.refresh!=="function"||typeof api.renderOnboardingOffer!=="function"||typeof api.startCheckout!=="function"){closeWelcome(user?.id);return;}
    await api.refresh();
    if(!api.enabled){closeWelcome(user?.id);return;}
    const dialog=byId("accountWelcomeDialog"),intro=byId("welcomeUsernameStep"),plans=byId("welcomePlanStep"),offer=byId("welcomePlanOffer");
    if(!dialog||!plans||!offer)return;
    intro.hidden=true;plans.hidden=false;offer.replaceChildren();
    try{api.renderOnboardingOffer(offer,{onChoose:planId=>api.startCheckout(planId)});}catch(error){console.warn("Billing onboarding unavailable",error);closeWelcome(user?.id);return;}
    if(!dialog.open)dialog.showModal();
  }
  function maybeWelcome(user){
    if(!user||!profile||account().recoveryPending)return;
    const created=Date.parse(user.created_at||"");
    if(!Number.isFinite(created)||Date.now()-created>72*60*60*1000||profile.username)return;
    try{if(localStorage.getItem(welcomeKey(user.id)))return;}catch(e){}
    const dialog=byId("accountWelcomeDialog");if(dialog&&!dialog.open)dialog.showModal();
  }
  function account(){return window.__account||{};}
  function tr(fr,en){return window.GFI18n?.getLanguage?.()==="en"?en:fr;}
  function date(value){if(!value)return "—";const parsed=new Date(value);return Number.isNaN(parsed.getTime())?"—":new Intl.DateTimeFormat(window.GFI18n?.locale?.()||"fr-FR",{year:"numeric",month:"long",day:"numeric"}).format(parsed);}
  function feedback(message,ok){const node=byId("identityFeedback");if(node){node.textContent=message;node.dataset.kind=ok?"success":"error";}}
  function render(){
    const user=account().user,connected=!!user;
    byId("identitySection").hidden=!connected;
    if(!connected){profile=null;byId("identityUsername").value="";byId("identityForm").hidden=true;feedback("",true);return;}
    const name=profile?.username||"";
    byId("identityCurrentUsername").textContent=name?"@"+name:tr("À choisir","Not set yet");
    byId("identityEmail").textContent=user.email||"";
    byId("identityFactEmail").textContent=user.email||"—";
    byId("identityAvatar").textContent=(name||user.email||"?").charAt(0).toUpperCase();
    byId("identityCreated").textContent=date(profile?.created_at||user.created_at);
    byId("identityPlan").textContent=profile?.plan==="pro"?"Pro":profile?.plan==="plus"?"Plus":tr("Gratuit","Free");
    byId("identitySubscriptionDate").textContent=profile?.subscription_started_at?date(profile.subscription_started_at):"—";
    byId("identitySubscriptionRow").hidden=!profile?.subscription_started_at;
    const changed=profile?.username_changed_at?new Date(profile.username_changed_at):null;
    const next=changed?new Date(changed.getTime()+30*86400000):null;
    const waiting=next&&next>Date.now();
    byId("identityUsername").disabled=!!waiting;
    byId("identityForm").querySelector("button[type=submit]").disabled=!!waiting;
    byId("identityEditButton").disabled=!!waiting;
    byId("identityEditButton").title=waiting?tr("Prochain changement possible le ","Next change available on ")+date(next):tr("Modifier le pseudo","Edit username");
    byId("identityEditButton").setAttribute("aria-label",byId("identityEditButton").title);
    byId("identityChangeDate").hidden=!waiting;
    byId("identityChangeDate").textContent=waiting?tr("Prochain changement possible le ","Next change available on ")+date(next):"";
    if(waiting)byId("identityForm").hidden=true;
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
      maybeWelcome(user);
    }catch(error){
      if(current!==request)return;
      profile=null;render();
      feedback(tr("Le profil n’est pas encore disponible. Applique la migration Supabase du profil.","Profile is not available yet. Apply the Supabase profile migration."),false);
    }
  }
  async function saveUsername(value){
    const user=account().user;
    value=String(value||"").trim().toLowerCase();
    if(!user)throw new Error("not_signed_in");
    if(!/^[a-z0-9][a-z0-9._-]{2,23}$/.test(value)){const error=new Error("username_invalid");feedback(tr("Utilise 3 à 24 caractères sans espace ni accent.","Use 3 to 24 characters without spaces or accents."),false);throw error;}
    feedback(tr("Enregistrement…","Saving…"),true);
    try{
      const result=await account().client.rpc("set_my_username",{p_username:value});
      if(result.error)throw result.error;
      await load();
      byId("identityUsername").value="";
      byId("identityForm").hidden=true;
      feedback(tr("Pseudo enregistré. Tes amis le verront dans leur liste.","Username saved. Your friends will see it in their list."),true);
      window.FriendsSystem?.loadFriends?.({force:true});
      return true;
    }catch(error){
      const code=String(error?.message||"").toLowerCase();
      const message=code.includes("username_invalid")?tr("Utilise 3 à 24 caractères sans espace ni accent.","Use 3 to 24 characters without spaces or accents."):code.includes("username_taken")?tr("Ce pseudo est déjà utilisé.","This username is already taken."):code.includes("username_cooldown")?tr("Tu peux changer ton pseudo une fois tous les 30 jours.","You can change your username every 30 days."):tr("Impossible d’enregistrer ce pseudo. Réessaie.","Could not save this username. Try again.");
      feedback(message,false);throw error;
    }
  }
  async function save(event){
    event.preventDefault();
    const form=byId("identityForm"),button=form.querySelector("button[type=submit]"),value=byId("identityUsername").value;
    button.disabled=true;
    try{await saveUsername(value);}catch(e){}finally{button.disabled=!!byId("identityUsername").disabled;}
  }
  async function saveWelcome(event){
    event.preventDefault();const input=byId("welcomeUsername"),button=event.currentTarget.querySelector("[type=submit]"),error=byId("welcomeUsernameError");
    button.disabled=true;if(error)error.textContent="";
    try{await saveUsername(input.value);input.value="";await showPlanStep(account().user);}
    catch(e){if(error)error.textContent=byId("identityFeedback")?.textContent||tr("Impossible d’enregistrer ce pseudo.","Could not save this username.");}
    finally{button.disabled=false;}
  }
  function start(){
    byId("identityForm")?.addEventListener("submit",save);
    byId("identityEditButton")?.addEventListener("click",()=>{const form=byId("identityForm");if(!form||byId("identityEditButton").disabled)return;form.hidden=false;byId("identityUsername").value=profile?.username||"";byId("identityUsername").focus();feedback("",true);});
    byId("identityCancelButton")?.addEventListener("click",()=>{byId("identityForm").hidden=true;feedback("",true);});
    byId("welcomeUsernameForm")?.addEventListener("submit",saveWelcome);
    byId("welcomeSkipUsername")?.addEventListener("click",()=>showPlanStep(account().user));
    byId("welcomeSkipPlan")?.addEventListener("click",()=>closeWelcome(account().user?.id));
    byId("accountWelcomeDialog")?.addEventListener("close",()=>{const user=account().user;if(user)try{localStorage.setItem(welcomeKey(user.id),"1");}catch(e){}});
    window.addEventListener("authStateChanged",load);window.addEventListener("gf:languagechange",render);render();if(account().user)load();
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",start);else start();
  window.GFProfile={reload:load};
})();
