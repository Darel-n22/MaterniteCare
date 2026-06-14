# MaterniteCare – Suivi obstétrical

## État d’avancement (14/06/2026)

### Fonctionnalités réalisées

#### Base de données PostgreSQL

- Base de données `MaterniteCare_DB` opérationnelle.
- Tables pour la gestion des patientes, grossesses, admissions, rendez-vous, vaccinations, documents médicaux et personnel soignant.
- Contraintes, index et clés étrangères configurés.
- Vues SQL pour limiter l'accès aux données sensibles.
- Données de test intégrées.

#### API REST (Node.js / Express)

Routes disponibles :

- `GET /api/health`
- `GET /api/patients`
- `GET /api/patients/:id` (protégée JWT)
- `GET /api/workspaces/:id/patients` (protégée JWT)
- `GET /api/search/lot/:numero_lot` (protégée JWT)
- `POST /api/auth/login` (authentification soignant)
- `POST /api/upload/:codeDossier` (upload patient)
- `POST /api/documents` (upload soignant, protégé JWT)
- `GET /api/rendezvous/patient/:patienteId`
- `GET /api/vaccinations/patient/:patienteId`
- `GET /api/documents/patient/:patienteId`

Fonctionnalités :

- Connexion PostgreSQL fonctionnelle.
- Authentification JWT (login, middleware).
- Upload sécurisé de fichiers (JPEG, PNG, PDF) avec `multer`.
- Vérification du type MIME et stockage dans `uploads/`.

#### Frontend – Portail patient

- Page `portail.html` (interface mobile‑first).
- Connexion via code dossier (`numero_dossier`).
- Consultation des rendez-vous, vaccinations et documents.
- Dépôt de documents médicaux (échographies, bilans).
- Navigation par onglets.
- Badges de statut (rendez-vous, rappels vaccinaux).
- Expérience utilisateur soignée (états vides, feedback, animations).

#### Frontend – Dashboard soignant (commit 7)

- Structure HTML/CSS du tableau de bord.
- Design inspiré du portail patient (charte graphique cohérente).
- Zone de connexion (email / mot de passe).
- Grille d’affichage des patientes (cartes).
- Barre de recherche par lot de vaccin (interface).
- Statistiques visuelles (patientes actives, urgences, dossiers critiques).
- Composants réutilisables et adaptables (grille, badges, cartes).

#### Sécurité

- Mots de passe chiffrés avec bcrypt.
- Tokens JWT pour les soignants (expiration 8h).
- Vues SQL de protection des données.
- Table `log_acces` pour la traçabilité.
- Contrôle des fichiers uploadés (type, taille).

---

### Preuve de connexion à PostgreSQL

![Connexion PostgreSQL réussie](./docs/pg_connection.png)

*Interface pgAdmin4 montrant la base `MaterniteCare_DB` et la table `patiente` avec ses données.*

---

### Historique

| Commit   | Description                                                       |
| -------- | ----------------------------------------------------------------- |
| Commit 1 | Structure SQL et données initiales                                |
| Commit 2 | Sécurité, permissions et traçabilité                              |
| ~~Commit 3~~ | ~~API PostgreSQL~~ *(supprimé suite à une erreur de manipulation)* |
| Commit 4 | Authentification JWT (login, middleware)                          |
| Commit 5 | Upload de documents médicaux (multer, routes)                     |
| Commit 6 | Portail patient (HTML/CSS/JS, onglets, upload, badges)            |
| Commit 7 | Dashboard soignant – structure HTML/CSS (inspirée du portail)     |

> **Note** : Le commit 3 a été perdu lors d’une manipulation Git. L’ensemble de ses fonctionnalités (connexion DB, routes patients) est présent et opérationnel dans les commits 4, 5 et 6. Aucune régression n’est à signaler.

---

### État actuel

**Statut :** Base de données terminée, API REST complète, portail patient opérationnel, structure du dashboard soignant prête.

**Progression estimée :** 88 %

---

## Structure du projet

```text
MaterniteCare/
├── backend/
│   ├── database/
│   │   ├── 00_reset.sql
│   │   ├── 01_schema.sql
│   │   └── 02_seed.sql
│   ├── uploads/
│   ├── server.js
│   ├── package.json
│   └── .env.example
│
├── frontend/
│   ├── css/
│   │   └── style.css
│   ├── js/
│   │   └── portail.js
│   ├── portail.html
│   └── dashboard/
│       ├── index.html
│       ├── css/
│       │   └── style.css
│       └── js/
│           └── dashboard.js
│
├── docs/
│   └── pg_connection.png
│
└── README.md  