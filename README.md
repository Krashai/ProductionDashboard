# ProductionDashboard

Kioskowy wallboard wizualizujący dane z instalacji PLC (chłodnie, sprężarkownia,
energia) w czasie rzeczywistym. Dwa niezależne komponenty:

- **`backend/`** — gateway FastAPI odpytujący sterowniki S7 (PLC) i wystawiający
  dane przez REST + WebSocket, z panelem administracyjnym do konfiguracji
  sterowników i tagów.
- **frontend (katalog główny)** — aplikacja Next.js wyświetlająca dane na
  ekranie kiosku (karuzela obszarów, pasek alarmów).

Oba komponenty są od siebie niezależne i mogą działać na osobnych maszynach
(np. backend blisko sieci OT ze sterownikami, frontend na Raspberry Pi
podłączonym do wyświetlacza) — łączy je wyłącznie połączenie WebSocket
inicjowane przez przeglądarkę.

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

### 2. Frontend (kiosk)

```bash
cd ProductionDashboard
cp .env.example .env
```

Ustaw w `.env`, pod jakim adresem przeglądarka **na urządzeniu, z którego
podglądasz wallboard** (nie na samym Pi) znajdzie backend. Domyślne
`ws://localhost:8001/ws` działa tylko wtedy, gdy przeglądarka jest
uruchomiona fizycznie na tym samym Pi (`localhost` wtedy poprawnie
odnosi się do samego Pi). Jeśli otwierasz frontend z innego urządzenia w
sieci LAN (laptop, telefon), `localhost` w tej wartości odnosi się do
*tamtego* urządzenia, nie do Pi — połączenie WebSocket nigdy nie powstanie
i pasek statusu w prawym górnym rogu pokaże **OFFLINE**, mimo że backend
działa poprawnie. Podmień wtedy `localhost` na realny adres IP Pi:

```
NEXT_PUBLIC_WS_URL=ws://10.10.0.244:8001/ws
NEXT_PUBLIC_DATA_SOURCE=ws
```

> **Ważne:** `NEXT_PUBLIC_*` są wkompilowywane w kod JS podczas budowania
> obrazu (`next build`), nie odczytywane w czasie działania kontenera. Po
> każdej zmianie `NEXT_PUBLIC_WS_URL`/`NEXT_PUBLIC_DATA_SOURCE` w `.env`
> trzeba przebudować obraz (`docker compose up -d --build`), samo
> `restart` kontenera nie wystarczy.

**Pi z kilkoma interfejsami sieciowymi (WiFi + kilka Ethernetów):** Docker
publikuje port backendu na `0.0.0.0`, czyli na wszystkich interfejsach
naraz — sam Docker nie wymaga żadnej dodatkowej konfiguracji. Wybór
należy do Ciebie: w `NEXT_PUBLIC_WS_URL` musi się znaleźć adres IP tego
interfejsu Pi, który jest w tej samej sieci co urządzenie podglądowe
(`ip -4 addr show` na Pi pokaże adresy wszystkich interfejsów). Typowy,
bezpieczny podział przy oddzielnej sieci OT/PLC: jeden Ethernet do
sterowników S7 (adres używany tylko wewnętrznie przez backend przy
dodawaniu PLC w panelu admina — bez związku z `NEXT_PUBLIC_WS_URL`),
drugi Ethernet lub WiFi do sieci biurowej, po której urządzenia
podglądowe faktycznie łączą się z kioskiem — to tej drugiej IP używa się
w `NEXT_PUBLIC_WS_URL`. Ponieważ zmiana tej IP wymaga przebudowy obrazu
frontendu (patrz uwaga wyżej), warto ustawić na tym interfejsie adres
**statyczny** (lub rezerwację DHCP) zamiast liczyć na to, że DHCP za
każdym razem przydzieli tę samą wartość.

Zbuduj i uruchom:

```bash
docker compose up -d --build
```

Frontend dostępny pod `http://<ip-pi>:3002/`. Do trybu kiosku (Chromium na
pełnym ekranie wskazujący na ten adres) skonfiguruj autostart przeglądarki
standardowym mechanizmem Raspberry Pi OS (poza zakresem tego README).

### 3. Weryfikacja

```bash
curl -sS http://localhost:8001/status   # dane z backendu (JSON)
curl -sS -o /dev/null -w '%{http_code}\n' http://localhost:3002/   # 200
```

Następnie otwórz `http://<ip-pi>:3002/` w przeglądarce — bez skonfigurowanych
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
