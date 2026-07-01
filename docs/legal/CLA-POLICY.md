# Cicada Studio CLA 方針

この文書は、Cicada Studio が外部コントリビューションを受け入れるときの Contributor License Agreement 方針を定めます。

Cicada Studio は、AGPL-3.0-or-later の Community 版を維持しながら、将来の商用版、hosted 版、cloud 版、proprietary 版、closed source 版を作れる状態を保ちます。

そのため、外部からの著作権が発生しうる貢献は、AGPL-3.0-or-later だけを inbound license として受け入れません。

## 方針

外部コントリビューションを merge する前に、貢献者は Cicada Studio Contributor License Agreement に同意する必要があります。

CLA は、貢献者からプロジェクト運営者へ、貢献物を複数の形で利用できる権利を許諾するためのものです。

この許諾には、AGPL 版での利用、別ライセンス版での利用、商用版での利用、hosted 版での利用、cloud 版での利用、proprietary 版での利用、closed source 版での利用を含めます。

貢献者は、自分の貢献物の著作権を失いません。

ただし、貢献者は Cicada Studio の運営者に対して、貢献物を再ライセンス、サブライセンス、改変、配布、商用利用できる広い許諾を与えます。

## 対象となる貢献

CLA の対象には、次のものを含めます。

- ソースコード
- テスト
- ドキュメント
- 翻訳
- UI テキスト
- アイコン
- 画像
- デザインファイル
- テンプレート
- サンプルプロジェクト
- ビルドスクリプト
- 設定ファイル
- その他、著作権が発生しうる実装素材

Issue でのバグ報告、機能要望、短い質問、設計上の議論は、実装素材を含まない限り CLA を必要としません。

ただし、Issue や Discussion に実装コード、長い文案、画像、テンプレート、設計ファイルを含める場合は、CLA の対象として扱います。

## 受け入れない貢献

次の貢献は、そのままでは受け入れません。

- AGPL-3.0-or-later のみで提供され、proprietary 版に使う権利がない貢献
- GPL、AGPL、SSPL、その他の copyleft ライセンス由来で、closed source 版に入れられないコード
- 出典やライセンスが不明なコード、画像、フォント、テンプレート
- third-party の規約上、商用利用や再ライセンスが制限される素材
- 勤務先や発注元の権利を侵害する貢献

ライセンスが不明な貢献は、merge する前に削除、書き直し、または権利確認を行います。

## 運用

自動 CLA チェックを導入するまでは、pull request 上の明示的な同意コメントを同意記録として扱います。

同意コメントの文面は、[CONTRIBUTING.md](../../CONTRIBUTING.md) に記載します。

ただし、勤務先または組織の業務として行われた貢献では、個人の同意だけでは足りない場合があります。

その場合、maintainer は corporate CLA または権限確認を求めます。

maintainer は、CLA 状態が確認できない pull request を merge しません。

## 既存コードの扱い

外部コントリビューションを受け入れる前に、maintainer は既存の commit 履歴と取り込まれた third-party material を確認します。

CLA なしで取り込まれた外部貢献が見つかった場合、その部分は次のいずれかで処理します。

1. 貢献者から CLA への同意を得る。
2. 該当箇所を自前で書き直す。
3. AGPL-only の Community 版だけに残し、商用 closed 版には入れない。
4. 該当箇所を削除する。

