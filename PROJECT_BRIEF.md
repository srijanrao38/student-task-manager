# Student Task Manager: Project Brief (Interview Prep)

> Everything below comes from the code in this repo, as of commit `9454b17` ("mysql to sqlite").
> Citations look like `path:line`. **NOT IN CODE** marks things the repo can't answer (fill these in yourself).
> "Likely" marks an inference from the code or history, not a proven fact.

---

## 0. Resume check (read this first)

| Resume claim | What the code shows | Verdict |
|---|---|---|
| **React** | CRA app, React 19, a single component (`frontend/src/App.js`, 946 lines) | ✅ Accurate |
| **Django REST Framework** | DRF is **not installed** (`requirements.txt` has no `djangorestframework`; `INSTALLED_APPS` at `backend/core/settings.py:38-49` has no `rest_framework`). All APIs are plain Django function views that return `JsonResponse` and parse `json.loads(request.body)` by hand (`backend/tasks/views.py:14-80`). There are no serializers, viewsets, routers or permission classes. | ❌ **Overstated.** Say "Django (JSON API views)", or migrate to DRF |
| **JWT** | The backend never issues, signs or checks a JWT (no `djangorestframework-simplejwt` or `PyJWT`). The only JWT is **Google's ID token**, which the frontend decodes with `jwt-decode` purely to read the name/email (`frontend/src/App.js:83-90`). Decoding is not verifying. | ❌ **Overstated** |
| **Google OAuth 2.0** | A frontend-only "Sign in with Google" button (`@react-oauth/google`, `frontend/src/index.js:11`, `App.js:542`). The ID token is **never sent to the backend**, so there's no server-side verification and no Django user is created for Google accounts. | ⚠️ **Partly true.** The Google sign-in UI exists, but it isn't real authentication |
| "Built JWT and Google OAuth 2.0 authentication and DRF APIs for task and productivity workflows, consumed by a React frontend" | Real: username/password register and login backed by Django's `User` model (`views.py:170-212`), task create/list JSON APIs, file upload, three AI endpoints, all called from React. Not real: JWT, DRF, and working per-user auth. See §6: the Django session is never stored by the browser, so the API falls back to `User.objects.first()` (`views.py:16-18`). | ❌ **Overstated** |
| "Integrated an LLM assistant for task suggestions and productivity insights" | Gemini (`gemini-2.5-flash`, `backend/tasks/utils.py:107`) is integrated, but it does **not** suggest tasks or give productivity insights. It reads text extracted from an **uploaded assignment file** (PDF/DOCX/image with OCR) and generates a **Solution, Summary or Quiz** (`utils.py:62-97`). | ⚠️ **Inaccurate description** of a real feature. Reword it |
| "Deployed on AWS EC2 (Ubuntu) with Gunicorn and Nginx, using S3 for static/media storage and IAM roles and security groups for access control" | There is **no deployment config in the repo**: no `gunicorn` or `boto3`/`django-storages` in `requirements.txt`, no Nginx/systemd/Docker/CI files, no `STATIC_ROOT`, no S3 settings. As written, the settings can't serve production: `DEBUG = True` (`settings.py:31`), `ALLOWED_HOSTS = []` (`settings.py:33`), the frontend hardcodes `http://localhost:8000` (`App.js:58,94,114,142,161,190,229`), and CORS allows only localhost (`settings.py:144-147`). Media files live on local disk (`settings.py:137-138`), not S3. | ❌ **NOT IN CODE.** If you really deployed it, the config lives outside the repo and you need to know it cold. If you didn't, remove the line or deploy it for real first |

**Missing from the resume (real features you could claim):**
- File upload (PDF/DOCX/JPG/PNG) with extension validation (`views.py:215-245`)
- Text extraction pipeline: `pypdf` for PDFs, `python-docx` for Word, **EasyOCR** (PyTorch) for images (`utils.py:7-51`)
- Gemini integration with three prompt templates and a mock fallback when no API key is set (`utils.py:54-112`)
- Cached AI results per task per type (`AIResponse` with `update_or_create`, `views.py:286-293`)
- Export AI output to PDF via the browser's print dialog (`App.js:262-392`)
- Tailwind UI with dark mode, toasts, loading states and a stats dashboard (`App.js:20-43, 460-466`)
- Django admin with list filters and search (`backend/tasks/admin.py`)

**A suggested honest rewrite (adjust to what you actually do next):**
> React • Django • Google Gemini API • EasyOCR • Tailwind
> - Built a Django JSON API and React frontend for student task management (CRUD, status tracking, file uploads), with username/password auth and Google Sign-In.
> - Built an AI study assistant: extracts text from uploaded PDFs, DOCX and images (pypdf, python-docx, EasyOCR OCR) and uses Gemini 2.5 Flash to generate step-by-step solutions, study summaries and practice quizzes, with results cached per task and exportable to PDF.

If you want to keep the original bullets, the gaps you'd need to close are listed in §11 (DRF + SimpleJWT, backend verification of the Google ID token, a real EC2/Gunicorn/Nginx/S3 deployment with its config committed).

---

## 1. Overview

**What it is:** a web app where students track study tasks (assignments) and use AI to help with them. You create a task (title, subject, due date, priority), attach the assignment file, and ask Gemini to produce a solution, a summary or a practice quiz from it.

**Two UIs exist in the repo:**
1. **React SPA** (`frontend/src/App.js`): the main UI, talks to `/api/...` JSON endpoints.
2. **Older Django server-rendered UI** (`backend/tasks/templates/`, `backend/templates/`): Bootstrap templates for home/add/edit/delete/toggle with Django session login. This looks like the first version of the project (it existed in the initial commit `7061328`).

**Main user flows (React):**
1. **Sign up**: Full name, email, username, password → `POST /api/register/` (`App.js:53-81`, `views.py:170-185`).
2. **Sign in**: username/password → `POST /api/login/` (`views.py:187-212`), **or** Google button → token decoded in the browser only (`App.js:83-90`).
3. **Dashboard**: fetches `GET /api/tasks/` (`App.js:92-107`) and shows six stats: total, completed, pending, files, AI responses, and a made-up "Study Hours Saved" = `AIResponses×1.5 + files×0.5` (`App.js:461-466`).
4. **Add task** → `POST /api/tasks/` (`App.js:109-139`).
5. **Toggle status** (PENDING ⇄ COMPLETED) by clicking the badge → `POST /toggle_status/<id>/` (`App.js:141-156`).
6. **Delete task** → `POST /delete_task/<id>/` (`App.js:158-172`). **Broken**: see §11.
7. **Upload assignment** → `POST /api/tasks/<id>/upload/` (`App.js:175-213`).
8. **Generate Solution / Summary / Quiz** → `POST /api/tasks/<id>/generate-<type>/` (`App.js:216-259`); the result shows in a tabbed panel (`App.js:879-937`).
9. **Download PDF** of the AI output, via a new window with `window.print()` (`App.js:262-392`).
10. **Dark mode** toggle, saved in `localStorage` (`App.js:21-38`).
11. **Logout**: clears React state only (`App.js:605-613`). There's no server call.

**Features in the Django template UI:** register (`views.py:119-128`), login/logout via `django.contrib.auth.urls` (`core/urls.py:25`), add and list tasks (`views.py:83-114`), edit (`views.py:138-148`), delete, toggle.

**Features that do NOT exist (despite what the resume implies):** JWT auth, DRF, token refresh, AI task suggestions, productivity insights, a task description in the UI (the field exists in the model at `models.py:18` but is never exposed), task editing in React, search/filter in React, notifications or reminders, any deployment.

---

## 2. Tech stack

### Backend (`requirements.txt`, current)

