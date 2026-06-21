#  MaterniteCare – Plateforme de suivi obstétrical

> **Application Full-Stack** de suivi de grossesse et de gestion hospitalière  
> Centre de maternité – Pointe‑Noire, Congo

---

##  Présentation

**MaterniteCare** est une plateforme clinique et hospitalière dédiée au suivi rigoureux des patientes (suivi prénatal, accouchements, séjours en obstétrique) et à la gestion opérationnelle du personnel médical.

| Rôle | Fonctionnalités |
|------|----------------|
|  **Patientes** | Consulter rendez-vous, vaccins, documents, déposer des examens, consulter son profil et ses alertes |
|  **Soignants** | Dashboard temps réel, gestion des patientes, constantes vitales, ordonnances, accouchements, lits, alertes |

---

##  Architecture du projet

```
MaterniteCare/
├── backend/
│   ├── database/
│   │   ├── 00_reset.sql
│   │   ├── 01_schema.sql
│   │   └── 02_seed.sql
│   ├── uploads/                 (fichiers uploadés)
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
│   ├── pg_connection.png
│   ├── maternitecare.jpg
│   └── maternitecare.mdj
│
├── index.html                    (page d'accueil)
└── README.md
```

---

##  Installation et lancement

### Prérequis
- Node.js ≥ 18
- PostgreSQL ≥ 14

### 1. Base de données
```bash
# Créer la base
createdb MaterniteCare_DB

# Exécuter les scripts (dans l'ordre)
psql -U postgres -d MaterniteCare_DB -f backend/database/00_reset.sql
psql -U postgres -d MaterniteCare_DB -f backend/database/01_schema.sql
psql -U postgres -d MaterniteCare_DB -f backend/database/02_seed.sql
```

### 2. API REST
```bash
cd backend
npm install
cp .env.example .env   # renseigner DB_PASSWORD et JWT_SECRET
node server.js
```

### 3. Frontend
```bash
# Ouvrir directement dans le navigateur (Vanilla JS)
# index.html (page d'accueil)
# frontend/portail.html (espace patient)
# frontend/dashboard/index.html (espace soignant)
```

---

##  Identifiants de connexion

### Espace Patiente (code dossier)
| Patient | Code dossier |
|---------|--------------|
| Astride NGOMA | `MAT-2026-001` |
| Rosalie BOUANGA | `MAT-2026-002` |
| Joëlle MFOUTOU | `MAT-2026-003` |
| Nadège KIMPOUNI | `MAT-2026-004` |
| Francine LOUBOTA | `MAT-2026-005` |
| Sylviane MAVOUNGOU | `MAT-2026-006` |
| Béatrice NGATSONO | `MAT-2026-007` |
| Claudine BIBAYA | `MAT-2026-008` |
| Geneviève NKODIA | `MAT-2026-009` |
| Patience MADZOU | `MAT-2026-010` |

### Espace Soignant (email / mot de passe)
| Rôle | Email | Mot de passe |
|------|-------|--------------|
| **Sage‑femme** | `f.mabiala@maternite.cg` | `password` |
| **Gynécologue** | `j.nzaba@maternite.cg` | `gyneco2026` |
| **Pédiatre** | `t.moussavou@maternite.cg` | `pediatre2026` |
| **Infirmier** | `m.loubassou@maternite.cg` | `infirmier2026` |
| **Admin** | `admin@maternite.cg` | `admin2026` |

---

##  Routes API principales

| Méthode | Endpoint | Description | Accès |
|---------|----------|-------------|-------|
| `GET` | `/api/health` | Vérification du serveur | Public |
| `GET` | `/api/patients` | Liste des patientes | Public |
| `GET` | `/api/patient/public/:id` | Profil patient (public) | Public |
| `GET` | `/api/soignant/patients` | Liste patientes (avec risque) | JWT |
| `GET` | `/api/patients/:id` | Détail complet patiente | JWT |
| `POST` | `/api/auth/login` | Authentification soignant | Public |
| `POST` | `/api/upload/:codeDossier` | Upload document (patiente) | Public |
| `POST` | `/api/documents` | Upload document (soignant) | JWT |
| `GET` | `/api/rendezvous/patient/:patienteId` | Rendez-vous patiente | Public |
| `GET` | `/api/vaccinations/patient/:patienteId` | Vaccinations patiente | Public |
| `GET` | `/api/documents/patient/:patienteId` | Documents patiente | Public |
| `GET` | `/api/constantes/admission/:admissionId` | Constantes vitales | JWT |
| `POST` | `/api/constantes` | Ajouter constantes | JWT |
| `GET` | `/api/ordonnances/patient/:patienteId` | Ordonnances patiente | JWT |
| `POST` | `/api/ordonnances` | Créer ordonnance | JWT |
| `GET` | `/api/accouchements/patient/:patienteId` | Accouchements patiente | JWT |
| `POST` | `/api/accouchements` | Créer accouchement | JWT |
| `GET` | `/api/lits/workspace/:workspaceId` | Lits disponibles | JWT |
| `PATCH` | `/api/admissions/:id/lit` | Assigner lit | JWT |
| `PATCH` | `/api/lits/:id/free` | Libérer lit | JWT |
| `PATCH` | `/api/grossesses/:id/risque` | Modifier risque | JWT |
| `PATCH` | `/api/patients/:id` | Modifier patiente | JWT |
| `POST` | `/api/admissions` | Créer admission | JWT |
| `PATCH` | `/api/admissions/:id/close` | Clore admission | JWT |
| `GET` | `/api/alertes/non-traitees` | Alertes non traitées | JWT |
| `GET` | `/api/alertes/patient/:patienteId` | Alertes patiente | JWT |
| `PATCH` | `/api/alertes/:id/traiter` | Traiter alerte | JWT |
| `GET` | `/api/patient/alertes/:codeDossier` | Alertes patient (public) | Public |
| `POST` | `/api/rendezvous` | Créer rendez-vous | Public |
| `GET` | `/api/patients/search?q=` | Recherche avancée | JWT |
| `GET` | `/api/search/lot/:numero_lot` | Recherche par lot vaccin | JWT |
| `GET` | `/api/patients/:id/pdf` | Exporter dossier en PDF | JWT |

---

##  Sécurité

- **Mots de passe** : hashés avec bcrypt (12 rounds)
- **Authentification** : JWT (expiration 8h)
- **Vues SQL** : `vue_patiente_public` et `vue_soignant_restreint` pour la confidentialité
- **Upload** : contrôle MIME (JPEG, PNG, PDF) et renommage des fichiers
- **Logs** : table `log_acces` pour traçabilité
- **Alertes** : détection automatique des tensions élevées (hypertension)

---

##  Vidéo de démonstration

 **Lien YouTube** : *https://youtu.be/CQNjw0LZDbA*
 **Lien Site** : *https://darel-n22.github.io/MaterniteCare/*
---

##  Équipe

- **MOA** : Mr Webster
- **MOE** : NSIKABAKA-SAMUEL Darel 

---

*Dernière mise à jour : 21/06/2026*
