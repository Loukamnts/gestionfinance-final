-- Notifications de dépenses partagées : plus aucun montant dans le texte poussé (écran verrouillé, autres appareils).
-- À appliquer par la session principale (non appliqué). Ne supprime rien : simple remplacement de la fonction du déclencheur.
create or replace function public.notif_shared_expenses()
returns trigger language plpgsql security definer set search_path to ''
as $f$
declare other uuid; l text; who text;
begin
  other := case when new.created_by = new.creditor_id then new.debtor_id else new.creditor_id end;
  l := public.notif_lang(other); who := public.notif_name(new.created_by);
  if new.kind = 'depense' then
    perform public.queue_notification(other, 'friends',
      who || case when l = 'en' then ' added an expense: “' || new.label || '”' else ' a ajouté une dépense : « ' || new.label || ' »' end,
      case when l = 'en' then 'Open Meuniance to see the details.' else 'Ouvre Meuniance pour voir le détail.' end,
      '/partage', 'split:' || new.id);
  else
    perform public.queue_notification(other, 'friends',
      case when l = 'en' then 'All settled' else 'Comptes réglés' end,
      who || case when l = 'en' then ' marked your shared expenses as paid back.' else ' a marqué vos comptes comme réglés.' end,
      '/partage', 'split:' || new.id);
  end if;
  return null;
end;
$f$;
revoke all on function public.notif_shared_expenses() from public, anon, authenticated;