| Package | Version | Used for | Where |
|---|---|---|---|
| Django | 5.2.6 (pinned) / **6.0.1 actually installed in `venv`** | Web framework, ORM, auth, admin, templates | everywhere |
| django-cors-headers | 4.9.0 | Lets the React dev server (`:3000`) call the API (`:8000`) | `settings.py:46,52,144-152` |
| google-generativeai | 0.8.6 | Gemini SDK (`genai.configure`, `GenerativeModel`) | `utils.py:4,106-110` |
| python-dotenv | 1.2.2 | Loads `backend/.env` (holds `GEMINI_API_KEY`) | `settings.py:15,21` |
| pypdf | 6.14.2 | PDF text extraction | `utils.py:2,19-21` |
| python-docx | 1.2.0 | DOCX text extraction | `utils.py:3,27-28` |
| easyocr | 1.7.2 | OCR for JPG/PNG (English, CPU) | `utils.py:35-38` |
| torch / torchvision | 2.12.1 / 0.27.1 | Required by EasyOCR (deep-learning OCR model) | indirect |
| opencv-python-headless | 4.13.0.92 | EasyOCR image processing | indirect |
| numpy, scipy, scikit-image, pillow, shapely | 2.5.0, 1.18.0, 0.26.0, 12.2.0, 2.1.2 | EasyOCR dependencies (Pillow is also needed for `FileField` / image handling) | indirect |
| reportlab | 5.0.0 | **Not imported anywhere.** PDF export happens in the browser | unused |
| requests | 2.34.2 | Not imported directly | unused / transitive |
| lxml | 6.1.1 | python-docx dependency | indirect |
| pytesseract | **not listed** | Imported as an OCR fallback (`utils.py:42`) but never installed, so the fallback always fails | missing |

**Not present** (relevant to the resume): `djangorestframework`, `djangorestframework-simplejwt`, `PyJWT`, `google-auth` (for ID-token verification; it shows up in the first `pip freeze` only as a Gemini dependency), `gunicorn`, `boto3`, `django-storages`, `psycopg`, `whitenoise`.

### Frontend (`frontend/package.json`)

