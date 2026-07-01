# Story Map 設計方針

Cicada Studio は、ページ検索キーワードを設定して静的ページをつなぐだけのツールではありません。

ARG 制作では、プレイヤーが何を見つけ、何を解釈し、どの行動によって次の局面に進むかを設計する必要があります。

その中心に置くべきものは、単一サイト内のページ同士を線でつなぐページ遷移図ではなく、物語上の発見、手がかり、媒体、行動、状態変化を扱う **Story Map** です。

## YACHO 的な前提を狭める

YACHO の getting-started documentation では、ARG におけるページ発見を検索キーワード中心に説明しています。

その説明で使われている「ARGでは」という主語は、Cicada Studio の設計方針としては大きすぎます。

Cicada Studio では、この前提を **単一Web探索型ARGでは** に限定して扱います。

検索キーワードで次のページを出す仕組みは、一つの形式にすぎません。

ARG 全体をその形式へ閉じ込めません。

## Project と Site を分ける

Cicada Studio では、**Project** を作品全体として扱います。

**Site** は、Project の中にある公開面の一つです。

**Page** は、特定の Site に属するページです。

一つの Project が一つの Site だけを持つ場合もあります。

しかし ARG では、一つの作品の中に公式サイト、アーカイブサイト、ブログ、偽企業サイト、個人サイト、謎の資料サイトが並ぶことがあります。

そのため、設計上は `Project = Site` とみなしません。

基本構造は次のようにします。

```text
Project
  Sites
    Pages
  Story Map
  Shared Assets
  Shared State
  Exports
```

Story Map は、Site の内側だけを見る画面ではありません。

Project 全体をまたいで、どの Site のどの Page、どの外部媒体、どのメッセージ、どの手がかりが次の発見につながるかを扱います。

## 複数サイトを前提にした探索

複数サイト対応では、「別ページへ進む」と「別サイトへ進む」を同じものとして扱えません。

同じ Project 内の別 Site へ移動することもあれば、Project 外の本当の外部媒体へ出ることもあります。

Story Map では、次の区別を持たせます。

- **Internal Site**：同じ Project に属する別 Site。
- **Internal Page**：同じ Project に属する Site 内の Page。
- **External Surface**：Project の外にある検索エンジン、SNS、動画、地図、掲示板、現実の Web ページなど。

たとえば、公式サイトの画像からアーカイブサイトの URL を推測し、アーカイブサイトの文書からブログ検索語を得て、ブログの画像に写った ID で偽企業サイトの unlock に進む構成を扱える必要があります。

単一Web探索型ARGでは、Project に Site が一つしかなくてもこの構造を使えます。

その場合、Internal Site の移動がほぼ発生しないだけで、Discovery、Action、Gate、State Change の考え方は同じです。

## 許容する探索

Cicada Studio は、プレイヤーが次の局面へ進む方法を一種類に固定しません。

次のような探索を同じ設計対象として扱います。

- ページ内検索で語句を入力する。
- Google などの検索エンジンで情報を探す。
- SNS 検索でアカウント、投稿、ハッシュタグ、画像を探す。
- URL を直接入力する。
- 同じ Project 内の別 Site へ移動する。
- ブログ記事の画像に写り込んだ情報から次のページを推測する。
- 公開サイト外の資料、動画、音声、画像、PDF、地図、掲示板を手がかりにする。
- 偽メッセンジャー、メール、端末風 UI、文書 UI から次の行動を発見する。
- 暗号、合言葉、時刻、位置、順序、別媒体で得た情報を組み合わせる。

この一覧は機能リストではありません。

Cicada Studio が許容すべき設計空間の範囲です。

## Page ではなく Discovery を中心にする

従来のページ遷移図は、ページをノードにしてページ間の遷移を線でつなぎます。

しかし ARG の実際の進行は、ページ遷移だけでは表せません。

プレイヤーはページを読むだけでなく、画像を見る、検索する、外部サービスを調べる、URL を試す、合言葉を入力する、別媒体の情報を持ち込む、といった行動を取ります。

Story Map の中心単位は、ページではなく **Discovery** にします。

**Discovery** とは、プレイヤーが次へ進むために発見または理解するべき情報です。

ページ、画像、投稿、検索結果、URL、メッセージ、暗号文、入力欄、公開タイミングは、Discovery を置くための媒体です。

媒体そのものを物語の中心単位にしません。

Page は、Site から切り離された単独の存在として扱いません。

Story Map 上の Page は、`Site + Page` の組として扱います。

これにより、同じ slug や同じ名前のページが複数 Site に存在しても、物語上の位置を取り違えずに扱えます。

## Story Map のノード

Story Map では、少なくとも次のノード種別を扱えるようにします。

