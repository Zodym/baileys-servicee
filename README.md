# WhatsApp Multi-User Service - Railway Deployment

Bu servis, her kullanicinin kendi WhatsApp hesabini baglamasina olanak tanir. QR kodlar Firestore uzerinden frontend'e iletilir.

## ONEMLI: Dosya Yapisi

GitHub repo'nuzdaki dosya yapisi su sekilde olmali:

```
my-whatsapp-service/
├── src/
│   ├── index.ts
│   ├── firebase.ts
│   └── whatsapp-manager.ts
├── Dockerfile
├── package.json
├── tsconfig.json
├── railway.json
├── nixpacks.toml
├── .env.example
└── README.md
```

**DIKKAT**: `index.ts`, `firebase.ts` ve `whatsapp-manager.ts` dosyalari `src/` klasoru icinde olmali!

## Railway'de Deploy Etme

### Adim 1: Ayri Repo Olusturun

```bash
# baileys-service klasorunu kopyalayin
cp -r baileys-service ~/whatsapp-service

# Yeni git repo olusturun
cd ~/whatsapp-service
git init
git add .
git commit -m "Initial commit"

# GitHub'da yeni repo olusturun (ornegin: my-whatsapp-service)
# Sonra push edin:
git remote add origin https://github.com/YOUR_USERNAME/my-whatsapp-service.git
git push -u origin main
```

### Adim 2: Railway'de Deploy Edin

1. [railway.app](https://railway.app) adresine gidin
2. **New Project** > **Deploy from GitHub repo**
3. Az once olusturdugunu repo'yu secin (`my-whatsapp-service`)
4. Railway otomatik olarak Node.js uygulamasi oldugunu algilayacak

### Adim 3: Environment Variables Ekleyin

Railway dashboard'da **Variables** sekmesine gidin:

| Degisken | Aciklama | Ornek |
|----------|----------|-------|
| `PORT` | Railway otomatik atar, eklemeyin | - |
| `FIREBASE_PROJECT_ID` | Firebase proje ID'niz | `my-project-123` |
| `FIREBASE_CLIENT_EMAIL` | Service account email | `firebase-adminsdk-xxx@my-project.iam.gserviceaccount.com` |
| `FIREBASE_PRIVATE_KEY` | Service account private key (tirnak icinde) | `"-----BEGIN PRIVATE KEY-----\n..."` |
| `FRONTEND_URL` | Vercel frontend URL'iniz | `https://my-app.vercel.app` |
| `API_SECRET_KEY` | API guvenlik anahtari (kendiniz belirleyin) | `super-secret-key-123` |

### Adim 4: Firebase Service Account Alin

1. [Firebase Console](https://console.firebase.google.com) > Proje Ayarlari (dis simgesi)
2. **Service Accounts** sekmesi
3. **Generate new private key** tiklayin
4. JSON dosyasi indirilecek, icinden:
   - `project_id` -> `FIREBASE_PROJECT_ID`
   - `client_email` -> `FIREBASE_CLIENT_EMAIL`
   - `private_key` -> `FIREBASE_PRIVATE_KEY` (TIRNAK ICINDE GIRIN!)

### Adim 5: Domain Alin

1. Deploy tamamlandiktan sonra Railway dashboard > **Settings**
2. **Networking** > **Generate Domain** tiklayin
3. Size verilen URL'i kopyalayin (ornegin: `my-whatsapp-service-production.up.railway.app`)

### Adim 6: Frontend'i Yapilandirin

Vercel dashboard'da (veya v0 Settings > Vars):

```
NEXT_PUBLIC_WHATSAPP_API_URL=https://my-whatsapp-service-production.up.railway.app
NEXT_PUBLIC_WHATSAPP_API_KEY=super-secret-key-123
```

**Not**: `API_SECRET_KEY` ile `NEXT_PUBLIC_WHATSAPP_API_KEY` ayni deger olmali!

---

## API Endpoints

| Method | Endpoint | Aciklama |
|--------|----------|----------|
| POST | `/api/connect/:userId` | WhatsApp baglantisi baslat |
| POST | `/api/disconnect/:userId` | Baglantiyi kes |
| POST | `/api/logout/:userId` | Oturumu kapat ve temizle |
| GET | `/api/status/:userId` | Baglanti durumunu kontrol et |
| GET | `/api/health` | Servis saglik kontrolu |
| GET | `/api/sessions` | Tum aktif session'lari listele |

## Nasil Calisir?

1. Kullanici frontend'de "WhatsApp Bagla" butonuna tiklar
2. Frontend, Railway API'sine `/api/connect/:userId` istegi atar
3. Railway servisi Baileys ile WhatsApp Web baglantisi baslatir
4. QR kod olusturulur ve Firestore'a kaydedilir
5. Frontend, Firestore'dan QR kodu gercek zamanli olarak alir ve gosterir
6. Kullanici QR kodu tarar
7. Baglanti kurulur ve durum Firestore'da guncellenir
8. Artik gelen mesajlar dinlenir ve Firestore'a kaydedilir

## Sorun Giderme

### "Could not determine how to build" hatasi
- `baileys-service` klasorunu **ayri bir repo** olarak yukleyin
- Ana proje repo'su degil, sadece bu klasorun icerigi olmali

### "FIREBASE_PRIVATE_KEY" hatasi
- Private key'i **cift tirnak icinde** girin: `"-----BEGIN PRIVATE KEY-----\n..."`
- `\n` karakterlerini koruyun

### QR kod gorunmuyor
- Railway servisinin calistigini kontrol edin (Health endpoint: `/api/health`)
- `NEXT_PUBLIC_WHATSAPP_API_URL` dogru mu kontrol edin
- Browser console'da hata var mi bakin

### Session kayboluyor
- Railway free tier'da servis uyuyabilir
- Kalici session icin Railway Pro plan oneriliriz
