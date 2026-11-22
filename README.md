# Kutu Radarı

GitHub Pages üzerinde çalışan, yalnızca statik JSON okuyan kişisel kutu oyunu
kataloğu. Ana sayfada yeni eklenenler, fiyatı düşenler ve arama bulunur. Katalogda
dil/stok/mağaza/fiyat filtreleri ve aynı dil sürümü için fiyat karşılaştırması vardır.
Backend bağlantısı, API anahtarı, kullanıcı hesabı veya tarayıcıdan veritabanı sorgusu yoktur.

## Çalıştırma ve test

`python -m http.server 8765 --bind 127.0.0.1` ardından localhost:8765 açılır.
Veri için `data/catalog.json` gerekir. `node --test tests/*.mjs` filtre/fiyat/URL
mantığını test eder. Npm bağımlılığı veya frontend build adımı yoktur.

## Veri ve yayın

Scraper'ın mevcut günlük işi, private veritabanını server tarafında database-exporter
ile okuyup sadece izinli ürün/mağaza/değişiklik alanlarını bu JSON'a dönüştürür.
Siteye yazma yetkili deploy key yalnızca bu public depoya erişir. JSON dosyası
üretildiğinde açıkça git add -f ile commit edilir; yerel fixture'ların yanlışlıkla
yayımlanmasını önlemek için dosya başlangıçta .gitignore içindedir.

Public JSON sözleşmesi: metadata.schema_version=1, metadata.exported_at,
rows (eşleştirilmiş dil sürümleri), stores (kontrol zamanları/durumları), updates
(new_product ve price_down). Bu dosyadaki ve bu depodaki bütün veriler herkese açıktır.
Şifre, bağlantı URL'si, mail adresi, raw JSON state veya hata mesajı yayımlanmaz.

Yeni eklenenler ilk kez görülen mağaza ilanlarıdır, oyunun çıkış tarihi değildir.
Eşleşmesi bekleyen yeni ilanlar güncelleme listesinde mağaza bağlantısıyla gösterilir;
kataloğa ancak insan onaylı eşleştirmeden sonra dahil olur. Dil bilinmiyorsa tahmin edilmez.
Fiyatı düşenler önceki başarılı kontrol ile karşılaştırılır. Feed, her mağazanın
son başarılı taramasındaki değişiklikleri içerir; uzun süreli fiyat geçmişi değildir.
Başarısız mağazaların son başarılı kontrol zamanı ayrıca gösterilir.

Fiyatlar TRY'dir, kargo hariçtir. En düşük fiyat yalnızca stokta ve fiyatı belirtilmiş
tekliflerden hesaplanır. Farklı diller birleştirilmez. Filtreler ve arama tarayıcıda
çalışır; arama sırasında ek ağ isteği yapılmaz. URL parametreleri aramayı paylaşmayı sağlar.

Yayın GitHub Actions + GitHub Pages ile yapılır. Daily cron bu depoda yoktur;
scraper'ın Türkiye saatiyle 09:00 planının sonunda JSON güncellenir.