- **Project**：作品全体。
- **Site**：Project 内の公開面。
- **Page**：特定 Site に属するページ。
- **Clue**：プレイヤーが見つける手がかり。
- **Discovery**：プレイヤーが理解するべき発見。
- **Action**：検索、URL 入力、SNS 調査、合言葉入力などの行動。
- **Gate**：reveal、unlock、search、条件分岐などの進行制御。
- **Internal Site Reference**：同じ Project 内の別 Site への参照。
- **External Surface**：Google 検索、SNS、Project 外のブログ、動画、画像、PDF、地図などの外部媒体。
- **Messenger**：偽メッセンジャー、メール、端末風 UI などの会話型媒体。
- **State Change**：フラグ設定、ページ解放、メッセージ配信、エンディング到達などの状態変化。

この分類は、実装時にそのまま UI 名になるとは限りません。

ただし、設計上はページだけを特別扱いしないことを原則にします。

## Edge はページ遷移ではなくプレイヤー行動を表す

Story Map の edge は、単なるリンクやページ遷移ではありません。

edge は、ある状態から次の状態へ進むためのプレイヤー行動または認知を表します。

たとえば、次のような edge を区別します。

- `read`：ページや文書を読む。
- `notice`：画像や文章の違和感に気づく。
- `search_web`：検索エンジンで調べる。
- `search_social`：SNS で調べる。
- `enter_url`：URL を直接入力する。
- `move_site`：同じ Project 内の別 Site へ移動する。
- `solve_cipher`：暗号や変換規則を解く。
- `submit_keyword`：ページ内検索や unlock に語句を入力する。
- `combine_clues`：複数の手がかりを組み合わせる。
- `wait`：時刻や公開タイミングを待つ。
- `receive_message`：メッセンジャーやメールで情報を受け取る。

制作者は、プレイヤーがどの行動を要求されているのかを Story Map 上で確認できる必要があります。

## 検索システムの位置づけ

ページ内検索は重要な機能です。

しかし、それは Story Map の一部です。

検索キーワードを設定する UI は、ページの属性としてだけ扱うのではなく、「どの Discovery をどの Action で到達させるか」に結びつけます。

単一Web探索型ARGでは、ページ内検索とキーワードの組み合わせが進行の主軸になります。

それ以外の ARG では、検索は複数 Site の移動、外部探索、SNS 調査、画像解析、URL 推測、メッセンジャー進行と並ぶ一つの経路です。

## Export と State の単位

Project が複数 Site を持つ場合、export の単位も一つではありません。

Cicada Studio は、次の export を扱える設計にします。

- 一つの Site だけを書き出す。
- Project 内の複数 Site をまとめて書き出す。
- Site ごとの assets、CSS theme、metadata、runtime 設定を分ける。
- Project 共通の assets、StoryState、Story Map metadata を持つ。

StoryState は、Site 単位だけで閉じません。

プレイヤーが Site A で得た発見によって Site B のページが unlock される場合、状態は Project 全体で共有される必要があります。

ただし、公開形式によっては Site 間で storage origin が分かれます。

その場合は、URL パラメータ、合言葉、export manifest、外部ストレージ、hosted 版の API など、状態共有の方法を別途設計します。

静的 export では、すべての Site 間で自動的に状態共有できるとは限りません。

その制約も Story Map 上で見えるようにします。

## 制作者が確認できるべきこと

Story Map は、制作者が次の問いに答えるための画面にします。

- プレイヤーは何を見つける必要があるか。
- その手がかりはどの媒体に置かれているか。
- その手がかりはどの Site、どの Page、どの外部媒体に置かれているか。
- プレイヤーはどの行動で次へ進むか。
- その行動はサイト内で完結するか、外部探索を必要とするか。
- その行動は同じ Site 内の移動か、同じ Project 内の別 Site への移動か、Project 外への移動か。
- 解放されるページ、メッセージ、reveal、unlock、ending は何か。
- 解放対象はどの Site に属するか。
- 外部探索が失敗したとき、救済導線や別経路はあるか。
- 手がかりが偶然見つかっても破綻しないか。
- URL 直打ちやソース確認で先回りされたとき、どこまで許容するか。

Story Map は「自然にページを辿れるか」だけを見る画面ではありません。

プレイヤーの探索行動、Site をまたぐ移動、物語の状態変化を一つの地図として扱う画面です。

## 実装方針

既存のページ接続機能は、Story Map へ発展させます。

最初の段階では、Page を `Site + Page` として扱えるようにし、ページノードと edge に加えて、Clue、Discovery、Action、Gate を追加します。

次の段階で、複数 Site、Internal Site Reference、External Surface、Messenger を追加します。

最終的には、複数 Site、ページ、検索、reveal、unlock、外部探索、偽メッセンジャー、公開タイミング、ending を同じ Story Map 上で扱えるようにします。

## 原則

Cicada Studio は、YACHO 互換の代替品ではありません。

検索キーワードを二つ設定してページを見つける方式を、ARG 制作の中心原理にはしません。

Cicada Studio は、プレイヤーが複数 Site、Web、SNS、画像、URL、会話 UI、暗号、時間、外部資料を横断して発見する遊びを支える制作環境にします。

単一の探索形式に閉じたツールではなく、ARG の設計空間を広く扱えるツールを目指します。

## 参考

- YACHO getting-started documentation: https://sim3.net/yacho/docs/getting-started.html