| Package | Version | Used for | Where |
|---|---|---|---|
| react / react-dom | ^19.2.4 | UI | `App.js`, `index.js` |
| react-scripts | 5.0.1 | Create React App build/dev server | `package.json:14,17-22` |
| @react-oauth/google | ^0.13.4 | `GoogleOAuthProvider` + `GoogleLogin` button | `index.js:5,11`, `App.js:2,542` |
| jwt-decode | ^4.0.0 | Decode Google ID token (no verification) | `App.js:3,84` |
| @testing-library/* | dom ^10.4.1, jest-dom ^6.9.1, react ^16.3.2, user-event ^13.5.0 | Only the default CRA test, which is stale and would fail | `App.test.js` |
| web-vitals | ^2.1.4 | `reportWebVitals.js` exists but `index.js` never calls it | unused |
| tailwindcss / postcss / autoprefixer | 3.4.19 / 8.5.6 / 10.4.24 (from the lockfile) | Styling. **Not declared in `package.json`**; they work only because `react-scripts` pulls them in transitively | `tailwind.config.js`, `postcss.config.js`, `index.css` |

### Other
- **Bootstrap 5.3.8** via CDN in the Django templates (`backend/templates/base.html:7,47`).
- **Database:** SQLite (`settings.py:89-94`). It used to be MySQL (see §9).
- **LLM:** Google Gemini `gemini-2.5-flash` (`utils.py:107`).

---

## 3. System design / architecture

### Component diagram (as built)

```
                    ┌─────────────────────────────┐
                    │  Google Identity Services    │
                    │  (accounts.google.com)       │
                    └──────────────▲──────────────┘
                                   │ ID token (JWT) returned to browser
                                   │ (never forwarded to backend)
┌──────────────────────────────────┴───────────────────────────┐
│ Browser: React SPA (CRA dev server, http://localhost:3000)    │
│  App.js: auth forms, dashboard, upload, AI panels, PDF print  │
│  localStorage: only "theme"                                   │
└──────────────────────────────┬────────────────────────────────┘
                               │ fetch() JSON / multipart, hardcoded
                               │ http://localhost:8000 (CORS)
┌──────────────────────────────▼────────────────────────────────┐
│ Django 6.0.1 dev server (manage.py runserver, :8000)          │
│  core/        settings, root URLs                             │
│  tasks/       function views → JsonResponse                   │
│  tasks/utils  extract_text_from_file() + call_gemini_api()    │
│  templates/   legacy Bootstrap UI + /admin                    │
└───────┬───────────────────────┬───────────────────────┬───────┘
        │ ORM                   │ local disk             │ HTTPS (SDK)
┌───────▼────────┐   ┌──────────▼──────────┐   ┌─────────▼──────────┐
│ SQLite          │   │ backend/media/      │   │ Google Gemini API  │
│ backend/        │   │  task_files/        │   │ gemini-2.5-flash   │
│ db.sqlite3      │   │ (MEDIA_ROOT)        │   │ key: backend/.env  │
└────────────────┘   └─────────────────────┘   └────────────────────┘

S3, EC2, Nginx, Gunicorn, IAM: NOT IN CODE
```

### Request flows

**(a) Login with Google OAuth** (`index.js:11`, `App.js:83-90,542`)
1. `GoogleOAuthProvider` loads Google Identity Services with a hardcoded client ID.
2. The user clicks `<GoogleLogin>`, and Google returns a `credentialResponse.credential` (a signed **ID token**, which is a JWT).
3. `jwtDecode()` reads `name`/`email` from the token **without checking its signature**.
4. `setUser({name, email})` → the dashboard renders → `GET /api/tasks/` with **no token attached**.
5. Backend: `request.user` is anonymous → falls back to `User.objects.first()` (`views.py:16-18`).
- **Net effect:** the Google login only exists on the client. The backend doesn't know who you are.

**(b) "JWT login and token refresh"**: **does not exist.** What exists is username/password login using a Django session:
1. `POST /api/login/` with `{username, password}` (`App.js:58-62`). `fullName` and `email` are sent as well but ignored.
2. `authenticate()` checks the hash in `auth_user`, then `login(request, user)` creates a server-side session and sends `Set-Cookie: sessionid` (`views.py:196-199`).
3. The response is `{"status":"success","user":{"name","email"}}` → React `setUser` (`App.js:66-68`).
4. **But** the fetch doesn't set `credentials: "include"`, and `:3000` → `:8000` is cross-origin, so the browser **throws away the session cookie**. Later requests are anonymous → `User.objects.first()`.
- There is no token refresh or expiry handling in the frontend. Login state lives only in React memory, so a page refresh logs you out.

**(c) Creating a task** (`App.js:109-139` → `views.py:59-80`)
1. Client-side check on the title (`App.js:110`).
2. `POST /api/tasks/` JSON `{title, subject, priority, due_date}`. If no due date is picked, it defaults to today (`App.js:124`). This one call does use `credentials: "include"` (`App.js:119`), but there's no cookie to send.
3. The view is `@csrf_exempt`. It resolves the user (falling back to the first user), runs `json.loads`, then `Task.objects.create(...)` with `status="PENDING"`.
4. It returns the task as JSON with empty `files` and `ai_responses`, and React adds it to the top of the list.
- No validation: a missing key → `KeyError` → 500; an invalid priority is stored as-is; `subject` > 20 chars passes on SQLite.

**(d) Asking the LLM assistant** (`App.js:216-259` → `views.py:248-318` → `utils.py`)
1. The client checks that the task has at least one file (`App.js:218`).
2. `POST /api/tasks/<id>/generate-solution|summary|quiz/` with an empty body.
3. `process_ai_action`: resolve the user → `get_object_or_404(Task, id, user)` → load all `TaskFile`s (returns 400 if there are none).
4. For each file, `extract_text_from_file(path)`: pypdf / python-docx / EasyOCR. Texts are joined with `--- Content from <name> ---` headers.
5. `call_gemini_api(type, text)`: builds `prompt + "\n\nHere is the extracted content…\n\n" + text`, then `GenerativeModel("gemini-2.5-flash").generate_content(...)`. If no key is set, it returns a canned mock answer.
6. `AIResponse.objects.update_or_create(task, response_type, defaults=…)`, so there's one cached answer per task per type.
7. The response JSON goes to React, which stores it under `task.ai_responses[type]` and opens that tab. SOLUTION text is parsed into Q/A/Explanation cards with a regex (`App.js:395-422`).
- Everything happens **synchronously inside one HTTP request** (OCR + LLM).

### Folder structure

```
student-task-manager/
├── requirements.txt              backend Python deps (trimmed, see §9)
├── .gitignore                    ignores backend/.env, db.sqlite3, media, static
├── backend/
│   ├── manage.py
│   ├── .env                      GEMINI_API_KEY (git-ignored)
│   ├── db.sqlite3                committed, but empty (0 bytes)
│   ├── media/task_files/         uploaded assignments (git-ignored)
│   ├── core/                     Django project: settings.py, urls.py, wsgi.py, asgi.py
│   ├── templates/                base.html (Bootstrap), registration/login.html, register.html
│   └── tasks/                    the only Django app
│       ├── models.py             Task, TaskFile, AIResponse
│       ├── views.py              JSON API views + legacy template views
│       ├── urls.py               all routes
│       ├── utils.py              text extraction + Gemini call + mock responses
│       ├── admin.py              admin registrations
│       ├── migrations/           0001 initial, 0002 typo fix, 0003 files/AI
│       ├── templates/tasks/      home.html, edit_task.html
│       └── tests.py              empty
└── frontend/                     Create React App
    ├── package.json
    ├── tailwind.config.js        darkMode: 'class'
    ├── postcss.config.js
    ├── public/                   CRA defaults
    └── src/
        ├── index.js              mounts App inside GoogleOAuthProvider
        ├── App.js                the entire app (one component, ~25 handlers)
        ├── index.css             Tailwind directives
        ├── App.css, logo.svg, reportWebVitals.js, setupTests.js   CRA leftovers
        └── App.test.js           stale default test
```

There's only **one Django app (`tasks`)** and **one React component (`App`)**: no routing, no components folder, no API client module, no state library.

---

## 4. Database

All models are in `backend/tasks/models.py`. Users come from Django's built-in `auth.User`.

### Task (`models.py:4-35`)
| Field | Type | Notes |
|---|---|---|
| id | BigAutoField PK | `DEFAULT_AUTO_FIELD` (`settings.py:143`) |
| user | FK → auth.User, `on_delete=CASCADE` | owner |
| title | CharField(200) | |
| description | TextField, blank=True | never used by any view |
| subject | CharField(**20**) | short; SQLite doesn't enforce the length |
| due_date | DateField | required |
| priority | CharField(10), choices LOW/MEDIUM/HIGH, default MEDIUM | choices aren't validated by `objects.create` |
| status | CharField(10), choices PENDING/COMPLETED, default PENDING | |
| created_at | DateTimeField(auto_now_add) | renamed from the typo `cretaed_at` (migration 0002) |
| updated_at | DateTimeField(auto_now) | |

### TaskFile (`models.py:38-44`)
| Field | Type |
|---|---|
| id | BigAutoField PK |
| task | FK → Task, CASCADE |
| file | FileField(upload_to='task_files/') → `backend/media/task_files/` |
| uploaded_at | DateTimeField(auto_now_add) |

### AIResponse (`models.py:47-61`)
| Field | Type |
|---|---|
| id | BigAutoField PK |
| task | FK → Task, CASCADE |
| response_type | CharField(20), choices SOLUTION/SUMMARY/QUIZ, default SOLUTION |
| extracted_text | TextField (stores the full extracted document text again) |
| generated_answer | TextField |
| created_at | DateTimeField(auto_now_add) |

### Relationships and indexes
- `User 1──N Task 1──N TaskFile`, `Task 1──N AIResponse`.
- **Indexes:** only the automatic ones: the PKs and Django's automatic index on each FK (`task.user_id`, `taskfile.task_id`, `airesponse.task_id`). There is no `Meta`, no `indexes`, no `ordering`, no `unique_together`/`UniqueConstraint`.
- The code treats (task, response_type) as unique (`update_or_create` at `views.py:286`), but the DB doesn't enforce it. Two concurrent requests could create duplicates, and after that `update_or_create` raises `MultipleObjectsReturned`.
- Deleting a Task cascades to its rows, but **the files on disk are not deleted** (Django doesn't delete FileField files automatically).

### ER diagram
```
┌────────────────┐        ┌──────────────────────┐
│ auth_user      │        │ tasks_task           │
│────────────────│ 1    N │──────────────────────│
│ id PK          │◄───────│ user_id FK (idx)     │
│ username UNIQ  │        │ id PK                │
│ email          │        │ title, description   │
│ password(hash) │        │ subject, due_date    │
│ first_name ... │        │ priority, status     │
└────────────────┘        │ created_at,updated_at│
                          └─────▲──────────▲─────┘
                              1 │          │ 1
                     N ┌────────┘          └────────┐ N
          ┌────────────┴────────┐     ┌─────────────┴─────────┐
          │ tasks_taskfile      │     │ tasks_airesponse      │
          │─────────────────────│     │───────────────────────│
          │ id PK               │     │ id PK                 │
          │ task_id FK (idx)    │     │ task_id FK (idx)      │
          │ file (path string)  │     │ response_type         │
          │ uploaded_at         │     │ extracted_text        │
          └─────────────────────┘     │ generated_answer      │
                                      │ created_at            │
                                      └───────────────────────┘
```

---

## 5. API

All routes are in `backend/tasks/urls.py:8-25` (mounted at `/`) plus `backend/core/urls.py:22-29`. "Auth" means what the code actually enforces.

### JSON endpoints (used by React)

| Method | URL | View | Auth actually enforced | Request | Response |
|---|---|---|---|---|---|
| GET | `/api/tasks/` | `api_task` (`views.py:14-57`) | **None.** Anonymous → first user in the DB | – | `[{id,title,subject,priority,status,due_date,files:[{id,name,url}],ai_responses:{TYPE:{id,response_type,extracted_text,generated_answer,created_at}}}]`, newest first |
| POST | `/api/tasks/` | `api_task` (`views.py:59-80`) | None (same fallback), `@csrf_exempt` | JSON `{title, subject, priority, due_date?}` | the created task object (same shape, empty files/ai_responses) |
| PUT/DELETE/etc. | `/api/tasks/` | `api_task` | – | – | **Bug:** the view returns `None` → Django raises a 500 |
| POST | `/api/register/` | `register_user` (`views.py:170-185`) | None, `@csrf_exempt` | JSON `{username, email, password, first_name?}` (React sends `fullName`, which is ignored) | `{status:"success",message}` or 400 `{status:"error",message:str(e)}`. A GET returns `None` → 500 |
| POST | `/api/login/` | `manual_login` (`views.py:187-212`) | None, `@csrf_exempt` | JSON `{username, password}` | `{status:"success",user:{name,email}}` + Set-Cookie sessionid; 401 on bad credentials; 405 for non-POST |
| POST | `/api/tasks/<id>/upload/` | `upload_file` (`views.py:215-245`) | Fallback user; task must belong to that user | multipart `file` (.pdf/.docx/.jpg/.jpeg/.png) | 201 `{id,name,url}`; 400 if no file or bad type; 405 |
| POST* | `/api/tasks/<id>/generate-solution/` | `generate_solution` → `process_ai_action` | Fallback user; ownership checked | none | `{id,response_type,extracted_text,generated_answer,created_at}`; 400 if no files or no text; 500 if Gemini fails |
| POST* | `/api/tasks/<id>/generate-summary/` | same | same | none | same |
| POST* | `/api/tasks/<id>/generate-quiz/` | same | same | none | same |
| POST* | `/toggle_status/<id>/` | `toggle_status` (`views.py:150-167`) | **None, and no ownership check** (`views.py:153`) | none | `{id,status}` |

\* The method isn't checked. A GET works too, which means a link or `<img>` tag can trigger these.

### Template / legacy endpoints

| Method | URL | View | Auth | Notes |
|---|---|---|---|---|
| GET/POST | `/` | `home` (`views.py:83-114`) | `@login_required` (session) | HTML list + add form |
| GET/POST | `/register/` | `register` (`views.py:119-128`) | none | `UserCreationForm` |
| POST (any) | `/delete/<id>/` | `delete_task` (`views.py:130-136`) | `@login_required` + ownership | Returns JSON. **React calls `/delete_task/<id>/` instead, which is a 404** |
| GET/POST | `/edit/<id>/` | `edit_task` (`views.py:138-148`) | `@login_required` + ownership | HTML form |
| * | `/accounts/login/`, `/accounts/logout/`, password reset … | `django.contrib.auth.urls` (`core/urls.py:25`) | – | |
| * | `/admin/` | Django admin, registered **twice** (`core/urls.py:23` and `tasks/urls.py:21`), which triggers warning `urls.W005` | staff | |
| GET | `/media/...` | `static()` helper, only when `DEBUG` is on (`core/urls.py:28-29`) | **none** | Uploaded files are public to anyone who knows the URL |

---

## 6. Authentication in depth

### What actually exists
1. **Django username/password auth** (`django.contrib.auth`): PBKDF2 password hashing (Django default), the four default password validators (`settings.py:100-113`, although `create_user` in `register_user` **skips the validators**, so the API accepts weak passwords; only the template `UserCreationForm` runs them).
2. **Django sessions**: `login()` (`views.py:199`) stores a session in the DB-backed session table and sets the `sessionid` cookie (HttpOnly, SameSite=Lax by default).
3. **Google Sign-In on the frontend only.**

### JWT: issued / stored / sent / refreshed / expired?
| Question | Answer from code |
|---|---|
| Issued? | **No.** The backend never creates a JWT |
| Stored on frontend? | Nothing auth-related is stored. `localStorage` only holds `theme` (`App.js:22,33,36`). The user object lives in React state (`App.js:11`), so a refresh logs you out |
| Sent? | No `Authorization` header anywhere. Only one fetch sets `credentials: "include"` (`App.js:119`) |
| Refreshed / expired? | No refresh logic. The only expiry is the Django session's (2 weeks by default), and that cookie is never kept by the browser anyway |

### Why per-user auth doesn't work end to end
- React (`:3000`) and Django (`:8000`) are **different origins**. A `fetch` without `credentials: "include"` **ignores `Set-Cookie`** on the response and sends no cookies. `handleAuth` (`App.js:58`) doesn't set it, so the session from `/api/login/` is never stored.
- So every later API call is anonymous. Instead of returning 401, the views silently use `User.objects.first()` (`views.py:16-18, 218-219, 250-251`).
- **Result:** every visitor, logged in or not and whether via Google or password, reads and writes **the first user's tasks**. The login screen is effectively cosmetic. The server-side `if not current_user: return 401` only fires when the DB has zero users.

### Google OAuth implementation
- `GoogleOAuthProvider clientId="…apps.googleusercontent.com"` is hardcoded (`index.js:11`). A client ID is public by design, so that part is fine, but it belongs in `REACT_APP_GOOGLE_CLIENT_ID`.
- `GoogleLogin` uses Google Identity Services and returns an **ID token** (OpenID Connect). It doesn't return an OAuth access token, and no "authorization code" flow runs.
- `jwtDecode` only base64-decodes the payload (`App.js:84`). **Anyone can forge a token** with any name/email, and the client would accept it.
- The backend has no Google endpoint, no `google-auth` verification (`id_token.verify_oauth2_token`) and no user mapping.

### Security weaknesses
1. Fallback to `User.objects.first()` lets anyone act as user #1, with no auth needed (`views.py:16-18`). It also means **data leaks between users**.
2. `toggle_status` has no auth and no ownership check, so anyone can flip any task (an IDOR) (`views.py:150-153`).
3. `@csrf_exempt` on every JSON view, together with `CORS_ALLOW_CREDENTIALS=True`. If sessions did work, CSRF would be open on state-changing endpoints.
4. Google ID token isn't verified on the server; client-side decode only.
5. `SECRET_KEY` is hardcoded and committed (`settings.py:28`). Anyone with repo access can forge session cookies and password-reset tokens. Rotate it and load it from env.
6. `DEBUG = True` (`settings.py:31`) leaks stack traces and settings on errors.
7. **The MySQL root password is in git history** (the `settings.py` diff in commit `9454b17`, present since `7061328`). Change that password anywhere you reused it; consider rewriting history if the repo is public.
8. The register API skips password validators (`views.py:176-180`) and returns raw exception text (`views.py:185`), which allows username enumeration and internal-error leaks.
9. Uploaded files are publicly served by URL with no auth (`core/urls.py:28-29`).
10. No rate limiting on login (brute force) or on AI endpoints (cost abuse).
11. Logout is client-only (`App.js:607`). There's no server-side `logout()`.
12. XSS in PDF export: task title and AI output are interpolated **unescaped** into `document.write` HTML (`App.js:351,362-367,373,390`). A task titled `<img src=x onerror=…>`, or a malicious document that makes the LLM emit HTML/JS, runs script in a window opened by the app.

### How you'd fix it (good interview talking point)
- Add **DRF + SimpleJWT**: `/api/token/` (access 5–15 min, refresh 1–7 days, rotation + blacklist). Put `IsAuthenticated` on all task views and filter querysets by `request.user`.
- **Google:** send `credential` to `POST /api/auth/google/`; the backend verifies it with `google.oauth2.id_token.verify_oauth2_token(token, requests.Request(), CLIENT_ID)`, checks `aud`/`iss`/`exp`/`email_verified`, does `get_or_create` on the user by `sub`/email, and returns the app's own JWT pair.
- **Storage:** keep the access token in memory and the refresh token in an **HttpOnly, Secure, SameSite cookie** (avoids localStorage XSS theft). Or keep sessions and simply add `credentials: "include"` + CSRF tokens, which is simpler for a same-site SPA.
- Remove every `User.objects.first()` fallback, and remove `@csrf_exempt`.

---

## 7. The LLM feature

| Aspect | Code |
|---|---|
| Provider / SDK | Google Gemini via `google-generativeai` 0.8.6 (`utils.py:4`). That SDK is Google's older one; the newer replacement is `google-genai` |
| Model | `gemini-2.5-flash`, hardcoded (`utils.py:107`) |
| API key | `GEMINI_API_KEY` in `backend/.env` (git-ignored, `.gitignore:1`), loaded by `load_dotenv` (`settings.py:21`) into `settings.GEMINI_API_KEY` (`settings.py:155`). Read again with an `os.environ` fallback (`utils.py:59`). It never goes to the frontend. ✅ |
| Prompt building | Three fixed instruction templates: SOLUTION (per-question Answer + Explanation in a strict format), SUMMARY (key concepts, points, exam tips in Markdown), QUIZ (10 MCQs + 5 short answers) (`utils.py:62-97`). Final prompt = `template + "\n\nHere is the extracted content from the document:\n\n" + text` (`utils.py:108`). A single user message: no system instruction, no generation config (temperature, max tokens), no chat history |
| What user data is sent | The **full extracted text of every file** attached to the task, with filenames (`views.py:266-271`). Task title, subject and user identity are **not** sent. No PII scrubbing and no truncation |
| Text extraction | PDF: pypdf page text (scanned PDFs return nothing, so you get a 400 "Could not extract any text"). DOCX: paragraphs only (tables, headers and images are skipped). `.doc` is accepted by `utils.py:25`, but python-docx can't read legacy `.doc` files, and the upload view rejects `.doc` anyway. Images: EasyOCR English on CPU, with a `pytesseract` fallback that isn't installed (`utils.py:32-47`) |
| Error handling | Per-file extraction errors are collected and reported only if *all* files fail (`views.py:272-279`). A Gemini exception gets wrapped as `ValueError` → the view returns 500 `{"error":"AI Generation failed: Gemini API Error: …"}` (`utils.py:111-112`, `views.py:302-303`). No retries or backoff, no timeout, and `response.text` can raise if the response was blocked by safety filters (that's caught by the same handler) |
| Missing key | Returns **hardcoded mock answers** about databases, whatever the document is (`utils.py:101-103, 115-178`), and prints a warning. Handy for dev, but it can silently ship fake output |
| Caching | Results persist in `AIResponse`. Re-clicking a button **calls Gemini again** and overwrites the stored result (`update_or_create`); the existing result isn't reused. `extracted_text` is also re-sent to the client in every GET |
| Cost / rate limits | **NOT IN CODE.** No per-user quota, no throttling, no token counting, no input-size cap. Combined with the auth fallback, anyone could run up the bill. Flash pricing and quota tier: NOT IN CODE |
| Output handling | React shows it as plain text (safe, since React escapes). SOLUTION is regex-split on `Question N:` / `Answer:` / `Explanation:` (`App.js:395-422`). Summary/quiz Markdown is shown **raw** (no Markdown renderer). PDF export is the XSS issue in §6 |
| Performance | `easyocr.Reader(['en'])` is constructed **on every image, on every request** (`utils.py:36`), which reloads the PyTorch model each time (slow, and uses a lot of RAM). Everything runs synchronously in the request thread |

---

## 8. Deployment and config

### `backend/core/settings.py` (current values)
| Setting | Value | Production-ready? |
|---|---|---|
| `SECRET_KEY` | hardcoded literal (`:28`) | ❌ move to env |
| `DEBUG` | `True` (`:31`) | ❌ |
| `ALLOWED_HOSTS` | `[]` (`:33`). With DEBUG off, every request → 400 | ❌ |
| `DATABASES` | SQLite `BASE_DIR/db.sqlite3` (`:89-94`) | ⚠️ fine for a demo, not for concurrency |
| `CORS_ALLOWED_ORIGINS` | `localhost:3000`, `127.0.0.1:3000` (`:144-147`) | ❌ no prod origin |
| `CORS_ALLOW_CREDENTIALS` | `True` (`:152`) | – |
| `CSRF_TRUSTED_ORIGINS` | localhost only (`:148-151`), and pointless while views are `csrf_exempt` | ❌ |
| `STATIC_URL` | `'static/'` (`:135`); **no `STATIC_ROOT`**, so `collectstatic` would fail | ❌ |
| `MEDIA_URL` / `MEDIA_ROOT` | `/media/`, `BASE_DIR/media` (`:137-138`): local disk | ❌ (not S3) |
| `LOGIN_URL` / redirects | `'login'`, `'/'` (set twice, `:83` and `:115`), logout → `/accounts/login/` | – |
| `TIME_ZONE` | `UTC`, `USE_TZ=True` | ✅ |
| HTTPS settings | none (`SECURE_*`, `SESSION_COOKIE_SECURE`, `CSRF_COOKIE_SECURE`, HSTS) | ❌ |
| Logging | none (only a `print` at `utils.py:102`) | ❌ |
| S3 / django-storages | **NOT IN CODE** | ❌ |

### Environment variables
- `GEMINI_API_KEY`: the only one (the `backend/.env` file contains just this key).
- Frontend: none. The API base URL (`http://localhost:8000`) and Google client ID are hardcoded.

### Deploy files in repo
- Gunicorn config, Nginx conf, systemd unit, Dockerfile, docker-compose, CI workflow, Procfile, shell scripts: **none found**.
- `core/wsgi.py` / `core/asgi.py` are the Django defaults. Gunicorn *could* serve `core.wsgi:application`, but `gunicorn` isn't in `requirements.txt`.
- EC2 instance type, Ubuntu version, domain, HTTPS/certbot, security group rules, IAM role, S3 bucket: **NOT IN CODE**.
- How the React build is served (Nginx static? S3?): **NOT IN CODE**. Also, `npm run build` would still point at `localhost:8000`.

**What a real EC2 deploy needs that's missing:** `gunicorn` + a systemd unit; Nginx proxying `/api` → `127.0.0.1:8000` and serving `build/` + `/static`; `STATIC_ROOT` + `collectstatic`; `django-storages[s3]` + `boto3` with an EC2 **instance role** (no access keys) and `STORAGES = {"default": {"BACKEND": "storages.backends.s3.S3Storage"}}`; env-driven `SECRET_KEY`/`DEBUG`/`ALLOWED_HOSTS`/CORS; `REACT_APP_API_URL`; HTTPS; a security group allowing only 80/443 publicly (plus 22 from your IP). Also note: EasyOCR/PyTorch needs well over 1 GB of RAM, so a t2.micro/t3.micro would struggle (OOM risk).

---

## 9. Problems and fixes (from git history and code)

Git history (`git log`): 6 commits.

| Commit | Date | Message | What changed |
|---|---|---|---|
| `7061328` | 2026-03-01 | Merged frontend and backend into a single repository | Initial import: Django template app + basic React (334-line App.js) |
| `ec419d5` | 2026-06-25 | ai integration | +1102/-233: TaskFile/AIResponse models, utils.py, AI endpoints, React redesign (Tailwind, dark mode, toasts), `.gitignore`, `.env` loading |
| `5813965` | 2026-06-25 | added dowload | PDF export (+147 lines in App.js) |
| `ca193f8` | 2026-06-26 | adding requirement file | 67-line `pip freeze` |
| `e145990` | 2026-06-26 | edit | removed `grpcio-status==1.71.2` |
| `9454b17` | 2026-06-26 | mysql to sqlite | MySQL → SQLite; requirements trimmed to 23 lines; **Django 6.0.1 → 5.2.6**; `mysqlclient` removed |

Likely problems you hit, and what the code shows you did about them:

1. **Session auth didn't work from React.** Symptom: `request.user` was anonymous in the API views (cross-origin cookie, see §6). Workaround in code: `if current_user.is_anonymous: current_user = User.objects.first()` (`views.py:16-18`, repeated three times). That makes the demo work, but it isn't a real fix. The real fix is `credentials: "include"` + CSRF, or token auth.
2. **CSRF 403s on React POSTs.** Fixed by `@csrf_exempt` on every JSON view; the comment at `views.py:131` says so directly ("Add this if you aren't sending CSRF tokens from React").
3. **CORS errors** (React on :3000 → Django on :8000). Fixed with `django-cors-headers`, placing `CorsMiddleware` first (`settings.py:52`) and allowing the localhost origins.
4. **Typo in a model field.** `cretaed_at` → `created_at` via migration `0002_rename_cretaed_at_task_created_at.py`.
5. **MySQL setup pain → SQLite.** Commit `9454b17` removes MySQL config and `mysqlclient`. Likely reason: `mysqlclient` needs native build libs (`libmysqlclient-dev`, `pkg-config`), plus a running MySQL server and credentials on the target machine. Actual reason: NOT IN CODE.
6. **Dependency install failures.** `grpcio-status==1.71.2` was removed (`e145990`), likely a version conflict with `protobuf==5.29.6`/`grpcio==1.81.1` (an inference). Then the freeze was trimmed to top-level packages, and Django was **downgraded to 5.2.6**. Django 6.0 needs Python ≥ 3.12, so a likely trigger is a server with an older Python (e.g. Ubuntu 22.04 ships 3.10). Reason: NOT IN CODE.
   - ⚠️ **That downgrade broke a clean install.** `backend/tasks/urls.py:1` has `from django.tasks import task`; the `django.tasks` module only exists in Django 6.0+. On 5.2.6 the URLconf raises `ModuleNotFoundError` and the app won't start. The import is unused (probably an IDE auto-import), so deleting it fixes this. Your local `venv` still has Django 6.0.1, which is why it works on your machine.
7. **Images with no text layer.** Fixed by adding EasyOCR, with a pytesseract fallback (`utils.py:32-47`). The fallback package was never added to the requirements.
8. **Developing without an API key / saving quota.** Fixed with mock responses (`utils.py:101-103`).
9. **Unstructured LLM output was hard to display.** Fixed by forcing a strict "Question N / Answer / Explanation" format in the prompt (`utils.py:72-78`) and regex-parsing it on the client (`App.js:395-422`).
10. **PDF download without a backend library.** Done with the browser's print dialog (`App.js:262-392`). `reportlab` stayed in the requirements but is unused, so this was likely the plan B.
11. **Secrets.** `.gitignore` for `.env` arrived with the AI commit. The DB password was already in history by then, and `SECRET_KEY` is still committed.
12. **Repo hygiene.** `__pycache__/*.pyc` files are committed (the ignore rule only covers `backend/__pycache__/`, not `backend/*/__pycache__/`), and `db.sqlite3` is tracked despite being in `.gitignore` (it was committed before the rule existed).

No TODO/FIXME comments exist. There's no commented-out code, apart from the `{/* Replace the text below with your actual Client ID */}` note at `index.js:10`.

---

## 10. Design decisions

The actual reasons for these choices are **NOT IN CODE**. Below: the likely reason, the alternatives, and the trade-offs, so you can give an informed answer. Make sure what you say matches the truth.

| Decision | Likely reason | Alternatives | Trade-offs |
|---|---|---|---|
| **Django (plain views, not DRF)** | Batteries included: ORM, migrations, auth, admin, file uploads. The project began as a server-rendered Django app | DRF (serializers, auth classes, throttling, browsable API); FastAPI (async, Pydantic, auto OpenAPI, which suits slow LLM calls); Node/Express | Plain views = less to learn, but hand-rolled validation and auth and inconsistent errors. DRF would remove most of the bugs in §11. FastAPI is better for async I/O but you'd lose Django admin/auth |
| **Sessions (current) vs JWT** | Django sessions come free with `login()` | JWT via SimpleJWT; session + CSRF with `credentials: include` | Sessions: easy to revoke and HttpOnly, but need CSRF handling and cookie setup across origins. JWT: stateless and good for mobile or multiple services, but revocation is hard, refresh needs designing, and storing it raises the XSS-vs-CSRF question. For a single SPA on one domain, sessions are a perfectly good answer |
| **SQLite (after MySQL)** | Zero setup, no server, file-based; dodged the `mysqlclient` build issue | PostgreSQL (RDS), MySQL, MongoDB | SQLite: one writer at a time, single-machine, no network access, so it can't be shared across multiple EC2 instances. Postgres: proper concurrency, JSON fields, managed backups on RDS. MongoDB isn't a good fit, because the data is relational (user→task→file/response) and Django's ORM is SQL-first |
| **EC2** (claimed) | NOT IN CODE. Usually: learning Linux/Nginx, full control, free tier | Render/Railway (git push deploy), Elastic Beanstalk, ECS/Fargate (containers), Lambda (Zappa) | EC2: full control, but you patch, scale and run TLS yourself. PaaS: fastest. Lambda is a bad fit here because of PyTorch/EasyOCR package size, cold starts, and 30 s+ OCR/LLM calls |
| **Local disk media** (actual) vs **S3** (claimed) | Django default; works with `runserver` | S3 via django-storages, with presigned URLs | Local disk: simple, but lost if the instance dies and can't be shared across servers. S3: durable, scalable, CDN-able, needs IAM. `utils.py` reads `tf.file.path`, which **doesn't exist for S3 storage**, so you'd need to open the file through the storage API or download to a temp file |
| **React (CRA) vs Next.js** | CRA was the standard tutorial starter | Vite + React (CRA is deprecated), Next.js | This is a logged-in dashboard, so SSR/SEO (Next.js's main wins) barely matter. Vite would give faster builds. A single 946-line component would be the bigger thing to fix |
| **Gemini 2.5 Flash** | NOT IN CODE. Probably the generous free tier, speed, low cost and long context | OpenAI GPT-4o-mini, Claude, a local model (Ollama) | Flash: cheap and fast with a big context window, good for whole documents. Gemini can also read PDFs and images natively, which could replace EasyOCR entirely (no PyTorch) |
| **EasyOCR (local)** | Free, no extra API | Tesseract (lighter), Google Vision, Gemini multimodal | EasyOCR is accurate but pulls in PyTorch (GBs, lots of RAM) and is slow on CPU |
| **Tailwind** | Fast styling, dark mode via `class` (`tailwind.config.js:3`) | Bootstrap (used in the old templates), MUI | Very long className strings, but no CSS files to maintain |
| **Client-side PDF via print** | No server dependency, no extra package | reportlab/WeasyPrint on the server, jsPDF | Depends on popups being allowed and the browser's print dialog; XSS risk if output isn't escaped |

---

## 11. Weaknesses and improvements

### Bugs (functional)
| # | Issue | Where | Fix |
|---|---|---|---|
| B1 | **Delete from React doesn't work.** It calls `/delete_task/<id>/`, but the route is `/delete/<id>/`, so you get a 404. Even with the right URL, `@login_required` redirects the anonymous request. The UI removes the card anyway because it never checks `res.ok`, and the task comes back on reload | `App.js:161-165`, `urls.py:11`, `views.py:130-136` | Add a `DELETE /api/tasks/<id>/` endpoint and check `res.ok` |
| B2 | All users share the first user's data | `views.py:16-18` etc. | Real auth (§6) |
| B3 | Clean install crashes: `from django.tasks import task` on pinned Django 5.2.6 | `urls.py:1`, `requirements.txt:1` | Delete the import; pin the Django version you actually tested |
| B4 | Template dashboard counts are always blank: the view passes `completed_task`/`pending_task`, the template reads `completed_tasks`/`pending_tasks` | `views.py:111-112` vs `home.html:35,43` | Rename the keys |
| B5 | Edit form doesn't preselect the current priority | `edit_task.html:9-13` | Add a `selected` condition |
| B6 | `api_task`/`register_user` return `None` for unsupported methods → 500 | `views.py:23,59,172` | Return a 405 (or use `@require_http_methods` / DRF) |
| B7 | Missing/invalid JSON fields → `KeyError`/500; invalid priority stored | `views.py:60-69` | Use a serializer or form validation |
| B8 | `fullName` from the signup form is ignored (backend expects `first_name`) | `App.js:14`, `views.py:181` | Rename on one side |
| B9 | `!title.strip && !title`: `.strip` isn't a JS method (it's `.trim()`), so whitespace-only titles pass | `App.js:110` | `if (!title.trim())` |
| B10 | Stale state in `handleToggleStatus`/`handleDeleteTask`/`handleAddTask` (`tasks` from the closure); rapid clicks can lose updates | `App.js:129,147,165` | Functional `setTasks(prev => …)` (already used in the upload/AI handlers) |
| B11 | Refreshing the page logs you out (user only in memory) | `App.js:11` | Persist auth (cookie session or refresh token) and add a `/api/me/` endpoint |
| B12 | The file label always shows "PDF/Docx", even for images | `App.js:803` | Derive it from the extension |
| B13 | `App.test.js` looks for "learn react" and renders without `GoogleOAuthProvider`, so it fails | `App.test.js:4-8` | Write real tests |
| B14 | Duplicate `admin/` route → warning `urls.W005` | `urls.py:21` | Remove it |
| B15 | Scanned PDFs yield no text (no OCR fallback for PDFs) | `utils.py:17-23` | OCR the rendered pages, or send the PDF to Gemini directly |
| B16 | Deleted tasks leave orphaned files on disk | `models.py:40` | `post_delete` signal or `django-cleanup` |

### Security
See §6 list (1–12). The top three to talk about: the **`User.objects.first()` fallback**, **unverified Google tokens**, and the **committed `SECRET_KEY` + DB password in history**. Also: no upload size limit (Django buffers to disk but has no cap; `DATA_UPLOAD_MAX_MEMORY_SIZE` doesn't apply to files), the extension check is by name only (no MIME/magic-byte check), and uploaded files keep the user's filename.

### Tests
- `backend/tasks/tests.py` is empty, and the only frontend test is broken. **Zero real coverage.**
- What to add: model tests; API tests with `APIClient` (auth required, ownership/IDOR, validation errors); `call_gemini_api` tests with the SDK mocked; extraction tests with small fixture PDF/DOCX files; React Testing Library tests for login and add task, with `fetch` mocked; and a GitHub Actions CI job.

### Code smells
- One 946-line React component. Split it into `AuthForm`, `StatsGrid`, `TaskForm`, `TaskCard`, `AIPanel`, plus an `api.js` client with a configurable base URL.
- The same spinner SVG is copy-pasted 4× (`App.js:786,826,845,864`).
- Duplicate user-resolution logic in three views; this should be middleware or DRF permissions.
- Mixed legacy template views and API views in the same file/URLconf.
- N+1 queries in `GET /api/tasks/`, since each task runs 2 extra queries (`views.py:29,37`). Fix: `.prefetch_related('taskfile_set','airesponse_set')`.
- `extracted_text` stored per AIResponse (the same text duplicated ×3) and sent to the client on every list call (payload bloat).
- Unused deps (`reportlab`, `requests`, `web-vitals`); undeclared deps (`tailwindcss`, `pytesseract`).
- Hardcoded `http://localhost:8000` in 7 places.

