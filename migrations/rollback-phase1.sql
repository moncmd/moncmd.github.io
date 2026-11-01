-- ============================================================
-- ROLLBACK PHASE 1 — remet exactement l'état d'avant si besoin.
-- ============================================================
drop trigger if exists trg_proteger_champs_vendeur on vendeurs;
drop trigger if exists trg_avis_en_attente on avis;
drop trigger if exists trg_statut_commande on commandes;

drop policy if exists "Vendeur upload dans son dossier" on storage.objects;
drop policy if exists "Upload recus PDF boutique existante" on storage.objects;

create policy "Upload public galerie" on storage.objects for insert with check (bucket_id = 'galerie');
create policy "Upload public logos-vendeurs" on storage.objects for insert with check (bucket_id = 'logos-vendeurs');
create policy "Upload public personnel-images" on storage.objects for insert with check (bucket_id = 'personnel-images');
create policy "Upload public prestations-images" on storage.objects for insert with check (bucket_id = 'prestations-images');
create policy "Upload public produits-videos" on storage.objects for insert with check (bucket_id = 'produits-videos');
create policy "Vendeurs connectes peuvent uploader" on storage.objects for insert with check ((bucket_id = 'produits-images') and (auth.role() = 'authenticated'));
create policy "Upload public des recus" on storage.objects for insert with check (bucket_id = 'recus');

-- Seulement si la phase 1C a été lancée :
-- create policy "Lecture publique codes_promo actifs" on codes_promo for select using (actif = true);
