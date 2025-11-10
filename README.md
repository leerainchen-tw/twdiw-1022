
## API 發行範例

## 環境變數設定

本專案已改為使用環境變數進行設定。請複製 `.env.example` 為 `.env` 檔案，並填入以下資訊:

```bash
cp .env.example .env
```

然後編輯 `.env` 檔案，設定以下環境變數:

- **VC_SERNUM**: 卡片序號，從發行後台取得
- **VC_UID**: 卡片樣板代號，從發行後台取得  
- **ISSUER_ACCESS_TOKEN**: 發行者存取權杖，從發行後台取得
- **VERIFIER_REF**: 驗證器參考碼，從驗證後台取得
- **VERIFIER_ACCESS_TOKEN**: 驗證器存取權杖，從驗證後台取得


## 啟動服務

1. 安裝相依套件
   ```bash
   npm install
   ```

2. 啟動服務
   ```bash
   ./bin/www
   ```

3. 開啟瀏覽器訪問
   ```
   http://localhost:3000
   ```

服務啟動後即可開始測試發行卡片功能。



請注意此為測試環境,僅供功能展示使用。



## 作者

本範例專案由 tonyq (tonylovejava@gmail.com) 撰寫。
leerainchen-tw revised.


## License

本專案採用 MIT License 授權。

您可以自由地：
- 使用、複製及散布本軟體
- 修改本軟體並散布修改後的版本
- 將本軟體或其修改後的版本用於商業用途

詳細授權內容請參閱 [MIT License](https://opensource.org/licenses/MIT)。




## 免責聲明

本專案僅供概念測試使用，請勿使用在正式環境。使用本專案時請注意：

- 此為概念驗證(Proof of Concept)專案，不建議用於生產環境
- 不保證系統安全性及資料隱私保護
- 所有測試資料僅供展示用途，不具任何法律效力
- 開發者不對使用本系統造成的任何損失負責

若需要在正式環境中實作類似功能，建議：
- 諮詢資安專家進行完整的安全性評估
- 遵循相關法規要求進行開發
- 建置適當的資料保護機制
- 進行完整的系統測試與驗證

