# LINEライクな偽メッセンジャー連携の構想

このメモは、Cicada Studio に LINE ライクな偽メッセンジャー機能を追加し、静的な ARG ページと連携させるための構想を整理したものです。

## 目的

ARG 制作者は、物語の一部として偽チャットや偽メッセンジャー画面を使うことがあります。
Cicada Studio では、サイト内で動く LINE ライクなメッセンジャー体験を作成し、既存の静的ページ、reveal、unlock、search、条件システムと進行を連携できるようにします。

ただし、この機能は本物の LINE クローンとして作るべきではありません。
一般的なモバイルメッセンジャーに着想を得た汎用のチャット UI とし、特定ブランドや商標に依存しない形にします。

## 基本アーキテクチャ

ページとメッセンジャースレッドを直接つなげる設計にはしません。
両者のあいだに、共有の進行管理レイヤーを置きます。

```text
Static page
  -> event
Story state engine
  -> effect
Messenger

Messenger
  -> event
Story state engine
  -> effect
Static page
```

この構成にすると、ページ側のロジック、メッセンジャー側のロジック、進行ルールを分離できます。
将来的にメール、偽 SNS、ターミナル、文書のような別の表現を追加する場合も、同じイベントとエフェクトのモデルを使えます。

## 静的サイトとしての制約

Cicada Studio から公開用に書き出されるサイトは静的サイトです。
export 後のサイトは、サーバー上で新しい HTML ファイルを本当に生成することはできません。

そのため、「ページが追加される」という表現は、次のどちらかとして扱います。

1. ページ自体は最初から export に含めておき、条件を満たすまでナビゲーションから隠す。
2. ページ内容を暗号化しておき、プレイヤーが必要な状態に到達したあとで reveal または unlock できるようにする。

ARG の手がかりとして重要な情報には、単純な非表示ではなく暗号化を使います。
単純な非表示だけでは、URL、ソース、書き出されたアセットを調べることで見つかる可能性があります。

## StoryState

ブラウザストレージに保存する共有の **StoryState** オブジェクトを追加します。

構造の例は次のとおりです。

```ts
interface StoryState {
  flags: Record<string, boolean>;
  unlockedPages: string[];
  messenger: {
    threads: Record<
      string,
      {
        currentNodeId: string;
        unreadCount: number;
        deliveredNodeIds: string[];
      }
    >;
  };
}
```

フラグの例は次のとおりです。

```ts
{
  "page.opening.visited": true,
  "messenger.mika.thread_1_done": true,
  "unlock.safe_page.solved": true
}
```

## イベントとエフェクト

ページとメッセンジャーノードはイベントを発火します。
ルールはそれらのイベントを受け取り、エフェクトを発生させます。

例は次のとおりです。

```text
event:
  pageVisited(opening)

effect:
  scheduleMessengerMessage(thread=mika, node=msg_03)
```

別の例は次のとおりです。

```text
event:
  messengerNodeReached(thread=mika, node=msg_08)

effect:
  unlockPage(secret_page)
```

使いやすいイベントの例は次のとおりです。

- `pageVisited(pageId)`
- `revealSolved(pageId, revealId)`
- `unlockSolved(pageId, unlockId)`
- `searchSolved(ruleId)`
- `conditionReached(conditionId)`
- `messengerThreadOpened(threadId)`
- `messengerNodeDelivered(threadId, nodeId)`
- `messengerNodeReached(threadId, nodeId)`
- `messengerChoiceSelected(threadId, nodeId, choiceId)`
- `messengerInputMatched(threadId, nodeId, matchId)`

使いやすいエフェクトの例は次のとおりです。

- `setFlag(flagId)`
- `unlockPage(pageId)`
- `unlockReveal(pageId, revealId)`
- `deliverMessengerNode(threadId, nodeId)`
- `scheduleMessengerNode(threadId, nodeId, delayMs)`
- `setMessengerUnread(threadId, count)`
- `jumpMessengerNode(threadId, nodeId)`

## メッセンジャーのデータモデル

最初は、ノードベースのスレッドモデルから始めます。

