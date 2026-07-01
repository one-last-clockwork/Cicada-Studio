# Project Backup と Source Format

Cicada Studio のバックアップは、復元できることだけを目的にしません。

共同制作、Git 管理、レビュー、差分確認にも使える必要があります。

そのため、プロジェクトのバックアップには複数の形式を用意します。

## 目的

現状の Project Backup Zip は、ブラウザ内の IndexedDB データを失ったときに復元するための形式です。

この形式は緊急退避や受け渡しには向いています。

しかし Git 管理には向きません。

zip の中身が単一の project JSON に寄ると、GitHub 上で変更内容を確認しにくく、ページ本文や CSS の差分も読みづらくなります。

Cicada Studio では、復元用の backup と Git 管理用の source export を同じ「プロジェクトを守る機能」として扱います。

UI では、バックアップを書き出すときに形式を選べるようにします。

## バックアップ形式

最初に扱う形式は次の二つです。

- **Backup Zip**：完全復元を優先する機械向け形式。
- **Source Zip**：Git 管理とレビューを優先する人間向け形式。

どちらもバックアップです。

違いは、保存する目的と差分の読みやすさです。

Backup Zip は、現在の内部データ構造を壊さず保存します。

Source Zip は、ページ本文、テーマ、Story Map、assets、settings を分割し、Git で差分を追いやすい形にします。

## UI 方針

Export 画面では、プロジェクトバックアップの形式を選べるようにします。

たとえば、次のような選択肢を置きます。

```text
Project Backup
  Format:
    - Backup Zip
    - Source Zip for Git

  Export
```

Import 画面では、どちらの形式も読み込めるようにします。

```text
Project Import
  - Import Backup Zip
  - Import Source Zip
```

ファイル選択後に形式を自動判定できる場合は、ボタンを一つにまとめてもよいです。

ただし、初期実装では明示的に分けたほうが失敗時の説明がしやすくなります。

## Backup Zip

Backup Zip は、Cicada Studio の内部状態を完全に復元するための形式です。

この形式では、機械的な互換性と復元の確実さを優先します。

用途は次のとおりです。

- IndexedDB 消失への備え。
- 別ブラウザや別端末への移行。
- 制作途中データの一括退避。
- ユーザーサポート時の再現用データ。

Backup Zip は Git 管理用の主形式にはしません。

## Source Zip

Source Zip は、同じプロジェクトを Git で管理するための形式です。

zip として配布しますが、中身は分割されたテキストファイル群にします。

Git 管理したい場合は、Source Zip を展開して repository に commit します。

構成例は次のとおりです。

```text
cicada.project.json
sites/
  official/
    site.json
    pages/
      opening.html
      secret.html
    themes/
      default.css
  archive/
    site.json
    pages/
      index.html
story/
  story-maps.json
search/
  rules.json
conditions.json
messenger/
  threads/
    mika.json
assets/
  images/
  audio/
notes/
  project-notes.md
```

ページ本文は、差分が読みやすいファイルとして保存します。

HTML を編集しているページは `.html`、Markdown ベースのページを導入した場合は `.md` にします。

CSS theme は `.css` として保存します。

構造化データは、安定したキー順とインデントを持つ JSON として保存します。

## Source Zip の設計原則

Source Zip は、人間がレビューできることを優先します。

そのため、次の原則を置きます。

- 1 ページを 1 ファイルとして扱う。
- CSS theme を独立した `.css` ファイルにする。
- Story Map、conditions、search rules、messenger threads を分割する。
- JSON は安定した並び順で出力する。
- 内部 ID は維持しつつ、人間が読める slug と title を併記する。
- バイナリ assets は `assets/` 以下に置く。
- 自動生成できる public export artifacts は含めない。
- plaintext answers、draft notes、未公開ページを含むため、公開用 zip と混同しない。

Source Zip は public export ではありません。

制作中の秘密情報を含みます。

## Import 方針

Import は、Backup Zip と Source Zip の両方を扱います。

Backup Zip の import は、現在の完全復元機能を維持します。

Source Zip の import は、分割されたファイル群を読み込み、Cicada Studio の内部 Project に再構成します。

Import 時には次の検査を行います。

- manifest の形式と version を確認する。
- path traversal を拒否する。
- 必須ファイルの不足を検出する。
- 重複 slug、重複 page id、重複 site id を検出する。
- assets の参照切れを検出する。
- JSON の schema version を確認する。
- 既存プロジェクトへ上書きするか、新規プロジェクトとして読み込むかを選べるようにする。

最初の実装では、新規プロジェクトとして読み込む動作を優先します。

既存プロジェクトとの merge import は、差分解決が必要になるため後回しにします。

## 複数 Site との関係

Source Zip は、複数 Site を前提にします。

単一 Site の Project でも、`sites/` 配下に一つの Site を置きます。

これにより、単一Web探索型ARGと複数サイト型ARGを同じ形式で扱えます。

Project 全体の Story Map は `story/` に置きます。

Site ごとの Page、theme、metadata は `sites/{siteSlug}/` に置きます。

Project 共通の assets、notes、messenger、conditions、search rules は上位ディレクトリに置きます。

## Public Export との違い

Project backup と public export は別物です。

Project backup には、制作中の情報、未公開ページ、答え、メモ、Story Map、内部 ID、分岐条件が含まれます。

Public export には、プレイヤーに公開する静的 HTML/CSS/assets/runtime と、暗号化された reveal、unlock、search payload だけを含めます。

Source Zip は Git 管理しやすい backup であり、公開用成果物ではありません。

この区別を UI でも明確にします。

## 実装順序

最初の実装では、既存の Backup Zip を維持したまま Source Zip を追加します。

推奨する順序は次のとおりです。

1. Source Zip manifest と directory layout を定義する。
2. 現在の Project を Source Zip として export する。
3. Source Zip を新規 Project として import する。
4. Export 画面で Backup Zip と Source Zip を選択できるようにする。
5. Import 画面で Backup Zip と Source Zip を選択できるようにする。
6. Source Zip の schema version と migration を追加する。
7. 複数 Site 対応後に `sites/` 構造を本格運用する。
8. 将来的に workspace folder を直接開く方式を検討する。

## 最小の初回実装

最小の初回実装では、次の範囲に絞ります。

- Backup Zip export/import は現状維持する。
- Source Zip export を追加する。
- Source Zip import を新規プロジェクト作成として追加する。
- Source Zip は zip のまま扱い、ブラウザから folder を直接開く機能は入れない。
- JSON は整形済みで安定出力する。
- Page HTML と theme CSS を個別ファイルに分ける。

この範囲であれば、Git 管理できる backup を追加しながら、既存の復元用 backup を壊さずに済みます。
