# 戸籍 → 家系図（koseki-kakeizu）

戸籍の情報をフォームに入力すると、きれいな家系図を描き出す **完全ローカル・静的** Web アプリです。
GitHub Pages で配信でき、**戸籍データは一切外部に送信されません**（ブラウザ内と、手元の JSON ファイルにのみ存在します）。

## 特徴

- **プライバシー最優先**: サーバーなし。データはブラウザの localStorage と、インポート/エクスポートする JSON ファイルだけ。
- **編集**: 人物の追加・編集、夫婦（婚姻）と親子関係の設定。
- **出力**:
  - インタラクティブな HTML ビュー（編集しながら確認）
  - **SVG 一枚絵**（清書・保存用。単体で開ける自己完結ファイル）
  - Mermaid テキスト（`mermaid.live` などへ貼り付ける軽量共有用）
- **データ形式**: バージョン付き JSON。`persons` / `unions`（夫婦）/ 任意の `registers`（戸籍そのもの、来歴トレース用）。

## 開発

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # dist/ を生成
```

## デプロイ（GitHub Pages）

`main` に push すると `.github/workflows/deploy.yml` が `dist/` を Pages に公開します。
リポジトリの Settings → Pages → Source を **GitHub Actions** に設定してください。
`vite.config.ts` は `base: './'`（相対パス）なので、リポジトリ名に依存せず動作します。

## データモデル（要点）

- `Person`: 氏・名・性別・生没（ISO と元号原文の両方を保持）・続柄・備考
- `Union`（夫婦）: `partnerIds` と `childIds`。**親子関係の唯一の真実**（子の親は「その子を childIds に持つ夫婦」から導出）。
- `Register`（戸籍）: 本籍・筆頭者・`previousRegisterId`（従前戸籍）。世代をまたぐ来歴の連鎖に使用。

## ロードマップ

- **フェーズ①（実装済み）**: フォーム入力 → 家系図描画 / JSON 入出力 / SVG・Mermaid 出力
- **フェーズ②（予定）**: 戸籍画像の読み取り補助
  - 現代の印刷戸籍: ローカル Vision LLM（例: Ollama + Qwen2.5-VL）または完全ブラウザ内推論での構造化抽出
  - 古い手書き戸籍: 人手転記＋補助（自動化は限定的）
  - ⚠️ 注意: `https` の GitHub Pages から `http://localhost` の Ollama を叩くのは Mixed Content / Private Network Access でブロックされ得る。ブラウザ内推論（WebGPU）か、その時だけローカル配信版を使う方針で検証予定。
