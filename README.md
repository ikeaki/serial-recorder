# Serial Recorder

QRコード・OCRを用いてシリアル情報を収集するアプリです。

## 主な機能

- QR/Barcode読取
- OCR読取
- Regexチェック
- 重複チェック
- Excel出力
- QR付きExcel出力
- CSV出力
- ConfigURL読込
- PWA対応

## EXPORT

- タップ : QR付きExcel
- 長押し(1.5秒) : CSV

## LOAD

- タップ : 設定ファイル読込
- 長押し(1.5秒) : ConfigURL読込

## CLEAR

- 長押し(1.5秒) : データクリア

## 出力ファイル名

ModelのValueを利用

例

ABC100

```text
ABC100-QR-20261007-0845.xlsx
ABC100-20261007-0845.csv