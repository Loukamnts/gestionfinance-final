(function(){
  "use strict";
  var state={enabled:false,mode:"disabled",authenticated:false,subscription:{plan:"free",status:"none",accessGranted:false,canManage:false},legal:null,loading:false};
  var byId=function(id){return document.getElementById(id);};
  function tr(fr,en){return window.GFI18n?.getLanguage?.()==="en"?en:fr;}
  function planName(plan){return plan==="pro"?"Pro":plan==="plus"?"Plus":tr("Gratuit","Free");}
  function formatMoney(cents){return new Intl.NumberFormat(window.GFI18n?.locale?.()||"fr-FR",{style:"currency",currency:"EUR",minimumFractionDigits:cents?2:0,maximumFractionDigits:2}).format((Number(cents)||0)/100);}
  function formatDate(value){if(!value)return"";var date=new Date(value);return Number.isNaN(date.getTime())?"":new Intl.DateTimeFormat(window.GFI18n?.locale?.()||"fr-FR",{day:"numeric",month:"long",year:"numeric"}).format(date);}
  function account(){return window.__account||{};}
  async function token(){var client=account().client;if(!client)return"";var result=await client.auth.getSession();return result?.data?.session?.access_token||"";}
  async function request(path,options){options=options||{};var access=await token(),headers={"Accept":"application/json"};if(access)headers.Authorization="Bearer "+access;if(options.body!==undefined){headers["Content-Type"]="application/json";options.body=JSON.stringify(options.body);}var response=await fetch(path,{method:options.method||"GET",headers:headers,body:options.body,credentials:"same-origin",cache:"no-store"});var payload=await response.json().catch(function(){return{};});if(!response.ok){var error=new Error(payload.error||"billing_request_failed");error.code=payload.error||"billing_request_failed";error.status=response.status;error.action=payload.action;throw error;}return payload;}
  function message(text,kind){var node=byId("subscriptionNotice");if(node){node.textContent=text;node.dataset.kind=kind||"";}}
  function detail(){var subscription=state.subscription||{};if(subscription.source==="gift"&&subscription.currentPeriodEnd)return tr("Formule offerte jusqu’au ","Complimentary plan until ")+formatDate(subscription.currentPeriodEnd)+".";if(subscription.cancelAtPeriodEnd&&subscription.currentPeriodEnd)return tr("Résiliation prévue le ","Cancellation scheduled for ")+formatDate(subscription.currentPeriodEnd)+".";if(subscription.accessGranted&&subscription.currentPeriodEnd)return tr("Prochain renouvellement le ","Next renewal on ")+formatDate(subscription.currentPeriodEnd)+".";if(subscription.status==="past_due")return tr("Paiement à régulariser dans le portail Stripe.","Payment requires attention in the Stripe portal.");return tr("Aucun prélèvement.","No charge.");}
  function render(){
    var subscription=state.subscription||{},plan=subscription.plan||"free",name=planName(plan),current=byId("subscriptionCurrent"),manage=byId("subscriptionManageButton"),settingsManage=byId("billingSettingsManage");
    if(current)current.hidden=!state.authenticated;
    if(byId("subscriptionCurrentPlan"))byId("subscriptionCurrentPlan").textContent=name;
    if(byId("subscriptionCurrentDetail"))byId("subscriptionCurrentDetail").textContent=detail();
    if(byId("billingSettingsPlan"))byId("billingSettingsPlan").textContent=name;
    if(byId("billingSettingsDetail"))byId("billingSettingsDetail").textContent=detail();
    var profileLink=byId("profileSubscriptionButton")?.querySelector("span");if(profileLink)profileLink.textContent=subscription.accessGranted?tr("Abonnement","Plan"):tr("S’abonner","Subscribe");
    if(manage)manage.hidden=!subscription.canManage;
    if(settingsManage)settingsManage.hidden=!subscription.canManage;
    document.querySelectorAll("[data-subscription-price]").forEach(function(node){var id=node.dataset.subscriptionPrice,planState=state.plans?.[id],amount=planState?.amount??(id==="plus"?499:id==="pro"?799:0);node.textContent=formatMoney(amount);});
    document.querySelectorAll("[data-subscription-card]").forEach(function(card){card.dataset.current=String(card.dataset.subscriptionCard===plan);card.dataset.currentLabel=tr("Formule actuelle","Current plan");});
    document.querySelectorAll("[data-subscription-plan]").forEach(function(button){var choice=button.dataset.subscriptionPlan,selected=choice===plan;button.disabled=state.loading||selected||(!state.enabled&&choice!=="free");button.textContent=selected?tr("Formule actuelle","Current plan"):choice==="free"?tr("Continuer gratuitement","Continue for free"):choice==="plus"?tr("S’abonner et payer 4,99 € par mois","Subscribe and pay €4.99 per month"):tr("S’abonner et payer 7,99 € par mois","Subscribe and pay €7.99 per month");});
    var merchant=byId("subscriptionMerchant");if(merchant){merchant.hidden=!state.legal;merchant.textContent=state.legal?tr("Vendeur : ","Seller: ")+state.legal.name+" · "+state.legal.address+" · "+state.legal.supportEmail+" · "+tr("Médiation : ","Mediation: ")+state.legal.mediatorName:"";}
    if(!state.enabled)message(tr("Les paiements sont en préparation. Aucun abonnement ne peut être facturé tant que la configuration Stripe et les informations légales ne sont pas validées.","Payments are being prepared. No subscription can be charged until Stripe and legal information are validated."));
    else if(new URLSearchParams(location.search).get("checkout")==="success")message(tr("Paiement reçu. L’accès sera activé dès la confirmation sécurisée de Stripe.","Payment received. Access will be enabled after Stripe securely confirms it."),"success");
    else if(new URLSearchParams(location.search).get("checkout")==="cancelled")message(tr("Paiement annulé. Aucun changement n’a été appliqué.","Payment cancelled. No change was made."));
    else message(state.mode==="test"?tr("Mode test Stripe. Aucun paiement réel.","Stripe test mode. No real payment."):tr("Paiement sécurisé par Stripe. Les moyens disponibles dépendent de ton appareil et de ton pays.","Secure payment by Stripe. Available methods depend on your device and country."),state.mode==="test"?"success":"");
    window.dispatchEvent(new CustomEvent("gf:subscriptionchange",{detail:{plan:plan,enabled:state.enabled,accessGranted:!!subscription.accessGranted}}));
  }
  async function refresh(){try{var access=await token(),headers={Accept:"application/json"};if(access)headers.Authorization="Bearer "+access;var response=await fetch("/api/billing/status",{headers:headers,credentials:"same-origin",cache:"no-store"});var payload=await response.json();if(!response.ok)throw new Error(payload.error||"status_failed");state=Object.assign(state,payload);window.GFSubscriptions.enabled=state.enabled;render();window.GFProfile?.reload?.();return state;}catch(error){state.enabled=false;render();return state;}}
  function openAccount(){window.setPage?.("settings");document.querySelector('[data-settings-view="account"]')?.click();}
  async function startCheckout(plan){
    if(plan==="free"){window.setPage?.("dashboard");return;}
    if(!account().user){openAccount();message(tr("Connecte-toi avant de choisir une formule payante.","Sign in before choosing a paid plan."),"error");return;}
    if(!state.enabled){message(tr("Les paiements ne sont pas encore activés.","Payments are not enabled yet."),"error");return;}
    state.loading=true;render();
    try{var result=await request("/api/billing/checkout",{method:"POST",body:{plan:plan}});location.assign(result.url);}
    catch(error){if(error.action==="portal")return manage();var text=error.code==="checkout_rate_limited"?tr("Patiente quelques secondes avant de réessayer.","Wait a few seconds before trying again."):error.code==="gift_plan_active"?tr("Une formule offerte est déjà active. Tu pourras souscrire après sa date de fin.","A complimentary plan is already active. You can subscribe after it ends."):tr("Le paiement n’a pas pu être préparé. Aucun débit n’a eu lieu.","Checkout could not be prepared. Nothing was charged.");message(text,"error");}
    finally{state.loading=false;render();}
  }
  async function manage(){
    if(!account().user){openAccount();return;}
    state.loading=true;render();
    try{var result=await request("/api/billing/portal",{method:"POST",body:{}});location.assign(result.url);}
    catch(error){message(tr("Le portail de facturation est momentanément indisponible.","The billing portal is temporarily unavailable."),"error");}
    finally{state.loading=false;render();}
  }
  function renderOnboardingOffer(container,options){
    container.replaceChildren();
    ["plus","pro"].forEach(function(plan){var button=document.createElement("button");button.type="button";button.className="subscription-welcome-choice";button.innerHTML="<strong>"+planName(plan)+"</strong><span>"+(plan==="plus"?"4,99 €":"7,99 €")+" / mois</span>";button.addEventListener("click",function(){(options?.onChoose||startCheckout)(plan);});container.append(button);});
  }
  function wire(){
    document.querySelectorAll("[data-subscription-plan]").forEach(function(button){button.addEventListener("click",function(){startCheckout(button.dataset.subscriptionPlan);});});
    byId("subscriptionManageButton")?.addEventListener("click",manage);byId("billingSettingsManage")?.addEventListener("click",manage);byId("billingSettingsOpenPlans")?.addEventListener("click",function(){window.setPage?.("subscription");});
    byId("profileSubscriptionButton")?.addEventListener("click",function(){window.setPage?.("subscription");byId("profilePopover").hidden=true;byId("profileMenuButton")?.setAttribute("aria-expanded","false");});
    window.addEventListener("authStateChanged",refresh);window.addEventListener("gf:languagechange",render);
    refresh();
  }
  window.GFSubscriptions={enabled:false,refresh:refresh,startCheckout:startCheckout,manage:manage,renderOnboardingOffer:renderOnboardingOffer,getState:function(){return JSON.parse(JSON.stringify(state));},has:function(feature){var plan=state.subscription?.plan||"free";var rank={free:0,plus:1,pro:2}[plan]||0;var needed={studio:1,accents:1,import:1,unlimitedObjectives:1,sharingOne:1,sharingMany:2}[feature]||0;return rank>=needed;}};
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",wire);else wire();
})();
