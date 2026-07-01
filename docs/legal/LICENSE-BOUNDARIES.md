# Cicada Studio のライセンス境界

この文書は、Cicada Studio の AGPL 版、ユーザー制作物、public export runtime、将来の商用 closed 版の境界を整理します。

## 基本方針

Cicada Studio の Community 版は AGPL-3.0-or-later で公開します。

ユーザーが Cicada Studio で作成したプロジェクトデータ、物語、ページ本文、CSS、画像、音声、公開サイト内容は、Cicada Studio で作られたという理由だけでは AGPL の対象になりません。

公開 export に含まれる Cicada Studio 由来の runtime と template は、`LICENCE-OUTPUT.md` に定める範囲で MIT として扱います。

将来の commercial 版、hosted 版、cloud 版、Cloudflare Worker 対応版、proprietary 版、closed source 版は、別のライセンスと別の配布条件で提供できる設計を保ちます。

## 区分

| 区分 | ライセンス | 備考 |
| --- | --- | --- |
| Cicada Studio Community 本体 | AGPL-3.0-or-later | このリポジトリの authoring application。 |
| ユーザーのプロジェクトデータと制作物 | ユーザーが選ぶ条件 | AGPL は、Cicada Studio を使ったという理由だけでは制作物に及ばない。 |
| Public export runtime と templates | MIT | `LICENCE-OUTPUT.md` に定める public export 内の runtime と template に限る。 |
| 将来の commercial 版、hosted 版、cloud 版、proprietary 版 | 別途定める proprietary license | 外部貢献を使う場合は CLA または同等の権利許諾が必要。 |
| Third-party dependencies | 各 dependency のライセンス | closed 版に含める場合は個別に互換性を確認する。 |

## Community 版と closed 版の境界

Community 版のコードは AGPL-3.0-or-later として公開します。

Community 版に含まれる外部貢献を closed 版でも使うには、CLA または別の明示的な権利許諾が必要です。

CLA のない外部貢献は、closed 版に取り込まないでください。

商用 closed 版に入れる予定の機能は、最初から次のいずれかで管理します。

1. Maintainer が単独で権利を持つ private repository で開発する。
2. CLA 済みの貢献だけを含む shared package として管理する。
3. Community 版とは API、protocol、file format、plugin interface で分離する。

## Cloudflare Worker 対応

Cloudflare Worker 対応は、静的 assets だけの export よりも AGPL の影響を受けやすい領域です。

AGPL の Community 版を改変して Worker 上でネットワーク越しに提供する場合、対応するソース提供義務が発生します。

closed source の Worker 版を作る場合は、AGPL-only の外部貢献を含めない構成にします。

Worker 固有の backend logic、dynamic route、integration adapter、billing、team management、hosted storage、external service connector は、private 側または CLA 済み shared package 側に置きます。

Community 版との接点は、公開仕様の API、export format、manifest、plugin interface のように、境界が説明できる形にします。

## Public export の境界

Public export は、ユーザー制作物と公開用 runtime/template を含みます。

Public export に含まれる Cicada Studio 由来の runtime/template は、`LICENCE-OUTPUT.md` の MIT 許諾に従って利用できます。

この MIT 許諾は、Cicada Studio 本体、authoring application、private source、closed source 版、Community 版全体を MIT にするものではありません。

## 依存関係の扱い

closed 版にも含める package には、permissive license の dependency を優先します。

GPL、AGPL、SSPL、独自の source-available license、商用利用制限付き license は、closed 版に入れません。

Community 版だけに使う dependency と closed 版にも使う dependency は、package 境界または build 境界で分けます。

## 避けること

次の運用は避けます。

- CLA なしの外部 PR を merge してから closed 版に流用する。
- 出典不明のコードや assets を取り込む。
- Community 版と closed 版の差分を、後から権利関係だけで切り分けようとする。
- AGPL-only の外部貢献を proprietary package にコピーする。
- Cloudflare Worker 用の private logic を AGPL-only code と密結合する。

## 判断に迷う場合

権利関係が不明なコードは merge しません。

必要な場合は、自前で書き直す、CLA 同意を得る、別 package に分離する、または機能ごと closed 版側で実装します。

この文書、CLA 本文、`LICENCE-OUTPUT.md` の整合性を保ったまま運用します。
