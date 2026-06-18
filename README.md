Voici une version plus professionnelle, structurée et adaptée à un projet académique ou de soutenance :

# MaterniteCare – Plateforme de Suivi Obstétrical et Maternel

## Présentation du projet

**MaterniteCare** est une plateforme web de gestion et de suivi obstétrical conçue pour accompagner les professionnels de santé dans la prise en charge des patientes tout au long de leur parcours médical. L'application permet la gestion des dossiers médicaux, des consultations, des hospitalisations, des constantes vitales, des accouchements, des prescriptions médicales et du suivi patient via un portail dédié.

---

## État d'avancement du projet

**Date de mise à jour : 18 juin 2026**

### Travaux réalisés du 14 au 18 juin 2026

Cette phase de développement a été consacrée à la finalisation des fonctionnalités principales, à l'amélioration de l'expérience utilisateur et à la correction des anomalies détectées lors des phases de test.

---

## Corrections et améliorations réalisées

### Backend (API Node.js / Express)

#### Gestion des fichiers et documents

* Mise en place de la route statique `/uploads` pour la diffusion sécurisée des fichiers téléversés.
* Optimisation de la gestion des téléchargements de documents médicaux.

#### Gestion des constantes vitales

* Adaptation de la route `POST /api/constantes` afin de permettre l'enregistrement des constantes :

  * à partir d'une admission active ;
  * directement depuis le dossier patient grâce au champ `patiente_id`.

#### Gestion du risque obstétrical

* Création de la route :

```http
PATCH /api/grossesses/:id/risque
```

permettant la mise à jour dynamique du niveau de risque d'une grossesse.

#### Gestion des prescriptions médicales

Ajout des routes :

```http
GET  /api/ordonnances/patient/:patienteId
POST /api/ordonnances
```

pour consulter et enregistrer des ordonnances médicales.

#### Gestion des accouchements

Ajout des routes :

```http
GET  /api/accouchements/patient/:patienteId
POST /api/accouchements
```

pour l'enregistrement et la consultation des accouchements.

#### Gestion des lits d'hospitalisation

Ajout des routes :

```http
GET   /api/lits/workspace/:workspaceId
PATCH /api/admissions/:id/lit
```

permettant l'attribution et la libération des lits.

#### Recherche avancée

Création de la route :

```http
GET /api/patients/search?q=
```

offrant une recherche multicritère sur les patientes.

#### Portail public

Ajout de la route :

```http
GET /api/patient/public/:id
```

pour l'affichage sécurisé des informations publiques d'une patiente sans authentification JWT.

---

### Dashboard Soignant

#### Gestion des dossiers patientes

* Ajout de l'affichage des documents médicaux dans la fiche détaillée.
* Intégration d'un bouton de téléchargement pour chaque document.
* Correction du chemin d'accès aux fichiers téléversés.

#### Suivi obstétrical

* Modification du niveau de risque :

  * Normal
  * Modéré
  * Élevé

* Ajout de l'enregistrement des constantes vitales même en l'absence d'une admission active.

#### Ergonomie

* Refonte visuelle des cartes patientes.
* Ajout de badges et d'indicateurs colorés selon le niveau de risque.
* Amélioration de la lisibilité générale de l'interface.

#### Recherche

* Recherche par :

  * lot de vaccin ;
  * nom ;
  * quartier ;
  * pathologie ;
  * mots-clés.

#### Gestion des alertes

* Ajout de la fonctionnalité **Marquer comme critique**.
* Conservation de l'état via `localStorage`.

#### Hospitalisation

* Attribution et libération de lits directement depuis le tableau de bord.

#### Accouchements

* Ajout du formulaire complet d'enregistrement des accouchements.

#### Correctifs

* Correction de plusieurs gestionnaires d'événements :

  * mise à jour des patientes ;
  * prescriptions ;
  * constantes ;
  * admissions.

---

### Portail Patient

