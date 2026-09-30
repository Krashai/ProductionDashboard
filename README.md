# ProductionDashboard

Kioskowy wallboard wizualizujący dane z instalacji PLC (chłodnie, sprężarkownia,
energia) w czasie rzeczywistym. Dwa niezależne komponenty:

- **`backend/`** — gateway FastAPI odpytujący sterowniki S7 (PLC) i wystawiający
  dane przez REST + WebSocket, z panelem administracyjnym do konfiguracji
  sterowników i tagów.
- **frontend (katalog główny)** — aplikacja Next.js wyświetlająca dane na
  ekranie kiosku (karuzela obszarów, pasek alarmów).

Każdy komponent ma własny stack Dockera. Łączy je wspólna sieć
`proddash_internal`, przez którą serwer Next.js przekazuje połączenie
WebSocket przeglądarki do backendu. Przeglądarka zawsze łączy się tylko z
adresem, z którego pobrała stronę, dlatego aplikacja działa zarówno przez
reverse proxy, jak i bezpośrednio w podsieci lokalnej (patrz „2. Frontend”).

## Instalacja na Raspberry Pi (Docker)

### Zgodność z innymi aplikacjami na tym samym Pi

Ta aplikacja jest **celowo zaizolowana** od innych zdockerowanych stacków,
które mogą już działać na tym samym Raspberry Pi (np. `ProductionMonitor`,
`energy-guard`): własne sieci Dockera, własne nazwy kontenerów i porty
dobrane tak, by nie kolidować z tym, co typowo zajmują te aplikacje.

| Aplikacja | Kontener | Port hosta | Sieć Dockera |
|---|---|---|---|
| **ProductionDashboard** | `dashboard-plc-backend` | **8001** | `dashboard_plc_net` |
| **ProductionDashboard** | `dashboard-frontend` | **3002** | `dashboard_frontend_net` |
| ProductionMonitor | `pm-gateway-backend` | 8000 | `prod_net` |
| ProductionMonitor | `pm-gateway-frontend` | 3000 | `prod_net` |
| ProductionMonitor | `pm-dashboard-app` | 3001 | `prod_net` |
| ProductionMonitor | `pm-dashboard-db` | 5432 | `prod_net` |
| energy-guard (energy-meter) | `energy_monitor` | 8000 | `energy_network` |
| energy-guard (energy-meter) | `frontend` | 5173 | `energy_network` |
| energy-guard (energy-meter) | `grafana` | 3000 | `energy_network` |
| energy-guard (energy-meter) | `timescaledb` | 5432 | `energy_network` |

Weryfikacja na tym repo (2026-08-05, host `KTP-400-HYAMAT`): `docker ps` na Pi
pokazał wyłącznie kontenery ProductionMonitor korzystające z portów
3000/3001/8000/5432 — porty 8001 i 3002 były wolne.

> **Uwaga:** domyślny `docker-compose.yml` w repo `energy-guard` deklaruje te
> same porty hosta (8000, 3000, 5432), co ProductionMonitor. To nie ma
> związku z tą aplikacją, ale jeśli oba stacki mają działać na tym samym Pi
> jednocześnie, przed uruchomieniem `energy-guard` sprawdź, czy jego
> `docker-compose.yml`/`.env` na Pi nie zostały już przemapowane na inne
> porty — w przeciwnym razie `docker compose up` dla `energy-guard` odmówi
> startu z powodu zajętych portów 8000/3000/5432.

Przed pierwszym uruchomieniem zawsze warto to potwierdzić samodzielnie:

```bash
docker ps --format "table {{.Names}}\t{{.Ports}}"
docker network ls
```

Jeśli porty 8001 lub 3002 są jednak czymś zajęte, zmień publikowany port w
`backend/docker-compose.yml` / `docker-compose.yml` (lewa strona `"HOST:KONTENER"`
w sekcji `ports:`) — kontener wewnątrz nadal nasłuchuje na oryginalnym porcie,
zmienia się tylko to, pod czym jest widoczny na hoście.

### Wymagania

- Docker Engine + wtyczka Docker Compose (`docker compose version`)
- Raspberry Pi 4/5 (backend kompiluje `libsnap7` z automatycznym wykryciem
  architektury ARM w czasie budowania obrazu — nie trzeba nic dodatkowo
  konfigurować)

### 1. Backend (gateway PLC)

```bash
cd ProductionDashboard/backend
cp .env.example .env
```

Wygeneruj token administracyjny i wklej go do `backend/.env`
(`ADMIN_API_TOKEN=...`) — bez niego `docker compose up` odmówi startu (to
celowe zabezpieczenie, patrz komentarz w `docker-compose.yml`):