---

## 12. Scaling to 10,000 users

### What breaks first (in order)
1. **Synchronous OCR + LLM in web workers.** One image OCR loads a PyTorch model (`utils.py:36`, seconds of CPU, hundreds of MB of RAM), then Gemini takes 5–30 s or more. With Gunicorn sync workers (say 3–5 on a small EC2), **a handful of concurrent AI requests block every request**, task lists included, and memory can trigger an OOM kill.
2. **LLM rate limits and cost.** Gemini per-minute quotas (RPM/TPM) get hit quickly when there's no per-user throttle, no caching of repeat clicks and no input cap. The quota tier is NOT IN CODE.
3. **SQLite.** One writer at a time (`database is locked` under concurrent writes) and it can't be shared across instances.
4. **A single EC2 instance with media on local disk.** No horizontal scaling, a single point of failure, and files lost if the instance is replaced.
5. **Payload/N+1.** The list endpoint returns every task with full AI text and extracted text, with no pagination.

### Better architecture
```
           Route 53
               │
          CloudFront ──────────────► S3 (React build, static files)
               │                    S3 (uploads, private, presigned URLs)
               ▼
    Application Load Balancer (HTTPS via ACM)
               │
   ┌───────────┴───────────┐   Auto Scaling Group / ECS
   │ Gunicorn + Django/DRF │ × N   (stateless, JWT or Redis sessions)
   └───────────┬───────────┘
               │ enqueue job, return 202 + job id
     ┌─────────┼──────────────────┐
     ▼         ▼                  ▼
  RDS Postgres  ElastiCache Redis  Celery workers (separate ASG, more RAM)
  (Multi-AZ,    (cache, sessions,  ├─ text extraction / OCR (model loaded once)
  read replica)  rate limits,      └─ Gemini calls (retry+backoff, per-user quota)
                 Celery broker)            │
                                           └─► write AIResponse; client polls
                                               /api/jobs/<id>, or WebSocket/SSE
```
Key changes to describe:
- **Celery + Redis (or SQS)** for extraction and LLM calls: the API returns `202 Accepted`, the frontend polls or gets pushed the result, and Gunicorn workers stay free.
- **Load OCR once per worker** (a module-level singleton), or drop EasyOCR and send images/PDFs to Gemini's multimodal input, which removes PyTorch from the image entirely.
- **Rate limiting:** DRF throttles or Redis token buckets per user for AI endpoints; a daily quota stored in the DB.
- **Caching:** hash the file content + response type → reuse the earlier `AIResponse` (skip Gemini when the input hasn't changed); cache task lists in Redis per user.
- **RDS Postgres** with indexes on `(user_id, created_at)` and a unique constraint on `(task_id, response_type)`; pagination.
- **S3 + presigned upload URLs** (the browser uploads directly to S3) with size limits, and **CloudFront** in front of the SPA and static files.
- **Observability:** structured logs, Sentry, CloudWatch metrics on queue depth, LLM latency and errors.

---

## 13. Interview questions (30) with model answers

> These answers describe the code as it is. Where the code is weak, the answer says so and gives the fix; that usually lands better than a cover story.

### Basic
1. **What does the project do?** It's a study task manager. Students create tasks, attach assignment files, and get AI-generated solutions, summaries or quizzes from Gemini, which they can export as PDF.
2. **What's the tech stack?** React 19 (Create React App, Tailwind) on the frontend; Django 6 with JSON function views on the backend; SQLite; Gemini 2.5 Flash; pypdf, python-docx and EasyOCR for text extraction.
3. **What are your models?** `Task` (FK to User; title, subject, due date, priority/status choices, timestamps), `TaskFile` (FK to Task, FileField), and `AIResponse` (FK to Task, type, extracted text, answer). Deletes cascade.
4. **How does the frontend talk to the backend?** `fetch` calls to `http://localhost:8000/api/...` with JSON or multipart bodies. Cross-origin access is allowed by django-cors-headers for localhost:3000.
5. **What file types do you support and how do you extract text?** PDF (pypdf), DOCX (python-docx), JPG/PNG (EasyOCR). The extension is validated on both client and server.
6. **Where's the Gemini API key kept?** In `backend/.env`, which is git-ignored. `python-dotenv` loads it into settings. It never reaches the browser.
7. **How does dark mode work?** Tailwind `darkMode: 'class'`. A state flag toggles the `dark` class on `<html>` and is saved in `localStorage`, with `prefers-color-scheme` as the default.

### Deep technical
8. **Walk me through what happens when I click "Generate Quiz."** POST to `/api/tasks/<id>/generate-quiz/` → load the task's files → extract and concatenate their text → prepend the quiz prompt → `generate_content` on gemini-2.5-flash → `update_or_create` an AIResponse → return JSON → React stores it under `ai_responses.QUIZ` and opens the tab.
9. **How does authentication work?** Honestly: username/password goes through Django's `authenticate()` + `login()`, which creates a session. The React fetch doesn't send `credentials: 'include'` across origins, so the cookie isn't stored, and the views fall back to the first user. Google Sign-In happens only in the browser. I'd fix it with DRF + SimpleJWT and server-side Google token verification.
10. **What's the difference between decoding and verifying a JWT?** Decoding just base64-reads the payload; anyone can make one. Verifying checks the signature against the issuer's public keys (Google's JWKS) plus `aud`, `iss` and `exp`. My frontend only decodes, so the backend has to verify.
11. **How would you implement Google login properly?** The frontend sends the ID token to `/api/auth/google/`. The backend verifies it with `google.oauth2.id_token.verify_oauth2_token` against my client ID, does `get_or_create` on the user by Google `sub`/email, and returns my own access/refresh tokens.
12. **Where should a JWT be stored on the frontend?** Access token in memory (short-lived); refresh token in an HttpOnly, Secure, SameSite cookie. localStorage is readable by any XSS. The cookie then needs CSRF protection, which SameSite plus a CSRF token handle.
13. **Why did you use `@csrf_exempt`, and what's the risk?** React wasn't sending the CSRF token, so POSTs got 403. Exempting the views fixed that, but if cookie auth worked, another site could submit requests on the user's behalf. The right fix is reading the `csrftoken` cookie and sending `X-CSRFToken`, or using bearer tokens, which aren't sent automatically by the browser.
14. **Why does `toggle_status` worry you?** It doesn't check auth or ownership: `get_object_or_404(Task, id=task_id)`. Anyone can flip any task by ID. That's an IDOR. Fix: filter by `user=request.user` and require authentication.
15. **What's the N+1 problem in your list endpoint?** For each task I call `taskfile_set.all()` and `airesponse_set.all()`, which is 1 + 2N queries. `prefetch_related` would make it 3 queries in total.
16. **How do you make the LLM output structured enough to render?** The prompt forces a "Question N: / Answer: / Explanation:" format, and the client regex-splits on those labels. A sturdier way is Gemini's JSON mode (`response_mime_type="application/json"` with a schema) instead of regex.
17. **What happens if Gemini fails or there's no API key?** Exceptions get wrapped and returned as a 500 with the message, and React shows a toast. With no key, it returns mock responses. There's no retry, timeout or quota handling yet; I'd add retry with exponential backoff and a timeout.
18. **What's slow about the OCR path?** `easyocr.Reader` gets constructed on every request, which reloads a PyTorch model. I'd load it once per process, run it in a Celery worker, or skip it by sending the image straight to Gemini.
19. **How is a file upload handled?** Multipart POST → `request.FILES['file']` → extension check → `TaskFile.objects.create`, which saves it to `MEDIA_ROOT/task_files/` → returns its absolute URL via `build_absolute_uri`. Missing: size limits, MIME sniffing, and auth on serving the file.
20. **Is the PDF export safe?** No. It builds HTML with template strings and `document.write`, without escaping the title or the AI text, so it's an XSS vector. I'd escape the HTML, or render a React component and print that.

### "Why" questions
21. **Why Django over FastAPI or Node?** The app started as a Django template app (it's in the first commit), and Django gave me auth, an ORM, migrations and admin for free. For heavy async LLM traffic, FastAPI or Django async views plus Celery would be worth weighing. *(Your own reason: NOT IN CODE.)*
22. **Why did you switch from MySQL to SQLite?** The last commit swapped it. SQLite needs no server and no `mysqlclient` native build. The trade-off is single-writer concurrency, so for production I'd go to Postgres on RDS. *(Actual reason: NOT IN CODE.)*
23. **Why Gemini?** *(NOT IN CODE: fill in.)* A reasonable answer: Flash is cheap and fast with a large context window for whole documents, and it's multimodal, so it could replace my OCR step.
24. **Why save AI responses in the DB?** So results survive reloads and you don't pay to regenerate them; the list endpoint returns them with each task. Right now clicking again regenerates anyway; I'd add a content-hash check to reuse earlier output.
25. **Why one React component?** It grew feature by feature. I'd split it into components plus an API layer, and probably move to Vite.

### "What would you change"
26. **Top three fixes?** (1) Real auth: remove the `User.objects.first()` fallback, add DRF + JWT, verify Google tokens. (2) Security cleanup: env-based `SECRET_KEY`/`DEBUG`/`ALLOWED_HOSTS`, rotate the leaked credentials, remove `csrf_exempt`, fix the IDOR and the XSS. (3) Move OCR and LLM calls to Celery, with rate limits.
27. **How would you test this?** Django `TestCase`/DRF `APIClient` tests for auth, ownership and validation; mock `genai.GenerativeModel` so tests don't hit the API; fixture files for extraction; React Testing Library with `fetch` mocked; run it all in GitHub Actions.
28. **How would you scale to 10k users?** See §12: ALB + multiple stateless app instances, RDS Postgres, Redis, Celery workers for AI, S3 + CloudFront, per-user throttling. The first thing to break is synchronous OCR/LLM tying up workers, then the Gemini quota, then SQLite.
29. **How would you deploy it properly on AWS?** Gunicorn behind Nginx on EC2 (or ECS), `collectstatic` to S3 via django-storages using an instance role, RDS, env secrets in SSM Parameter Store, a security group with only 80/443 (22 from my IP), certbot or ACM for HTTPS, and the React build on S3 + CloudFront with `REACT_APP_API_URL`. *(If you actually deployed it: describe your real setup; NOT IN CODE.)*
30. **What was the hardest bug?** Real candidate from the code: getting React and Django to share auth across ports. CORS, CSRF 403s and cookies not being stored all showed up together. The `csrf_exempt` and first-user fallback were stopgaps, and the proper fix is `credentials: 'include'` + CSRF headers, or token auth. Another: the requirements cleanup that downgraded Django and broke the `django.tasks` import.

---

## 14. Spoken explanations

> These are written to match the code. If you add a real deployment or JWT later, add one sentence for each. Don't claim them before they exist.

### 60 seconds
"Student Task Manager is a full-stack app that helps students organise their assignments and study them with AI. The frontend is React with Tailwind, and the backend is Django exposing JSON APIs over SQLite. Students create tasks with a subject, due date and priority, mark them complete, and see a stats dashboard. The interesting part is the AI pipeline. You upload the assignment as a PDF, Word file or photo, and the backend extracts the text with pypdf, python-docx or EasyOCR for images. Then it sends that text to Google's Gemini 2.5 Flash with one of three prompts: step-by-step solutions, a study summary, or a practice quiz. Results are saved per task, so they persist, and you can export them to PDF. Sign-in supports username/password through Django's auth system plus a Google Sign-In button. If I kept going, the next step would be proper token-based auth with server-side Google verification, and moving the AI calls to a background queue so they don't block the server."

### 2 minutes
"Student Task Manager started as a server-rendered Django app for tracking assignments. Later I rebuilt the frontend in React and added an AI study assistant.

On the backend there's one Django app with three models. A Task belongs to a user and has a title, subject, due date, priority and status. A TaskFile stores uploaded assignment files. An AIResponse stores Gemini output for each task and type. The React app calls JSON endpoints to list and create tasks, toggle status, upload files and trigger AI generation. CORS is handled with django-cors-headers.

The AI flow works like this. When you click 'Generate Solution', the backend loads every file attached to the task and extracts the text: pypdf for PDFs, python-docx for Word, and EasyOCR, which is a PyTorch OCR model, for photos of worksheets. It joins the text, puts a prompt template in front of it, and sends it to Gemini 2.5 Flash. I designed the solution prompt to force a 'Question / Answer / Explanation' format, so the frontend can parse it into cards. The result is saved with `update_or_create`, so there's one cached answer per task per type, and the user can export it as a PDF from the browser. The API key stays server-side in an env file, and there's a mock fallback so the app runs without a key.

Auth uses Django's built-in user model with hashed passwords for username/password sign-up, plus Google Sign-In on the frontend.

Looking back, there are clear things I'd improve, and I can walk through them. Auth needs to be finished end to end: the session cookie isn't carried across the React and Django ports, so I'd move to DRF with SimpleJWT and verify the Google ID token on the server. The OCR and LLM calls run synchronously, so at scale I'd move them to Celery workers with per-user rate limits, switch SQLite to Postgres, move files to S3, and fix a few security issues like CSRF exemptions and an object-ownership check on the status toggle. I learned the most from those trade-offs."

---

### Things for you to fill in (NOT IN CODE)
- Why you chose Gemini, Django, SQLite, CRA, EasyOCR.
- Whether and how you deployed: instance type, OS, Nginx/Gunicorn config, domain/HTTPS, S3 bucket, IAM role, security groups. **None of this is in the repo.**
- The exact reason for the MySQL→SQLite switch and the Django 6→5.2 downgrade.
- Gemini quota tier or cost figures, if you measured any.
- Any users or usage numbers.
