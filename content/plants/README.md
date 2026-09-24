# Plant Index — Thư mục Nội dung Cây trồng

Thư mục này chứa toàn bộ nội dung hướng dẫn chăm sóc (care content) dạng Markdown cho các loài cây trong RichFarm Plant Library.

## Cấu trúc thư mục

Mỗi thư mục con đại diện cho một cây trồng (theo slug tên khoa học):
- `en.md`: Hướng dẫn chăm sóc bằng tiếng Anh.
- `vi.md`: Hướng dẫn chăm sóc bằng tiếng Việt.
- `content.json`: Manifest định danh, liên kết trực tiếp với `plant_code` bất biến trong SQLite (`apps/api/data/richfarm.db`), lưu trữ hash SHA-256, byte count và trạng thái review.

Quy tắc biên tập: đọc [content/guidelines/plant-information-guideline.md](../guidelines/plant-information-guideline.md).

## Tổng quan thống kê

- **Tổng số cây trong thư mục**: 55 cây
- **Cây trong kế hoạch tuần 2026-09-14 đến 2026-09-20**: 35 cây (gồm 21 cây ban đầu + 14 cây mới được bổ sung)
- **Chuẩn hóa manifest**: 100% cây hợp lệ đều có `content.json` được xác thực bởi script `npm run content:manifests`

## Danh mục chỉ mục cây trồng (Plant Index)