```ts
interface MessengerThread {
  id: string;
  title: string;
  participants: MessengerParticipant[];
  nodes: MessengerNode[];
}

interface MessengerNode {
  id: string;
  senderId: string;
  kind: "text" | "image" | "choice" | "input" | "delay" | "system";
  body?: string;
  assetId?: string;
  choices?: MessengerChoice[];
  matchers?: MessengerInputMatcher[];
  conditions?: StoryCondition[];
  effects?: StoryEffect[];
}
```

初期機能は次の範囲にします。

- メッセージバブルを表示する。
- 未読バッジを表示する。
- ページ進行に応じてメッセージを配信する。
- プレイヤーに選択肢を選ばせる。
- プレイヤーにキーワードを入力させる。
- 選択肢や入力内容に応じて分岐する。
- 特定のメッセンジャーノードに到達したとき、静的ページを unlock する。
- 静的ページ、reveal、unlock、search が解決されたとき、メッセンジャーメッセージを配信する。

## Studio の編集 UI

新しい `Messenger` タブを追加します。

画面構成は次の形を基本にします。

```text
Left: thread list
Center: phone-like messenger preview
Right: selected message, condition, and effect editor
```

編集画面では、制作者がルールを自然な言葉で指定できるようにします。

```text
When:
  Opening Page is visited

Then:
  After 3 seconds, send "Did you find it?"
```

最初から生のイベント名を見せるより、この形のほうが扱いやすくなります。
内部では、イベントとエフェクトのモデルをそのまま使えます。

## ストーリーマップとの連携

最初からすべてのメッセンジャー編集をストーリーマップに押し込む設計にはしません。
初回実装の複雑さが大きくなりすぎるためです。

実装順序は次の形を推奨します。

1. まず、メッセンジャー専用の編集画面を作る。
2. その後、ストーリーマップに次のノード種別を追加する。

```text
Page Node
Messenger Node
Reveal Node
Unlock Node
Search Node
Condition Node
```

最終的には、ストーリーマップをページ進行とメッセンジャー進行の全体像を見渡す画面にできます。

## 実行時の挙動

静的サイトだけでは、プレイヤーがサイトを閉じているあいだに本物の通知を安定して送ることはできません。

最初は、サイト内メッセンジャーとして実装します。

- サイトを開いている場合は、遅延後にメッセージが届く。
- サイトを閉じた場合は、次に開いたときに予約済みメッセージを配信済みとして表示できる。
- ブラウザ通知や Web Push 対応は、初回実装ではなく後から追加する任意機能にする。

## セキュリティとネタバレ対策

演出用の重要度が低いメッセージであれば、平文の export データでも許容できます。

手がかりとして重要なメッセージやページでは、次の方針を取ります。

- 答えや秘密の内容を平文で保存しない。
- 可能な範囲で、既存の reveal、unlock、search の暗号化方式を再利用する。
- StoryState でアクセスを制御しつつ、秘密の保護を UI の非表示だけに依存しない。

## 推奨する実装順序

1. メッセンジャーのスキーマ型とデフォルトのプロジェクトデータを追加する。
2. スレッド一覧、バブル、未読数、スマートフォン風プレビューを持つ静的メッセンジャーランタイム UI を追加する。
3. `StoryState`、イベント、エフェクトを追加する。
4. 既存ランタイムから page、reveal、unlock、search のイベントを発火する。
5. ページを unlock するメッセンジャー側エフェクトを実装する。
6. メッセンジャーノードを配信するページ側エフェクトを実装する。
7. 新しい `Messenger` タブに制作用 UI を追加する。
8. 手がかりとして重要なメッセンジャー内容に暗号化対応を追加する。
9. ストーリーマップ上でメッセンジャー進行を見られるようにする。

## 最小の初回実装

最初に作る価値がある最小版は、次の範囲です。

- Studio 内にメッセンジャータブを一つ追加する。
- 一つ以上のスレッドを扱えるようにする。
- メッセージはテキストだけにする。
- ページ訪問または reveal 解決を起点にした手動の配信ルールを扱う。
- ページの unlock またはフラグ設定を行うエフェクトを扱う。
- 公開ランタイムは story state を localStorage または IndexedDB に保存する。
- export には、静的サイトの一部としてメッセンジャー UI を含める。

この範囲であれば、サービスワーカー、プッシュ通知、大きなビジュアルプログラミング環境を早い段階で入れずに、ARG らしい連携を作れます。
