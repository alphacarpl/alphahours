# 🚀 Instrukcja Deploy na Coolify (AlphaHours)

Oto kompletna konfiguracja, aby aplikacja działała stabilnie na Twojej własnej domenie.

## 1. Tworzenie zasobu w Coolify
- **Typ**: Application
- **Build Pack**: Dockerfile
- **Branch**: `test` (lub `main` po zakończeniu testów)

## 2. Konfiguracja domeny
- W polu **Domains** wpisz: `https://twoja-domena.pl`
- Upewnij się, że rekord **A** w DNS wskazuje na IP Twojego serwera.

## 3. Porty
- **Exposed Port**: `3000`

## 4. Trwałość danych (BARDZO WAŻNE)
Bez tego kroku każda aktualizacja usunie Twoją bazę danych SQLite!
1. Przejdź do zakładki **Storage**.
2. Kliknij **Add Volume**.
3. **Volume Name**: `alpha-hours-data`
4. **Destination Path**: `/app/data`
5. Zapisz zmiany.

## 5. Zmienne środowiskowe (Environment Variables)
Warto ustawić te wartości dla pewności:
- `PORT`: `3000`
- `NODE_ENV`: `production`

## 6. Lista kontrolna w razie błędów
- **Healthcheck**: Dockerfile zawiera automatyczny skrypt. Jeśli Coolify pyta o to ręcznie, ustaw ścieżkę `/` i port `3000`.
- **Czysty Build**: Przy pierwszej próbie kliknij **Deploy** zamiast Restart, aby wymusić pobranie nowych ustawień z Dockerfile.
- **Logi**: Jeśli aplikacja nie wstaje, sprawdź "Deployment Logs" w poszukiwaniu błędów kompilacji `better-sqlite3`.
