# Steam Kütüphanem

Sıfırdan yazılmış bir **Steam kütüphane + mağaza tarayıcısı** (Electron).
Kurulu oyunlarını yerel Steam dosyalarından okur, kapaklarını gösterir; Steam'in resmî
mağaza API'siyle **tüm oyunları** arar, **bedava oyunları** listeler ve oyunu Steam'de açar.

> **Kapsam sınırı:** Bu uygulama Steam DRM'ini **atlatmaz**, oyun dosyası **indirmez**, lisans **enjekte etmez**.
> Bedava oyunlar için Steam istemcisinin kendi "Kütüphaneye ekle / Yükle" akışı (`steam://install/<appid>`) kullanılır.
> SteamDB kazınmaz; Steam'in herkese açık uçları kullanılır.

## Özellikler

- **Paradise teması** — koyu mor gece, neon pembe/mor vurgular, cam efektli paneller.
- **Yerel hesap** — kullanıcı adı + şifre ile kayıt/giriş; şifreler **scrypt** ile tuzlanıp özetlenir, düz metin saklanmaz. Favori ve notlar **kullanıcıya özeldir**.
- **Kütüphane** — `libraryfolders.vdf` + `appmanifest_*.acf` ile çoklu kütüphane taraması; boyut, son oynama, kurulum durumu.
- **Mağaza** — öne çıkanlar (çok satanlar / yeni çıkanlar / indirimdekiler / yakında) ve sayfalı **tüm oyun araması**.
- **Bedava oyunlar** — Steam'de ücretsiz oyunlar listesi, "Daha fazla göster" ile sayfalama.
- **Steam kısayolları** — `steam://rungameid`, `steam://store`, `steam://install`.
- **Güvenli mimari** — `contextIsolation: true`, `nodeIntegration: false`, daraltılmış CSP, preload köprüsü.
- **Çalışma zamanı bağımlılığı yok** — sadece Electron; HTTP için Node `fetch`, JSON için `fs`.


## Kurulum

```bash
npm install
npm start
```

Geliştirme modu (DevTools açık):

```bash
npm run dev
```

Windows için tek dosya portable exe:

```bash
npm run build-portable
```

## Windows'ta kurulum (en kolay yol)

1. Node.js LTS kur: https://nodejs.org (kurulumdan sonra bilgisayarı yeniden başlat)
2. Zip'i bir klasöre çıkar
3. **`kur.bat`** → çift tık (bir kez; `npm install` çalışır)
4. **`baslat.bat`** → çift tık (uygulama açılır)

Bir şey ters giderse:

- **`tani.bat`** → çift tık; `tani.txt` oluşturur (Node sürümü, Steam klasörü, loglar). Bunu paylaş.
- Hata detayları: `kurulum-log.txt` ve `calisma-log.txt`
- Elle çalıştırmak için: klasörde `cmd` aç → `npm install` → `npm start`



Tamamı ağ ve ekran gerektirmeyen 37 test:

```bash
npm test
```

| Test dosyası | Kapsam |
|---|---|
| `test/vdf.test.js` | Valve VDF/ACF ayrıştırıcı (yorumlar, kaçışlar, bozuk dosyalar) |
| `test/steam-scanner.test.js` | Sahte Steam kurulumu, çoklu kütüphane, tekrar eden appid, bozuk acf |
| `test/user-data-store.test.js` | Favori/not kalıcılığı, kırpma, bozuk JSON |
| `test/store-api.test.js` | Mağaza arama/detay, ağ hatası, geçersiz girdi |
| `test/library-service.test.js` | Tarama + kullanıcı verisi birleşimi, önbellek, arama |
| `test/ipc.test.js` | Tüm IPC kanalları ve hata durumları |
| `test/main-smoke.test.js` | Electron taklidiyle gerçek `main.js`, pencere ve yeniden açma |
| `test/ui.test.js` | Gerçek `index.html` + `app.js` jsdom içinde: liste, filtre, arama, favori, not, başlatma |

## Proje yapısı

```
src/
  main/
    main.js             Electron yaşam döngüsü, pencere, güvenlik ayarları
    vdf.js              Valve KeyValues (VDF) ayrıştırıcı
    steam-scanner.js    Steam klasörü + kütüphane + appmanifest okuma
    library-service.js  Tarama sonucu ile favori/not birleşimi, arama, önbellek
    user-data-store.js  user-data.json (favoriler, notlar)
    store-api.js        Steam mağaza arama/detay istemcisi
    ipc.js              IPC kanallarının tek kaynağı (Electron'suz test edilebilir)
  preload/preload.js    contextBridge köprüsü (window.api)
  renderer/             index.html + app.js + styles.css
test/                   37 test
```

## Veri konumu

- Kullanıcı verisi: `<userData>/user-data.json` (Electron `app.getPath('userData')`)
- Okunan dosyalar: `<steam>/steamapps/libraryfolders.vdf`, `<kütüphane>/steamapps/appmanifest_*.acf`

Yazma işlemi sadece kendi `user-data.json` dosyasına yapılır.

## Lisans

MIT