| # | Tên phổ thông | Tên khoa học | Thư mục (Slug) | Plant Code (SQLite) | Locales (EN/VI) | Trạng thái |
| :--- | :--- | :--- | :--- | :--- | :---: | :--- |
| 1 | Đậu bắp | *Abelmoschus esculentus* | [`abelmoschus-esculentus`](./abelmoschus-esculentus) | `ABELMOSCHUS_ESCULENTUS_YAPH82F4DV` | ✓ / ✓ | `unreviewed` |
| 2 | Hành tây | *Allium cepa* | [`allium-cepa`](./allium-cepa) | `ALLIUM_CEPA_Q5KS82ENRE` | ✓ / ✓ | `unreviewed` |
| 3 | Hành lá | *Allium fistulosum* | [`allium-fistulosum`](./allium-fistulosum) | `ALLIUM_FISTULOSUM_JK8H81C0AK` | ✓ / ✓ | `unreviewed` |
| 4 | Tỏi tây | *Allium porrum* | [`allium-porrum`](./allium-porrum) | `ALLIUM_PORRUM_7M9582E8B8` | ✓ / ✓ | `unreviewed` |
| 5 | Tỏi | *Allium sativum* | [`allium-sativum`](./allium-sativum) | `ALLIUM_SATIVUM_XPNS81CRP5` | ✓ / ✓ | `unreviewed` |
| 6 | Nha đam | *Aloe vera* | [`aloe-vera`](./aloe-vera) | `ALOE_VERA_5K3181C5PP` | ✓ / ✓ | `unreviewed` |
| 7 | Can tay | *Apium graveolens* | [`apium-graveolens`](./apium-graveolens) | `APIUM_GRAVEOLENS_X2Y182FMDV` | ✓ / ✓ | `unreviewed` |
| 8 | Mang tay | *Asparagus officinalis* | [`asparagus-officinalis`](./asparagus-officinalis) | `ASPARAGUS_OFFICINALIS_J4KD82G4Y6` | ✓ / ✓ | `unreviewed` |
| 9 | Mong toi | *Basella alba* | [`basella-alba`](./basella-alba) | `BASELLA_ALBA_09A582HJFJ` | ✓ / ✓ | `unreviewed` |
| 10 | Mồng tơi Ceylon (quarantine) | *basella alba ceylon* | [`basella-alba-ceylon`](./basella-alba-ceylon) | `—` | ✓ / ✓ | `quarantined` |
| 11 | Củ dền | *Beta vulgaris* | [`beta-vulgaris`](./beta-vulgaris) | `BETA_VULGARIS_974X81C4DE` | ✓ / ✓ | `unreviewed` |
| 12 | Hoa giấy | *Bougainvillea glabra* | [`bougainvillea-glabra`](./bougainvillea-glabra) | `BOUGAINVILLEA_GLABRA_7RED82HAMQ` | ✓ / ✓ | `reviewed` |
| 13 | Bắp cải | *Brassica oleracea* | [`brassica-oleracea-var-capitata`](./brassica-oleracea-var-capitata) | `BRASSICA_OLERACEA_VAR_CAPITATA_AP7982BPXB` | ✓ / ✓ | `unreviewed` |
| 14 | Cải thìa | *Brassica rapa* | [`brassica-rapa-subsp-chinensis`](./brassica-rapa-subsp-chinensis) | `BRASSICA_RAPA_SUBSP_CHINENSIS_YYFS82AC8H` | ✓ / ✓ | `unreviewed` |
| 15 | Ot chuong | *Capsicum annuum* | [`capsicum-annuum`](./capsicum-annuum) | `CAPSICUM_ANNUUM_DQ8H81D5ZK` | ✓ / ✓ | `unreviewed` |
| 16 | Ớt hiểm | *Capsicum frutescens* | [`capsicum-frutescens`](./capsicum-frutescens) | `CAPSICUM_FRUTESCENS_EXRS81D11R` | ✓ / ✓ | `unreviewed` |
| 17 | Đu đủ | *Carica papaya* | [`carica-papaya`](./carica-papaya) | `CARICA_PAPAYA_Q27X81CTRN` | ✓ / ✓ | `unreviewed` |
| 18 | Chanh xanh | *Citrus aurantiifolia* | [`citrus-aurantiifolia`](./citrus-aurantiifolia) | `CITRUS_AURANTIIFOLIA_Z51D86KXE4` | ✓ / ✓ | `unreviewed` |
| 19 | Ngò rí | *Coriandrum sativum* | [`coriandrum-sativum`](./coriandrum-sativum) | `CORIANDRUM_SATIVUM_CEGS81DMEG` | ✓ / ✓ | `unreviewed` |
| 20 | Dưa leo | *Cucumis sativus* | [`cucumis-sativus`](./cucumis-sativus) | `CUCUMIS_SATIVUS_T8Y981CMBN` | ✓ / ✓ | `unreviewed` |
| 21 | Bi do | *Cucurbita moschata* | [`cucurbita-moschata`](./cucurbita-moschata) | `CUCURBITA_MOSCHATA_Z64181CJRG` | ✓ / ✓ | `unreviewed` |
| 22 | Bi ngoi | *Cucurbita pepo* | [`cucurbita-pepo`](./cucurbita-pepo) | `CUCURBITA_PEPO_513181C83D` | ✓ / ✓ | `unreviewed` |
| 23 | Sả | *Cymbopogon citratus* | [`cymbopogon-citratus`](./cymbopogon-citratus) | `CYMBOPOGON_CITRATUS_CK8H82FF24` | ✓ / ✓ | `unreviewed` |
| 24 | Ca rot | *Daucus carota* | [`daucus-carota`](./daucus-carota) | `DAUCUS_CAROTA_BS5581D3XQ` | ✓ / ✓ | `unreviewed` |
| 25 | Trầu bà | *Epipremnum aureum* | [`epipremnum-aureum`](./epipremnum-aureum) | `EPIPREMNUM_AUREUM_KVQ181DD4Y` | ✓ / ✓ | `unreviewed` |
| 26 | Dau tay | *Fragaria x ananassa* | [`fragaria-x-ananassa`](./fragaria-x-ananassa) | `FRAGARIA_X_ANANASSA_74T181D475` | ✓ / ✓ | `unreviewed` |
| 27 | Dâm bụt | *Hibiscus rosa-sinensis* | [`hibiscus-rosa-sinensis`](./hibiscus-rosa-sinensis) | `HIBISCUS_ROSA_SINENSIS_9Z2981CXAN` | ✓ / ✓ | `unreviewed` |
| 28 | Rau muống | *Ipomoea aquatica* | [`ipomoea-aquatica`](./ipomoea-aquatica) | `IPOMOEA_AQUATICA_K0DX81DZ8C` | ✓ / ✓ | `unreviewed` |
| 29 | Khoai lang | *Ipomoea batatas* | [`ipomoea-batatas`](./ipomoea-batatas) | `IPOMOEA_BATATAS_EWG182EKBY` | ✓ / ✓ | `unreviewed` |
| 30 | Xà lách | *Lactuca sativa* | [`lactuca-sativa`](./lactuca-sativa) | `LACTUCA_SATIVA_DE3581DDX0` | ✓ / ✓ | `unreviewed` |
| 31 | Xoài | *Mangifera indica* | [`mangifera-indica`](./mangifera-indica) | `MANGIFERA_INDICA_RSVD82EDD3` | ✓ / ✓ | `unreviewed` |
| 32 | Bạc hà | *Mentha × piperita* | [`mentha-x-piperita`](./mentha-x-piperita) | `MENTHA_X_PIPERITA_XJ6N81DMC4` | ✓ / ✓ | `unreviewed` |
| 33 | Mướp đắng | *Momordica charantia* | [`momordica-charantia`](./momordica-charantia) | `MOMORDICA_CHARANTIA_EV2981DHGJ` | ✓ / ✓ | `unreviewed` |
| 34 | Trầu bà Nam Mỹ | *Monstera deliciosa* | [`monstera-deliciosa`](./monstera-deliciosa) | `MONSTERA_DELICIOSA_9J5582FMWK` | ✓ / ✓ | `unreviewed` |
| 35 | Chuối | *Musa acuminata* | [`musa-acuminata`](./musa-acuminata) | `MUSA_ACUMINATA_NR4582G2Q6` | ✓ / ✓ | `unreviewed` |
| 36 | Húng quế | *Ocimum basilicum* | [`ocimum-basilicum`](./ocimum-basilicum) | `OCIMUM_BASILICUM_8HN181CVDP` | ✓ / ✓ | `unreviewed` |
| 37 | Kinh giới tây | *Origanum vulgare* | [`origanum-vulgare`](./origanum-vulgare) | `ORIGANUM_VULGARE_NS1H81DY0W` | ✓ / ✓ | `unreviewed` |
| 38 | Tia to | *Perilla frutescens* | [`perilla-frutescens`](./perilla-frutescens) | `PERILLA_FRUTESCENS_FYSX81CF7F` | ✓ / ✓ | `unreviewed` |
| 39 | Ngò tây | *Petroselinum crispum* | [`petroselinum-crispum`](./petroselinum-crispum) | `PETROSELINUM_CRISPUM_7F3H81CG9P` | ✓ / ✓ | `unreviewed` |
| 40 | Đậu cô ve | *Phaseolus vulgaris* | [`phaseolus-vulgaris`](./phaseolus-vulgaris) | `PHASEOLUS_VULGARIS_28NN81CJG2` | ✓ / ✓ | `unreviewed` |
| 41 | Ổi | *Psidium guajava* | [`psidium-guajava`](./psidium-guajava) | `PSIDIUM_GUAJAVA_CMMX82FYHG` | ✓ / ✓ | `unreviewed` |
| 42 | Củ cải trắng | *Raphanus sativus* | [`raphanus-sativus`](./raphanus-sativus) | `RAPHANUS_SATIVUS_N8M181C184` | ✓ / ✓ | `unreviewed` |
| 43 | Hoa hồng | *Rosa chinensis* | [`rosa-chinensis`](./rosa-chinensis) | `ROSA_CHINENSIS_E2WH81DYRD` | ✓ / ✓ | `unreviewed` |
| 44 | Hương thảo | *Rosmarinus officinalis* | [`rosmarinus-officinalis`](./rosmarinus-officinalis) | `ROSMARINUS_OFFICINALIS_JY3D81CNVF` | ✓ / ✓ | `unreviewed` |
| 45 | Mâm xôi đỏ (missing-en) | *rubus idaeus* | [`rubus-idaeus`](./rubus-idaeus) | `—` | ✗ / ✓ | `blocked_missing_en` |
| 46 | Luoi ho | *Sansevieria trifasciata* | [`sansevieria-trifasciata`](./sansevieria-trifasciata) | `SANSEVIERIA_TRIFASCIATA_KXHD81D90S` | ✓ / ✓ | `unreviewed` |
| 47 | Su su | *Sechium edule* | [`sechium-edule`](./sechium-edule) | `SECHIUM_EDULE_GG6S82G1BP` | ✓ / ✓ | `unreviewed` |
| 48 | Cà chua | *Solanum lycopersicum* | [`solanum-lycopersicum`](./solanum-lycopersicum) | `SOLANUM_LYCOPERSICUM` | ✓ / ✓ | `unreviewed` |
| 49 | Cà tím | *Solanum melongena* | [`solanum-melongena`](./solanum-melongena) | `SOLANUM_MELONGENA_ZQR581DS56` | ✓ / ✓ | `unreviewed` |
| 50 | Khoai tây | *Solanum tuberosum* | [`solanum-tuberosum`](./solanum-tuberosum) | `SOLANUM_TUBEROSUM_6KV982H99J` | ✓ / ✓ | `unreviewed` |
| 51 | Lan ý | *Spathiphyllum wallisii* | [`spathiphyllum-wallisii`](./spathiphyllum-wallisii) | `SPATHIPHYLLUM_WALLISII_QAKN82EDFY` | ✓ / ✓ | `unreviewed` |
| 52 | Rau bina | *Spinacia oleracea* | [`spinacia-oleracea`](./spinacia-oleracea) | `SPINACIA_OLERACEA_QKMN81DXBC` | ✓ / ✓ | `unreviewed` |
| 53 | Xạ hương | *Thymus vulgaris* | [`thymus-vulgaris`](./thymus-vulgaris) | `THYMUS_VULGARIS_5MZX81D5NE` | ✓ / ✓ | `unreviewed` |
| 54 | Đậu đũa | *Vigna unguiculata* | [`vigna-unguiculata`](./vigna-unguiculata) | `VIGNA_UNGUICULATA_GREX81D230` | ✓ / ✓ | `unreviewed` |
| 55 | Bắp ngọt | *Zea mays convar. saccharata* | [`zea-mays`](./zea-mays) | `ZEA_MAYS_CONVAR_SACCHARATA_GRJD82H1V0` | ✓ / ✓ | `unreviewed` |
