# Organigrammes Laurenty

Premier socle d'une application web spécialisée dans la création et l'export d'organigrammes.

## Fonctionnalités actuelles

- édition de la structure hiérarchique et des collaborateurs ;
- recalcul automatique de l'agencement par sous-arbre, sans croisement entre familles ;
- réorganisation des blocs frères par glisser-déposer ou commandes monter/descendre ;
- vue organigramme et vue liste adaptée aux petits écrans ;
- personnalisation de la couleur et import d'un logo ;
- authentification et bibliothèque personnelle d’organigrammes via Supabase ;
- sauvegarde cloud, avec copie locale et fichier source `.orgchart` ;
- exports PDF A3 et JPG haute définition ;
- configuration de déploiement Vercel.

## Lancer le projet

```bash
pnpm install
pnpm dev
```

Puis ouvrir l'adresse indiquée par Vite.

## Vérifier le build de production

```bash
pnpm build
pnpm preview
```

## Déployer

Le dépôt peut être importé directement dans Vercel. Le framework Vite et la redirection SPA sont déjà décrits dans `vercel.json`.

La configuration publique Supabase est fournie par `VITE_SUPABASE_URL` et `VITE_SUPABASE_PUBLISHABLE_KEY`. Le schéma sécurisé se trouve dans `supabase/migrations`.

## Prochaines étapes recommandées

1. valider les règles d'agencement sur 3 à 5 organigrammes réels ;
2. remplacer les données de démonstration par le modèle métier définitif ;
3. ajouter import/export JSON et CSV/Excel ;
4. générer un PDF vectoriel et gérer A4 à A0 ;
5. ajouter un historique détaillé des versions.
