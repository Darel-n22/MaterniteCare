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

#### Frontend – Dashboard soignant

**Commits 7 et 8 – Structure et connexion**

- Structure HTML/CSS du tableau de bord.
- Design inspiré du portail patient (charte graphique cohérente).
- Connexion JWT avec stockage du token dans `localStorage`.
- Récupération et affichage de la liste des patientes.
- Injection dynamique des cartes patientes (nom, dossier, quartier, niveau de risque).

**Commit 9 – Amélioration des cartes, statistiques et marquage critique**

- **Cartes patientes enrichies** :
  - Bordure gauche colorée selon le niveau de risque (rouge = élevé, orange = modéré, gris = normal).
  - Badge de risque et badge de statut d’admission (travail actif / observation / post-partum).
  - Bouton “Marquer comme critique” (⭐) avec persistance dans `localStorage`.
  - Bouton “Voir détails” (prépare l’ouverture d’un modal).

- **Statistiques en temps réel** :
  - Nombre total de patientes.
  - Nombre de patientes à risque élevé.
  - Nombre de dossiers marqués comme critiques.

- **Recherche par lot de vaccin** (interface prête, connexion à l’API).

- **Gestion des erreurs et états vides**.

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
| Commit 7 | Dashboard soignant – structure HTML/CSS                           |
| Commit 8 | Dashboard soignant – connexion JWT et affichage des patientes     |
| Commit 9 | Dashboard soignant – amélioration cartes, stats, marquage critique |

> **Note** : Le commit 3 a été perdu lors d’une manipulation Git. L’ensemble de ses fonctionnalités (connexion DB, routes patients) est présent et opérationnel dans les commits 4, 5 et 6. Aucune régression n’est à signaler.

---

### État actuel

**Statut :** Base de données terminée, API REST complète, portail patient opérationnel, dashboard soignant avancé (cartographie des risques, statistiques, marquage critique).

**Progression estimée :** 94 %

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