```bash
python3 -c "import secrets; print(secrets.token_urlsafe(32))"
```

Zbuduj i uruchom:

```bash
docker compose up -d --build
```

Backend wystawia:
- panel administracyjny (dodawanie PLC/tagów): `http://<ip-pi>:8001/`
- status/REST API: `http://<ip-pi>:8001/status`
- WebSocket z danymi na żywo: `ws://<ip-pi>:8001/ws`

Dane (SQLite z konfiguracją PLC/tagów) trzymane są w wolumenie Dockera
`dashboard_plc_data` i przeżywają restart/przebudowę kontenera.

### 2. Frontend

```bash
cd ProductionDashboard
cp .env.example .env
```

Frontend **nie zna żadnego adresu IP** backendu. Przeglądarka łączy się z
WebSocketem pod tym samym hostem i prefiksem, z którego pobrała stronę
(`ws://<host strony>${BASE_PATH}/ws`), a serwer Next.js przekazuje to
połączenie do backendu po wspólnej sieci Dockera `proddash_internal`. Ten sam
obraz działa więc z obu sieci naraz:

| Skąd | Adres w przeglądarce | WebSocket |
|---|---|---|
| Sieć biurowa (10.0.0.x) przez reverse proxy | `http://10.0.0.211/infrastructure/` | `ws://10.0.0.211/infrastructure/ws` (obsługuje proxy) |
| Podsieć lokalna (10.10.0.x), bezpośrednio | `http://10.10.0.244:3002/` → przekierowanie na `/infrastructure` | `ws://10.10.0.244:3002/infrastructure/ws` (obsługuje Next.js) |

Na tym Pi `.env` wymaga tylko:

```
BASE_PATH=/infrastructure
NEXT_PUBLIC_DATA_SOURCE=ws
```

`BASE_PATH` musi być zgodny z prefiksem `location` w `dashboard.conf` na
proxy. Musi też zostać ustawiony, bo proxy kieruje `/` i `/_next/static/`
do LineGantt (ProductionMonitor). Bez prefiksu zasoby tej aplikacji
trafiałyby do niej. `BACKEND_INTERNAL_URL` (domyślnie
`http://dashboard-plc-backend:8001`) zmieniasz tylko wtedy, gdy backend
działa na innym hoście.

> **Aktualizacja starszej instalacji:** zmienna `NEXT_PUBLIC_WS_URL` nie jest
> już używana, więc linię z nią w `.env` można usunąć. Adres wpisany na stałe
> był przyczyną, dla której podsieć lokalna nie widziała danych.

> **Ważne:** `BASE_PATH`, `BACKEND_INTERNAL_URL` i `NEXT_PUBLIC_*` są
> wkompilowywane w obraz podczas `next build`, nie odczytywane w czasie
> działania kontenera. Po każdej zmianie tych wartości w `.env` trzeba
> przebudować obraz (`docker compose up -d --build`), samo `restart`
> kontenera nie wystarczy.

Backend musi być uruchomiony **przed** frontendem, bo to jego stack tworzy
sieć `proddash_internal`. Bez niej `docker compose up` frontendu zakończy się
błędem `network proddash_internal declared as external, but could not be found`.

Zbuduj i uruchom:

```bash
docker compose up -d --build
```

Do trybu kiosku (Chromium na pełnym ekranie wskazujący na ten adres)
skonfiguruj autostart przeglądarki standardowym mechanizmem Raspberry Pi OS
(poza zakresem tego README).

### 3. Weryfikacja

Na Pi:

```bash
curl -sS http://localhost:8001/status                                              # dane z backendu (JSON)
curl -sS -o /dev/null -w '%{http_code}\n' http://localhost:3002/infrastructure       # 200
curl -sS -o /dev/null -w '%{http_code} %{redirect_url}\n' http://localhost:3002/     # 307 .../infrastructure
docker exec dashboard-frontend wget -qO- http://dashboard-plc-backend:8001/status | head -c 80   # frontend widzi backend
```

Następnie otwórz wallboard z obu sieci: `http://10.10.0.244:3002/`
(lokalnie) i `http://10.0.0.211/infrastructure/` (biuro). Bez skonfigurowanych
PLC/tagów w panelu admina (`http://<ip-pi>:8001/`) obszary będą puste/offline,
co jest oczekiwanym stanem świeżej instalacji.

### Aktualizacja do nowszej wersji

```bash
git pull
cd backend && docker compose up -d --build
cd .. && docker compose up -d --build
```

Wolumen `dashboard_plc_data` (konfiguracja PLC/tagów) nie jest ruszany przez
przebudowę obrazu.
