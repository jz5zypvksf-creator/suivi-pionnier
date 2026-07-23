# Suivi pionnier

Une application web mobile et privée pour encoder les activités quotidiennes et suivre une progression annuelle de **600 heures**.

## Fonctions incluses

- objectif annuel de 600 h et objectif hebdomadaire de 13 h ;
- quatre boutons d’encodage rapide ;
- formulaire détaillé avec date, catégorie, durée et note ;
- journal chronologique avec suppression d’une entrée ;
- suivi séparé de la maison et du jardin ;
- vues hebdomadaire, mensuelle et annuelle ;
- stockage local dans le navigateur, sans compte ni serveur.

## Lancer l’application

Prérequis : Node.js 22 ou plus récent.

```bash
npm install
npm run dev
```

Ouvrez ensuite l’adresse locale indiquée dans le terminal.

## Vérifier la version de production

```bash
npm run build
```

## Données et confidentialité

Les activités sont conservées uniquement dans le stockage local du navigateur utilisé. Elles ne sont pas envoyées en ligne. Effacer les données du navigateur effacera également le journal ; une fonction d’export pourra être ajoutée dans une version suivante.

## Déploiement

Le projet est compatible avec une publication web moderne. Après avoir connecté le dépôt à Vercel, le réglage par défaut convient. Pour GitHub Pages, une adaptation en export statique peut être ajoutée selon le mode de publication choisi.
