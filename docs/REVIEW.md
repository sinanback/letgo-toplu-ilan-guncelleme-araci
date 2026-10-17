# Publication review / Yayın incelemesi

Date / Tarih: 2026-10-17

## Scope / Kapsam

The supplied `Letgo Toplu İlan Güncelleme Aracı.zip` contains 15 files: four JavaScript files, a manifest, HTML, CSS, five PNG assets, two OTF fonts and their EULA. The manifest declares version 0.7.0 and Manifest V3. The separately supplied cover is published as `assets/cover.png`.

Yüklenen arşiv 15 dosya içerir. Sürüm manifestten 0.7.0 olarak doğrulandı. Orijinal arşiv değiştirilmedi. Telegram projesi bu incelemenin ve deponun kapsamında değildir.

## Findings / Bulgular

- No embedded passwords, access tokens, API keys, private signing keys, browser sessions or exported customer/listing records were found in the reviewed source. This is a bounded source review, not a security certification.
- The developer name, branding and LinkedIn profile are intentional public attribution. No private contact details were found in the package or cover.
- No developer-backend requests, telemetry, remote scripts, `eval` or HTML injection through listing text were found. Listing text is rendered through `textContent`.
- Manifest API permission: `storage`. Content-script site match: `https://www.letgo.com/*`.
- Persistent data includes listing metadata and workflow state. Raw form fields and phone-button text are temporarily read for fingerprinting. The README explains this distinction and the normal Letgo network traffic.
- Safety controls depend on current DOM labels and layouts. The extension is not an official Letgo product and does not bypass quota/CAPTCHA controls. No new store submission or policy approval was performed.

## Font handling / Font işlemi

The bundled “Radomir Tinkov Free Font End User License Agreement”, dated January 1, 2016, permits embedding but also restricts distribution and making the font available to third parties. Standalone font binaries are therefore omitted from this public source edition pending separate redistribution clearance. The font EULA is not republished because the fonts are not included. This is a conservative packaging decision, not a legal opinion.

GitHub kopyasında iki Gilroy fontu ve font EULA dosyası bulunmaz. `popup.css` içindeki iki `@font-face` tanımı çıkarıldı; Gilroy aileleri mevcut Arial/sans-serif yedeğine yönlendirildi. Manifest ve dört JavaScript dosyası orijinal arşivle birebir aynıdır. Orijinal ZIP ve mağazadaki paket değiştirilmedi.

No blanket MIT or other license was applied to user-owned code or third-party artwork without a separate licensing decision.

## Validation / Doğrulama

- All four JavaScript files pass `node --check`.
- Existing regression harnesses were run against this source edition: **31 workflow scenarios and 15 popup checks passed**. Scenarios cover price mismatch, paid bundle removal, zero-total publication, tab ownership, stop behavior, uncertain outcomes, pagination and sequential renewal.
- The regression harnesses are local verification tools from the existing development workspace and are not included in the supplied archive or published source tree.
- Manifest, JavaScript, HTML and icon hashes match the supplied archive. Only font-related CSS is adjusted; the separate cover matches the latest supplied PNG.

Automated scenarios use mocked pages; they do not prove compatibility with the current live Letgo site. Canlı ilan işlemi yapılmadı; bu sonuçlar mağaza onayı veya kesintisiz uyumluluk garantisi değildir.