#### Nouvel onglet « Mon Profil »

Ajout d'un espace dédié permettant aux patientes de consulter :

* leurs informations personnelles ;
* leurs coordonnées ;
* leur dossier médical simplifié.

#### Amélioration de l'affichage documentaire

* Affichage d'icônes dynamiques selon le type de document.
* Optimisation de l'expérience utilisateur.

#### Formulaire de téléversement

* Ajout du champ obligatoire `type_document`.
* Validation améliorée des données envoyées.

#### Confidentialité

* Remplacement des exemples de dossiers réels par des identifiants anonymisés.

---

## Sécurité et contrôle d'accès

### Authentification

* Protection des routes professionnelles via JWT.
* Gestion sécurisée des sessions utilisateur.

### Restrictions d'accès

Les soignants peuvent uniquement modifier les informations non identifiantes :

* téléphone ;
* quartier ;
* antécédents médicaux.

Les données sensibles d'identification restent protégées.

### Vues SQL sécurisées

Création des vues :

* `vue_patiente_public`
* `vue_soignant_restreint`

afin de limiter l'exposition des données selon le rôle utilisateur.

---

## Base de données

### Évolutions du schéma

Ajout de la colonne :

```sql
motif_sortie VARCHAR(...)
```

dans la table `admission`.

### Validation des scripts

Les scripts suivants ont été vérifiés et exécutés avec succès :

```text
00_reset.sql
01_schema.sql
02_seed.sql
```

Aucune erreur de cohérence ou d'intégrité n'a été détectée.

---

## Fonctionnalités opérationnelles

### Portail Patient

* Authentification par numéro de dossier.
* Consultation des rendez-vous.
* Consultation du calendrier vaccinal.
* Téléversement de documents.
* Consultation des documents.
* Accès au profil personnel.

### Dashboard Soignant

* Authentification sécurisée par JWT.
* Consultation des statistiques.
* Gestion complète des dossiers patientes.
* Visualisation des constantes vitales.
* Gestion des prescriptions médicales.
* Gestion des admissions.
* Gestion des lits.
* Gestion des accouchements.
* Téléchargement des documents médicaux.

### Recherche Avancée

Recherche multicritère par :

* nom ;
* quartier ;
* pathologie ;
* mot-clé ;
* lot vaccinal.

### Gestion Hospitalière

* Admission des patientes.
* Clôture des admissions.
* Attribution des lits.
* Libération des lits.

### Suivi Médical

* Enregistrement des constantes vitales.
* Gestion des prescriptions.
* Gestion des grossesses à risque.
* Enregistrement des accouchements.

---

## Temps de développement

Les améliorations et correctifs présentés dans cette mise à jour ont été réalisés sur plusieurs sessions de développement entre le **14 et le 18 juin 2026**, à la suite des tests fonctionnels et des retours utilisateurs.

---

## Prochaines étapes

### Documentation

* Finalisation du README définitif.
* Ajout de captures d'écran.
* Documentation technique des API.

### Démonstration

* Réalisation d'une vidéo de présentation du projet.
* Publication de la vidéo sur YouTube.

### Déploiement

* Hébergement du backend sur Render.
* Déploiement du frontend sur GitHub Pages.
* Mise en production de la plateforme.

### Améliorations futures

* Notifications automatiques de rendez-vous.
* Tableau de bord analytique avancé.
* Export PDF des dossiers médicaux.
* Gestion multi-établissements de santé.
* Historique complet des modifications.

---

## Technologies utilisées

### Frontend

* HTML5
* CSS3
* JavaScript (Vanilla JS)

### Backend

* Node.js
* Express.js

### Base de données

* PostgreSQL

### Sécurité

* JWT (JSON Web Token)
* Contrôle d'accès par rôles

---

**Version actuelle : v1.0 (Phase de finalisation)**
**Dernière mise à jour : 18 juin 2026**
**Projet académique – MaterniteCare**


